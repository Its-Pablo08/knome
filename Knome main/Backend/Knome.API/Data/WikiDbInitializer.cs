using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace Knome.API.Data;

public static class WikiDbInitializer
{
    public static async Task EnsureWikiTablesExistAsync(KnomeDbContext db)
    {
        try
        {
            var ddl = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Wikis')
BEGIN
    CREATE TABLE [dbo].[Wikis](
        [WikiId] BIGINT IDENTITY(1,1) NOT NULL,
        [Title] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [ContentHtml] NVARCHAR(MAX) NOT NULL,
        [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_Wikis_Status] DEFAULT ('Published'),
        [CreatedByUserId] INT NOT NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_Wikis_CreatedDate] DEFAULT (sysutcdatetime()),
        [UpdatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_Wikis_UpdatedDate] DEFAULT (sysutcdatetime()),
        [IsArchived] BIT NOT NULL CONSTRAINT [DF_Wikis_IsArchived] DEFAULT (0),
        [IsDeleted] BIT NOT NULL CONSTRAINT [DF_Wikis_IsDeleted] DEFAULT (0),
        [ViewCount] INT NOT NULL CONSTRAINT [DF_Wikis_ViewCount] DEFAULT (0),
        [CategoryId] INT NULL,
        [CoverImageUrl] NVARCHAR(500) NULL,
        PRIMARY KEY CLUSTERED ([WikiId] ASC),
        CONSTRAINT [FK_Wikis_CreatedByUser] FOREIGN KEY([CreatedByUserId]) REFERENCES [dbo].[Users] ([UserId]),
        CONSTRAINT [FK_Wikis_Category] FOREIGN KEY([CategoryId]) REFERENCES [dbo].[Categories] ([CategoryId])
    );
    CREATE INDEX [IX_Wikis_CreatedDate] ON [dbo].[Wikis]([CreatedDate] DESC);
    CREATE INDEX [IX_Wikis_Status] ON [dbo].[Wikis]([Status]);
    CREATE INDEX [IX_Wikis_CreatedByUserId] ON [dbo].[Wikis]([CreatedByUserId]);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WikiSections')
BEGIN
    CREATE TABLE [dbo].[WikiSections](
        [SectionId] BIGINT IDENTITY(1,1) NOT NULL,
        [WikiId] BIGINT NOT NULL,
        [ParentSectionId] BIGINT NULL,
        [Title] NVARCHAR(200) NOT NULL,
        [ContentHtml] NVARCHAR(MAX) NOT NULL,
        [SortOrder] INT NOT NULL CONSTRAINT [DF_WikiSections_SortOrder] DEFAULT (0),
        [CreatedByUserId] INT NOT NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_WikiSections_CreatedDate] DEFAULT (sysutcdatetime()),
        [UpdatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_WikiSections_UpdatedDate] DEFAULT (sysutcdatetime()),
        [IsDeleted] BIT NOT NULL CONSTRAINT [DF_WikiSections_IsDeleted] DEFAULT (0),
        PRIMARY KEY CLUSTERED ([SectionId] ASC),
        CONSTRAINT [FK_WikiSections_Wiki] FOREIGN KEY([WikiId]) REFERENCES [dbo].[Wikis] ([WikiId]),
        CONSTRAINT [FK_WikiSections_ParentSection] FOREIGN KEY([ParentSectionId]) REFERENCES [dbo].[WikiSections] ([SectionId]),
        CONSTRAINT [FK_WikiSections_CreatedByUser] FOREIGN KEY([CreatedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE INDEX [IX_WikiSections_WikiId] ON [dbo].[WikiSections]([WikiId], [SortOrder]);
    CREATE INDEX [IX_WikiSections_ParentSectionId] ON [dbo].[WikiSections]([ParentSectionId]);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WikiCollaborators')
BEGIN
    CREATE TABLE [dbo].[WikiCollaborators](
        [CollaboratorId] BIGINT IDENTITY(1,1) NOT NULL,
        [WikiId] BIGINT NOT NULL,
        [SectionId] BIGINT NULL,
        [UserId] INT NOT NULL,
        [Role] NVARCHAR(20) NOT NULL CONSTRAINT [DF_WikiCollaborators_Role] DEFAULT ('Viewer'),
        [AddedByUserId] INT NOT NULL,
        [AddedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_WikiCollaborators_AddedDate] DEFAULT (sysutcdatetime()),
        PRIMARY KEY CLUSTERED ([CollaboratorId] ASC),
        CONSTRAINT [FK_WikiCollaborators_Wiki] FOREIGN KEY([WikiId]) REFERENCES [dbo].[Wikis] ([WikiId]),
        CONSTRAINT [FK_WikiCollaborators_Section] FOREIGN KEY([SectionId]) REFERENCES [dbo].[WikiSections] ([SectionId]),
        CONSTRAINT [FK_WikiCollaborators_User] FOREIGN KEY([UserId]) REFERENCES [dbo].[Users] ([UserId]),
        CONSTRAINT [FK_WikiCollaborators_AddedByUser] FOREIGN KEY([AddedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE UNIQUE INDEX [UQ_WikiCollaborators_Section] ON [dbo].[WikiCollaborators]([WikiId], [SectionId], [UserId]) WHERE [SectionId] IS NOT NULL;
    CREATE UNIQUE INDEX [UQ_WikiCollaborators_WikiLevel] ON [dbo].[WikiCollaborators]([WikiId], [UserId]) WHERE [SectionId] IS NULL;
    CREATE INDEX [IX_WikiCollaborators_UserId] ON [dbo].[WikiCollaborators]([UserId]);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WikiShares')
BEGIN
    CREATE TABLE [dbo].[WikiShares](
        [ShareId] BIGINT IDENTITY(1,1) NOT NULL,
        [WikiId] BIGINT NOT NULL,
        [ShareType] NVARCHAR(20) NOT NULL,
        [TargetId] BIGINT NOT NULL,
        [AccessLevel] NVARCHAR(20) NOT NULL CONSTRAINT [DF_WikiShares_AccessLevel] DEFAULT ('Viewer'),
        [SharedByUserId] INT NOT NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_WikiShares_CreatedDate] DEFAULT (sysutcdatetime()),
        PRIMARY KEY CLUSTERED ([ShareId] ASC),
        CONSTRAINT [FK_WikiShares_Wiki] FOREIGN KEY([WikiId]) REFERENCES [dbo].[Wikis] ([WikiId]),
        CONSTRAINT [FK_WikiShares_SharedByUser] FOREIGN KEY([SharedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE INDEX [IX_WikiShares_WikiId] ON [dbo].[WikiShares]([WikiId]);
    CREATE INDEX [IX_WikiShares_Target] ON [dbo].[WikiShares]([ShareType], [TargetId]);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WikiTags')
BEGIN
    CREATE TABLE [dbo].[WikiTags](
        [WikiId] BIGINT NOT NULL,
        [Tag] NVARCHAR(50) NOT NULL,
        PRIMARY KEY CLUSTERED ([WikiId] ASC, [Tag] ASC),
        CONSTRAINT [FK_WikiTags_Wiki] FOREIGN KEY([WikiId]) REFERENCES [dbo].[Wikis] ([WikiId])
    );
    CREATE INDEX [IX_WikiTags_Tag] ON [dbo].[WikiTags]([Tag]);
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WikiVersions')
BEGIN
    CREATE TABLE [dbo].[WikiVersions](
        [VersionId] BIGINT IDENTITY(1,1) NOT NULL,
        [WikiId] BIGINT NOT NULL,
        [SectionId] BIGINT NULL,
        [VersionNumber] INT NOT NULL,
        [Title] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [ContentHtml] NVARCHAR(MAX) NOT NULL,
        [ChangeSummary] NVARCHAR(500) NULL,
        [CreatedByUserId] INT NOT NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_WikiVersions_CreatedDate] DEFAULT (sysutcdatetime()),
        PRIMARY KEY CLUSTERED ([VersionId] ASC),
        CONSTRAINT [FK_WikiVersions_Wiki] FOREIGN KEY([WikiId]) REFERENCES [dbo].[Wikis] ([WikiId]),
        CONSTRAINT [FK_WikiVersions_Section] FOREIGN KEY([SectionId]) REFERENCES [dbo].[WikiSections] ([SectionId]),
        CONSTRAINT [FK_WikiVersions_CreatedByUser] FOREIGN KEY([CreatedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE INDEX [IX_WikiVersions_WikiId] ON [dbo].[WikiVersions]([WikiId], [VersionNumber] DESC);
    CREATE INDEX [IX_WikiVersions_SectionId] ON [dbo].[WikiVersions]([SectionId], [VersionNumber] DESC);
END
";
            await db.Database.ExecuteSqlRawAsync(ddl);
            Log.Information("Wiki database tables verified and initialized successfully.");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to verify or initialize Wiki database tables.");
        }
    }
}
