using System.Collections.Generic;

namespace Knome.API.DTOs.Wiki;

public class CreateWikiDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ContentHtml { get; set; } = string.Empty;
    public string Status { get; set; } = "Published"; // 'Draft', 'Published'
    public int? CategoryId { get; set; }
    public string? CoverImageUrl { get; set; }
    public List<string> Tags { get; set; } = new();
    public List<AddCollaboratorDto>? InitialCollaborators { get; set; }
    public List<ShareWikiDto>? InitialShares { get; set; }
}
