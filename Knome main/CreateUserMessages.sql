-- ============================================================================
-- Knome Enterprise Platform - Encrypted User Messages Table
-- Script: CreateUserMessages.sql
-- Run manually in SQL Server Management Studio (SSMS) against database: [Knome]
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserMessages')
BEGIN
    CREATE TABLE UserMessages (
        MessageId           BIGINT IDENTITY(1,1) PRIMARY KEY,
        SenderId            INT            NOT NULL,
        ReceiverId          INT            NOT NULL,
        CipherText          VARBINARY(MAX) NOT NULL,   -- AES-256-GCM encrypted message body
        Nonce               VARBINARY(12)  NOT NULL,   -- Unique 12-byte initialization vector per message
        AuthTag             VARBINARY(16)  NOT NULL,   -- 16-byte GCM authentication/integrity tag
        KeyVersion          INT            NOT NULL DEFAULT 1, -- Supports cryptographic key rotation
        AttachmentsJson     NVARCHAR(MAX)  NULL,       -- Serialized metadata for file/media attachments
        IsRead              BIT            NOT NULL DEFAULT 0,
        ReadDate            DATETIME2      NULL,
        IsDeletedBySender   BIT            NOT NULL DEFAULT 0,
        IsDeletedByReceiver BIT            NOT NULL DEFAULT 0,
        CreatedDate         DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        UpdatedDate         DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT FK_UserMessages_Sender   FOREIGN KEY (SenderId)   REFERENCES Users(UserId),
        CONSTRAINT FK_UserMessages_Receiver FOREIGN KEY (ReceiverId) REFERENCES Users(UserId),
        CONSTRAINT CK_UserMessages_NotSelf  CHECK (SenderId <> ReceiverId)
    );

    CREATE INDEX IX_UserMessages_Conversation ON UserMessages (SenderId, ReceiverId, CreatedDate);
    CREATE INDEX IX_UserMessages_Unread       ON UserMessages (ReceiverId, IsRead) INCLUDE (SenderId);

    PRINT 'Table UserMessages created successfully with indexes and constraints.';
END
ELSE
BEGIN
    PRINT 'Table UserMessages already exists.';
END
GO
