using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace Knome.API.Data;

public static class SystemSettingDbInitializer
{
    public static async Task EnsureSystemSettingsTableExistsAsync(KnomeDbContext db)
    {
        try
        {
            var ddl = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemSettings')
BEGIN
    CREATE TABLE [dbo].[SystemSettings](
        [SettingKey] NVARCHAR(100) NOT NULL,
        [SettingValue] NVARCHAR(MAX) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [UpdatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_SystemSettings_UpdatedDate] DEFAULT (sysutcdatetime()),
        [UpdatedByUserId] INT NULL,
        PRIMARY KEY CLUSTERED ([SettingKey] ASC),
        CONSTRAINT [FK_SystemSettings_User] FOREIGN KEY([UpdatedByUserId]) REFERENCES [dbo].[Users] ([UserId]) ON DELETE SET NULL
    );
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[SystemSettings] WHERE [SettingKey] = 'RequireContentAndCommunityApproval')
BEGIN
    INSERT INTO [dbo].[SystemSettings] ([SettingKey], [SettingValue], [Description], [UpdatedDate])
    VALUES ('RequireContentAndCommunityApproval', 'true', 'Require administrator approval before communities, videos and podcasts are published.', SYSUTCDATETIME());
END
";
            await db.Database.ExecuteSqlRawAsync(ddl);
            Log.Information("SystemSettings database table & configuration defaults verified successfully.");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to verify or create SystemSettings database table.");
        }
    }
}
