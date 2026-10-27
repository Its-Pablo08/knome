using System;

namespace Knome.API.DTOs.User;

public class SuspensionRequestDto
{
    public long RequestId { get; set; }
    public int TargetUserId { get; set; }
    public string TargetEmployeeId { get; set; } = string.Empty;
    public string TargetFullName { get; set; } = string.Empty;
    public string? TargetEmail { get; set; }
    public string? TargetDesignation { get; set; }
    public string? TargetDepartment { get; set; }
    public string? TargetAvatar { get; set; }
    public int RequestedByUserId { get; set; }
    public string RequestedByName { get; set; } = string.Empty;
    public string RequestedByRole { get; set; } = "Moderator";
    public string Duration { get; set; } = "7d";
    public int? DurationDays { get; set; }
    public DateTime? CustomDate { get; set; }
    public bool IsPermanent { get; set; }
    public string? Category { get; set; }
    public string? Reason { get; set; }
    public string FullReason { get; set; } = string.Empty;
    public int? ReportId { get; set; }
    public long? ContentId { get; set; }
    public string? ContentType { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime CreatedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public int? ReviewedByUserId { get; set; }
    public string? ReviewedByName { get; set; }
    public string? ReviewedByRole { get; set; }
    public string? RejectionReason { get; set; }
}
