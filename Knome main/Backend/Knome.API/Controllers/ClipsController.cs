using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Clips;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

public class UpdateClipStatusDto
{
    public string Status { get; set; } = "Published"; // 'Published', 'Removed', 'Archived'
}

[Authorize]
[ApiController]
[Route("api/clips")]
public class ClipsController : KnomeControllerBase
{
    private readonly IClipService _clipService;

    public ClipsController(IClipService clipService)
    {
        _clipService = clipService;
    }

    private bool IsAdmin()
    {
        return User.IsInRole(Roles.SystemAdmin) ||
               User.IsInRole(Roles.HRAdmin) ||
               User.IsInRole(Roles.CommunityAdmin);
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<ClipDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFeed(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? hashtag = null,
        [FromQuery] long? communityId = null)
    {
        var clips = await _clipService.GetFeedClipsAsync(GetCurrentUserId(), pageNumber, pageSize, hashtag, communityId);
        return Ok(ApiResponse<List<ClipDto>>.SuccessResponse(200, "Clips retrieved successfully.", clips));
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(ApiResponse<ClipDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetById(long id)
    {
        var clip = await _clipService.GetByIdAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<ClipDto>.SuccessResponse(200, "Clip retrieved successfully.", clip));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<ClipDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateClipDto dto)
    {
        var clip = await _clipService.CreateClipAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetById), new { id = clip.ClipId }, ApiResponse<ClipDto>.SuccessResponse(201, "Clip published successfully.", clip));
    }

    [HttpPut("{id}")]
    [ProducesResponseType(typeof(ApiResponse<ClipDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(long id, [FromBody] UpdateClipDto dto)
    {
        var clip = await _clipService.UpdateClipAsync(id, GetCurrentUserId(), dto, IsAdmin());
        return Ok(ApiResponse<ClipDto>.SuccessResponse(200, "Clip updated successfully.", clip));
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Delete(long id)
    {
        await _clipService.DeleteClipAsync(id, GetCurrentUserId(), IsAdmin());
        return Ok(ApiResponse.SuccessResponse(200, "Clip deleted successfully."));
    }

    [HttpPost("{id}/view")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long id)
    {
        var views = await _clipService.RecordViewAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<object>.SuccessResponse(200, "View recorded.", new { viewCount = views }));
    }

    [HttpGet("{id}/viewers")]
    [ProducesResponseType(typeof(ApiResponse<List<ClipViewerDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetViewers(long id)
    {
        var viewers = await _clipService.GetClipViewersAsync(id);
        return Ok(ApiResponse<List<ClipViewerDto>>.SuccessResponse(200, "Clip viewers retrieved successfully.", viewers));
    }

    [HttpGet("{id}/engagement")]
    [ProducesResponseType(typeof(ApiResponse<ClipEngagementDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetEngagement(long id)
    {
        var engagement = await _clipService.GetClipEngagementAsync(id);
        return Ok(ApiResponse<ClipEngagementDto>.SuccessResponse(200, "Clip engagement retrieved successfully.", engagement));
    }

    [HttpPost("{id}/react")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleLike(long id)
    {
        var isLiked = await _clipService.ToggleLikeAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<object>.SuccessResponse(200, isLiked ? "Clip liked." : "Clip unliked.", new { isLiked }));
    }

    [HttpPost("{id}/bookmark")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleBookmark(long id)
    {
        var isBookmarked = await _clipService.ToggleBookmarkAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<object>.SuccessResponse(200, isBookmarked ? "Clip saved to bookmarks." : "Clip removed from bookmarks.", new { isBookmarked }));
    }

    [HttpPost("{id}/share")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Share(long id, [FromBody] ShareClipDto dto)
    {
        await _clipService.ShareClipAsync(id, GetCurrentUserId(), dto);
        return Ok(ApiResponse.SuccessResponse(200, "Clip shared successfully."));
    }

    [HttpGet("user/{userId}")]
    [ProducesResponseType(typeof(ApiResponse<List<ClipDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserClips(int userId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 50)
    {
        var clips = await _clipService.GetUserClipsAsync(userId, GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<ClipDto>>.SuccessResponse(200, "User clips retrieved successfully.", clips));
    }

    [HttpGet("me")]
    [ProducesResponseType(typeof(ApiResponse<List<ClipDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyClips([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 50)
    {
        var clips = await _clipService.GetUserClipsAsync(GetCurrentUserId(), GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<ClipDto>>.SuccessResponse(200, "My clips retrieved successfully.", clips));
    }

    [HttpGet("admin/all")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllForAdmin(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? status = null)
    {
        if (!IsAdmin())
            return Forbid();

        var (items, totalCount) = await _clipService.GetAllClipsForAdminAsync(pageNumber, pageSize, search, status);
        return Ok(ApiResponse<object>.SuccessResponse(200, "Admin clips retrieved successfully.", new { items, totalCount, pageNumber, pageSize }));
    }

    [HttpPut("admin/{id}/status")]
    [ProducesResponseType(typeof(ApiResponse<ClipDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AdminUpdateStatus(long id, [FromBody] UpdateClipStatusDto dto)
    {
        if (!IsAdmin())
            return Forbid();

        var clip = await _clipService.AdminUpdateStatusAsync(id, GetCurrentUserId(), dto.Status);
        return Ok(ApiResponse<ClipDto>.SuccessResponse(200, "Clip status updated by admin.", clip));
    }
}
