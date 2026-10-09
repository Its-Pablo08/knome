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
    /// Gets all current Content & Community Approval and platform communication settings.
    /// </summary>
    [HttpGet("approval")]
    [ProducesResponseType(typeof(ApiResponse<ApprovalSettingDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetApprovalSetting()
    {
        var dto = await _settingService.GetFullApprovalSettingsAsync();
        return Ok(ApiResponse<ApprovalSettingDto>.SuccessResponse(200, "Approval policy settings retrieved.", dto));
    }

    /// <summary>
    /// Updates independent approval and communication settings (System Administrator or HR Administrator only).
    /// </summary>
    [HttpPut("approval")]
    [Authorize]
    [ProducesResponseType(typeof(ApiResponse<ApprovalSettingDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateApprovalSetting([FromBody] UpdateApprovalSettingDto updateDto)
    {
        int currentUserId = 0;
        try { currentUserId = GetCurrentUserId(); } catch { }

        Knome.API.Models.User? dbUser = null;
        if (currentUserId > 0)
        {
            dbUser = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        }
        else
        {
            var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? User.FindFirst("email")?.Value;
            var empId = User.FindFirst("empId")?.Value;
            if (!string.IsNullOrEmpty(email) || !string.IsNullOrEmpty(empId))
            {
                dbUser = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => 
                    (!string.IsNullOrEmpty(email) && u.Email == email) || 
                    (!string.IsNullOrEmpty(empId) && u.EmployeeId == empId));
                if (dbUser != null) currentUserId = dbUser.UserId;
            }
        }

        var isSysAdmin = (dbUser != null && dbUser.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || 
            r.RoleCode == "SYSADM" || 
            r.RoleCode == "ADMIN" ||
            r.RoleName == Roles.HRAdmin ||
            r.RoleCode == "HRADM" ||
            r.RoleName == "System Admin" ||
            r.RoleName == "HR Admin")) ||
            User.IsInRole(Roles.SystemAdmin) ||
            User.IsInRole("System Admin") ||
            User.IsInRole(Roles.HRAdmin) ||
            User.IsInRole("HR Admin") ||
            User.IsInRole("SYSADM") ||
            User.IsInRole("ADMIN");

        if (!isSysAdmin)
        {
            throw new ForbiddenException("Only System Administrators and HR Administrators are authorized to modify content and community approval policies.");
        }

        var dto = await _settingService.UpdateApprovalSettingsAsync(updateDto, currentUserId);
        return Ok(ApiResponse<ApprovalSettingDto>.SuccessResponse(200, "Platform configuration policies updated successfully.", dto));
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
