using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Interactions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class ContentInteractionRepository : IContentInteractionRepository
{
    private readonly KnomeDbContext _db;

    public ContentInteractionRepository(KnomeDbContext db)
    {
        _db = db;
    }

    // --- Comments ---
    public async Task<List<Comment>> GetTopLevelCommentsAsync(string contentType, long contentId)
    {
        return await _db.Comments
            .Include(c => c.User)
            .Include(c => c.InverseParentComment)
            .Where(c => c.ContentType == contentType && c.ContentId == contentId && c.ParentCommentId == null)
            .OrderByDescending(c => c.CreatedDate)
            .ToListAsync();
    }

    public async Task<List<Comment>> GetRepliesAsync(long parentCommentId)
    {
        return await _db.Comments
            .Include(c => c.User)
            .Where(c => c.ParentCommentId == parentCommentId)
            .OrderBy(c => c.CreatedDate)
            .ToListAsync();
    }

    public async Task<Comment?> GetCommentByIdAsync(long commentId)
    {
        return await _db.Comments
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.CommentId == commentId);
    }

    public async Task<Comment> AddCommentAsync(Comment comment)
    {
        _db.Comments.Add(comment);
        await _db.SaveChangesAsync();
        return comment;
    }

    public async Task UpdateCommentAsync(Comment comment)
    {
        _db.Comments.Update(comment);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteCommentAsync(Comment comment)
    {
        _db.Comments.Remove(comment);
        await _db.SaveChangesAsync();
    }

    public async Task<long> GetCommentsCountAsync(string contentType, long contentId)
    {
        return await _db.Comments
            .Where(c => c.ContentType == contentType && c.ContentId == contentId)
            .CountAsync();
    }

    // --- Reactions ---
    public async Task<Reaction?> GetUserReactionAsync(string contentType, long contentId, int userId)
    {
        return await _db.Reactions
            .FirstOrDefaultAsync(r => r.ContentType == contentType && r.ContentId == contentId && r.UserId == userId);
    }

    public async Task<Reaction> AddReactionAsync(Reaction reaction)
    {
        _db.Reactions.Add(reaction);
        await _db.SaveChangesAsync();
        return reaction;
    }

    public async Task RemoveReactionAsync(Reaction reaction)
    {
        _db.Reactions.Remove(reaction);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateReactionAsync(Reaction reaction)
    {
        _db.Reactions.Update(reaction);
        await _db.SaveChangesAsync();
    }

    public async Task<ReactionSummaryDto> GetReactionsSummaryAsync(string contentType, long contentId, int currentUserId)
    {
        var reactions = await _db.Reactions
            .Include(r => r.User)
            .Where(r => r.ContentType == contentType && r.ContentId == contentId)
            .OrderByDescending(r => r.CreatedDate)
            .ToListAsync();

        var summary = new ReactionSummaryDto
        {
            TotalCount = reactions.Count,
            LikeCount = reactions.Count(r => r.ReactionType == ReactionTypes.Like),
            CelebrateCount = reactions.Count(r => r.ReactionType == ReactionTypes.Celebrate),
            SupportCount = reactions.Count(r => r.ReactionType == ReactionTypes.Support),
            HeartCount = reactions.Count(r => r.ReactionType == ReactionTypes.Heart),
            CurrentUserReactionType = reactions.FirstOrDefault(r => r.UserId == currentUserId)?.ReactionType,
            TopReactionTypes = reactions.Select(r => r.ReactionType).Distinct().ToList(),
            Reactions = reactions.Select(r => new ReactionDto
            {
                ReactionId = r.ReactionId,
                ContentType = r.ContentType,
                ContentId = r.ContentId,
                UserId = r.UserId,
                UserFullName = r.User != null ? (r.User.FullName ?? r.User.Email ?? "Colleague") : "Colleague",
                UserDesignation = r.User?.Designation,
                UserProfilePhotoUrl = r.User?.ProfilePhotoUrl,
                ReactionType = r.ReactionType,
                CreatedDate = r.CreatedDate
            }).ToList()
        };

        return summary;
    }

    public async Task<List<Reaction>> GetReactionsAsync(string contentType, long contentId)
    {
        return await _db.Reactions
            .Include(r => r.User)
            .Where(r => r.ContentType == contentType && r.ContentId == contentId)
            .OrderByDescending(r => r.CreatedDate)
            .ToListAsync();
    }

    // --- Shares ---
    public async Task<Share> AddShareAsync(Share share)
    {
        _db.Shares.Add(share);
        await _db.SaveChangesAsync();
        return share;
    }

    public async Task<long> GetSharesCountAsync(string contentType, long contentId)
    {
        return await _db.Shares
            .Where(s => s.ContentType == contentType && s.ContentId == contentId)
            .CountAsync();
    }

    // --- Bookmarks ---
    public async Task<Bookmark?> GetBookmarkAsync(string contentType, long contentId, int userId)
    {
        return await _db.Bookmarks
            .FirstOrDefaultAsync(b => b.ContentType == contentType && b.ContentId == contentId && b.UserId == userId);
    }

    public async Task<Bookmark> AddBookmarkAsync(Bookmark bookmark)
    {
        _db.Bookmarks.Add(bookmark);
        await _db.SaveChangesAsync();
        return bookmark;
    }

    public async Task RemoveBookmarkAsync(Bookmark bookmark)
    {
        _db.Bookmarks.Remove(bookmark);
        await _db.SaveChangesAsync();
    }

    public async Task<List<Bookmark>> GetUserBookmarksAsync(int userId)
    {
        return await _db.Bookmarks
            .Include(b => b.User)
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.SavedDate)
            .ToListAsync();
    }

    public async Task<(List<SavedContentItemDto> Items, int TotalCount)> GetHydratedUserBookmarksAsync(int userId, SavedContentQueryDto query)
    {
        var bookmarksQuery = _db.Bookmarks.Where(b => b.UserId == userId);

        if (!string.IsNullOrWhiteSpace(query.ContentType) && !query.ContentType.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            var targetType = query.ContentType.Trim();
            if (targetType.Equals("Posts", StringComparison.OrdinalIgnoreCase)) targetType = "Post";
            else if (targetType.Equals("Articles", StringComparison.OrdinalIgnoreCase)) targetType = "Article";
            else if (targetType.Equals("Videos", StringComparison.OrdinalIgnoreCase)) targetType = "Video";
            else if (targetType.Equals("Podcasts", StringComparison.OrdinalIgnoreCase)) targetType = "Podcast";
            else if (targetType.Equals("Documents", StringComparison.OrdinalIgnoreCase)) targetType = "Document";

            bookmarksQuery = bookmarksQuery.Where(b => b.ContentType.ToLower() == targetType.ToLower());
        }

        var rawBookmarks = await bookmarksQuery.OrderByDescending(b => b.SavedDate).ToListAsync();
        var items = new List<SavedContentItemDto>();

        foreach (var b in rawBookmarks)
        {
            var item = new SavedContentItemDto
            {
                UserId = b.UserId,
                ContentType = b.ContentType,
                ContentId = b.ContentId,
                SavedDate = b.SavedDate,
                IsAvailable = true
            };

            var normalizedType = b.ContentType.Trim();
            if (normalizedType.Equals("Post", StringComparison.OrdinalIgnoreCase))
            {
                var post = await _db.Posts.Include(p => p.AuthorUser).FirstOrDefaultAsync(p => p.PostId == b.ContentId);
                if (post == null)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Post has been deleted or is unavailable.";
                    item.Title = "Deleted Post";
                }
                else
                {
                    item.Title = post.ContentText.Length > 60 ? post.ContentText.Substring(0, 60) + "..." : post.ContentText;
                    item.Summary = post.ContentText;
                    item.AuthorId = post.AuthorUserId;
                    item.AuthorName = post.AuthorUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = post.AuthorUser?.ProfilePhotoUrl;
                    item.AuthorRole = post.AuthorUser?.Designation;
                    item.CreatedAt = post.CreatedDate;
                    item.TargetUrl = "/posts";
                    item.LikesCount = await _db.Reactions.CountAsync(r => r.ContentType == "Post" && r.ContentId == post.PostId);
                    item.CommentsCount = await _db.Comments.CountAsync(c => c.ContentType == "Post" && c.ContentId == post.PostId);
                }
            }
            else if (normalizedType.Equals("Article", StringComparison.OrdinalIgnoreCase))
            {
                var article = await _db.Articles.Include(a => a.AuthorUser).Include(a => a.ArticleAttachments).FirstOrDefaultAsync(a => a.ArticleId == b.ContentId);
                if (article == null)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Article has been deleted or is unavailable.";
                    item.Title = "Deleted Article";
                }
                else
                {
                    item.Title = article.Title;
                    item.Summary = article.Description ?? article.ContentHtml;
                    item.ThumbnailUrl = article.ArticleAttachments.FirstOrDefault()?.FileUrl;
                    item.AuthorId = article.AuthorUserId;
                    item.AuthorName = article.AuthorUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = article.AuthorUser?.ProfilePhotoUrl;
                    item.AuthorRole = article.AuthorUser?.Designation;
                    item.CreatedAt = article.CreatedDate;
                    item.TargetUrl = $"/article-view?id={article.ArticleId}";
                    item.LikesCount = await _db.Reactions.CountAsync(r => r.ContentType == "Article" && r.ContentId == article.ArticleId);
                    item.CommentsCount = await _db.Comments.CountAsync(c => c.ContentType == "Article" && c.ContentId == article.ArticleId);
                }
            }
            else if (normalizedType.Equals("Video", StringComparison.OrdinalIgnoreCase))
            {
                var video = await _db.Videos.Include(v => v.UploaderUser).FirstOrDefaultAsync(v => v.VideoId == b.ContentId);
                if (video == null)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Video has been deleted or is unavailable.";
                    item.Title = "Deleted Video";
                }
                else
                {
                    item.Title = video.Title;
                    item.Summary = video.Description ?? string.Empty;
                    item.ThumbnailUrl = video.ThumbnailUrl ?? video.SourceUrl;
                    item.AuthorId = video.UploaderUserId;
                    item.AuthorName = video.UploaderUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = video.UploaderUser?.ProfilePhotoUrl;
                    item.AuthorRole = video.UploaderUser?.Designation;
                    item.CreatedAt = video.UploadedDate;
                    item.TargetUrl = "/videos";
                    item.LikesCount = await _db.Reactions.CountAsync(r => r.ContentType == "Video" && r.ContentId == video.VideoId);
                    item.CommentsCount = await _db.Comments.CountAsync(c => c.ContentType == "Video" && c.ContentId == video.VideoId);
                }
            }
            else if (normalizedType.Equals("Podcast", StringComparison.OrdinalIgnoreCase))
            {
                var podcast = await _db.Podcasts.Include(p => p.UploaderUser).FirstOrDefaultAsync(p => p.PodcastId == b.ContentId);
                if (podcast == null || !podcast.IsActive)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Podcast has been deleted or is unavailable.";
                    item.Title = "Deleted Podcast";
                }
                else
                {
                    item.Title = podcast.Title;
                    item.Summary = podcast.Description ?? string.Empty;
                    item.ThumbnailUrl = podcast.CoverImageUrl;
                    item.AuthorId = podcast.UploaderUserId;
                    item.AuthorName = podcast.UploaderUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = podcast.UploaderUser?.ProfilePhotoUrl;
                    item.AuthorRole = podcast.UploaderUser?.Designation;
                    item.CreatedAt = podcast.UploadedDate;
                    item.TargetUrl = "/podcasts";
                    item.LikesCount = await _db.Reactions.CountAsync(r => r.ContentType == "Podcast" && r.ContentId == podcast.PodcastId);
                    item.CommentsCount = await _db.Comments.CountAsync(c => c.ContentType == "Podcast" && c.ContentId == podcast.PodcastId);
                }
            }
            else if (normalizedType.Equals("Document", StringComparison.OrdinalIgnoreCase) || normalizedType.Equals("Job", StringComparison.OrdinalIgnoreCase))
            {
                var job = await _db.Jobs.Include(j => j.PostedByUser).FirstOrDefaultAsync(j => j.JobId == (int)b.ContentId);
                if (job == null)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Document/Job has been deleted or is unavailable.";
                    item.Title = "Deleted Document";
                }
                else
                {
                    item.Title = job.Title;
                    item.Summary = job.Description;
                    item.AuthorId = job.PostedByUserId;
                    item.AuthorName = job.PostedByUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = job.PostedByUser?.ProfilePhotoUrl;
                    item.AuthorRole = job.PostedByUser?.Designation;
                    item.CreatedAt = job.PostedDate;
                    item.TargetUrl = "/jobs";
                }
            }
            else if (normalizedType.Equals("Clip", StringComparison.OrdinalIgnoreCase))
            {
                var clip = await _db.Clips.Include(c => c.CreatedByUser).FirstOrDefaultAsync(c => c.ClipId == b.ContentId);
                if (clip == null || clip.IsDeleted)
                {
                    item.IsAvailable = false;
                    item.UnavailabilityReason = "Clip has been deleted or is unavailable.";
                    item.Title = "Deleted Clip";
                }
                else
                {
                    item.Title = clip.Title;
                    item.Summary = clip.Description ?? clip.Hashtags ?? string.Empty;
                    item.ThumbnailUrl = clip.ThumbnailUrl ?? clip.VideoUrl;
                    item.AuthorId = clip.CreatedByUserId;
                    item.AuthorName = clip.CreatedByUser?.FullName ?? string.Empty;
                    item.AuthorAvatar = clip.CreatedByUser?.ProfilePhotoUrl;
                    item.AuthorRole = clip.CreatedByUser?.Designation;
                    item.CreatedAt = clip.CreatedDate;
                    item.TargetUrl = $"/clips?id={clip.ClipId}";
                    item.LikesCount = clip.LikesCount;
                    item.CommentsCount = clip.CommentsCount;
                }
            }

            items.Add(item);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            items = items.Where(i => i.Title.ToLower().Contains(search) || i.Summary.ToLower().Contains(search) || i.AuthorName.ToLower().Contains(search)).ToList();
        }

        if (query.SortBy.Equals("OldestSaved", StringComparison.OrdinalIgnoreCase))
        {
            items = items.OrderBy(i => i.SavedDate).ToList();
        }
        else if (query.SortBy.Equals("RecentlyUpdated", StringComparison.OrdinalIgnoreCase))
        {
            items = items.OrderByDescending(i => i.UpdatedAt ?? i.SavedDate).ToList();
        }
        else
        {
            items = items.OrderByDescending(i => i.SavedDate).ToList();
        }

        int totalCount = items.Count;
        int pageNumber = query.PageNumber < 1 ? 1 : query.PageNumber;
        int pageSize = query.PageSize < 1 ? 20 : query.PageSize;

        var pagedItems = items.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();

        return (pagedItems, totalCount);
    }

    public async Task<SavedContentCountDto> GetSavedContentCountsAsync(int userId)
    {
        var bookmarks = await _db.Bookmarks.Where(b => b.UserId == userId).ToListAsync();
        return new SavedContentCountDto
        {
            TotalCount = bookmarks.Count,
            PostsCount = bookmarks.Count(b => b.ContentType.Equals("Post", StringComparison.OrdinalIgnoreCase)),
            ArticlesCount = bookmarks.Count(b => b.ContentType.Equals("Article", StringComparison.OrdinalIgnoreCase)),
            VideosCount = bookmarks.Count(b => b.ContentType.Equals("Video", StringComparison.OrdinalIgnoreCase)),
            PodcastsCount = bookmarks.Count(b => b.ContentType.Equals("Podcast", StringComparison.OrdinalIgnoreCase)),
            DocumentsCount = bookmarks.Count(b => b.ContentType.Equals("Document", StringComparison.OrdinalIgnoreCase) || b.ContentType.Equals("Job", StringComparison.OrdinalIgnoreCase))
        };
    }

    // --- Moderation Reports ---
    public async Task<ModerationReport> AddReportAsync(ModerationReport report)
    {
        _db.ModerationReports.Add(report);
        await _db.SaveChangesAsync();
        return report;
    }

    public async Task<ModerationReport?> GetReportByIdAsync(long reportId)
    {
        return await _db.ModerationReports
            .Include(m => m.ReporterUser)
            .Include(m => m.ModeratorUser)
            .FirstOrDefaultAsync(m => m.ReportId == reportId);
    }

    public async Task<List<ModerationReport>> GetPendingReportsAsync(int pageNumber, int pageSize)
    {
        return await _db.ModerationReports
            .Include(m => m.ReporterUser)
            .Include(m => m.ModeratorUser)
            .Where(m => m.Status == ReportStatuses.Pending || m.Status == ReportStatuses.UnderReview)
            .OrderByDescending(m => m.ReportedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<ModerationReport>> GetAllReportsAsync(string? status, int pageNumber, int pageSize)
    {
        var query = _db.ModerationReports
            .Include(m => m.ReporterUser)
            .Include(m => m.ModeratorUser)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (status.Equals("Pending", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(m => m.Status == ReportStatuses.Pending || m.Status == ReportStatuses.UnderReview);
            }
            else if (status.Equals("Resolved", StringComparison.OrdinalIgnoreCase) || status.Equals("Action Taken", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(m => m.Status == ReportStatuses.Resolved || m.Status == "Action Taken" || m.Status == "Resolved");
            }
            else if (status.Equals("Reviewed", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(m => m.Status == "Reviewed" || m.Status == ReportStatuses.Dismissed);
            }
            else if (status.Equals("Dismissed", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(m => m.Status == ReportStatuses.Dismissed || m.Status == "Dismissed");
            }
            else
            {
                query = query.Where(m => m.Status == status);
            }
        }

        return await query
            .OrderByDescending(m => m.ReportedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task UpdateReportAsync(ModerationReport report)
    {
        _db.ModerationReports.Update(report);
        await _db.SaveChangesAsync();
    }

    // --- Security Screening ---
    public async Task<List<BlockedUrl>> GetAllBlockedUrlsAsync()
    {
        return await _db.BlockedUrls.AsNoTracking().ToListAsync();
    }

    public async Task<List<RestrictedKeyword>> GetAllRestrictedKeywordsAsync()
    {
        return await _db.RestrictedKeywords.AsNoTracking().ToListAsync();
    }

    public async Task<RestrictedKeyword> AddRestrictedKeywordAsync(string keyword)
    {
        var trimmed = keyword.Trim().ToLowerInvariant();
        var existing = await _db.RestrictedKeywords
            .FirstOrDefaultAsync(k => k.Keyword.ToLower() == trimmed);
        if (existing != null)
        {
            return existing;
        }

        var entity = new RestrictedKeyword { Keyword = trimmed };
        await _db.RestrictedKeywords.AddAsync(entity);
        await _db.SaveChangesAsync();
        return entity;
    }

    // Author resolution (for notification targeting)
    public async Task<int?> GetContentAuthorUserIdAsync(string contentType, long contentId)
    {
        var norm = ContentTypes.Normalize(contentType);
        return norm switch
        {
            ContentTypes.Post => await _db.Posts.Where(p => p.PostId == contentId).Select(p => (int?)p.AuthorUserId).FirstOrDefaultAsync(),
            ContentTypes.Article => await _db.Articles.Where(a => a.ArticleId == contentId).Select(a => (int?)a.AuthorUserId).FirstOrDefaultAsync(),
            ContentTypes.Video => await _db.Videos.Where(v => v.VideoId == contentId).Select(v => (int?)v.UploaderUserId).FirstOrDefaultAsync(),
            ContentTypes.Podcast => await _db.Podcasts.Where(p => p.PodcastId == contentId).Select(p => (int?)p.UploaderUserId).FirstOrDefaultAsync(),
            ContentTypes.Job => await _db.Jobs.Where(j => j.JobId == (int)contentId).Select(j => (int?)j.PostedByUserId).FirstOrDefaultAsync(),
            ContentTypes.Comment => await _db.Comments.Where(c => c.CommentId == contentId).Select(c => (int?)c.UserId).FirstOrDefaultAsync(),
            ContentTypes.Clip => await _db.Clips.Where(c => c.ClipId == contentId).Select(c => (int?)c.CreatedByUserId).FirstOrDefaultAsync(),
            _ => null
        };
    }

    public async Task<long> GetContentViewCountAsync(string contentType, long contentId)
    {
        var norm = ContentTypes.Normalize(contentType);
        if (norm == ContentTypes.Post)
        {
            var post = await _db.Posts.AsNoTracking().FirstOrDefaultAsync(p => p.PostId == contentId);
            return post?.ViewCount ?? 0;
        }
        else if (norm == ContentTypes.Video)
        {
            var video = await _db.Videos.AsNoTracking().FirstOrDefaultAsync(v => v.VideoId == contentId);
            return video?.ViewCount ?? 0;
        }
        else if (norm == ContentTypes.Article)
        {
            var article = await _db.Articles.AsNoTracking().FirstOrDefaultAsync(a => a.ArticleId == contentId);
            return article?.ViewCount ?? 0;
        }
        else if (norm == ContentTypes.Podcast)
        {
            var podcast = await _db.Podcasts.AsNoTracking().FirstOrDefaultAsync(p => p.PodcastId == contentId);
            return podcast?.ViewCount ?? 0;
        }
        else if (norm == ContentTypes.Clip)
        {
            var clip = await _db.Clips.AsNoTracking().FirstOrDefaultAsync(c => c.ClipId == contentId);
            return clip?.ViewCount ?? 0;
        }
        return 0;
    }

    public async Task<bool> HasUserViewedAsync(string contentType, long contentId, int userId)
    {
        if (userId <= 0) return false;
        var norm = ContentTypes.Normalize(contentType);
        return await _db.ContentViews.AnyAsync(cv => cv.ContentType == norm && cv.ContentId == contentId && cv.UserId == userId);
    }

    public async Task<long> RecordUniqueViewAsync(string contentType, long contentId, int userId)
    {
        var norm = ContentTypes.Normalize(contentType);

        // 1. If valid userId, check if user already viewed this content
        if (userId > 0)
        {
            var alreadyViewed = await _db.ContentViews
                .AnyAsync(cv => cv.ContentType == norm && cv.ContentId == contentId && cv.UserId == userId);

            if (alreadyViewed)
            {
                // User has already viewed: strictly return existing view count without incrementing
                return await GetContentViewCountAsync(norm, contentId);
            }

            // Record the unique view
            try
            {
                _db.ContentViews.Add(new ContentView
                {
                    ContentType = norm,
                    ContentId = contentId,
                    UserId = userId,
                    ViewedDate = DateTime.UtcNow
                });
            }
            catch
            {
                // Handled gracefully in case of race condition
            }
        }

        // 2. Increment view count on the corresponding entity
        long newCount = 0;
        if (norm == ContentTypes.Post)
        {
            var post = await _db.Posts.FindAsync(contentId);
            if (post != null)
            {
                post.ViewCount++;
                newCount = post.ViewCount;
            }
        }
        else if (norm == ContentTypes.Article)
        {
            var article = await _db.Articles.FindAsync(contentId);
            if (article != null)
            {
                article.ViewCount++;
                article.UniqueReadCount++;
                newCount = article.ViewCount;
            }
        }
        else if (norm == ContentTypes.Video)
        {
            var video = await _db.Videos.FindAsync(contentId);
            if (video != null)
            {
                video.ViewCount++;
                newCount = video.ViewCount;
            }
        }
        else if (norm == ContentTypes.Podcast)
        {
            var podcast = await _db.Podcasts.FindAsync(contentId);
            if (podcast != null)
            {
                podcast.ViewCount++;
                newCount = podcast.ViewCount;
            }
        }
        else if (norm == ContentTypes.Clip)
        {
            var clip = await _db.Clips.FindAsync(contentId);
            if (clip != null)
            {
                clip.ViewCount++;
                newCount = clip.ViewCount;
            }
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Unique constraint hit concurrently — return current authoritative view count
            return await GetContentViewCountAsync(norm, contentId);
        }

        return newCount > 0 ? newCount : await GetContentViewCountAsync(norm, contentId);
    }
}
