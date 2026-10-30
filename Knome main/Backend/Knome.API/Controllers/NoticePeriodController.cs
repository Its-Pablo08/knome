using System;
using System.Linq;
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
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodConfigDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> TogglePolicy([FromBody] TogglePolicyDto dto)
    {
        var currentUserId = await TryResolveCurrentUserIdAsync();
        var config = await _noticePeriodService.SetPolicyEnabledAsync(dto.IsEnabled, currentUserId);
        return Ok(ApiResponse<NoticePeriodConfigDto>.SuccessResponse(200, $"Notice Period Guard {(dto.IsEnabled ? "enabled" : "disabled")}.", config));
    }

    /// <summary>
    /// Marks or unmarks an employee as In Notice Period (HR Administrator and System Administrator only).
    /// </summary>
    [HttpPost("toggle-employee")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodConfigDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleEmployee([FromBody] ToggleEmployeeNoticeDto dto)
    {
        var currentUserId = await TryResolveCurrentUserIdAsync();
        var config = await _noticePeriodService.ToggleEmployeeNoticeAsync(dto, currentUserId);
        return Ok(ApiResponse<NoticePeriodConfigDto>.SuccessResponse(200, "Employee Notice Period status updated.", config));
    }

    /// <summary>
    /// Checks whether a specific user is currently restricted by Notice Period.
    /// </summary>
    [HttpGet("check/{userId:int}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodStatusResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckUserStatus(int userId)
    {
        var result = await _noticePeriodService.CheckUserNoticeStatusAsync(userId);
        return Ok(ApiResponse<NoticePeriodStatusResultDto>.SuccessResponse(200, "User notice status evaluated.", result));
    }

    /// <summary>
    /// Checks whether a specific user (by identifier: userId, employeeId, or email) is currently restricted by Notice Period.
    /// </summary>
    [HttpGet("check-user/{identifier}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodStatusResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckUserStatusByIdentifier(string identifier)
    {
        var result = await _noticePeriodService.CheckUserNoticeStatusAsync(identifier);
        return Ok(ApiResponse<NoticePeriodStatusResultDto>.SuccessResponse(200, "User notice status evaluated.", result));
    }

    /// <summary>
    /// Checks whether the currently authenticated user is restricted by Notice Period.
    /// </summary>
    [HttpGet("me")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<NoticePeriodStatusResultDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> CheckMyStatus()
    {
        var userId = await TryResolveCurrentUserIdAsync();
        var result = await _noticePeriodService.CheckUserNoticeStatusAsync(userId);
        return Ok(ApiResponse<NoticePeriodStatusResultDto>.SuccessResponse(200, "Your notice status evaluated.", result));
    }

    private async Task<int> TryResolveCurrentUserIdAsync()
    {
        try
        {
            return GetCurrentUserId();
        }
        catch
        {
            // Fallback for OIDC / SSO tokens where 'sub' is a GUID rather than an integer UserId
            try
            {
                var emailOrEmpId = User?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value
                    ?? User?.FindFirst("email")?.Value
                    ?? User?.FindFirst("preferred_username")?.Value
                    ?? User?.FindFirst("empId")?.Value
                    ?? User?.FindFirst("employee_id")?.Value;

                if (!string.IsNullOrWhiteSpace(emailOrEmpId))
                {
                    var paged = await _userService.GetPagedUsersAsync(new Knome.API.DTOs.User.UserFilterDto { SearchTerm = emailOrEmpId, PageSize = 5 });
                    var match = paged?.Items?.FirstOrDefault();
                    if (match != null && match.UserId > 0)
                    {
                        return match.UserId;
                    }
                }
            }
            catch
            {
                // Ignore claim lookup errors and allow anonymous/0 fallback
            }
            return 0;
        }
    }

    private async Task EnsureHrOrSysAdminAsync(int currentUserId)
    {
        var isAuth = User.IsInRole(Roles.HRAdmin) || User.IsInRole("HR Admin") || User.IsInRole("HRADM")
            || User.IsInRole(Roles.SystemAdmin) || User.IsInRole("System Admin") || User.IsInRole("SYSADM")
            || User.IsInRole("ADMIN");

        if (!isAuth && currentUserId > 0)
        {
            var profile = await _userService.GetUserProfileAsync(currentUserId, currentUserId);
            if (profile?.Roles != null)
            {
                isAuth = profile.Roles.Any(r =>
                    string.Equals(r, Roles.HRAdmin, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, "HR Admin", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, "HRADM", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, Roles.SystemAdmin, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, "System Admin", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, "SYSADM", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(r, "ADMIN", StringComparison.OrdinalIgnoreCase));
            }
        }

        if (!isAuth)
        {
            throw new ForbiddenException("Only HR Administrators and System Administrators can configure Notice Period governance.");
        }
    }
}
