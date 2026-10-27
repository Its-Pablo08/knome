using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Interactions;

namespace Knome.API.Interfaces;

public interface IContentInteractionService
{
    // Security & Screening
    Task<ContentValidationResultDto> ValidateContentSecurityAsync(string? text, string? url = null);
    Task<RestrictedKeywordItemDto> AddRestrictedKeywordAsync(string keyword);
    Task<List<RestrictedKeywordItemDto>> GetAllRestrictedKeywordsAsync();

    // Comments
    Task<List<CommentDto>> GetContentCommentsAsync(string contentType, long contentId, int? currentUserId = null);
    Task<CommentDto> AddCommentAsync(string contentType, long contentId, int userId, CreateCommentDto dto);
    Task<CommentDto> UpdateCommentAsync(long commentId, int userId, UpdateCommentDto dto);
    Task DeleteCommentAsync(long commentId, int userId, bool isAdmin = false);

    // Reactions
    Task<(ReactionSummaryDto Summary, bool IsCreated)> ToggleReactionAsync(string contentType, long contentId, int userId, ToggleReactionDto dto);
    Task<ReactionSummaryDto> GetReactionsSummaryAsync(string contentType, long contentId, int currentUserId);
    Task<List<ReactionDto>> GetReactionsListAsync(string contentType, long contentId);

    // Shares
    Task<ShareDto> ShareContentAsync(string contentType, long contentId, int userId, CreateShareDto dto);

    // Bookmarks & Saved Content
    Task<bool> ToggleBookmarkAsync(string contentType, long contentId, int userId);
    Task<List<BookmarkDto>> GetMyBookmarksAsync(int userId);
    Task<Responses.PagedResponse<SavedContentItemDto>> GetSavedContentItemsAsync(int userId, SavedContentQueryDto query);
    Task<SavedContentCountDto> GetSavedContentCountsAsync(int userId);
    Task<bool> GetBookmarkStatusAsync(string contentType, long contentId, int userId);

    // Polymorphic Content Engagement Summary
    Task<ContentSummaryDto> GetContentSummaryAsync(string contentType, long contentId, int currentUserId);
    Task<Dictionary<long, ContentSummaryDto>> GetContentSummariesBatchAsync(string contentType, IEnumerable<long> contentIds, int currentUserId);

    // Moderation & Governance
    Task<ModerationReportDto> ReportContentAsync(string contentType, long contentId, int reporterUserId, CreateReportDto dto);
    Task<List<ModerationReportDto>> GetPendingReportsAsync(int pageNumber, int pageSize);
    Task<List<ModerationReportDto>> GetAllReportsAsync(string? status, int pageNumber, int pageSize);
    Task<ModerationReportDto?> GetReportByIdAsync(long reportId);
    Task<ModerationReportDto> ResolveReportAsync(long reportId, int moderatorUserId, ResolveReportDto dto);

    // Unique View Resolution
    Task<long> RecordViewAsync(string contentType, long contentId, int userId);
    Task<bool> HasUserViewedAsync(string contentType, long contentId, int userId);
}
