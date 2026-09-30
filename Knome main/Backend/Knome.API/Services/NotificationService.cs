using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.DTOs.Notifications;
using Knome.API.Hubs;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.AspNetCore.SignalR;

namespace Knome.API.Services;

public class NotificationService : INotificationService
{
    private readonly INotificationRepository _repository;
    private readonly IUserRepository _userRepository;
    private readonly IMapper _mapper;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        INotificationRepository repository,
        IUserRepository userRepository,
        IMapper mapper,
        IHubContext<NotificationHub> hubContext,
        ILogger<NotificationService> logger)
    {
        _repository = repository;
        _userRepository = userRepository;
        _mapper = mapper;
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task<NotificationDto?> PublishAsync(
        int recipientUserId,
        string eventType,
        string message,
        string? relatedContentType = null,
        long? relatedContentId = null)
    {
        try
        {
            var eligible = await _repository.GetEligibleRecipientIdsAsync(eventType, new List<int> { recipientUserId });
            if (eligible.Count == 0)
                return null;

            var notification = new Notification
            {
                UserId = recipientUserId,
                EventType = eventType,
                Message = message,
                RelatedContentType = relatedContentType,
                RelatedContentId = relatedContentId,
                IsRead = false,
                CreatedDate = Knome.API.Common.KnomeTime.Now
            };

            var saved = await _repository.AddAsync(notification);
            var dto = _mapper.Map<NotificationDto>(saved);
            await EnrichNotificationDtoAsync(dto);

            // Real-time broadcast to user group
            await _hubContext.Clients.Group($"User_{recipientUserId}").SendAsync("ReceiveNotification", dto);
            _logger.LogInformation("Notification {NotificationId} ({EventType}) published successfully to User {UserId}", saved.NotificationId, eventType, recipientUserId);

            return dto;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to publish notification for User {UserId}: {Message}", recipientUserId, message);
            return null;
        }
    }

    public async Task PublishBroadcastAsync(
        string eventType,
        string message,
        string? relatedContentType,
        long? relatedContentId,
        IEnumerable<int> candidateUserIds)
    {
        var candidates = candidateUserIds.ToList();
        var eligible = await _repository.GetEligibleRecipientIdsAsync(eventType, candidates);
        if (eligible.Count == 0)
            return;

        var now = Knome.API.Common.KnomeTime.Now;
        var notifications = eligible.Select(userId => new Notification
        {
            UserId = userId,
            EventType = eventType,
            Message = message,
            RelatedContentType = relatedContentType,
            RelatedContentId = relatedContentId,
            IsRead = false,
            CreatedDate = now
        }).ToList();

        if (notifications.Count > 0)
        {
            await _repository.AddRangeAsync(notifications);
            var dtos = _mapper.Map<List<NotificationDto>>(notifications);
            await EnrichNotificationDtosAsync(dtos);

            // Broadcast in real-time
            foreach (var dto in dtos)
            {
                await _hubContext.Clients.Group($"User_{dto.UserId}").SendAsync("ReceiveNotification", dto);
            }
        }
    }

    public async Task<List<NotificationDto>> GetForUserAsync(int userId, bool unreadOnly = false, int pageNumber = 1, int pageSize = 20)
    {
        try
        {
            var skip = (pageNumber < 1 ? 1 : pageNumber - 1) * (pageSize < 1 ? 20 : pageSize);
            var take = pageSize < 1 ? 20 : pageSize;

            var items = await _repository.GetForUserAsync(userId, unreadOnly, skip, take);
            var dtos = _mapper.Map<List<NotificationDto>>(items);
            await EnrichNotificationDtosAsync(dtos);
            return dtos;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Transient error fetching notifications for user {UserId}. Returning empty list fallback.", userId);
            return new List<NotificationDto>();
        }
    }

    public async Task<int> GetUnreadCountAsync(int userId)
    {
        try
        {
            return await _repository.CountForUserAsync(userId, unreadOnly: true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Transient error counting unread notifications for user {UserId}. Returning 0 fallback.", userId);
            return 0;
        }
    }

    public async Task<bool> MarkAsReadAsync(long notificationId, int userId)
    {
        var notification = await _repository.GetByIdAsync(notificationId);
        if (notification is null || notification.UserId != userId)
            return false;

        await _repository.MarkAsReadAsync(notificationId);
        return true;
    }

    public async Task MarkAllAsReadAsync(int userId)
    {
        await _repository.MarkAllAsReadAsync(userId);
    }

    public async Task<bool> DeleteNotificationAsync(long notificationId, int userId)
    {
        var notification = await _repository.GetByIdAsync(notificationId);
        if (notification is null || notification.UserId != userId)
            return false;

        await _repository.DeleteAsync(notificationId);
        return true;
    }

    public async Task<NotificationDto?> CreateNotificationAsync(CreateNotificationDto dto, int senderUserId)
    {
        return await PublishAsync(
            recipientUserId: dto.RecipientUserId,
            eventType: dto.NotificationType,
            message: dto.Message,
            relatedContentType: dto.RelatedContentType ?? Constants.NotificationContentTypes.User,
            relatedContentId: dto.ReferenceId ?? senderUserId
        );
    }

    public async Task<List<NotificationPreferenceDto>> GetPreferencesAsync(int userId)
    {
        var prefs = await _repository.GetPreferencesAsync(userId);
        return _mapper.Map<List<NotificationPreferenceDto>>(prefs);
    }

    public async Task UpdatePreferencesAsync(int userId, List<UpdateNotificationPreferenceDto> preferences)
    {
        var entities = preferences.Select(p => new NotificationPreference
        {
            UserId = userId,
            EventType = p.EventType,
            BellEnabled = p.BellEnabled,
            EmailEnabled = p.EmailEnabled
        }).ToList();

        await _repository.ReplacePreferencesAsync(userId, entities);
    }

    private async Task EnrichNotificationDtoAsync(NotificationDto dto, IReadOnlyDictionary<int, Models.User>? senderMap = null)
    {
        dto.Title = dto.EventType switch
        {
            Constants.NotificationTypes.Follower => "New Follower",
            Constants.NotificationTypes.ConnectionRequest => "Connection Request",
            Constants.NotificationTypes.Comment => dto.Message?.Contains("replied", StringComparison.OrdinalIgnoreCase) == true ? "Comment Reply" : "New Comment",
            Constants.NotificationTypes.CommunityJoin => "Community Access Approved",
            Constants.NotificationTypes.CommunityInvite => "Community Invitation",
            Constants.NotificationTypes.HrAnnouncement => "HR Announcement",
            Constants.NotificationTypes.Job => "New Job Posting",
            Constants.NotificationTypes.Badge => "Karma Badge Earned",
            Constants.NotificationTypes.Mention => "Mentioned You",
            Constants.NotificationTypes.Reaction => dto.Message?.Contains("comment", StringComparison.OrdinalIgnoreCase) == true ? "Comment Liked" : "New Reaction",
            Constants.NotificationTypes.Share => "Content Shared",
            _ => dto.EventType ?? "Notification"
        };

        if (dto.RelatedContentType == Constants.NotificationContentTypes.User && dto.RelatedContentId.HasValue)
        {
            var senderId = (int)dto.RelatedContentId.Value;
            dto.SenderUserId = senderId;

            Models.User? sender = null;
            if (senderMap != null && senderMap.TryGetValue(senderId, out var foundSender))
            {
                sender = foundSender;
            }
            else if (senderMap == null)
            {
                try
                {
                    sender = await _userRepository.GetProfileByIdAsync(senderId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load sender profile {SenderId}", senderId);
                }
            }

            if (sender != null)
            {
                dto.SenderName = sender.FullName;
                dto.SenderAvatar = sender.ProfilePhotoUrl;
            }
        }

        if (string.IsNullOrEmpty(dto.SenderName) && !string.IsNullOrEmpty(dto.Message))
        {
            var match = System.Text.RegularExpressions.Regex.Match(dto.Message, @"^(.+?)\s+(shared|invited|sent|commented|liked|reacted|posted|mentioned|replied)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (match.Success && !string.IsNullOrWhiteSpace(match.Groups[1].Value))
            {
                dto.SenderName = match.Groups[1].Value.Trim();
            }
        }

        if (dto.EventType == Constants.NotificationTypes.ConnectionRequest)
        {
            if (dto.Message?.Contains("accepted", StringComparison.OrdinalIgnoreCase) == true)
            {
                dto.Title = "Connection Accepted";
                dto.TargetUrl = "/network?tab=Connections";
            }
            else
            {
                dto.Title = "Connection Request";
                dto.TargetUrl = "/network?tab=Requests";
            }
        }
        else if (dto.EventType == "AdminBroadcast" || dto.RelatedContentType == "RoleRequest" || (dto.Message?.Contains("Admin Console", StringComparison.OrdinalIgnoreCase) == true))
        {
            dto.Title = "Administrative Alert";
            dto.TargetUrl = "/admin";
        }
        else if (!string.IsNullOrEmpty(dto.RelatedContentType) && dto.RelatedContentId.HasValue)
        {
            var type = dto.RelatedContentType.ToLower();
            var id = dto.RelatedContentId.Value;

            dto.TargetUrl = type switch
            {
                "post" => $"/posts?id={id}",
                "comment" => $"/posts?id={id}",
                "article" => $"/article-view?id={id}",
                "video" => $"/videos?id={id}",
                "podcast" => $"/podcasts?id={id}",
                "audio" => $"/podcasts?id={id}",
                "community" => $"/community/view?id={id}",
                "user" => $"/profile?id={id}",
                "job" => $"/jobs?id={id}",
                "badge" => "/karma-history",
                _ => null
            };
        }
    }

    private async Task EnrichNotificationDtosAsync(IEnumerable<NotificationDto> dtos)
    {
        var list = dtos.ToList();
        if (list.Count == 0) return;

        var senderIds = list
            .Where(d => d.RelatedContentType == Constants.NotificationContentTypes.User && d.RelatedContentId.HasValue)
            .Select(d => (int)d.RelatedContentId.Value)
            .Distinct()
            .ToList();

        Dictionary<int, Models.User>? senderMap = null;
        if (senderIds.Count > 0)
        {
            try
            {
                var senders = await _userRepository.FindAsync(u => senderIds.Contains(u.UserId));
                senderMap = senders.ToDictionary(u => u.UserId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to batch query senders for notifications.");
            }
        }

        foreach (var dto in list)
        {
            await EnrichNotificationDtoAsync(dto, senderMap);
        }
    }

    public async Task<List<BroadcastItemDto>> GetBroadcastAnnouncementsAsync()
    {
        var raw = await _repository.GetRecentBroadcastsAsync(50);
        if (raw.Count == 0) return new List<BroadcastItemDto>();

        var seenMessages = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<BroadcastItemDto>();

        foreach (var item in raw)
        {
            var msg = item.Message?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(msg) || seenMessages.Contains(msg))
                continue;

            // Exclude regular user post/article notifications
            if (!string.IsNullOrEmpty(item.RelatedContentType) && 
                (item.RelatedContentType.Equals("post", StringComparison.OrdinalIgnoreCase) || 
                 item.RelatedContentType.Equals("article", StringComparison.OrdinalIgnoreCase)) &&
                msg.Contains("published a new", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            // Exclude personal user notifications (role updates, moderation alerts, login greetings)
            if (msg.Contains("roles have been updated", StringComparison.OrdinalIgnoreCase) ||
                msg.Contains("role has been updated", StringComparison.OrdinalIgnoreCase) ||
                msg.Contains("reviewed by moderation", StringComparison.OrdinalIgnoreCase) ||
                msg.StartsWith("First-time login", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(item.RelatedContentType, "User", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(item.RelatedContentType, "VideoModeration", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            seenMessages.Add(msg);

            string title = "Organization Announcement";
            string content = msg;

            if (msg.Contains('|'))
            {
                var parts = msg.Split('|', 2);
                title = parts[0].Trim();
                content = parts.Length > 1 ? parts[1].Trim() : parts[0].Trim();
            }

            result.Add(new BroadcastItemDto
            {
                Id = item.NotificationId,
                Title = title,
                Message = msg,
                Content = content,
                CreatedDate = item.CreatedDate,
                Sender = "HR Administration",
                EventType = item.EventType
            });
        }

        return result;
    }

    public async Task<bool> UpdateBroadcastAsync(long id, string newMessage)
    {
        var affected = await _repository.UpdateBroadcastMessageAsync(id, newMessage);
        if (affected > 0)
        {
            try
            {
                string title = "Organization Announcement";
                string content = newMessage;
                if (newMessage.Contains('|'))
                {
                    var parts = newMessage.Split('|', 2);
                    title = parts[0].Trim();
                    content = parts.Length > 1 ? parts[1].Trim() : parts[0].Trim();
                }

                await _hubContext.Clients.All.SendAsync("BroadcastUpdated", new
                {
                    Id = id,
                    Title = title,
                    Message = newMessage,
                    Content = content
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast real-time BroadcastUpdated SignalR event.");
            }
            return true;
        }
        return false;
    }

    public async Task<bool> DeleteBroadcastAsync(long id)
    {
        var affected = await _repository.DeleteBroadcastBatchAsync(id);
        if (affected > 0)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("BroadcastDeleted", new { Id = id });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast real-time BroadcastDeleted SignalR event.");
            }
            return true;
        }
        return false;
    }
}