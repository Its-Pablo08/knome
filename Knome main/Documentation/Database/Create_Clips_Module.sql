-- ============================================================
-- Knome Enterprise Platform - Clips Module Tables
-- Schema Definition for Short-Form Video Platform (Reels / Shorts)
-- Supports Vertical Clips, Feed, Engagement, Communities & Moderation
-- ============================================================

USE [Knome];
GO

-- 1. Clips Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Clips')
BEGIN
    CREATE TABLE [dbo].[Clips](
        [ClipId] BIGINT IDENTITY(1,1) NOT NULL,
        [Title] NVARCHAR(250) NOT NULL,
        [Description] NVARCHAR(2000) NULL,
        [VideoUrl] NVARCHAR(1000) NOT NULL,
        [ThumbnailUrl] NVARCHAR(1000) NULL,
        [DurationSeconds] INT NOT NULL CONSTRAINT [DF_Clips_Duration] DEFAULT (0),
        [Hashtags] NVARCHAR(500) NULL,
        [Visibility] NVARCHAR(50) NOT NULL CONSTRAINT [DF_Clips_Visibility] DEFAULT ('Public'), -- 'Public', 'Community', 'Specific'
        [CommunityId] BIGINT NULL,
        [AudienceUserIds] NVARCHAR(MAX) NULL,
        [Status] NVARCHAR(50) NOT NULL CONSTRAINT [DF_Clips_Status] DEFAULT ('Published'), -- 'Published', 'Draft', 'Archived', 'Removed'
        [CreatedByUserId] INT NOT NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_Clips_CreatedDate] DEFAULT (sysutcdatetime()),
        [UpdatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_Clips_UpdatedDate] DEFAULT (sysutcdatetime()),
        [ViewCount] INT NOT NULL CONSTRAINT [DF_Clips_ViewCount] DEFAULT (0),
        [LikesCount] INT NOT NULL CONSTRAINT [DF_Clips_LikesCount] DEFAULT (0),
        [CommentsCount] INT NOT NULL CONSTRAINT [DF_Clips_CommentsCount] DEFAULT (0),
        [SharesCount] INT NOT NULL CONSTRAINT [DF_Clips_SharesCount] DEFAULT (0),
        [IsActive] BIT NOT NULL CONSTRAINT [DF_Clips_IsActive] DEFAULT (1),
        [IsDeleted] BIT NOT NULL CONSTRAINT [DF_Clips_IsDeleted] DEFAULT (0),
        PRIMARY KEY CLUSTERED ([ClipId] ASC),
        CONSTRAINT [FK_Clips_CreatedByUser] FOREIGN KEY([CreatedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE INDEX [IX_Clips_CreatedDate] ON [dbo].[Clips]([CreatedDate] DESC);
    CREATE INDEX [IX_Clips_CreatedByUserId] ON [dbo].[Clips]([CreatedByUserId]);
    CREATE INDEX [IX_Clips_Status] ON [dbo].[Clips]([Status]);
    CREATE INDEX [IX_Clips_CommunityId] ON [dbo].[Clips]([CommunityId]);
    CREATE INDEX [IX_Clips_IsDeleted_IsActive] ON [dbo].[Clips]([IsDeleted], [IsActive]);
    PRINT 'Table Clips created successfully.';
END
ELSE
BEGIN
    PRINT 'Table Clips already exists.';
END
GO

-- 1b. Seed initial Knome enterprise clips if table is empty
IF NOT EXISTS (SELECT 1 FROM [dbo].[Clips])
BEGIN
    INSERT INTO [dbo].[Clips] (
        [Title], [Description], [VideoUrl], [ThumbnailUrl], [DurationSeconds],
        [Hashtags], [Visibility], [CommunityId], [AudienceUserIds], [Status],
        [CreatedByUserId], [CreatedDate], [UpdatedDate],
        [ViewCount], [LikesCount], [CommentsCount], [SharesCount],
        [IsActive], [IsDeleted]
    ) VALUES 
    (
        N'Welcome to Knome Clips! 🎬 Experience short-form enterprise video sharing',
        N'Introducing vertical short video reels at MPOnline. Share tech updates, quick tips, team milestones, and creative knowledge directly with colleagues.',
        N'https://vjs.zencdn.net/v/oceans.mp4',
        N'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=600&h=1000',
        46,
        N'#Innovation #MPOnline #Tech #ClipsLaunch',
        N'Public',
        NULL,
        NULL,
        N'Published',
        1076, -- Vishendra Sharma (UserId 1076)
        GETUTCDATE(),
        GETUTCDATE(),
        0, -- genuine Knome view count starting at 0
        0,
        0,
        0,
        1,
        0
    ),
    (
        N'Micro-Animations in React 19 & Tailwind CSS ✨',
        N'Quick walkthrough on using smooth GPU-accelerated CSS transforms and spring physics to create stunning micro-interactions that wow enterprise users.',
        N'https://media.w3.org/2010/05/sintel/trailer.mp4',
        N'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=600&h=1000',
        15,
        N'#Frontend #React #Tailwind #UIUX #Design',
        N'Public',
        NULL,
        NULL,
        N'Published',
        1, -- Loveneesh Sharma
        GETUTCDATE(),
        GETUTCDATE(),
        0,
        0,
        0,
        0,
        1,
        0
    ),
    (
        N'Building Resilient Microservices with ASP.NET Core 10 🚀',
        N'How we decoupled critical services using outbox patterns and asynchronous messaging in the MPOnline Enterprise Cloud stack.',
        N'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        N'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600&h=1000',
        15,
        N'#DotNet #Backend #Architecture #Cloud #Engineering',
        N'Public',
        NULL,
        NULL,
        N'Published',
        3, -- Sourabh Sahu
        GETUTCDATE(),
        GETUTCDATE(),
        0,
        0,
        0,
        0,
        1,
        0
    );

    PRINT 'Seeded 3 Knome enterprise clips with 0 views.';
END
GO

-- 2. ClipShares Table (Community shares & Direct user shares)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ClipShares')
BEGIN
    CREATE TABLE [dbo].[ClipShares](
        [ShareId] BIGINT IDENTITY(1,1) NOT NULL,
        [ClipId] BIGINT NOT NULL,
        [SharedByUserId] INT NOT NULL,
        [SharedToType] NVARCHAR(50) NOT NULL, -- 'Community', 'User', 'Timeline'
        [TargetId] BIGINT NOT NULL,           -- CommunityId or TargetUserId
        [Note] NVARCHAR(500) NULL,
        [CreatedDate] DATETIME2(7) NOT NULL CONSTRAINT [DF_ClipShares_CreatedDate] DEFAULT (sysutcdatetime()),
        PRIMARY KEY CLUSTERED ([ShareId] ASC),
        CONSTRAINT [FK_ClipShares_Clip] FOREIGN KEY([ClipId]) REFERENCES [dbo].[Clips] ([ClipId]) ON DELETE CASCADE,
        CONSTRAINT [FK_ClipShares_SharedByUser] FOREIGN KEY([SharedByUserId]) REFERENCES [dbo].[Users] ([UserId])
    );
    CREATE INDEX [IX_ClipShares_ClipId] ON [dbo].[ClipShares]([ClipId]);
    CREATE INDEX [IX_ClipShares_Target] ON [dbo].[ClipShares]([SharedToType], [TargetId]);
    PRINT 'Table ClipShares created successfully.';
END
ELSE
BEGIN
    PRINT 'Table ClipShares already exists.';
END
GO
