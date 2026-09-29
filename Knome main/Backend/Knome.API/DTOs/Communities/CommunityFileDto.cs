using System;

namespace Knome.API.DTOs.Communities;

public class CommunityFileDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "Document";
    public string Extension { get; set; } = "pdf";
    public string Size { get; set; } = string.Empty;
    public string UploadedBy { get; set; } = string.Empty;
    public int? UploadedByUserId { get; set; }
    public DateTime? UploadedAt { get; set; }
    public string Url { get; set; } = string.Empty;
    public int DownloadCount { get; set; }
}
