-- ==============================================================================
-- Knome Platform: Update EmployeeId from 'MPO111' to 'EMP100'
-- Target Database: [Knome] (SQL Server)
-- Scope: Mayur Bansal (UserId: 1036)
-- Safe, Atomic, Foreign-Key Preserving Transaction with Auto-Merge of Shell User
-- ==============================================================================

USE [Knome];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '==============================================================================';
PRINT '  KNOME: UPDATE EMPLOYEE ID FROM MPO111 TO EMP100 (MAYUR BANSAL)';
PRINT '==============================================================================';

BEGIN TRANSACTION;

BEGIN TRY
    -- 1. Check if shell user was auto-created with EMP100
    DECLARE @ShellUserId INT = NULL;
    SELECT @ShellUserId = [UserId] 
    FROM [dbo].[Users] 
    WHERE [EmployeeId] = 'EMP100' AND [UserId] <> 1036;

    IF @ShellUserId IS NOT NULL
    BEGIN
        PRINT 'Found auto-provisioned shell user record with EmployeeId EMP100 (UserId: ' + CAST(@ShellUserId AS VARCHAR(10)) + '). Merging into canonical User 1036 (Mayur Bansal)...';

        -- Reassign any posts, articles, videos, podcasts, comments, reactions created by shell user to User 1036
        UPDATE [dbo].[Posts] SET [AuthorUserId] = 1036 WHERE [AuthorUserId] = @ShellUserId;
        UPDATE [dbo].[Articles] SET [AuthorUserId] = 1036 WHERE [AuthorUserId] = @ShellUserId;
        UPDATE [dbo].[Videos] SET [UploaderUserId] = 1036 WHERE [UploaderUserId] = @ShellUserId;
        UPDATE [dbo].[Podcasts] SET [UploaderUserId] = 1036 WHERE [UploaderUserId] = @ShellUserId;
        UPDATE [dbo].[Comments] SET [UserId] = 1036 WHERE [UserId] = @ShellUserId;

        -- Reassign reactions and bookmarks avoiding duplicates
        DELETE FROM [dbo].[Reactions] WHERE [UserId] = @ShellUserId AND EXISTS (SELECT 1 FROM [dbo].[Reactions] r2 WHERE r2.[UserId] = 1036 AND r2.[ContentType] = [dbo].[Reactions].[ContentType] AND r2.[ContentId] = [dbo].[Reactions].[ContentId]);
        UPDATE [dbo].[Reactions] SET [UserId] = 1036 WHERE [UserId] = @ShellUserId;

        DELETE FROM [dbo].[Bookmarks] WHERE [UserId] = @ShellUserId AND EXISTS (SELECT 1 FROM [dbo].[Bookmarks] b2 WHERE b2.[UserId] = 1036 AND b2.[ContentType] = [dbo].[Bookmarks].[ContentType] AND b2.[ContentId] = [dbo].[Bookmarks].[ContentId]);
        UPDATE [dbo].[Bookmarks] SET [UserId] = 1036 WHERE [UserId] = @ShellUserId;

        DELETE FROM [dbo].[CommunityMembers] WHERE [UserId] = @ShellUserId AND EXISTS (SELECT 1 FROM [dbo].[CommunityMembers] cm2 WHERE cm2.[UserId] = 1036 AND cm2.[CommunityId] = [dbo].[CommunityMembers].[CommunityId]);
        UPDATE [dbo].[CommunityMembers] SET [UserId] = 1036 WHERE [UserId] = @ShellUserId;

        -- Reassign any messages sent or received by shell user to User 1036
        UPDATE [dbo].[UserMessages] SET [SenderId] = 1036 WHERE [SenderId] = @ShellUserId;
        UPDATE [dbo].[UserMessages] SET [ReceiverId] = 1036 WHERE [ReceiverId] = @ShellUserId;

        -- Clean child records of shell user
        DELETE FROM [dbo].[UserMessageReactions] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[KarmaBalances] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[KarmaTransactions] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[UserCredentials] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[UserRoles] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[UserSkills] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[UserInterests] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[Notifications] WHERE [UserId] = @ShellUserId;
        DELETE FROM [dbo].[AuditLog] WHERE [TargetId] = @ShellUserId AND [TargetType] = 'User';

        -- Delete the shell user record so EMP100 is released
        DELETE FROM [dbo].[Users] WHERE [UserId] = @ShellUserId;
        PRINT 'Shell user ' + CAST(@ShellUserId AS VARCHAR(10)) + ' safely merged and removed.';
    END

    -- 2. Temporarily disable self-referential manager constraint
    PRINT 'Step 2: Temporarily disabling self-referential manager constraint...';
    ALTER TABLE [dbo].[Users] NOCHECK CONSTRAINT [FK_Users_Manager];

    -- 3. Update canonical User 1036 (Mayur Bansal) EmployeeId to EMP100
    PRINT 'Step 3: Updating User 1036 (Mayur Bansal) EmployeeId to EMP100 and FullName to Mayur Bansal...';
    UPDATE [dbo].[Users]
    SET [EmployeeId] = 'EMP100',
        [FullName] = 'Mayur Bansal',
        [Email] = 'mayurbansal7089@gmail.com',
        [Designation] = 'Software Developer',
        [IsActive] = 1,
        [ModifiedDate] = SYSUTCDATETIME()
    WHERE [UserId] = 1036 OR [EmployeeId] = 'MPO111';

    PRINT '        Rows updated in [Users]: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 4. Update any ManagerEmployeeId references from MPO111 to EMP100
    PRINT 'Step 4: Updating any [ManagerEmployeeId] references from MPO111 to EMP100...';
    UPDATE [dbo].[Users]
    SET [ManagerEmployeeId] = 'EMP100'
    WHERE [ManagerEmployeeId] = 'MPO111';

    PRINT '        Manager references updated: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 5. Update RoleRequests if any exist
    PRINT 'Step 5: Updating [RoleRequests] if any exist...';
    IF OBJECT_ID('[dbo].[RoleRequests]', 'U') IS NOT NULL
    BEGIN
        UPDATE [dbo].[RoleRequests]
        SET [EmployeeId] = 'EMP100'
        WHERE [EmployeeId] = 'MPO111';

        PRINT '        RoleRequests updated: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
    END

    -- 6. Re-enable and validate FK_Users_Manager constraint
    PRINT 'Step 6: Re-enabling and validating [FK_Users_Manager] constraint...';
    ALTER TABLE [dbo].[Users] WITH CHECK CHECK CONSTRAINT [FK_Users_Manager];

    COMMIT TRANSACTION;
    PRINT '';
    PRINT 'SUCCESS: Mayur Bansal (UserId: 1036) EmployeeId updated to EMP100 successfully!';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'ROLLBACK TRIGGERED: ' + @Err;
    RAISERROR(@Err, 16, 1);
END CATCH;
GO

-- Verification Query
PRINT '';
PRINT '=== VERIFICATION RESULT ===';
SELECT 
    [UserId],
    [EmployeeId],
    [FullName],
    [Email],
    [Designation],
    [IsActive]
FROM [dbo].[Users]
WHERE [UserId] = 1036 OR [EmployeeId] IN ('EMP100', 'MPO111');
GO
