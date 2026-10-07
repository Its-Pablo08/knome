using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Knome.API.Data;
using Knome.API.DTOs.Search;
using Knome.API.Interfaces;
using Knome.API.Models;

namespace Knome.API.Repositories;

/// <summary>
/// Data-access for the unified search &amp; discovery engine (FR-SD-01..05).
/// Filtering and projection run in SQL; ordering and pagination of the merged,
/// cross-type result set run in memory.
/// </summary>
public class SearchRepository : ISearchRepository
{
    private readonly KnomeDbContext _context;

    private const string ContentGroup = "Content";

    public SearchRepository(KnomeDbContext context)
    {
        _context = context;
    }

    // ------------------------------------------------------------------ //

    public async Task<GlobalSearchResultDto> SearchGlobalAsync(GlobalSearchRequestDto request)
    {
        var types = ResolveTypes(request.ContentType);

        var all = new List<SearchItemDto>();

        if (types.Contains("User")) all.AddRange(await QueryUsers(request));
        if (types.Contains("Community")) all.AddRange(await QueryCommunities(request));
        if (types.Contains("Post")) all.AddRange(await QueryPosts(request));
        if (types.Contains("Article")) all.AddRange(await QueryArticles(request));
        if (types.Contains("Video")) all.AddRange(await QueryVideos(request));
        if (types.Contains("Podcast")) all.AddRange(await QueryPodcasts(request));
        if (types.Contains("Job")) all.AddRange(await QueryJobs(request));
        if (types.Contains("Wiki")) all.AddRange(await QueryWikis(request));

        var typeCounts = all
            .GroupBy(x => x.ContentType)
            .ToDictionary(g => g.Key, g => g.Count());

        var sorted = SortResults(all, request).ToList();
        var total = sorted.Count;

        var paged = sorted
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToList();

        return new GlobalSearchResultDto
        {
            Items = paged,
            TotalCount = total,
            PageNumber = request.PageNumber,
            PageSize = request.PageSize,
            TypeCounts = typeCounts
        };
    }

    public async Task<List<SearchItemDto>> SearchUsersAsync(string query, int pageNumber, int pageSize)
        => (await SearchGlobalAsync(BuildRequest(query, pageNumber, pageSize, "User"))).Items;

    public async Task<List<SearchItemDto>> SearchCommunitiesAsync(string query, int pageNumber, int pageSize)
        => (await SearchGlobalAsync(BuildRequest(query, pageNumber, pageSize, "Community"))).Items;

    public async Task<List<SearchItemDto>> SearchContentAsync(string query, string? contentType, int pageNumber, int pageSize)
        => (await SearchGlobalAsync(BuildRequest(query, pageNumber, pageSize, contentType ?? ContentGroup))).Items;

    // ------------------------------------------------------------------ //
    // Search history (FR-SD-05)
    // ------------------------------------------------------------------ //

    public async Task RecordSearchAsync(int userId, string term)
    {
        var cleanTerm = term?.Trim();
        if (string.IsNullOrWhiteSpace(cleanTerm) || cleanTerm.Length < 3) return;

        // SearchHistory is a keyless table (as scaffolded), so inserts are issued as raw SQL.
        // Delete prior instance of this term for this user so search history is clean and deduplicated,
        // then insert with the latest timestamp.
        await _context.Database.ExecuteSqlRawAsync(
            "DELETE FROM SearchHistory WHERE UserId = {0} AND SearchTerm = {1}; INSERT INTO SearchHistory (UserId, SearchTerm, SearchedDate) VALUES ({0}, {1}, GETDATE());",
            userId, cleanTerm);
    }

