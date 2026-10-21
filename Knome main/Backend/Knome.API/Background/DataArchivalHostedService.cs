using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Knome.API.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Knome.API.Background;

/// <summary>
/// Periodically moves historical transactional records (> 3 months) to the Knome_Archive database,
/// and archives Serilog log files older than 30 days to the backup directory.
/// Enforces data retention and keeps operational logs and database fast and lean.
/// </summary>
public class DataArchivalHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DataArchivalHostedService> _logger;
    private readonly IConfiguration _configuration;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    public DataArchivalHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<DataArchivalHostedService> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial warm-up delay after startup before running first archival cycle
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            await RunDatabaseArchivalAsync(stoppingToken);
            ArchiveOldLogFiles();

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task RunDatabaseArchivalAsync(CancellationToken stoppingToken)
    {
        try
        {
            _logger.LogInformation("DataArchival: starting scheduled database archival cycle at {Time}", Knome.API.Common.KnomeTime.Now);

            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<KnomeDbContext>();

            // Execute stored procedure in primary database with extended command timeout for batch processing
            dbContext.Database.SetCommandTimeout(300);
            await dbContext.Database.ExecuteSqlRawAsync("EXEC dbo.sp_ArchiveKnomeData;", stoppingToken);

            _logger.LogInformation("DataArchival: completed scheduled database archival cycle successfully at {Time}", Knome.API.Common.KnomeTime.Now);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DataArchival: error occurred during database archival execution.");
        }
    }

    private void ArchiveOldLogFiles()
    {
        try
        {
            var sourceLogsPath = _configuration["StorageSettings:LogsPath"]
                ?? @"\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links\knome\logs";
            var archiveLogsPath = _configuration["StorageSettings:LogsArchivePath"]
                ?? @"\\172.16.8.11\Services\INTERNSHIP 2.0\Higher_Education\Knowme Summary\quick links backup\logs backup";
            var retentionDays = _configuration.GetValue<int>("StorageSettings:LogsRetentionDays", 30);

            if (!Directory.Exists(sourceLogsPath))
            {
                var localLogs = Path.Combine(Directory.GetCurrentDirectory(), "logs");
                if (Directory.Exists(localLogs))
                {
                    sourceLogsPath = localLogs;
                }
                else
                {
                    return;
                }
            }

            if (!Directory.Exists(archiveLogsPath))
            {
                Directory.CreateDirectory(archiveLogsPath);
            }

            var cutoff = Knome.API.Common.KnomeTime.Now.AddDays(-retentionDays);
            var oldLogFiles = Directory.GetFiles(sourceLogsPath, "knome-*.log", SearchOption.AllDirectories)
                .Select(f => new FileInfo(f))
                .Where(f => f.LastWriteTime < cutoff)
                .ToList();

            if (oldLogFiles.Count == 0)
            {
                _logger.LogInformation("DataArchival: No log files older than {Days} days found for archival.", retentionDays);
                return;
            }

            int movedCount = 0;
            long totalBytes = 0;

            foreach (var file in oldLogFiles)
            {
                try
                {
                    var destFilePath = Path.Combine(archiveLogsPath, file.Name);
                    totalBytes += file.Length;
                    file.MoveTo(destFilePath, overwrite: true);
                    movedCount++;
                }
                catch (Exception fileEx)
                {
                    _logger.LogWarning(fileEx, "DataArchival: failed to move old log file {FileName}", file.Name);
                }
            }

            _logger.LogInformation(
                "DataArchival: moved {MovedCount} log file(s) ({SizeMb} MB) older than {Days} days to {ArchivePath}",
                movedCount,
                Math.Round((double)totalBytes / (1024 * 1024), 2),
                retentionDays,
                archiveLogsPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "DataArchival: error occurred during log files archival.");
        }
    }
}
