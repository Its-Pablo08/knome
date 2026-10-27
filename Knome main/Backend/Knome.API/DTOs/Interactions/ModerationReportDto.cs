using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Interactions;

public class ModerationReportDto
{
    public long ReportId { get; set; }
    public int ReporterUserId { get; set; }
    public string ReporterFullName { get; set; } = null!;
    public int? ReportedUserId { get; set; }
    public string? ReportedUserName { get; set; }
    public string ContentType { get; set; } = null!;
    public long ContentId { get; set; }
    public string? CommunityName { get; set; }
    public string ReasonCode { get; set; } = null!;
    public string? Severity { get; set; }
    public string? AiScore { get; set; }
    public string Status { get; set; } = null!;
    public int? ModeratorUserId { get; set; }
    public string? ModeratorFullName { get; set; }
    public string? ActionTaken { get; set; }
    public DateTime ReportedDate { get; set; }
    public DateTime? ActionDate { get; set; }
    public string? PostContentSnippet { get; set; }
    public string? Details { get; set; }
    public string? Description { get; set; }
}

public class CreateReportDto
{
    public string ReasonCode { get; set; } = null!;
    public string? Details { get; set; }
    public string? Description { get; set; }
}

public class ResolveReportDto
{
    public string Status { get; set; } = null!;
    public string? ActionTaken { get; set; }
}

public class ContentSummaryDto
{
    public string ContentType { get; set; } = null!;
    public long ContentId { get; set; }
    public long CommentsCount { get; set; }
    public ReactionSummaryDto ReactionSummary { get; set; } = new ReactionSummaryDto();
    public long SharesCount { get; set; }
    public long ViewsCount { get; set; }
    public bool IsBookmarkedByCurrentUser { get; set; }
    public bool IsSharedByCurrentUser { get; set; }
    public long EngagementScore { get; set; }
}

public class ContentValidationResultDto
{
    public bool IsValid { get; set; }
    public List<string> BlockedUrlsFound { get; set; } = new List<string>();
    public List<string> RestrictedKeywordsFound { get; set; } = new List<string>();
}
