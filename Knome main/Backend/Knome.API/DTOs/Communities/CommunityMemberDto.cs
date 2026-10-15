using System;

namespace Knome.API.DTOs.Communities;

public class CommunityMemberDto
{
    public int CommunityId { get; set; }
    public int UserId { get; set; }
    public string EmployeeId { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string? Designation { get; set; }
    public string? ProfilePhotoUrl { get; set; }
    public string MemberType { get; set; } = null!;
    public string Status { get; set; } = null!;
    public DateTime RequestedDate { get; set; }
    public DateTime? DecidedDate { get; set; }
    public int? ApprovedByUserId { get; set; }
    public string? ApprovedByUserName { get; set; }
}

public class DecideMembershipDto
{
    public string Status { get; set; } = null!; // Approved, Rejected, Banned
}
