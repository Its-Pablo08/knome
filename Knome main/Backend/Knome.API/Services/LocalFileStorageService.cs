using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Knome.API.Services;

public class LocalFileStorageService : IFileStorageService
{
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LocalFileStorageService> _logger;
    private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
    private const long MaxFileSize = 10 * 1024 * 1024; // 10 MB limit per FR-UP-06

    public LocalFileStorageService(
        IWebHostEnvironment env,
        IConfiguration configuration,
        ILogger<LocalFileStorageService> logger)
    {
        _env = env;
        _configuration = configuration;
        _logger = logger;
    }

    private string GetStorageBasePath()
    {
        var configuredPath = _configuration["StorageSettings:BasePath"];
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            try
            {
                if (!Directory.Exists(configuredPath))
                    Directory.CreateDirectory(configuredPath);
                return configuredPath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Configured StorageSettings:BasePath {BasePath} is not accessible. Falling back to wwwroot.", configuredPath);
            }
        }

        var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        if (!Directory.Exists(webRoot)) Directory.CreateDirectory(webRoot);
        return webRoot;
    }

    public async Task<string> SaveProfileImageAsync(int userId, IFormFile file)
    {
        if (file == null || file.Length == 0)
            throw new BadRequestException("No file uploaded or file is empty.");

        if (file.Length > MaxFileSize)
            throw new BadRequestException("Profile image size exceeds the maximum limit of 10 MB.");

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
            throw new BadRequestException($"Invalid file extension. Allowed extensions are: {string.Join(", ", AllowedExtensions)}");

        await ValidateMagicBytesAsync(file, extension);

        var uploadFolder = Path.Combine(GetStorageBasePath(), "uploads", "profiles");

        if (!Directory.Exists(uploadFolder))
            Directory.CreateDirectory(uploadFolder);

        var fileName = $"user_{userId}_{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadFolder, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/uploads/profiles/{fileName}";
    }

    private static async Task ValidateMagicBytesAsync(IFormFile file, string extension)
    {
        using var stream = file.OpenReadStream();
        var buffer = new byte[12];
        var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length);
        if (bytesRead < 4)
            throw new BadRequestException("Invalid file header or file is too small.");

        bool isValid = extension switch
        {
            ".jpg" or ".jpeg" => bytesRead >= 3 && buffer[0] == 0xFF && buffer[1] == 0xD8 && buffer[2] == 0xFF,
            ".png" => bytesRead >= 8 && buffer[0] == 0x89 && buffer[1] == 0x50 && buffer[2] == 0x4E && buffer[3] == 0x47
                                     && buffer[4] == 0x0D && buffer[5] == 0x0A && buffer[6] == 0x1A && buffer[7] == 0x0A,
            ".gif" => bytesRead >= 6 && buffer[0] == 0x47 && buffer[1] == 0x49 && buffer[2] == 0x46 && buffer[3] == 0x38
                                     && (buffer[4] == 0x37 || buffer[4] == 0x39) && buffer[5] == 0x61,
            ".webp" => bytesRead >= 12 && buffer[0] == 0x52 && buffer[1] == 0x49 && buffer[2] == 0x46 && buffer[3] == 0x46
                                      && buffer[8] == 0x57 && buffer[9] == 0x45 && buffer[10] == 0x42 && buffer[11] == 0x50,
            _ => false
        };

        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        if (!isValid)
            throw new BadRequestException("File content does not match the specified image format (magic byte verification failed).");
    }

    public async Task<string> SaveMediaAsync(IFormFile file, string mediaType)
    {
        if (file == null || file.Length == 0)
            throw new BadRequestException("No file uploaded or file is empty.");

        long maxMediaSize = 500 * 1024 * 1024; // 500 MB limit for general media (videos can be up to 500MB)
        if (file.Length > maxMediaSize)
            throw new BadRequestException("Media size exceeds the maximum limit of 500 MB.");

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = file.ContentType?.ToLowerInvariant() switch
            {
                "audio/webm" => ".webm",
                "audio/mpeg" or "audio/mp3" => ".mp3",
                "audio/wav" or "audio/x-wav" => ".wav",
                "audio/aac" => ".aac",
                "audio/ogg" => ".ogg",
                "audio/m4a" or "audio/x-m4a" => ".m4a",
                "audio/flac" => ".flac",
                "video/mp4" => ".mp4",
                "video/webm" => ".webm",
                "image/jpeg" => ".jpg",
                "image/png" => ".png",
                "image/webp" => ".webp",
                "image/gif" => ".gif",
                _ => (mediaType?.ToLowerInvariant() == "audio" || mediaType?.ToLowerInvariant() == "podcast") ? ".webm" : ""
            };
        }

        string[] allowedMediaExtensions = mediaType?.ToLowerInvariant() switch
        {
            "image" => new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff" },
            "video" => new[] { ".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v", ".flv", ".wmv" },
            "audio" or "podcast" => new[] { ".mp3", ".wav", ".aac", ".ogg", ".m4a", ".webm", ".flac", ".wma" },
            "doc" or "document" => new[] { ".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".zip", ".rar", ".7z", ".tar", ".gz", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".mp4", ".webm", ".mov", ".avi", ".mkv", ".mp3", ".wav", ".aac", ".json", ".xml", ".sql", ".cs", ".js", ".py" },
            _ => new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff", ".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v", ".flv", ".wmv", ".mp3", ".wav", ".aac", ".ogg", ".m4a", ".webm", ".flac", ".wma", ".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".zip", ".rar", ".7z", ".tar", ".gz", ".json", ".xml", ".sql", ".cs", ".js", ".py" }
        };

        if (!allowedMediaExtensions.Contains(extension))
            throw new BadRequestException($"Invalid file extension for media type '{mediaType}'. Allowed: {string.Join(", ", allowedMediaExtensions)}");

        var uploadFolder = Path.Combine(GetStorageBasePath(), "uploads", "media");

        if (!Directory.Exists(uploadFolder))
            Directory.CreateDirectory(uploadFolder);

        var fileName = $"media_{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(uploadFolder, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/uploads/media/{fileName}";
    }

    public Task DeleteProfileImageAsync(string fileUrl)
    {
        if (string.IsNullOrWhiteSpace(fileUrl))
            return Task.CompletedTask;

        try
        {
            var relativePath = fileUrl.TrimStart('/');
            var customBase = GetStorageBasePath();
            var filePath = Path.Combine(customBase, relativePath);

            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
            else
            {
                // Fallback to wwwroot
                var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                var fallbackPath = Path.Combine(webRoot, relativePath);
                if (File.Exists(fallbackPath))
                {
                    File.Delete(fallbackPath);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete profile image at {FileUrl}", fileUrl);
        }

        return Task.CompletedTask;
    }
}
