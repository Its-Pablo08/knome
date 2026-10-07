namespace Knome.API.DTOs.Clips;

public class ShareClipDto
{
    public string SharedToType { get; set; } = "User"; // 'Community', 'User', 'Timeline'
    public long TargetId { get; set; } // CommunityId or TargetUserId
    public string? Note { get; set; }
}
