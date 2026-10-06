using System;

namespace Knome.API.Models;

public partial class UserMessageReaction
{
    public long ReactionId { get; set; }

    public long MessageId { get; set; }

    public int UserId { get; set; }

    public string ReactionType { get; set; } = string.Empty;

    public DateTime CreatedDate { get; set; }

    public virtual UserMessage Message { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
