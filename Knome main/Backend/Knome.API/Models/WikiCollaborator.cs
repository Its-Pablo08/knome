using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class WikiCollaborator
{
    public long CollaboratorId { get; set; }

    public long WikiId { get; set; }

    public long? SectionId { get; set; } // null = wiki-level, non-null = section-level

    public int UserId { get; set; }

    public string Role { get; set; } = "Viewer"; // 'Owner', 'Editor', 'Viewer'

    public int AddedByUserId { get; set; }

    public DateTime AddedDate { get; set; }

    public virtual Wiki Wiki { get; set; } = null!;

    public virtual WikiSection? Section { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual User AddedByUser { get; set; } = null!;
}
