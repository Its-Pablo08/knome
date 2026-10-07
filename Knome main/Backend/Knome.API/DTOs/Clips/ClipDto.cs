using System;

namespace Knome.API.DTOs.Clips;

public class ClipDto
{
    public long ClipId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string VideoUrl { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public int DurationSeconds { get; set; }
    public string? Hashtags { get; set; }
    public string Visibility { get; set; } = "Public";
    public int? CommunityId { get; set; }
    public string? CommunityName { get; set; }
    public string? AudienceUserIds { get; set; }
    public string Status { get; set; } = "Published";
    public int CreatedByUserId { get; set; }
    public string CreatorName { get; set; } = string.Empty;
    public string? CreatorAvatar { get; set; }
    public string? CreatorRole { get; set; }
    public string? CreatorDepartment { get; set; }
    public DateTime CreatedDate { get; set; }
    public DateTime UpdatedDate { get; set; }
    public int ViewCount { get; set; }
    public int LikesCount { get; set; }
    public int CommentsCount { get; set; }
    public int SharesCount { get; set; }
    public bool IsLikedByCurrentUser { get; set; }
    public bool IsBookmarkedByCurrentUser { get; set; }
    public bool IsMyClip { get; set; }
}
