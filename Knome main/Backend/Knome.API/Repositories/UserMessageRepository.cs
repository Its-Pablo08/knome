using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class UserMessageRepository : IUserMessageRepository
{
    private readonly KnomeDbContext _context;

    public UserMessageRepository(KnomeDbContext context)
    {
        _context = context;
    }

    public async Task<UserMessage> AddMessageAsync(UserMessage message)
    {
        _context.UserMessages.Add(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<UserMessage?> GetByIdAsync(long messageId)
    {
        return await _context.UserMessages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .FirstOrDefaultAsync(m => m.MessageId == messageId);
    }

    public async Task<UserMessage?> GetByIdWithDetailsAsync(long messageId)
    {
        return await _context.UserMessages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Include(m => m.ParentMessage!).ThenInclude(p => p.Sender)
            .Include(m => m.Reactions)
            .FirstOrDefaultAsync(m => m.MessageId == messageId);
    }

    public async Task<List<UserMessage>> GetConversationHistoryAsync(int currentUserId, int otherUserId, int pageNumber, int pageSize)
    {
        var messages = await _context.UserMessages
            .AsNoTracking()
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Include(m => m.ParentMessage!).ThenInclude(p => p.Sender)
            .Include(m => m.Reactions)
            .Where(m =>
                (m.SenderId == currentUserId && m.ReceiverId == otherUserId && !m.IsDeletedBySender) ||
                (m.SenderId == otherUserId && m.ReceiverId == currentUserId && !m.IsDeletedByReceiver))
            .OrderByDescending(m => m.CreatedDate)
            .ThenByDescending(m => m.MessageId)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return messages.OrderBy(m => m.CreatedDate).ThenBy(m => m.MessageId).ToList();
    }

    public async Task<List<UserMessage>> GetLatestMessagesForConversationsAsync(int currentUserId)
    {
        // Get all relevant messages where current user is participant and message is not deleted by them
        var userMessagesQuery = _context.UserMessages
            .Include(m => m.Sender).ThenInclude(u => u.Department)
            .Include(m => m.Receiver).ThenInclude(u => u.Department)
            .Where(m =>
                (m.SenderId == currentUserId && !m.IsDeletedBySender) ||
                (m.ReceiverId == currentUserId && !m.IsDeletedByReceiver));

        var allRecent = await userMessagesQuery
            .OrderByDescending(m => m.CreatedDate)
            .Take(500)
            .ToListAsync();

        // Group by partner ID in-memory to get the single latest message per conversation partner
        var conversations = allRecent
            .GroupBy(m => m.SenderId == currentUserId ? m.ReceiverId : m.SenderId)
            .Select(g => g.First())
            .OrderByDescending(m => m.CreatedDate)
            .ToList();

        return conversations;
    }

    public async Task<int> GetUnreadCountFromSenderAsync(int receiverId, int senderId)
    {
        return await _context.UserMessages
            .CountAsync(m => m.ReceiverId == receiverId && m.SenderId == senderId && !m.IsRead && !m.IsDeletedByReceiver);
    }

    public async Task MarkMessagesAsReadAsync(int receiverId, int senderId)
    {
        var unread = await _context.UserMessages
            .Where(m => m.ReceiverId == receiverId && m.SenderId == senderId && !m.IsRead)
            .ToListAsync();

        if (unread.Any())
        {
            var now = DateTime.UtcNow;
            foreach (var msg in unread)
            {
                msg.IsRead = true;
                msg.ReadDate = now;
                msg.UpdatedDate = now;
            }
            await _context.SaveChangesAsync();
        }
    }

    public async Task UpdateAsync(UserMessage message)
    {
        _context.UserMessages.Update(message);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> AreUsersConnectedAsync(int userId1, int userId2)
    {
        var hasAcceptedRequest = await _context.ConnectionRequests
            .AnyAsync(cr =>
                ((cr.SenderId == userId1 && cr.ReceiverId == userId2) ||
                 (cr.SenderId == userId2 && cr.ReceiverId == userId1)) &&
                (cr.Status.ToLower() == "accepted" || cr.Status.ToLower() == "connected"));

        if (hasAcceptedRequest)
        {
            return true;
        }

        var isFollower = await _context.Followers
            .AnyAsync(f =>
                (f.FollowerUserId == userId1 && f.FollowingUserId == userId2) ||
                (f.FollowerUserId == userId2 && f.FollowingUserId == userId1));

        return isFollower;
    }

    public async Task<UserMessageReaction?> GetReactionAsync(long messageId, int userId, string reactionType)
    {
        return await _context.UserMessageReactions
            .FirstOrDefaultAsync(r => r.MessageId == messageId && r.UserId == userId && r.ReactionType == reactionType);
    }

    public async Task AddReactionAsync(UserMessageReaction reaction)
    {
        _context.UserMessageReactions.Add(reaction);
        await _context.SaveChangesAsync();
    }

    public async Task RemoveReactionAsync(UserMessageReaction reaction)
    {
        _context.UserMessageReactions.Remove(reaction);
        await _context.SaveChangesAsync();
    }

    public async Task<List<UserMessageReaction>> GetReactionsForMessageAsync(long messageId)
    {
        return await _context.UserMessageReactions
            .Where(r => r.MessageId == messageId)
            .ToListAsync();
    }

    public async Task<List<User>> SearchUsersForMessagingAsync(string query, int currentUserId, int limit = 20)
    {
        var baseQuery = _context.Users
            .Include(u => u.Department)
            .Where(u => u.UserId != currentUserId && u.IsActive && !u.IsPermanentlySuspended);

        var trimmed = (query ?? string.Empty).Trim().ToLower();
        if (!string.IsNullOrEmpty(trimmed))
        {
            baseQuery = baseQuery.Where(u =>
                u.FullName.ToLower().Contains(trimmed) ||
                (u.EmployeeId != null && u.EmployeeId.ToLower().Contains(trimmed)) ||
                (u.Email != null && u.Email.ToLower().Contains(trimmed)) ||
                (u.Designation != null && u.Designation.ToLower().Contains(trimmed)) ||
                (u.Department != null && u.Department.Name.ToLower().Contains(trimmed)));
        }

        return await baseQuery
            .OrderBy(u => u.FullName)
            .Take(limit)
            .ToListAsync();
    }
}
