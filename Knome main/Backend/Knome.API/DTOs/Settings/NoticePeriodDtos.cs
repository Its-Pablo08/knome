using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Settings;

public class NoticePeriodEmployeeDto
{
    public string PrimaryKey { get; set; } = string.Empty;
    public string EmployeeId { get; set; } = string.Empty;
    public int? UserId { get; set; }
    public int? Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Designation { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTime MarkedAt { get; set; } = DateTime.UtcNow;
    public string MarkedBy { get; set; } = "HR Administrator";
    public string MarkedByRole { get; set; } = "HR Admin";
    public int NoticeDays { get; set; } = 30;
    public string Reason { get; set; } = "Notice Period Registered";
    public bool DisablePostScheduling { get; set; } = true;
    public string Status { get; set; } = "In Notice Period";
}

public class NoticePeriodConfigDto
{
    public bool IsEnabled { get; set; } = true;
    public Dictionary<string, NoticePeriodEmployeeDto> Employees { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public class ToggleEmployeeNoticeDto
{
    public int? UserId { get; set; }
    public string? EmployeeId { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? Role { get; set; }
    public bool? IsMarked { get; set; }
    public int? NoticeDays { get; set; }
    public string? Reason { get; set; }
}

public class TogglePolicyDto
{
    public bool IsEnabled { get; set; }
}

public class NoticePeriodStatusResultDto
{
    public int UserId { get; set; }
    public string EmployeeId { get; set; } = string.Empty;
    public bool InNoticePeriod { get; set; }
    public bool DisablePostScheduling { get; set; }
    public string Status { get; set; } = "Standard Active";
}
