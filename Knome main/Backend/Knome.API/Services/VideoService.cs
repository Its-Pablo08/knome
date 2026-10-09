using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Videos;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class VideoService : IVideoService
{
    private readonly IVideoRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly IKarmaService _karmaService;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly ISystemSettingService? _systemSettingService;

    public VideoService(
        IVideoRepository repo, 
        IContentInteractionService interactionService, 
        IKarmaService karmaService, 
        KnomeDbContext db, 
        IMapper mapper, 
        ISuspensionGuard suspensionGuard,
        ISystemSettingService? systemSettingService = null)
    {
        _repo = repo;
        _interactionService = interactionService;
        _karmaService = karmaService;
        _db = db;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _systemSettingService = systemSettingService;
    }

    private async Task CheckIsUploaderOrAdminAsync(Video video, int currentUserId)
    {
        if (video.UploaderUserId == currentUserId) return;

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM"))))
        {
            throw new UnauthorizedException("You must be the uploader of this video or an Administrator to modify/delete it.");
        }
    }

    public async Task<VideoDto> GetVideoAsync(long videoId, int currentUserId)
    {
        var video = await _repo.GetVideoByIdAsync(videoId);
        if (video == null)
            throw new NotFoundException($"Video ID {videoId} not found.");

        if (currentUserId > 0)
        {
            var authoritativeViews = await _interactionService.RecordViewAsync(ContentTypes.Video, videoId, currentUserId);
            video.ViewCount = (int)authoritativeViews;
        }

        var dto = _mapper.Map<VideoDto>(video);
        dto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Video, videoId, currentUserId);
        return dto;
    }

    public async Task<List<VideoDto>> GetVideosAsync(int? categoryId, string? tag, string? search, int pageNumber, int pageSize, int currentUserId)
    {
        var videos = await _repo.GetVideosAsync(categoryId, tag, search, pageNumber, pageSize);
        var ids = videos.Select(v => (long)v.VideoId).ToList();
        var summaries = ids.Count > 0
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Video, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<VideoDto>();
        foreach (var v in videos)
        {
            var dto = _mapper.Map<VideoDto>(v);
            dto.EngagementSummary = summaries.TryGetValue(v.VideoId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Video, ContentId = v.VideoId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<List<VideoDto>> GetMyVideosAsync(int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await GetUserVideosAsync(currentUserId, currentUserId, pageNumber, pageSize);
    }

    public async Task<List<VideoDto>> GetUserVideosAsync(int uploaderUserId, int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        var videos = await _repo.GetMyVideosAsync(uploaderUserId, pageNumber, pageSize);
        var ids = videos.Select(v => (long)v.VideoId).ToList();
        var summaries = ids.Count > 0
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Video, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<VideoDto>();
        foreach (var v in videos)
        {
            var dto = _mapper.Map<VideoDto>(v);
            dto.EngagementSummary = summaries.TryGetValue(v.VideoId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Video, ContentId = v.VideoId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<VideoDto> CreateVideoAsync(int currentUserId, CreateVideoDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        var caller = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isCallerAdmin = caller != null && caller.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM");

        var requireApproval = _systemSettingService != null
            ? await _systemSettingService.GetRequireContentAndCommunityApprovalAsync()
            : true;

        if (requireApproval && !isCallerAdmin)
        {
            throw new ForbiddenException("Administrator approval is required before videos are published per enterprise governance policy.");
        }

        if (dto.FileSizeMb.HasValue && dto.FileSizeMb.Value > MediaSizeLimits.MaxVideoSizeMb)
            throw new BadRequestException($"Video file size ({dto.FileSizeMb} MB) exceeds maximum permitted size of {MediaSizeLimits.MaxVideoSizeMb} MB per FR-VC-01.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}", dto.SourceUrl ?? dto.ThumbnailUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Video content or URLs contain blocked domains or restricted keywords per FR-SM-01.");

        // FK existence validation (GBV-001)
        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }

        int effectiveUploaderUserId = currentUserId;
        if (dto.UploaderUserId.HasValue && dto.UploaderUserId.Value > 0)
        {
            var userExists = await _db.Users.AnyAsync(u => u.UserId == dto.UploaderUserId.Value);
            if (userExists)
            {
                effectiveUploaderUserId = dto.UploaderUserId.Value;
            }
        }

        var video = new Video
        {
            UploaderUserId = effectiveUploaderUserId,
            Title = dto.Title,
            Description = dto.Description,
            CategoryId = dto.CategoryId,
            ThumbnailUrl = dto.ThumbnailUrl,
            SourceType = dto.SourceType,
            SourceUrl = dto.SourceUrl ?? string.Empty,
            FileSizeMb = dto.FileSizeMb,
            ViewCount = 0,
            UploadedDate = Knome.API.Common.KnomeTime.Now
        };

        var saved = await _repo.AddVideoAsync(video, dto.Tags);
        await _karmaService.AwardKarmaAsync(effectiveUploaderUserId, KarmaActivityTypes.CreateVideo, KarmaPoints.CreateVideoPoints, ContentTypes.Video, saved.VideoId, KarmaCaps.CreateVideoDailyCap);

        var resDto = _mapper.Map<VideoDto>(saved);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Video, saved.VideoId, currentUserId);
        return resDto;
    }

    public async Task<VideoDto> UpdateVideoAsync(long videoId, int currentUserId, UpdateVideoDto dto)
    {
        var video = await _repo.GetVideoByIdAsync(videoId);
        if (video == null)
            throw new NotFoundException($"Video ID {videoId} not found.");

        await CheckIsUploaderOrAdminAsync(video, currentUserId);

        if (dto.FileSizeMb.HasValue && dto.FileSizeMb.Value > MediaSizeLimits.MaxVideoSizeMb)
            throw new BadRequestException($"Video file size ({dto.FileSizeMb} MB) exceeds maximum permitted size of {MediaSizeLimits.MaxVideoSizeMb} MB per FR-VC-01.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}", dto.SourceUrl ?? dto.ThumbnailUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated video content or URLs contain blocked domains or restricted keywords per FR-SM-01.");

        // FK existence validation (GBV-001)
        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }

        if (dto.Title != null) video.Title = dto.Title;
        if (dto.Description != null) video.Description = dto.Description;
        if (dto.CategoryId.HasValue) video.CategoryId = dto.CategoryId.Value;
        if (dto.ThumbnailUrl != null) video.ThumbnailUrl = dto.ThumbnailUrl;
        if (dto.SourceType != null) video.SourceType = dto.SourceType;
        if (dto.SourceUrl != null) video.SourceUrl = dto.SourceUrl;
        if (dto.FileSizeMb.HasValue) video.FileSizeMb = dto.FileSizeMb.Value;

        await _repo.UpdateVideoAsync(video, dto.Tags);

        var updated = await _repo.GetVideoByIdAsync(videoId);
        var resDto = _mapper.Map<VideoDto>(updated!);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Video, videoId, currentUserId);
        return resDto;
    }

    public async Task DeleteVideoAsync(long videoId, int currentUserId)
    {
        var video = await _repo.GetVideoByIdAsync(videoId);
        if (video == null)
            throw new NotFoundException($"Video ID {videoId} not found.");

        await CheckIsUploaderOrAdminAsync(video, currentUserId);
        await _repo.DeleteVideoAsync(video);
    }

    public async Task<int> IncrementViewCountAsync(long videoId, int currentUserId = 0)
    {
        var video = await _repo.GetVideoByIdAsync(videoId);
        if (video == null)
            throw new NotFoundException($"Video ID {videoId} not found.");

        var count = await _interactionService.RecordViewAsync(ContentTypes.Video, videoId, currentUserId);
        return (int)count;
    }
}
