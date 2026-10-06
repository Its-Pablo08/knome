using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class WikiSection
{
    public long SectionId { get; set; }

    public long WikiId { get; set; }

    public long? ParentSectionId { get; set; }

    public string Title { get; set; } = null!;

    public string ContentHtml { get; set; } = null!;

    public int SortOrder { get; set; }

    public int CreatedByUserId { get; set; }

    public DateTime CreatedDate { get; set; }

    public DateTime UpdatedDate { get; set; }

    public bool IsDeleted { get; set; }

    public virtual Wiki Wiki { get; set; } = null!;

    public virtual WikiSection? ParentSection { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual ICollection<WikiSection> Subsections { get; set; } = new List<WikiSection>();

    public virtual ICollection<WikiCollaborator> WikiCollaborators { get; set; } = new List<WikiCollaborator>();

    public virtual ICollection<WikiVersion> WikiVersions { get; set; } = new List<WikiVersion>();
}
