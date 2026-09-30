using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Common;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Communities;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Knome.API.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Knome.API.Services;

public class CommunityService : ICommunityService
{
    private readonly ICommunityRepository _repo;
    private readonly IContentInteractionService _interactionService;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly INotificationService _notificationService;
    private readonly IPostRepository _postRepo;
    private readonly IKarmaService _karmaService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CommunityService>? _logger;
    private static readonly object _commFilesLock = new();

    public CommunityService(
        ICommunityRepository repo,
        IContentInteractionService interactionService,
        KnomeDbContext db,
        IMapper mapper,
        ISuspensionGuard suspensionGuard,
        INotificationService notificationService,
        IPostRepository postRepo,
        IKarmaService karmaService,
        IConfiguration configuration,
        ILogger<CommunityService>? logger = null)
    {
        _repo = repo;
        _interactionService = interactionService;
        _db = db;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _notificationService = notificationService;
        _postRepo = postRepo;
        _karmaService = karmaService;
        _configuration = configuration;
        _logger = logger;
    }

    private async Task CheckIsAdminOrSysAdminAsync(int communityId, int currentUserId)
    {
        var exists = await _db.Communities.AnyAsync(c => c.CommunityId == communityId);
        if (!exists)
            throw new NotFoundException($"Community ID {communityId} not found.");

        var isAdmin = await _repo.IsCommunityAdminAsync(communityId, currentUserId);
        if (!isAdmin)
        {
            // Also check if user is a System Administrator, HR Administrator, or Community Admin
            var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
            if (user == null || !user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin || r.RoleName == Roles.CommunityAdmin))
            {
                throw new UnauthorizedException("You must be a Community Admin, HR Administrator, or System Administrator to perform this action.");
            }
        }
    }

    private async Task CheckCanViewCommunityAsync(int communityId, int currentUserId, Community? community = null)
    {
        if (community == null)
            community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);

        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        if (!community.IsActive || community.ApprovalStatus != "Approved")
        {
            var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
            var isPrivileged = user != null && user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin || r.RoleName == Roles.CommunityAdmin);
            var isCreator = community.CreatedByUserId == currentUserId;

            if (!isPrivileged && !isCreator)
            {
                throw new UnauthorizedException("This community is currently pending HR / Administrator approval and is not yet publicly accessible.");
            }
        }

        if (community.CommunityType == CommunityTypes.Private)
        {
            var isAdmin = await _repo.IsCommunityAdminAsync(communityId, currentUserId);
            if (!isAdmin)
            {
                var member = await _repo.GetMemberAsync(communityId, currentUserId);
                if (member == null || member.Status != CommunityMemberStatuses.Approved)
                {
                    // Check if System Administrator
                    var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
                    if (user == null || !user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin))
                    {
                        throw new UnauthorizedException("You must be an approved member to view or interact with this private community.");
                    }
                }
            }
        }
    }

    // --- Discovery & Details ---
    public async Task<CommunityDto> GetCommunityAsync(int communityId, int currentUserId)
    {
        var community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        if (!community.IsActive || community.ApprovalStatus != "Approved")
        {
            var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
            var isPrivileged = user != null && user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin || r.RoleName == Roles.CommunityAdmin);
            var isCreator = community.CreatedByUserId == currentUserId;

            if (!isPrivileged && !isCreator)
            {
                throw new UnauthorizedException("This community is currently pending HR / Administrator approval and is not yet publicly accessible.");
            }
        }

        var dto = _mapper.Map<CommunityDto>(community);
        dto.IsCurrentUserAdmin = await _repo.IsCommunityAdminAsync(communityId, currentUserId);
        
        var member = await _repo.GetMemberAsync(communityId, currentUserId);
        dto.CurrentUserMembershipStatus = member?.Status;

        if (dto.IsCurrentUserAdmin || member?.Status == CommunityMemberStatuses.Approved)
        {
            await _karmaService.AwardCommunityParticipationAsync(currentUserId, communityId);
        }

        return dto;
    }

    public async Task<List<CommunityDto>> GetCommunitiesAsync(int? categoryId, string? type, string? search, int pageNumber, int pageSize, int currentUserId)
    {
        var communities = await _repo.GetCommunitiesAsync(categoryId, type, search, pageNumber, pageSize);
        var dtos = new List<CommunityDto>();

        foreach (var c in communities)
        {
            var dto = _mapper.Map<CommunityDto>(c);
            dto.IsCurrentUserAdmin = await _repo.IsCommunityAdminAsync(c.CommunityId, currentUserId);
            var member = await _repo.GetMemberAsync(c.CommunityId, currentUserId);
            dto.CurrentUserMembershipStatus = member?.Status;
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<List<CommunityDto>> GetMyCommunitiesAsync(int currentUserId)
    {
        return await GetUserCommunitiesAsync(currentUserId);
    }

    public async Task<List<CommunityDto>> GetUserCommunitiesAsync(int targetUserId)
    {
        var communities = await _repo.GetUserCommunitiesAsync(targetUserId);
        var dtos = new List<CommunityDto>();

        foreach (var c in communities)
        {
            var dto = _mapper.Map<CommunityDto>(c);
            dto.IsCurrentUserAdmin = await _repo.IsCommunityAdminAsync(c.CommunityId, targetUserId);
            var member = await _repo.GetMemberAsync(c.CommunityId, targetUserId);
            dto.CurrentUserMembershipStatus = member?.Status ?? (dto.IsCurrentUserAdmin ? CommunityMemberStatuses.Approved : null);
            dtos.Add(dto);
        }

        return dtos;
    }

    // --- Create & Update ---
    public async Task<CommunityDto> CreateCommunityAsync(int currentUserId, CreateCommunityDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        var trimmedName = dto.Name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedName))
            throw new BadRequestException("Community name cannot be empty.");

        // Duplicate name check across active communities
        if (await _repo.CommunityNameExistsAsync(trimmedName))
            throw new BadRequestException("Community name already existing.");

        // Security Screening (FR-SM-01)
        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Name} {dto.Description} {dto.Rules} {dto.Faq}", dto.BannerUrl ?? dto.ThumbnailUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Community details contain blocked URLs or restricted keywords.");

        // FK existence validation (GBV-001)
        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isHRorAdmin = user != null && user.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin || r.RoleName == Roles.CommunityAdmin);

        var community = new Community
        {
            Name = trimmedName,
            Description = dto.Description,
            BannerUrl = dto.BannerUrl,
            ThumbnailUrl = dto.ThumbnailUrl,
            CategoryId = dto.CategoryId,
            Rules = dto.Rules,
            Faq = dto.Faq,
            CommunityType = dto.CommunityType,
            CreatedByUserId = currentUserId,
            CreatedDate = KnomeTime.Now,
            IsActive = isHRorAdmin,
            ApprovalStatus = isHRorAdmin ? "Approved" : "Pending"
        };

        await _repo.AddCommunityAsync(community);

        // Add creator to CommunityAdmins and as an Approved Admin member
        await _repo.AddCommunityAdminAsync(community.CommunityId, currentUserId);

        var member = new CommunityMember
        {
            CommunityId = community.CommunityId,
            UserId = currentUserId,
            MemberType = CommunityMemberTypes.Admin,
            Status = CommunityMemberStatuses.Approved,
            RequestedDate = KnomeTime.Now,
            DecidedDate = KnomeTime.Now,
            ApprovedByUserId = isHRorAdmin ? currentUserId : null
        };
        await _repo.AddMemberAsync(member);

        if (!isHRorAdmin)
        {
            // Notify Community Admins, HR Administrators & System Administrators of pending community creation request
            var adminUserIds = await _db.Users
                .Where(u => u.IsActive && u.Roles.Any(r => r.RoleName == Roles.HRAdmin || r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.CommunityAdmin))
                .Select(u => u.UserId)
                .Distinct()
                .ToListAsync();

            var creatorName = user?.FullName ?? "An employee";
            foreach (var adminId in adminUserIds)
            {
                try
                {
                    await _notificationService.PublishAsync(
                        adminId,
                        NotificationTypes.Community,
                        $"📋 New Community Approval Request: {creatorName} created \"{community.Name}\". Awaiting HR / Admin approval.",
                        relatedContentType: NotificationContentTypes.Community,
                        relatedContentId: community.CommunityId);
                }
                catch
                {
                    // Non-critical notification failure
                }
            }
        }

        return await GetCommunityAsync(community.CommunityId, currentUserId);
    }

    public async Task<CommunityDto> UpdateCommunityAsync(int communityId, int currentUserId, UpdateCommunityDto dto)
    {
        var community = await _repo.GetCommunityByIdAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var trimmedName = dto.Name?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedName))
            throw new BadRequestException("Community name cannot be empty.");

        if (await _repo.CommunityNameExistsAsync(trimmedName, communityId))
            throw new BadRequestException("Community name already existing.");

        var secCheck = await _interactionService.ValidateContentSecurityAsync($"{dto.Name} {dto.Description} {dto.Rules} {dto.Faq}", dto.BannerUrl ?? dto.ThumbnailUrl);
        if (!secCheck.IsValid)
            throw new BadRequestException("Updated community details contain blocked URLs or restricted keywords.");

        // FK existence validation (GBV-001)
        if (dto.CategoryId.HasValue)
        {
            var categoryExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!categoryExists)
                throw new BadRequestException($"Category ID {dto.CategoryId.Value} does not exist.");
        }

        community.Name = trimmedName;
        community.Description = dto.Description;
        community.BannerUrl = dto.BannerUrl;
        community.ThumbnailUrl = dto.ThumbnailUrl;
        if (dto.CategoryId.HasValue) community.CategoryId = dto.CategoryId.Value;
        community.Rules = dto.Rules;
        community.Faq = dto.Faq;

        await _repo.UpdateCommunityAsync(community);
        return await GetCommunityAsync(communityId, currentUserId);
    }

    public async Task DeleteCommunityAsync(int communityId, int currentUserId)
    {
        var community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        var isCreator = community.CreatedByUserId == currentUserId;
        if (!isCreator)
        {
            await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);
        }

        community.IsActive = false;
        community.ApprovalStatus = "Deleted";
        await _repo.UpdateCommunityAsync(community);
    }

    public async Task<bool> CheckCommunityNameExistsAsync(string? name, int? excludeCommunityId = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;

        return await _repo.CommunityNameExistsAsync(name.Trim(), excludeCommunityId);
    }

    // --- Approval Workflow ---
    public async Task<List<CommunityDto>> GetPendingCommunitiesAsync(int currentUserId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        if (user == null)
            throw new UnauthorizedException("User not found.");

        var isPrivilegedAdmin = user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || 
            r.RoleName == Roles.HRAdmin || 
            r.RoleName == Roles.CommunityAdmin);

        var communities = await _repo.GetPendingCommunitiesAsync();

        if (!isPrivilegedAdmin)
        {
            // Regular employees only see pending communities they personally created
            communities = communities.Where(c => c.CreatedByUserId == currentUserId).ToList();
        }

        var dtos = new List<CommunityDto>();
        foreach (var c in communities)
        {
            var dto = _mapper.Map<CommunityDto>(c);
            dto.IsCurrentUserAdmin = isPrivilegedAdmin || c.CreatedByUserId == currentUserId;
            dtos.Add(dto);
        }
        return dtos;
    }

    public async Task<CommunityDto> ApproveCommunityAsync(int communityId, int currentUserId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isPrivilegedAdmin = user != null && user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || 
            r.RoleName == Roles.HRAdmin || 
            r.RoleName == Roles.CommunityAdmin);

        if (!isPrivilegedAdmin)
        {
            throw new UnauthorizedException("Only Community Admins, HR Administrators, or System Administrators can approve communities.");
        }

        var community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        community.IsActive = true;
        community.ApprovalStatus = "Approved";
        await _repo.UpdateCommunityAsync(community);

        // Ensure creator is in CommunityAdmins and has Approved member status
        await _repo.AddCommunityAdminAsync(communityId, community.CreatedByUserId);
        var creatorMember = await _repo.GetMemberAsync(communityId, community.CreatedByUserId);
        if (creatorMember == null)
        {
            creatorMember = new CommunityMember
            {
                CommunityId = communityId,
                UserId = community.CreatedByUserId,
                MemberType = CommunityMemberTypes.Admin,
                Status = CommunityMemberStatuses.Approved,
                RequestedDate = KnomeTime.Now,
                DecidedDate = KnomeTime.Now,
                ApprovedByUserId = currentUserId
            };
            await _repo.AddMemberAsync(creatorMember);
        }
        else
        {
            creatorMember.Status = CommunityMemberStatuses.Approved;
            creatorMember.MemberType = CommunityMemberTypes.Admin;
            creatorMember.DecidedDate = KnomeTime.Now;
            creatorMember.ApprovedByUserId = currentUserId;
            await _repo.UpdateMemberAsync(creatorMember);
        }

        // Notify creator that community is approved
        try
        {
            var approverName = user?.FullName ?? "Administrator";
            await _notificationService.PublishAsync(
                community.CreatedByUserId,
                NotificationTypes.Community,
                $"🎉 Congratulations! Your community \"{community.Name}\" has been approved by {approverName} and is now live.",
                relatedContentType: NotificationContentTypes.Community,
                relatedContentId: communityId);
        }
        catch
        {
            // Non-critical notification delivery failure
        }

        return await GetCommunityAsync(communityId, currentUserId);
    }

    public async Task RejectCommunityAsync(int communityId, int currentUserId, RejectCommunityDto dto)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isPrivilegedAdmin = user != null && user.Roles.Any(r => 
            r.RoleName == Roles.SystemAdmin || 
            r.RoleName == Roles.HRAdmin || 
            r.RoleName == Roles.CommunityAdmin);

        if (!isPrivilegedAdmin)
        {
            throw new UnauthorizedException("Only Community Admins, HR Administrators, or System Administrators can reject community requests.");
        }

        var community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        community.IsActive = false;
        community.ApprovalStatus = "Rejected";
        await _repo.UpdateCommunityAsync(community);

        // Notify creator that community was rejected
        try
        {
            var adminName = user?.FullName ?? "Administrator";
            var reasonPart = string.IsNullOrWhiteSpace(dto?.Reason) ? string.Empty : $" Reason: {dto.Reason.Trim()}";
            await _notificationService.PublishAsync(
                community.CreatedByUserId,
                NotificationTypes.Community,
                $"❌ Your community request for \"{community.Name}\" was not approved by {adminName}.{reasonPart}",
                relatedContentType: NotificationContentTypes.Community,
                relatedContentId: communityId);
        }
        catch
        {
            // Non-critical notification delivery failure
        }
    }

    // --- Membership & Joining ---
    public async Task<CommunityMemberDto> JoinCommunityAsync(int communityId, int currentUserId)
    {
        var community = await _repo.GetCommunityByIdAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        var existingMember = await _repo.GetMemberAsync(communityId, currentUserId);
        if (existingMember != null)
        {
            if (existingMember.Status == CommunityMemberStatuses.Approved || existingMember.Status == CommunityMemberStatuses.Pending)
                return _mapper.Map<CommunityMemberDto>(existingMember);

            if (existingMember.Status == CommunityMemberStatuses.Banned)
                throw new BadRequestException("You have been banned from joining this community.");

            // Re-apply if previously rejected
            var isAutoApprove = community.CommunityType == CommunityTypes.Public || community.CommunityType == CommunityTypes.Org || community.CommunityType == CommunityTypes.Default;
            existingMember.Status = isAutoApprove
                ? CommunityMemberStatuses.Approved
                : CommunityMemberStatuses.Pending;
            existingMember.RequestedDate = KnomeTime.Now;
            existingMember.DecidedDate = isAutoApprove ? KnomeTime.Now : null;

            await _repo.UpdateMemberAsync(existingMember);
            return _mapper.Map<CommunityMemberDto>(existingMember);
        }

        var newMember = new CommunityMember
        {
            CommunityId = communityId,
            UserId = currentUserId,
            MemberType = CommunityMemberTypes.Subscriber,
            Status = (community.CommunityType == CommunityTypes.Public || community.CommunityType == CommunityTypes.Org || community.CommunityType == CommunityTypes.Default)
                ? CommunityMemberStatuses.Approved
                : CommunityMemberStatuses.Pending,
            RequestedDate = KnomeTime.Now,
            DecidedDate = (community.CommunityType == CommunityTypes.Public || community.CommunityType == CommunityTypes.Org || community.CommunityType == CommunityTypes.Default) ? KnomeTime.Now : null
        };

        await _repo.AddMemberAsync(newMember);

        if (newMember.Status == CommunityMemberStatuses.Pending)
        {
            var adminIds = await _db.Communities
                .Where(c => c.CommunityId == communityId)
                .SelectMany(c => c.Users)
                .Select(u => u.UserId)
                .ToListAsync();
            if (adminIds.Count > 0)
            {
                await _notificationService.PublishBroadcastAsync(
                    NotificationTypes.CommunityJoin,
                    $"A new join request is pending for {community.Name}.",
                    relatedContentType: NotificationContentTypes.Community,
                    relatedContentId: communityId,
                    candidateUserIds: adminIds);
            }
        }

        // Fetch back with User navigation resolved for DTO mapping
        var savedMember = await _repo.GetMemberAsync(communityId, currentUserId);
        return _mapper.Map<CommunityMemberDto>(savedMember);
    }

    public async Task LeaveCommunityAsync(int communityId, int currentUserId)
    {
        var community = await _repo.GetCommunityByIdAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        if (community.CommunityType == CommunityTypes.Default || community.CommunityType == CommunityTypes.Org)
            throw new BadRequestException("Employees cannot leave an Org system community (FR-CM-04).");

        var isAdmin = await _repo.IsCommunityAdminAsync(communityId, currentUserId);
        if (isAdmin)
        {
            var adminsCount = await _repo.GetCommunityAdminsCountAsync(communityId);
            if (adminsCount <= 1)
                throw new BadRequestException("Cannot leave community as you are the sole remaining Community Admin. Assign another admin first.");

            await _repo.RemoveCommunityAdminAsync(communityId, currentUserId);
        }

        var member = await _repo.GetMemberAsync(communityId, currentUserId);
        if (member != null)
        {
            await _repo.RemoveMemberAsync(member);
        }
    }

    public async Task<List<CommunityMemberDto>> GetMembersAsync(int communityId, string? status, int pageNumber, int pageSize, int currentUserId)
    {
        await CheckCanViewCommunityAsync(communityId, currentUserId);

        // If asking for pending/rejected/banned queues, verify admin
        if (status == CommunityMemberStatuses.Pending || status == CommunityMemberStatuses.Rejected || status == CommunityMemberStatuses.Banned)
        {
            await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);
        }

        var members = await _repo.GetMembersAsync(communityId, status, pageNumber, pageSize);
        return _mapper.Map<List<CommunityMemberDto>>(members);
    }

    public async Task<CommunityMemberDto> DecideMembershipAsync(int communityId, int targetUserId, int currentUserId, DecideMembershipDto dto)
    {
        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var member = await _repo.GetMemberAsync(communityId, targetUserId);
        if (member == null)
            throw new NotFoundException($"User ID {targetUserId} is not a member or applicant of this community.");

        member.Status = dto.Status;
        member.DecidedDate = KnomeTime.Now;
        member.ApprovedByUserId = currentUserId;

        if (dto.Status == CommunityMemberStatuses.Banned || dto.Status == CommunityMemberStatuses.Rejected)
        {
            var isTargetAdmin = await _repo.IsCommunityAdminAsync(communityId, targetUserId);
            if (isTargetAdmin)
            {
                var adminsCount = await _repo.GetCommunityAdminsCountAsync(communityId);
                if (adminsCount <= 1)
                    throw new BadRequestException("Cannot remove or suspend the sole remaining Community Admin. Promote another member to Community Administrator first.");
            }

            await _repo.RemoveCommunityAdminAsync(communityId, targetUserId);
            member.MemberType = CommunityMemberTypes.Subscriber;
        }

        await _repo.UpdateMemberAsync(member);

        if (dto.Status == CommunityMemberStatuses.Approved)
        {
            var community = await _repo.GetCommunityByIdAsync(communityId);
            await _notificationService.PublishAsync(
                targetUserId,
                NotificationTypes.CommunityJoin,
                $"Your request to join {(community?.Name ?? "the community")} has been approved.",
                relatedContentType: NotificationContentTypes.Community,
                relatedContentId: communityId);
        }
        else if (dto.Status == CommunityMemberStatuses.Rejected)
        {
            var community = await _repo.GetCommunityByIdAsync(communityId);
            await _notificationService.PublishAsync(
                targetUserId,
                NotificationTypes.CommunityJoin,
                $"Your request to join {(community?.Name ?? "the community")} was declined.",
                relatedContentType: NotificationContentTypes.Community,
                relatedContentId: communityId);
        }

        return _mapper.Map<CommunityMemberDto>(member);
    }

    public async Task RemoveMemberAsync(int communityId, int targetUserId, int currentUserId)
    {
        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var community = await _repo.GetCommunityByIdAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        if (community.CommunityType == CommunityTypes.Default || community.CommunityType == CommunityTypes.Org)
            throw new BadRequestException("Members cannot be removed from an Org/Default system community (FR-CM-04).");

        var isTargetAdmin = await _repo.IsCommunityAdminAsync(communityId, targetUserId);
        if (isTargetAdmin)
        {
            var adminsCount = await _repo.GetCommunityAdminsCountAsync(communityId);
            if (adminsCount <= 1)
                throw new BadRequestException("Cannot remove the sole remaining Community Admin. Assign another admin first.");

            await _repo.RemoveCommunityAdminAsync(communityId, targetUserId);
        }

        var member = await _repo.GetMemberAsync(communityId, targetUserId);
        if (member != null)
        {
            await _repo.RemoveMemberAsync(member);
        }

        try
        {
            await _notificationService.PublishAsync(
                targetUserId,
                NotificationTypes.CommunityJoin,
                $"You have been removed from {community.Name}.",
                relatedContentType: NotificationContentTypes.Community,
                relatedContentId: communityId);
        }
        catch
        {
            // Non-critical notification delivery failure
        }
    }

    public async Task<List<CommunityMemberDto>> AddMembersAsync(int communityId, int currentUserId, AddCommunityMembersDto dto)
    {
        if (dto.UserIds == null || dto.UserIds.Count == 0)
            throw new BadRequestException("At least one user ID must be provided.");

        var community = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (community == null)
            throw new NotFoundException($"Community ID {communityId} not found.");

        // Check if caller is System Admin, HR Admin, or Community Admin
        var caller = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var isGlobalAdmin = caller != null && caller.Roles.Any(r => r.RoleName == Roles.SystemAdmin || r.RoleName == Roles.HRAdmin);
        var isCommAdmin = await _repo.IsCommunityAdminAsync(communityId, currentUserId) || community.CreatedByUserId == currentUserId;

        if (!isGlobalAdmin && !isCommAdmin)
        {
            throw new UnauthorizedException("Only System Administrators, HR Administrators, or Community Admins can add members to this community.");
        }

        var targetMemberType = string.Equals(dto.MemberType, CommunityMemberTypes.Admin, StringComparison.OrdinalIgnoreCase) 
            ? CommunityMemberTypes.Admin 
            : CommunityMemberTypes.Member;

        var callerName = caller?.FullName ?? "Administrator";

        foreach (var userId in dto.UserIds.Distinct())
        {
            var targetUser = await _db.Users.FindAsync(userId);
            if (targetUser == null || !targetUser.IsActive)
                continue;

            var existingMember = await _repo.GetMemberAsync(communityId, userId);
            if (existingMember != null)
            {
                existingMember.Status = CommunityMemberStatuses.Approved;
                existingMember.MemberType = targetMemberType;
                existingMember.DecidedDate = KnomeTime.Now;
                existingMember.ApprovedByUserId = currentUserId;
                await _repo.UpdateMemberAsync(existingMember);
            }
            else
            {
                var newMember = new CommunityMember
                {
                    CommunityId = communityId,
                    UserId = userId,
                    MemberType = targetMemberType,
                    Status = CommunityMemberStatuses.Approved,
                    RequestedDate = KnomeTime.Now,
                    DecidedDate = KnomeTime.Now,
                    ApprovedByUserId = currentUserId
                };
                await _repo.AddMemberAsync(newMember);
            }

            if (targetMemberType == CommunityMemberTypes.Admin)
            {
                await _repo.AddCommunityAdminAsync(communityId, userId);
            }

            // Publish in-app SignalR notification to the added user
            try
            {
                await _notificationService.PublishAsync(
                    userId,
                    NotificationTypes.Community,
                    $"📢 You have been added to the community \"{community.Name}\" as {targetMemberType} by {callerName}.",
                    relatedContentType: NotificationContentTypes.Community,
                    relatedContentId: communityId);
            }
            catch
            {
                // Non-critical notification failure
            }
        }

        var updatedMembers = await _repo.GetMembersAsync(communityId, null, 1, 500);
        return _mapper.Map<List<CommunityMemberDto>>(updatedMembers);
    }

    // --- Admin Delegation ---
    public async Task AddAdminAsync(int communityId, int targetUserId, int currentUserId)
    {
        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var member = await _repo.GetMemberAsync(communityId, targetUserId);
        if (member == null || member.Status != CommunityMemberStatuses.Approved)
            throw new BadRequestException("Target user must be an approved member of the community before becoming an admin.");

        await _repo.AddCommunityAdminAsync(communityId, targetUserId);

        member.MemberType = CommunityMemberTypes.Admin;
        await _repo.UpdateMemberAsync(member);

        var community = await _repo.GetCommunityByIdAsync(communityId);
        await _notificationService.PublishAsync(
            targetUserId,
            NotificationTypes.CommunityInvite,
            $"You have been promoted to Community Administrator for {(community?.Name ?? "the community")}.",
            relatedContentType: NotificationContentTypes.Community,
            relatedContentId: communityId);
    }

    public async Task RemoveAdminAsync(int communityId, int targetUserId, int currentUserId)
    {
        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var community = await _repo.GetCommunityByIdAsync(communityId);
        if (community != null && community.CreatedByUserId == targetUserId && currentUserId != targetUserId)
            throw new BadRequestException("Cannot demote or remove the original creator of this community.");

        var adminsCount = await _repo.GetCommunityAdminsCountAsync(communityId);
        if (adminsCount <= 1 && await _repo.IsCommunityAdminAsync(communityId, targetUserId))
            throw new BadRequestException("Cannot remove the sole remaining Community Admin.");

        await _repo.RemoveCommunityAdminAsync(communityId, targetUserId);

        var member = await _repo.GetMemberAsync(communityId, targetUserId);
        if (member != null)
        {
            member.MemberType = CommunityMemberTypes.Subscriber;
            await _repo.UpdateMemberAsync(member);
        }
    }

    // --- Posts & Feed ---
    public async Task<List<CommunityPostItemDto>> GetCommunityPostsAsync(int communityId, int pageNumber, int pageSize, int currentUserId)
    {
        await CheckCanViewCommunityAsync(communityId, currentUserId);

        var communityPosts = await _repo.GetCommunityPostsAsync(communityId, pageNumber, pageSize);
        var dtos = new List<CommunityPostItemDto>();

        foreach (var cp in communityPosts)
        {
            var author = cp.Post.AuthorUser;
            var summary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, cp.PostId, currentUserId);

            var attachments = await _db.PostAttachments
                .Where(pa => pa.PostId == cp.PostId)
                .Select(pa => pa.FileUrl)
                .ToListAsync();

            dtos.Add(new CommunityPostItemDto
            {
                CommunityId = cp.CommunityId,
                PostId = cp.PostId,
                AuthorUserId = cp.Post.AuthorUserId,
                AuthorEmployeeId = author?.EmployeeId ?? string.Empty,
                AuthorFullName = author?.FullName ?? "Unknown",
                AuthorDesignation = author?.Designation,
                AuthorProfilePhotoUrl = author?.ProfilePhotoUrl,
                ContentText = cp.Post.ContentText,
                AttachmentUrls = attachments,
                PublishedDate = cp.Post.PublishedDate ?? cp.Post.CreatedDate,
                IsPinned = cp.IsPinned,
                EngagementSummary = summary
            });
        }

        return dtos;
    }

    public async Task<CommunityPostItemDto> CreateCommunityPostAsync(int communityId, int currentUserId, CreateCommunityPostDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        await CheckCanViewCommunityAsync(communityId, currentUserId);

        // Security screening (FR-SM-01)
        var secCheck = await _interactionService.ValidateContentSecurityAsync(dto.ContentText, dto.AttachmentUrls.FirstOrDefault());
        if (!secCheck.IsValid)
            throw new BadRequestException("Post content or attachments contain blocked URLs or restricted keywords.");

        var post = new Post
        {
            AuthorUserId = currentUserId,
            ContentText = dto.ContentText,
            AudienceType = PostAudiences.Community,
            Status = PostStatuses.Published,
            PublishedDate = KnomeTime.Now,
            CreatedDate = KnomeTime.Now
        };

        post = await _postRepo.AddPostAsync(post, dto.AttachmentUrls, dto.AttachmentTypes, new List<int>());

        var communityPost = new CommunityPost
        {
            CommunityId = communityId,
            PostId = post.PostId,
            IsPinned = false
        };
        await _repo.AddCommunityPostAsync(communityPost);

        // FR-NT-01: notify community members of a new post (producer -> generic engine)
        var memberIds = await _db.CommunityMembers
            .Where(m => m.CommunityId == communityId && m.UserId != currentUserId)
            .Select(m => m.UserId)
            .ToListAsync();
        if (memberIds.Count > 0)
        {
            await _notificationService.PublishBroadcastAsync(
                NotificationTypes.Community,
                "A new post was shared in your community.",
                relatedContentType: ContentTypes.Post,
                relatedContentId: post.PostId,
                candidateUserIds: memberIds);
        }

        var author = await _db.Users.FindAsync(currentUserId);
        var summary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, post.PostId, currentUserId);

        return new CommunityPostItemDto
        {
            CommunityId = communityId,
            PostId = post.PostId,
            AuthorUserId = currentUserId,
            AuthorEmployeeId = author?.EmployeeId ?? string.Empty,
            AuthorFullName = author?.FullName ?? "Unknown",
            AuthorDesignation = author?.Designation,
            AuthorProfilePhotoUrl = author?.ProfilePhotoUrl,
            ContentText = post.ContentText,
            AttachmentUrls = dto.AttachmentUrls,
            PublishedDate = post.PublishedDate ?? KnomeTime.Now,
            IsPinned = false,
            EngagementSummary = summary
        };
    }

    public async Task<CommunityPostItemDto> PinPostAsync(int communityId, long postId, int currentUserId, PinCommunityPostDto dto)
    {
        await CheckIsAdminOrSysAdminAsync(communityId, currentUserId);

        var communityPost = await _repo.GetCommunityPostAsync(communityId, postId);
        if (communityPost == null)
            throw new NotFoundException($"Post ID {postId} not found in Community ID {communityId}.");

        if (dto.IsPinned && !communityPost.IsPinned)
        {
            var pinnedCount = await _repo.GetPinnedPostsCountAsync(communityId);
            if (pinnedCount >= 3)
                throw new BadRequestException("A community can have a maximum of 3 pinned posts per business rules (FR-CM-06). Unpin another post first.");
        }

        communityPost.IsPinned = dto.IsPinned;
        await _repo.UpdateCommunityPostAsync(communityPost);

        if (dto.IsPinned)
        {
            var memberIds = await _db.CommunityMembers
                .Where(m => m.CommunityId == communityId && m.UserId != currentUserId && (m.Status == CommunityMemberStatuses.Approved || m.Status == "Active" || string.IsNullOrEmpty(m.Status)))
                .Select(m => m.UserId)
                .ToListAsync();

            if (memberIds.Count > 0)
            {
                var community = await _repo.GetCommunityByIdAsync(communityId);
                await _notificationService.PublishBroadcastAsync(
                    NotificationTypes.Community,
                    $"An announcement was pinned in {(community?.Name ?? "your community")}.",
                    relatedContentType: ContentTypes.Post,
                    relatedContentId: postId,
                    candidateUserIds: memberIds);
            }
        }

        var author = communityPost.Post.AuthorUser;
        var summary = await _interactionService.GetContentSummaryAsync(ContentTypes.Post, postId, currentUserId);

        var attachments = await _db.PostAttachments
            .Where(pa => pa.PostId == postId)
            .Select(pa => pa.FileUrl)
            .ToListAsync();

        return new CommunityPostItemDto
        {
            CommunityId = communityId,
            PostId = postId,
            AuthorUserId = communityPost.Post.AuthorUserId,
            AuthorEmployeeId = author?.EmployeeId ?? string.Empty,
            AuthorFullName = author?.FullName ?? "Unknown",
            AuthorDesignation = author?.Designation,
            AuthorProfilePhotoUrl = author?.ProfilePhotoUrl,
            ContentText = communityPost.Post.ContentText,
            AttachmentUrls = attachments,
            PublishedDate = communityPost.Post.PublishedDate ?? communityPost.Post.CreatedDate,
            IsPinned = communityPost.IsPinned,
            EngagementSummary = summary
        };
    }

    // --- Files & Documents ---
    private string GetCommunityFilesDirectory()
    {
        var basePath = _configuration["StorageSettings:BasePath"];
        if (string.IsNullOrWhiteSpace(basePath) || !Directory.Exists(basePath))
        {
            basePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        }
        var dir = Path.Combine(basePath, "uploads", "community_files");
        if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
        return dir;
    }

    private string GetCommunityFilesPath(int communityId)
    {
        return Path.Combine(GetCommunityFilesDirectory(), $"community_{communityId}_files.json");
    }

    public async Task<List<CommunityFileDto>> GetCommunityFilesAsync(int communityId, int currentUserId)
    {
        var comm = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (comm != null)
        {
            await CheckCanViewCommunityAsync(communityId, currentUserId, comm);
        }

        var filePath = GetCommunityFilesPath(communityId);
        if (!File.Exists(filePath))
        {
            var localCommDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "community_files");
            var localFilePath = Path.Combine(localCommDir, $"community_{communityId}_files.json");
            if (File.Exists(localFilePath))
            {
                filePath = localFilePath;
            }
            else
            {
                return new List<CommunityFileDto>();
            }
        }

        try
        {
            var json = await File.ReadAllTextAsync(filePath);
            var list = JsonSerializer.Deserialize<List<CommunityFileDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<CommunityFileDto>();
            return list;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed reading community files for community {CommunityId}", communityId);
            return new List<CommunityFileDto>();
        }
    }

    public async Task<CommunityFileDto> AddCommunityFileAsync(int communityId, int currentUserId, CommunityFileDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var comm = await _repo.GetCommunityByIdAnyStatusAsync(communityId);
        if (comm != null)
        {
            await CheckCanViewCommunityAsync(communityId, currentUserId, comm);
        }

        if (string.IsNullOrWhiteSpace(dto.Id))
        {
            dto.Id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        }

        var uploader = await _db.Users.FindAsync(currentUserId);
        if (string.IsNullOrWhiteSpace(dto.UploadedBy))
        {
            dto.UploadedBy = uploader?.FullName ?? "Community Member";
        }
        dto.UploadedByUserId = currentUserId;
        dto.UploadedAt ??= KnomeTime.Now;

        // Auto-detect Audio category
        var ext = (dto.Extension ?? Path.GetExtension(dto.Name)?.TrimStart('.') ?? "").ToLowerInvariant();
        if (new[] { "mp3", "wav", "aac", "ogg", "flac", "m4a", "wma" }.Contains(ext))
        {
            dto.Category = "Audio";
            dto.Extension = ext;
        }

        // If URL contains heavy base64 data, offload it to physical media file on disk to prevent bloated JSON
        if (!string.IsNullOrWhiteSpace(dto.Url) && dto.Url.StartsWith("data:") && dto.Url.Contains(";base64,"))
        {
            try
            {
                var parts = dto.Url.Split(";base64,", 2);
                var fileBytes = Convert.FromBase64String(parts[1]);
                var safeExt = string.IsNullOrWhiteSpace(dto.Extension) ? "bin" : dto.Extension.ToLowerInvariant();
                var mediaFileName = $"media_comm_{communityId}_{dto.Id}.{safeExt}";
                
                var baseStorage = GetCommunityFilesDirectory();
                var uploadsDir = Directory.GetParent(baseStorage)?.FullName ?? baseStorage;
                var mediaDir = Path.Combine(uploadsDir, "media");
                if (!Directory.Exists(mediaDir)) Directory.CreateDirectory(mediaDir);

                var targetMediaFile = Path.Combine(mediaDir, mediaFileName);
                File.WriteAllBytes(targetMediaFile, fileBytes);

                // Also copy to local wwwroot if baseStorage was a network path
                var localWebRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "media");
                if (!Directory.Exists(localWebRoot)) Directory.CreateDirectory(localWebRoot);
                var localMediaFile = Path.Combine(localWebRoot, mediaFileName);
                if (targetMediaFile != localMediaFile)
                {
                    File.WriteAllBytes(localMediaFile, fileBytes);
                }

                dto.Url = $"/uploads/media/{mediaFileName}";
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to offload base64 file to disk for community file {Id}", dto.Id);
            }
        }

        var filePath = GetCommunityFilesPath(communityId);
        lock (_commFilesLock)
        {
            var list = new List<CommunityFileDto>();
            if (File.Exists(filePath))
            {
                try
                {
                    var json = File.ReadAllText(filePath);
                    list = JsonSerializer.Deserialize<List<CommunityFileDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<CommunityFileDto>();
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "Failed parsing existing community files for community {CommunityId}", communityId);
                }
            }

            // Remove any duplicates by ID
            list.RemoveAll(f => string.Equals(f.Id?.Trim(), dto.Id?.Trim(), StringComparison.OrdinalIgnoreCase));
            list.Insert(0, dto);

            var updatedJson = JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(filePath, updatedJson);

            // Also mirror to local wwwroot community_files if filePath is network path
            var localCommDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "community_files");
            if (!Directory.Exists(localCommDir)) Directory.CreateDirectory(localCommDir);
            var localFilePath = Path.Combine(localCommDir, $"community_{communityId}_files.json");
            if (filePath != localFilePath)
            {
                try { File.WriteAllText(localFilePath, updatedJson); } catch {}
            }
        }

        return dto;
    }

    public async Task DeleteCommunityFileAsync(int communityId, string fileId, int currentUserId)
    {
        var paths = new List<string> { GetCommunityFilesPath(communityId) };
        var localCommDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "community_files");
        var localFilePath = Path.Combine(localCommDir, $"community_{communityId}_files.json");
        if (!paths.Contains(localFilePath, StringComparer.OrdinalIgnoreCase))
        {
            paths.Add(localFilePath);
        }

        var decodedFileId = Uri.UnescapeDataString(fileId ?? string.Empty).Trim();

        lock (_commFilesLock)
        {
            foreach (var filePath in paths)
            {
                if (File.Exists(filePath))
                {
                    try
                    {
                        var json = File.ReadAllText(filePath);
                        var list = JsonSerializer.Deserialize<List<CommunityFileDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<CommunityFileDto>();
                        
                        var matching = list.Where(f => 
                            string.Equals(f.Id?.Trim(), fileId?.Trim(), StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(f.Id?.Trim(), decodedFileId, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(f.Name?.Trim(), fileId?.Trim(), StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(f.Name?.Trim(), decodedFileId, StringComparison.OrdinalIgnoreCase)
                        ).ToList();

                        foreach (var m in matching)
                        {
                            if (!string.IsNullOrWhiteSpace(m.Url) && m.Url.StartsWith("/uploads/"))
                            {
                                try
                                {
                                    var relPath = m.Url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                                    var diskPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", relPath);
                                    if (File.Exists(diskPath)) File.Delete(diskPath);
                                }
                                catch { }
                            }
                        }

                        var filtered = list.Where(f => 
                            !string.Equals(f.Id?.Trim(), fileId?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                            !string.Equals(f.Id?.Trim(), decodedFileId, StringComparison.OrdinalIgnoreCase) &&
                            !string.Equals(f.Name?.Trim(), fileId?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                            !string.Equals(f.Name?.Trim(), decodedFileId, StringComparison.OrdinalIgnoreCase)
                        ).ToList();
                        var updatedJson = JsonSerializer.Serialize(filtered, new JsonSerializerOptions { WriteIndented = true });
                        File.WriteAllText(filePath, updatedJson);
                    }
                    catch (Exception ex)
                    {
                        _logger?.LogWarning(ex, "Failed deleting community file {FileId} for community {CommunityId} in {Path}", fileId, communityId, filePath);
                    }
                }
            }
        }
        await Task.CompletedTask;
    }
}
