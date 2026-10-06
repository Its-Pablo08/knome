namespace Knome.API.DTOs.Messages;

public class SendMessageDto
{
    public int ReceiverId { get; set; }

    public string Content { get; set; } = string.Empty;

    public string? AttachmentsJson { get; set; }

    public long? ParentMessageId { get; set; }
}
