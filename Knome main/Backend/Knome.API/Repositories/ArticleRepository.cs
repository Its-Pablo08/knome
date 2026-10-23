using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class ArticleRepository : IArticleRepository
{
    private readonly KnomeDbContext _db;

    public ArticleRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<Article?> GetArticleByIdAsync(long articleId)
    {
        return await _db.Articles
            .Include(a => a.AuthorUser)
            .Include(a => a.Category)
            .Include(a => a.ArticleTags)
            .Include(a => a.ArticleAttachments)
            .Include(a => a.ArticleVersions)
            .ThenInclude(v => v.EditedByUser)
            .FirstOrDefaultAsync(a => a.ArticleId == articleId);
    }

    public async Task<List<Article>> GetArticlesAsync(int? categoryId, string? tag, string? status, string? search, int pageNumber, int pageSize, int currentUserId = 0)
    {
        var nowIst = Knome.API.Common.KnomeTime.Now;

        // Auto-transition any due scheduled articles
        try
        {
            await PublishDueScheduledArticlesAsync();
        }
        catch { }

        var query = _db.Articles
            .Include(a => a.AuthorUser)
            .Include(a => a.Category)
            .Include(a => a.ArticleTags)
            .Include(a => a.ArticleAttachments)
            .Include(a => a.ArticleVersions)
            .Where(a => a.Status != "Removed" && a.Status != "Deleted")
            .AsQueryable();

        if (categoryId.HasValue)
            query = query.Where(a => a.CategoryId == categoryId.Value);

        if (!string.IsNullOrWhiteSpace(tag))
            query = query.Where(a => a.ArticleTags.Any(t => t.Tag == tag));

        if (!string.IsNullOrWhiteSpace(status))
        {
            if ((status == "Scheduled" || status == "Draft") && currentUserId > 0)
            {
                query = query.Where(a => a.Status == status && a.AuthorUserId == currentUserId);
            }
            else
            {
                query = query.Where(a => a.Status == status);
            }
        }
        else
        {
            if (currentUserId > 0)
            {
                query = query.Where(a => a.Status == "Published" || ((a.Status == "Scheduled" || a.Status == "Draft") && a.AuthorUserId == currentUserId));
            }
            else
            {
                query = query.Where(a => a.Status == "Published");
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a => a.Title.Contains(search) || (a.Description != null && a.Description.Contains(search)));

        return await query
            .OrderByDescending(a => a.PublishedDate ?? a.ScheduledDate ?? a.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Article>> PublishDueScheduledArticlesAsync()
    {
        var nowIst = Knome.API.Common.KnomeTime.Now;
        var dueArticles = await _db.Articles
            .Where(a => a.Status == "Scheduled" && (a.ScheduledDate == null || a.ScheduledDate <= nowIst))
            .ToListAsync();

        if (!dueArticles.Any()) return new List<Article>();

        foreach (var article in dueArticles)
        {
            article.Status = "Published";
            article.PublishedDate = article.ScheduledDate ?? nowIst;
        }

        await _db.SaveChangesAsync();
        return dueArticles;
    }

    public async Task<List<Article>> GetMyArticlesAsync(int authorUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await _db.Articles
            .Include(a => a.AuthorUser)
            .Include(a => a.Category)
            .Include(a => a.ArticleTags)
            .Include(a => a.ArticleAttachments)
            .Include(a => a.ArticleVersions)
            .Where(a => a.AuthorUserId == authorUserId)
            .OrderByDescending(a => a.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Article> AddArticleAsync(Article article, List<string> tags, List<string> attachmentUrls, ArticleVersion initialVersion)
    {
        _db.Articles.Add(article);
        await _db.SaveChangesAsync();

        var normalizedTags = (tags ?? new List<string>())
            .SelectMany(t => t.Split(new[] { ' ', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Length > 50 ? t.Substring(0, 50) : t)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var t in normalizedTags)
        {
            _db.ArticleTags.Add(new ArticleTag { ArticleId = article.ArticleId, Tag = t });
        }

        foreach (var url in attachmentUrls)
        {
            _db.ArticleAttachments.Add(new ArticleAttachment 
            { 
                ArticleId = article.ArticleId, 
                FileUrl = url, 
                FileType = DetermineFileType(url), 
                PublishedDate = Knome.API.Common.KnomeTime.Now 
            });
        }

        initialVersion.ArticleId = article.ArticleId;
        _db.ArticleVersions.Add(initialVersion);

        await _db.SaveChangesAsync();

        return (await GetArticleByIdAsync(article.ArticleId))!;
    }

    public async Task UpdateArticleAsync(Article article, List<string> tags, List<string> attachmentUrls, ArticleVersion? newVersionOrNull)
    {
        // Update tags
        var existingTags = await _db.ArticleTags.Where(at => at.ArticleId == article.ArticleId).ToListAsync();
        _db.ArticleTags.RemoveRange(existingTags);

        var normalizedTags = (tags ?? new List<string>())
            .SelectMany(t => t.Split(new[] { ' ', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Length > 50 ? t.Substring(0, 50) : t)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var t in normalizedTags)
        {
            _db.ArticleTags.Add(new ArticleTag { ArticleId = article.ArticleId, Tag = t });
        }

        // Update attachments
        var existingAttachments = await _db.ArticleAttachments.Where(aa => aa.ArticleId == article.ArticleId).ToListAsync();
        _db.ArticleAttachments.RemoveRange(existingAttachments);

        foreach (var url in attachmentUrls)
        {
            _db.ArticleAttachments.Add(new ArticleAttachment { ArticleId = article.ArticleId, FileUrl = url, FileType = DetermineFileType(url) });
        }

        if (newVersionOrNull != null)
        {
            newVersionOrNull.ArticleId = article.ArticleId;
            _db.ArticleVersions.Add(newVersionOrNull);
        }

        _db.Articles.Update(article);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteArticleAsync(Article article)
    {
        var versions = await _db.ArticleVersions.Where(av => av.ArticleId == article.ArticleId).ToListAsync();
        _db.ArticleVersions.RemoveRange(versions);

        var tags = await _db.ArticleTags.Where(at => at.ArticleId == article.ArticleId).ToListAsync();
        _db.ArticleTags.RemoveRange(tags);

        var attachments = await _db.ArticleAttachments.Where(aa => aa.ArticleId == article.ArticleId).ToListAsync();
        _db.ArticleAttachments.RemoveRange(attachments);

        // Remove Reactions
        var reactions = await _db.Reactions.Where(r => r.ContentId == article.ArticleId && r.ContentType == "Article").ToListAsync();
        _db.Reactions.RemoveRange(reactions);

        // Remove Comments
        var comments = await _db.Comments.Where(c => c.ContentId == article.ArticleId && c.ContentType == "Article").ToListAsync();
        _db.Comments.RemoveRange(comments);

        // Remove Bookmarks
        var bookmarks = await _db.Bookmarks.Where(b => b.ContentId == article.ArticleId && b.ContentType == "Article").ToListAsync();
        _db.Bookmarks.RemoveRange(bookmarks);

        // Remove Shares
        var shares = await _db.Shares.Where(s => s.ContentId == article.ArticleId && s.ContentType == "Article").ToListAsync();
        _db.Shares.RemoveRange(shares);

        // Remove KarmaTransactions
        var karmaTx = await _db.KarmaTransactions.Where(kt => kt.RelatedContentId == article.ArticleId && kt.RelatedContentType == "Article").ToListAsync();
        _db.KarmaTransactions.RemoveRange(karmaTx);

        _db.Articles.Remove(article);
        await _db.SaveChangesAsync();
    }

    public async Task IncrementViewCountAsync(long articleId)
    {
        var article = await _db.Articles.FindAsync(articleId);
        if (article != null)
        {
            article.ViewCount++;
            await _db.SaveChangesAsync();
        }
    }

    private static string DetermineFileType(string url)
    {
        var ext = Path.GetExtension(url)?.ToLowerInvariant() ?? "";
        return ext switch
        {
            ".mp3" or ".wav" or ".ogg" or ".m4a" or ".aac" or ".flac" => "Audio",
            ".mp4" or ".webm" or ".mov" or ".m4v" or ".mkv" => "Video",
            ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".svg" or ".bmp" => "Image",
            _ => "Document"
        };
    }
}
