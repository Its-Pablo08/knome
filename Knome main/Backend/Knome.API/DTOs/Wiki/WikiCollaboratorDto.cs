using System;

namespace Knome.API.DTOs.Wiki;

public class WikiCollaboratorDto
{
    public long CollaboratorId { get; set; }
    public long WikiId { get; set; }
    public long? SectionId { get; set; }
    public string? SectionTitle { get; set; }
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string EmployeeId { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? AvatarUrl { get; set; }
    public string Role { get; set; } = "Viewer"; // 'Owner', 'Editor', 'Viewer'
    public int AddedByUserId { get; set; }
    public string AddedByUserName { get; set; } = string.Empty;
    public DateTime AddedDate { get; set; }
}

public class AddCollaboratorDto
{
    public int UserId { get; set; }
    public long? SectionId { get; set; } // null for Wiki-level, or specific SectionId
    public string Role { get; set; } = "Viewer"; // 'Owner', 'Editor', 'Viewer'
}
