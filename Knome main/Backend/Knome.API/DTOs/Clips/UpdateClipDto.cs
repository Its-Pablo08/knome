namespace Knome.API.DTOs.Clips;

public class UpdateClipDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? Hashtags { get; set; }
    public string? Visibility { get; set; }
    public int? CommunityId { get; set; }
    public string? AudienceUserIds { get; set; }
    public string? Status { get; set; }
}
