using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Interactions;
using Knome.API.Models;

namespace Knome.API.Interfaces;

public interface IContentInteractionRepository
{
    // Comments
    Task<List<Comment>> GetTopLevelCommentsAsync(string contentType, long contentId);
    Task<List<Comment>> GetRepliesAsync(long parentCommentId);
    Task<Comment?> GetCommentByIdAsync(long commentId);
    Task<Comment> AddCommentAsync(Comment comment);
    Task UpdateCommentAsync(Comment comment);
    Task DeleteCommentAsync(Comment comment);
    Task<long> GetCommentsCountAsync(string contentType, long contentId);

    // Reactions
    Task<Reaction?> GetUserReactionAsync(string contentType, long contentId, int userId);
    Task<Reaction> AddReactionAsync(Reaction reaction);
    Task RemoveReactionAsync(Reaction reaction);
    Task UpdateReactionAsync(Reaction reaction);
    Task<ReactionSummaryDto> GetReactionsSummaryAsync(string contentType, long contentId, int currentUserId);
    Task<List<Reaction>> GetReactionsAsync(string contentType, long contentId);

    // Shares
    Task<Share> AddShareAsync(Share share);
    Task<long> GetSharesCountAsync(string contentType, long contentId);
    Task<bool> HasUserSharedAsync(string contentType, long contentId, int userId);

    // Bookmarks
    Task<Bookmark?> GetBookmarkAsync(string contentType, long contentId, int userId);
    Task<Bookmark> AddBookmarkAsync(Bookmark bookmark);
    Task RemoveBookmarkAsync(Bookmark bookmark);
    Task<List<Bookmark>> GetUserBookmarksAsync(int userId);
    Task<(List<SavedContentItemDto> Items, int TotalCount)> GetHydratedUserBookmarksAsync(int userId, SavedContentQueryDto query);
    Task<SavedContentCountDto> GetSavedContentCountsAsync(int userId);

    // Moderation Reports
    Task<ModerationReport> AddReportAsync(ModerationReport report);
    Task<ModerationReport?> GetReportByIdAsync(long reportId);
    Task<List<ModerationReport>> GetPendingReportsAsync(int pageNumber, int pageSize);
    Task<List<ModerationReport>> GetAllReportsAsync(string? status, int pageNumber, int pageSize);
    Task UpdateReportAsync(ModerationReport report);

    // Security Screening
    Task<List<BlockedUrl>> GetAllBlockedUrlsAsync();
    Task<List<RestrictedKeyword>> GetAllRestrictedKeywordsAsync();
    Task<RestrictedKeyword> AddRestrictedKeywordAsync(string keyword);

    // Author resolution (for notification targeting)
    Task<int?> GetContentAuthorUserIdAsync(string contentType, long contentId);

    // View count resolution & unique tracking
    Task<long> GetContentViewCountAsync(string contentType, long contentId);
    Task<bool> HasUserViewedAsync(string contentType, long contentId, int userId);
    Task<long> RecordUniqueViewAsync(string contentType, long contentId, int userId);
}
