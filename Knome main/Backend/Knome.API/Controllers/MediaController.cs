using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Knome.API.Controllers;

public class UploadMediaDto
{
    public IFormFile File { get; set; } = null!;
    public string Type { get; set; } = "doc";
}

[Authorize]
[ApiController]
[Route("api/media")]
public class MediaController : KnomeControllerBase
{
    private readonly IFileStorageService _fileStorageService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MediaController> _logger;
    private readonly ISystemSettingService? _settingService;
    private static readonly object _fileLock = new();

    public MediaController(
        IFileStorageService fileStorageService,
        IConfiguration configuration,
        ILogger<MediaController> logger,
        ISystemSettingService? settingService = null)
    {
        _fileStorageService = fileStorageService;
        _configuration = configuration;
        _logger = logger;
        _settingService = settingService;
    }

    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(500L * 1024L * 1024L)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500L * 1024L * 1024L)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UploadMedia([FromForm] UploadMediaDto dto)
    {
        if (dto.File == null)
            throw new BadRequestException("No file provided.");

        var url = await _fileStorageService.SaveMediaAsync(dto.File, dto.Type);
        
        return Ok(ApiResponse<object>.SuccessResponse(200, "File uploaded successfully.", new { url }));
    }

    [HttpGet("video-info")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideoInfo([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(ApiResponse<object>.FailureResponse(400, "URL is required."));

        try
        {
            var match = System.Text.RegularExpressions.Regex.Match(
                url, 
                @"(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})"
            );

            if (match.Success)
            {
                var videoId = match.Groups[1].Value;
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(6);
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                client.DefaultRequestHeaders.Add("Accept-Language", "en-US,en;q=0.9");

                var html = await client.GetStringAsync($"https://www.youtube.com/watch?v={videoId}");

                int durationSeconds = 0;
                var durMatch = System.Text.RegularExpressions.Regex.Match(html, @"\""approxDurationMs\""\s*:\s*\""(\d+)\""");
                if (durMatch.Success && long.TryParse(durMatch.Groups[1].Value, out var ms))
                {
                    durationSeconds = (int)Math.Round(ms / 1000.0);
                }

                if (durationSeconds <= 0)
                {
                    var secMatch = System.Text.RegularExpressions.Regex.Match(html, @"\""lengthSeconds\""\s*:\s*\""(\d+)\""");
                    if (secMatch.Success && int.TryParse(secMatch.Groups[1].Value, out var sec))
                    {
                        durationSeconds = sec;
                    }
                }

                string? title = null;
                var titleMatch = System.Text.RegularExpressions.Regex.Match(html, @"\""title\""\s*:\s*\""([^\""]+)\""");
                if (titleMatch.Success)
                {
                    title = System.Text.RegularExpressions.Regex.Unescape(titleMatch.Groups[1].Value);
                }

                return Ok(ApiResponse<object>.SuccessResponse(200, "Video info retrieved successfully.", new
                {
                    videoId,
                    durationSeconds,
                    title,
                    thumbnailUrl = $"https://img.youtube.com/vi/{videoId}/hqdefault.jpg"
                }));
            }

            return Ok(ApiResponse<object>.SuccessResponse(200, "Unrecognized platform.", new { durationSeconds = 0 }));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed fetching video info for {Url}", url);
            return Ok(ApiResponse<object>.SuccessResponse(200, "Fallback.", new { durationSeconds = 0 }));
        }
    }

    private string GetPendingFilePath()
    {
        var basePath = _configuration["StorageSettings:BasePath"];
        if (string.IsNullOrWhiteSpace(basePath) || !Directory.Exists(basePath))
        {
            basePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        }
        var dir = Path.Combine(basePath, "uploads");
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        return Path.Combine(dir, "pending_media_approvals.json");
    }

    [HttpGet("pending")]
    [ProducesResponseType(typeof(ApiResponse<List<JsonElement>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPendingMedia()
    {
        var filePath = GetPendingFilePath();
        if (!System.IO.File.Exists(filePath))
        {
            return Ok(ApiResponse<List<JsonElement>>.SuccessResponse(200, "Pending media retrieved.", new List<JsonElement>()));
        }

        try
        {
            var json = await System.IO.File.ReadAllTextAsync(filePath);
            var list = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new List<JsonElement>();
            return Ok(ApiResponse<List<JsonElement>>.SuccessResponse(200, "Pending media retrieved.", list));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed reading pending media approvals");
            return Ok(ApiResponse<List<JsonElement>>.SuccessResponse(200, "Pending media retrieved.", new List<JsonElement>()));
        }
    }

    [HttpPost("pending")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status201Created)]
    public async Task<IActionResult> AddPendingMedia([FromBody] JsonElement item)
    {
        var mediaType = "video";
        if (item.TryGetProperty("mediaType", out var mtProp))
            mediaType = mtProp.GetString()?.ToLower() ?? "video";
        else if (item.TryGetProperty("type", out var tProp))
            mediaType = tProp.GetString()?.ToLower() ?? "video";

        bool requireApproval = true;
        if (_settingService != null)
        {
            if (mediaType == "podcast" || mediaType == "audio")
            {
                requireApproval = await _settingService.GetRequirePodcastApprovalAsync();
            }
            else
            {
                requireApproval = await _settingService.GetRequireVideoApprovalAsync();
            }
        }

        if (!requireApproval)
        {
            // When approval is disabled (OFF) for this media type, items must NOT enter the admin approval queue!
            return Ok(ApiResponse<object>.SuccessResponse(200, $"{mediaType.ToUpper()} approval policy is disabled. Media does not enter the approval queue.", item));
        }

        var filePath = GetPendingFilePath();
        List<JsonElement> list = new();

        lock (_fileLock)
        {
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var json = System.IO.File.ReadAllText(filePath);
                    list = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new List<JsonElement>();
                }
                catch
                {
                    list = new List<JsonElement>();
                }
            }

            list.Insert(0, item);
            var updatedJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            System.IO.File.WriteAllText(filePath, updatedJson);
        }

        return Ok(ApiResponse<object>.SuccessResponse(201, "Media submitted for approval.", item));
    }

    [HttpDelete("pending/{id}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public IActionResult RemovePendingMedia(string id)
    {
        var filePath = GetPendingFilePath();
        lock (_fileLock)
        {
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var json = System.IO.File.ReadAllText(filePath);
                    using var doc = JsonDocument.Parse(json);
                    var filtered = new List<JsonElement>();
                    foreach (var el in doc.RootElement.EnumerateArray())
                    {
                        if (el.TryGetProperty("id", out var idProp) && idProp.GetString() == id)
                            continue;
                        filtered.Add(el.Clone());
                    }

                    var updatedJson = JsonSerializer.Serialize(filtered, new JsonSerializerOptions { WriteIndented = true });
                    System.IO.File.WriteAllText(filePath, updatedJson);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed removing pending media {Id}", id);
                }
            }
        }

        return Ok(ApiResponse.SuccessResponse(200, "Pending media removed successfully."));
    }
}
