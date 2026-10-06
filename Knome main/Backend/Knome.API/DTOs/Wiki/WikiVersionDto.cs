using System;

namespace Knome.API.DTOs.Wiki;

public class WikiVersionDto
{
    public long VersionId { get; set; }
    public long WikiId { get; set; }
    public long? SectionId { get; set; }
    public string? SectionTitle { get; set; }
    public int VersionNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ContentHtml { get; set; } = string.Empty;
    public string? ChangeSummary { get; set; }
    public int CreatedByUserId { get; set; }
    public string CreatedByUserName { get; set; } = string.Empty;
    public string? CreatedByUserAvatar { get; set; }
    public DateTime CreatedDate { get; set; }
}

public class RestoreVersionDto
{
    public string? RestoreComment { get; set; }
}
