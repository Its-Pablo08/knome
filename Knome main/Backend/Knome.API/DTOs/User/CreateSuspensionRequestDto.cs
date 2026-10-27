using System;
using System.ComponentModel.DataAnnotations;

namespace Knome.API.DTOs.User;

public class CreateSuspensionRequestDto
{
    [Required]
    public int TargetUserId { get; set; }

    public string? Duration { get; set; } = "7d";
    public int? DurationDays { get; set; }
    public DateTime? CustomDate { get; set; }
    public bool IsPermanent { get; set; }
    public string? Category { get; set; }
    public string? Reason { get; set; }
    public string? FullReason { get; set; }
    public int? ReportId { get; set; }
    public long? ContentId { get; set; }
    public string? ContentType { get; set; }
}
