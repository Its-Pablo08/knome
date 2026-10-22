using System;

namespace Knome.API.DTOs.Interactions;

public class SavedContentItemDto
{
    public int UserId { get; set; }
    public string ContentType { get; set; } = null!;
    public long ContentId { get; set; }
    public DateTime SavedDate { get; set; }
    
    // Hydrated content fields
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public int? AuthorId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string? AuthorAvatar { get; set; }
    public string? AuthorRole { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CategoryOrCommunity { get; set; }
    
    public int LikesCount { get; set; }
    public int CommentsCount { get; set; }
    public string TargetUrl { get; set; } = string.Empty;
    
    public bool IsAvailable { get; set; } = true;
    public string? UnavailabilityReason { get; set; }
}

public class SavedContentQueryDto
{
    public string? ContentType { get; set; } // "All", "Post", "Article", "Video", "Podcast", "Document"
    public string? Search { get; set; }
    public string SortBy { get; set; } = "NewestSaved"; // "NewestSaved", "OldestSaved", "RecentlyUpdated"
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class SavedContentCountDto
{
    public int TotalCount { get; set; }
    public int PostsCount { get; set; }
    public int ArticlesCount { get; set; }
    public int VideosCount { get; set; }
    public int PodcastsCount { get; set; }
    public int DocumentsCount { get; set; }
    public int ClipsCount { get; set; }
    public int WikiCount { get; set; }
}
