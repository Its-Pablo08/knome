using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Posts;
using Knome.API.Models;
using Knome.API.Repositories;
using Knome.API.Common;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class PostService : IPostService
{
    private readonly IPostRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly IKarmaService _karmaService;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly INotificationService _notificationService;

    public PostService(IPostRepository repo, IContentInteractionService interactionService, IKarmaService karmaService, KnomeDbContext db, IMapper mapper, ISuspensionGuard suspensionGuard, INotificationService notificationService)
    {
        _repo = repo;
        _interactionService = interactionService;
        _karmaService = karmaService;
        _db = db;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _notificationService = notificationService;
    }

    private async Task CheckIsAuthorOrAdminAsync(Post post, int currentUserId)
    {
        if (post.AuthorUserId == currentUserId) return;

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM"))))
        {
            throw new UnauthorizedException("You must be the author of this post or an Administrator to modify/delete it.");
        }
    }

    public async Task<PostDto> GetPostAsync(long postId, int currentUserId)
    {
        var post = await _repo.GetPostByIdAsync(postId);
        if (post == null)
            throw new NotFoundException($"Post ID {postId} not found.");

        if (currentUserId > 0)
        {
            var authoritativeViews = await _interactionService.RecordViewAsync(ContentTypes.Post, postId, currentUserId);
            post.ViewCount = (int)authoritativeViews;
        }

        var dto = _mapper.Map<PostDto>(post);
        dto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, postId, currentUserId);
        return dto;
    }

    public async Task<List<PostDto>> GetPostsAsync(string? audienceType, string? search, int pageNumber, int pageSize, int currentUserId)
    {
        var posts = await _repo.GetPostsAsync(audienceType, search, pageNumber, pageSize, currentUserId);
        var ids = posts.Select(p => p.PostId).ToList();
        var summaries = ids.Count > 0 
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Post, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<PostDto>();
        foreach (var p in posts)
        {
            var dto = _mapper.Map<PostDto>(p);
            dto.EngagementSummary = summaries.TryGetValue(p.PostId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Post, ContentId = p.PostId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<List<PostDto>> GetMyPostsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await GetUserPostsAsync(currentUserId, currentUserId, pageNumber, pageSize);
    }

    public async Task<List<PostDto>> GetUserPostsAsync(int authorUserId, int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        var posts = await _repo.GetMyPostsAsync(authorUserId, pageNumber, pageSize);
        var ids = posts.Select(p => p.PostId).ToList();
        var summaries = ids.Count > 0 
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Post, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<PostDto>();
        foreach (var p in posts)
        {
            var dto = _mapper.Map<PostDto>(p);
            dto.EngagementSummary = summaries.TryGetValue(p.PostId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Post, ContentId = p.PostId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<PostDto> CreatePostAsync(int currentUserId, CreatePostDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        // Security screening (FR-SM-01)
        var secCheck = await _interactionService.ValidateContentSecurityAsync(dto.ContentText, dto.AttachmentUrls.FirstOrDefault());
        if (!secCheck.IsValid)
            throw new BadRequestException("Post content or attachments contain blocked URLs or restricted keywords.");

        DateTime? scheduledDate = null;
        if (dto.Status == PostStatuses.Scheduled && dto.ScheduledDate.HasValue)
        {
            scheduledDate = KnomeTime.ToIst(dto.ScheduledDate.Value);
        }

        // Check if scheduled time has already arrived or is past (comparing IST timestamps)
        var isAlreadyDue = scheduledDate.HasValue && scheduledDate.Value <= KnomeTime.Now;
        var finalStatus = isAlreadyDue ? PostStatuses.Published : (string.IsNullOrEmpty(dto.Status) ? PostStatuses.Published : dto.Status);
        var publishedDate = finalStatus == PostStatuses.Published ? (isAlreadyDue ? scheduledDate : KnomeTime.Now) : (DateTime?)null;

        var post = new Post
        {
            AuthorUserId = currentUserId,
            ContentText = dto.ContentText,
            AudienceType = dto.AudienceType,
            Status = finalStatus,
            ScheduledDate = scheduledDate,
            PublishedDate = publishedDate,
            CreatedDate = KnomeTime.Now
        };

        var allTargetedUserIds = (dto.MentionedUserIds ?? new List<int>())
            .Concat(dto.AudienceUserIds ?? new List<int>())
            .Distinct()
            .ToList();

        var savedPost = await _repo.AddPostAsync(post, dto.AttachmentUrls, dto.AttachmentTypes, allTargetedUserIds);
        if (finalStatus == PostStatuses.Published)
        {
            await _karmaService.AwardKarmaAsync(currentUserId, KarmaActivityTypes.CreatePost, KarmaPoints.CreatePostPoints, ContentTypes.Post, savedPost.PostId, KarmaCaps.CreatePostDailyCap);
        }
        var authorUser = await _db.Users.FindAsync(currentUserId);
        var authorName = authorUser?.FullName ?? "Someone";
        var snippet = post.ContentText?.Length > 60 ? post.ContentText.Substring(0, 57) + "..." : (post.ContentText ?? string.Empty);

        // 1. Community Post linking & Member Notifications
        if (dto.AudienceCommunityIds != null && dto.AudienceCommunityIds.Any())
        {
            foreach (var commId in dto.AudienceCommunityIds.Distinct())
            {
                var comm = await _db.Communities.FindAsync(commId);
                if (comm != null)
                {
                    var alreadyLinked = await _db.CommunityPosts.AnyAsync(cp => cp.CommunityId == commId && cp.PostId == savedPost.PostId);
                    if (!alreadyLinked)
                    {
                        _db.CommunityPosts.Add(new CommunityPost
                        {
                            CommunityId = commId,
                            PostId = savedPost.PostId,
                            IsPinned = false
                        });
                    }

                    // Notify community members when post is published
                    if (finalStatus == PostStatuses.Published)
                    {
                        var memberUserIds = await _db.CommunityMembers
                            .Where(cm => cm.CommunityId == commId && (cm.Status == "Approved" || cm.Status == "Active" || string.IsNullOrEmpty(cm.Status)) && cm.UserId != currentUserId)
                            .Select(cm => cm.UserId)
                            .ToListAsync();

                        if (comm.CreatedByUserId != currentUserId && !memberUserIds.Contains(comm.CreatedByUserId))
                        {
                            memberUserIds.Add(comm.CreatedByUserId);
                        }

                        foreach (var memberId in memberUserIds)
                        {
                            await _notificationService.PublishAsync(
                                memberId,
                                NotificationTypes.Community,
                                $"{authorName} posted in {comm.Name}: \"{snippet}\"",
                                relatedContentType: ContentTypes.Post,
                                relatedContentId: savedPost.PostId);
                        }
                    }
                }
                await _karmaService.AwardCommunityParticipationAsync(currentUserId, commId);
            }
            await _db.SaveChangesAsync();
        }

        // 2. Specific Connections / Targeted users Notifications
        if (allTargetedUserIds.Any() && finalStatus == PostStatuses.Published)
        {
            var mentionedSet = (dto.MentionedUserIds ?? new List<int>()).ToHashSet();
            foreach (var targetUserId in allTargetedUserIds.Where(id => id != currentUserId))
            {
                var isMention = mentionedSet.Contains(targetUserId);
                await _notificationService.PublishAsync(
                    targetUserId,
                    isMention ? NotificationTypes.Mention : NotificationTypes.Share,
                    isMention
                        ? $"You were mentioned in a post by {authorName}: \"{snippet}\""
                        : $"{authorName} shared a post with you: \"{snippet}\"",
                    relatedContentType: ContentTypes.Post,
                    relatedContentId: savedPost.PostId);
            }
        }

        // 3. Everyone (Organization-wide post) Notifications
        if ((dto.AudienceType == "Everyone" || string.IsNullOrEmpty(dto.AudienceType)) && finalStatus == PostStatuses.Published)
        {
            var followerUserIds = await _db.Followers
                .Where(f => f.FollowingUserId == currentUserId)
                .Select(f => f.FollowerUserId)
                .ToListAsync();

            var otherActiveUsers = await _db.Users
                .Where(u => u.UserId != currentUserId && u.IsActive && !u.IsPermanentlySuspended)
                .Select(u => u.UserId)
                .Take(50)
                .ToListAsync();

            var everyoneRecipients = followerUserIds.Concat(otherActiveUsers).Distinct().ToList();
            foreach (var recipientId in everyoneRecipients)
            {
                await _notificationService.PublishAsync(
                    recipientId,
                    NotificationTypes.HrAnnouncement,
                    $"{authorName} published a new post: \"{snippet}\"",
                    relatedContentType: ContentTypes.Post,
                    relatedContentId: savedPost.PostId);
            }
        }

        var resDto = _mapper.Map<PostDto>(savedPost);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, savedPost.PostId, currentUserId);

        if (dto.AudienceCommunityIds != null && dto.AudienceCommunityIds.Any())
        {
            var firstCommId = dto.AudienceCommunityIds.First();
            var comm = await _db.Communities.FindAsync(firstCommId);
            resDto.CommunityId = firstCommId;
            resDto.CommunityName = comm?.Name;
        }

        if (savedPost.MentionedUsers != null && savedPost.MentionedUsers.Any())
        {
            resDto.SharedWithName = savedPost.MentionedUsers.Count == 1 
                ? savedPost.MentionedUsers.First().FullName 
                : $"{savedPost.MentionedUsers.First().FullName} +{savedPost.MentionedUsers.Count - 1} others";
        }

        return resDto;
    }

    public async Task<PostDto> UpdatePostAsync(long postId, int currentUserId, UpdatePostDto dto)
    {
        var post = await _repo.GetPostByIdAsync(postId);
        if (post == null)
            throw new NotFoundException($"Post ID {postId} not found.");

        await CheckIsAuthorOrAdminAsync(post, currentUserId);

        var secCheck = await _interactionService.ValidateContentSecurityAsync(dto.ContentText, dto.AttachmentUrls.FirstOrDefault());
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated post content or attachments contain blocked URLs or restricted keywords.");

        var previousStatus = post.Status;
        post.ContentText = dto.ContentText;
        post.AudienceType = dto.AudienceType;

        if (dto.Status == PostStatuses.Scheduled && dto.ScheduledDate.HasValue)
        {
            var istScheduledDate = KnomeTime.ToIst(dto.ScheduledDate.Value);
            var isAlreadyDue = istScheduledDate <= KnomeTime.Now;
            if (isAlreadyDue)
            {
                post.Status = PostStatuses.Published;
                post.ScheduledDate = istScheduledDate;
                post.PublishedDate = istScheduledDate;
            }
            else
            {
                post.Status = PostStatuses.Scheduled;
                post.ScheduledDate = istScheduledDate;
                post.PublishedDate = null;
            }
        }
        else
        {
            post.Status = dto.Status;
            post.ScheduledDate = KnomeTime.ToIst(dto.ScheduledDate);
            if (dto.Status == PostStatuses.Published && post.PublishedDate == null)
                post.PublishedDate = KnomeTime.Now;
        }
        
        await _repo.UpdatePostAsync(post, dto.AttachmentUrls, dto.AttachmentTypes, dto.MentionedUserIds);

        // If post just transitioned from Draft/Scheduled to Published, award karma and notify
        if (previousStatus != PostStatuses.Published && post.Status == PostStatuses.Published)
        {
            await _karmaService.AwardKarmaAsync(currentUserId, KarmaActivityTypes.CreatePost, KarmaPoints.CreatePostPoints, ContentTypes.Post, post.PostId, KarmaCaps.CreatePostDailyCap);

            var authorUser = await _db.Users.FindAsync(currentUserId);
            var authorName = authorUser?.FullName ?? "Someone";
            var snippet = post.ContentText?.Length > 60 ? post.ContentText.Substring(0, 57) + "..." : (post.ContentText ?? string.Empty);

            if (dto.AudienceCommunityIds != null && dto.AudienceCommunityIds.Any())
            {
                foreach (var commId in dto.AudienceCommunityIds.Distinct())
                {
                    var comm = await _db.Communities.FindAsync(commId);
                    if (comm != null)
                    {
                        var memberUserIds = await _db.CommunityMembers
                            .Where(cm => cm.CommunityId == commId && (cm.Status == "Approved" || cm.Status == "Active" || string.IsNullOrEmpty(cm.Status)) && cm.UserId != currentUserId)
                            .Select(cm => cm.UserId)
                            .ToListAsync();

                        if (comm.CreatedByUserId != currentUserId && !memberUserIds.Contains(comm.CreatedByUserId))
                        {
                            memberUserIds.Add(comm.CreatedByUserId);
                        }

                        foreach (var memberId in memberUserIds)
                        {
                            await _notificationService.PublishAsync(
                                memberId,
                                NotificationTypes.Community,
                                $"{authorName} posted in {comm.Name}: \"{snippet}\"",
                                relatedContentType: ContentTypes.Post,
                                relatedContentId: post.PostId);
                        }
                    }
                }
            }

            if (dto.AudienceType == "Everyone" || string.IsNullOrEmpty(dto.AudienceType))
            {
                var followerUserIds = await _db.Followers
                    .Where(f => f.FollowingUserId == currentUserId)
                    .Select(f => f.FollowerUserId)
                    .ToListAsync();

                var otherActiveUsers = await _db.Users
                    .Where(u => u.UserId != currentUserId && u.IsActive && !u.IsPermanentlySuspended)
                    .Select(u => u.UserId)
                    .Take(50)
                    .ToListAsync();

                var everyoneRecipients = followerUserIds.Concat(otherActiveUsers).Distinct().ToList();
                foreach (var recipientId in everyoneRecipients)
                {
                    await _notificationService.PublishAsync(
                        recipientId,
                        NotificationTypes.HrAnnouncement,
                        $"{authorName} published a new post: \"{snippet}\"",
                        relatedContentType: ContentTypes.Post,
                        relatedContentId: post.PostId);
                }
            }
        }

        var updated = await _repo.GetPostByIdAsync(postId);
        var resDto = _mapper.Map<PostDto>(updated!);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, postId, currentUserId);
        return resDto;
    }

    public async Task DeletePostAsync(long postId, int currentUserId)
    {
        var post = await _repo.GetPostByIdAsync(postId);
        if (post == null)
            throw new NotFoundException($"Post ID {postId} not found.");

        await CheckIsAuthorOrAdminAsync(post, currentUserId);
        await _repo.DeletePostAsync(post);
    }

    public async Task<int> IncrementViewCountAsync(long postId, int currentUserId = 0)
    {
        var post = await _repo.GetPostByIdAsync(postId);
        if (post == null)
            throw new NotFoundException($"Post ID {postId} not found.");

        var count = await _interactionService.RecordViewAsync(ContentTypes.Post, postId, currentUserId);
        return (int)count;
    }
}
