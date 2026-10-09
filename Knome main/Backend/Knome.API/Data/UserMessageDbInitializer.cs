using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace Knome.API.Data;

public static class UserMessageDbInitializer
{
    public static async Task EnsureUserMessageTablesExistAsync(KnomeDbContext db)
    {
        try
        {
            // 1. Create UserMessages base table if not existing
            var createTableSql = @"
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
END";
            await db.Database.ExecuteSqlRawAsync(createTableSql);

            // 2. Safely add any missing columns one by one with dynamic SQL to prevent batch parse errors
            var individualColumnScripts = new[]
            {
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'ParentMessageId') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [ParentMessageId] BIGINT NULL')",
                "IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_UserMessages_ParentMessage') AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'ParentMessageId') EXEC('ALTER TABLE [dbo].[UserMessages] ADD CONSTRAINT FK_UserMessages_ParentMessage FOREIGN KEY (ParentMessageId) REFERENCES UserMessages(MessageId)')",
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsEdited') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [IsEdited] BIT NOT NULL CONSTRAINT DF_UserMessages_IsEdited DEFAULT 0')",
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'EditedDate') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [EditedDate] DATETIME2 NULL')",
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeleted') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [IsDeleted] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeleted DEFAULT 0')",
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeletedBySender') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [IsDeletedBySender] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeletedBySender DEFAULT 0')",
                "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('UserMessages') AND name = 'IsDeletedByReceiver') EXEC('ALTER TABLE [dbo].[UserMessages] ADD [IsDeletedByReceiver] BIT NOT NULL CONSTRAINT DF_UserMessages_IsDeletedByReceiver DEFAULT 0')"
            };

            foreach (var colSql in individualColumnScripts)
            {
                try
                {
                    await db.Database.ExecuteSqlRawAsync(colSql);
                }
                catch (Exception ex)
                {
                    Log.Warning(ex, "UserMessage column migration notice: {Sql}", colSql);
                }
            }

            // 3. Create UserMessageReactions table if not existing
            var createReactionsTableSql = @"
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
END";
            await db.Database.ExecuteSqlRawAsync(createReactionsTableSql);
            Log.Information("UserMessage tables and extensions verified successfully.");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to verify or create UserMessage tables.");
        }
    }
}
