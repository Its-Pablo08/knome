using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Common;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Interactions;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;

using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Knome.API.Hubs;

namespace Knome.API.Services;

public class ContentInteractionService : IContentInteractionService
{
    private readonly IContentInteractionRepository _repo;
    private readonly IUserRepository _userRepo;
    private readonly IKarmaService _karmaService;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly INotificationService _notificationService;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ICommunityRepository _communityRepo;
    private readonly KnomeDbContext _db;
    private readonly ILogger<ContentInteractionService> _logger;

    public ContentInteractionService(
        IContentInteractionRepository repo, 
        IUserRepository userRepo,
        IKarmaService karmaService, 
        IMapper mapper, 
        ISuspensionGuard suspensionGuard, 
        INotificationService notificationService,
        IHubContext<NotificationHub> hubContext,
        ICommunityRepository communityRepo,
        KnomeDbContext db,
        ILogger<ContentInteractionService> logger)
    {
        _repo = repo;
        _userRepo = userRepo;
        _karmaService = karmaService;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _notificationService = notificationService;
        _hubContext = hubContext;
        _communityRepo = communityRepo;
        _db = db;
        _logger = logger;
    }

    // --- Security & Screening (FR-SM-01) ---
    public async Task<ContentValidationResultDto> ValidateContentSecurityAsync(string? text, string? url = null)
    {
        var result = new ContentValidationResultDto { IsValid = true };

        var blockedUrls = await _repo.GetAllBlockedUrlsAsync();
        var restrictedKeywords = await _repo.GetAllRestrictedKeywordsAsync();

        var combinedText = $"{text} {url}".Trim();
        if (string.IsNullOrEmpty(combinedText))
            return result;

        foreach (var bUrl in blockedUrls)
        {
            if (!string.IsNullOrWhiteSpace(bUrl.UrlPattern) &&
                combinedText.Contains(bUrl.UrlPattern, StringComparison.OrdinalIgnoreCase))
            {
                result.IsValid = false;
                result.BlockedUrlsFound.Add(bUrl.UrlPattern);
            }
        }

        foreach (var rKeyword in restrictedKeywords)
        {
            if (!string.IsNullOrWhiteSpace(rKeyword.Keyword))
            {
                var pattern = $@"\b{Regex.Escape(rKeyword.Keyword)}\b";
                if (Regex.IsMatch(combinedText, pattern, RegexOptions.IgnoreCase))
                {
                    result.IsValid = false;
                    result.RestrictedKeywordsFound.Add(rKeyword.Keyword);
                }
            }
        }

        return result;
    }

