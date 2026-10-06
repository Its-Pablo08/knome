using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.Models;

namespace Knome.API.Interfaces;

public interface IUserMessageRepository
{
    Task<UserMessage> AddMessageAsync(UserMessage message);

    Task<UserMessage?> GetByIdAsync(long messageId);

    Task<UserMessage?> GetByIdWithDetailsAsync(long messageId);

    Task<List<UserMessage>> GetConversationHistoryAsync(int currentUserId, int otherUserId, int pageNumber, int pageSize);

    Task<List<UserMessage>> GetLatestMessagesForConversationsAsync(int currentUserId);

    Task<int> GetUnreadCountFromSenderAsync(int receiverId, int senderId);

    Task MarkMessagesAsReadAsync(int receiverId, int senderId);

    Task UpdateAsync(UserMessage message);

    Task<bool> AreUsersConnectedAsync(int userId1, int userId2);

    Task<UserMessageReaction?> GetReactionAsync(long messageId, int userId, string reactionType);

    Task AddReactionAsync(UserMessageReaction reaction);

    Task RemoveReactionAsync(UserMessageReaction reaction);

    Task<List<UserMessageReaction>> GetReactionsForMessageAsync(long messageId);

    Task<List<User>> SearchUsersForMessagingAsync(string query, int currentUserId, int limit = 20);
}
