using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Wiki;

public class WikiDto
{
    public long WikiId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ContentHtml { get; set; } = string.Empty;
    public string Status { get; set; } = "Published"; // 'Draft', 'Published', 'Archived'
    public int CreatedByUserId { get; set; }
    public string CreatedByUserName { get; set; } = string.Empty;
    public string? CreatedByUserEmployeeId { get; set; }
    public string? CreatedByUserDesignation { get; set; }
    public string? CreatedByUserAvatar { get; set; }
    public DateTime CreatedDate { get; set; }
    public DateTime UpdatedDate { get; set; }
    public bool IsArchived { get; set; }
    public int ViewCount { get; set; }
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? CoverImageUrl { get; set; }
    public List<string> Tags { get; set; } = new();
    public int SectionsCount { get; set; }
    public int CollaboratorsCount { get; set; }
    public int VersionsCount { get; set; }

    // Current user's permission for this wiki: 'Owner', 'Editor', 'Viewer', 'None'
    public string UserPermission { get; set; } = "Viewer";
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanManageCollaborators { get; set; }
}
