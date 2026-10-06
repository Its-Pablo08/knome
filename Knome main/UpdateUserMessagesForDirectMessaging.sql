-- ============================================================================
-- Knome Enterprise Platform - Direct Messaging Enhancements
-- Script: UpdateUserMessagesForDirectMessaging.sql
-- Database: [Knome]
-- Adds ParentMessageId (replies), IsEdited, EditedDate, IsDeleted to UserMessages
-- Creates UserMessageReactions table for 1-to-1 message reactions
-- ============================================================================

USE [Knome];
GO

-- 1. Extend UserMessages table
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessages')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'ParentMessageId')
    BEGIN
        ALTER TABLE UserMessages ADD ParentMessageId BIGINT NULL;
        ALTER TABLE UserMessages ADD CONSTRAINT FK_UserMessages_ParentMessage FOREIGN KEY (ParentMessageId) REFERENCES UserMessages(MessageId);
        PRINT 'Added ParentMessageId to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsEdited')
    BEGIN
        ALTER TABLE UserMessages ADD IsEdited BIT NOT NULL CONSTRAINT DF_UserMessages_IsEdited DEFAULT 0;
        PRINT 'Added IsEdited to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'EditedDate')
    BEGIN
        ALTER TABLE UserMessages ADD EditedDate DATETIME2 NULL;
        PRINT 'Added EditedDate to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeleted')
    BEGIN
        ALTER TABLE UserMessages ADD IsDeleted BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeleted DEFAULT 0;
        PRINT 'Added IsDeleted to UserMessages.';
    END
END
GO

-- 2. Create UserMessageReactions table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessageReactions')
BEGIN
    CREATE TABLE UserMessageReactions (
        ReactionId   BIGINT IDENTITY(1,1) PRIMARY KEY,
        MessageId    BIGINT NOT NULL,
        UserId       INT NOT NULL,
        ReactionType NVARCHAR(32) NOT NULL,
        CreatedDate  DATETIME2 NOT NULL CONSTRAINT DF_UserMessageReactions_CreatedDate DEFAULT GETUTCDATE(),
        CONSTRAINT FK_UserMessageReactions_Message FOREIGN KEY (MessageId) REFERENCES UserMessages(MessageId) ON DELETE CASCADE,
        CONSTRAINT FK_UserMessageReactions_User FOREIGN KEY (UserId) REFERENCES Users(UserId),
        CONSTRAINT UQ_UserMessageReactions_UserMessageReaction UNIQUE (MessageId, UserId, ReactionType)
    );

    CREATE INDEX IX_UserMessageReactions_MessageId ON UserMessageReactions (MessageId);
    CREATE INDEX IX_UserMessageReactions_UserId ON UserMessageReactions (UserId);

    PRINT 'Table UserMessageReactions created successfully.';
END
ELSE
BEGIN
    PRINT 'Table UserMessageReactions already exists.';
END
GO
