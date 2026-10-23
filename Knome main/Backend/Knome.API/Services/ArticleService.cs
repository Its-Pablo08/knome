using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Common;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Articles;
using Knome.API.DTOs.Categories;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Knome.API.Repositories;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class ArticleService : IArticleService
{
    private readonly IArticleRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly IKarmaService _karmaService;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly ISystemSettingService? _systemSettingService;

    public ArticleService(IArticleRepository repo, IContentInteractionService interactionService, IKarmaService karmaService, KnomeDbContext db, IMapper mapper, ISuspensionGuard suspensionGuard, ISystemSettingService? systemSettingService = null)
    {
        _repo = repo;
        _interactionService = interactionService;
        _karmaService = karmaService;
        _db = db;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _systemSettingService = systemSettingService;
    }

    private async Task CheckIsAuthorOrAdminAsync(Article article, int currentUserId)
    {
        if (article.AuthorUserId == currentUserId) return;

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" || 
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" || 
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            r.RoleName == Roles.Moderator || r.RoleCode == "MOD" ||
            (r.RoleName != null && (r.RoleName.Contains("Admin") || r.RoleName.Contains("Mod"))) ||
            (r.RoleCode != null && (r.RoleCode.Contains("ADM") || r.RoleCode.Contains("MOD")))))
        {
            throw new UnauthorizedException("You must be the author of this article or an Administrator/Moderator to modify/delete it.");
        }
    }

    private int CalculateAvgReadTimeSeconds(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return 0;
        var words = html.Split(new[] { ' ', '\n', '\r', '\t', '<', '>' }, StringSplitOptions.RemoveEmptyEntries);
        // Assuming average reading speed of 200 words per minute (~3.33 words per second)
        return (int)Math.Ceiling(words.Length / 3.33);
    }

    public async Task<ArticleDetailDto> GetArticleAsync(long articleId, int currentUserId)
    {
        var article = await _repo.GetArticleByIdAsync(articleId);
        if (article == null)
            throw new NotFoundException($"Article ID {articleId} not found.");

        if (currentUserId > 0)
        {
            var updatedViews = await _interactionService.RecordViewAsync(ContentTypes.Article, articleId, currentUserId);
            article.ViewCount = (int)updatedViews;
        }

        var dto = _mapper.Map<ArticleDetailDto>(article);
        dto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Article, articleId, currentUserId);
        return dto;
    }

    public async Task<List<ArticleDto>> GetArticlesAsync(int? categoryId, string? tag, string? status, string? search, int pageNumber, int pageSize, int currentUserId)
    {
        var articles = await _repo.GetArticlesAsync(categoryId, tag, status, search, pageNumber, pageSize, currentUserId);
        var ids = articles.Select(a => a.ArticleId).ToList();
        var summaries = ids.Count > 0 
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Article, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<ArticleDto>();
        foreach (var a in articles)
        {
            var dto = _mapper.Map<ArticleDto>(a);
            dto.EngagementSummary = summaries.TryGetValue(a.ArticleId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Article, ContentId = a.ArticleId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<List<ArticleDto>> GetMyArticlesAsync(int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await GetUserArticlesAsync(currentUserId, currentUserId, pageNumber, pageSize);
    }

    public async Task<List<ArticleDto>> GetUserArticlesAsync(int authorUserId, int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        var articles = await _repo.GetMyArticlesAsync(authorUserId, pageNumber, pageSize);
        var ids = articles.Select(a => a.ArticleId).ToList();
        var summaries = ids.Count > 0 
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Article, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<ArticleDto>();
        foreach (var a in articles)
        {
            var dto = _mapper.Map<ArticleDto>(a);
            dto.EngagementSummary = summaries.TryGetValue(a.ArticleId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Article, ContentId = a.ArticleId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<ArticleDetailDto> CreateArticleAsync(int currentUserId, CreateArticleDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        // Security screening (FR-SM-01)
        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description} {dto.ContentHtml}", dto.AttachmentUrls.FirstOrDefault());
        if (!secCheck.IsValid)
            throw new BadRequestException("Article content or attachments contain blocked URLs or restricted keywords.");

        // FK existence validation (GBV-001)
        var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId);
        if (!categoryExists)
        {
            var fallbackCat = await _db.Categories.OrderBy(c => c.CategoryId).FirstOrDefaultAsync();
            if (fallbackCat != null)
            {
                dto.CategoryId = fallbackCat.CategoryId;
            }
            else
            {
                throw new BadRequestException($"Category ID {dto.CategoryId} does not exist.");
            }
        }

        DateTime? scheduledDate = null;
        if (dto.Status == ArticleStatuses.Scheduled && dto.ScheduledDate.HasValue)
        {
            scheduledDate = KnomeTime.ToIst(dto.ScheduledDate.Value);
        }

        var isAlreadyDue = scheduledDate.HasValue && scheduledDate.Value <= KnomeTime.Now;
        var requestedStatus = isAlreadyDue ? ArticleStatuses.Published : (string.IsNullOrEmpty(dto.Status) ? ArticleStatuses.Published : dto.Status);

        var finalStatus = requestedStatus;
        if (requestedStatus != ArticleStatuses.Draft)
        {
            var caller = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
            var isCallerAdmin = caller != null && caller.Roles.Any(r => 
                r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" || 
                r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM");

            var requireApproval = _systemSettingService != null
                ? await _systemSettingService.GetRequireArticleApprovalAsync()
                : false;

            if (requireApproval && !isCallerAdmin)
            {
                finalStatus = ArticleStatuses.PendingApproval;
            }
        }

        var publishedDate = finalStatus == ArticleStatuses.Published ? (isAlreadyDue ? scheduledDate : KnomeTime.Now) : (DateTime?)null;

        var article = new Article
        {
            AuthorUserId = currentUserId,
            Title = dto.Title,
            Description = dto.Description,
            ContentHtml = dto.ContentHtml,
            CategoryId = dto.CategoryId,
            Status = finalStatus,
            ScheduledDate = scheduledDate,
            PublishedDate = publishedDate,
            CreatedDate = KnomeTime.Now,
            AvgReadTimeSeconds = CalculateAvgReadTimeSeconds(dto.ContentHtml),
            ViewCount = 0,
            UniqueReadCount = 0
        };

        var initialVersion = new ArticleVersion
        {
            ContentHtml = dto.ContentHtml,
            EditedByUserId = currentUserId,
            EditedDate = KnomeTime.Now
        };

        var normalizedTags = (dto.Tags ?? new List<string>())
            .SelectMany(t => t.Split(new[] { ' ', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Length > 50 ? t.Substring(0, 50) : t)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var saved = await _repo.AddArticleAsync(article, normalizedTags, dto.AttachmentUrls, initialVersion);
        try
        {
            await _karmaService.AwardKarmaAsync(currentUserId, KarmaActivityTypes.CreateArticle, KarmaPoints.CreateArticlePoints, ContentTypes.Article, saved.ArticleId, KarmaCaps.CreateArticleDailyCap);
        }
        catch { }

        var resDto = _mapper.Map<ArticleDetailDto>(saved);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Article, saved.ArticleId, currentUserId);
        return resDto;
    }

    public async Task<ArticleDetailDto> UpdateArticleAsync(long articleId, int currentUserId, UpdateArticleDto dto)
    {
        var article = await _repo.GetArticleByIdAsync(articleId);
        if (article == null)
            throw new NotFoundException($"Article ID {articleId} not found.");

        await CheckIsAuthorOrAdminAsync(article, currentUserId);

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description} {dto.ContentHtml}", dto.AttachmentUrls.FirstOrDefault());
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated article content or attachments contain blocked URLs or restricted keywords.");

        ArticleVersion? newVersion = null;
        if (article.ContentHtml != dto.ContentHtml)
        {
            newVersion = new ArticleVersion
            {
                ContentHtml = dto.ContentHtml,
                EditedByUserId = currentUserId,
                EditedDate = KnomeTime.Now
            };
        }

        // FK existence validation (GBV-001)
        var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId);
        if (!categoryExists)
        {
            dto.CategoryId = article.CategoryId > 0 ? article.CategoryId : (await _db.Categories.OrderBy(c => c.CategoryId).Select(c => c.CategoryId).FirstOrDefaultAsync());
        }

        article.Title = dto.Title;
        article.Description = dto.Description;
        article.ContentHtml = dto.ContentHtml;
        article.CategoryId = dto.CategoryId;

        if (dto.Status == ArticleStatuses.Scheduled && dto.ScheduledDate.HasValue)
        {
            var istScheduledDate = KnomeTime.ToIst(dto.ScheduledDate.Value);
            var isAlreadyDue = istScheduledDate <= KnomeTime.Now;
            if (isAlreadyDue)
            {
                article.Status = ArticleStatuses.Published;
                article.ScheduledDate = istScheduledDate;
                article.PublishedDate = istScheduledDate;
            }
            else
            {
                article.Status = ArticleStatuses.Scheduled;
                article.ScheduledDate = istScheduledDate;
                article.PublishedDate = null;
            }
        }
        else
        {
            article.Status = dto.Status;
            article.ScheduledDate = KnomeTime.ToIst(dto.ScheduledDate);
            if (dto.Status == ArticleStatuses.Published && article.PublishedDate == null)
                article.PublishedDate = KnomeTime.Now;
        }
        article.AvgReadTimeSeconds = CalculateAvgReadTimeSeconds(dto.ContentHtml);

        var normalizedTags = (dto.Tags ?? new List<string>())
            .SelectMany(t => t.Split(new[] { ' ', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Length > 50 ? t.Substring(0, 50) : t)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        await _repo.UpdateArticleAsync(article, normalizedTags, dto.AttachmentUrls, newVersion);

        var updated = await _repo.GetArticleByIdAsync(articleId);
        var resDto = _mapper.Map<ArticleDetailDto>(updated!);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Article, articleId, currentUserId);
        return resDto;
    }

    public async Task DeleteArticleAsync(long articleId, int currentUserId)
    {
        var article = await _repo.GetArticleByIdAsync(articleId);
        if (article == null)
            throw new NotFoundException($"Article ID {articleId} not found.");

        await CheckIsAuthorOrAdminAsync(article, currentUserId);
        await _repo.DeleteArticleAsync(article);
    }

    public async Task<List<CategoryDto>> GetArticleCategoriesAsync()
    {
        return await _db.Categories
            .AsNoTracking()
            .Where(c => c.AppliesTo == "Article" || c.AppliesTo == "All")
            .OrderBy(c => c.Name)
            .Select(c => new CategoryDto
            {
                CategoryId = c.CategoryId,
                Name = c.Name,
                AppliesTo = c.AppliesTo
            })
            .ToListAsync();
    }

    public async Task<CategoryDto> CreateArticleCategoryAsync(CreateCategoryDto dto, int currentUserId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM"))
        {
            throw new UnauthorizedException("Only System Administrators are permitted to create article categories.");
        }

        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new BadRequestException("Category name is required.");

        var trimmedName = dto.Name.Trim();
        if (trimmedName.Length > 100)
            throw new BadRequestException("Category name cannot exceed 100 characters.");

        var exists = await _db.Categories.AnyAsync(c => 
            (c.AppliesTo == "Article" || c.AppliesTo == "All") && 
            c.Name.ToLower() == trimmedName.ToLower());

        if (exists)
            throw new ConflictException($"Category '{trimmedName}' already exists for articles.");

        var category = new Category
        {
            Name = trimmedName,
            AppliesTo = "Article"
        };

        _db.Categories.Add(category);
        await _db.SaveChangesAsync();

        return new CategoryDto
        {
            CategoryId = category.CategoryId,
            Name = category.Name,
            AppliesTo = category.AppliesTo
        };
    }

    public async Task<int> IncrementViewCountAsync(long articleId, int currentUserId = 0)
    {
        var article = await _repo.GetArticleByIdAsync(articleId);
        if (article == null)
            throw new NotFoundException($"Article ID {articleId} not found.");

        var count = await _interactionService.RecordViewAsync(ContentTypes.Article, articleId, currentUserId);
        return (int)count;
    }
}

