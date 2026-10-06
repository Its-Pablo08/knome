using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Messages;

namespace Knome.API.Interfaces;

public interface IUserMessageService
{
    Task<List<ConversationDto>> GetConversationsAsync(int currentUserId);

    Task<List<UserMessageDto>> GetHistoryAsync(int currentUserId, int otherUserId, int pageNumber, int pageSize);

    Task<UserMessageDto> SendMessageAsync(int currentUserId, SendMessageDto dto);

    Task<UserMessageDto> EditMessageAsync(long messageId, int currentUserId, string newContent);

    Task<bool> DeleteMessageAsync(long messageId, int currentUserId);

    Task<List<MessageReactionDto>> ToggleReactionAsync(long messageId, int currentUserId, string reactionType);

    Task<bool> MarkConversationAsReadAsync(int currentUserId, int otherUserId);

    Task<List<MessageUserSearchDto>> SearchUsersAsync(string query, int currentUserId);
}
