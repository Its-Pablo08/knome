using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.DTOs.Posts;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[Authorize]
[ApiController]
[Route("api/posts")]
public class PostController : KnomeControllerBase
{
    private readonly IPostService _postService;
    private readonly ISystemSettingService _settingService;

    public PostController(IPostService postService, ISystemSettingService settingService)
    {
        _postService = postService;
        _settingService = settingService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<PostDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPosts([FromQuery] string? audienceType, [FromQuery] string? search, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var posts = await _postService.GetPostsAsync(audienceType, search, pageNumber, pageSize, GetCurrentUserId());
        return Ok(ApiResponse<List<PostDto>>.SuccessResponse(200, "Posts retrieved successfully.", posts));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<List<PostDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPosts([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var posts = await _postService.GetMyPostsAsync(GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<PostDto>>.SuccessResponse(200, "User posts retrieved successfully.", posts));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<PostDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserPosts(int userId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var posts = await _postService.GetUserPostsAsync(userId, GetCurrentUserId(), pageNumber, pageSize);
        return Ok(ApiResponse<List<PostDto>>.SuccessResponse(200, "User posts retrieved successfully.", posts));
    }

    [HttpGet("{postId:long}")]
    [ProducesResponseType(typeof(ApiResponse<PostDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPost(long postId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var post = await _postService.GetPostAsync(postId, GetCurrentUserId());
        return Ok(ApiResponse<PostDto>.SuccessResponse(200, "Post retrieved successfully.", post));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<PostDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreatePost([FromBody] CreatePostDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var result = await _postService.CreatePostAsync(GetCurrentUserId(), dto);
        return CreatedAtAction(nameof(GetPost), new { postId = result.PostId }, ApiResponse<PostDto>.SuccessResponse(201, "Post created successfully.", result));
    }

    [HttpPut("{postId}")]
    [ProducesResponseType(typeof(ApiResponse<PostDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePost(long postId, [FromBody] UpdatePostDto dto)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var result = await _postService.UpdatePostAsync(postId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<PostDto>.SuccessResponse(200, "Post updated successfully.", result));
    }

    [HttpDelete("{postId}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeletePost(long postId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        await _postService.DeletePostAsync(postId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Post deleted successfully."));
    }

    [HttpPost("{postId:long}/view")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long postId)
    {
        await _settingService.EnsureFeatureEnabledAsync(Knome.API.Services.SystemSettingService.EnablePostsKey, "Posts");
        var newCount = await _postService.IncrementViewCountAsync(postId, GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Post view recorded.", newCount));
    }
}
