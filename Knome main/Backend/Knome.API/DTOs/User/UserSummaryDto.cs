using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.User;

public class UserSummaryDto
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
    public bool IsActive { get; set; }
    public bool IsPermanentlySuspended { get; set; }
    public bool IsSuspended { get; set; }
    public DateTime? SuspendedUntil { get; set; }
    public int KarmaPoints { get; set; }
    public string KarmaBadgeLevel { get; set; } = "Bronze";
    public string? Role { get; set; }
    public string? RoleName { get; set; }
    public List<string> Roles { get; set; } = new();
}
