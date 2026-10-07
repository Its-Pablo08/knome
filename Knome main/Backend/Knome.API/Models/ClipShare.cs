using System;

namespace Knome.API.Models;

public partial class ClipShare
{
    public long ShareId { get; set; }

    public long ClipId { get; set; }

    public int SharedByUserId { get; set; }

    public string SharedToType { get; set; } = null!; // 'Community', 'User', 'Timeline'

    public long TargetId { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedDate { get; set; }

    public virtual Clip Clip { get; set; } = null!;

    public virtual User SharedByUser { get; set; } = null!;
}
