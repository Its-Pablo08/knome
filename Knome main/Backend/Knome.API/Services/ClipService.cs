using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Constants;
using Knome.API.DTOs.Clips;
using Knome.API.Exceptions;
using Knome.API.Hubs;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Knome.API.Services;

public class ClipService : IClipService
{
    private readonly IClipRepository _clipRepo;
    private readonly IUserRepository _userRepo;
    private readonly ICommunityRepository _communityRepo;
    private readonly IContentInteractionRepository _interactionRepo;
    private readonly INotificationService _notificationService;
    private readonly IKarmaService _karmaService;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly IMapper _mapper;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ILogger<ClipService> _logger;

    public ClipService(
        IClipRepository clipRepo,
        IUserRepository userRepo,
        ICommunityRepository communityRepo,
        IContentInteractionRepository interactionRepo,
        INotificationService notificationService,
        IKarmaService karmaService,
        ISuspensionGuard suspensionGuard,
        IMapper mapper,
        IHubContext<NotificationHub> hubContext,
        ILogger<ClipService> logger)
    {
        _clipRepo = clipRepo;
        _userRepo = userRepo;
        _communityRepo = communityRepo;
        _interactionRepo = interactionRepo;
        _notificationService = notificationService;
        _karmaService = karmaService;
        _suspensionGuard = suspensionGuard;
        _mapper = mapper;
        _hubContext = hubContext;
        _logger = logger;
    }


