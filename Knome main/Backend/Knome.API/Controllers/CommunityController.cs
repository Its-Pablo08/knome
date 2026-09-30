using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.DTOs.Communities;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/communities")]
[Authorize]
public class CommunityController : KnomeControllerBase
{
    private readonly ICommunityService _communityService;

    public CommunityController(ICommunityService communityService)
    {
        _communityService = communityService;
    }

    [HttpGet("categories")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<List<Knome.API.DTOs.Categories.CategoryDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunityCategories()
    {
        var categories = await _communityService.GetCommunityCategoriesAsync();
        return Ok(ApiResponse<List<Knome.API.DTOs.Categories.CategoryDto>>.SuccessResponse(200, "Community categories retrieved successfully.", categories));
    }

    [HttpGet("check-name")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckName([FromQuery] string? name = null, [FromQuery] int? excludeId = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Ok(ApiResponse<bool>.SuccessResponse(200, "Community name check complete.", false));
        }

        var exists = await _communityService.CheckCommunityNameExistsAsync(name.Trim(), excludeId);
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Community name check complete.", exists));
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunities([FromQuery] int? categoryId, [FromQuery] string? type, [FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 500)
    {
        if (pageSize <= 0) pageSize = 500;
        var dtos = await _communityService.GetCommunitiesAsync(categoryId, type, search, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityDto>>.SuccessResponse(200, "Communities retrieved successfully.", dtos));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyCommunities()
    {
        var dtos = await _communityService.GetMyCommunitiesAsync(GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityDto>>.SuccessResponse(200, "User communities retrieved successfully.", dtos));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserCommunities(int userId)
    {
        var dtos = await _communityService.GetUserCommunitiesAsync(userId);
        return Ok(ApiResponse<List<CommunityDto>>.SuccessResponse(200, "User communities retrieved successfully.", dtos));
    }

    [HttpGet("pending")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPendingCommunities()
    {
        var dtos = await _communityService.GetPendingCommunitiesAsync(GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityDto>>.SuccessResponse(200, "Pending communities retrieved successfully.", dtos));
    }

    [HttpPost("{communityId:int}/approve")]
    [ProducesResponseType(typeof(ApiResponse<CommunityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ApproveCommunity(int communityId)
    {
        var result = await _communityService.ApproveCommunityAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse<CommunityDto>.SuccessResponse(200, "Community approved successfully.", result));
    }

    [HttpPost("{communityId:int}/reject")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RejectCommunity(int communityId, [FromBody] RejectCommunityDto dto)
    {
        await _communityService.RejectCommunityAsync(communityId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<object>.SuccessResponse(200, "Community request rejected successfully.", null!));
    }

    [HttpGet("{communityId:int}")]
    [ProducesResponseType(typeof(ApiResponse<CommunityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunity(int communityId)
    {
        var dto = await _communityService.GetCommunityAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse<CommunityDto>.SuccessResponse(200, "Community retrieved successfully.", dto));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<CommunityDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateCommunity([FromBody] CreateCommunityDto dto)
    {
        var result = await _communityService.CreateCommunityAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetCommunity), new { communityId = result.CommunityId }, ApiResponse<CommunityDto>.SuccessResponse(201, "Community created successfully.", result));
    }

    [HttpPut("{communityId}")]
    [ProducesResponseType(typeof(ApiResponse<CommunityDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateCommunity(int communityId, [FromBody] UpdateCommunityDto dto)
    {
        var result = await _communityService.UpdateCommunityAsync(communityId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<CommunityDto>.SuccessResponse(200, "Community updated successfully.", result));
    }

    [HttpDelete("{communityId}")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteCommunity(int communityId)
    {
        await _communityService.DeleteCommunityAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse<object>.SuccessResponse(200, "Community deleted successfully.", null!));
    }

    [HttpPost("{communityId}/join")]
    [ProducesResponseType(typeof(ApiResponse<CommunityMemberDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> JoinCommunity(int communityId)
    {
        var member = await _communityService.JoinCommunityAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse<CommunityMemberDto>.SuccessResponse(200, "Community join processed successfully.", member));
    }

    [HttpPost("{communityId}/leave")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> LeaveCommunity(int communityId)
    {
        await _communityService.LeaveCommunityAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Successfully left the community."));
    }

    [HttpGet("{communityId}/members")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityMemberDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMembers(int communityId, [FromQuery] string? status, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var members = await _communityService.GetMembersAsync(communityId, status, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityMemberDto>>.SuccessResponse(200, "Community members retrieved successfully.", members));
    }

    [HttpPost("{communityId:int}/members")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityMemberDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddMembers(int communityId, [FromBody] AddCommunityMembersDto dto)
    {
        var members = await _communityService.AddMembersAsync(communityId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<List<CommunityMemberDto>>.SuccessResponse(200, "Community members added successfully.", members));
    }

    [HttpPut("{communityId}/members/{targetUserId}/decide")]
    [ProducesResponseType(typeof(ApiResponse<CommunityMemberDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DecideMembership(int communityId, int targetUserId, [FromBody] DecideMembershipDto dto)
    {
        var member = await _communityService.DecideMembershipAsync(communityId, targetUserId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<CommunityMemberDto>.SuccessResponse(200, $"Membership status updated to {dto.Status}.", member));
    }

    [HttpDelete("{communityId}/members/{targetUserId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveMember(int communityId, int targetUserId)
    {
        await _communityService.RemoveMemberAsync(communityId, targetUserId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Member removed successfully from community."));
    }

    [HttpPost("{communityId}/admins/{targetUserId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddAdmin(int communityId, int targetUserId)
    {
        await _communityService.AddAdminAsync(communityId, targetUserId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Admin added successfully to community."));
    }

    [HttpDelete("{communityId}/admins/{targetUserId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveAdmin(int communityId, int targetUserId)
    {
        await _communityService.RemoveAdminAsync(communityId, targetUserId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Admin removed successfully from community."));
    }

    [HttpGet("{communityId}/posts")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityPostItemDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunityPosts(int communityId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var posts = await _communityService.GetCommunityPostsAsync(communityId, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityPostItemDto>>.SuccessResponse(200, "Community posts retrieved successfully.", posts));
    }

    [HttpPost("{communityId}/posts")]
    [ProducesResponseType(typeof(ApiResponse<CommunityPostItemDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateCommunityPost(int communityId, [FromBody] CreateCommunityPostDto dto)
    {
        var post = await _communityService.CreateCommunityPostAsync(communityId, GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetCommunityPosts), new { communityId }, ApiResponse<CommunityPostItemDto>.SuccessResponse(201, "Community post created successfully.", post));
    }

    [HttpPut("{communityId}/posts/{postId}/pin")]
    [ProducesResponseType(typeof(ApiResponse<CommunityPostItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> PinPost(int communityId, long postId, [FromBody] PinCommunityPostDto dto)
    {
        var post = await _communityService.PinPostAsync(communityId, postId, GetCurrentUserId(), dto);
        var statusMsg = dto.IsPinned ? "pinned" : "unpinned";
        return Ok(ApiResponse<CommunityPostItemDto>.SuccessResponse(200, $"Post {statusMsg} successfully.", post));
    }

    [HttpGet("{communityId:int}/files")]
    [ProducesResponseType(typeof(ApiResponse<List<CommunityFileDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCommunityFiles(int communityId)
    {
        var files = await _communityService.GetCommunityFilesAsync(communityId, GetCurrentUserId());
        return Ok(ApiResponse<List<CommunityFileDto>>.SuccessResponse(200, "Community files retrieved successfully.", files));
    }

    [HttpPost("{communityId:int}/files")]
    [ProducesResponseType(typeof(ApiResponse<CommunityFileDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> AddCommunityFile(int communityId, [FromBody] CommunityFileDto dto)
    {
        var file = await _communityService.AddCommunityFileAsync(communityId, GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetCommunityFiles), new { communityId }, ApiResponse<CommunityFileDto>.SuccessResponse(201, "Community file uploaded successfully.", file));
    }

    [HttpDelete("{communityId:int}/files/{**fileId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteCommunityFile(int communityId, string fileId)
    {
        await _communityService.DeleteCommunityFileAsync(communityId, fileId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Community file deleted successfully."));
    }

    [HttpDelete("{communityId:int}/files")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteCommunityFileByQuery(int communityId, [FromQuery] string? id, [FromQuery] string? name)
    {
        var targetId = !string.IsNullOrWhiteSpace(id) ? id : name;
        if (string.IsNullOrWhiteSpace(targetId))
            throw new BadRequestException("File identifier is required.");
            
        await _communityService.DeleteCommunityFileAsync(communityId, targetId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Community file deleted successfully."));
    }
}
