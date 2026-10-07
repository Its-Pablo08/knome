using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class Clip
{
    public long ClipId { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string VideoUrl { get; set; } = null!;

    public string? ThumbnailUrl { get; set; }

    public int DurationSeconds { get; set; }

    public string? Hashtags { get; set; }

    public string Visibility { get; set; } = "Public"; // 'Public', 'Community', 'Specific'

    public int? CommunityId { get; set; }

    public string? AudienceUserIds { get; set; }

    public string Status { get; set; } = "Published"; // 'Published', 'Draft', 'Archived', 'Removed'

    public int CreatedByUserId { get; set; }

    public DateTime CreatedDate { get; set; }

    public DateTime UpdatedDate { get; set; }

    public int ViewCount { get; set; }

    public int LikesCount { get; set; }

    public int CommentsCount { get; set; }

    public int SharesCount { get; set; }

    public bool IsActive { get; set; } = true;

    public bool IsDeleted { get; set; } = false;

    public virtual User CreatedByUser { get; set; } = null!;

    public virtual Community? Community { get; set; }

    public virtual ICollection<ClipShare> ClipShares { get; set; } = new List<ClipShare>();
}
