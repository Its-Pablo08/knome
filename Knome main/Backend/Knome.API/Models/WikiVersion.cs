using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class WikiVersion
{
    public long VersionId { get; set; }

    public long WikiId { get; set; }

    public long? SectionId { get; set; } // null = wiki overview version, non-null = section version

    public int VersionNumber { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string ContentHtml { get; set; } = null!;

    public string? ChangeSummary { get; set; }

    public int CreatedByUserId { get; set; }

    public DateTime CreatedDate { get; set; }

    public virtual Wiki Wiki { get; set; } = null!;

    public virtual WikiSection? Section { get; set; }

    public virtual User CreatedByUser { get; set; } = null!;
}
