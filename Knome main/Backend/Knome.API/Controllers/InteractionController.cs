using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Interactions;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Knome.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/interactions")]
[Authorize]
public class InteractionController : KnomeControllerBase
{
    private readonly IContentInteractionService _interactionService;
    private readonly ISystemSettingService _settingService;

    public InteractionController(IContentInteractionService interactionService, ISystemSettingService settingService)
    {
        _interactionService = interactionService;
        _settingService = settingService;
    }

    private async Task EnsureContentTypeEnabledAsync(string contentType)
    {
        if (contentType.Equals("Post", StringComparison.OrdinalIgnoreCase) || contentType.Equals("Posts", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnablePostsKey, "Posts");
        else if (contentType.Equals("Article", StringComparison.OrdinalIgnoreCase) || contentType.Equals("Articles", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableArticlesKey, "Articles");
        else if (contentType.Equals("Clip", StringComparison.OrdinalIgnoreCase) || contentType.Equals("Clips", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableClipsKey, "Clips");
        else if (contentType.Equals("Video", StringComparison.OrdinalIgnoreCase) || contentType.Equals("Videos", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableVideosKey, "Videos");
        else if (contentType.Equals("Podcast", StringComparison.OrdinalIgnoreCase) || contentType.Equals("Podcasts", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnablePodcastsKey, "Podcasts");
        else if (contentType.Equals("Wiki", StringComparison.OrdinalIgnoreCase))
            await _settingService.EnsureFeatureEnabledAsync(SystemSettingService.EnableWikiKey, "Wiki");
    }

    private bool IsAdmin()
    {
        return User.IsInRole(Roles.CommunityAdmin) ||
               User.IsInRole(Roles.HRAdmin) ||
               User.IsInRole(Roles.SystemAdmin);
    }

    [HttpPost("validate-security")]
    [ProducesResponseType(typeof(ApiResponse<ContentValidationResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ValidateSecurity([FromBody] ValidateContentRequestDto dto)
    {
        var result = await _interactionService.ValidateContentSecurityAsync(dto.Text, dto.Url);
        return Ok(ApiResponse<ContentValidationResultDto>.SuccessResponse(200, "Security validation completed successfully.", result));
    }

    [Authorize(Roles = $"{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin}")]
    [HttpPost("restricted-keywords")]
    [ProducesResponseType(typeof(ApiResponse<RestrictedKeywordItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddRestrictedKeyword([FromBody] AddRestrictedKeywordDto dto)
    {
        var result = await _interactionService.AddRestrictedKeywordAsync(dto.Keyword);
        return Ok(ApiResponse<RestrictedKeywordItemDto>.SuccessResponse(200, "Keyword added to restricted words database successfully.", result));
    }

    [AllowAnonymous]
    [HttpGet("restricted-keywords")]
    [ProducesResponseType(typeof(ApiResponse<List<RestrictedKeywordItemDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRestrictedKeywords()
    {
        var result = await _interactionService.GetAllRestrictedKeywordsAsync();
        return Ok(ApiResponse<List<RestrictedKeywordItemDto>>.SuccessResponse(200, "Restricted keywords retrieved successfully.", result));
    }

    [HttpGet("{contentType}/{contentId}/summary")]
    [ProducesResponseType(typeof(ApiResponse<ContentSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSummary(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var result = await _interactionService.GetContentSummaryAsync(contentType, contentId, GetCurrentUserId());
        return Ok(ApiResponse<ContentSummaryDto>.SuccessResponse(200, "Content summary retrieved successfully.", result));
    }

    [HttpGet("{contentType}/{contentId}/comments")]
    [ProducesResponseType(typeof(ApiResponse<List<CommentDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetComments(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var comments = await _interactionService.GetContentCommentsAsync(contentType, contentId, GetCurrentUserId());
        return Ok(ApiResponse<List<CommentDto>>.SuccessResponse(200, "Comments retrieved successfully.", comments));
    }

    [HttpPost("{contentType}/{contentId}/comments")]
    [ProducesResponseType(typeof(ApiResponse<CommentDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> AddComment(string contentType, long contentId, [FromBody] CreateCommentDto dto)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var comment = await _interactionService.AddCommentAsync(contentType, contentId, GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetComments), new { contentType, contentId }, ApiResponse<CommentDto>.SuccessResponse(201, "Comment added successfully.", comment));
    }

    [HttpPut("comments/{commentId}")]
    [ProducesResponseType(typeof(ApiResponse<CommentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateComment(long commentId, [FromBody] UpdateCommentDto dto)
    {
        var comment = await _interactionService.UpdateCommentAsync(commentId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<CommentDto>.SuccessResponse(200, "Comment updated successfully.", comment));
    }

    [HttpDelete("comments/{commentId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteComment(long commentId)
    {
        await _interactionService.DeleteCommentAsync(commentId, GetCurrentUserId(), IsAdmin());
        return Ok(ApiResponse.SuccessResponse(200, "Comment deleted successfully."));
    }

    [HttpGet("{contentType}/{contentId}/reactions")]
    [ProducesResponseType(typeof(ApiResponse<ReactionSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReactionsSummary(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var summary = await _interactionService.GetReactionsSummaryAsync(contentType, contentId, GetCurrentUserId());
        return Ok(ApiResponse<ReactionSummaryDto>.SuccessResponse(200, "Reactions summary retrieved successfully.", summary));
    }

    [HttpGet("{contentType}/{contentId}/reactions/list")]
    [ProducesResponseType(typeof(ApiResponse<List<ReactionDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReactionsList(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var list = await _interactionService.GetReactionsListAsync(contentType, contentId);
        return Ok(ApiResponse<List<ReactionDto>>.SuccessResponse(200, "Reactions list retrieved successfully.", list));
    }

    [HttpPost("{contentType}/{contentId}/react")]
    [ProducesResponseType(typeof(ApiResponse<ReactionSummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleReaction(string contentType, long contentId, [FromBody] ToggleReactionDto dto)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var result = await _interactionService.ToggleReactionAsync(contentType, contentId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<ReactionSummaryDto>.SuccessResponse(200, "Reaction updated successfully.", result.Summary));
    }

    [HttpPost("{contentType}/{contentId}/share")]
    [ProducesResponseType(typeof(ApiResponse<ShareDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> ShareContent(string contentType, long contentId, [FromBody] CreateShareDto dto)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var share = await _interactionService.ShareContentAsync(contentType, contentId, GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetSummary), new { contentType, contentId }, ApiResponse<ShareDto>.SuccessResponse(201, "Content shared successfully.", share));
    }

    [HttpGet("bookmarks/my")]
    [ProducesResponseType(typeof(ApiResponse<List<BookmarkDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyBookmarks()
    {
        var bookmarks = await _interactionService.GetMyBookmarksAsync(GetCurrentUserId());
        return Ok(ApiResponse<List<BookmarkDto>>.SuccessResponse(200, "Bookmarks retrieved successfully.", bookmarks));
    }

    [HttpGet("saved-content")]
    [ProducesResponseType(typeof(ApiResponse<PagedResponse<SavedContentItemDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSavedContent([FromQuery] SavedContentQueryDto query)
    {
        var enablePosts = await _settingService.GetEnablePostsAsync();
        var enableArticles = await _settingService.GetEnableArticlesAsync();
        var enableVideos = await _settingService.GetEnableVideosAsync();
        var enablePodcasts = await _settingService.GetEnablePodcastsAsync();
        var enableClips = await _settingService.GetEnableClipsAsync();

        if (query.ContentType?.Equals("Post", StringComparison.OrdinalIgnoreCase) == true && !enablePosts)
            return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", PagedResponse<SavedContentItemDto>.Create(new List<SavedContentItemDto>(), query.PageNumber, query.PageSize, 0)));
        if (query.ContentType?.Equals("Article", StringComparison.OrdinalIgnoreCase) == true && !enableArticles)
            return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", PagedResponse<SavedContentItemDto>.Create(new List<SavedContentItemDto>(), query.PageNumber, query.PageSize, 0)));
        if (query.ContentType?.Equals("Video", StringComparison.OrdinalIgnoreCase) == true && !enableVideos)
            return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", PagedResponse<SavedContentItemDto>.Create(new List<SavedContentItemDto>(), query.PageNumber, query.PageSize, 0)));
        if (query.ContentType?.Equals("Podcast", StringComparison.OrdinalIgnoreCase) == true && !enablePodcasts)
            return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", PagedResponse<SavedContentItemDto>.Create(new List<SavedContentItemDto>(), query.PageNumber, query.PageSize, 0)));
        if (query.ContentType?.Equals("Clip", StringComparison.OrdinalIgnoreCase) == true && !enableClips)
            return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", PagedResponse<SavedContentItemDto>.Create(new List<SavedContentItemDto>(), query.PageNumber, query.PageSize, 0)));

        var result = await _interactionService.GetSavedContentItemsAsync(GetCurrentUserId(), query);
        
        var filteredItems = result.Items.Where(item => {
            if (item.ContentType.Equals("Post", StringComparison.OrdinalIgnoreCase) && !enablePosts) return false;
            if (item.ContentType.Equals("Article", StringComparison.OrdinalIgnoreCase) && !enableArticles) return false;
            if (item.ContentType.Equals("Video", StringComparison.OrdinalIgnoreCase) && !enableVideos) return false;
            if (item.ContentType.Equals("Podcast", StringComparison.OrdinalIgnoreCase) && !enablePodcasts) return false;
            if (item.ContentType.Equals("Clip", StringComparison.OrdinalIgnoreCase) && !enableClips) return false;
            return true;
        }).ToList();

        var filteredPagedResponse = PagedResponse<SavedContentItemDto>.Create(filteredItems, result.PageNumber, result.PageSize, result.TotalCount - (result.Items.Count - filteredItems.Count));
        return Ok(ApiResponse<PagedResponse<SavedContentItemDto>>.SuccessResponse(200, "Saved content retrieved successfully.", filteredPagedResponse));
    }

    [HttpGet("saved-content/count")]
    [ProducesResponseType(typeof(ApiResponse<SavedContentCountDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSavedContentCount()
    {
        var enablePosts = await _settingService.GetEnablePostsAsync();
        var enableArticles = await _settingService.GetEnableArticlesAsync();
        var enableVideos = await _settingService.GetEnableVideosAsync();
        var enablePodcasts = await _settingService.GetEnablePodcastsAsync();

        var counts = await _interactionService.GetSavedContentCountsAsync(GetCurrentUserId());
        if (!enablePosts)
        {
            counts.TotalCount = Math.Max(0, counts.TotalCount - counts.PostsCount);
            counts.PostsCount = 0;
        }
        if (!enableArticles)
        {
            counts.TotalCount = Math.Max(0, counts.TotalCount - counts.ArticlesCount);
            counts.ArticlesCount = 0;
        }
        if (!enableVideos)
        {
            counts.TotalCount = Math.Max(0, counts.TotalCount - counts.VideosCount);
            counts.VideosCount = 0;
        }
        if (!enablePodcasts)
        {
            counts.TotalCount = Math.Max(0, counts.TotalCount - counts.PodcastsCount);
            counts.PodcastsCount = 0;
        }

        return Ok(ApiResponse<SavedContentCountDto>.SuccessResponse(200, "Saved content counts retrieved successfully.", counts));
    }

    [HttpGet("{contentType}/{contentId}/saved-status")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBookmarkStatus(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var isBookmarked = await _interactionService.GetBookmarkStatusAsync(contentType, contentId, GetCurrentUserId());
        return Ok(ApiResponse<object>.SuccessResponse(200, "Bookmark status retrieved.", new { isBookmarked }));
    }

    [HttpPost("{contentType}/{contentId}/bookmark")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleBookmark(string contentType, long contentId)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var isBookmarked = await _interactionService.ToggleBookmarkAsync(contentType, contentId, GetCurrentUserId());
        var message = isBookmarked ? "Content bookmarked successfully." : "Bookmark removed successfully.";
        return Ok(ApiResponse<object>.SuccessResponse(200, message, new { isBookmarked }));
    }

    [HttpPost("{contentType}/{contentId}/report")]
    [ProducesResponseType(typeof(ApiResponse<ModerationReportDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> ReportContent(string contentType, long contentId, [FromBody] CreateReportDto dto)
    {
        await EnsureContentTypeEnabledAsync(contentType);
        var report = await _interactionService.ReportContentAsync(contentType, contentId, GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetPendingReports), new { }, ApiResponse<ModerationReportDto>.SuccessResponse(201, "Content reported successfully.", report));
    }

    [Authorize(Roles = $"{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin}")]
    [HttpGet("reports")]
    [ProducesResponseType(typeof(ApiResponse<List<ModerationReportDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetReports([FromQuery] string? status = null, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 100)
    {
        var reports = await _interactionService.GetAllReportsAsync(status, pageNumber, pageSize);
        return Ok(ApiResponse<List<ModerationReportDto>>.SuccessResponse(200, "Moderation reports retrieved successfully.", reports));
    }

    [Authorize(Roles = $"{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin}")]
    [HttpGet("reports/pending")]
    [ProducesResponseType(typeof(ApiResponse<List<ModerationReportDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPendingReports([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var reports = await _interactionService.GetPendingReportsAsync(pageNumber, pageSize);
        return Ok(ApiResponse<List<ModerationReportDto>>.SuccessResponse(200, "Pending reports retrieved successfully.", reports));
    }

    [Authorize(Roles = $"{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin}")]
    [HttpPut("reports/{reportId}/resolve")]
    [ProducesResponseType(typeof(ApiResponse<ModerationReportDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ResolveReport(long reportId, [FromBody] ResolveReportDto dto)
    {
        var report = await _interactionService.ResolveReportAsync(reportId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<ModerationReportDto>.SuccessResponse(200, "Report resolved successfully.", report));
    }
}
