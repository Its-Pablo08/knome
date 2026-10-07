-- ==============================================================================================
-- DATABASE CLEANUP SCRIPT: PRESERVE ONLY 7 SPECIFIED USERS AND ASSOCIATED DATA
-- Target Database: [Knome] (SQL Server)
--
-- Preserved Users:
--   1. Deepak Simrodia  (UserId: 1057, Email: deepak.simrodia@mponline.gov.in, EmpId: MPO652)
--   2. Loveneesh Sharma (UserId: 1,    Email: loveneesh.sharma@mponline.gov.in, EmpId: MP0108)
--   3. Mayur Bansal     (UserId: 1036, Email: mayurbansal7089@gmail.com,        EmpId: MPO111)
--   4. Meghna           (UserId: 5,    Email: meghna@gmail.com,                 EmpId: MPO105)
--   5. Sourabh Sahu     (UserId: 3,    Email: sourabhsahu45@gmail.com,          EmpId: MPO103)
--   6. Vilash Deshmukh  (UserId: 1050, Email: vilash.deshmukh@mponline.gov.in, EmpId: MPO089)
--   7. Vishendra Sharma (UserId: 1076, Email: vishendra.sharma@mponline.gov.in, EmpId: MP0664)
--
-- All operations are performed within an atomic transaction.
-- ==============================================================================================

