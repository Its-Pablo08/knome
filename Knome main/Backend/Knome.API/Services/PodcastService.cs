using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Podcasts;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class PodcastService : IPodcastService
{
    private readonly IPodcastRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly IKarmaService _karmaService;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly ISystemSettingService? _systemSettingService;

    public PodcastService(
        IPodcastRepository repo, 
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

    private async Task CheckIsAdminAsync(int currentUserId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM"))))
        {
            throw new UnauthorizedException("You must be an Administrator to create/modify podcast series definitions.");
        }
    }

    private async Task CheckIsUploaderOrAdminAsync(Podcast podcast, int currentUserId)
    {
        if (podcast.UploaderUserId == currentUserId) return;

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null || !user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM"))))
        {
            throw new UnauthorizedException("You must be the uploader of this podcast episode or an Administrator to modify/delete it.");
        }
    }

    // --- Series ---
    public async Task<PodcastSeriesDto> GetSeriesByIdAsync(int seriesId)
    {
        var series = await _repo.GetSeriesByIdAsync(seriesId);
        if (series == null)
            throw new NotFoundException($"Podcast Series ID {seriesId} not found.");

        return _mapper.Map<PodcastSeriesDto>(series);
    }

    public async Task<List<PodcastSeriesDto>> GetAllSeriesAsync()
    {
        var list = await _repo.GetAllSeriesAsync();
        return _mapper.Map<List<PodcastSeriesDto>>(list);
    }

    public async Task<PodcastSeriesDto> CreateSeriesAsync(int currentUserId, CreatePodcastSeriesDto dto)
    {
        await CheckIsAdminAsync(currentUserId);

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}");
        if (!secCheck.IsValid)
            throw new BadRequestException("Podcast series title or description contain blocked terms per FR-SM-01.");

        var series = new PodcastSeries
        {
            Title = dto.Title,
            Description = dto.Description
        };

        var saved = await _repo.AddSeriesAsync(series);
        return _mapper.Map<PodcastSeriesDto>(saved);
    }

    public async Task<PodcastSeriesDto> UpdateSeriesAsync(int seriesId, int currentUserId, UpdatePodcastSeriesDto dto)
    {
        await CheckIsAdminAsync(currentUserId);

        var series = await _repo.GetSeriesByIdAsync(seriesId);
        if (series == null)
            throw new NotFoundException($"Podcast Series ID {seriesId} not found.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}");
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated podcast series terms contain blocked words per FR-SM-01.");

        series.Title = dto.Title;
        series.Description = dto.Description;

        await _repo.UpdateSeriesAsync(series);
        return _mapper.Map<PodcastSeriesDto>(series);
    }

    public async Task DeleteSeriesAsync(int seriesId, int currentUserId)
    {
        await CheckIsAdminAsync(currentUserId);

        var series = await _repo.GetSeriesByIdAsync(seriesId);
        if (series == null)
            throw new NotFoundException($"Podcast Series ID {seriesId} not found.");

        await _repo.DeleteSeriesAsync(series);
    }

    // --- Episodes ---
    public async Task<PodcastDto> GetPodcastAsync(long podcastId, int currentUserId)
    {
        var podcast = await _repo.GetPodcastByIdAsync(podcastId);
        if (podcast == null || !podcast.IsActive)
            throw new NotFoundException($"Podcast ID {podcastId} not found.");

        var dto = _mapper.Map<PodcastDto>(podcast);
        dto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Podcast, podcastId, currentUserId);
        return dto;
    }

    public async Task<List<PodcastDto>> GetPodcastsAsync(int? seriesId, int? categoryId, string? search, int pageNumber, int pageSize, int currentUserId)
    {
        var podcasts = await _repo.GetPodcastsAsync(seriesId, categoryId, search, pageNumber, pageSize);
        var ids = podcasts.Select(p => (long)p.PodcastId).ToList();
        var summaries = ids.Count > 0
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Podcast, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<PodcastDto>();
        foreach (var p in podcasts)
        {
            var dto = _mapper.Map<PodcastDto>(p);
            dto.EngagementSummary = summaries.TryGetValue(p.PodcastId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Podcast, ContentId = p.PodcastId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<List<PodcastDto>> GetMyPodcastsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await GetUserPodcastsAsync(currentUserId, currentUserId, pageNumber, pageSize);
    }

    public async Task<List<PodcastDto>> GetUserPodcastsAsync(int hostUserId, int currentUserId, int pageNumber = 1, int pageSize = 20)
    {
        var podcasts = await _repo.GetMyPodcastsAsync(hostUserId, pageNumber, pageSize);
        var ids = podcasts.Select(p => (long)p.PodcastId).ToList();
        var summaries = ids.Count > 0
            ? await _interactionService.GetContentSummariesBatchAsync(ContentTypes.Podcast, ids, currentUserId)
            : new Dictionary<long, Knome.API.DTOs.Interactions.ContentSummaryDto>();

        var dtos = new List<PodcastDto>();
        foreach (var p in podcasts)
        {
            var dto = _mapper.Map<PodcastDto>(p);
            dto.EngagementSummary = summaries.TryGetValue(p.PodcastId, out var s) ? s : new Knome.API.DTOs.Interactions.ContentSummaryDto { ContentType = ContentTypes.Podcast, ContentId = p.PodcastId };
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<PodcastDto> CreatePodcastAsync(int currentUserId, CreatePodcastDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        var caller = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isCallerAdmin = caller != null && caller.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM");

        var requireApproval = _systemSettingService != null
            ? await _systemSettingService.GetRequirePodcastApprovalAsync()
            : true;

        if (requireApproval && !isCallerAdmin)
        {
            throw new ForbiddenException("Administrator approval is required before podcasts are published per enterprise governance policy.");
        }

        if (dto.SeriesId.HasValue)
        {
            var series = await _repo.GetSeriesByIdAsync(dto.SeriesId.Value);
            if (series == null)
                throw new BadRequestException($"Podcast Series ID {dto.SeriesId.Value} does not exist.");
        }

        // FK existence validation (GBV-001) — CategoryId
        if (!dto.CategoryId.HasValue && !string.IsNullOrWhiteSpace(dto.CategoryName))
        {
            var matchingCat = await _db.Categories.FirstOrDefaultAsync(c => c.Name.ToLower() == dto.CategoryName.Trim().ToLower());
            if (matchingCat != null)
            {
                dto.CategoryId = matchingCat.CategoryId;
            }
        }

        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }

        if (dto.FileSizeMb.HasValue && dto.FileSizeMb.Value > MediaSizeLimits.MaxPodcastSizeMb)
            throw new BadRequestException($"Podcast file size ({dto.FileSizeMb} MB) exceeds maximum permitted size of {MediaSizeLimits.MaxPodcastSizeMb} MB per FR-PD-02.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}", dto.CoverImageUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Podcast content or URLs contain blocked domains or restricted keywords per FR-SM-01.");

        int effectiveUploaderUserId = currentUserId;
        if (dto.UploaderUserId.HasValue && dto.UploaderUserId.Value > 0)
        {
            var userExists = await _db.Users.AnyAsync(u => u.UserId == dto.UploaderUserId.Value);
            if (userExists)
            {
                effectiveUploaderUserId = dto.UploaderUserId.Value;
            }
        }

        string coverUrl = dto.CoverImageUrl ?? string.Empty;
        if (string.IsNullOrWhiteSpace(coverUrl))
        {
            coverUrl = "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=90&w=800";
        }

        var podcast = new Podcast
        {
            UploaderUserId = effectiveUploaderUserId,
            Title = dto.Title,
            Description = dto.Description,
            CoverImageUrl = coverUrl,
            AudioUrl = dto.AudioUrl,
            DurationSeconds = dto.DurationSeconds,
            CategoryId = dto.CategoryId,
            SeriesId = dto.SeriesId,
            FileSizeMb = dto.FileSizeMb,
            UploadedDate = Knome.API.Common.KnomeTime.Now,
            IsActive = true
        };

        var saved = await _repo.AddPodcastAsync(podcast);
        await _karmaService.AwardKarmaAsync(effectiveUploaderUserId, KarmaActivityTypes.CreatePodcast, KarmaPoints.CreatePodcastPoints, ContentTypes.Podcast, saved.PodcastId, KarmaCaps.CreatePodcastDailyCap);

        var resDto = _mapper.Map<PodcastDto>(saved);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Podcast, saved.PodcastId, currentUserId);
        return resDto;
    }

    public async Task<PodcastDto> UpdatePodcastAsync(long podcastId, int currentUserId, UpdatePodcastDto dto)
    {
        var podcast = await _repo.GetPodcastByIdAsync(podcastId);
        if (podcast == null || !podcast.IsActive)
            throw new NotFoundException($"Podcast ID {podcastId} not found.");

        await CheckIsUploaderOrAdminAsync(podcast, currentUserId);

        if (dto.FileSizeMb.HasValue && dto.FileSizeMb.Value > MediaSizeLimits.MaxPodcastSizeMb)
            throw new BadRequestException($"Podcast file size ({dto.FileSizeMb} MB) exceeds maximum permitted size of {MediaSizeLimits.MaxPodcastSizeMb} MB per FR-PD-02.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Title} {dto.Description}", dto.CoverImageUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated podcast content or URLs contain blocked domains or restricted keywords per FR-SM-01.");

        // FK existence validation (GBV-001)
        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }
        if (dto.SeriesId.HasValue)
        {
            var seriesExists = await _repo.GetSeriesByIdAsync(dto.SeriesId.Value);
            if (seriesExists == null)
                throw new BadRequestException($"Podcast Series ID {dto.SeriesId.Value} does not exist.");
        }

        if (dto.Title != null) podcast.Title = dto.Title;
        if (dto.Description != null) podcast.Description = dto.Description;
        if (dto.CoverImageUrl != null) podcast.CoverImageUrl = dto.CoverImageUrl;
        if (dto.AudioUrl != null) podcast.AudioUrl = dto.AudioUrl;
        if (dto.DurationSeconds.HasValue) podcast.DurationSeconds = dto.DurationSeconds.Value;
        if (dto.CategoryId.HasValue) podcast.CategoryId = dto.CategoryId.Value;
        if (dto.SeriesId.HasValue) podcast.SeriesId = dto.SeriesId.Value;
        if (dto.FileSizeMb.HasValue) podcast.FileSizeMb = dto.FileSizeMb.Value;

        await _repo.UpdatePodcastAsync(podcast);

        var updated = await _repo.GetPodcastByIdAsync(podcastId);
        var resDto = _mapper.Map<PodcastDto>(updated!);
        resDto.EngagementSummary = await _interactionService.GetContentSummaryAsync(ContentTypes.Podcast, podcastId, currentUserId);
        return resDto;
    }

    public async Task DeletePodcastAsync(long podcastId, int currentUserId)
    {
        var podcast = await _repo.GetPodcastByIdAsync(podcastId);
        if (podcast == null || !podcast.IsActive)
            throw new NotFoundException($"Podcast ID {podcastId} not found.");

        await CheckIsUploaderOrAdminAsync(podcast, currentUserId);
        await _repo.DeletePodcastAsync(podcast);
    }

    public async Task<int> IncrementViewCountAsync(long podcastId, int currentUserId = 0)
    {
        var exists = await _repo.GetPodcastByIdAsync(podcastId);
        if (exists == null || !exists.IsActive)
            throw new NotFoundException($"Podcast ID {podcastId} not found.");

        var count = await _interactionService.RecordViewAsync(ContentTypes.Podcast, podcastId, currentUserId);
        return (int)count;
    }
}
