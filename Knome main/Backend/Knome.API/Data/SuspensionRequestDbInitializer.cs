using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace Knome.API.Data;

public static class SuspensionRequestDbInitializer
{
    public static async Task EnsureSuspensionRequestTablesExistAsync(KnomeDbContext db)
    {
        try
        {
            var ddl = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SuspensionRequests')
BEGIN
    CREATE TABLE [dbo].[SuspensionRequests] (
        [RequestId]           BIGINT IDENTITY(1,1) PRIMARY KEY,
        [TargetUserId]        INT NOT NULL,
        [TargetEmployeeId]    NVARCHAR(50) NOT NULL,
        [TargetFullName]      NVARCHAR(200) NOT NULL,
        [TargetEmail]         NVARCHAR(200) NULL,
        [TargetDesignation]   NVARCHAR(200) NULL,
        [TargetDepartment]    NVARCHAR(200) NULL,
        [TargetAvatar]        NVARCHAR(500) NULL,
        [RequestedByUserId]   INT NOT NULL,
        [RequestedByName]     NVARCHAR(200) NOT NULL,
        [RequestedByRole]     NVARCHAR(100) NOT NULL CONSTRAINT [DF_SuspensionRequests_Role] DEFAULT ('Moderator'),
        [Duration]            NVARCHAR(50) NOT NULL CONSTRAINT [DF_SuspensionRequests_Duration] DEFAULT ('7d'),
        [DurationDays]        INT NULL,
        [CustomDate]          DATETIME2 NULL,
        [IsPermanent]         BIT NOT NULL CONSTRAINT [DF_SuspensionRequests_IsPermanent] DEFAULT (0),
        [Category]            NVARCHAR(200) NULL,
        [Reason]              NVARCHAR(MAX) NULL,
        [FullReason]          NVARCHAR(MAX) NOT NULL,
        [ReportId]            INT NULL,
        [ContentId]           BIGINT NULL,
        [ContentType]         NVARCHAR(50) NULL,
        [Status]              NVARCHAR(50) NOT NULL CONSTRAINT [DF_SuspensionRequests_Status] DEFAULT ('Pending'),
        [CreatedAt]           DATETIME2 NOT NULL CONSTRAINT [DF_SuspensionRequests_CreatedAt] DEFAULT (sysutcdatetime()),
        [ReviewedAt]          DATETIME2 NULL,
        [ReviewedByUserId]    INT NULL,
        [ReviewedByName]      NVARCHAR(200) NULL,
        [ReviewedByRole]      NVARCHAR(100) NULL,
        [RejectionReason]     NVARCHAR(MAX) NULL,
        CONSTRAINT [FK_SuspensionRequests_TargetUser] FOREIGN KEY ([TargetUserId]) REFERENCES [dbo].[Users] ([UserId]),
        CONSTRAINT [FK_SuspensionRequests_RequestedByUser] FOREIGN KEY ([RequestedByUserId]) REFERENCES [dbo].[Users] ([UserId]),
        CONSTRAINT [FK_SuspensionRequests_ReviewedByUser] FOREIGN KEY ([ReviewedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );

    CREATE INDEX [IX_SuspensionRequests_Status] ON [dbo].[SuspensionRequests] ([Status], [CreatedAt] DESC);
    CREATE INDEX [IX_SuspensionRequests_TargetUserId] ON [dbo].[SuspensionRequests] ([TargetUserId]);
    CREATE INDEX [IX_SuspensionRequests_RequestedByUserId] ON [dbo].[SuspensionRequests] ([RequestedByUserId]);
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[SuspensionRequests])
BEGIN
    INSERT INTO [dbo].[SuspensionRequests] (
        [TargetUserId], [TargetEmployeeId], [TargetFullName], [TargetEmail], [TargetDesignation], [TargetDepartment], [TargetAvatar],
        [RequestedByUserId], [RequestedByName], [RequestedByRole], [Duration], [DurationDays], [CustomDate], [IsPermanent],
        [Category], [Reason], [FullReason], [Status], [CreatedAt]
    )
    VALUES (
        1036, 'EMP100', 'Mayur Bansal', 'mayurbansal7089@gmail.com', 'Software Developer', 'Higher Education', NULL,
        1057, 'Deepak Simrodia', 'Moderator', '7d', 7, NULL, 0,
        'Violation of community guidelines', 'Repeated policy violations and inappropriate comments on team technical thread.',
        'Violation of community guidelines: Repeated policy violations and inappropriate comments on team technical thread.',
        'Pending', DATEADD(MINUTE, -25, SYSUTCDATETIME())
    );

    INSERT INTO [dbo].[SuspensionRequests] (
        [TargetUserId], [TargetEmployeeId], [TargetFullName], [TargetEmail], [TargetDesignation], [TargetDepartment], [TargetAvatar],
        [RequestedByUserId], [RequestedByName], [RequestedByRole], [Duration], [DurationDays], [CustomDate], [IsPermanent],
        [Category], [Reason], [FullReason], [Status], [CreatedAt], [ReviewedAt], [ReviewedByUserId], [ReviewedByName], [ReviewedByRole]
    )
    VALUES (
        1036, 'EMP100', 'Mayur Bansal', 'mayurbansal7089@gmail.com', 'Software Developer', 'Higher Education', NULL,
        1057, 'Deepak Simrodia', 'Moderator', '3d', 3, NULL, 0,
        'Harassment or inappropriate behavior', 'Unsolicited spam messages in portal channel.',
        'Harassment or inappropriate behavior: Unsolicited spam messages in portal channel.',
        'Approved', DATEADD(DAY, -4, SYSUTCDATETIME()), DATEADD(DAY, -4, SYSUTCDATETIME()), 5, 'Meghna Tiwari', 'HR Administrator'
    );

    INSERT INTO [dbo].[SuspensionRequests] (
        [TargetUserId], [TargetEmployeeId], [TargetFullName], [TargetEmail], [TargetDesignation], [TargetDepartment], [TargetAvatar],
        [RequestedByUserId], [RequestedByName], [RequestedByRole], [Duration], [DurationDays], [CustomDate], [IsPermanent],
        [Category], [Reason], [FullReason], [Status], [CreatedAt], [ReviewedAt], [ReviewedByUserId], [ReviewedByName], [ReviewedByRole], [RejectionReason]
    )
    VALUES (
        1036, 'EMP100', 'Mayur Bansal', 'mayurbansal7089@gmail.com', 'Software Developer', 'Higher Education', NULL,
        1057, 'Deepak Simrodia', 'Moderator', '1d', 1, NULL, 0,
        'Posting confidential company data', 'Shared draft architecture diagram in private channel.',
        'Posting confidential company data: Shared draft architecture diagram in private channel.',
        'Rejected', DATEADD(DAY, -2, SYSUTCDATETIME()), DATEADD(DAY, -2, SYSUTCDATETIME()), 5, 'Meghna Tiwari', 'HR Administrator',
        'Resolved via direct verbal counseling; no account suspension warranted.'
    );
END
";
            await db.Database.ExecuteSqlRawAsync(ddl);
            Log.Information("SuspensionRequests database table verified successfully.");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to verify or create SuspensionRequests database table.");
        }
    }
}
