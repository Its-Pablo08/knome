-- ============================================================
-- Knome Enterprise Platform - Direct Messaging Module Tables
-- Schema Definition for Enterprise Encrypted Messages, Replies,
-- Attachments, Reactions, and Read Receipts
-- ============================================================

USE [Knome];
GO

-- 1. UserMessages Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessages')
BEGIN
    CREATE TABLE [dbo].[UserMessages] (
        [MessageId]           BIGINT IDENTITY(1,1) PRIMARY KEY,
        [SenderId]            INT            NOT NULL,
        [ReceiverId]          INT            NOT NULL,
        [CipherText]         VARBINARY(MAX) NOT NULL,
        [Nonce]               VARBINARY(12)  NOT NULL,
        [AuthTag]             VARBINARY(16)  NOT NULL,
        [KeyVersion]          INT            NOT NULL CONSTRAINT [DF_UserMessages_KeyVersion] DEFAULT 1,
        [AttachmentsJson]     NVARCHAR(MAX)  NULL,
        [ParentMessageId]     BIGINT         NULL,
        [IsRead]              BIT            NOT NULL CONSTRAINT [DF_UserMessages_IsRead] DEFAULT 0,
        [ReadDate]            DATETIME2      NULL,
        [IsEdited]            BIT            NOT NULL CONSTRAINT [DF_UserMessages_IsEdited] DEFAULT 0,
        [EditedDate]          DATETIME2      NULL,
        [IsDeleted]           BIT            NOT NULL CONSTRAINT [DF_UserMessages_IsDeleted] DEFAULT 0,
        [IsDeletedBySender]   BIT            NOT NULL CONSTRAINT [DF_UserMessages_IsDeletedBySender] DEFAULT 0,
        [IsDeletedByReceiver] BIT            NOT NULL CONSTRAINT [DF_UserMessages_IsDeletedByReceiver] DEFAULT 0,
        [CreatedDate]         DATETIME2      NOT NULL CONSTRAINT [DF_UserMessages_CreatedDate] DEFAULT GETUTCDATE(),
        [UpdatedDate]         DATETIME2      NOT NULL CONSTRAINT [DF_UserMessages_UpdatedDate] DEFAULT GETUTCDATE(),
        CONSTRAINT FK_UserMessages_Sender   FOREIGN KEY (SenderId)   REFERENCES Users(UserId),
        CONSTRAINT FK_UserMessages_Receiver FOREIGN KEY (ReceiverId) REFERENCES Users(UserId),
        CONSTRAINT CK_UserMessages_NotSelf  CHECK (SenderId <> ReceiverId)
    );

    CREATE INDEX IX_UserMessages_Conversation ON UserMessages (SenderId, ReceiverId, CreatedDate);
    CREATE INDEX IX_UserMessages_Unread       ON UserMessages (ReceiverId, IsRead) INCLUDE (SenderId);
    PRINT 'Table UserMessages created successfully.';
END
ELSE
BEGIN
    PRINT 'Table UserMessages already exists.';
END
GO

-- 2. Ensure missing columns exist in UserMessages table (dynamic statements to avoid parse errors)
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessages')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'ParentMessageId')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [ParentMessageId] BIGINT NULL;
        PRINT 'Added ParentMessageId to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsEdited')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [IsEdited] BIT NOT NULL CONSTRAINT DF_UserMessages_IsEdited DEFAULT 0;
        PRINT 'Added IsEdited to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'EditedDate')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [EditedDate] DATETIME2 NULL;
        PRINT 'Added EditedDate to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeleted')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [IsDeleted] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeleted DEFAULT 0;
        PRINT 'Added IsDeleted to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeletedBySender')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [IsDeletedBySender] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeletedBySender DEFAULT 0;
        PRINT 'Added IsDeletedBySender to UserMessages.';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeletedByReceiver')
    BEGIN
        ALTER TABLE [dbo].[UserMessages] ADD [IsDeletedByReceiver] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeletedByReceiver DEFAULT 0;
        PRINT 'Added IsDeletedByReceiver to UserMessages.';
    END
END
GO

-- 3. Ensure foreign key constraint for ParentMessageId
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessages')
    AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'ParentMessageId')
    AND NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_UserMessages_ParentMessage')
BEGIN
    ALTER TABLE [dbo].[UserMessages] ADD CONSTRAINT FK_UserMessages_ParentMessage FOREIGN KEY (ParentMessageId) REFERENCES UserMessages(MessageId);
    PRINT 'Added FK_UserMessages_ParentMessage constraint.';
END
GO

-- 4. UserMessageReactions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessageReactions')
BEGIN
    CREATE TABLE [dbo].[UserMessageReactions] (
        [ReactionId]   BIGINT IDENTITY(1,1) PRIMARY KEY,
        [MessageId]    BIGINT NOT NULL,
        [UserId]       INT NOT NULL,
        [ReactionType] NVARCHAR(32) NOT NULL,
        [CreatedDate]  DATETIME2 NOT NULL CONSTRAINT DF_UserMessageReactions_CreatedDate DEFAULT GETUTCDATE(),
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
