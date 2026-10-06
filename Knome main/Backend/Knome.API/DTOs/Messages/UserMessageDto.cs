using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Messages;

public class UserMessageDto
{
    public long MessageId { get; set; }

    public int SenderId { get; set; }

    public string SenderName { get; set; } = string.Empty;

    public string? SenderAvatarUrl { get; set; }

    public int ReceiverId { get; set; }

    public string ReceiverName { get; set; } = string.Empty;

    public string? ReceiverAvatarUrl { get; set; }

    public string Content { get; set; } = string.Empty;

    public string? AttachmentsJson { get; set; }

    public bool IsRead { get; set; }

    public DateTime? ReadDate { get; set; }

    public DateTime CreatedDate { get; set; }

    public long? ParentMessageId { get; set; }

    public string? ParentContent { get; set; }

    public string? ParentSenderName { get; set; }

    public bool IsEdited { get; set; }

    public DateTime? EditedDate { get; set; }

    public bool IsDeleted { get; set; }

    public List<MessageReactionDto> Reactions { get; set; } = new();
}
