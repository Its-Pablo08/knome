using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Feed;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class FeedService : IFeedService
{
    private readonly IFeedRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly IKarmaService _karmaService;
    private readonly KnomeDbContext _db;

    public FeedService(IFeedRepository repo, IContentInteractionService interactionService, IKarmaService karmaService, KnomeDbContext db)
    {
        _repo = repo;
        _interactionService = interactionService;
        _karmaService = karmaService;
        _db = db;
    }

    public async Task<List<FeedItemDto>> GetPersonalizedFeedAsync(int currentUserId, string? contentTypeFilter, int pageNumber, int pageSize)
    {
        if (pageNumber < 1) pageNumber = 1;
        if (pageSize < 1 || pageSize > 50) pageSize = 20;

        var followedUserIds = await _repo.GetFollowedUserIdsAsync(currentUserId);
        var myCommunityIds = await _repo.GetMyCommunityIdsAsync(currentUserId);

        var candidateItems = new List<FeedItemDto>();

        if (string.IsNullOrEmpty(contentTypeFilter) || contentTypeFilter.Equals(ContentTypes.Post, StringComparison.OrdinalIgnoreCase))
        {
            var posts = await _repo.GetCandidatePostsAsync(followedUserIds, myCommunityIds, currentUserId, 50);
            var candidatePostIds = posts.Select(p => p.PostId).ToList();
            var commPosts = await _db.CommunityPosts
                .Include(cp => cp.Community)
                .Where(cp => candidatePostIds.Contains(cp.PostId))
                .ToListAsync();
            var commMap = commPosts.GroupBy(cp => cp.PostId).ToDictionary(g => g.Key, g => g.First().Community);

            foreach (var p in posts)
            {
                var comm = commMap.TryGetValue(p.PostId, out var c) ? c : null;
                var sharedWith = (p.MentionedUsers != null && p.MentionedUsers.Any())
                    ? (p.MentionedUsers.Count == 1 ? p.MentionedUsers.First().FullName : $"{p.MentionedUsers.First().FullName} +{p.MentionedUsers.Count - 1} others")
                    : null;
                var audUserIds = (p.MentionedUsers != null) ? p.MentionedUsers.Select(m => m.UserId).ToList() : new List<int>();

                candidateItems.Add(new FeedItemDto
                {
                    ContentType = ContentTypes.Post,
                    ContentId = p.PostId,
                    Title = string.Empty,
                    TextSummary = p.ContentText.Length > 200 ? p.ContentText.Substring(0, 197) + "..." : p.ContentText,
                    ContentText = p.ContentText,
                    Status = p.Status ?? "Published",
                    ScheduledDate = p.ScheduledDate,
                    CommunityId = comm?.CommunityId,
                    CommunityName = comm?.Name,
                    SharedWithName = sharedWith,
                    AudienceUserIds = audUserIds,
                    AttachmentUrl = p.PostAttachments.FirstOrDefault()?.FileUrl,
                    AttachmentUrls = p.PostAttachments.Select(pa => pa.FileUrl).ToList(),
                    Attachments = p.PostAttachments.Select(pa => new FeedAttachmentDto
                    {
                        AttachmentId = pa.AttachmentId,
                        FileUrl = pa.FileUrl,
                        FileType = pa.FileType
                    }).ToList(),
                    AuthorUserId = p.AuthorUserId,
                    AuthorEmployeeId = p.AuthorUser?.EmployeeId ?? string.Empty,
                    AuthorFullName = p.AuthorUser?.FullName ?? "Unknown",
                    AuthorDesignation = p.AuthorUser?.Designation,
                    AuthorProfilePhotoUrl = p.AuthorUser?.ProfilePhotoUrl,
                    PublishedDate = p.PublishedDate ?? p.CreatedDate,
                    AudienceType = p.AudienceType
                });
            }
        }

        if (string.IsNullOrEmpty(contentTypeFilter) || contentTypeFilter.Equals(ContentTypes.Article, StringComparison.OrdinalIgnoreCase))
        {
            var articles = await _repo.GetCandidateArticlesAsync(followedUserIds, currentUserId, 50);
            foreach (var a in articles)
            {
                candidateItems.Add(new FeedItemDto
                {
                    ContentType = ContentTypes.Article,
                    ContentId = a.ArticleId,
                    Title = a.Title,
                    TextSummary = a.Description ?? string.Empty,
                    ContentText = a.Description ?? string.Empty,
                    Status = a.Status ?? "Published",
                    ScheduledDate = a.ScheduledDate,
                    AttachmentUrl = a.ArticleAttachments.FirstOrDefault()?.FileUrl,
                    AttachmentUrls = a.ArticleAttachments.Select(aa => aa.FileUrl).ToList(),
                    Attachments = a.ArticleAttachments.Select(aa => new FeedAttachmentDto
                    {
                        AttachmentId = aa.AttachmentId,
                        FileUrl = aa.FileUrl,
                        FileType = aa.FileType
                    }).ToList(),
                    AuthorUserId = a.AuthorUserId,
                    AuthorEmployeeId = a.AuthorUser?.EmployeeId ?? string.Empty,
                    AuthorFullName = a.AuthorUser?.FullName ?? "Unknown",
                    AuthorDesignation = a.AuthorUser?.Designation,
                    AuthorProfilePhotoUrl = a.AuthorUser?.ProfilePhotoUrl,
                    PublishedDate = a.PublishedDate ?? a.CreatedDate,
                    AudienceType = AudienceTypes.Everyone
                });
            }
        }

        if (string.IsNullOrEmpty(contentTypeFilter) || contentTypeFilter.Equals(ContentTypes.Video, StringComparison.OrdinalIgnoreCase))
        {
            var videos = await _repo.GetCandidateVideosAsync(followedUserIds, currentUserId, 30);
            foreach (var v in videos)
            {
                candidateItems.Add(new FeedItemDto
                {
                    ContentType = ContentTypes.Video,
                    ContentId = v.VideoId,
                    Title = v.Title,
                    TextSummary = v.Description ?? string.Empty,
                    AttachmentUrl = v.ThumbnailUrl,
                    AuthorUserId = v.UploaderUserId,
                    AuthorEmployeeId = v.UploaderUser?.EmployeeId ?? string.Empty,
                    AuthorFullName = v.UploaderUser?.FullName ?? "Unknown",
                    AuthorDesignation = v.UploaderUser?.Designation,
                    AuthorProfilePhotoUrl = v.UploaderUser?.ProfilePhotoUrl,
                    PublishedDate = v.UploadedDate,
                    AudienceType = AudienceTypes.Everyone
                });
            }
        }

        if (string.IsNullOrEmpty(contentTypeFilter) || contentTypeFilter.Equals(ContentTypes.Podcast, StringComparison.OrdinalIgnoreCase))
        {
            var podcasts = await _repo.GetCandidatePodcastsAsync(followedUserIds, currentUserId, 30);
            foreach (var p in podcasts)
            {
                candidateItems.Add(new FeedItemDto
                {
                    ContentType = ContentTypes.Podcast,
                    ContentId = p.PodcastId,
                    Title = p.Title,
                    TextSummary = p.Description ?? string.Empty,
                    AttachmentUrl = p.CoverImageUrl,
                    AuthorUserId = p.UploaderUserId,
                    AuthorEmployeeId = p.UploaderUser?.EmployeeId ?? string.Empty,
                    AuthorFullName = p.UploaderUser?.FullName ?? "Unknown",
                    AuthorDesignation = p.UploaderUser?.Designation,
                    AuthorProfilePhotoUrl = p.UploaderUser?.ProfilePhotoUrl,
                    PublishedDate = p.UploadedDate,
                    AudienceType = AudienceTypes.Everyone
                });
            }
        }

        // 1. Paginate first to only process requested page items
        var paged = candidateItems
            .OrderByDescending(x => x.PublishedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        // 2. Batch fetch engagement summaries for paged items only
        var postIds = paged.Where(x => x.ContentType == ContentTypes.Post).Select(x => x.ContentId).ToList();
        var articleIds = paged.Where(x => x.ContentType == ContentTypes.Article).Select(x => x.ContentId).ToList();
        var videoIds = paged.Where(x => x.ContentType == ContentTypes.Video).Select(x => x.ContentId).ToList();
        var podcastIds = paged.Where(x => x.ContentType == ContentTypes.Podcast).Select(x => x.ContentId).ToList();

        var postSummaries = postIds.Count > 0 ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Post, postIds, currentUserId) : new();
        var articleSummaries = articleIds.Count > 0 ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Article, articleIds, currentUserId) : new();
        var videoSummaries = videoIds.Count > 0 ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Video, videoIds, currentUserId) : new();
        var podcastSummaries = podcastIds.Count > 0 ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Podcast, podcastIds, currentUserId) : new();

        foreach (var item in paged)
        {
            if (item.ContentType == ContentTypes.Post && postSummaries.TryGetValue(item.ContentId, out var s))
                item.EngagementSummary = s;
            else if (item.ContentType == ContentTypes.Article && articleSummaries.TryGetValue(item.ContentId, out s))
                item.EngagementSummary = s;
            else if (item.ContentType == ContentTypes.Video && videoSummaries.TryGetValue(item.ContentId, out s))
                item.EngagementSummary = s;
            else if (item.ContentType == ContentTypes.Podcast && podcastSummaries.TryGetValue(item.ContentId, out s))
                item.EngagementSummary = s;
            else
                item.EngagementSummary = new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = item.ContentType, ContentId = item.ContentId };

            item.HotScore = ComputeHotScore(item.EngagementSummary.EngagementScore, item.PublishedDate);
        }

        return paged;
    }

    public async Task<List<FeedItemDto>> GetHotFeedAsync(int currentUserId, string window, int top = 10)
    {
        if (!FeedWindows.IsValid(window)) window = FeedWindows.Daily;
        if (top <= 0 || top > 50) top = 10;

        int windowHours = FeedWindows.GetHours(window);
        var cutoff = Knome.API.Common.KnomeTime.Now.AddHours(-windowHours);

        var allRecentItems = new List<FeedItemDto>();

        // Fetch recent posts
        var posts = await _db.Posts.Include(p => p.AuthorUser).Include(p => p.PostAttachments).Where(p => p.CreatedDate >= cutoff && p.AudienceType == AudienceTypes.Everyone).Take(50).ToListAsync();
        foreach (var p in posts)
        {
            var summary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, p.PostId, currentUserId);
            var score = ComputeHotScore(summary.EngagementScore, p.CreatedDate);
            await _repo.UpdateOrAddHotScoreCacheAsync(new HotPostsScoreCache { ContentType = ContentTypes.Post, ContentId = p.PostId, Window = window, Score = score, CalculatedAt = Knome.API.Common.KnomeTime.Now });

            allRecentItems.Add(new FeedItemDto
            {
                ContentType = ContentTypes.Post,
                ContentId = p.PostId,
                Title = string.Empty,
                TextSummary = p.ContentText.Length > 200 ? p.ContentText.Substring(0, 197) + "..." : p.ContentText,
                ContentText = p.ContentText,
                Status = p.Status ?? "Published",
                ScheduledDate = p.ScheduledDate,
                AttachmentUrl = p.PostAttachments.FirstOrDefault()?.FileUrl,
                AttachmentUrls = p.PostAttachments.Select(pa => pa.FileUrl).ToList(),
                Attachments = p.PostAttachments.Select(pa => new FeedAttachmentDto
                {
                    AttachmentId = pa.AttachmentId,
                    FileUrl = pa.FileUrl,
                    FileType = pa.FileType
                }).ToList(),
                AuthorUserId = p.AuthorUserId,
                AuthorEmployeeId = p.AuthorUser?.EmployeeId ?? string.Empty,
                AuthorFullName = p.AuthorUser?.FullName ?? "Unknown",
                AuthorDesignation = p.AuthorUser?.Designation,
                AuthorProfilePhotoUrl = p.AuthorUser?.ProfilePhotoUrl,
                PublishedDate = p.PublishedDate ?? p.CreatedDate,
                AudienceType = p.AudienceType,
                EngagementSummary = summary,
                HotScore = score
            });
        }

        // Fetch recent articles
        var articles = await _db.Articles.Include(a => a.AuthorUser).Include(a => a.ArticleAttachments).Where(a => (a.PublishedDate ?? a.CreatedDate) >= cutoff && a.Status == ArticleStatuses.Published).Take(50).ToListAsync();
        foreach (var a in articles)
        {
            var summary = await _interactionService.GetContentSummaryAsync(ContentTypes.Article, a.ArticleId, currentUserId);
            var pubDate = a.PublishedDate ?? a.CreatedDate;
            var score = ComputeHotScore(summary.EngagementScore, pubDate);
            await _repo.UpdateOrAddHotScoreCacheAsync(new HotPostsScoreCache { ContentType = ContentTypes.Article, ContentId = a.ArticleId, Window = window, Score = score, CalculatedAt = Knome.API.Common.KnomeTime.Now });

            allRecentItems.Add(new FeedItemDto
            {
                ContentType = ContentTypes.Article,
                ContentId = a.ArticleId,
                Title = a.Title,
                TextSummary = a.Description ?? string.Empty,
                ContentText = a.Description ?? string.Empty,
                Status = a.Status ?? "Published",
                ScheduledDate = a.ScheduledDate,
                AttachmentUrl = a.ArticleAttachments.FirstOrDefault()?.FileUrl,
                AttachmentUrls = a.ArticleAttachments.Select(aa => aa.FileUrl).ToList(),
                Attachments = a.ArticleAttachments.Select(aa => new FeedAttachmentDto
                {
                    AttachmentId = aa.AttachmentId,
                    FileUrl = aa.FileUrl,
                    FileType = aa.FileType
                }).ToList(),
                AuthorUserId = a.AuthorUserId,
                AuthorEmployeeId = a.AuthorUser?.EmployeeId ?? string.Empty,
                AuthorFullName = a.AuthorUser?.FullName ?? "Unknown",
                AuthorDesignation = a.AuthorUser?.Designation,
                AuthorProfilePhotoUrl = a.AuthorUser?.ProfilePhotoUrl,
                PublishedDate = pubDate,
                AudienceType = AudienceTypes.Everyone,
                EngagementSummary = summary,
                HotScore = score
            });
        }

        return allRecentItems
            .OrderByDescending(x => x.HotScore)
            .Take(top)
            .ToList();
    }

    public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(int currentUserId)
    {
        var karma = await _karmaService.GetMyBalanceAsync(currentUserId);
        var unreadNotifs = await _db.Notifications.CountAsync(n => n.UserId == currentUserId && !n.IsRead);
        var personalized = await GetPersonalizedFeedAsync(currentUserId, null, 1, 10);
        var hot = await GetHotFeedAsync(currentUserId, FeedWindows.Daily, 5);

        return new DashboardSummaryDto
        {
            CurrentUserKarma = karma,
            UnreadNotificationsCount = unreadNotifs,
            PersonalizedFeed = personalized,
            TopHotPosts = hot
        };
    }

    private decimal ComputeHotScore(long engagementScore, DateTime publishedDate)
    {
        double ageInHours = (Knome.API.Common.KnomeTime.Now - publishedDate).TotalHours;
        if (ageInHours < 0) ageInHours = 0;
        double denominator = Math.Pow(ageInHours + 2.0, 1.5);
        if (denominator == 0) denominator = 1.0;
        double score = engagementScore / denominator;
        return (decimal)Math.Round(score, 2);
    }
}
