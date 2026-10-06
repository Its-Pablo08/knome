using System.Collections.Generic;

namespace Knome.API.DTOs.Messages;

public class MessageReactionDto
{
    public string ReactionType { get; set; } = string.Empty;

    public int Count { get; set; }

    public List<int> UserIds { get; set; } = new();

    public bool HasReacted { get; set; }
}
