USE [Knome];
GO

-- Only seed if Clips table is currently empty
IF NOT EXISTS (SELECT 1 FROM [dbo].[Clips])
BEGIN
    INSERT INTO [dbo].[Clips] (
        [Title],
        [Description],
        [VideoUrl],
        [ThumbnailUrl],
        [DurationSeconds],
        [Hashtags],
        [Visibility],
        [CommunityId],
        [AudienceUserIds],
        [Status],
        [CreatedByUserId],
        [CreatedDate],
        [UpdatedDate],
        [ViewCount],
        [LikesCount],
        [CommentsCount],
        [SharesCount],
        [IsActive],
        [IsDeleted]
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
        0, -- Genuine Knome view count starting at 0
        0, -- 0 likes
        0, -- 0 comments
        0, -- 0 shares
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
        0, -- Genuine Knome view count starting at 0
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
        0, -- Genuine Knome view count starting at 0
        0,
        0,
        0,
        1,
        0
    );

    PRINT 'Seeded 3 Knome enterprise clips with 0 views.';
END
ELSE
BEGIN
    -- Update existing clips with verified CDN video streams
    UPDATE [dbo].[Clips]
    SET [VideoUrl] = 'https://vjs.zencdn.net/v/oceans.mp4'
    WHERE [Title] LIKE N'%Welcome to Knome Clips%';

    UPDATE [dbo].[Clips]
    SET [VideoUrl] = 'https://media.w3.org/2010/05/sintel/trailer.mp4'
    WHERE [Title] LIKE N'%Micro-Animations%';

    UPDATE [dbo].[Clips]
    SET [VideoUrl] = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
    WHERE [Title] LIKE N'%Building Resilient Microservices%';

    DELETE FROM [dbo].[ContentViews] WHERE [ContentType] = 'Clip';
    UPDATE [dbo].[Clips] SET [ViewCount] = 0;

    PRINT 'Updated existing clips with verified video streaming sources and reset view counts to 0.';
END
GO
