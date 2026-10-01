using System;

namespace Knome.API.DTOs.Communities;

public class CommunityDto
{
    public int CommunityId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? BannerUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Rules { get; set; }
    public string? Faq { get; set; }
    public string CommunityType { get; set; } = null!;
    public int CreatedByUserId { get; set; }
    public string CreatedByUserName { get; set; } = null!;
    public DateTime CreatedDate { get; set; }
    public int MembersCount { get; set; }
    public int PostsCount { get; set; }
    public string? CurrentUserMembershipStatus { get; set; } // Approved, Pending, Rejected, Banned, or null if non-member
    public bool IsCurrentUserAdmin { get; set; }
    public bool IsActive { get; set; }
    public string ApprovalStatus { get; set; } = "Approved";
    public string? CreatorAvatar { get; set; }
    public string? CreatorEmployeeId { get; set; }
    public string? CreatorDesignation { get; set; }
    public string? CreatorDepartment { get; set; }
}

public class AddCommunityMembersDto
{
    public List<int> UserIds { get; set; } = new();
    public string MemberType { get; set; } = "Member";
}

public class RejectCommunityDto
{
    public string? Reason { get; set; }
}

public class CreateCommunityDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? BannerUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Rules { get; set; }
    public string? Faq { get; set; }
    public string CommunityType { get; set; } = null!;
    public List<int>? InvitedUserIds { get; set; }
}

public class UpdateCommunityDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? BannerUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Rules { get; set; }
    public string? Faq { get; set; }
}
