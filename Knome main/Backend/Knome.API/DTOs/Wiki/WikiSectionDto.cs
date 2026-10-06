using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Wiki;

public class WikiSectionDto
{
    public long SectionId { get; set; }
    public long WikiId { get; set; }
    public long? ParentSectionId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ContentHtml { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public int CreatedByUserId { get; set; }
    public string CreatedByUserName { get; set; } = string.Empty;
    public string? CreatedByUserAvatar { get; set; }
    public DateTime CreatedDate { get; set; }
    public DateTime UpdatedDate { get; set; }
    public List<WikiSectionDto> Subsections { get; set; } = new();
    public List<WikiCollaboratorDto> Collaborators { get; set; } = new();

    // Section-level resolved permission
    public string UserPermission { get; set; } = "Viewer";
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
}
