using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Audit;
using Knome.API.DTOs.User;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/audit")]
[Authorize(Roles = Roles.SystemAdmin + "," + Roles.HRAdmin)]
public class AuditLogController : KnomeControllerBase
{
    private readonly IAuditLogService _auditLogService;
    private static readonly Regex LogLineRegex = new(
        @"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+[+-]\d{2}:\d{2})\s+\[([A-Z]{3})\]\s+(?:\[(.*?)\])?\s*(.*)$",
        RegexOptions.Compiled);

    public AuditLogController(IAuditLogService auditLogService)
    {
        _auditLogService = auditLogService;
    }

    /// <summary>
    /// Lists database audit-log entries with optional filtering.
    /// </summary>
    [HttpGet("logs")]
    [ProducesResponseType(typeof(ApiResponse<PagedResultDto<AuditLogDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLogs([FromQuery] AuditLogFilterDto filter)
    {
        var result = await _auditLogService.GetPagedAsync(filter);
        return Ok(ApiResponse<PagedResultDto<AuditLogDto>>.SuccessResponse(200, "Audit logs retrieved successfully.", result));
    }

    /// <summary>
    /// Retrieves a single database audit-log entry by id.
    /// </summary>
    [HttpGet("logs/{id:long}")]
    [ProducesResponseType(typeof(ApiResponse<AuditLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLog(long id)
    {
        var log = await _auditLogService.GetByIdAsync(id);
        if (log is null)
            throw new NotFoundException($"Audit log ID {id} not found.");

        return Ok(ApiResponse<AuditLogDto>.SuccessResponse(200, "Audit log retrieved successfully.", log));
    }

    /// <summary>
    /// Creates a new database audit log entry.
    /// </summary>
    [HttpPost("logs")]
    [ProducesResponseType(typeof(ApiResponse<string>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CreateLog([FromBody] CreateAuditEntryDto dto)
    {
        int actorUserId = GetCurrentUserId();
        await _auditLogService.RecordAsync(actorUserId, dto.Action, dto.TargetType ?? "System", dto.TargetId, dto.Reason);
        return Ok(ApiResponse<string>.SuccessResponse(200, "Audit log saved to database successfully.", "Success"));
    }

    private static readonly Regex LogFileNameDateRegex = new(@"knome-(\d{4})(\d{2})(\d{2})", RegexOptions.Compiled);

    /// <summary>
    /// Retrieves live Serilog physical file logs parsed into structured entries, date groups, and graph analytics.
    /// </summary>
    [HttpGet("system-logs")]
    [ProducesResponseType(typeof(ApiResponse<SystemLogResponseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSystemLogs(
        [FromQuery] int lines = 200,
        [FromQuery] string? level = null,
        [FromQuery] string? search = null,
        [FromQuery] string? logFile = null)
    {
        var logsDir = GetLogsDirectory();
        if (!Directory.Exists(logsDir))
        {
            return Ok(ApiResponse<SystemLogResponseDto>.SuccessResponse(200, "Logs directory not found.", new SystemLogResponseDto
            {
                LogFileName = "None",
                TotalScannedLines = 0,
                ReturnedCount = 0
            }));
        }

        // 1. Automatically organize any closed root log files into date-based subdirectories (YYYY-MM-DD)
        OrganizeLogsIntoDateFolders(logsDir);

        // 2. Discover all log files across root and all date-based subdirectories
        var filePaths = Directory.GetFiles(logsDir, "knome-*.log", SearchOption.AllDirectories);
        var fileInfos = filePaths.Select(p => new FileInfo(p))
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .ToList();

        var availableFiles = fileInfos.Select((f, index) =>
        {
            var (dateKey, dateDisplay) = ParseLogFileDate(f.Name, f.LastWriteTime);
            var relPath = Path.GetRelativePath(logsDir, f.FullName).Replace('\\', '/');
            return new SystemLogFileInfo
            {
                FileName = f.Name,
                RelativePath = relPath,
                Date = dateKey,
                DateDisplay = dateDisplay,
                SizeBytes = f.Length,
                LastModified = f.LastWriteTime,
                IsActive = index == 0
            };
        }).ToList();

        // Group files by Date
        var dateGroups = availableFiles
            .GroupBy(f => f.Date)
            .OrderByDescending(g => g.Key)
            .Select(g => new SystemLogDateGroupDto
            {
                Date = g.Key,
                DateDisplay = g.First().DateDisplay,
                FileCount = g.Count(),
                TotalSizeBytes = g.Sum(x => x.SizeBytes),
                HasActiveFile = g.Any(x => x.IsActive),
                Files = g.ToList()
            }).ToList();

        // 3. Resolve target file
        FileInfo? targetFile = null;
        if (!string.IsNullOrWhiteSpace(logFile))
        {
            var cleanFileName = Path.GetFileName(logFile);
            targetFile = fileInfos.FirstOrDefault(f =>
                string.Equals(f.Name, cleanFileName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Path.GetRelativePath(logsDir, f.FullName).Replace('\\', '/'), logFile.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase));
        }

        targetFile ??= fileInfos.FirstOrDefault();

        if (targetFile == null || !targetFile.Exists)
        {
            return Ok(ApiResponse<SystemLogResponseDto>.SuccessResponse(200, "No log files available.", new SystemLogResponseDto
            {
                AvailableFiles = availableFiles,
                DateGroups = dateGroups
            }));
        }

        var (targetDateKey, targetDateDisplay) = ParseLogFileDate(targetFile.Name, targetFile.LastWriteTime);
        var targetRelPath = Path.GetRelativePath(logsDir, targetFile.FullName).Replace('\\', '/');

        // 4. Initialize 24-hour activity buckets for graph analytics
        var hourlyBuckets = new List<SystemLogHourlyBucketDto>();
        for (int h = 0; h < 24; h++)
        {
            hourlyBuckets.Add(new SystemLogHourlyBucketDto
            {
                Hour = h,
                HourLabel = $"{h:D2}:00",
                Total = 0,
                Info = 0,
                Warnings = 0,
                Errors = 0,
                Debug = 0
            });
        }

        var parsedEntries = new List<SystemLogEntryDto>();
        var counts = new SystemLogCountsDto();
        int totalScannedLines = 0;

        // 5. Read log file safely with FileShare.ReadWrite so ongoing Serilog writes don't lock
        using (var fs = new FileStream(targetFile.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        using (var reader = new StreamReader(fs))
        {
            string? rawLine;
            SystemLogEntryDto? currentEntry = null;

            while ((rawLine = await reader.ReadLineAsync()) != null)
            {
                totalScannedLines++;
                var match = LogLineRegex.Match(rawLine);

                if (match.Success)
                {
                    if (currentEntry != null)
                    {
                        parsedEntries.Add(currentEntry);
                        UpdateCounts(counts, currentEntry.Level);
                        RecordHourlyActivity(hourlyBuckets, currentEntry);
                    }

                    currentEntry = new SystemLogEntryDto
                    {
                        Timestamp = match.Groups[1].Value.Trim(),
                        Level = match.Groups[2].Value.Trim().ToUpperInvariant(),
                        SourceContext = match.Groups[3].Success ? match.Groups[3].Value.Trim() : "Knome.API",
                        Message = match.Groups[4].Value.Trim(),
                        Raw = rawLine
                    };
                }
                else if (currentEntry != null && !string.IsNullOrWhiteSpace(rawLine))
                {
                    if (string.IsNullOrEmpty(currentEntry.Exception))
                    {
                        currentEntry.Exception = rawLine;
                    }
                    else
                    {
                        currentEntry.Exception += Environment.NewLine + rawLine;
                    }
                    currentEntry.Raw += Environment.NewLine + rawLine;
                }
            }

            if (currentEntry != null)
            {
                parsedEntries.Add(currentEntry);
                UpdateCounts(counts, currentEntry.Level);
                RecordHourlyActivity(hourlyBuckets, currentEntry);
            }
        }

        // 6. Apply filters
        var filtered = parsedEntries.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(level) && !string.Equals(level, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            var targetLvl = level.Trim().ToUpperInvariant();
            if (targetLvl == "ERR" || targetLvl == "ERROR")
            {
                filtered = filtered.Where(e => e.Level == "ERR" || e.Level == "FTL");
            }
            else if (targetLvl == "WRN" || targetLvl == "WARN" || targetLvl == "WARNING")
            {
                filtered = filtered.Where(e => e.Level == "WRN");
            }
            else if (targetLvl == "INF" || targetLvl == "INFO" || targetLvl == "INFORMATION")
            {
                filtered = filtered.Where(e => e.Level == "INF");
            }
            else if (targetLvl == "DBG" || targetLvl == "DEBUG")
            {
                filtered = filtered.Where(e => e.Level == "DBG");
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var query = search.Trim();
            filtered = filtered.Where(e =>
                (e.Message != null && e.Message.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                (e.SourceContext != null && e.SourceContext.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                (e.Exception != null && e.Exception.Contains(query, StringComparison.OrdinalIgnoreCase)) ||
                (e.Timestamp != null && e.Timestamp.Contains(query, StringComparison.OrdinalIgnoreCase)));
        }

        // Return latest entries first (reversed) up to requested limit
        var resultEntries = filtered.Reverse().Take(Math.Clamp(lines, 10, 2000)).ToList();

        // 7. Calculate Graph Analytics & System Health Metrics
        var total = counts.Total;
        var errorPct = total > 0 ? Math.Round((double)counts.Errors * 100.0 / total, 1) : 0.0;
        var warnPct = total > 0 ? Math.Round((double)counts.Warnings * 100.0 / total, 1) : 0.0;
        var infoPct = total > 0 ? Math.Round((double)counts.Info * 100.0 / total, 1) : 0.0;

        string healthStatus = "Optimal";
        if (errorPct >= 5.0)
            healthStatus = "Degraded";
        else if (errorPct >= 1.5 || warnPct >= 10.0)
            healthStatus = "Warning";

        var peakBucket = hourlyBuckets.OrderByDescending(b => b.Total).FirstOrDefault();

        var daySummaries = dateGroups.Take(12).Select(dg => new SystemLogDaySummaryDto
        {
            Date = dg.Date,
            DateDisplay = dg.DateDisplay.Replace(" (Today)", ""),
            FileCount = dg.FileCount,
            TotalSizeBytes = dg.TotalSizeBytes,
            IsSelected = dg.Date == targetDateKey
        }).ToList();

        var analytics = new SystemLogGraphAnalyticsDto
        {
            HourlyActivity = hourlyBuckets,
            DaySummaries = daySummaries,
            ErrorPercentage = errorPct,
            WarningPercentage = warnPct,
            InfoPercentage = infoPct,
            HealthStatus = healthStatus,
            PeakHour = peakBucket?.Hour ?? 0,
            PeakHourEvents = peakBucket?.Total ?? 0
        };

        var response = new SystemLogResponseDto
        {
            LogFileName = targetFile.Name,
            RelativePath = targetRelPath,
            SelectedDate = targetDateKey,
            SelectedDateDisplay = targetDateDisplay,
            TotalScannedLines = totalScannedLines,
            ReturnedCount = resultEntries.Count,
            Counts = counts,
            AvailableFiles = availableFiles,
            DateGroups = dateGroups,
            Analytics = analytics,
            Entries = resultEntries
        };

        return Ok(ApiResponse<SystemLogResponseDto>.SuccessResponse(200, "System logs retrieved successfully.", response));
    }

    /// <summary>
    /// Lists all available Serilog log files on disk, organized across date directories.
    /// </summary>
    [HttpGet("system-logs/files")]
    [ProducesResponseType(typeof(ApiResponse<List<SystemLogFileInfo>>), StatusCodes.Status200OK)]
    public IActionResult GetSystemLogFiles()
    {
        var logsDir = GetLogsDirectory();
        if (!Directory.Exists(logsDir))
        {
            return Ok(ApiResponse<List<SystemLogFileInfo>>.SuccessResponse(200, "Logs directory not found.", new List<SystemLogFileInfo>()));
        }

        OrganizeLogsIntoDateFolders(logsDir);

        var filePaths = Directory.GetFiles(logsDir, "knome-*.log", SearchOption.AllDirectories);
        var files = filePaths.Select(p => new FileInfo(p))
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .Select((f, index) =>
            {
                var (dateKey, dateDisplay) = ParseLogFileDate(f.Name, f.LastWriteTime);
                var relPath = Path.GetRelativePath(logsDir, f.FullName).Replace('\\', '/');
                return new SystemLogFileInfo
                {
                    FileName = f.Name,
                    RelativePath = relPath,
                    Date = dateKey,
                    DateDisplay = dateDisplay,
                    SizeBytes = f.Length,
                    LastModified = f.LastWriteTime,
                    IsActive = index == 0
                };
            }).ToList();

        return Ok(ApiResponse<List<SystemLogFileInfo>>.SuccessResponse(200, "System log files retrieved successfully.", files));
    }

    /// <summary>
    /// Downloads a raw Serilog log file, searching across root and date directories.
    /// </summary>
    [HttpGet("system-logs/download")]
    [AllowAnonymous]
    public IActionResult DownloadSystemLog([FromQuery] string? logFile = null)
    {
        var logsDir = GetLogsDirectory();
        if (!Directory.Exists(logsDir))
            throw new NotFoundException("Logs directory does not exist.");

        var cleanFileName = Path.GetFileName(logFile ?? "");
        string? targetPath = null;

        if (string.IsNullOrWhiteSpace(cleanFileName))
        {
            targetPath = Directory.GetFiles(logsDir, "knome-*.log", SearchOption.AllDirectories)
                .OrderByDescending(f => new FileInfo(f).LastWriteTimeUtc)
                .FirstOrDefault();
        }
        else
        {
            targetPath = Directory.GetFiles(logsDir, cleanFileName, SearchOption.AllDirectories).FirstOrDefault();
        }

        if (targetPath == null || !System.IO.File.Exists(targetPath))
        {
            var archiveDir = @"\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links backup\logs backup";
            if (Directory.Exists(archiveDir) && !string.IsNullOrWhiteSpace(cleanFileName))
            {
                targetPath = Directory.GetFiles(archiveDir, cleanFileName, SearchOption.AllDirectories).FirstOrDefault();
            }
        }

        if (targetPath == null || !System.IO.File.Exists(targetPath))
            throw new NotFoundException($"Log file '{cleanFileName}' not found.");

        var fs = new FileStream(targetPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        return File(fs, "text/plain", Path.GetFileName(targetPath));
    }

    private static void RecordHourlyActivity(List<SystemLogHourlyBucketDto> hourlyBuckets, SystemLogEntryDto entry)
    {
        if (entry.Timestamp.Length >= 13)
        {
            var hourSub = entry.Timestamp.Substring(11, 2);
            if (int.TryParse(hourSub, out var parsedHour) && parsedHour >= 0 && parsedHour < 24)
            {
                var bucket = hourlyBuckets[parsedHour];
                bucket.Total++;
                switch (entry.Level)
                {
                    case "ERR":
                    case "FTL":
                        bucket.Errors++;
                        break;
                    case "WRN":
                        bucket.Warnings++;
                        break;
                    case "INF":
                        bucket.Info++;
                        break;
                    case "DBG":
                        bucket.Debug++;
                        break;
                }
            }
        }
    }

    private static (string dateKey, string dateDisplay) ParseLogFileDate(string fileName, DateTime lastWriteTime)
    {
        var match = LogFileNameDateRegex.Match(fileName);
        if (match.Success)
        {
            var y = match.Groups[1].Value;
            var m = match.Groups[2].Value;
            var d = match.Groups[3].Value;
            var dateKey = $"{y}-{m}-{d}";
            if (DateTime.TryParse($"{y}-{m}-{d}", out var dt))
            {
                var isToday = dt.Date == DateTime.Today;
                var display = isToday ? $"{dt:dd MMM yyyy} (Today)" : dt.ToString("dd MMM yyyy");
                return (dateKey, display);
            }
            return (dateKey, dateKey);
        }

        var fallbackKey = lastWriteTime.ToString("yyyy-MM-dd");
        var fallbackDisplay = lastWriteTime.Date == DateTime.Today
            ? $"{lastWriteTime:dd MMM yyyy} (Today)"
            : lastWriteTime.ToString("dd MMM yyyy");
        return (fallbackKey, fallbackDisplay);
    }

    private static void OrganizeLogsIntoDateFolders(string logsDir)
    {
        try
        {
            // Only inspect files directly in the root of logsDir
            var rootFiles = Directory.GetFiles(logsDir, "knome-*.log", SearchOption.TopDirectoryOnly);
            foreach (var filePath in rootFiles)
            {
                var fileName = Path.GetFileName(filePath);
                var match = LogFileNameDateRegex.Match(fileName);
                if (!match.Success) continue;

                var y = match.Groups[1].Value;
                var m = match.Groups[2].Value;
                var d = match.Groups[3].Value;
                var dateFolder = $"{y}-{m}-{d}";
                var targetFolder = Path.Combine(logsDir, dateFolder);

                // Test if file is unlocked and safe to move (active Serilog file is locked)
                try
                {
                    using (var stream = new FileStream(filePath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                    {
                        // Lock acquired: safe to move
                    }

                    if (!Directory.Exists(targetFolder))
                    {
                        Directory.CreateDirectory(targetFolder);
                    }

                    var targetPath = Path.Combine(targetFolder, fileName);
                    System.IO.File.Move(filePath, targetPath, overwrite: true);
                }
                catch (IOException)
                {
                    // File is actively in use by Serilog writer sink. Keep it at root.
                }
            }
        }
        catch
        {
            // Best-effort non-blocking organization
        }
    }

    private static void UpdateCounts(SystemLogCountsDto counts, string level)
    {
        counts.Total++;
        switch (level)
        {
            case "ERR":
            case "FTL":
                counts.Errors++;
                break;
            case "WRN":
                counts.Warnings++;
                break;
            case "INF":
                counts.Info++;
                break;
            case "DBG":
                counts.Debug++;
                break;
        }
    }

    private static string GetLogsDirectory()
    {
        var networkLogs = @"\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links\knome\logs";
        if (Directory.Exists(networkLogs)) return networkLogs;

        var currentDirLogs = Path.Combine(Directory.GetCurrentDirectory(), "logs");
        if (Directory.Exists(currentDirLogs)) return currentDirLogs;

        var baseDirLogs = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        if (Directory.Exists(baseDirLogs)) return baseDirLogs;

        return currentDirLogs;
    }
}

public class CreateAuditEntryDto
{
    public string Action { get; set; } = null!;
    public string? TargetType { get; set; }
    public long TargetId { get; set; }
    public string? Reason { get; set; }
}
