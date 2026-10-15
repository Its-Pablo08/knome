using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Interactions;

public class ReactionDto
{
    public long ReactionId { get; set; }
    public string ContentType { get; set; } = null!;
    public long ContentId { get; set; }
    public int UserId { get; set; }
    public string UserFullName { get; set; } = null!;
    public string? UserDesignation { get; set; }
    public string? UserProfilePhotoUrl { get; set; }
    public string ReactionType { get; set; } = null!;
    public DateTime CreatedDate { get; set; }
}

public class ToggleReactionDto
{
    public string ReactionType { get; set; } = null!;
}

public class ReactionSummaryDto
{
    public long TotalCount { get; set; }
    public long LikeCount { get; set; }
    public long CelebrateCount { get; set; }
    public long SupportCount { get; set; }
    public long HeartCount { get; set; }
    public long DislikeCount { get; set; }
    public string? CurrentUserReactionType { get; set; }
    public List<string> TopReactionTypes { get; set; } = new();
    public List<ReactionDto> Reactions { get; set; } = new();
}
