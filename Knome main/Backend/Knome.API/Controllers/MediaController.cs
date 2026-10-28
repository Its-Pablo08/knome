using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Knome.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    private readonly KnomeDbContext? _db;
    private static readonly object _fileLock = new();

    public MediaController(
        IFileStorageService fileStorageService,
        IConfiguration configuration,
        ILogger<MediaController> logger,
        ISystemSettingService? settingService = null,
        KnomeDbContext? db = null)
    {
        _fileStorageService = fileStorageService;
        _configuration = configuration;
        _logger = logger;
        _settingService = settingService;
        _db = db;
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

        if (_settingService != null)
        {
            var t = dto.Type?.ToLower() ?? "";
            if (t == "video")
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableVideosKey, "Videos");
            else if (t == "clip")
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableClipsKey, "Clips");
            else if (t == "podcast" || t == "audio")
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnablePodcastsKey, "Podcasts");
        }

        var url = await _fileStorageService.SaveMediaAsync(dto.File, dto.Type);
        
        return Ok(ApiResponse<object>.SuccessResponse(200, "File uploaded successfully.", new { url }));
    }

    [HttpGet("video-info")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideoInfo([FromQuery] string url)
    {
        if (_settingService != null)
        {
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableVideosKey, "Videos");
        }

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

            // Vimeo Match
            var vimeoMatch = System.Text.RegularExpressions.Regex.Match(url, @"(?:vimeo\.com\/)(?:video\/)?(\d+)");
            if (vimeoMatch.Success)
            {
                var vimeoId = vimeoMatch.Groups[1].Value;
                using var client = new System.Net.Http.HttpClient();
                client.Timeout = TimeSpan.FromSeconds(6);
                client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                var oembedJson = await client.GetStringAsync($"https://vimeo.com/api/oembed.json?url=https://vimeo.com/{vimeoId}");
                using var doc = System.Text.Json.JsonDocument.Parse(oembedJson);
                int durationSeconds = 0;
                if (doc.RootElement.TryGetProperty("duration", out var durProp))
                {
                    durationSeconds = durProp.GetInt32();
                }
                string? title = null;
                if (doc.RootElement.TryGetProperty("title", out var titleProp))
                {
                    title = titleProp.GetString();
                }
                string? thumbnailUrl = null;
                if (doc.RootElement.TryGetProperty("thumbnail_url", out var thumbProp))
                {
                    thumbnailUrl = thumbProp.GetString();
                }

                return Ok(ApiResponse<object>.SuccessResponse(200, "Vimeo info retrieved successfully.", new
                {
                    videoId = vimeoId,
                    durationSeconds,
                    title,
                    thumbnailUrl
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
    [ProducesResponseType(typeof(ApiResponse<List<JsonNode>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPendingMedia()
    {
        var filePath = GetPendingFilePath();
        var pendingArray = new JsonArray();
        bool fileDirty = false;

        lock (_fileLock)
        {
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var json = System.IO.File.ReadAllText(filePath);
                    if (JsonNode.Parse(json) is JsonArray arr)
                    {
                        pendingArray = arr;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed reading pending media approvals");
                }
            }
        }

        if (_db != null)
        {
            try
            {
                var dbPendingWikis = await _db.Wikis
                    .AsNoTracking()
                    .Include(w => w.CreatedByUser)
                    .Include(w => w.WikiTags)
                    .Where(w => !w.IsDeleted && w.Status == "PendingApproval")
                    .ToListAsync();

                var dbPendingWikiIds = dbPendingWikis.Select(w => w.WikiId).ToHashSet();

                var dbPendingArticles = await _db.Articles
                    .AsNoTracking()
                    .Include(a => a.AuthorUser)
                    .Include(a => a.ArticleTags)
                    .Where(a => a.Status == "PendingApproval")
                    .ToListAsync();

                var dbPendingArticleIds = dbPendingArticles.Select(a => a.ArticleId).ToHashSet();

                var itemsToKeep = new JsonArray();
                var existingWikiIdsInQueue = new HashSet<long>();
                var existingArticleIdsInQueue = new HashSet<long>();

                foreach (var node in pendingArray)
                {
                    if (node is not JsonObject obj) continue;

                    var mType = (obj["mediaType"]?.ToString() ?? obj["type"]?.ToString() ?? "").ToLowerInvariant();

                    if (mType == "wiki")
                    {
                        long? wId = null;
                        if (long.TryParse(obj["wikiId"]?.ToString(), out var widVal)) wId = widVal;
                        else if (obj["id"] != null)
                        {
                            var idStr = obj["id"]!.ToString().Replace("pending_wiki_", "");
                            if (long.TryParse(idStr, out var idVal)) wId = idVal;
                        }

                        if (wId.HasValue)
                        {
                            // If this wiki is already in the database and is NOT PendingApproval, skip it (it's resolved or deleted)
                            if (!dbPendingWikiIds.Contains(wId.Value))
                            {
                                fileDirty = true;
                                continue;
                            }
                            existingWikiIdsInQueue.Add(wId.Value);
                        }
                    }
                    else if (mType == "article")
                    {
                        long? aId = null;
                        if (long.TryParse(obj["articleId"]?.ToString(), out var aidVal)) aId = aidVal;
                        else if (obj["id"] != null)
                        {
                            var idStr = obj["id"]!.ToString().Replace("pending_article_", "");
                            if (long.TryParse(idStr, out var aidVal2)) aId = aidVal2;
                        }

                        if (aId.HasValue)
                        {
                            if (!dbPendingArticleIds.Contains(aId.Value))
                            {
                                fileDirty = true;
                                continue;
                            }
                            existingArticleIdsInQueue.Add(aId.Value);
                        }
                    }

                    itemsToKeep.Add(node.DeepClone());
                }

                // Inject any database pending wikis missing from the queue
                foreach (var pw in dbPendingWikis)
                {
                    if (!existingWikiIdsInQueue.Contains(pw.WikiId))
                    {
                        var wikiNode = new JsonObject
                        {
                            ["id"] = $"pending_wiki_{pw.WikiId}",
                            ["wikiId"] = pw.WikiId,
                            ["mediaType"] = "Wiki",
                            ["type"] = "Wiki",
                            ["title"] = pw.Title,
                            ["description"] = pw.Description ?? "Wiki documentation submission",
                            ["category"] = "Knowledge Base",
                            ["tags"] = new JsonArray(pw.WikiTags.Select(t => (JsonNode)JsonValue.Create(t.Tag)!).ToArray()),
                            ["thumbnail"] = pw.CoverImageUrl,
                            ["authorName"] = pw.CreatedByUser != null ? pw.CreatedByUser.FullName : "Author",
                            ["authorId"] = pw.CreatedByUserId,
                            ["authorAvatar"] = pw.CreatedByUser?.ProfilePhotoUrl,
                            ["submittedDate"] = pw.UpdatedDate.ToString("o"),
                            ["status"] = "PendingApproval",
                            ["contentHtml"] = pw.ContentHtml,
                            ["dto"] = new JsonObject
                            {
                                ["wikiId"] = pw.WikiId,
                                ["title"] = pw.Title,
                                ["description"] = pw.Description,
                                ["contentHtml"] = pw.ContentHtml,
                                ["status"] = "PendingApproval",
                                ["coverImageUrl"] = pw.CoverImageUrl
                            }
                        };
                        itemsToKeep.Insert(0, wikiNode);
                        fileDirty = true;
                    }
                }

                // Inject any database pending articles missing from the queue
                foreach (var pa in dbPendingArticles)
                {
                    if (!existingArticleIdsInQueue.Contains(pa.ArticleId))
                    {
                        var artNode = new JsonObject
                        {
                            ["id"] = $"pending_article_{pa.ArticleId}",
                            ["articleId"] = pa.ArticleId,
                            ["mediaType"] = "Article",
                            ["type"] = "Article",
                            ["title"] = pa.Title,
                            ["description"] = pa.Description ?? "Article submission",
                            ["category"] = "General",
                            ["tags"] = new JsonArray(pa.ArticleTags.Select(t => (JsonNode)JsonValue.Create(t.Tag)!).ToArray()),
                            ["thumbnail"] = null,
                            ["authorName"] = pa.AuthorUser != null ? pa.AuthorUser.FullName : "Author",
                            ["authorId"] = pa.AuthorUserId,
                            ["authorAvatar"] = pa.AuthorUser?.ProfilePhotoUrl,
                            ["submittedDate"] = pa.CreatedDate.ToString("o"),
                            ["status"] = "PendingApproval",
                            ["contentHtml"] = pa.ContentHtml,
                            ["dto"] = new JsonObject
                            {
                                ["articleId"] = pa.ArticleId,
                                ["title"] = pa.Title,
                                ["description"] = pa.Description,
                                ["contentHtml"] = pa.ContentHtml,
                                ["status"] = "PendingApproval"
                            }
                        };
                        itemsToKeep.Insert(0, artNode);
                        fileDirty = true;
                    }
                }

                pendingArray = itemsToKeep;

                if (fileDirty)
                {
                    lock (_fileLock)
                    {
                        try
                        {
                            var updatedJson = JsonSerializer.Serialize(pendingArray, new JsonSerializerOptions { WriteIndented = true });
                            System.IO.File.WriteAllText(filePath, updatedJson);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed writing synchronized pending media to file");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed synchronizing database pending wikis/articles with media approval queue");
            }
        }

        var resultList = new List<JsonNode>();
        foreach (var item in pendingArray)
        {
            if (item == null) continue;
            resultList.Add(item.DeepClone());
        }

        if (_settingService != null)
        {
            var enableVideos = await _settingService.GetEnableVideosAsync();
            var enablePodcasts = await _settingService.GetEnablePodcastsAsync();
            var enableArticles = await _settingService.GetEnableArticlesAsync();
            var enableWiki = await _settingService.GetEnableWikiAsync();
            resultList = resultList.Where(item => {
                var mediaType = "video";
                if (item is JsonObject obj)
                {
                    mediaType = (obj["mediaType"]?.ToString() ?? obj["type"]?.ToString() ?? "video").ToLowerInvariant();
                }

                if ((mediaType == "podcast" || mediaType == "audio") && !enablePodcasts) return false;
                if (mediaType == "video" && !enableVideos) return false;
                if (mediaType == "article" && !enableArticles) return false;
                if (mediaType == "wiki" && !enableWiki) return false;
                return true;
            }).ToList();
        }

        return Ok(ApiResponse<List<JsonNode>>.SuccessResponse(200, "Pending media retrieved.", resultList));
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

        var itemStatus = "";
        if (item.TryGetProperty("status", out var sProp))
            itemStatus = sProp.GetString() ?? "";

        bool requireApproval = true;
        // If an item explicitly arrives with status PendingApproval (such as an Employee Wiki or Article submission),
        // it must enter the pending approval queue for Moderator approval
        if (itemStatus != "PendingApproval" && _settingService != null)
        {
            if (mediaType == "podcast" || mediaType == "audio")
            {
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnablePodcastsKey, "Podcasts");
                requireApproval = await _settingService.GetRequirePodcastApprovalAsync();
            }
            else if (mediaType == "article")
            {
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableArticlesKey, "Articles");
                requireApproval = await _settingService.GetRequireArticleApprovalAsync();
            }
            else if (mediaType == "wiki")
            {
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableWikiKey, "Wiki");
                requireApproval = await _settingService.GetRequireWikiApprovalAsync();
            }
            else
            {
                await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableVideosKey, "Videos");
                requireApproval = await _settingService.GetRequireVideoApprovalAsync();
            }
        }

        if (!requireApproval && itemStatus != "PendingApproval")
        {
            // When approval is disabled (OFF) for this media type, items must NOT enter the admin approval queue!
            return Ok(ApiResponse<object>.SuccessResponse(200, $"{mediaType.ToUpper()} approval policy is disabled. Media does not enter the approval queue.", item));
        }

        var filePath = GetPendingFilePath();
        List<JsonElement> list = new();

        string? newId = null;
        if (item.TryGetProperty("id", out var idProp))
            newId = idProp.ValueKind == JsonValueKind.String ? idProp.GetString() : idProp.ToString();

        string? newWikiId = null;
        if (item.TryGetProperty("wikiId", out var widProp))
            newWikiId = widProp.ValueKind == JsonValueKind.String ? widProp.GetString() : widProp.ToString();

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

            // Deduplicate: filter out any existing element with identical ID or WikiId
            list = list.Where(existing => {
                string? existingId = null;
                if (existing.TryGetProperty("id", out var eidProp))
                    existingId = eidProp.ValueKind == JsonValueKind.String ? eidProp.GetString() : eidProp.ToString();

                if (!string.IsNullOrEmpty(newId) && string.Equals(existingId, newId, StringComparison.OrdinalIgnoreCase))
                    return false;

                if (!string.IsNullOrEmpty(newWikiId) && existing.TryGetProperty("wikiId", out var ewidProp))
                {
                    var ewidStr = ewidProp.ValueKind == JsonValueKind.String ? ewidProp.GetString() : ewidProp.ToString();
                    if (string.Equals(ewidStr, newWikiId, StringComparison.OrdinalIgnoreCase))
                        return false;
                }
                return true;
            }).ToList();

            list.Insert(0, item);
            var updatedJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            System.IO.File.WriteAllText(filePath, updatedJson);
        }

        return Ok(ApiResponse<object>.SuccessResponse(201, "Media submitted for approval.", item));
    }

    [Authorize(Roles = $"{Roles.Moderator},{Roles.SystemAdmin},{Roles.HRAdmin},MOD,Moderator,SYSADM,System Administrator,System Admin,HRADM,HR Administrator,HR Admin")]
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
                        string? elId = null;
                        if (el.TryGetProperty("id", out var idProp))
                        {
                            elId = idProp.ValueKind == JsonValueKind.String ? idProp.GetString() : idProp.ToString();
                        }

                        string? elWikiId = null;
                        if (el.TryGetProperty("wikiId", out var widProp))
                        {
                            elWikiId = widProp.ValueKind == JsonValueKind.String ? widProp.GetString() : widProp.ToString();
                        }

                        string? elArticleId = null;
                        if (el.TryGetProperty("articleId", out var aidProp))
                        {
                            elArticleId = aidProp.ValueKind == JsonValueKind.String ? aidProp.GetString() : aidProp.ToString();
                        }

                        if (string.Equals(elId, id, StringComparison.OrdinalIgnoreCase) ||
                            (!string.IsNullOrEmpty(elWikiId) && (string.Equals(elWikiId, id, StringComparison.OrdinalIgnoreCase) || string.Equals($"pending_wiki_{elWikiId}", id, StringComparison.OrdinalIgnoreCase))) ||
                            (!string.IsNullOrEmpty(elArticleId) && (string.Equals(elArticleId, id, StringComparison.OrdinalIgnoreCase) || string.Equals($"pending_article_{elArticleId}", id, StringComparison.OrdinalIgnoreCase))))
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