    public async Task<List<SearchHistoryDto>> GetRecentSearchesAsync(int userId, int count = 10)
    {
        var recent = await _context.SearchHistories
            .Where(h => h.UserId == userId)
            .OrderByDescending(h => h.SearchedDate)
            .Take(count * 3)
            .ToListAsync();

        return recent
            .GroupBy(h => h.SearchTerm)
            .Select(g => g.OrderByDescending(h => h.SearchedDate).First())
            .OrderByDescending(h => h.SearchedDate)
            .Take(count)
            .Select(h => new SearchHistoryDto
            {
                SearchTerm = h.SearchTerm,
                SearchedDate = h.SearchedDate
            })
            .ToList();
    }
    public async Task ClearSearchHistoryAsync(int userId, string? term = null)
    {
        if (string.IsNullOrWhiteSpace(term))
        {
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM SearchHistory WHERE UserId = {0}", userId);
        }
        else
        {
            await _context.Database.ExecuteSqlRawAsync(
                "DELETE FROM SearchHistory WHERE UserId = {0} AND SearchTerm = {1}", userId, term);
        }
    }

    public async Task<List<SearchSuggestionDto>> GetSuggestionsAsync(string query, int count = 8)
    {
        if (string.IsNullOrWhiteSpace(query))
            return new List<SearchSuggestionDto>();

        var req = new GlobalSearchRequestDto
        {
            Query = query.Trim(),
            PageNumber = 1,
            PageSize = count * 2,
            SortBy = "relevance"
        };

        var searchResult = await SearchGlobalAsync(req);
        return searchResult.Items
            .OrderByDescending(x => RelevanceScore(x, query.Trim().ToLower()))
            .ThenByDescending(x => x.CreatedDate)
            .Take(count)
            .Select(item => new SearchSuggestionDto
            {
                Id = item.Id,
                ContentType = item.ContentType,
                Title = item.Title,
                Subtitle = !string.IsNullOrEmpty(item.Summary) ? item.Summary : (!string.IsNullOrEmpty(item.AuthorFullName) ? $"By {item.AuthorFullName}" : item.ContentType),
                ThumbnailUrl = item.ThumbnailUrl ?? item.AuthorProfilePhotoUrl,
                CategoryName = item.CategoryName ?? item.DepartmentName
            })
            .ToList();
    }

