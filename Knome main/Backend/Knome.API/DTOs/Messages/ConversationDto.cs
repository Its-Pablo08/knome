using System;

namespace Knome.API.DTOs.Messages;

public class ConversationDto
{
    public int PartnerId { get; set; }

    public string PartnerName { get; set; } = string.Empty;

    public string? PartnerEmployeeId { get; set; }

    public string? PartnerDesignation { get; set; }

    public string? PartnerDepartment { get; set; }

    public string? PartnerAvatarUrl { get; set; }

    public string LastMessage { get; set; } = string.Empty;

    public string LastMessageTime { get; set; } = string.Empty;

    public long LastMessageTimestamp { get; set; }

    public int UnreadCount { get; set; }

    public bool IsConnected { get; set; }
}
