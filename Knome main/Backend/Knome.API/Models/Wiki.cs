using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class Wiki
{
    public long WikiId { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string ContentHtml { get; set; } = null!;

    public string Status { get; set; } = "Published"; // 'Draft', 'Published', 'Archived'

    public int CreatedByUserId { get; set; }

    public DateTime CreatedDate { get; set; }

    public DateTime UpdatedDate { get; set; }

    public bool IsArchived { get; set; }

    public bool IsDeleted { get; set; }

    public int ViewCount { get; set; }

    public int? CategoryId { get; set; }

    public string? CoverImageUrl { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual Category? Category { get; set; }

    public virtual ICollection<WikiSection> WikiSections { get; set; } = new List<WikiSection>();

    public virtual ICollection<WikiCollaborator> WikiCollaborators { get; set; } = new List<WikiCollaborator>();

    public virtual ICollection<WikiShare> WikiShares { get; set; } = new List<WikiShare>();

    public virtual ICollection<WikiTag> WikiTags { get; set; } = new List<WikiTag>();

    public virtual ICollection<WikiVersion> WikiVersions { get; set; } = new List<WikiVersion>();
}
