namespace Knome.API.DTOs.Wiki;

public class CreateWikiSectionDto
{
    public long? ParentSectionId { get; set; } // null for top-level, or parent section for subsection
    public string Title { get; set; } = string.Empty;
    public string ContentHtml { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string? ChangeSummary { get; set; }
}

public class UpdateWikiSectionDto
{
    public long? ParentSectionId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ContentHtml { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public string? ChangeSummary { get; set; }
    public System.DateTime? ExpectedUpdatedDate { get; set; }
}