    public async Task<List<ClipDto>> GetFeedClipsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20, string? hashtag = null, long? communityId = null)
    {
        var clips = await _clipRepo.GetFeedClipsAsync(currentUserId, pageNumber, pageSize, hashtag, communityId);
        if (clips.Count == 0) return new List<ClipDto>();

        var clipIds = clips.Select(c => c.ClipId).ToList();
        var likedMap = await _clipRepo.GetLikedClipsMapAsync(clipIds, currentUserId);
        var bookmarkedMap = await _clipRepo.GetBookmarkedClipsMapAsync(clipIds, currentUserId);
        var commentsMap = await _clipRepo.GetCommentsCountMapAsync(clipIds);

        var dtos = new List<ClipDto>();
        foreach (var clip in clips)
        {
            var dto = _mapper.Map<ClipDto>(clip);
            dto.IsLikedByCurrentUser = likedMap.TryGetValue(clip.ClipId, out var liked) && liked;
            dto.IsBookmarkedByCurrentUser = bookmarkedMap.TryGetValue(clip.ClipId, out var bookmarked) && bookmarked;
            dto.IsMyClip = clip.CreatedByUserId == currentUserId;
            if (commentsMap.TryGetValue(clip.ClipId, out var cCount))
            {
                dto.CommentsCount = cCount;
            }
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<ClipDto> GetByIdAsync(long clipId, int currentUserId)
    {
        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        var dto = _mapper.Map<ClipDto>(clip);
        dto.IsLikedByCurrentUser = await _clipRepo.IsLikedByUserAsync(clipId, currentUserId);
        dto.IsBookmarkedByCurrentUser = await _clipRepo.IsBookmarkedByUserAsync(clipId, currentUserId);
        dto.IsMyClip = clip.CreatedByUserId == currentUserId;

        var engagement = await _clipRepo.GetClipEngagementAsync(clipId);
        dto.CommentsCount = engagement.CommentsCount;
        dto.LikesCount = Math.Max(clip.LikesCount, engagement.LikesCount);
        dto.ViewCount = Math.Max(clip.ViewCount, engagement.ViewCount);
        dto.SharesCount = Math.Max(clip.SharesCount, engagement.SharesCount);

        return dto;
    }

    public async Task<List<ClipDto>> GetUserClipsAsync(int userId, int currentUserId, int pageNumber = 1, int pageSize = 50)
    {
        var clips = await _clipRepo.GetUserClipsAsync(userId, currentUserId, pageNumber, pageSize);
        if (clips.Count == 0) return new List<ClipDto>();

        var clipIds = clips.Select(c => c.ClipId).ToList();
        var likedMap = await _clipRepo.GetLikedClipsMapAsync(clipIds, currentUserId);
        var bookmarkedMap = await _clipRepo.GetBookmarkedClipsMapAsync(clipIds, currentUserId);
        var commentsMap = await _clipRepo.GetCommentsCountMapAsync(clipIds);

        var dtos = new List<ClipDto>();
        foreach (var clip in clips)
        {
            var dto = _mapper.Map<ClipDto>(clip);
            dto.IsLikedByCurrentUser = likedMap.TryGetValue(clip.ClipId, out var liked) && liked;
            dto.IsBookmarkedByCurrentUser = bookmarkedMap.TryGetValue(clip.ClipId, out var bookmarked) && bookmarked;
            dto.IsMyClip = clip.CreatedByUserId == currentUserId;
            if (commentsMap.TryGetValue(clip.ClipId, out var cCount))
            {
                dto.CommentsCount = cCount;
            }
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<ClipDto> CreateClipAsync(int userId, CreateClipDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);

        if (string.IsNullOrWhiteSpace(dto.Title))
            throw new BadRequestException("Clip title/caption is required.");

        if (string.IsNullOrWhiteSpace(dto.VideoUrl))
            throw new BadRequestException("Video URL is required.");

        if (dto.DurationSeconds > 30)
            throw new BadRequestException("Clips cannot exceed 30 seconds in duration. Videos greater than 30 seconds cannot be uploaded as clips.");

        if (dto.DurationSeconds <= 0)
            dto.DurationSeconds = 15;

        if (dto.Visibility == "Community" && dto.CommunityId.HasValue)
        {
            var comm = await _communityRepo.GetCommunityByIdAsync((int)dto.CommunityId.Value);
            if (comm == null)
                throw new BadRequestException($"Community with ID {dto.CommunityId.Value} does not exist.");
        }

        var clip = _mapper.Map<Clip>(dto);
        clip.CreatedByUserId = userId;
        clip.CreatedDate = DateTime.UtcNow;
        clip.UpdatedDate = DateTime.UtcNow;
        clip.Status = string.IsNullOrWhiteSpace(dto.Status) ? "Published" : dto.Status;
        clip.IsActive = true;
        clip.IsDeleted = false;

        var saved = await _clipRepo.AddAsync(clip);

        // Award karma for published clip
        if (saved.Status == "Published")
        {
            try
            {
                await _karmaService.AwardKarmaAsync(userId, KarmaActivityTypes.CreatePost, 5, ContentTypes.Clip, saved.ClipId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed awarding karma for Clip #{ClipId}", saved.ClipId);
            }
        }

        return await GetByIdAsync(saved.ClipId, userId);
    }

    public async Task<ClipDto> UpdateClipAsync(long clipId, int userId, UpdateClipDto dto, bool isAdmin)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);

        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        if (clip.CreatedByUserId != userId && !isAdmin)
            throw new ForbiddenException("You are not authorized to edit this clip.");

        if (!string.IsNullOrWhiteSpace(dto.Title)) clip.Title = dto.Title;
        if (dto.Description != null) clip.Description = dto.Description;
        if (dto.ThumbnailUrl != null) clip.ThumbnailUrl = dto.ThumbnailUrl;
        if (dto.Hashtags != null) clip.Hashtags = dto.Hashtags;
        if (!string.IsNullOrWhiteSpace(dto.Visibility)) clip.Visibility = dto.Visibility;
        if (dto.CommunityId.HasValue) clip.CommunityId = dto.CommunityId.Value;
        if (dto.AudienceUserIds != null) clip.AudienceUserIds = dto.AudienceUserIds;
        if (!string.IsNullOrWhiteSpace(dto.Status)) clip.Status = dto.Status;

        clip.UpdatedDate = DateTime.UtcNow;
        await _clipRepo.UpdateAsync(clip);

        return await GetByIdAsync(clipId, userId);
    }

    public async Task DeleteClipAsync(long clipId, int userId, bool isAdmin)
    {
        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        if (clip.CreatedByUserId != userId && !isAdmin)
            throw new ForbiddenException("You are not authorized to delete this clip.");

        await _clipRepo.SoftDeleteAsync(clipId, userId);

        // If an admin removed someone else's clip, notify the author
        if (isAdmin && clip.CreatedByUserId != userId)
        {
            try
            {
                await _notificationService.PublishAsync(
                    clip.CreatedByUserId,
                    NotificationTypes.HrAnnouncement,
                    $"Your clip \"{clip.Title}\" has been removed by an administrator for policy compliance.",
                    NotificationContentTypes.Clip,
                    clipId
                );
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed sending admin removal notification for Clip #{ClipId}", clipId);
            }
        }
    }

    public async Task<int> RecordViewAsync(long clipId, int userId)
    {
        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null) return 0;

        // Use Knome unique view enforcement: exactly 1 view per user tracked in ContentViews
        var authoritativeViews = await _interactionRepo.RecordUniqueViewAsync(ContentTypes.Clip, clipId, userId);

        var engagement = await _clipRepo.GetClipEngagementAsync(clipId);
        int finalViews = (int)Math.Max(authoritativeViews, engagement.ViewCount);

        // Real-time broadcast to all connected users
        try
        {
            await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
            {
                clipId,
                viewCount = finalViews,
                likesCount = engagement.LikesCount,
                commentsCount = engagement.CommentsCount,
                sharesCount = engagement.SharesCount,
                userId,
                updateType = "view"
            });

            await _hubContext.Clients.All.SendAsync("ViewCountUpdated", new
            {
                contentType = "Clip",
                contentId = clipId,
                viewCount = finalViews
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast real-time ClipEngagementUpdated for view on Clip #{ClipId}", clipId);
        }

        return finalViews;
    }

    public async Task<bool> ToggleLikeAsync(long clipId, int userId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);

        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        bool isLiked;
        var existingReaction = await _interactionRepo.GetUserReactionAsync(ContentTypes.Clip, clipId, userId);
        if (existingReaction != null)
        {
            // Unlike
            await _interactionRepo.RemoveReactionAsync(existingReaction);
            clip.LikesCount = Math.Max(0, clip.LikesCount - 1);
            await _clipRepo.UpdateAsync(clip);
            isLiked = false;
        }
        else
        {
            // Like
            var newReaction = new Reaction
            {
                ContentType = ContentTypes.Clip,
                ContentId = clipId,
                UserId = userId,
                ReactionType = ReactionTypes.Like,
                CreatedDate = DateTime.UtcNow
            };
            await _interactionRepo.AddReactionAsync(newReaction);

            clip.LikesCount += 1;
            await _clipRepo.UpdateAsync(clip);
            isLiked = true;

            // Notify clip creator if not liking own clip
            if (clip.CreatedByUserId != userId)
            {
                try
                {
                    var actor = await _userRepo.GetByIdAsync(userId);
                    var actorName = actor?.FullName ?? "A colleague";
                    await _notificationService.PublishAsync(
                        clip.CreatedByUserId,
                        NotificationTypes.Reaction,
                        $"{actorName} liked your clip \"{clip.Title}\"",
                        NotificationContentTypes.Clip,
                        clipId
                    );
                    await _karmaService.AwardKarmaAsync(clip.CreatedByUserId, KarmaActivityTypes.ReceiveReaction, 1, ContentTypes.Clip, clipId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed sending like notification for Clip #{ClipId}", clipId);
                }
            }
        }

        var engagement = await _clipRepo.GetClipEngagementAsync(clipId);

        // Real-time broadcast to all connected users
        try
        {
            await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
            {
                clipId,
                viewCount = engagement.ViewCount,
                likesCount = engagement.LikesCount,
                commentsCount = engagement.CommentsCount,
                sharesCount = engagement.SharesCount,
                isLiked,
                userId,
                updateType = "like"
            });

            await _hubContext.Clients.All.SendAsync("ReactionCountUpdated", new
            {
                contentType = "Clip",
                contentId = clipId,
                totalLikes = engagement.LikesCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast real-time ClipEngagementUpdated for like on Clip #{ClipId}", clipId);
        }

        return isLiked;
    }

    public async Task<bool> ToggleBookmarkAsync(long clipId, int userId)
    {
        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        var existingBookmark = await _interactionRepo.GetBookmarkAsync(ContentTypes.Clip, clipId, userId);
        if (existingBookmark != null)
        {
            await _interactionRepo.RemoveBookmarkAsync(existingBookmark);
            return false;
        }

        var newBookmark = new Bookmark
        {
            ContentType = ContentTypes.Clip,
            ContentId = clipId,
            UserId = userId,
            SavedDate = DateTime.UtcNow
        };
        await _interactionRepo.AddBookmarkAsync(newBookmark);
        return true;
    }

    public async Task<bool> ShareClipAsync(long clipId, int userId, ShareClipDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(userId);

        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        var share = new ClipShare
        {
            ClipId = clipId,
            SharedByUserId = userId,
            SharedToType = dto.SharedToType,
            TargetId = dto.TargetId,
            Note = dto.Note,
            CreatedDate = DateTime.UtcNow
        };
        await _clipRepo.AddShareAsync(share);
        await _clipRepo.IncrementShareCountAsync(clipId);

        var actor = await _userRepo.GetByIdAsync(userId);
        var actorName = actor?.FullName ?? "A colleague";

        if (dto.SharedToType.Equals("User", StringComparison.OrdinalIgnoreCase) && dto.TargetId > 0)
        {
            // Direct share to another user
            var targetUserId = (int)dto.TargetId;
            if (targetUserId != userId)
            {
                try
                {
                    await _notificationService.PublishAsync(
                        targetUserId,
                        NotificationTypes.Share,
                        $"{actorName} shared a short video clip with you: \"{clip.Title}\"",
                        NotificationContentTypes.Clip,
                        clipId
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed sending direct share notification for Clip #{ClipId}", clipId);
                }
            }
        }
        else if (dto.SharedToType.Equals("Community", StringComparison.OrdinalIgnoreCase) && dto.TargetId > 0)
        {
            // Shared to community
            try
            {
                var comm = await _communityRepo.GetCommunityByIdAsync((int)dto.TargetId);
                var commName = comm?.Name ?? "Community";

                // Notify clip creator if shared by someone else
                if (clip.CreatedByUserId != userId)
                {
                    await _notificationService.PublishAsync(
                        clip.CreatedByUserId,
                        NotificationTypes.Community,
                        $"{actorName} shared your clip to {commName}!",
                        NotificationContentTypes.Clip,
                        clipId
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed sending community share notification for Clip #{ClipId}", clipId);
            }
        }

        var engagement = await _clipRepo.GetClipEngagementAsync(clipId);

        // Real-time broadcast to all connected users
        try
        {
            await _hubContext.Clients.All.SendAsync("ClipEngagementUpdated", new
            {
                clipId,
                viewCount = engagement.ViewCount,
                likesCount = engagement.LikesCount,
                commentsCount = engagement.CommentsCount,
                sharesCount = engagement.SharesCount,
                userId,
                updateType = "share"
            });

            await _hubContext.Clients.All.SendAsync("ShareCountUpdated", new
            {
                contentType = "Clip",
                contentId = clipId,
                sharesCount = engagement.SharesCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast real-time ClipEngagementUpdated for share on Clip #{ClipId}", clipId);
        }

        return true;
    }

    public async Task<List<ClipViewerDto>> GetClipViewersAsync(long clipId)
    {
        return await _clipRepo.GetClipViewersAsync(clipId);
    }

    public async Task<ClipEngagementDto> GetClipEngagementAsync(long clipId)
    {
        return await _clipRepo.GetClipEngagementAsync(clipId);
    }


    public async Task<(List<ClipDto> Items, int TotalCount)> GetAllClipsForAdminAsync(int pageNumber = 1, int pageSize = 50, string? search = null, string? status = null)
    {
        var clips = await _clipRepo.GetAllClipsForAdminAsync(pageNumber, pageSize, search, status);
        var totalCount = await _clipRepo.GetAdminClipsCountAsync(search, status);

        var dtos = clips.Select(c => _mapper.Map<ClipDto>(c)).ToList();
        return (dtos, totalCount);
    }

    public async Task<ClipDto> AdminUpdateStatusAsync(long clipId, int adminUserId, string status)
    {
        var clip = await _clipRepo.GetByIdAsync(clipId);
        if (clip == null)
            throw new NotFoundException($"Clip with ID {clipId} not found.");

        clip.Status = status;
        if (status.Equals("Removed", StringComparison.OrdinalIgnoreCase))
        {
            clip.IsActive = false;
            clip.IsDeleted = true;
        }
        else if (status.Equals("Published", StringComparison.OrdinalIgnoreCase))
        {
            clip.IsActive = true;
            clip.IsDeleted = false;
        }

        clip.UpdatedDate = DateTime.UtcNow;
        await _clipRepo.UpdateAsync(clip);

        return _mapper.Map<ClipDto>(clip);
    }
}