    public async Task<List<string>> GetTrendingSearchesAsync(int count = 10)
    {
        var dateLimit = Knome.API.Common.KnomeTime.Now.AddDays(-30);
        var trending = await _context.SearchHistories
            .Where(h => h.SearchedDate >= dateLimit && !string.IsNullOrWhiteSpace(h.SearchTerm))
            .GroupBy(h => h.SearchTerm.Trim().ToLower())
            .Select(g => new { Term = g.Select(x => x.SearchTerm).FirstOrDefault(), Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(count)
            .ToListAsync();

        var terms = trending.Select(t => t.Term ?? string.Empty).Where(t => !string.IsNullOrEmpty(t)).ToList();
        if (!terms.Any())
        {
            terms = new List<string> { "React", "ASP.NET Core", "Architecture", "Design System", "Engineering", "Announcements" };
        }
        return terms;
    }

    // ------------------------------------------------------------------ //
    // Per-type query builders
    // ------------------------------------------------------------------ //

    private async Task<List<SearchItemDto>> QueryUsers(GlobalSearchRequestDto req)
    {
        // Users have no category/tags and are not "authored", so these filters exclude them.
        if (req.CategoryId.HasValue || HasTags(req) || !string.IsNullOrWhiteSpace(req.Author))
            return new List<SearchItemDto>();

        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Users.AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(u => u.IsActive && (
                u.FullName.ToLower().Contains(ql) ||
                u.EmployeeId.ToLower().Contains(ql) ||
                u.Email.ToLower().Contains(ql) ||
                (u.Designation != null && u.Designation.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    u.FullName.ToLower().Contains(cleanQ) ||
                    u.EmployeeId.ToLower().Contains(cleanQ) ||
                    u.Email.ToLower().Contains(cleanQ) ||
                    (u.Designation != null && u.Designation.ToLower().Contains(cleanQ))
                ))
            ));
        }
        else
        {
            query = query.Where(u => u.IsActive);
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(u => u.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(u => u.CreatedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(u => u.CreatedDate <= req.DateTo.Value);

        return await query.Select(u => new SearchItemDto
        {
            ContentType = "User",
            Id = u.UserId,
            Title = u.FullName,
            Summary = $"{u.Designation} | {u.Email}",
            AuthorFullName = u.FullName,
            AuthorEmployeeId = u.EmployeeId,
            CreatedDate = u.CreatedDate,
            EngagementScore = 0,
            PopularityScore = 0,
            AuthorProfilePhotoUrl = u.ProfilePhotoUrl,
            DepartmentName = u.Department != null ? u.Department.Name : null
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryCommunities(GlobalSearchRequestDto req)
    {
        // Communities are not department-scoped or authored.
        if (req.DepartmentId.HasValue || !string.IsNullOrWhiteSpace(req.Author))
            return new List<SearchItemDto>();

        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Communities.Where(c => c.IsActive).AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(c =>
                c.Name.ToLower().Contains(ql) ||
                (c.Description != null && c.Description.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    c.Name.ToLower().Contains(cleanQ) ||
                    (c.Description != null && c.Description.ToLower().Contains(cleanQ))
                ))
            );
        }

        if (req.CategoryId.HasValue)
            query = query.Where(c => c.CategoryId == req.CategoryId);

        if (req.DateFrom.HasValue) query = query.Where(c => c.CreatedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(c => c.CreatedDate <= req.DateTo.Value);

        return await query.Select(c => new SearchItemDto
        {
            ContentType = "Community",
            Id = c.CommunityId,
            Title = c.Name,
            Summary = c.Description ?? string.Empty,
            AuthorFullName = string.Empty,
            AuthorEmployeeId = string.Empty,
            CreatedDate = c.CreatedDate,
            EngagementScore = 0,
            PopularityScore = 0,
            ThumbnailUrl = c.ThumbnailUrl,
            CategoryName = c.Category!.Name
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryPosts(GlobalSearchRequestDto req)
    {
        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Posts.AsQueryable();

        if (HasTags(req))
        {
            var lowerTags = req.Tags!.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim().ToLower().TrimStart('#')).ToList();
            query = query.Where(p => lowerTags.Any(t => p.ContentText.ToLower().Contains("#" + t) || p.ContentText.ToLower().Contains(t)));
        }

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(p => (p.AudienceType == "Everyone" || p.AudienceType == "Community") && (
                p.ContentText.ToLower().Contains(ql) ||
                (!string.IsNullOrEmpty(cleanQ) && p.ContentText.ToLower().Contains(cleanQ)) ||
                p.PostAttachments.Any(a => a.FileUrl.ToLower().Contains(ql) || (!string.IsNullOrEmpty(cleanQ) && a.FileUrl.ToLower().Contains(cleanQ)))
            ));
        }
        else
        {
            query = query.Where(p => p.AudienceType == "Everyone" || p.AudienceType == "Community");
        }

        if (!string.IsNullOrWhiteSpace(req.Author))
        {
            var authorQ = req.Author.Trim().ToLower();
            query = query.Where(p => p.AuthorUser != null && p.AuthorUser.FullName.ToLower().Contains(authorQ));
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(p => p.AuthorUser != null && p.AuthorUser.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(p => p.CreatedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(p => p.CreatedDate <= req.DateTo.Value);

        return await query.Select(p => new SearchItemDto
        {
            ContentType = "Post",
            Id = p.PostId,
            Title = p.ContentText.Length > 60
                ? p.ContentText.Substring(0, 60).Trim() + "..."
                : (string.IsNullOrWhiteSpace(p.ContentText) ? "Post" : p.ContentText.Trim()),
            Summary = p.ContentText.Length > 150
                ? p.ContentText.Substring(0, 150).Trim() + "..."
                : p.ContentText,
            AuthorFullName = p.AuthorUser != null ? p.AuthorUser.FullName : string.Empty,
            AuthorEmployeeId = p.AuthorUser != null ? p.AuthorUser.EmployeeId : string.Empty,
            CreatedDate = p.CreatedDate,
            EngagementScore = 0,
            PopularityScore = 0,
            AuthorProfilePhotoUrl = p.AuthorUser != null ? p.AuthorUser.ProfilePhotoUrl : null
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryArticles(GlobalSearchRequestDto req)
    {
        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Articles.AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(a => a.Status == "Published" && (
                a.Title.ToLower().Contains(ql) ||
                (a.Description != null && a.Description.ToLower().Contains(ql)) ||
                a.ContentHtml.ToLower().Contains(ql) ||
                a.ArticleTags.Any(t => t.Tag.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    a.Title.ToLower().Contains(cleanQ) ||
                    (a.Description != null && a.Description.ToLower().Contains(cleanQ)) ||
                    a.ContentHtml.ToLower().Contains(cleanQ) ||
                    a.ArticleTags.Any(t => t.Tag.ToLower().Contains(cleanQ))
                ))
            ));
        }
        else
        {
            query = query.Where(a => a.Status == "Published");
        }

        if (req.CategoryId.HasValue)
            query = query.Where(a => a.CategoryId == req.CategoryId);

        if (HasTags(req))
            query = query.Where(a => a.ArticleTags.Any(t => req.Tags!.Contains(t.Tag)));

        if (!string.IsNullOrWhiteSpace(req.Author))
        {
            var authorQ = req.Author.Trim().ToLower();
            query = query.Where(a => a.AuthorUser != null && a.AuthorUser.FullName.ToLower().Contains(authorQ));
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(a => a.AuthorUser != null && a.AuthorUser.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(a => a.CreatedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(a => a.CreatedDate <= req.DateTo.Value);

        return await query.Select(a => new SearchItemDto
        {
            ContentType = "Article",
            Id = a.ArticleId,
            Title = a.Title,
            Summary = a.Description ?? string.Empty,
            AuthorFullName = a.AuthorUser != null ? a.AuthorUser.FullName : string.Empty,
            AuthorEmployeeId = a.AuthorUser != null ? a.AuthorUser.EmployeeId : string.Empty,
            CreatedDate = a.CreatedDate,
            EngagementScore = 0,
            PopularityScore = a.ViewCount,
            AuthorProfilePhotoUrl = a.AuthorUser != null ? a.AuthorUser.ProfilePhotoUrl : null,
            CategoryName = a.Category!.Name
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryVideos(GlobalSearchRequestDto req)
    {
        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Videos.AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(v =>
                v.Title.ToLower().Contains(ql) ||
                (v.Description != null && v.Description.ToLower().Contains(ql)) ||
                v.VideoTags.Any(t => t.Tag.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    v.Title.ToLower().Contains(cleanQ) ||
                    (v.Description != null && v.Description.ToLower().Contains(cleanQ)) ||
                    v.VideoTags.Any(t => t.Tag.ToLower().Contains(cleanQ))
                ))
            );
        }

        if (req.CategoryId.HasValue)
            query = query.Where(v => v.CategoryId == req.CategoryId);

        if (HasTags(req))
            query = query.Where(v => v.VideoTags.Any(t => req.Tags!.Contains(t.Tag)));

        if (!string.IsNullOrWhiteSpace(req.Author))
        {
            var authorQ = req.Author.Trim().ToLower();
            query = query.Where(v => v.UploaderUser != null && v.UploaderUser.FullName.ToLower().Contains(authorQ));
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(v => v.UploaderUser != null && v.UploaderUser.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(v => v.UploadedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(v => v.UploadedDate <= req.DateTo.Value);

        return await query.Select(v => new SearchItemDto
        {
            ContentType = "Video",
            Id = v.VideoId,
            Title = v.Title,
            Summary = v.Description ?? string.Empty,
            AuthorFullName = v.UploaderUser != null ? v.UploaderUser.FullName : string.Empty,
            AuthorEmployeeId = v.UploaderUser != null ? v.UploaderUser.EmployeeId : string.Empty,
            CreatedDate = v.UploadedDate,
            EngagementScore = 0,
            PopularityScore = v.ViewCount,
            ThumbnailUrl = v.ThumbnailUrl,
            AuthorProfilePhotoUrl = v.UploaderUser != null ? v.UploaderUser.ProfilePhotoUrl : null,
            CategoryName = v.Category!.Name
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryPodcasts(GlobalSearchRequestDto req)
    {
        // Podcasts carry no tags.
        if (HasTags(req))
            return new List<SearchItemDto>();

        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Podcasts.Where(p => p.IsActive).AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(p =>
                p.Title.ToLower().Contains(ql) ||
                (p.Description != null && p.Description.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    p.Title.ToLower().Contains(cleanQ) ||
                    (p.Description != null && p.Description.ToLower().Contains(cleanQ))
                ))
            );
        }

        if (req.CategoryId.HasValue)
            query = query.Where(p => p.CategoryId == req.CategoryId);

        if (!string.IsNullOrWhiteSpace(req.Author))
        {
            var authorQ = req.Author.Trim().ToLower();
            query = query.Where(p => p.UploaderUser != null && p.UploaderUser.FullName.ToLower().Contains(authorQ));
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(p => p.UploaderUser != null && p.UploaderUser.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(p => p.UploadedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(p => p.UploadedDate <= req.DateTo.Value);

        return await query.Select(p => new SearchItemDto
        {
            ContentType = "Podcast",
            Id = p.PodcastId,
            Title = p.Title,
            Summary = p.Description ?? string.Empty,
            AuthorFullName = p.UploaderUser != null ? p.UploaderUser.FullName : string.Empty,
            AuthorEmployeeId = p.UploaderUser != null ? p.UploaderUser.EmployeeId : string.Empty,
            CreatedDate = p.UploadedDate,
            EngagementScore = 0,
            PopularityScore = 0,
            ThumbnailUrl = p.CoverImageUrl,
            AuthorProfilePhotoUrl = p.UploaderUser != null ? p.UploaderUser.ProfilePhotoUrl : null,
            CategoryName = p.Category!.Name
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryJobs(GlobalSearchRequestDto req)
    {
        // Jobs have no category and are not "authored" content.
        if (req.CategoryId.HasValue || !string.IsNullOrWhiteSpace(req.Author) || HasTags(req))
            return new List<SearchItemDto>();

        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Jobs.AsQueryable();

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(j =>
                j.Title.ToLower().Contains(ql) ||
                j.Description.ToLower().Contains(ql) ||
                (j.SkillsRequired != null && j.SkillsRequired.ToLower().Contains(ql)) ||
                (j.Location != null && j.Location.ToLower().Contains(ql)) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    j.Title.ToLower().Contains(cleanQ) ||
                    j.Description.ToLower().Contains(cleanQ) ||
                    (j.SkillsRequired != null && j.SkillsRequired.ToLower().Contains(cleanQ)) ||
                    (j.Location != null && j.Location.ToLower().Contains(cleanQ))
                ))
            );
        }

        if (req.DepartmentId.HasValue)
            query = query.Where(j => j.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(j => j.PostedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(j => j.PostedDate <= req.DateTo.Value);

        return await query.Select(j => new SearchItemDto
        {
            ContentType = "Job",
            Id = j.JobId,
            Title = j.Title,
            Summary = j.Description,
            AuthorFullName = j.PostedByUser != null ? j.PostedByUser.FullName : string.Empty,
            AuthorEmployeeId = j.PostedByUser != null ? j.PostedByUser.EmployeeId : string.Empty,
            CreatedDate = j.PostedDate,
            EngagementScore = 0,
            PopularityScore = 0,
            DepartmentName = j.Department!.Name
        }).ToListAsync();
    }

    private async Task<List<SearchItemDto>> QueryWikis(GlobalSearchRequestDto req)
    {
        var (ql, cleanQ) = GetQueryTerms(req);
        var query = _context.Wikis
            .Include(w => w.CreatedByUser)
            .Include(w => w.Category)
            .Include(w => w.WikiTags)
            .Include(w => w.WikiSections)
            .Where(w => !w.IsDeleted && (w.Status == "Published" || w.Status == "Archived"))
            .AsQueryable();

        if (HasTags(req))
        {
            var lowerTags = req.Tags!.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim().ToLower().TrimStart('#')).ToList();
            query = query.Where(w => w.WikiTags.Any(t => lowerTags.Contains(t.Tag.ToLower())));
        }

        if (!string.IsNullOrEmpty(ql))
        {
            query = query.Where(w =>
                w.Title.ToLower().Contains(ql) ||
                (w.Description != null && w.Description.ToLower().Contains(ql)) ||
                w.ContentHtml.ToLower().Contains(ql) ||
                w.WikiTags.Any(t => t.Tag.ToLower().Contains(ql)) ||
                w.WikiSections.Any(s => !s.IsDeleted && (s.Title.ToLower().Contains(ql) || s.ContentHtml.ToLower().Contains(ql))) ||
                (!string.IsNullOrEmpty(cleanQ) && (
                    w.Title.ToLower().Contains(cleanQ) ||
                    (w.Description != null && w.Description.ToLower().Contains(cleanQ)) ||
                    w.ContentHtml.ToLower().Contains(cleanQ) ||
                    w.WikiTags.Any(t => t.Tag.ToLower().Contains(cleanQ)) ||
                    w.WikiSections.Any(s => !s.IsDeleted && (s.Title.ToLower().Contains(cleanQ) || s.ContentHtml.ToLower().Contains(cleanQ)))
                ))
            );
        }

        if (!string.IsNullOrWhiteSpace(req.Author))
        {
            var authorQ = req.Author.Trim().ToLower();
            query = query.Where(w => w.CreatedByUser != null && w.CreatedByUser.FullName.ToLower().Contains(authorQ));
        }

        if (req.CategoryId.HasValue)
            query = query.Where(w => w.CategoryId == req.CategoryId);

        if (req.DepartmentId.HasValue)
            query = query.Where(w => w.CreatedByUser != null && w.CreatedByUser.DepartmentId == req.DepartmentId);

        if (req.DateFrom.HasValue) query = query.Where(w => w.CreatedDate >= req.DateFrom.Value);
        if (req.DateTo.HasValue) query = query.Where(w => w.CreatedDate <= req.DateTo.Value);

        return await query.Select(w => new SearchItemDto
        {
            ContentType = "Wiki",
            Id = w.WikiId,
            Title = w.Title,
            Summary = w.Description ?? (w.ContentHtml.Length > 200 ? w.ContentHtml.Substring(0, 200) : w.ContentHtml),
            AuthorFullName = w.CreatedByUser != null ? w.CreatedByUser.FullName : string.Empty,
            AuthorEmployeeId = w.CreatedByUser != null ? w.CreatedByUser.EmployeeId : string.Empty,
            CreatedDate = w.CreatedDate,
            EngagementScore = w.ViewCount,
            PopularityScore = w.ViewCount,
            ThumbnailUrl = w.CoverImageUrl,
            AuthorProfilePhotoUrl = w.CreatedByUser != null ? w.CreatedByUser.ProfilePhotoUrl : null,
            CategoryName = w.Category != null ? w.Category.Name : null,
            DepartmentName = w.CreatedByUser != null && w.CreatedByUser.Department != null ? w.CreatedByUser.Department.Name : null,
            Tags = w.WikiTags.Select(t => t.Tag).ToList()
        }).ToListAsync();
    }

    // ------------------------------------------------------------------ //
    // Shared helpers
    // ------------------------------------------------------------------ //

    private static (string raw, string clean) GetQueryTerms(GlobalSearchRequestDto req)
    {
        var raw = (req.Query ?? string.Empty).Trim().ToLower();
        var clean = raw.StartsWith('#') ? raw.TrimStart('#').Trim() : raw;
        return (raw, clean);
    }

    private static string NormalisedQuery(GlobalSearchRequestDto req)
        => (req.Query ?? string.Empty).Trim().ToLower();

    private static bool HasTags(GlobalSearchRequestDto req)
        => req.Tags != null && req.Tags.Any(t => !string.IsNullOrWhiteSpace(t));

    private static List<string> ResolveTypes(string? contentType)
    {
        var all = new[] { "User", "Community", "Post", "Article", "Video", "Podcast", "Job", "Wiki" };

        if (string.Equals(contentType, ContentGroup, StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Post", "Article", "Video", "Podcast", "Wiki" };

        if (string.Equals(contentType, "People", StringComparison.OrdinalIgnoreCase) || string.Equals(contentType, "User", StringComparison.OrdinalIgnoreCase) || string.Equals(contentType, "Users", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "User" };

        if (string.Equals(contentType, "Documents", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Article", "Post", "Wiki" };

        if (string.Equals(contentType, "Hashtags", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Post", "Article", "Video" };

        if (string.Equals(contentType, "Posts", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Post" };

        if (string.Equals(contentType, "Articles", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Article" };

        if (string.Equals(contentType, "Videos", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Video" };

        if (string.Equals(contentType, "Podcasts", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Podcast" };

        if (string.Equals(contentType, "Communities", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Community" };

        if (string.Equals(contentType, "Jobs", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Job" };

        if (string.Equals(contentType, "Wikis", StringComparison.OrdinalIgnoreCase) || string.Equals(contentType, "Wiki", StringComparison.OrdinalIgnoreCase))
            return new List<string> { "Wiki" };

        if (!string.IsNullOrWhiteSpace(contentType) && Array.IndexOf(all, contentType) >= 0)
            return new List<string> { contentType! };

        return all.ToList();
    }

    private static GlobalSearchRequestDto BuildRequest(string query, int pageNumber, int pageSize, string contentType)
        => new GlobalSearchRequestDto
        {
            Query = query,
            PageNumber = pageNumber,
            PageSize = pageSize,
            ContentType = contentType,
            SortBy = "relevance",
            SortOrder = "desc"
        };

    private static IEnumerable<SearchItemDto> SortResults(List<SearchItemDto> items, GlobalSearchRequestDto req)
    {
        var q = NormalisedQuery(req);
        var sortBy = (req.SortBy ?? "relevance").ToLower();
        var desc = !string.Equals(req.SortOrder, "asc", StringComparison.OrdinalIgnoreCase);

        if (sortBy == "date")
            return desc ? items.OrderByDescending(x => x.CreatedDate) : items.OrderBy(x => x.CreatedDate);

        if (sortBy == "popularity")
            return desc
                ? items.OrderByDescending(x => x.PopularityScore).ThenByDescending(x => x.CreatedDate)
                : items.OrderBy(x => x.PopularityScore).ThenByDescending(x => x.CreatedDate);

        return desc
            ? items.OrderByDescending(x => RelevanceScore(x, q)).ThenByDescending(x => x.CreatedDate)
            : items.OrderBy(x => RelevanceScore(x, q)).ThenByDescending(x => x.CreatedDate);
    }

    private static int RelevanceScore(SearchItemDto item, string q)
    {
        if (string.IsNullOrEmpty(q)) return 0;

        var cleanQ = q.TrimStart('#');
        var score = 0;
        var titleLower = (item.Title ?? string.Empty).ToLower();
        var summaryLower = (item.Summary ?? string.Empty).ToLower();
        var authorLower = (item.AuthorFullName ?? string.Empty).ToLower();
        var qTokens = (q + " " + cleanQ).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct();

        // 1. Exact Title match
        if (titleLower == q || titleLower == cleanQ) score += 100;
        // 2. StartsWith Title match
        else if (titleLower.StartsWith(q) || titleLower.StartsWith(cleanQ)) score += 80;
        // 3. Contains full query
        else if (titleLower.Contains(q) || titleLower.Contains(cleanQ)) score += 50;

        // 4. Tokenized title and content matching
        foreach (var token in qTokens)
        {
            if (token.Length < 2) continue;
            if (titleLower.Contains(token)) score += 25;
            if (summaryLower.Contains(token)) score += 15;
            if (authorLower.Contains(token)) score += 15;

            if (item.Tags != null && item.Tags.Any(t => t.ToLower().Contains(token)))
                score += 30;
        }

        // 5. Engagement & Popularity boost
        if (item.EngagementScore > 0) score += (int)Math.Min(item.EngagementScore, 20);
        if (item.PopularityScore > 0) score += Math.Min(item.PopularityScore / 10, 15);

        item.CalculatedRelevanceScore = score;
        return score;
    }
}
