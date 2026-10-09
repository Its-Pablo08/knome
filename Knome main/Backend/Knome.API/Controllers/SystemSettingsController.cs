using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Settings;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/settings")]
public class SystemSettingsController : KnomeControllerBase
{
    private readonly ISystemSettingService _settingService;
    private readonly KnomeDbContext _db;

    public SystemSettingsController(ISystemSettingService settingService, KnomeDbContext db)
    {
        _settingService = settingService;
        _db = db;
    }

    /// <summary>
    /// Gets the current Content & Community Approval setting.
    /// </summary>
    [HttpGet("approval")]
    [ProducesResponseType(typeof(ApiResponse<ApprovalSettingDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetApprovalSetting()
    {
        var requireApproval = await _settingService.GetRequireContentAndCommunityApprovalAsync();
        var dto = new ApprovalSettingDto
        {
            SettingKey = "RequireContentAndCommunityApproval",
            RequireApproval = requireApproval,
            Description = "Require administrator approval before communities, videos and podcasts are published."
        };
        return Ok(ApiResponse<ApprovalSettingDto>.SuccessResponse(200, "Approval policy setting retrieved.", dto));
    }

    /// <summary>
    /// Updates the Content & Community Approval setting (System Administrator only).
    /// </summary>
    [HttpPut("approval")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<ApprovalSettingDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateApprovalSetting([FromBody] UpdateApprovalSettingDto updateDto)
    {
        var currentUserId = GetCurrentUserId();
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isSysAdmin = user != null && user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || 
            r.RoleCode == "SYSADM" || 
            r.RoleCode == "ADMIN" ||
            r.RoleName == Roles.HRAdmin);

        if (!isSysAdmin && !User.IsInRole(Roles.SystemAdmin))
        {
            throw new ForbiddenException("Only System Administrators are authorized to modify content and community approval policies.");
        }

        var result = await _settingService.SetRequireContentAndCommunityApprovalAsync(updateDto.RequireApproval, currentUserId);
        var dto = new ApprovalSettingDto
        {
            SettingKey = "RequireContentAndCommunityApproval",
            RequireApproval = result,
            Description = "Require administrator approval before communities, videos and podcasts are published.",
            UpdatedDate = Knome.API.Common.KnomeTime.Now,
            UpdatedByUserId = currentUserId
        };

        return Ok(ApiResponse<ApprovalSettingDto>.SuccessResponse(200, "Content & Community approval policy updated successfully.", dto));
    }

    /// <summary>
    /// Lists all persisted system settings.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAllSettings()
    {
        var settings = await _settingService.GetAllSettingsAsync();
        return Ok(ApiResponse<object>.SuccessResponse(200, "Settings retrieved.", settings));
    }
}
