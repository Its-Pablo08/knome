using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.DTOs.Podcasts;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[Authorize]
[ApiController]
[Route("api/podcasts")]
public class PodcastController : KnomeControllerBase, Microsoft.AspNetCore.Mvc.Filters.IAsyncActionFilter
{
    private readonly IPodcastService _podcastService;
    private readonly ISystemSettingService _settingService;

    public PodcastController(IPodcastService podcastService, ISystemSettingService settingService)
    {
        _podcastService = podcastService;
        _settingService = settingService;
    }

    [NonAction]
    public async Task OnActionExecutionAsync(Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext context, Microsoft.AspNetCore.Mvc.Filters.ActionExecutionDelegate next)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        await next();
    }

    // --- Series Endpoints ---
    [HttpGet("series")]
    [ProducesResponseType(typeof(ApiResponse<List<PodcastSeriesDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllSeries()
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var list = await _podcastService.GetAllSeriesAsync();
        return Ok(ApiResponse<List<PodcastSeriesDto>>.SuccessResponse(200, "Podcast series retrieved successfully.", list));
    }

    [HttpGet("series/{seriesId}")]
    [ProducesResponseType(typeof(ApiResponse<PodcastSeriesDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSeries(int seriesId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var series = await _podcastService.GetSeriesByIdAsync(seriesId);
        return Ok(ApiResponse<PodcastSeriesDto>.SuccessResponse(200, "Podcast series retrieved successfully.", series));
    }

    [HttpPost("series")]
    [ProducesResponseType(typeof(ApiResponse<PodcastSeriesDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateSeries([FromBody] CreatePodcastSeriesDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var result = await _podcastService.CreateSeriesAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetSeries), new { seriesId = result.SeriesId }, ApiResponse<PodcastSeriesDto>.SuccessResponse(201, "Podcast series created successfully.", result));
    }

    [HttpPut("series/{seriesId}")]
    [ProducesResponseType(typeof(ApiResponse<PodcastSeriesDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateSeries(int seriesId, [FromBody] UpdatePodcastSeriesDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var result = await _podcastService.UpdateSeriesAsync(seriesId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<PodcastSeriesDto>.SuccessResponse(200, "Podcast series updated successfully.", result));
    }

    [HttpDelete("series/{seriesId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteSeries(int seriesId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        await _podcastService.DeleteSeriesAsync(seriesId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Podcast series deleted successfully."));
    }

    // --- Episode Endpoints ---
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<PodcastDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPodcasts([FromQuery] int? seriesId, [FromQuery] int? categoryId, [FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var podcasts = await _podcastService.GetPodcastsAsync(seriesId, categoryId, search, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<PodcastDto>>.SuccessResponse(200, "Podcasts retrieved successfully.", podcasts));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<List<PodcastDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPodcasts([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var podcasts = await _podcastService.GetMyPodcastsAsync(GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<PodcastDto>>.SuccessResponse(200, "User podcasts retrieved successfully.", podcasts));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<PodcastDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserPodcasts(int userId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var podcasts = await _podcastService.GetUserPodcastsAsync(userId, GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<PodcastDto>>.SuccessResponse(200, "User podcasts retrieved successfully.", podcasts));
    }

    [HttpGet("{podcastId:long}")]
    [ProducesResponseType(typeof(ApiResponse<PodcastDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPodcast(long podcastId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var podcast = await _podcastService.GetPodcastAsync(podcastId, GetCurrentUserId());
        return Ok(ApiResponse<PodcastDto>.SuccessResponse(200, "Podcast retrieved successfully.", podcast));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<PodcastDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreatePodcast([FromBody] CreatePodcastDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var result = await _podcastService.CreatePodcastAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetPodcast), new { podcastId = result.PodcastId }, ApiResponse<PodcastDto>.SuccessResponse(201, "Podcast created successfully.", result));
    }

    [HttpPut("{podcastId}")]
    [ProducesResponseType(typeof(ApiResponse<PodcastDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePodcast(long podcastId, [FromBody] UpdatePodcastDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var result = await _podcastService.UpdatePodcastAsync(podcastId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<PodcastDto>.SuccessResponse(200, "Podcast updated successfully.", result));
    }

    [HttpDelete("{podcastId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeletePodcast(long podcastId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        await _podcastService.DeletePodcastAsync(podcastId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Podcast deleted successfully."));
    }

    [HttpPost("{podcastId:long}/view")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long podcastId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePodcastsKey, "Podcasts");
        var newCount = await _podcastService.IncrementViewCountAsync(podcastId, GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Podcast view recorded.", newCount));
    }
}
