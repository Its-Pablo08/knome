using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Knome.API.Constants;
using Knome.API.DTOs.Settings;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/notice-period")]
public class NoticePeriodController : KnomeControllerBase
{
    private readonly INoticePeriodService _noticePeriodService;
    private readonly IUserService _userService;

    public NoticePeriodController(INoticePeriodService noticePeriodService, IUserService userService)
    {
        _noticePeriodService = noticePeriodService;
        _userService = userService;
    }

    /// <summary>
    /// Gets the current Notice Period Configuration and employee roster.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodConfigDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetConfig()
    {
        var config = await _noticePeriodService.GetConfigAsync();
        return Ok(ApiResponse<NoticePeriodConfigDto>.SuccessResponse(200, "Notice Period configuration retrieved.", config));
    }

    /// <summary>
    /// Toggles the master Notice Period Post-Scheduling Guard policy (HR Administrator and System Administrator only).
    /// </summary>
    [HttpPost("toggle-policy")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodConfigDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> TogglePolicy([FromBody] TogglePolicyDto dto)
    {
        EnsureHrOrSysAdmin();
        var currentUserId = GetCurrentUserId();
        var config = await _noticePeriodService.SetPolicyEnabledAsync(dto.IsEnabled, currentUserId);
        return Ok(ApiResponse<NoticePeriodConfigDto>.SuccessResponse(200, $"Notice Period Guard {(dto.IsEnabled ? "enabled" : "disabled")}.", config));
    }

    /// <summary>
    /// Marks or unmarks an employee as In Notice Period (HR Administrator and System Administrator only).
    /// </summary>
    [HttpPost("toggle-employee")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodConfigDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleEmployee([FromBody] ToggleEmployeeNoticeDto dto)
    {
        EnsureHrOrSysAdmin();
        var currentUserId = GetCurrentUserId();
        var config = await _noticePeriodService.ToggleEmployeeNoticeAsync(dto, currentUserId);
        return Ok(ApiResponse<NoticePeriodConfigDto>.SuccessResponse(200, "Employee Notice Period status updated.", config));
    }

    /// <summary>
    /// Checks whether a specific user is currently restricted by Notice Period.
    /// </summary>
    [HttpGet("check/{userId:int}")]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodStatusResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckUserStatus(int userId)
    {
        var result = await _noticePeriodService.CheckUserNoticeStatusAsync(userId);
        return Ok(ApiResponse<NoticePeriodStatusResultDto>.SuccessResponse(200, "User notice status evaluated.", result));
    }

    /// <summary>
    /// Checks whether the currently authenticated user is restricted by Notice Period.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodStatusResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckMyStatus()
    {
        var userId = GetCurrentUserId();
        var result = await _noticePeriodService.CheckUserNoticeStatusAsync(userId);
        return Ok(ApiResponse<NoticePeriodStatusResultDto>.SuccessResponse(200, "Your notice status evaluated.", result));
    }

    private void EnsureHrOrSysAdmin()
    {
        var isAuth = User.IsInRole(Roles.HRAdmin) || User.IsInRole("HR Admin") || User.IsInRole("HRADM")
            || User.IsInRole(Roles.SystemAdmin) || User.IsInRole("System Admin") || User.IsInRole("SYSADM")
            || User.IsInRole("ADMIN");

        if (!isAuth)
        {
            throw new ForbiddenException("Only HR Administrators and System Administrators can configure Notice Period governance.");
        }
    }
}
