using System;

namespace Knome.API.DTOs.Clips;

public class ClipViewerDto
{
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? EmployeeId { get; set; }
    public string? ProfilePhotoUrl { get; set; }
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public DateTime ViewedDate { get; set; }
}

public class ClipEngagementDto
{
    public long ClipId { get; set; }
    public int ViewCount { get; set; }
    public int LikesCount { get; set; }
    public int CommentsCount { get; set; }
    public int SharesCount { get; set; }
    public bool? IsLiked { get; set; }
    public int? UserId { get; set; }
    public string? UpdateType { get; set; }
}
