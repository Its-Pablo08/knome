namespace Knome.API.DTOs.Clips;

public class CreateClipDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string VideoUrl { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public int DurationSeconds { get; set; }
    public string? Hashtags { get; set; }
    public string Visibility { get; set; } = "Public"; // 'Public', 'Community', 'Specific'
    public int? CommunityId { get; set; }
    public string? AudienceUserIds { get; set; }
    public string Status { get; set; } = "Published"; // 'Published', 'Draft'
}
