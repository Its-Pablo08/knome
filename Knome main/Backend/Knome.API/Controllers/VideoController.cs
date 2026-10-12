using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.DTOs.Videos;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[Authorize]
[ApiController]
[Route("api/videos")]
public class VideoController : KnomeControllerBase
{
    private readonly IVideoService _videoService;
    private readonly ISystemSettingService _settingService;

    public VideoController(IVideoService videoService, ISystemSettingService settingService)
    {
        _videoService = videoService;
        _settingService = settingService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<VideoDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideos([FromQuery] int? categoryId, [FromQuery] string? tag, [FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var videos = await _videoService.GetVideosAsync(categoryId, tag, search, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<VideoDto>>.SuccessResponse(200, "Videos retrieved successfully.", videos));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<List<VideoDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyVideos([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var videos = await _videoService.GetMyVideosAsync(GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<VideoDto>>.SuccessResponse(200, "User videos retrieved successfully.", videos));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<VideoDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserVideos(int userId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var videos = await _videoService.GetUserVideosAsync(userId, GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<VideoDto>>.SuccessResponse(200, "User videos retrieved successfully.", videos));
    }

    [HttpGet("{videoId:long}")]
    [ProducesResponseType(typeof(ApiResponse<VideoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideo(long videoId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var video = await _videoService.GetVideoAsync(videoId, GetCurrentUserId());
        return Ok(ApiResponse<VideoDto>.SuccessResponse(200, "Video retrieved successfully.", video));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<VideoDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateVideo([FromBody] CreateVideoDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var result = await _videoService.CreateVideoAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetVideo), new { videoId = result.VideoId }, ApiResponse<VideoDto>.SuccessResponse(201, "Video created successfully.", result));
    }

    [HttpPut("{videoId}")]
    [ProducesResponseType(typeof(ApiResponse<VideoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateVideo(long videoId, [FromBody] UpdateVideoDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        var result = await _videoService.UpdateVideoAsync(videoId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<VideoDto>.SuccessResponse(200, "Video updated successfully.", result));
    }

    [HttpDelete("{videoId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteVideo(long videoId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnableVideosKey, "Videos");
        await _videoService.DeleteVideoAsync(videoId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Video deleted successfully."));
    }

    [HttpPost("{videoId:long}/view")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long videoId)
    {
        var newCount = await _videoService.IncrementViewCountAsync(videoId, GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Video view recorded.", newCount));
    }
}