    public async Task<RestrictedKeywordItemDto> AddRestrictedKeywordAsync(string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword))
            throw new BadRequestException("Restricted keyword cannot be empty.");

        var entity = await _repo.AddRestrictedKeywordAsync(keyword.Trim());
        return new RestrictedKeywordItemDto
        {
            KeywordId = entity.KeywordId,
            Keyword = entity.Keyword
        };
    }

    public async Task<List<RestrictedKeywordItemDto>> GetAllRestrictedKeywordsAsync()
    {
        var list = await _repo.GetAllRestrictedKeywordsAsync();
        return list.Select(k => new RestrictedKeywordItemDto
        {
            KeywordId = k.KeywordId,
            Keyword = k.Keyword
        }).ToList();
    }

    private void ValidateContentType(string contentType)
    {
        if (!ContentTypes.IsValid(contentType))
            throw new BadRequestException($"Invalid content type '{contentType}'. Must be one of: {string.Join(", ", ContentTypes.All)}.");
    }

    private async Task<List<CommentDto>> BuildRepliesTreeAsync(long parentCommentId)
    {
        var replies = await _repo.GetRepliesAsync(parentCommentId);
        var replyDtos = new List<CommentDto>();

        foreach (var reply in replies)
        {
            var dto = _mapper.Map<CommentDto>(reply);
            dto.Replies = await BuildRepliesTreeAsync(reply.CommentId);
            dto.RepliesCount = dto.Replies.Count;
            replyDtos.Add(dto);
        }

        return replyDtos;
    }

    // --- Comments (FR-CI-02, FR-CI-05) ---
    public async Task<List<CommentDto>> GetContentCommentsAsync(string contentType, long contentId, int? currentUserId = null)
    {
        ValidateContentType(contentType);

        var topLevelComments = await _repo.GetTopLevelCommentsAsync(contentType, contentId);
        var dtos = new List<CommentDto>();

        foreach (var comment in topLevelComments)
        {
            var dto = _mapper.Map<CommentDto>(comment);
            dto.Replies = await BuildRepliesTreeAsync(comment.CommentId);
            dto.RepliesCount = dto.Replies.Count;
            dtos.Add(dto);
        }

        // Populate LikesCount and IsLiked for all comments and nested replies
        var allDtos = new List<CommentDto>();
        void CollectDtos(IEnumerable<CommentDto> list)
        {
            foreach (var item in list)
            {
                allDtos.Add(item);
                if (item.Replies != null && item.Replies.Count > 0)
                    CollectDtos(item.Replies);
            }
        }
        CollectDtos(dtos);

        if (allDtos.Count > 0)
        {
            var commentIds = allDtos.Select(c => c.CommentId).Distinct().ToList();
            var reactions = await _db.Reactions
                .AsNoTracking()
                .Where(r => r.ContentType == ContentTypes.Comment && commentIds.Contains(r.ContentId))
                .Select(r => new { r.ContentId, r.UserId, r.ReactionType })
                .ToListAsync();

            foreach (var item in allDtos)
            {
                var commentReactions = reactions.Where(r => r.ContentId == item.CommentId).ToList();
                item.LikesCount = commentReactions.Count;
                item.IsLiked = currentUserId.HasValue && commentReactions.Any(r => r.UserId == currentUserId.Value);
                item.UserReactionType = currentUserId.HasValue 
                    ? commentReactions.FirstOrDefault(r => r.UserId == currentUserId.Value)?.ReactionType 
                    : null;
                item.TopReactionTypes = commentReactions
                    .Select(r => r.ReactionType)
                    .Where(t => !string.IsNullOrEmpty(t))
                    .Distinct()
                    .Take(4)
                    .ToList();
            }
        }

        return dtos;
    }

    public async Task<CommentDto> AddCommentAsync(string contentType, long contentId, int userId, CreateCommentDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);
        ValidateContentType(contentType);

        var securityCheck = await ValidateContentSecurityAsync(dto.CommentText, dto.ImageUrl);
        if (!securityCheck.IsValid)
            throw new BadRequestException("Comment contains blocked URLs or restricted keywords.");

        if (dto.ParentCommentId.HasValue)
        {
            var parent = await _repo.GetCommentByIdAsync(dto.ParentCommentId.Value);
            if (parent == null || parent.ContentType != contentType || parent.ContentId != contentId)
                throw new NotFoundException($"Parent comment ID {dto.ParentCommentId.Value} not found for this content.");
        }

        var comment = new Comment
        {
            ContentType = contentType,
            ContentId = contentId,
            UserId = userId,
            ParentCommentId = dto.ParentCommentId,
            CommentText = dto.CommentText,
            ImageUrl = dto.ImageUrl,
            CreatedDate = KnomeTime.Now
        };

        var saved = await _repo.AddCommentAsync(comment);

        // Award karma to the user who added the comment
        await _karmaService.AwardKarmaAsync(userId, KarmaActivityTypes.AddComment, KarmaPoints.AddCommentPoints, contentType, contentId);

        var commenter = await _userRepo.GetByIdAsync(userId);
        var commenterName = commenter?.FullName ?? "Someone";

        var authorId = await _repo.GetContentAuthorUserIdAsync(contentType, contentId);
        Comment? parentComment = null;

        if (dto.ParentCommentId.HasValue)
        {
            // --- REPLY TO AN EXISTING COMMENT ---
            parentComment = await _repo.GetCommentByIdAsync(dto.ParentCommentId.Value);
            if (parentComment != null)
            {
                // 1. Notify the author of the comment that was replied to (jiske comments par reply kiya hai)
                if (parentComment.UserId != userId)
                {
                    await _karmaService.AwardKarmaAsync(parentComment.UserId, KarmaActivityTypes.ReceiveComment, KarmaPoints.ReceiveCommentPoints, contentType, contentId);

                    string replyNotifText = string.Equals(contentType, ContentTypes.Post, StringComparison.OrdinalIgnoreCase)
                        ? $"{commenterName} replied to your comment on a post."
                        : $"{commenterName} replied to your comment on a {contentType.ToLowerInvariant()}.";

                    await _notificationService.PublishAsync(
                        parentComment.UserId,
                        NotificationTypes.Comment,
                        replyNotifText,
                        relatedContentType: contentType,
                        relatedContentId: contentId);
                }

                // 2. Also notify the content/post author if they are a third party (not the replier, and not the parent comment author who was already notified)
                if (authorId.HasValue && authorId.Value != userId && authorId.Value != parentComment.UserId)
                {
                    await _karmaService.AwardKarmaAsync(authorId.Value, KarmaActivityTypes.ReceiveComment, KarmaPoints.ReceiveCommentPoints, contentType, contentId);

                    string postAuthorNotifText = string.Equals(contentType, ContentTypes.Post, StringComparison.OrdinalIgnoreCase)
                        ? $"{commenterName} commented on your post."
                        : $"{commenterName} commented on your {contentType.ToLowerInvariant()}.";

                    await _notificationService.PublishAsync(
                        authorId.Value,
                        NotificationTypes.Comment,
                        postAuthorNotifText,
                        relatedContentType: contentType,
                        relatedContentId: contentId);
                }
            }
            else if (authorId.HasValue && authorId.Value != userId)
            {
                // Fallback if parent comment entity was not found
                await _karmaService.AwardKarmaAsync(authorId.Value, KarmaActivityTypes.ReceiveComment, KarmaPoints.ReceiveCommentPoints, contentType, contentId);
                await _notificationService.PublishAsync(
                    authorId.Value,
                    NotificationTypes.Comment,
                    $"{commenterName} commented on your {contentType.ToLowerInvariant()}.",
                    relatedContentType: contentType,
                    relatedContentId: contentId);
            }
        }
        else
        {
            // --- DIRECT TOP-LEVEL COMMENT ON POST / ARTICLE / CONTENT ---
            if (authorId.HasValue && authorId.Value != userId)
            {
                await _karmaService.AwardKarmaAsync(authorId.Value, KarmaActivityTypes.ReceiveComment, KarmaPoints.ReceiveCommentPoints, contentType, contentId);

                string notifText = string.Equals(contentType, ContentTypes.Post, StringComparison.OrdinalIgnoreCase)
                    ? $"{commenterName} commented on your post."
                    : $"{commenterName} commented on your {contentType.ToLowerInvariant()}.";

                await _notificationService.PublishAsync(
                    authorId.Value,
                    NotificationTypes.Comment,
                    notifText,
                    relatedContentType: contentType,
                    relatedContentId: contentId);
            }
        }

        // --- @MENTIONS IN COMMENT ---
        if (!string.IsNullOrWhiteSpace(dto.CommentText))
        {
            var mentionMatches = System.Text.RegularExpressions.Regex.Matches(dto.CommentText, @"@([a-zA-Z0-9._-]+)");
            if (mentionMatches.Count > 0)
            {
                var tokens = mentionMatches.Select(m => m.Groups[1].Value).Distinct().ToList();
                var mentionedUsers = await _db.Users
                    .Where(u => u.IsActive && u.UserId != userId && (
                        tokens.Contains(u.EmployeeId) ||
                        tokens.Contains(u.FullName) ||
                        tokens.Contains(u.Email)
                    ))
                    .ToListAsync();

                foreach (var mu in mentionedUsers)
                {
                    if ((parentComment != null && mu.UserId == parentComment.UserId) ||
                        (authorId.HasValue && mu.UserId == authorId.Value))
                    {
                        continue;
                    }

                    await _notificationService.PublishAsync(
                        mu.UserId,
                        NotificationTypes.Mention,
                        $"{commenterName} mentioned you in a comment on a {contentType.ToLowerInvariant()}.",
                        relatedContentType: contentType,
                        relatedContentId: contentId);
                }
            }
        }

        var reloaded = await _repo.GetCommentByIdAsync(saved.CommentId);

        // Real-time broadcast comment count update to all active users
        try
        {
            var totalComments = await _db.Comments
                .CountAsync(c => (c.ContentType == contentType || c.ContentType.ToLower() == contentType.ToLower()) && c.ContentId == contentId);

            await _hubContext.Clients.All.SendAsync("CommentCountUpdated", new
            {
                contentType,
                contentId,
                commentsCount = totalComments
            });

            if (string.Equals(contentType, ContentTypes.Clip, StringComparison.OrdinalIgnoreCase))
            {
                var clip = await _db.Clips.FindAsync(contentId);
                if (clip != null)
                {
                    clip.CommentsCount = totalComments;
                    await _db.SaveChangesAsync();

                    var viewCount = await _db.ContentViews.CountAsync(cv => (cv.ContentType == ContentTypes.Clip || cv.ContentType.ToLower() == "clip") && cv.ContentId == contentId);
                    var likesCount = await _db.Reactions.CountAsync(r => (r.ContentType == ContentTypes.Clip || r.ContentType.ToLower() == "clip") && r.ContentId == contentId && r.ReactionType == ReactionTypes.Like);
                    var sharesCount = await _db.ClipShares.CountAsync(s => s.ClipId == contentId);

                    await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
                    {
                        clipId = contentId,
                        viewCount = Math.Max(clip.ViewsCount, viewCount),
                        likesCount = Math.Max(clip.LikesCount, likesCount),
                        commentsCount = totalComments,
                        sharesCount = Math.Max(clip.SharesCount, sharesCount),
                        userId,
                        updateType = "comment"
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast live CommentCountUpdated");
        }

        return _mapper.Map<CommentDto>(reloaded);
    }

    public async Task<CommentDto> UpdateCommentAsync(long commentId, int userId, UpdateCommentDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);
        var comment = await _repo.GetCommentByIdAsync(commentId);
        if (comment == null)
            throw new NotFoundException($"Comment with ID {commentId} not found.");

        if (comment.UserId != userId)
            throw new UnauthorizedException("You can only modify your own comments.");

        var securityCheck = await ValidateContentSecurityAsync(dto.CommentText, dto.ImageUrl);
        if (!securityCheck.IsValid)
            throw new BadRequestException("Updated comment contains blocked URLs or restricted keywords.");

        comment.CommentText = dto.CommentText;
        comment.ImageUrl = dto.ImageUrl;

        await _repo.UpdateCommentAsync(comment);
        return _mapper.Map<CommentDto>(comment);
    }

    public async Task DeleteCommentAsync(long commentId, int userId, bool isAdmin = false)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);
        var comment = await _repo.GetCommentByIdAsync(commentId);
        if (comment == null)
            throw new NotFoundException($"Comment with ID {commentId} not found.");

        if (comment.UserId != userId && !isAdmin)
            throw new UnauthorizedException("You do not have permission to delete this comment.");

        var cType = comment.ContentType;
        var cId = comment.ContentId;

        // If top-level, delete any child replies first or let cascading handle it cleanly
        var replies = await _repo.GetRepliesAsync(commentId);
        foreach (var reply in replies)
        {
            await _repo.DeleteCommentAsync(reply);
        }

        await _repo.DeleteCommentAsync(comment);

        // Real-time broadcast comment count update after deletion
        try
        {
            var totalComments = await _db.Comments
                .CountAsync(c => (c.ContentType == cType || c.ContentType.ToLower() == cType.ToLower()) && c.ContentId == cId);

            await _hubContext.Clients.All.SendAsync("CommentCountUpdated", new
            {
                contentType = cType,
                contentId = cId,
                commentsCount = totalComments
            });

            if (string.Equals(cType, ContentTypes.Clip, StringComparison.OrdinalIgnoreCase))
            {
                var clip = await _db.Clips.FindAsync(cId);
                if (clip != null)
                {
                    clip.CommentsCount = totalComments;
                    await _db.SaveChangesAsync();

                    var viewCount = await _db.ContentViews.CountAsync(cv => (cv.ContentType == ContentTypes.Clip || cv.ContentType.ToLower() == "clip") && cv.ContentId == cId);
                    var likesCount = await _db.Reactions.CountAsync(r => (r.ContentType == ContentTypes.Clip || r.ContentType.ToLower() == "clip") && r.ContentId == cId && r.ReactionType == ReactionTypes.Like);
                    var sharesCount = await _db.ClipShares.CountAsync(s => s.ClipId == cId);

                    await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
                    {
                        clipId = cId,
                        viewCount = Math.Max(clip.ViewsCount, viewCount),
                        likesCount = Math.Max(clip.LikesCount, likesCount),
                        commentsCount = totalComments,
                        sharesCount = Math.Max(clip.SharesCount, sharesCount),
                        userId,
                        updateType = "comment"
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast live CommentCountUpdated on delete");
        }
    }

    // --- Reactions (FR-CI-01) ---
    public async Task<(ReactionSummaryDto Summary, bool IsCreated)> ToggleReactionAsync(string contentType, long contentId, int userId, ToggleReactionDto dto)
    {
        ArgumentNullException.ThrowIfNull(dto);
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);
        ValidateContentType(contentType);

        if (!string.IsNullOrEmpty(dto.ReactionType))
        {
            var match = ReactionTypes.All.FirstOrDefault(a => a.Equals(dto.ReactionType, StringComparison.OrdinalIgnoreCase));
            if (match != null) dto.ReactionType = match;
        }

        bool isCreated = false;
        var existing = await _repo.GetUserReactionAsync(contentType, contentId, userId);
        if (existing != null)
        {
            if (string.Equals(existing.ReactionType ?? string.Empty, dto.ReactionType ?? string.Empty, StringComparison.OrdinalIgnoreCase))
            {
                // Same reaction toggled -> remove reaction (Un-react)
                await _repo.RemoveReactionAsync(existing);
            }
            else
            {
                // Different reaction -> update type
                existing.ReactionType = dto.ReactionType ?? string.Empty;
                existing.CreatedDate = KnomeTime.Now;
                await _repo.UpdateReactionAsync(existing);
            }
        }
        else
        {
            isCreated = true;
            var reaction = new Reaction
            {
                ContentType = contentType,
                ContentId = contentId,
                UserId = userId,
                ReactionType = dto.ReactionType ?? string.Empty,
                CreatedDate = KnomeTime.Now
            };
            await _repo.AddReactionAsync(reaction);

            // Award karma to the user who reacted
            await _karmaService.AwardKarmaAsync(userId, KarmaActivityTypes.AddLike, KarmaPoints.AddLikePoints, contentType, contentId);

            var reactor = await _userRepo.GetByIdAsync(userId);
            var reactorName = reactor?.FullName ?? "Someone";

            if (string.Equals(contentType, ContentTypes.Comment, StringComparison.OrdinalIgnoreCase))
            {
                var comment = await _repo.GetCommentByIdAsync(contentId);
                if (comment != null)
                {
                    var parentContentType = !string.IsNullOrWhiteSpace(comment.ContentType) ? comment.ContentType : ContentTypes.Post;

                    // 1. Notify the comment author (jisne comment kiya hai)
                    if (comment.UserId != userId)
                    {
                        await _karmaService.AwardKarmaAsync(comment.UserId, KarmaActivityTypes.ReceiveLike, KarmaPoints.ReceiveLikePoints, contentType, contentId);

                        string commentNotifText = string.Equals(parentContentType, ContentTypes.Post, StringComparison.OrdinalIgnoreCase)
                            ? $"{reactorName} liked your comment on a post."
                            : $"{reactorName} liked your comment on an {parentContentType.ToLowerInvariant()}.";

                        await _notificationService.PublishAsync(
                            comment.UserId,
                            NotificationTypes.Reaction,
                            commentNotifText,
                            relatedContentType: parentContentType,
                            relatedContentId: comment.ContentId);
                    }

                    // 2. Also notify the author of the parent content (jisne post / article create kiya hai)
                    var parentAuthorId = await _repo.GetContentAuthorUserIdAsync(parentContentType, comment.ContentId);
                    if (parentAuthorId.HasValue && parentAuthorId.Value != userId && parentAuthorId.Value != comment.UserId)
                    {
                        string parentNotifText = string.Equals(parentContentType, ContentTypes.Post, StringComparison.OrdinalIgnoreCase)
                            ? $"{reactorName} liked a comment on your post."
                            : $"{reactorName} liked a comment on your {parentContentType.ToLowerInvariant()}.";

                        await _notificationService.PublishAsync(
                            parentAuthorId.Value,
                            NotificationTypes.Reaction,
                            parentNotifText,
                            relatedContentType: parentContentType,
                            relatedContentId: comment.ContentId);
                    }
                }
            }
            else
            {
                // Direct reaction to Post, Article, Video, Podcast, etc.
                var authorId = await _repo.GetContentAuthorUserIdAsync(contentType, contentId);
                if (authorId.HasValue && authorId.Value != userId)
                {
                    await _karmaService.AwardKarmaAsync(authorId.Value, KarmaActivityTypes.ReceiveLike, KarmaPoints.ReceiveLikePoints, contentType, contentId);
                    string notifText = contentType switch
                    {
                        ContentTypes.Post => $"{reactorName} liked your post.",
                        ContentTypes.Article => $"{reactorName} liked your article.",
                        ContentTypes.Video => $"{reactorName} liked your video.",
                        ContentTypes.Podcast => $"{reactorName} liked your podcast.",
                        _ => $"{reactorName} reacted to your {contentType.ToLowerInvariant()}."
                    };
                    await _notificationService.PublishAsync(
                        authorId.Value,
                        NotificationTypes.Reaction,
                        notifText,
                        relatedContentType: contentType,
                        relatedContentId: contentId);
                }
            }
        }

        var summary = await _repo.GetReactionsSummaryAsync(contentType, contentId, userId);

        // Real-time broadcast to all connected users
        try
        {
            await _hubContext.Clients.All.SendAsync("ReactionCountUpdated", new
            {
                contentType,
                contentId,
                totalLikes = summary.TotalCount,
                reactionsSummary = summary
            });

            if (string.Equals(contentType, ContentTypes.Clip, StringComparison.OrdinalIgnoreCase))
            {
                var clip = await _db.Clips.FindAsync(contentId);
                if (clip != null)
                {
                    clip.LikesCount = summary.TotalCount;
                    await _db.SaveChangesAsync();

                    var viewCount = await _db.ContentViews.CountAsync(cv => (cv.ContentType == ContentTypes.Clip || cv.ContentType.ToLower() == "clip") && cv.ContentId == contentId);
                    var commentsCount = await _db.Comments.CountAsync(c => (c.ContentType == ContentTypes.Clip || c.ContentType.ToLower() == "clip") && c.ContentId == contentId);
                    var sharesCount = await _db.ClipShares.CountAsync(s => s.ClipId == contentId);

                    clip.CommentsCount = commentsCount;
                    await _db.SaveChangesAsync();

                    await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
                    {
                        clipId = contentId,
                        viewCount = Math.Max(clip.ViewsCount, viewCount),
                        likesCount = summary.TotalCount,
                        commentsCount = commentsCount,
                        sharesCount = Math.Max(clip.SharesCount, sharesCount),
                        userId,
                        updateType = "like"
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast live ReactionCountUpdated");
        }

        return (summary, isCreated);
    }

    public async Task<ReactionSummaryDto> GetReactionsSummaryAsync(string contentType, long contentId, int currentUserId)
    {
        ValidateContentType(contentType);
        return await _repo.GetReactionsSummaryAsync(contentType, contentId, currentUserId);
    }

    public async Task<List<ReactionDto>> GetReactionsListAsync(string contentType, long contentId)
    {
        ValidateContentType(contentType);
        var reactions = await _repo.GetReactionsAsync(contentType, contentId);
        return _mapper.Map<List<ReactionDto>>(reactions);
    }

    // --- Shares (FR-CI-03) ---
    public async Task<ShareDto> ShareContentAsync(string contentType, long contentId, int userId, CreateShareDto dto)
    {
        ValidateContentType(contentType);

        var share = new Share
        {
            ContentType = contentType,
            ContentId = contentId,
            UserId = userId,
            SharedToType = dto.SharedToType,
            TargetId = dto.TargetId ?? dto.SharedToId,
            CreatedDate = KnomeTime.Now
        };

        var saved = await _repo.AddShareAsync(share);

        // Award karma to the user who shared the content
        await _karmaService.AwardKarmaAsync(userId, KarmaActivityTypes.AddShare, KarmaPoints.AddSharePoints, contentType, contentId);

        var sharingUser = await _userRepo.GetProfileByIdAsync(userId);
        var sharingUserName = sharingUser?.FullName ?? "Someone";

        // Retrieve content title or snippet to include in notifications
        string contentTitle = "";
        try
        {
            if (contentType == ContentTypes.Post)
            {
                var p = await _db.Posts.FindAsync(contentId);
                if (p != null && !string.IsNullOrWhiteSpace(p.ContentText))
                {
                    contentTitle = p.ContentText.Length > 40 ? p.ContentText.Substring(0, 40) + "..." : p.ContentText;
                }
            }
            else if (contentType == ContentTypes.Article)
            {
                var a = await _db.Articles.FindAsync((int)contentId);
                if (a != null && !string.IsNullOrWhiteSpace(a.Title)) contentTitle = a.Title;
            }
            else if (contentType == ContentTypes.Video)
            {
                var v = await _db.Videos.FindAsync((int)contentId);
                if (v != null && !string.IsNullOrWhiteSpace(v.Title)) contentTitle = v.Title;
            }
            else if (contentType == ContentTypes.Podcast)
            {
                var pod = await _db.Podcasts.FindAsync((int)contentId);
                if (pod != null && !string.IsNullOrWhiteSpace(pod.Title)) contentTitle = pod.Title;
            }
        }
        catch { }

        var authorShareMsg = !string.IsNullOrWhiteSpace(contentTitle)
            ? $"{sharingUserName} shared your {contentType.ToLower()}: \"{contentTitle}\""
            : $"{sharingUserName} shared your {contentType.ToLower()}.";

        var recipientShareMsg = !string.IsNullOrWhiteSpace(contentTitle)
            ? $"{sharingUserName} shared a {contentType.ToLower()} with you: \"{contentTitle}\""
            : $"{sharingUserName} shared a {contentType.ToLower()} with you.";

        var authorId = await _repo.GetContentAuthorUserIdAsync(contentType, contentId);
        if (authorId.HasValue && authorId.Value != userId)
        {
            await _karmaService.AwardKarmaAsync(authorId.Value, KarmaActivityTypes.ReceiveShare, KarmaPoints.ReceiveSharePoints, contentType, contentId);
            // Notify the content author that their content was shared
            await _notificationService.PublishAsync(
                authorId.Value,
                NotificationTypes.Share,
                authorShareMsg,
                relatedContentType: contentType,
                relatedContentId: contentId);
        }

        // --- Share to a specific User: notify them ---
        var targetId = dto.TargetId ?? dto.SharedToId;
        if (dto.SharedToType == SharedToTypes.User && targetId.HasValue)
        {
            await _notificationService.PublishAsync(
                (int)targetId.Value,
                NotificationTypes.Share,
                recipientShareMsg,
                relatedContentType: contentType,
                relatedContentId: contentId);
        }
        // --- Share to Community: notify all members ---
        else if (dto.SharedToType == SharedToTypes.Community && targetId.HasValue)
        {
            var commId = targetId.Value;
            var memberIds = await _db.CommunityMembers
                .Where(m => m.CommunityId == commId && m.UserId != userId && m.Status == "Active")
                .Select(m => m.UserId)
                .ToListAsync();

            if (memberIds.Count > 0)
            {
                var commBroadcastMsg = !string.IsNullOrWhiteSpace(contentTitle)
                    ? $"{sharingUserName} shared a {contentType.ToLower()} in your community: \"{contentTitle}\""
                    : $"{sharingUserName} shared a post in your community.";

                await _notificationService.PublishBroadcastAsync(
                    NotificationTypes.Share,
                    commBroadcastMsg,
                    relatedContentType: ContentTypes.Post,
                    relatedContentId: contentId,
                    candidateUserIds: memberIds);
            }
        }

        // Real-time broadcast share count update to all active users
        try
        {
            var totalShares = await _db.Shares.CountAsync(s => s.ContentType == contentType && s.ContentId == contentId);
            await _hubContext.Clients.All.SendAsync("ShareCountUpdated", new
            {
                contentType,
                contentId,
                sharesCount = totalShares
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast live ShareCountUpdated");
        }

        return _mapper.Map<ShareDto>(saved);
    }

    // --- Bookmarks (FR-CI-04) & Saved Content ---
    public async Task<bool> ToggleBookmarkAsync(string contentType, long contentId, int userId)
    {
        ValidateContentType(contentType);

        var existing = await _repo.GetBookmarkAsync(contentType, contentId, userId);
        bool isBookmarked;
        if (existing != null)
        {
            await _repo.RemoveBookmarkAsync(existing);
            isBookmarked = false; // Unbookmarked
        }
        else
        {
            var bookmark = new Bookmark
            {
                UserId = userId,
                ContentType = contentType,
                ContentId = contentId,
                SavedDate = KnomeTime.Now
            };

            await _repo.AddBookmarkAsync(bookmark);
            isBookmarked = true; // Bookmarked
        }

        // Real-time SignalR Broadcast across open tabs/devices of current user
        try
        {
            await _hubContext.Clients.Group($"User_{userId}").SendAsync("BookmarkUpdated", new
            {
                contentType,
                contentId,
                isBookmarked,
                savedDate = KnomeTime.Now
            });
        }
        catch
        {
            // Non-blocking SignalR broadcast error handling
        }

        return isBookmarked;
    }

    public async Task<List<BookmarkDto>> GetMyBookmarksAsync(int userId)
    {
        var bookmarks = await _repo.GetUserBookmarksAsync(userId);
        return _mapper.Map<List<BookmarkDto>>(bookmarks);
    }

    public async Task<Responses.PagedResponse<SavedContentItemDto>> GetSavedContentItemsAsync(int userId, SavedContentQueryDto query)
    {
        var (items, totalCount) = await _repo.GetHydratedUserBookmarksAsync(userId, query);
        return Responses.PagedResponse<SavedContentItemDto>.Create(items, query.PageNumber, query.PageSize, totalCount);
    }

    public async Task<SavedContentCountDto> GetSavedContentCountsAsync(int userId)
    {
        return await _repo.GetSavedContentCountsAsync(userId);
    }

    public async Task<bool> GetBookmarkStatusAsync(string contentType, long contentId, int userId)
    {
        var bookmark = await _repo.GetBookmarkAsync(contentType, contentId, userId);
        return bookmark != null;
    }

    // --- Polymorphic Summary ---
    public async Task<ContentSummaryDto> GetContentSummaryAsync(string contentType, long contentId, int currentUserId)
    {
        ValidateContentType(contentType);

        var commentsCount = await _repo.GetCommentsCountAsync(contentType, contentId);
        var reactionSummary = await _repo.GetReactionsSummaryAsync(contentType, contentId, currentUserId);
        var sharesCount = await _repo.GetSharesCountAsync(contentType, contentId);
        var bookmark = await _repo.GetBookmarkAsync(contentType, contentId, currentUserId);

        // FR-HP-01 Hot Posts formula: (Views * 1) + (Reactions * 3) + (Comments * 5) + (Shares * 4)
        var views = await _repo.GetContentViewCountAsync(contentType, contentId);
        var score = (views * 1) + (reactionSummary.TotalCount * 3) + (commentsCount * 5) + (sharesCount * 4);

        return new ContentSummaryDto
        {
            ContentType = contentType,
            ContentId = contentId,
            CommentsCount = commentsCount,
            ReactionSummary = reactionSummary,
            SharesCount = sharesCount,
            ViewsCount = views,
            IsBookmarkedByCurrentUser = bookmark != null,
            EngagementScore = score
        };
    }

    public async Task<Dictionary<long, ContentSummaryDto>> GetContentSummariesBatchAsync(string contentType, IEnumerable<long> contentIds, int currentUserId)
    {
        ValidateContentType(contentType);
        var idList = contentIds.Distinct().ToList();
        var result = new Dictionary<long, ContentSummaryDto>();
        if (idList.Count == 0) return result;

        // 1. Bulk comments count in single query
        var commentsCountDict = await _db.Comments
            .AsNoTracking()
            .Where(c => c.ContentType == contentType && idList.Contains(c.ContentId))
            .GroupBy(c => c.ContentId)
            .Select(g => new { ContentId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.ContentId, g => g.Count);

        // 2. Bulk reactions count in single query
        var reactionsGrouped = await _db.Reactions
            .AsNoTracking()
            .Where(r => r.ContentType == contentType && idList.Contains(r.ContentId))
            .GroupBy(r => new { r.ContentId, r.ReactionType })
            .Select(g => new { ContentId = g.Key.ContentId, ReactionType = g.Key.ReactionType, Count = g.Count() })
            .ToListAsync();

        // 3. User's own reactions in single query
        var userReactions = await _db.Reactions
            .AsNoTracking()
            .Where(r => r.ContentType == contentType && idList.Contains(r.ContentId) && r.UserId == currentUserId)
            .ToDictionaryAsync(r => r.ContentId, r => r.ReactionType);

        // 4. Bulk shares count & bookmarks in single query
        var sharesCountDict = await _db.Shares
            .AsNoTracking()
            .Where(s => s.ContentType == contentType && idList.Contains(s.ContentId))
            .GroupBy(s => s.ContentId)
            .Select(g => new { ContentId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.ContentId, g => g.Count);

        var userBookmarks = currentUserId > 0
            ? new HashSet<long>(await _db.Bookmarks
                .AsNoTracking()
                .Where(b => b.ContentType == contentType && idList.Contains(b.ContentId) && b.UserId == currentUserId)
                .Select(b => b.ContentId)
                .ToListAsync())
            : new HashSet<long>();

        // 5. Bulk views count
        var viewsDict = new Dictionary<long, int>();
        if (contentType == ContentTypes.Article)
        {
            viewsDict = await _db.Articles.AsNoTracking().Where(a => idList.Contains(a.ArticleId)).ToDictionaryAsync(a => a.ArticleId, a => a.ViewCount);
        }
        else if (contentType == ContentTypes.Video)
        {
            viewsDict = await _db.Videos.AsNoTracking().Where(v => idList.Contains(v.VideoId)).ToDictionaryAsync(v => (long)v.VideoId, v => v.ViewCount);
        }
        else if (contentType == ContentTypes.Podcast)
        {
            viewsDict = await _db.Podcasts.AsNoTracking().Where(p => idList.Contains(p.PodcastId)).ToDictionaryAsync(p => p.PodcastId, p => p.ViewCount);
        }
        else if (contentType == ContentTypes.Post)
        {
            viewsDict = await _db.Posts.AsNoTracking().Where(p => idList.Contains(p.PostId)).ToDictionaryAsync(p => p.PostId, p => p.ViewCount);
        }
        else if (contentType == ContentTypes.Clip)
        {
            viewsDict = await _db.Clips.AsNoTracking().Where(c => idList.Contains(c.ClipId)).ToDictionaryAsync(c => c.ClipId, c => c.ViewsCount);
        }

        // Assemble all summaries in-memory with zero extra database calls
        foreach (var cid in idList)
        {
            var rSummary = new ReactionSummaryDto();
            var contentReactions = reactionsGrouped.Where(rg => rg.ContentId == cid).ToList();
            rSummary.TotalCount = contentReactions.Sum(rg => rg.Count);
            rSummary.LikeCount = contentReactions.FirstOrDefault(rg => rg.ReactionType == ReactionTypes.Like)?.Count ?? 0;
            rSummary.CelebrateCount = contentReactions.FirstOrDefault(rg => rg.ReactionType == ReactionTypes.Celebrate)?.Count ?? 0;
            rSummary.SupportCount = contentReactions.FirstOrDefault(rg => rg.ReactionType == ReactionTypes.Support)?.Count ?? 0;
            rSummary.HeartCount = contentReactions.FirstOrDefault(rg => rg.ReactionType == ReactionTypes.Heart)?.Count ?? 0;
            if (userReactions.TryGetValue(cid, out var uReaction))
            {
                rSummary.CurrentUserReactionType = uReaction;
            }

            var cCount = commentsCountDict.TryGetValue(cid, out var cc) ? cc : 0;
            var sCount = sharesCountDict.TryGetValue(cid, out var sc) ? sc : 0;
            var viewCount = viewsDict.TryGetValue(cid, out var vc) ? vc : 0;
            var isBookmarked = userBookmarks.Contains(cid);

            // FR-HP-01 Hot Posts formula: (Views * 1) + (Reactions * 3) + (Comments * 5) + (Shares * 4)
            var score = (viewCount * 1) + (rSummary.TotalCount * 3) + (cCount * 5) + (sCount * 4);

            result[cid] = new ContentSummaryDto
            {
                ContentType = contentType,
                ContentId = cid,
                CommentsCount = cCount,
                ReactionSummary = rSummary,
                SharesCount = sCount,
                ViewsCount = viewCount,
                IsBookmarkedByCurrentUser = isBookmarked,
                EngagementScore = score
            };
        }

        return result;
    }

    // --- Moderation & Governance (FR-SM-02) ---
    public async Task<ModerationReportDto> ReportContentAsync(string contentType, long contentId, int reporterUserId, CreateReportDto dto)
    {
        ValidateContentType(contentType);

        var report = new ModerationReport
        {
            ReporterUserId = reporterUserId,
            ContentType = contentType,
            ContentId = contentId,
            ReasonCode = dto.ReasonCode,
            Status = ReportStatuses.Pending,
            ReportedDate = KnomeTime.Now
        };

        var saved = await _repo.AddReportAsync(report);
        var reloaded = await _repo.GetReportByIdAsync(saved.ReportId);
        return _mapper.Map<ModerationReportDto>(reloaded);
    }

    public async Task<List<ModerationReportDto>> GetPendingReportsAsync(int pageNumber, int pageSize)
    {
        var reports = await _repo.GetPendingReportsAsync(pageNumber, pageSize);
        return await EnrichReportsAsync(reports);
    }

    public async Task<List<ModerationReportDto>> GetAllReportsAsync(string? status, int pageNumber, int pageSize)
    {
        var reports = await _repo.GetAllReportsAsync(status, pageNumber, pageSize);
        return await EnrichReportsAsync(reports);
    }

    public async Task<ModerationReportDto> ResolveReportAsync(long reportId, int moderatorUserId, ResolveReportDto dto)
    {
        var report = await _repo.GetReportByIdAsync(reportId);
        if (report == null)
            throw new NotFoundException($"Moderation report ID {reportId} not found.");

        report.Status = dto.Status;
        report.ModeratorUserId = moderatorUserId;
        report.ActionTaken = !string.IsNullOrEmpty(dto.ActionTaken) && dto.ActionTaken.Length > 40
            ? dto.ActionTaken.Substring(0, 40)
            : dto.ActionTaken;
        report.ActionDate = KnomeTime.Now;

        await _repo.UpdateReportAsync(report);

        // Moderation advisory notification to the content creator if action was taken or resolved
        try
        {
            var authorId = await _repo.GetContentAuthorUserIdAsync(report.ContentType, report.ContentId);
            if (authorId.HasValue && authorId.Value != moderatorUserId)
            {
                var actionText = !string.IsNullOrWhiteSpace(report.ActionTaken)
                    ? report.ActionTaken
                    : (dto.Status == ReportStatuses.Resolved ? "Reviewed and resolved by moderators" : null);

                if (!string.IsNullOrEmpty(actionText))
                {
                    await _notificationService.PublishAsync(
                        authorId.Value,
                        NotificationTypes.HrAnnouncement,
                        $"Your {report.ContentType.ToLowerInvariant()} was reviewed by moderation: {actionText}.",
                        relatedContentType: report.ContentType,
                        relatedContentId: report.ContentId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send moderation notice to content author for report {ReportId}", reportId);
        }

        var enriched = await EnrichReportsAsync(new List<ModerationReport> { report });
        return enriched.FirstOrDefault() ?? _mapper.Map<ModerationReportDto>(report);
    }

    private async Task<List<ModerationReportDto>> EnrichReportsAsync(List<ModerationReport> reports)
    {
        var dtos = _mapper.Map<List<ModerationReportDto>>(reports);
        if (dtos.Count == 0) return dtos;

        var postIds = dtos.Where(d => d.ContentType.Equals("Post", StringComparison.OrdinalIgnoreCase)).Select(d => d.ContentId).Distinct().ToList();
        var videoIds = dtos.Where(d => d.ContentType.Equals("Video", StringComparison.OrdinalIgnoreCase)).Select(d => d.ContentId).Distinct().ToList();
        var articleIds = dtos.Where(d => d.ContentType.Equals("Article", StringComparison.OrdinalIgnoreCase)).Select(d => d.ContentId).Distinct().ToList();
        var podcastIds = dtos.Where(d => d.ContentType.Equals("Podcast", StringComparison.OrdinalIgnoreCase)).Select(d => d.ContentId).Distinct().ToList();
        var clipIds = dtos.Where(d => d.ContentType.Equals("Clip", StringComparison.OrdinalIgnoreCase)).Select(d => d.ContentId).Distinct().ToList();

        var posts = postIds.Count > 0 
            ? await _db.Posts.AsNoTracking()
                .Include(p => p.AuthorUser)
                .Include(p => p.Communities)
                .Where(p => postIds.Contains(p.PostId))
                .ToDictionaryAsync(p => p.PostId)
            : new Dictionary<long, Post>();

        var videos = videoIds.Count > 0 
            ? await _db.Videos.AsNoTracking()
                .Include(v => v.UploaderUser)
                .Include(v => v.Category)
                .Where(v => videoIds.Contains(v.VideoId))
                .ToDictionaryAsync(v => v.VideoId)
            : new Dictionary<long, Video>();

        var articles = articleIds.Count > 0 
            ? await _db.Articles.AsNoTracking()
                .Include(a => a.AuthorUser)
                .Include(a => a.Category)
                .Where(a => articleIds.Contains(a.ArticleId))
                .ToDictionaryAsync(a => a.ArticleId)
            : new Dictionary<long, Article>();

        var podcasts = podcastIds.Count > 0 
            ? await _db.Podcasts.AsNoTracking()
                .Include(p => p.UploaderUser)
                .Include(p => p.Category)
                .Where(p => podcastIds.Contains(p.PodcastId))
                .ToDictionaryAsync(p => p.PodcastId)
            : new Dictionary<long, Podcast>();

        var clips = clipIds.Count > 0 
            ? await _db.Clips.AsNoTracking()
                .Include(c => c.CreatedByUser)
                .Include(c => c.Community)
                .Where(c => clipIds.Contains(c.ClipId))
                .ToDictionaryAsync(c => c.ClipId)
            : new Dictionary<long, Clip>();

        foreach (var dto in dtos)
        {
            // Severity & AiScore
            dto.Severity = dto.ReasonCode switch
            {
                "Harassment" or "Copyright" => "Critical",
                "Inappropriate" => "High",
                "Spam" => "Low",
                _ => "Medium"
            };

            dto.AiScore = dto.ReasonCode switch
            {
                "Harassment" => "98% Toxic",
                "Copyright" => "96% Risk",
                "Inappropriate" => "85% Risk",
                "Spam" => "90% Spam",
                _ => "75% AI"
            };

            if (dto.ContentType.Equals("Post", StringComparison.OrdinalIgnoreCase))
            {
                if (posts.TryGetValue(dto.ContentId, out var post))
                {
                    dto.ReportedUserId = post.AuthorUserId;
                    dto.ReportedUserName = post.AuthorUser?.FullName ?? $"User #{post.AuthorUserId}";
                    dto.PostContentSnippet = post.ContentText;
                    dto.CommunityName = post.Communities.FirstOrDefault()?.Name ?? "Engineering & Tech";
                }
                else
                {
                    dto.ReportedUserName = "Reported Author";
                    dto.PostContentSnippet = $"Reported {dto.ReasonCode} content for Post #{dto.ContentId}. Content snapshot under administrative review.";
                    dto.CommunityName = "Engineering & Tech";
                }
            }
            else if (dto.ContentType.Equals("Video", StringComparison.OrdinalIgnoreCase))
            {
                if (videos.TryGetValue(dto.ContentId, out var video))
                {
                    dto.ReportedUserId = video.UploaderUserId;
                    dto.ReportedUserName = video.UploaderUser?.FullName ?? $"User #{video.UploaderUserId}";
                    dto.PostContentSnippet = video.Title;
                    dto.CommunityName = video.Category?.Name ?? "Video Library";
                }
                else
                {
                    dto.ReportedUserName = "Content Creator";
                    dto.PostContentSnippet = $"Reported {dto.ReasonCode} violation on Video #{dto.ContentId}.";
                    dto.CommunityName = "Video Library";
                }
            }
            else if (dto.ContentType.Equals("Article", StringComparison.OrdinalIgnoreCase))
            {
                if (articles.TryGetValue(dto.ContentId, out var article))
                {
                    dto.ReportedUserId = article.AuthorUserId;
                    dto.ReportedUserName = article.AuthorUser?.FullName ?? $"User #{article.AuthorUserId}";
                    dto.PostContentSnippet = article.Title;
                    dto.CommunityName = article.Category?.Name ?? "Knowledge Hub";
                }
                else
                {
                    dto.ReportedUserName = "Article Author";
                    dto.PostContentSnippet = $"Reported {dto.ReasonCode} violation on Article #{dto.ContentId}.";
                    dto.CommunityName = "Knowledge Hub";
                }
            }
            else if (dto.ContentType.Equals("Podcast", StringComparison.OrdinalIgnoreCase))
            {
                if (podcasts.TryGetValue(dto.ContentId, out var podcast))
                {
                    dto.ReportedUserId = podcast.UploaderUserId;
                    dto.ReportedUserName = podcast.UploaderUser?.FullName ?? $"User #{podcast.UploaderUserId}";
                    dto.PostContentSnippet = podcast.Title;
                    dto.CommunityName = podcast.Category?.Name ?? "Audio Room";
                }
                else
                {
                    dto.ReportedUserName = "Podcast Host";
                    dto.PostContentSnippet = $"Reported {dto.ReasonCode} violation on Podcast #{dto.ContentId}.";
                    dto.CommunityName = "Audio Room";
                }
            }
            else if (dto.ContentType.Equals("Clip", StringComparison.OrdinalIgnoreCase))
            {
                if (clips.TryGetValue(dto.ContentId, out var clip))
                {
                    dto.ReportedUserId = clip.CreatedByUserId;
                    dto.ReportedUserName = clip.CreatedByUser?.FullName ?? $"User #{clip.CreatedByUserId}";
                    dto.PostContentSnippet = !string.IsNullOrWhiteSpace(clip.Title) ? clip.Title : (clip.Description ?? "Clip");
                    dto.CommunityName = clip.Community?.Name ?? "Clips";
                }
                else
                {
                    dto.ReportedUserName = "Clip Creator";
                    dto.PostContentSnippet = $"Reported {dto.ReasonCode} violation on Clip #{dto.ContentId}.";
                    dto.CommunityName = "Clips";
                }
            }
        }

        return dtos;
    }

    public async Task<long> RecordViewAsync(string contentType, long contentId, int userId)
    {
        ValidateContentType(contentType);
        var views = await _repo.RecordUniqueViewAsync(contentType, contentId, userId);
        if (string.Equals(contentType, ContentTypes.Clip, StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var clip = await _db.Clips.FindAsync(contentId);
                if (clip != null)
                {
                    clip.ViewsCount = (int)Math.Max(clip.ViewsCount, views);
                    await _db.SaveChangesAsync();

                    var likesCount = await _db.Reactions.CountAsync(r => (r.ContentType == ContentTypes.Clip || r.ContentType.ToLower() == "clip") && r.ContentId == contentId && r.ReactionType == ReactionTypes.Like);
                    var commentsCount = await _db.Comments.CountAsync(c => (c.ContentType == ContentTypes.Clip || c.ContentType.ToLower() == "clip") && c.ContentId == contentId);
                    var sharesCount = await _db.ClipShares.CountAsync(s => s.ClipId == contentId);

                    clip.CommentsCount = commentsCount;
                    await _db.SaveChangesAsync();

                    await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
                    {
                        clipId = contentId,
                        viewCount = (int)Math.Max(clip.ViewsCount, views),
                        likesCount = Math.Max(clip.LikesCount, likesCount),
                        commentsCount = commentsCount,
                        sharesCount = Math.Max(clip.SharesCount, sharesCount),
                        userId,
                        updateType = "view"
                    });

                    await _hubContext.Clients.All.SendAsync("ViewCountUpdated", new
                    {
                        contentType = ContentTypes.Clip,
                        contentId,
                        viewCount = (int)Math.Max(clip.ViewsCount, views)
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update clip views count or broadcast live ViewCountUpdated");
            }
        }
        return views;
    }

    public async Task<bool> HasUserViewedAsync(string contentType, long contentId, int userId)
    {
        ValidateContentType(contentType);
        return await _repo.HasUserViewedAsync(contentType, contentId, userId);
    }
}
