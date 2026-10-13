using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class PostRepository : IPostRepository
{
    private readonly KnomeDbContext _db;

    public PostRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<Post?> GetPostByIdAsync(long postId)
    {
        return await _db.Posts
            .Include(p => p.AuthorUser)
            .Include(p => p.PostAttachments)
            .Include(p => p.MentionedUsers)
            .FirstOrDefaultAsync(p => p.PostId == postId);
    }

    public async Task<List<Post>> GetPostsAsync(string? audienceType, string? search, int pageNumber, int pageSize, int currentUserId = 0)
    {
        var nowIst = Knome.API.Common.KnomeTime.Now;
        var retentionCutoff = nowIst.AddMonths(-6);

        // Auto-transition any due scheduled posts
        try
        {
            await PublishDueScheduledPostsAsync();
        }
        catch { /* best-effort non-blocking */ }

        var query = _db.Posts
            .Include(p => p.AuthorUser)
            .Include(p => p.PostAttachments)
            .Include(p => p.MentionedUsers)
            .Where(p => p.CreatedDate >= retentionCutoff && 
                        (string.IsNullOrEmpty(p.Status) || 
                         p.Status == "Published" || 
                         (p.AuthorUserId == currentUserId)))
            .AsQueryable();

        if (currentUserId > 0)
        {
            query = query.Where(p => p.AuthorUserId == currentUserId ||
                                     p.AudienceType == "Everyone" ||
                                     p.AudienceType == "Public" ||
                                     string.IsNullOrEmpty(p.AudienceType) ||
                                     ((p.AudienceType == "Connections" || p.AudienceType == "SpecificConnections") && p.MentionedUsers.Any(mu => mu.UserId == currentUserId)) ||
                                     p.AudienceType == "Community");
        }
        else
        {
            query = query.Where(p => p.AudienceType == "Everyone" || p.AudienceType == "Public" || string.IsNullOrEmpty(p.AudienceType));
        }

        if (!string.IsNullOrWhiteSpace(audienceType))
            query = query.Where(p => p.AudienceType == audienceType);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p => p.ContentText.Contains(search));

        return await query
            .OrderByDescending(p => p.PublishedDate ?? p.ScheduledDate ?? p.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Post>> PublishDueScheduledPostsAsync()
    {
        var nowIst = Knome.API.Common.KnomeTime.Now;
        var duePosts = await _db.Posts
            .Where(p => p.Status == "Scheduled" && (p.ScheduledDate == null || p.ScheduledDate <= nowIst))
            .ToListAsync();

        if (!duePosts.Any()) return new List<Post>();

        foreach (var post in duePosts)
        {
            post.Status = "Published";
            post.PublishedDate = post.ScheduledDate ?? nowIst;
        }

        await _db.SaveChangesAsync();
        return duePosts;
    }

    public async Task<List<Post>> GetMyPostsAsync(int authorUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await _db.Posts
            .Include(p => p.AuthorUser)
            .Include(p => p.PostAttachments)
            .Include(p => p.MentionedUsers)
            .Where(p => p.AuthorUserId == authorUserId)
            .OrderByDescending(p => p.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Post> AddPostAsync(Post post, List<string> attachmentUrls, List<string> attachmentTypes, List<int> mentionedUserIds)
    {
        _db.Posts.Add(post);
        await _db.SaveChangesAsync();

        for (int i = 0; i < attachmentUrls.Count; i++)
        {
            var url = attachmentUrls[i];
            if (string.IsNullOrWhiteSpace(url) || url.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
                continue;
            var type = (attachmentTypes != null && i < attachmentTypes.Count) ? attachmentTypes[i] : AttachmentTypes.Document;
            
            _db.PostAttachments.Add(new PostAttachment
            {
                PostId = post.PostId,
                FileUrl = url,
                FileType = type,
                PublishedDate = Knome.API.Common.KnomeTime.Now
            });
        }

        if (mentionedUserIds.Any())
        {
            var users = await _db.Users.Where(u => mentionedUserIds.Contains(u.UserId)).ToListAsync();
            foreach (var u in users)
            {
                post.MentionedUsers.Add(u);
            }
        }

        await _db.SaveChangesAsync();

        return (await GetPostByIdAsync(post.PostId))!;
    }

    public async Task UpdatePostAsync(Post post, List<string> attachmentUrls, List<string> attachmentTypes, List<int> mentionedUserIds)
    {
        // Update attachments
        var existingAttachments = await _db.PostAttachments.Where(pa => pa.PostId == post.PostId).ToListAsync();
        _db.PostAttachments.RemoveRange(existingAttachments);

        for (int i = 0; i < attachmentUrls.Count; i++)
        {
            var url = attachmentUrls[i];
            if (string.IsNullOrWhiteSpace(url) || url.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
                continue;
            var type = (attachmentTypes != null && i < attachmentTypes.Count) ? attachmentTypes[i] : AttachmentTypes.Document;
            
            _db.PostAttachments.Add(new PostAttachment
            {
                PostId = post.PostId,
                FileUrl = url,
                FileType = type,
                PublishedDate = Knome.API.Common.KnomeTime.Now
            });
        }

        // Update mentions
        post.MentionedUsers.Clear();
        if (mentionedUserIds.Any())
        {
            var users = await _db.Users.Where(u => mentionedUserIds.Contains(u.UserId)).ToListAsync();
            foreach (var u in users)
            {
                post.MentionedUsers.Add(u);
            }
        }

        _db.Posts.Update(post);
        await _db.SaveChangesAsync();
    }

    public async Task DeletePostAsync(Post post)
    {
        // 1. Clear many-to-many audience and mention tables to prevent FK constraint violations
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[PostMentions] WHERE [PostId] = {0}", post.PostId);
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[PostAudienceCommunities] WHERE [PostId] = {0}", post.PostId);
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[PostAudienceUsers] WHERE [PostId] = {0}", post.PostId);
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[CommunityPosts] WHERE [PostId] = {0}", post.PostId);
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[PostAttachments] WHERE [PostId] = {0}", post.PostId);

        // 2. Remove comment reactions, comment bookmarks, and comments (replies first, then top-level comments)
        await _db.Database.ExecuteSqlRawAsync(@"
            DELETE FROM [dbo].[Reactions] WHERE [ContentType] = 'Comment' AND [ContentId] IN (SELECT [CommentId] FROM [dbo].[Comments] WHERE [ContentType] = 'Post' AND [ContentId] = {0});
            DELETE FROM [dbo].[Bookmarks] WHERE [ContentType] = 'Comment' AND [ContentId] IN (SELECT [CommentId] FROM [dbo].[Comments] WHERE [ContentType] = 'Post' AND [ContentId] = {0});
            DELETE FROM [dbo].[Comments] WHERE [ContentType] = 'Post' AND [ContentId] = {0} AND [ParentCommentId] IS NOT NULL;
            DELETE FROM [dbo].[Comments] WHERE [ContentType] = 'Post' AND [ContentId] = {0};
        ", post.PostId);

        // 3. Remove interactions, karma transactions, moderation reports, and notifications for this post
        await _db.Database.ExecuteSqlRawAsync(@"
            DELETE FROM [dbo].[Reactions] WHERE [ContentType] = 'Post' AND [ContentId] = {0};
            DELETE FROM [dbo].[Bookmarks] WHERE [ContentType] = 'Post' AND [ContentId] = {0};
            DELETE FROM [dbo].[Shares] WHERE [ContentType] = 'Post' AND [ContentId] = {0};
            DELETE FROM [dbo].[KarmaTransactions] WHERE [RelatedContentType] = 'Post' AND [RelatedContentId] = {0};
            DELETE FROM [dbo].[ModerationReports] WHERE [ContentType] = 'Post' AND [ContentId] = {0};
            DELETE FROM [dbo].[Notifications] WHERE [RelatedContentType] = 'Post' AND [RelatedContentId] = {0};
        ", post.PostId);

        // 4. Finally remove the post record
        await _db.Database.ExecuteSqlRawAsync("DELETE FROM [dbo].[Posts] WHERE [PostId] = {0}", post.PostId);
    }
}
