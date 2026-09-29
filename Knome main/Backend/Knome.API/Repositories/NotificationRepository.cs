using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class NotificationRepository : INotificationRepository
{
    private readonly KnomeDbContext _db;

    public NotificationRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<Notification> AddAsync(Notification notification)
    {
        _db.Notifications.Add(notification);
        await _db.SaveChangesAsync();
        return notification;
    }

    public async Task AddRangeAsync(IEnumerable<Notification> notifications)
    {
        await _db.Notifications.AddRangeAsync(notifications);
        await _db.SaveChangesAsync();
    }

    public async Task<Notification?> GetByIdAsync(long notificationId)
    {
        return await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId);
    }

    public async Task<List<Notification>> GetForUserAsync(int userId, bool unreadOnly, int skip, int take)
    {
        var cutoff = Knome.API.Common.KnomeTime.Now.AddMonths(-3);
        var query = _db.Notifications.Where(n => n.UserId == userId && n.CreatedDate >= cutoff);
        if (unreadOnly)
            query = query.Where(n => !n.IsRead);

        return await query
            .OrderByDescending(n => n.CreatedDate)
            .Skip(skip)
            .Take(take)
            .ToListAsync();
    }

    public async Task<int> CountForUserAsync(int userId, bool unreadOnly)
    {
        var cutoff = Knome.API.Common.KnomeTime.Now.AddMonths(-3);
        var query = _db.Notifications.Where(n => n.UserId == userId && n.CreatedDate >= cutoff);
        if (unreadOnly)
            query = query.Where(n => !n.IsRead);

        return await query.CountAsync();
    }

    public async Task MarkAsReadAsync(long notificationId)
    {
        var notification = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId);
        if (notification is null)
            return;

        notification.IsRead = true;
        await _db.SaveChangesAsync();
    }

    public async Task MarkAllAsReadAsync(int userId)
    {
        var unread = await _db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync();

        foreach (var n in unread)
            n.IsRead = true;

        await _db.SaveChangesAsync();
    }

    public async Task<List<NotificationPreference>> GetPreferencesAsync(int userId)
    {
        return await _db.NotificationPreferences
            .Where(p => p.UserId == userId)
            .ToListAsync();
    }

    public async Task DeleteAsync(long notificationId)
    {
        var notification = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId);
        if (notification != null)
        {
            _db.Notifications.Remove(notification);
            await _db.SaveChangesAsync();
        }
    }

    public async Task ReplacePreferencesAsync(int userId, List<NotificationPreference> preferences)
    {
        var existing = await _db.NotificationPreferences
            .Where(p => p.UserId == userId)
            .ToListAsync();

        foreach (var pref in preferences)
        {
            var match = existing.FirstOrDefault(e => e.EventType.Equals(pref.EventType, StringComparison.OrdinalIgnoreCase));
            if (match != null)
            {
                match.BellEnabled = pref.BellEnabled;
                match.EmailEnabled = pref.EmailEnabled;
            }
            else
            {
                pref.UserId = userId;
                await _db.NotificationPreferences.AddAsync(pref);
            }
        }
        await _db.SaveChangesAsync();
    }

    public async Task<List<int>> GetEligibleRecipientIdsAsync(string eventType, List<int> candidateUserIds)
    {
        if (candidateUserIds.Count == 0)
            return new List<int>();

        // Ensure user IDs actually exist in dbo.Users table to prevent FK constraint violations
        var existingUserIds = await _db.Users
            .Where(u => candidateUserIds.Contains(u.UserId))
            .Select(u => u.UserId)
            .ToListAsync();

        if (existingUserIds.Count == 0)
            return new List<int>();

        var disabled = await _db.NotificationPreferences
            .Where(p => p.EventType == eventType && !p.BellEnabled && existingUserIds.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToListAsync();

        return existingUserIds.Where(id => !disabled.Contains(id)).ToList();
    }

    public async Task<List<Notification>> GetRecentBroadcastsAsync(int take = 10)
    {
        var cutoff = Knome.API.Common.KnomeTime.Now.AddDays(-30);
        return await _db.Notifications
            .Where(n => (n.EventType == Constants.NotificationTypes.HrAnnouncement || n.EventType == "AdminBroadcast") && n.CreatedDate >= cutoff)
            .OrderByDescending(n => n.CreatedDate)
            .Take(take > 0 ? take : 10)
            .ToListAsync();
    }

    public async Task<int> UpdateBroadcastMessageAsync(long notificationId, string newMessage)
    {
        var target = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId);
        if (target == null) return 0;

        var oldMessage = target.Message;
        var eventType = target.EventType;
        var targetDate = target.CreatedDate;
        var windowStart = targetDate.AddMinutes(-30);
        var windowEnd = targetDate.AddMinutes(30);

        var siblings = await _db.Notifications
            .Where(n => n.EventType == eventType && n.Message == oldMessage && n.CreatedDate >= windowStart && n.CreatedDate <= windowEnd)
            .ToListAsync();

        if (siblings.Count == 0)
        {
            target.Message = newMessage;
            await _db.SaveChangesAsync();
            return 1;
        }

        foreach (var s in siblings)
        {
            s.Message = newMessage;
        }
        await _db.SaveChangesAsync();
        return siblings.Count;
    }

    public async Task<int> DeleteBroadcastBatchAsync(long notificationId)
    {
        var target = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId);
        if (target == null) return 0;

        var oldMessage = target.Message;
        var eventType = target.EventType;
        var targetDate = target.CreatedDate;
        var windowStart = targetDate.AddMinutes(-30);
        var windowEnd = targetDate.AddMinutes(30);

        var siblings = await _db.Notifications
            .Where(n => n.EventType == eventType && n.Message == oldMessage && n.CreatedDate >= windowStart && n.CreatedDate <= windowEnd)
            .ToListAsync();

        if (siblings.Count == 0)
        {
            _db.Notifications.Remove(target);
            await _db.SaveChangesAsync();
            return 1;
        }

        _db.Notifications.RemoveRange(siblings);
        await _db.SaveChangesAsync();
        return siblings.Count;
    }
}