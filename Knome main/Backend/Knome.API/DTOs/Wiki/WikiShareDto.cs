using System;

namespace Knome.API.DTOs.Wiki;

public class WikiShareDto
{
    public long ShareId { get; set; }
    public long WikiId { get; set; }
    public string ShareType { get; set; } = string.Empty; // 'User', 'Community', 'Group'
    public long TargetId { get; set; }
    public string TargetName { get; set; } = string.Empty;
    public string? TargetDescription { get; set; }
    public string? TargetAvatarUrl { get; set; }
    public string AccessLevel { get; set; } = "Viewer"; // 'Viewer', 'Editor'
    public int SharedByUserId { get; set; }
    public string SharedByUserName { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
}

public class ShareWikiDto
{
    public string ShareType { get; set; } = string.Empty; // 'User', 'Community', 'Group'
    public long TargetId { get; set; }
    public string AccessLevel { get; set; } = "Viewer"; // 'Viewer', 'Editor'
}

public class WikiDepartmentDto
{
    public int DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? DepartmentCode { get; set; }
}
