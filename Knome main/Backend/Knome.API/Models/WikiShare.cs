using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class WikiShare
{
    public long ShareId { get; set; }

    public long WikiId { get; set; }

    public string ShareType { get; set; } = null!; // 'User', 'Community', 'Group'

    public long TargetId { get; set; } // UserId, CommunityId, or Department/GroupId

    public string AccessLevel { get; set; } = "Viewer"; // 'Viewer', 'Editor'

    public int SharedByUserId { get; set; }

    public DateTime CreatedDate { get; set; }

    public virtual Wiki Wiki { get; set; } = null!;

    public virtual User SharedByUser { get; set; } = null!;
}
