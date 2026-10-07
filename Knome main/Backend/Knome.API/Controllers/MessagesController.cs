using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Messages;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MessagesController : KnomeControllerBase
{
    private readonly IUserMessageService _messageService;

    public MessagesController(IUserMessageService messageService)
    {
        _messageService = messageService;
    }

    /// <summary>
    /// Searches platform users for starting a new direct message conversation.
    /// </summary>
    [HttpGet("users")]
    [ProducesResponseType(typeof(ApiResponse<List<MessageUserSearchDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SearchUsers([FromQuery] string? query)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.SearchUsersAsync(query ?? string.Empty, currentUserId);
        return Ok(ApiResponse<List<MessageUserSearchDto>>.SuccessResponse(200, "Users retrieved successfully.", result));
    }

    /// <summary>
    /// Retrieves all active 1-to-1 conversations for current user with previews and unread counts.
    /// </summary>
    [HttpGet("conversations")]
    [ProducesResponseType(typeof(ApiResponse<List<ConversationDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetConversations()
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.GetConversationsAsync(currentUserId);
        return Ok(ApiResponse<List<ConversationDto>>.SuccessResponse(200, "Conversations retrieved successfully.", result));
    }

    /// <summary>
    /// Retrieves paginated decrypted message history between current user and partner.
    /// </summary>
    [HttpGet("history/{otherUserId:int}")]
    [ProducesResponseType(typeof(ApiResponse<List<UserMessageDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetHistory(
        [FromRoute] int otherUserId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.GetHistoryAsync(currentUserId, otherUserId, pageNumber, pageSize);
        return Ok(ApiResponse<List<UserMessageDto>>.SuccessResponse(200, "Message history retrieved successfully.", result));
    }

    /// <summary>
    /// Sends a direct message with AES-256-GCM encryption, optional reply parent ID, and attachments.
    /// </summary>
    [HttpPost("send")]
    [ProducesResponseType(typeof(ApiResponse<UserMessageDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> SendMessage([FromBody] SendMessageDto dto)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.SendMessageAsync(currentUserId, dto);
        return StatusCode(StatusCodes.Status201Created, ApiResponse<UserMessageDto>.SuccessResponse(201, "Message sent successfully.", result));
    }

    /// <summary>
    /// Edits an existing message sent by current user.
    /// </summary>
    [HttpPut("{messageId:long}")]
    [ProducesResponseType(typeof(ApiResponse<UserMessageDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> EditMessage([FromRoute] long messageId, [FromBody] EditMessageDto dto)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.EditMessageAsync(messageId, currentUserId, dto.Content);
        return Ok(ApiResponse<UserMessageDto>.SuccessResponse(200, "Message updated successfully.", result));
    }

    /// <summary>
    /// Adds or toggles a reaction on a direct message (e.g. 👍, ❤️, 😂, 😮, 😢, 🎉).
    /// </summary>
    [HttpPost("{messageId:long}/reactions")]
    [ProducesResponseType(typeof(ApiResponse<List<MessageReactionDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleReaction([FromRoute] long messageId, [FromBody] ToggleReactionDto dto)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.ToggleReactionAsync(messageId, currentUserId, dto.ReactionType);
        return Ok(ApiResponse<List<MessageReactionDto>>.SuccessResponse(200, "Reaction updated successfully.", result));
    }

    /// <summary>
    /// Marks incoming messages from the specified partner as read and notifies sender.
    /// </summary>
    [HttpPost("read/{otherUserId:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MarkAsRead([FromRoute] int otherUserId)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.MarkConversationAsReadAsync(currentUserId, otherUserId);
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Conversation marked as read.", result));
    }

    /// <summary>
    /// Soft-deletes a message with options: delete for me or delete for everyone.
    /// </summary>
    [HttpDelete("{messageId:long}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteMessage([FromRoute] long messageId, [FromQuery] bool deleteForEveryone = false)
    {
        var currentUserId = GetCurrentUserId();
        var result = await _messageService.DeleteMessageAsync(messageId, currentUserId, deleteForEveryone);
        return Ok(ApiResponse<bool>.SuccessResponse(200, "Message deleted successfully.", result));
    }

    /// <summary>
    /// Retrieves currently active online user IDs.
    /// </summary>
    [HttpGet("online-users")]
    [ProducesResponseType(typeof(ApiResponse<List<int>>), StatusCodes.Status200OK)]
    public IActionResult GetOnlineUsers()
    {
        var activeIds = Knome.API.Hubs.NotificationHub.GetActiveOnlineUserIds();
        return Ok(ApiResponse<List<int>>.SuccessResponse(200, "Online users retrieved successfully.", activeIds));
    }
}
