using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Karma;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/karma")]
[Authorize]
public class KarmaController : KnomeControllerBase
{
    private readonly IKarmaService _karmaService;

    public KarmaController(IKarmaService karmaService)
    {
        _karmaService = karmaService;
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<KarmaBalanceDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyBalance()
    {
        var result = await _karmaService.GetMyBalanceAsync(GetCurrentUserId());
        return Ok(ApiResponse<KarmaBalanceDto>.SuccessResponse(200, "Personal karma balance retrieved successfully.", result));
    }

    [HttpGet("user/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<KarmaBalanceDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserBalance(int userId)
    {
        var result = await _karmaService.GetUserBalanceAsync(userId);
        return Ok(ApiResponse<KarmaBalanceDto>.SuccessResponse(200, "User karma balance retrieved successfully.", result));
    }

    [HttpGet("leaderboard")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLeaderboard([FromQuery] int top = 10)
    {
        var result = await _karmaService.GetLeaderboardAsync(top);
        return Ok(ApiResponse<object>.SuccessResponse(200, "Karma leaderboard retrieved successfully.", result));
    }

    [HttpPost("award")]
    [Authorize(Roles = Roles.AllAdmins)]
    [ProducesResponseType(typeof(ApiResponse<KarmaBalanceDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AwardKarma([FromBody] AwardKarmaDto dto)
    {
        var result = await _karmaService.AwardKarmaAsync(dto.UserId, dto.ActivityType, dto.PointsAwarded, dto.RelatedContentType, dto.RelatedContentId);
        return Ok(ApiResponse<KarmaBalanceDto>.SuccessResponse(200, "Karma points awarded successfully.", result));
    }
}
