using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.User;

public class UserProfileDto
{
    public int UserId { get; set; }
    public string EmployeeId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public int? DepartmentId { get; set; }
    public string? DepartmentName { get; set; }
    public string? Location { get; set; }
    public string? ProfilePhotoUrl { get; set; }
    public string? Bio { get; set; }
    public string BioVisibility { get; set; } = "Public";
    public string NetworkVisibility { get; set; } = "Public";
    public string PhotosVisibility { get; set; } = "Public";
    public string InterestsVisibility { get; set; } = "Public";
    public bool IsActive { get; set; }
    public DateTime? SuspendedUntil { get; set; }
    public bool IsPermanentlySuspended { get; set; }
    public string? MobileNo { get; set; }
    public string? ManagerEmployeeId { get; set; }
    public DateOnly? JoiningDate { get; set; }
    public DateTime? LastLogin { get; set; }
    public byte ProfileCompletion { get; set; }
    public List<string> Skills { get; set; } = new();
    public List<string> Interests { get; set; } = new();
    public string? Role { get; set; }
    public string? RoleName { get; set; }
    public List<string> Roles { get; set; } = new();

    // Summary metrics per FR-UP-03 & FR-UP-05
    public int FollowersCount { get; set; }
    public int FollowingCount { get; set; }
    public int MutualConnectionsCount { get; set; }
    public int PostsCount { get; set; }
    public int CommonCommunitiesCount { get; set; }
    public int KarmaPoints { get; set; }
    public string? KarmaBadgeLevel { get; set; }
    public string ConnectionStatus { get; set; } = "None"; // None, Pending, Connected
    public bool IsFollowing { get; set; }
}
