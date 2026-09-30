using System.Security.Claims;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.DTOs.Notifications;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : KnomeControllerBase
{
    private readonly INotificationService _notificationService;
    private readonly IUserRepository _userRepository;

    public NotificationsController(INotificationService notificationService, IUserRepository userRepository)
    {
        _notificationService = notificationService;
        _userRepository = userRepository;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<NotificationDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetNotifications([FromQuery] bool unreadOnly = false, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var result = await _notificationService.GetForUserAsync(GetCurrentUserId(), unreadOnly, pageNumber, pageSize);
        return Ok(ApiResponse<List<NotificationDto>>.SuccessResponse(200, "Notifications retrieved successfully.", result));
    }

    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUnreadCount()
    {
        var count = await _notificationService.GetUnreadCountAsync(GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Unread count retrieved successfully.", count));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<NotificationDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateNotification([FromBody] CreateNotificationDto dto)
    {
        var result = await _notificationService.CreateNotificationAsync(dto, GetCurrentUserId());
        return StatusCode(StatusCodes.Status201Created, ApiResponse<NotificationDto>.SuccessResponse(201, "Notification created successfully.", result));
    }

    [HttpPut("{id:long}/read")]
    [HttpPost("{id:long}/read")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MarkAsRead(long id)
    {
        var ok = await _notificationService.MarkAsReadAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Notification marked as read successfully.", ok));
    }

    [HttpPut("read-all")]
    [HttpPost("read-all")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MarkAllAsRead()
    {
        await _notificationService.MarkAllAsReadAsync(GetCurrentUserId());
        return Ok(ApiResponse<bool>.SuccessResponse(200, "All notifications marked as read successfully.", true));
    }

    [HttpDelete("{id:long}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteNotification(long id)
    {
        var ok = await _notificationService.DeleteNotificationAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Notification deleted successfully.", ok));
    }

    [HttpGet("preferences")]
    [ProducesResponseType(typeof(ApiResponse<List<NotificationPreferenceDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPreferences()
    {
        var prefs = await _notificationService.GetPreferencesAsync(GetCurrentUserId());
        return Ok(ApiResponse<List<NotificationPreferenceDto>>.SuccessResponse(200, "Preferences retrieved successfully.", prefs));
    }

    [HttpPut("preferences")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePreferences([FromBody] List<UpdateNotificationPreferenceDto> preferences)
    {
        await _notificationService.UpdatePreferencesAsync(GetCurrentUserId(), preferences);
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Preferences updated successfully.", true));
    }

    [HttpGet("broadcasts")]
    [ProducesResponseType(typeof(ApiResponse<List<BroadcastItemDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBroadcasts()
    {
        var result = await _notificationService.GetBroadcastAnnouncementsAsync();
        return Ok(ApiResponse<List<BroadcastItemDto>>.SuccessResponse(200, "Broadcast announcements retrieved successfully.", result));
    }

    [HttpPost("broadcast")]
    [Authorize(Roles = Roles.HRAdmin + "," + Roles.SystemAdmin + ",System Admin,SYSADM,HR Admin,HRADMIN")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastNotificationDto dto)
    {
        var activeIds = await _userRepository.GetAllActiveUserIdsAsync();
        if (activeIds.Count > 0)
        {
            var fullMessage = !string.IsNullOrWhiteSpace(dto.Title)
                ? $"{dto.Title.Trim()} | {dto.Message.Trim()}"
                : dto.Message.Trim();

            await _notificationService.PublishBroadcastAsync(
                Constants.NotificationTypes.HrAnnouncement,
                fullMessage,
                dto.RelatedContentType,
                dto.RelatedContentId,
                activeIds);
        }
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Broadcast announcement sent successfully.", true));
    }

    [HttpPut("broadcast/{id:long}")]
    [Authorize(Roles = Roles.HRAdmin + "," + Roles.SystemAdmin + ",System Admin,SYSADM,HR Admin,HRADMIN")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateBroadcast(long id, [FromBody] UpdateBroadcastDto dto)
    {
        var fullMessage = !string.IsNullOrWhiteSpace(dto.Title)
            ? $"{dto.Title.Trim()} | {dto.Message.Trim()}"
            : dto.Message.Trim();

        var success = await _notificationService.UpdateBroadcastAsync(id, fullMessage);
        if (!success)
        {
            return NotFound(ApiResponse<bool>.FailureResponse(404, "Broadcast announcement not found or could not be updated."));
        }
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Broadcast announcement updated successfully.", true));
    }

    [HttpDelete("broadcast/{id:long}")]
    [Authorize(Roles = Roles.HRAdmin + "," + Roles.SystemAdmin + ",System Admin,SYSADM,HR Admin,HRADMIN")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteBroadcast(long id)
    {
        var success = await _notificationService.DeleteBroadcastAsync(id);
        if (!success)
        {
            return NotFound(ApiResponse<bool>.FailureResponse(404, "Broadcast announcement not found or could not be removed."));
        }
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Broadcast announcement removed successfully.", true));
    }
}