USE [Knome];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 1: Merging duplicate accounts & releasing unique constraint collisions...';
    PRINT '----------------------------------------------------------------------';

    -- Migrate Vishendra activity from UserId 2 to 1076
    IF EXISTS (SELECT 1 FROM [Users] WHERE [UserId] = 2) AND EXISTS (SELECT 1 FROM [Users] WHERE [UserId] = 1076)
    BEGIN
        PRINT 'Migrating Vishendra Sharma activity from UserId 2 to 1076...';
        UPDATE [Posts] SET [AuthorUserId] = 1076 WHERE [AuthorUserId] = 2;
        UPDATE [Articles] SET [AuthorUserId] = 1076 WHERE [AuthorUserId] = 2;
        UPDATE [ArticleVersions] SET [EditedByUserId] = 1076 WHERE [EditedByUserId] = 2;
        UPDATE [Videos] SET [UploaderUserId] = 1076 WHERE [UploaderUserId] = 2;
        UPDATE [Podcasts] SET [UploaderUserId] = 1076 WHERE [UploaderUserId] = 2;
        UPDATE [Communities] SET [CreatedByUserId] = 1076 WHERE [CreatedByUserId] = 2;
        UPDATE [Comments] SET [UserId] = 1076 WHERE [UserId] = 2;

        DELETE FROM [Reactions] WHERE [UserId] = 2 AND EXISTS (SELECT 1 FROM [Reactions] r2 WHERE r2.[UserId] = 1076 AND r2.[ContentType] = [Reactions].[ContentType] AND r2.[ContentId] = [Reactions].[ContentId]);
        UPDATE [Reactions] SET [UserId] = 1076 WHERE [UserId] = 2;

        DELETE FROM [Bookmarks] WHERE [UserId] = 2 AND EXISTS (SELECT 1 FROM [Bookmarks] b2 WHERE b2.[UserId] = 1076 AND b2.[ContentType] = [Bookmarks].[ContentType] AND b2.[ContentId] = [Bookmarks].[ContentId]);
        UPDATE [Bookmarks] SET [UserId] = 1076 WHERE [UserId] = 2;

        UPDATE [Shares] SET [UserId] = 1076 WHERE [UserId] = 2;

        DELETE FROM [ContentViews] WHERE [UserId] = 2 AND EXISTS (SELECT 1 FROM [ContentViews] cv WHERE cv.[UserId] = 1076 AND cv.[ContentType] = [ContentViews].[ContentType] AND cv.[ContentId] = [ContentViews].[ContentId]);
        UPDATE [ContentViews] SET [UserId] = 1076 WHERE [UserId] = 2;

        DELETE FROM [CommunityMembers] WHERE [UserId] = 2 AND EXISTS (SELECT 1 FROM [CommunityMembers] cm WHERE cm.[UserId] = 1076 AND cm.[CommunityId] = [CommunityMembers].[CommunityId]);
        UPDATE [CommunityMembers] SET [UserId] = 1076 WHERE [UserId] = 2;
        UPDATE [CommunityMembers] SET [ApprovedByUserId] = 1076 WHERE [ApprovedByUserId] = 2;

        DELETE FROM [CommunityAdmins] WHERE [UserId] = 2 AND EXISTS (SELECT 1 FROM [CommunityAdmins] ca WHERE ca.[UserId] = 1076 AND ca.[CommunityId] = [CommunityAdmins].[CommunityId]);
        UPDATE [CommunityAdmins] SET [UserId] = 1076 WHERE [UserId] = 2;

        UPDATE [Jobs] SET [PostedByUserId] = 1076 WHERE [PostedByUserId] = 2;
        UPDATE [Abbreviations] SET [CreatedBy] = 1076 WHERE [CreatedBy] = 2;
        UPDATE [ModerationReports] SET [ModeratorUserId] = 1076 WHERE [ModeratorUserId] = 2;
        UPDATE [ModerationReports] SET [ReporterUserId] = 1076 WHERE [ReporterUserId] = 2;

        -- Free email collision
        UPDATE [Users] SET [Email] = 'vishendra_old_' + CAST([UserId] AS VARCHAR(10)) + '@delete.local' WHERE [UserId] = 2;
    END;

    -- Transfer credentials from 1085 to Sourabh (3) and release email
    IF EXISTS (SELECT 1 FROM [Users] WHERE [UserId] = 1085)
    BEGIN
        PRINT 'Transferring credentials from 1085 to Sourabh Sahu (UserId 3)...';
        IF EXISTS (SELECT 1 FROM [UserCredentials] WHERE [UserId] = 1085)
        BEGIN
            UPDATE uc3
            SET uc3.[PasswordHash] = uc1085.[PasswordHash],
                uc3.[PasswordSalt] = uc1085.[PasswordSalt]
            FROM [UserCredentials] uc3
            CROSS JOIN (SELECT TOP 1 [PasswordHash], [PasswordSalt] FROM [UserCredentials] WHERE [UserId] = 1085) uc1085
            WHERE uc3.[UserId] = 3;
        END;
        UPDATE [Users] SET [Email] = 'sourabh_temp_' + CAST([UserId] AS VARCHAR(10)) + '@delete.local' WHERE [UserId] = 1085;
    END;

    -- Transfer credentials from 1083 to Meghna (5) and release email
    IF EXISTS (SELECT 1 FROM [Users] WHERE [UserId] = 1083)
    BEGIN
        PRINT 'Transferring credentials from 1083 to Meghna (UserId 5)...';
        IF EXISTS (SELECT 1 FROM [UserCredentials] WHERE [UserId] = 1083)
        BEGIN
            UPDATE uc5
            SET uc5.[PasswordHash] = uc1083.[PasswordHash],
                uc5.[PasswordSalt] = uc1083.[PasswordSalt]
            FROM [UserCredentials] uc5
            CROSS JOIN (SELECT TOP 1 [PasswordHash], [PasswordSalt] FROM [UserCredentials] WHERE [UserId] = 1083) uc1083
            WHERE uc5.[UserId] = 5;
        END;
        UPDATE [Users] SET [Email] = 'meghna_temp_' + CAST([UserId] AS VARCHAR(10)) + '@delete.local' WHERE [UserId] = 1083;
    END;

    IF EXISTS (SELECT 1 FROM [Users] WHERE [UserId] = 1047)
    BEGIN
        UPDATE [Users] SET [Email] = 'meghna_temp_' + CAST([UserId] AS VARCHAR(10)) + '@delete.local' WHERE [UserId] = 1047;
    END;

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 2: Updating emails and profile info for the 7 canonical users...';
    PRINT '----------------------------------------------------------------------';

    -- 1. Deepak Simrodia
    UPDATE [Users]
    SET [Email] = 'deepak.simrodia@mponline.gov.in',
        [EmployeeId] = 'MPO652',
        [FullName] = 'Deepak Simrodia',
        [Designation] = 'Software Developer',
        [IsActive] = 1
    WHERE [UserId] = 1057;

    -- 2. Loveneesh Sharma
    UPDATE [Users]
    SET [Email] = 'loveneesh.sharma@mponline.gov.in',
        [EmployeeId] = 'MP0108',
        [FullName] = 'Loveneesh Sharma',
        [Designation] = 'TPM',
        [IsActive] = 1
    WHERE [UserId] = 1;

    -- 3. Mayur Bansal
    UPDATE [Users]
    SET [Email] = 'mayurbansal7089@gmail.com',
        [EmployeeId] = 'MPO111',
        [FullName] = 'Mayur Bansal',
        [Designation] = 'Software Developer',
        [IsActive] = 1
    WHERE [UserId] = 1036;

    -- 4. Meghna
    UPDATE [Users]
    SET [Email] = 'meghna@gmail.com',
        [EmployeeId] = 'MPO105',
        [FullName] = 'Meghna',
        [Designation] = 'Business Analyst',
        [IsActive] = 1
    WHERE [UserId] = 5;

    -- 5. Sourabh Sahu
    UPDATE [Users]
    SET [Email] = 'sourabhsahu45@gmail.com',
        [EmployeeId] = 'EMP052',
        [FullName] = 'Sourabh Sahu',
        [Designation] = 'Talent Acquisition Manager',
        [IsActive] = 1
    WHERE [UserId] = 3;

    -- 6. Vilash Deshmukh
    UPDATE [Users]
    SET [Email] = 'vilash.deshmukh@mponline.gov.in',
        [EmployeeId] = 'MPO089',
        [FullName] = 'Vilash Deshmukh',
        [Designation] = 'Associate Consultant',
        [IsActive] = 1
    WHERE [UserId] = 1050;

    -- 7. Vishendra Sharma
    UPDATE [Users]
    SET [Email] = 'vishendra.sharma@mponline.gov.in',
        [EmployeeId] = 'MP0664',
        [FullName] = 'Vishendra Sharma',
        [Designation] = 'Track Lead',
        [IsActive] = 1
    WHERE [UserId] = 1076;

    -- Canonical whitelist table
    IF OBJECT_ID('tempdb..#KeepUserIds') IS NOT NULL DROP TABLE #KeepUserIds;
    CREATE TABLE #KeepUserIds (UserId INT PRIMARY KEY);
    INSERT INTO #KeepUserIds (UserId) VALUES (1), (3), (5), (1036), (1050), (1057), (1076);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 3: Breaking self-referencing manager relationships...';
    PRINT '----------------------------------------------------------------------';
    UPDATE [Users] SET [ManagerEmployeeId] = NULL;

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 4: Deleting non-whitelisted comments & social interactions...';
    PRINT '----------------------------------------------------------------------';

    -- Comments: replies first
    DELETE FROM [Comments]
    WHERE [ParentCommentId] IS NOT NULL
      AND (
          [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
          OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
          OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
          OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT VideoId FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
          OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT PodcastId FROM [Podcasts] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
      );

    -- Comments: top level
    DELETE FROM [Comments]
    WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT VideoId FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT PodcastId FROM [Podcasts] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Reactions
    DELETE FROM [Reactions]
    WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT VideoId FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT PodcastId FROM [Podcasts] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Bookmarks
    DELETE FROM [Bookmarks]
    WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT VideoId FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT PodcastId FROM [Podcasts] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Shares
    DELETE FROM [Shares]
    WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Content Views
    DELETE FROM [ContentViews]
    WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Hot Posts Score Cache
    DELETE FROM [HotPostsScoreCache]
    WHERE ([ContentType] = 'Post' AND [ContentId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)))
       OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds)));

    -- Moderation Reports
    DELETE FROM [ModerationReports]
    WHERE [ReporterUserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR ([ModeratorUserId] IS NOT NULL AND [ModeratorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));

    -- Notifications & Preferences
    DELETE FROM [Notifications] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [NotificationPreferences] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    -- Followers & Connection Requests
    DELETE FROM [Followers]
    WHERE [FollowerUserId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR [FollowingUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    DELETE FROM [ConnectionRequests]
    WHERE [SenderId] NOT IN (SELECT UserId FROM #KeepUserIds)
       OR [ReceiverId] NOT IN (SELECT UserId FROM #KeepUserIds);

    -- Karma
    DELETE FROM [KarmaTransactions] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [KarmaBalances] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    -- Role Requests, Audit Log, Search History
    DELETE FROM [RoleRequests] WHERE [Email] NOT IN (
        'deepak.simrodia@mponline.gov.in',
        'loveneesh.sharma@mponline.gov.in',
        'mayurbansal7089@gmail.com',
        'meghna@gmail.com',
        'sourabhsahu45@gmail.com',
        'vilash.deshmukh@mponline.gov.in',
        'vishendra.sharma@mponline.gov.in'
    );
    DELETE FROM [AuditLog] WHERE [ActorUserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [SearchHistory] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    -- User Skills, Interests, Credentials, Roles
    DELETE FROM [UserSkills] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [UserInterests] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [UserCredentials] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [UserRoles] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 5: Deleting non-whitelisted Posts & dependencies...';
    PRINT '----------------------------------------------------------------------';
    DELETE FROM [PostAttachments] WHERE [PostId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [PostAudienceCommunities] WHERE [PostId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [PostAudienceUsers] WHERE [PostId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds))
                                       OR [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [PostMentions] WHERE [PostId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds))
                                  OR [MentionedUserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [CommunityPosts] WHERE [PostId] IN (SELECT PostId FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));

    DELETE FROM [Posts] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 6: Deleting non-whitelisted Articles & dependencies...';
    PRINT '----------------------------------------------------------------------';
    DELETE FROM [ArticleAttachments] WHERE [ArticleId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [ArticleTags] WHERE [ArticleId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [ArticleVersions] WHERE [ArticleId] IN (SELECT ArticleId FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds))
                                     OR [EditedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    DELETE FROM [Articles] WHERE [AuthorUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 7: Deleting non-whitelisted Videos and Podcasts...';
    PRINT '----------------------------------------------------------------------';
    DELETE FROM [VideoTags] WHERE [VideoId] IN (SELECT VideoId FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [Videos] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    DELETE FROM [Podcasts] WHERE [UploaderUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 8: Cleaning Communities, Members, Admins, and Jobs...';
    PRINT '----------------------------------------------------------------------';
    DELETE FROM [CommunityMembers] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    UPDATE [CommunityMembers] SET [ApprovedByUserId] = NULL WHERE [ApprovedByUserId] IS NOT NULL AND [ApprovedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds);
    DELETE FROM [CommunityAdmins] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    DELETE FROM [CommunityPosts] WHERE [CommunityId] IN (SELECT CommunityId FROM [Communities] WHERE [CreatedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [CommunityMembers] WHERE [CommunityId] IN (SELECT CommunityId FROM [Communities] WHERE [CreatedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [CommunityAdmins] WHERE [CommunityId] IN (SELECT CommunityId FROM [Communities] WHERE [CreatedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [PostAudienceCommunities] WHERE [CommunityId] IN (SELECT CommunityId FROM [Communities] WHERE [CreatedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds));
    DELETE FROM [Communities] WHERE [CreatedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    DELETE FROM [Jobs] WHERE [PostedByUserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    UPDATE [Abbreviations] SET [CreatedBy] = NULL WHERE [CreatedBy] IS NOT NULL AND [CreatedBy] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 9: Deleting non-whitelisted users from [Users] table...';
    PRINT '----------------------------------------------------------------------';
    DELETE FROM [Users] WHERE [UserId] NOT IN (SELECT UserId FROM #KeepUserIds);

    PRINT '----------------------------------------------------------------------';
    PRINT 'Step 10: Ensuring credentials, roles, and karma for the 7 preserved users...';
    PRINT '----------------------------------------------------------------------';
    DECLARE @DefaultHash VARCHAR(255) = '$2a$11$CS8Szl.LS4r1zinkLjKb8ucRdww25eHjSGhqc6my/hQXCbb9DW0Nm';
    DECLARE @DefaultSalt VARCHAR(255) = 'STATIC_SALT_FOR_BCRYPT';

    INSERT INTO [UserCredentials] ([UserId], [PasswordHash], [PasswordSalt], [LastUpdated])
    SELECT [UserId], @DefaultHash, @DefaultSalt, SYSDATETIME()
    FROM #KeepUserIds
    WHERE NOT EXISTS (SELECT 1 FROM [UserCredentials] uc WHERE uc.[UserId] = #KeepUserIds.[UserId]);

    -- Ensure roles
    DECLARE @RoleEmp INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = 'Employee');
    DECLARE @RoleSysAdmin INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] IN ('System Administrator', 'System Admin'));
    DECLARE @RoleCommAdmin INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] IN ('Community Administrator', 'Community Admin'));
    DECLARE @RoleHrAdmin INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] IN ('HR Administrator', 'HR Admin'));

    -- Add Employee role to all 7
    IF @RoleEmp IS NOT NULL
    BEGIN
        INSERT INTO [UserRoles] ([UserId], [RoleId])
        SELECT [UserId], @RoleEmp
        FROM #KeepUserIds k
        WHERE NOT EXISTS (SELECT 1 FROM [UserRoles] ur WHERE ur.[UserId] = k.[UserId] AND ur.[RoleId] = @RoleEmp);
    END;

    -- Add System Admin to Loveneesh (1) and Vilash (1050)
    IF @RoleSysAdmin IS NOT NULL
    BEGIN
        INSERT INTO [UserRoles] ([UserId], [RoleId])
        SELECT [UserId], @RoleSysAdmin
        FROM #KeepUserIds
        WHERE [UserId] IN (1, 1050)
          AND NOT EXISTS (SELECT 1 FROM [UserRoles] ur WHERE ur.[UserId] = #KeepUserIds.[UserId] AND ur.[RoleId] = @RoleSysAdmin);
    END;

    -- Add HR Admin to Sourabh (3) and Meghna (5)
    IF @RoleHrAdmin IS NOT NULL
    BEGIN
        INSERT INTO [UserRoles] ([UserId], [RoleId])
        SELECT [UserId], @RoleHrAdmin
        FROM #KeepUserIds
        WHERE [UserId] IN (3, 5)
          AND NOT EXISTS (SELECT 1 FROM [UserRoles] ur WHERE ur.[UserId] = #KeepUserIds.[UserId] AND ur.[RoleId] = @RoleHrAdmin);
    END;

    -- Add Community Admin to Vishendra (1076)
    IF @RoleCommAdmin IS NOT NULL
    BEGIN
        INSERT INTO [UserRoles] ([UserId], [RoleId])
        SELECT [UserId], @RoleCommAdmin
        FROM #KeepUserIds
        WHERE [UserId] = 1076
          AND NOT EXISTS (SELECT 1 FROM [UserRoles] ur WHERE ur.[UserId] = 1076 AND ur.[RoleId] = @RoleCommAdmin);
    END;

    -- Ensure Karma balances exist for all 7 users
    INSERT INTO [KarmaBalances] ([UserId], [TotalPoints], [BadgeLevel], [LastUpdated])
    SELECT [UserId], 0, 'None', SYSDATETIME()
    FROM #KeepUserIds k
    WHERE NOT EXISTS (SELECT 1 FROM [KarmaBalances] kb WHERE kb.[UserId] = k.[UserId]);

    COMMIT TRANSACTION;

    PRINT '----------------------------------------------------------------------';
    PRINT 'SUCCESS: Database cleanup completed successfully!';
    PRINT '----------------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT '----------------------------------------------------------------------';
    PRINT 'ERROR during cleanup! All changes have been safely rolled back.';
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    PRINT 'Error Line:    ' + CAST(ERROR_LINE() AS NVARCHAR(10));
    PRINT '----------------------------------------------------------------------';
    THROW;
END CATCH;
GO
