using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.DTOs.Articles;
using Knome.API.DTOs.Categories;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Knome.API.Constants;

namespace Knome.API.Controllers;

[Authorize]
[ApiController]
[Route("api/articles")]
public class ArticleController : KnomeControllerBase, Microsoft.AspNetCore.Mvc.Filters.IAsyncActionFilter
{
    private readonly IArticleService _articleService;
    private readonly ISystemSettingService _settingService;

    public ArticleController(IArticleService articleService, ISystemSettingService settingService)
    {
        _articleService = articleService;
        _settingService = settingService;
    }

    [NonAction]
    public async Task OnActionExecutionAsync(Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext context, Microsoft.AspNetCore.Mvc.Filters.ActionExecutionDelegate next)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        await next();
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<ArticleDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetArticles([FromQuery] int? categoryId, [FromQuery] string? tag, [FromQuery] string? status, [FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var articles = await _articleService.GetArticlesAsync(categoryId, tag, status, search, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<ArticleDto>>.SuccessResponse(200, "Articles retrieved successfully.", articles));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<List<ArticleDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyArticles([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var articles = await _articleService.GetMyArticlesAsync(GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<ArticleDto>>.SuccessResponse(200, "User articles retrieved successfully.", articles));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<ArticleDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserArticles(int userId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var articles = await _articleService.GetUserArticlesAsync(userId, GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<ArticleDto>>.SuccessResponse(200, "User articles retrieved successfully.", articles));
    }

    [HttpGet("{articleId:long}")]
    [ProducesResponseType(typeof(ApiResponse<ArticleDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetArticle(long articleId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var article = await _articleService.GetArticleAsync(articleId, GetCurrentUserId());
        return Ok(ApiResponse<ArticleDto>.SuccessResponse(200, "Article retrieved successfully.", article));
    }

    [HttpPost]
    [Authorize(Roles = $"{Roles.Employee},{Roles.Moderator},{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin},MOD,Moderator,EMP,CADM,HRADM,SYSADM")]
    [ProducesResponseType(typeof(ApiResponse<ArticleDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateArticle([FromBody] CreateArticleDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var result = await _articleService.CreateArticleAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetArticle), new { articleId = result.ArticleId }, ApiResponse<ArticleDto>.SuccessResponse(201, "Article created successfully.", result));
    }

    [HttpPut("{articleId}")]
    [Authorize(Roles = $"{Roles.Employee},{Roles.Moderator},{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin},MOD,Moderator,EMP,CADM,HRADM,SYSADM")]
    [ProducesResponseType(typeof(ApiResponse<ArticleDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateArticle(long articleId, [FromBody] UpdateArticleDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var result = await _articleService.UpdateArticleAsync(articleId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<ArticleDto>.SuccessResponse(200, "Article updated successfully.", result));
    }

    [HttpDelete("{articleId}")]
    [Authorize(Roles = $"{Roles.Employee},{Roles.Moderator},{Roles.CommunityAdmin},{Roles.HRAdmin},{Roles.SystemAdmin},MOD,Moderator,EMP,CADM,HRADM,SYSADM")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteArticle(long articleId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        await _articleService.DeleteArticleAsync(articleId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Article deleted successfully."));
    }

    [HttpGet("categories")]
    [ProducesResponseType(typeof(ApiResponse<List<CategoryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCategories()
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var categories = await _articleService.GetArticleCategoriesAsync();
        return Ok(ApiResponse<List<CategoryDto>>.SuccessResponse(200, "Article categories retrieved successfully.", categories));
    }

    [HttpPost("categories")]
    [Authorize(Roles = Roles.SystemAdmin)]
    [ProducesResponseType(typeof(ApiResponse<CategoryDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var category = await _articleService.CreateArticleCategoryAsync(dto, GetCurrentUserId());
        return StatusCode(StatusCodes.Status201Created, ApiResponse<CategoryDto>.SuccessResponse(201, "Category created successfully.", category));
    }

    [HttpPost("{articleId:long}/view")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long articleId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableArticlesKey, "Articles");
        var newCount = await _articleService.IncrementViewCountAsync(articleId, GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Article view recorded.", newCount));
    }
}

