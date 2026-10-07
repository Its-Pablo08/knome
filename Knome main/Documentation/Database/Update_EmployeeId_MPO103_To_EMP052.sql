-- ==============================================================================
-- Knome Platform: Update EmployeeId from 'MPO103' to 'EMP052'
-- Target Database: [Knome] (SQL Server)
-- Scope: Sourabh Sahu (UserId: 3)
-- Safe, Atomic, Foreign-Key Preserving Transaction with Auto-Merge of Shell User 1102
-- ==============================================================================

USE [Knome];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

PRINT '==============================================================================';
PRINT '  KNOME: UPDATE EMPLOYEE ID FROM MPO103 TO EMP052 (SOURABH SAHU)';
PRINT '==============================================================================';

BEGIN TRANSACTION;

BEGIN TRY
    -- 1. Check if shell user (e.g. UserId 1102) was auto-created with EMP052
    DECLARE @ShellUserId INT = NULL;
    SELECT @ShellUserId = [UserId] 
    FROM [dbo].[Users] 
    WHERE [EmployeeId] = 'EMP052' AND [UserId] <> 3;

    IF @ShellUserId IS NOT NULL
    BEGIN
        PRINT 'Found auto-provisioned shell user record with EmployeeId EMP052 (UserId: ' + CAST(@ShellUserId AS VARCHAR(10)) + '). Merging into canonical User 3...';

        -- Reassign any messages sent or received by shell user to User 3
        UPDATE [dbo].[UserMessages] SET [SenderId] = 3 WHERE [SenderId] = @ShellUserId;
        UPDATE [dbo].[UserMessages] SET [ReceiverId] = 3 WHERE [ReceiverId] = @ShellUserId;

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

        -- Delete the shell user record so EMP052 is released
        DELETE FROM [dbo].[Users] WHERE [UserId] = @ShellUserId;
        PRINT 'Shell user ' + CAST(@ShellUserId AS VARCHAR(10)) + ' safely merged and removed.';
    END

    -- 2. Temporarily disable self-referential manager constraint
    PRINT 'Step 2: Temporarily disabling self-referential manager constraint...';
    ALTER TABLE [dbo].[Users] NOCHECK CONSTRAINT [FK_Users_Manager];

    -- 3. Update canonical User 3 (Sourabh Sahu) EmployeeId to EMP052
    PRINT 'Step 3: Updating User 3 (Sourabh Sahu) EmployeeId to EMP052...';
    UPDATE [dbo].[Users]
    SET [EmployeeId] = 'EMP052',
        [ModifiedDate] = SYSUTCDATETIME()
    WHERE [UserId] = 3 OR [EmployeeId] = 'MPO103';

    PRINT '        Rows updated in [Users]: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 4. Update any ManagerEmployeeId references from MPO103 to EMP052
    PRINT 'Step 4: Updating any [ManagerEmployeeId] references from MPO103 to EMP052...';
    UPDATE [dbo].[Users]
    SET [ManagerEmployeeId] = 'EMP052'
    WHERE [ManagerEmployeeId] = 'MPO103';

    PRINT '        Manager references updated: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

    -- 5. Update RoleRequests if any exist
    PRINT 'Step 5: Updating [RoleRequests] if any exist...';
    IF OBJECT_ID('[dbo].[RoleRequests]', 'U') IS NOT NULL
    BEGIN
        UPDATE [dbo].[RoleRequests]
        SET [EmployeeId] = 'EMP052'
        WHERE [EmployeeId] = 'MPO103';

        PRINT '        RoleRequests updated: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
    END

    -- 6. Re-enable and validate FK_Users_Manager constraint
    PRINT 'Step 6: Re-enabling and validating [FK_Users_Manager] constraint...';
    ALTER TABLE [dbo].[Users] WITH CHECK CHECK CONSTRAINT [FK_Users_Manager];

    COMMIT TRANSACTION;
    PRINT '';
    PRINT 'SUCCESS: Sourabh Sahu (UserId: 3) EmployeeId updated to EMP052 successfully!';
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
WHERE [UserId] = 3 OR [EmployeeId] IN ('EMP052', 'MPO103');
GO
