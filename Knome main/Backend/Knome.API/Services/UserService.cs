using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.User;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepo;
    private readonly IFileStorageService _fileStorage;
    private readonly IMapper _mapper;
    private readonly IAuditLogService _auditLogService;
    private readonly KnomeDbContext _db;
    private readonly INotificationService _notificationService;
    private readonly IEmailService _emailService;
    private readonly ILogger<UserService> _logger;

    public UserService(
        IUserRepository userRepo,
        IFileStorageService fileStorage,
        IMapper mapper,
        IAuditLogService auditLogService,
        KnomeDbContext db,
        INotificationService notificationService,
        IEmailService emailService,
        ILogger<UserService> logger)
    {
        _userRepo = userRepo;
        _fileStorage = fileStorage;
        _mapper = mapper;
        _auditLogService = auditLogService;
        _db = db;
        _notificationService = notificationService;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<UserProfileDto> GetUserProfileAsync(int targetUserId, int requestingUserId)
    {
        var targetUser = await _userRepo.GetProfileByIdAsync(targetUserId);
        if (targetUser == null)
            throw new NotFoundException($"User with ID {targetUserId} not found.");

        var dto = _mapper.Map<UserProfileDto>(targetUser);

        dto.PostsCount = await _db.Posts.CountAsync(p => p.AuthorUserId == targetUserId);
        dto.CommonCommunitiesCount = await _db.Communities.CountAsync(c => c.IsActive && 
            (c.CreatedByUserId == targetUserId || 
             c.CommunityMembers.Any(m => m.UserId == targetUserId && (m.Status == "Approved" || m.Status == "Active")) ||
             c.Users.Any(u => u.UserId == targetUserId) ||
             c.CommunityType == "Default" ||
             c.CommunityType == "Org"));

        if (targetUserId != requestingUserId)
        {
            dto.MutualConnectionsCount = await _userRepo.GetMutualConnectionsCountAsync(requestingUserId, targetUserId);
            
            var connectionRequest = await _userRepo.GetConnectionRequestAsync(requestingUserId, targetUserId) 
                                 ?? await _userRepo.GetConnectionRequestAsync(targetUserId, requestingUserId);

            if (connectionRequest != null && connectionRequest.Status == "Pending")
            {
                dto.ConnectionStatus = "Pending";
            }
            else if (await _userRepo.IsFollowingAsync(requestingUserId, targetUserId))
            {
                dto.ConnectionStatus = "Connected";
            }

            dto.IsFollowing = await _userRepo.IsFollowingAsync(requestingUserId, targetUserId);
        }

        // Apply DPDP Act 2023 visibility enforcement per FR-UP-04
        if (targetUserId != requestingUserId)
        {
            var requestingUser = await _userRepo.GetProfileByIdAsync(requestingUserId);
            var isPrivilegedAdmin = requestingUser != null && requestingUser.Roles.Any(r =>
                r.RoleName == Roles.HRAdmin || r.RoleName == Roles.SystemAdmin);

            if (!isPrivilegedAdmin)
            {
                var isFollowing = targetUser.FollowerFollowingUsers.Any(f => f.FollowerUserId == requestingUserId);

                bool IsMasked(string visibility) =>
                    visibility == "Private" || ((visibility == "Connections Only" || visibility == "ConnectionsOnly") && !isFollowing);

                if (IsMasked(targetUser.BioVisibility))
                {
                    dto.Bio = null;
                }

                if (IsMasked(targetUser.PhotosVisibility))
                {
                    dto.ProfilePhotoUrl = null;
                }

                if (IsMasked(targetUser.InterestsVisibility))
                {
                    dto.Interests.Clear();
                }
            }
        }

        return dto;
    }

    public async Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        if (dto.Bio != null) user.Bio = dto.Bio;
        if (dto.Location != null) user.Location = dto.Location;
        if (dto.MobileNo != null) user.MobileNo = dto.MobileNo;

        user.BioVisibility = dto.BioVisibility;
        user.NetworkVisibility = dto.NetworkVisibility;
        user.PhotosVisibility = dto.PhotosVisibility;
        user.InterestsVisibility = dto.InterestsVisibility;
        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        if (dto.Skills != null)
        {
            await _userRepo.UpdateUserSkillsAsync(userId, dto.Skills);
        }

        if (dto.Interests != null)
        {
            await _userRepo.UpdateUserInterestsAsync(userId, dto.Interests);
        }

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> UpdateBioAsync(int userId, UpdateBioDto dto)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        user.Bio = dto.Bio;
        user.BioVisibility = dto.BioVisibility;
        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> UpdateSkillsAsync(int userId, UpdateSkillsDto dto)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        await _userRepo.UpdateUserSkillsAsync(userId, dto.Skills);

        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;
        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> UpdateProfileImageAsync(int userId, IFormFile file)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        var newImageUrl = await _fileStorage.SaveProfileImageAsync(userId, file);

        if (!string.IsNullOrWhiteSpace(user.ProfilePhotoUrl))
        {
            await _fileStorage.DeleteProfileImageAsync(user.ProfilePhotoUrl);
        }

        user.ProfilePhotoUrl = newImageUrl;
        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<PagedResultDto<UserSummaryDto>> GetPagedUsersAsync(UserFilterDto filter)
    {
        var pagedUsers = await _userRepo.GetPagedUsersAsync(filter);
        var mappedItems = _mapper.Map<List<UserSummaryDto>>(pagedUsers.Items);

        return new PagedResultDto<UserSummaryDto>(
            mappedItems,
            pagedUsers.TotalCount,
            pagedUsers.PageNumber,
            pagedUsers.PageSize
        );
    }

    public async Task<UserProfileDto> ChangeDepartmentAsync(int userId, ChangeDepartmentDto dto)
    {
        var departmentExists = await _userRepo.DepartmentExistsAsync(dto.DepartmentId);
        if (!departmentExists)
            throw new BadRequestException($"Department with ID {dto.DepartmentId} does not exist.");

        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        user.DepartmentId = dto.DepartmentId;
        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> ChangeRolesAsync(int userId, ChangeRoleDto dto)
    {
        await _userRepo.UpdateUserRolesAsync(userId, dto.RoleNames);

        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;
        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        // Also update any pending RoleRequests for this employee and send notification email
        try
        {
            var rolesList = dto.RoleNames ?? new List<string>();
            var rolesDisplay = rolesList.Count > 0 ? string.Join(", ", rolesList) : "Employee";
            var primaryRole = rolesList.FirstOrDefault() ?? "Employee";
            var empId = user.EmployeeId;
            var userEmail = user.Email;
            var userName = user.FullName;
            var userDept = user.Department?.Name ?? "General";

            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE [RoleRequests]
                SET [Status] = 'Approved',
                    [AssignedRoleName] = @roleName,
                    [AssignedBy] = 'System Admin',
                    [AdminComment] = 'Assigned by System Administrator from Knome Admin Console',
                    [ProcessedAt] = GETUTCDATE()
                WHERE [EmployeeId] = @empId;

                IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'EmployeeHubDb')
                BEGIN
                    UPDATE [EmployeeHubDb].[dbo].[RoleRequests]
                    SET [Status] = 'Approved',
                        [AssignedRoleName] = @roleName,
                        [AssignedBy] = 'System Admin',
                        [AdminComment] = 'Assigned by System Administrator from Knome Admin Console',
                        [ProcessedAt] = GETUTCDATE()
                    WHERE [EmployeeId] = @empId;
                END
            ";
            var p1 = cmd.CreateParameter(); p1.ParameterName = "@roleName"; p1.Value = primaryRole; cmd.Parameters.Add(p1);
            var p2 = cmd.CreateParameter(); p2.ParameterName = "@empId"; p2.Value = empId; cmd.Parameters.Add(p2);
            await cmd.ExecuteNonQueryAsync();

            await _notificationService.PublishAsync(
                userId,
                NotificationTypes.HrAnnouncement,
                $"Your Knome roles have been updated to: {rolesDisplay}.",
                relatedContentType: NotificationContentTypes.User,
                relatedContentId: userId);

            if (!string.IsNullOrWhiteSpace(userEmail))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _emailService.SendRoleAssignedEmailAsync(
                            userEmail,
                            userName,
                            empId,
                            rolesDisplay,
                            userDept,
                            "Role updated by System Administrator from Knome Admin Console");
                        _logger.LogInformation("Successfully sent role update notification email to {Email} for roles: {Roles}", userEmail, rolesDisplay);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send role assigned email to {Email}", userEmail);
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync role assignment email in ChangeRolesAsync for {UserId}", userId);
        }

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> ActivateUserAsync(int actorUserId, int userId)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        user.IsActive = true;
        user.IsPermanentlySuspended = false;
        user.SuspendedUntil = null;
        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        await _auditLogService.RecordAsync(actorUserId, "ActivateUser", "User", userId, reason: "User reactivated.");

        await _notificationService.PublishAsync(
            userId,
            NotificationTypes.HrAnnouncement,
            "Your Knome account has been reactivated.",
            relatedContentType: NotificationContentTypes.User,
            relatedContentId: userId);

        return await GetUserProfileAsync(userId, userId);
    }

    public async Task<UserProfileDto> SuspendUserAsync(int actorUserId, int userId, SuspendUserDto dto)
    {
        var user = await _userRepo.GetProfileByIdAsync(userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        if (dto.IsPermanent)
        {
            user.IsPermanentlySuspended = true;
            user.SuspendedUntil = null;
            user.IsActive = false;
        }
        else if (dto.SuspendedUntil.HasValue)
        {
            user.IsPermanentlySuspended = false;
            user.SuspendedUntil = dto.SuspendedUntil.Value;
            user.IsActive = false;
        }

        user.ModifiedDate = Knome.API.Common.KnomeTime.Now;

        _userRepo.Update(user);
        await _userRepo.SaveChangesAsync();

        await _auditLogService.RecordAsync(actorUserId, "SuspendUser", "User", userId, reason: dto.Reason);

        var suspendMsg = dto.IsPermanent
            ? "Your Knome account has been permanently suspended."
            : $"Your Knome account has been suspended until {dto.SuspendedUntil:dd-MM-yyyy, hh:mm tt}.";

        await _notificationService.PublishAsync(
            userId,
            NotificationTypes.HrAnnouncement,
            suspendMsg,
            relatedContentType: NotificationContentTypes.User,
            relatedContentId: userId);

        return await GetUserProfileAsync(userId, userId);
    }

    // --- Follow / Unfollow (FR-PN-01, FR-NT-01) ---
    public async Task FollowUserAsync(int followerUserId, int followingUserId)
    {
        if (followerUserId == followingUserId)
            throw new BadRequestException("You cannot follow yourself.");

        var target = await _userRepo.GetProfileByIdAsync(followingUserId);
        if (target is null)
            throw new NotFoundException($"User with ID {followingUserId} not found.");

        var already = await _userRepo.IsFollowingAsync(followerUserId, followingUserId);
        if (already)
            return; // idempotent

        await _userRepo.AddFollowerAsync(followerUserId, followingUserId);

        // FR-NT-01: notify the followed user (producer -> generic engine)
        var followerName = (await _userRepo.GetProfileByIdAsync(followerUserId))?.FullName ?? "Someone";
        await _notificationService.PublishAsync(
            followingUserId,
            NotificationTypes.Follower,
            $"{followerName} started following you.",
            relatedContentType: NotificationContentTypes.User,
            relatedContentId: followerUserId);
    }

    public async Task UnfollowUserAsync(int followerUserId, int followingUserId)
    {
        await _userRepo.RemoveFollowerAsync(followerUserId, followingUserId);
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetNetworkSuggestionsAsync(int userId, int limit = 10)
    {
        var suggestions = await _userRepo.GetNetworkSuggestionsAsync(userId, limit);
        return await MapToNetworkUsersAsync(userId, suggestions, true);
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetFollowersAsync(int userId, int requestingUserId = 0)
    {
        var followers = await _userRepo.GetFollowersAsync(userId);
        var effectiveRequestingUserId = requestingUserId > 0 ? requestingUserId : userId;
        return await MapToNetworkUsersAsync(effectiveRequestingUserId, followers, false);
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetFollowingAsync(int userId, int requestingUserId = 0)
    {
        var following = await _userRepo.GetFollowingAsync(userId);
        var effectiveRequestingUserId = requestingUserId > 0 ? requestingUserId : userId;
        return await MapToNetworkUsersAsync(effectiveRequestingUserId, following, false);
    }

    private static string ResolvePrimaryRole(IEnumerable<Models.Role> roles)
    {
        var roleNames = roles.Select(r => r.RoleName).ToList();
        if (roleNames.Contains("System Administrator")) return "System Administrator";
        if (roleNames.Contains("HR Administrator")) return "HR Administrator";
        if (roleNames.Contains("Community Admin") || roleNames.Contains("Community Administrator")) return "Community Admin";
        return roleNames.FirstOrDefault(r => !string.IsNullOrWhiteSpace(r)) ?? "Employee";
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetPendingReceivedRequestsAsync(int currentUserId)
    {
        var requests = await _userRepo.GetPendingReceivedConnectionRequestsAsync(currentUserId);
        var result = new System.Collections.Generic.List<NetworkUserDto>();
        foreach (var req in requests)
        {
            var sender = req.Sender;
            var mutualCount = await _userRepo.GetMutualConnectionsCountAsync(currentUserId, sender.UserId);
            var mutuals = await _userRepo.GetMutualConnectionsAsync(currentUserId, sender.UserId);
            var avatars = mutuals.Where(m => !string.IsNullOrEmpty(m.ProfilePhotoUrl)).Select(m => m.ProfilePhotoUrl!).Take(3).ToList();
            var senderRoles = sender.Roles.Select(r => r.RoleName).ToList();

            result.Add(new NetworkUserDto
            {
                Id = sender.UserId,
                Name = sender.FullName,
                Role = ResolvePrimaryRole(sender.Roles),
                Roles = senderRoles,
                Designation = sender.Designation,
                Department = sender.Department?.Name ?? "General",
                Avatar = sender.ProfilePhotoUrl,
                MutualConnections = mutualCount,
                MutualConnectionAvatars = avatars,
                IsFollowing = false,
                IsSuggested = false,
                Reason = mutualCount > 0 ? $"{mutualCount} Mutual Connections" : "Sent you a connection request",
                ConnectionStatus = "PendingReceived",
                RequestId = req.RequestId
            });
        }
        return result;
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetPendingSentRequestsAsync(int currentUserId)
    {
        var requests = await _userRepo.GetPendingSentConnectionRequestsAsync(currentUserId);
        var result = new System.Collections.Generic.List<NetworkUserDto>();
        foreach (var req in requests)
        {
            var receiver = req.Receiver;
            var mutualCount = await _userRepo.GetMutualConnectionsCountAsync(currentUserId, receiver.UserId);
            var mutuals = await _userRepo.GetMutualConnectionsAsync(currentUserId, receiver.UserId);
            var avatars = mutuals.Where(m => !string.IsNullOrEmpty(m.ProfilePhotoUrl)).Select(m => m.ProfilePhotoUrl!).Take(3).ToList();
            var receiverRoles = receiver.Roles.Select(r => r.RoleName).ToList();

            result.Add(new NetworkUserDto
            {
                Id = receiver.UserId,
                Name = receiver.FullName,
                Role = ResolvePrimaryRole(receiver.Roles),
                Roles = receiverRoles,
                Designation = receiver.Designation,
                Department = receiver.Department?.Name ?? "General",
                Avatar = receiver.ProfilePhotoUrl,
                MutualConnections = mutualCount,
                MutualConnectionAvatars = avatars,
                IsFollowing = false,
                IsSuggested = false,
                Reason = mutualCount > 0 ? $"{mutualCount} Mutual Connections" : "Request pending",
                ConnectionStatus = "PendingSent",
                RequestId = req.RequestId
            });
        }
        return result;
    }

    public async Task<System.Collections.Generic.List<NetworkUserDto>> GetConnectionsAsync(int currentUserId, int targetUserId)
    {
        var connections = await _userRepo.GetConnectionsAsync(targetUserId);
        return await MapToNetworkUsersAsync(currentUserId, connections, false);
    }

    private async Task<System.Collections.Generic.List<NetworkUserDto>> MapToNetworkUsersAsync(int currentUserId, System.Collections.Generic.List<Models.User> users, bool isSuggested)
    {
        var result = new System.Collections.Generic.List<NetworkUserDto>();
        foreach (var user in users)
        {
            var userRoles = user.Roles.Select(r => r.RoleName).ToList();
            var primaryRole = ResolvePrimaryRole(user.Roles);

            if (user.UserId == currentUserId)
            {
                result.Add(new NetworkUserDto
                {
                    Id = user.UserId,
                    Name = user.FullName,
                    Role = primaryRole,
                    Roles = userRoles,
                    Designation = user.Designation,
                    Department = user.Department?.Name ?? "General",
                    Avatar = user.ProfilePhotoUrl,
                    ConnectionStatus = "Self"
                });
                continue;
            }

            var mutuals = await _userRepo.GetMutualConnectionsAsync(currentUserId, user.UserId);
            var mutualCount = mutuals.Count;
            var avatars = mutuals.Where(m => !string.IsNullOrEmpty(m.ProfilePhotoUrl)).Select(m => m.ProfilePhotoUrl!).Take(3).ToList();

            var commonCommunities = await _db.CommunityMembers
                .Where(c => c.UserId == currentUserId || c.UserId == user.UserId)
                .GroupBy(c => c.CommunityId)
                .CountAsync(g => g.Count() > 1);

            var isFollowing = await _userRepo.IsFollowingAsync(currentUserId, user.UserId);

            var connectionStatus = "NotConnected";
            int? requestId = null;

            if (isFollowing)
            {
                connectionStatus = "Connected";
            }

            var connectionRequest = await _userRepo.GetConnectionRequestAsync(currentUserId, user.UserId);
            var reverseRequest = await _userRepo.GetConnectionRequestAsync(user.UserId, currentUserId);

            if (connectionRequest != null && connectionRequest.Status == "Pending")
            {
                connectionStatus = "PendingSent";
                requestId = connectionRequest.RequestId;
            }
            else if (reverseRequest != null && reverseRequest.Status == "Pending")
            {
                connectionStatus = "PendingReceived";
                requestId = reverseRequest.RequestId;
            }

            var reason = mutualCount > 0 ? $"{mutualCount} Mutual Connections" : 
                         (commonCommunities > 0 ? $"{commonCommunities} Common Communities" : (isSuggested ? "Suggested for you" : ""));

            result.Add(new NetworkUserDto
            {
                Id = user.UserId,
                Name = user.FullName,
                Role = primaryRole,
                Roles = userRoles,
                Designation = user.Designation,
                Department = user.Department?.Name ?? "General",
                Avatar = user.ProfilePhotoUrl,
                MutualConnections = mutualCount,
                MutualConnectionAvatars = avatars,
                CommonCommunities = commonCommunities,
                IsFollowing = isFollowing,
                IsSuggested = isSuggested,
                Reason = reason,
                ConnectionStatus = connectionStatus,
                RequestId = requestId
            });
        }
        return result;
    }

    public async Task SendConnectionRequestAsync(int senderId, int receiverId)
    {
        if (senderId == receiverId) throw new BadRequestException("Cannot connect with yourself.");

        var existingDirect = await _userRepo.GetConnectionRequestAsync(senderId, receiverId);
        var existingReverse = await _userRepo.GetConnectionRequestAsync(receiverId, senderId);

        if (existingDirect != null)
        {
            if (existingDirect.Status == "Pending") throw new BadRequestException("Connection request already pending.");
            if (existingDirect.Status == "Connected" || existingDirect.Status == "Accepted") throw new BadRequestException("Already connected.");
        }

        // Cross-request auto-merging: If receiver already sent a request to sender, accept it automatically!
        if (existingReverse != null && existingReverse.Status == "Pending")
        {
            existingReverse.Status = "Connected";
            await _userRepo.UpdateConnectionRequestAsync(existingReverse);
            await _userRepo.AddBidirectionalFollowAsync(senderId, receiverId);

            var senderProfile = await _userRepo.GetProfileByIdAsync(senderId);
            var receiverProfile = await _userRepo.GetProfileByIdAsync(receiverId);

            await _notificationService.PublishAsync(
                recipientUserId: receiverId,
                eventType: NotificationTypes.ConnectionRequest,
                message: $"{senderProfile?.FullName ?? "Someone"} accepted your connection request.",
                relatedContentType: NotificationContentTypes.User,
                relatedContentId: senderId
            );

            await _notificationService.PublishAsync(
                recipientUserId: senderId,
                eventType: NotificationTypes.ConnectionRequest,
                message: $"You are now connected with {receiverProfile?.FullName ?? "Someone"}.",
                relatedContentType: NotificationContentTypes.User,
                relatedContentId: receiverId
            );

            return;
        }

        var isFollowing = await _userRepo.IsFollowingAsync(senderId, receiverId);
        if (isFollowing) throw new BadRequestException("Already connected.");

        var request = new ConnectionRequest
        {
            SenderId = senderId,
            ReceiverId = receiverId,
            Status = "Pending"
        };
        await _userRepo.AddConnectionRequestAsync(request);

        var sender = await _userRepo.GetProfileByIdAsync(senderId);
        var senderName = sender?.FullName ?? "Someone";

        // Notify Receiver
        await _notificationService.PublishAsync(
            recipientUserId: receiverId,
            eventType: NotificationTypes.ConnectionRequest,
            message: $"{senderName} sent you a connection request.",
            relatedContentType: NotificationContentTypes.User,
            relatedContentId: senderId
        );
    }

    public async Task AcceptConnectionRequestAsync(int userId, int requestId)
    {
        var request = await _db.ConnectionRequests.FirstOrDefaultAsync(cr => cr.RequestId == requestId);
        if (request == null)
        {
            // Fallback: try lookup where requestId is senderId and receiver is current userId
            request = await _userRepo.GetConnectionRequestAsync(requestId, userId);
        }

        if (request == null)
        {
            // Check if they are already connected or following each other
            var isAlreadyConnected = await _userRepo.IsFollowingAsync(userId, requestId);
            if (isAlreadyConnected)
            {
                return; // Idempotent success
            }
            throw new NotFoundException("Connection request not found.");
        }

        if (request.ReceiverId != userId)
        {
            throw new ForbiddenException("You are not authorized to accept this connection request.");
        }

        if (request.Status.Equals("Connected", StringComparison.OrdinalIgnoreCase) || request.Status.Equals("ACCEPTED", StringComparison.OrdinalIgnoreCase))
        {
            return; // Idempotent success: already connected
        }

        request.Status = "Connected";
        await _userRepo.UpdateConnectionRequestAsync(request);

        // Create bi-directional follow relationship
        await _userRepo.AddBidirectionalFollowAsync(request.SenderId, request.ReceiverId);

        var acceptor = await _userRepo.GetProfileByIdAsync(userId);
        var acceptorName = acceptor?.FullName ?? "Someone";

        // Notify Sender
        await _notificationService.PublishAsync(
            recipientUserId: request.SenderId,
            eventType: NotificationTypes.ConnectionRequest,
            message: $"{acceptorName} accepted your connection request.",
            relatedContentType: NotificationContentTypes.User,
            relatedContentId: userId
        );

        // Dismiss the notification for the receiver
        var pendingNotifications = await _db.Notifications
            .Where(n => n.UserId == userId && n.EventType == NotificationTypes.ConnectionRequest && n.RelatedContentType == NotificationContentTypes.User && n.RelatedContentId == request.SenderId)
            .ToListAsync();
        foreach (var pendingNotification in pendingNotifications)
        {
            pendingNotification.IsRead = true;
        }
        if (pendingNotifications.Any())
        {
            await _db.SaveChangesAsync();
        }
    }

    public async Task RejectConnectionRequestAsync(int userId, int requestId)
    {
        var request = await _db.ConnectionRequests.FirstOrDefaultAsync(cr => cr.RequestId == requestId);
        if (request == null)
        {
            request = await _userRepo.GetConnectionRequestAsync(requestId, userId);
        }

        if (request == null)
        {
            return; // Idempotent success: request already removed or processed
        }

        if (request.ReceiverId != userId)
        {
            throw new ForbiddenException("You are not authorized to reject this connection request.");
        }

        await _userRepo.RemoveConnectionRequestAsync(request);

        // Dismiss the notification for the receiver
        var pendingNotifications = await _db.Notifications
            .Where(n => n.UserId == userId && n.EventType == NotificationTypes.ConnectionRequest && n.RelatedContentType == NotificationContentTypes.User && n.RelatedContentId == request.SenderId)
            .ToListAsync();
        foreach (var pendingNotification in pendingNotifications)
        {
            pendingNotification.IsRead = true;
        }
        if (pendingNotifications.Any())
        {
            await _db.SaveChangesAsync();
        }
    }

    public async Task CancelConnectionRequestAsync(int currentUserId, int targetUserId)
    {
        var request = await _userRepo.GetConnectionRequestAsync(currentUserId, targetUserId);
        if (request != null)
        {
            await _userRepo.RemoveConnectionRequestAsync(request);
        }
    }

    public async Task RemoveConnectionAsync(int currentUserId, int targetUserId)
    {
        var direct = await _userRepo.GetConnectionRequestAsync(currentUserId, targetUserId);
        if (direct != null) await _userRepo.RemoveConnectionRequestAsync(direct);

        var reverse = await _userRepo.GetConnectionRequestAsync(targetUserId, currentUserId);
        if (reverse != null) await _userRepo.RemoveConnectionRequestAsync(reverse);

        await _userRepo.RemoveBidirectionalFollowAsync(currentUserId, targetUserId);
    }

    public async Task<List<KnomeRoleRequestDto>> GetRoleRequestsAsync(string? status = null)
    {
        var result = new List<KnomeRoleRequestDto>();
        using var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            WITH RankedRequests AS (
                SELECT 
                    r.[RequestId], r.[EmployeeId], r.[FullName], r.[Email], 
                    r.[DepartmentId], r.[DepartmentName], r.[Designation], 
                    r.[RequestedRoleCode], 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM [Users] u 
                            JOIN [UserRoles] ur ON u.[UserId] = ur.[UserId] 
                            WHERE u.[EmployeeId] = r.[EmployeeId]
                        ) THEN 'Approved'
                        ELSE r.[Status] 
                    END AS [Status],
                    r.[AssignedRoleId], 
                    r.[AssignedRoleName], r.[AssignedBy], r.[AdminComment], 
                    r.[CreatedAt], r.[ProcessedAt],
                    ROW_NUMBER() OVER (PARTITION BY r.[EmployeeId] ORDER BY r.[RequestId] DESC) as rn
                FROM [RoleRequests] r
            )
            SELECT * FROM RankedRequests WHERE rn = 1
            ORDER BY [CreatedAt] DESC";

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var reqStatus = reader["Status"]?.ToString() ?? "Pending";
            if (!string.IsNullOrWhiteSpace(status) && !reqStatus.Equals(status.Trim(), StringComparison.OrdinalIgnoreCase))
                continue;

            result.Add(new KnomeRoleRequestDto
            {
                RequestId = Convert.ToInt32(reader["RequestId"]),
                EmployeeId = reader["EmployeeId"]?.ToString() ?? string.Empty,
                FullName = reader["FullName"]?.ToString() ?? string.Empty,
                Email = reader["Email"]?.ToString() ?? string.Empty,
                DepartmentId = Convert.ToInt32(reader["DepartmentId"]),
                DepartmentName = reader["DepartmentName"]?.ToString() ?? "Development",
                Designation = reader["Designation"]?.ToString() ?? "TL",
                RequestedRoleCode = reader["RequestedRoleCode"]?.ToString() ?? "EMP",
                Status = reqStatus,
                AssignedRoleName = reader["AssignedRoleName"] != DBNull.Value ? reader["AssignedRoleName"].ToString() : null,
                AssignedBy = reader["AssignedBy"] != DBNull.Value ? reader["AssignedBy"].ToString() : null,
                AdminComment = reader["AdminComment"] != DBNull.Value ? reader["AdminComment"].ToString() : null,
                CreatedAt = Convert.ToDateTime(reader["CreatedAt"]),
                ProcessedAt = reader["ProcessedAt"] != DBNull.Value ? Convert.ToDateTime(reader["ProcessedAt"]) : null
            });
        }

        return result;
    }

    public async Task<bool> ApproveRoleRequestAsync(int actorUserId, int requestId, ApproveKnomeRoleRequestDto dto)
    {
        var roleName = string.IsNullOrWhiteSpace(dto.RoleName) ? "Employee" : dto.RoleName.Trim();
        var roleCode = roleName switch
        {
            "System Administrator" => "SYSADM",
            "System Admin" => "SYSADM",
            "HR Administrator" => "HRADM",
            "HR Admin" => "HRADM",
            "Community Admin" or "Community Administrator" => "CADM",
            _ => "EMP"
        };

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        // 1. Fetch EmployeeId from RequestId
        string empId = string.Empty;
        using (var fetchCmd = conn.CreateCommand())
        {
            fetchCmd.CommandText = "SELECT EmployeeId FROM [RoleRequests] WHERE RequestId = @reqId";
            var p = fetchCmd.CreateParameter();
            p.ParameterName = "@reqId";
            p.Value = requestId;
            fetchCmd.Parameters.Add(p);
            var val = await fetchCmd.ExecuteScalarAsync();
            if (val != null) empId = val.ToString()!;
        }

        if (string.IsNullOrEmpty(empId))
            throw new NotFoundException($"Role request #{requestId} not found.");

        // 2. Update RoleRequests table in Knome & EmployeeHubDb
        using (var updateCmd = conn.CreateCommand())
        {
            updateCmd.CommandText = @"
                UPDATE [RoleRequests]
                SET [Status] = 'Approved',
                    [AssignedRoleName] = @roleName,
                    [AssignedBy] = 'System Admin',
                    [AdminComment] = @comment,
                    [ProcessedAt] = GETUTCDATE()
                WHERE [EmployeeId] = @empId;

                DECLARE @knomeUserId INT = (SELECT TOP 1 [UserId] FROM [Users] WHERE [EmployeeId] = @empId);
                DECLARE @knomeRoleId INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = @roleName OR [RoleCode] = @roleCode);
                DECLARE @knomeEmpRoleId INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = 'Employee' OR [RoleCode] = 'EMP');

                IF @knomeUserId IS NOT NULL AND @knomeRoleId IS NOT NULL
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM [UserRoles] WHERE [UserId] = @knomeUserId AND [RoleId] = @knomeRoleId)
                        INSERT INTO [UserRoles] ([UserId], [RoleId]) VALUES (@knomeUserId, @knomeRoleId);
                    IF NOT EXISTS (SELECT 1 FROM [UserRoles] WHERE [UserId] = @knomeUserId AND [RoleId] = @knomeEmpRoleId)
                        INSERT INTO [UserRoles] ([UserId], [RoleId]) VALUES (@knomeUserId, @knomeEmpRoleId);
                END

                IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'EmployeeHubDb')
                BEGIN
                    UPDATE [EmployeeHubDb].[dbo].[RoleRequests]
                    SET [Status] = 'Approved',
                        [AssignedRoleName] = @roleName,
                        [AssignedBy] = 'System Admin',
                        [AdminComment] = @comment,
                        [ProcessedAt] = GETUTCDATE()
                    WHERE [EmployeeId] = @empId;

                    DECLARE @ehRoleId INT = (SELECT TOP 1 [RoleId] FROM [EmployeeHubDb].[dbo].[Roles] WHERE [RoleCode] = @roleCode OR [RoleName] = @roleName);
                    IF @ehRoleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [EmployeeHubDb].[dbo].[EmployeeRoles] WHERE [EmployeeId] = @empId AND [RoleId] = @ehRoleId)
                    BEGIN
                        INSERT INTO [EmployeeHubDb].[dbo].[EmployeeRoles] ([EmployeeId], [RoleId], [AssignedBy])
                        VALUES (@empId, @ehRoleId, 'SYSADM');
                    END
                END
            ";

            var p1 = updateCmd.CreateParameter(); p1.ParameterName = "@reqId"; p1.Value = requestId; updateCmd.Parameters.Add(p1);
            var p2 = updateCmd.CreateParameter(); p2.ParameterName = "@roleName"; p2.Value = roleName; updateCmd.Parameters.Add(p2);
            var p3 = updateCmd.CreateParameter(); p3.ParameterName = "@roleCode"; p3.Value = roleCode; updateCmd.Parameters.Add(p3);
            var p4 = updateCmd.CreateParameter(); p4.ParameterName = "@empId"; p4.Value = empId; updateCmd.Parameters.Add(p4);
            var p5 = updateCmd.CreateParameter(); p5.ParameterName = "@comment"; p5.Value = (object?)dto.Comment ?? "Approved by System Administrator from Knome Admin Console"; updateCmd.Parameters.Add(p5);

            await updateCmd.ExecuteNonQueryAsync();
        }

        // 3. Assign role to Knome User
        var knomeUser = await _db.Users.Include(u => u.Department).Include(u => u.Roles).FirstOrDefaultAsync(u => u.EmployeeId == empId);
        if (knomeUser != null)
        {
            var role = await _db.Roles.FirstOrDefaultAsync(r => r.RoleName == roleName || r.RoleCode == roleCode);
            if (role != null && !knomeUser.Roles.Any(r => r.RoleId == role.RoleId))
            {
                knomeUser.Roles.Add(role);
                await _db.SaveChangesAsync();
            }
            await _auditLogService.RecordAsync(actorUserId, "ApproveRoleRequest", "User", knomeUser.UserId, reason: $"Assigned role '{roleName}' to {empId}");

            await _notificationService.PublishAsync(
                knomeUser.UserId,
                NotificationTypes.HrAnnouncement,
                $"Your role request has been approved! Assigned role: '{roleName}'.",
                relatedContentType: NotificationContentTypes.User,
                relatedContentId: knomeUser.UserId);
        }

        // 4. Send Professional Confirmation Email
        string? userEmail = knomeUser?.Email;
        string? userName = knomeUser?.FullName;
        string? userDept = knomeUser?.Department?.Name;

        if (string.IsNullOrWhiteSpace(userEmail))
        {
            using var fetchEmailCmd = conn.CreateCommand();
            fetchEmailCmd.CommandText = "SELECT TOP 1 Email, FullName, DepartmentName FROM [RoleRequests] WHERE EmployeeId = @empId";
            var pEmpFetch = fetchEmailCmd.CreateParameter();
            pEmpFetch.ParameterName = "@empId";
            pEmpFetch.Value = empId;
            fetchEmailCmd.Parameters.Add(pEmpFetch);
            using var rdr = await fetchEmailCmd.ExecuteReaderAsync();
            if (await rdr.ReadAsync())
            {
                userEmail = rdr["Email"]?.ToString();
                userName = rdr["FullName"]?.ToString();
                userDept = rdr["DepartmentName"]?.ToString();
            }
        }

        if (!string.IsNullOrWhiteSpace(userEmail))
        {
            var finalEmail = userEmail;
            var finalName = userName ?? empId;
            var finalDept = userDept ?? "General";
            var finalComment = dto.Comment;

            _ = Task.Run(async () =>
            {
                try
                {
                    await _emailService.SendRoleAssignedEmailAsync(
                        finalEmail,
                        finalName,
                        empId,
                        roleName,
                        finalDept,
                        finalComment);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send role assigned email to {Email}", finalEmail);
                }
            });
        }

        return true;
    }

    public async Task<bool> RejectRoleRequestAsync(int actorUserId, int requestId, RejectKnomeRoleRequestDto dto)
    {
        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE [RoleRequests]
            SET [Status] = 'Rejected',
                [AssignedBy] = 'System Admin',
                [AdminComment] = @reason,
                [ProcessedAt] = GETUTCDATE()
            WHERE [RequestId] = @reqId;

            IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'EmployeeHubDb')
            BEGIN
                UPDATE [EmployeeHubDb].[dbo].[RoleRequests]
                SET [Status] = 'Rejected',
                    [AssignedBy] = 'System Admin',
                    [AdminComment] = @reason,
                    [ProcessedAt] = GETUTCDATE()
                WHERE [RequestId] = @reqId;
            END
        ";
        var p1 = cmd.CreateParameter(); p1.ParameterName = "@reqId"; p1.Value = requestId; cmd.Parameters.Add(p1);
        var p2 = cmd.CreateParameter(); p2.ParameterName = "@reason"; p2.Value = (object?)dto.Reason ?? "Rejected by System Administrator"; cmd.Parameters.Add(p2);

        await cmd.ExecuteNonQueryAsync();
        await _auditLogService.RecordAsync(actorUserId, "RejectRoleRequest", "RoleRequest", requestId, reason: dto.Reason ?? "Role request rejected.");

        try
        {
            using var fetchCmd = conn.CreateCommand();
            fetchCmd.CommandText = "SELECT EmployeeId FROM [RoleRequests] WHERE RequestId = @reqId";
            var pFetch = fetchCmd.CreateParameter();
            pFetch.ParameterName = "@reqId";
            pFetch.Value = requestId;
            fetchCmd.Parameters.Add(pFetch);
            var empIdObj = await fetchCmd.ExecuteScalarAsync();
            if (empIdObj != null && empIdObj != DBNull.Value)
            {
                var empId = empIdObj.ToString();
                var knomeUser = await _db.Users.FirstOrDefaultAsync(u => u.EmployeeId == empId);
                if (knomeUser != null)
                {
                    await _notificationService.PublishAsync(
                        knomeUser.UserId,
                        NotificationTypes.HrAnnouncement,
                        $"Your role request was reviewed and declined. Reason: {dto.Reason ?? "Not specified"}",
                        relatedContentType: NotificationContentTypes.User,
                        relatedContentId: knomeUser.UserId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send role rejection notification for RequestId {RequestId}", requestId);
        }

        return true;
    }

    public async Task<bool> RegisterPendingRoleRequestAsync(string employeeId)
    {
        if (string.IsNullOrWhiteSpace(employeeId)) return false;
        var cleanId = employeeId.Trim().ToUpper();

        var user = await _db.Users.Include(u => u.Department).Include(u => u.Roles).FirstOrDefaultAsync(u => u.EmployeeId == cleanId);
        if (user == null || user.Roles.Any())
        {
            return false;
        }

        var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        using var checkCmd = conn.CreateCommand();
        checkCmd.CommandText = "SELECT COUNT(1) FROM [RoleRequests] WHERE EmployeeId = @empId";
        var p = checkCmd.CreateParameter();
        p.ParameterName = "@empId";
        p.Value = cleanId;
        checkCmd.Parameters.Add(p);

        var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
        if (count == 0)
        {
            using var insCmd = conn.CreateCommand();
            insCmd.CommandText = @"
                INSERT INTO [RoleRequests] ([EmployeeId], [FullName], [Email], [DepartmentId], [DepartmentName], [Designation], [RequestedRoleCode], [Status], [CreatedAt])
                VALUES (@empId, @fullName, @email, @deptId, @deptName, @desig, 'EMP', 'Pending', GETUTCDATE());
            ";
            var p1 = insCmd.CreateParameter(); p1.ParameterName = "@empId"; p1.Value = user.EmployeeId; insCmd.Parameters.Add(p1);
            var p2 = insCmd.CreateParameter(); p2.ParameterName = "@fullName"; p2.Value = user.FullName; insCmd.Parameters.Add(p2);
            var p3 = insCmd.CreateParameter(); p3.ParameterName = "@email"; p3.Value = user.Email; insCmd.Parameters.Add(p3);
            var p4 = insCmd.CreateParameter(); p4.ParameterName = "@deptId"; p4.Value = (object?)user.DepartmentId ?? 1; insCmd.Parameters.Add(p4);
            var p5 = insCmd.CreateParameter(); p5.ParameterName = "@deptName"; p5.Value = (object?)user.Department?.Name ?? "Development"; insCmd.Parameters.Add(p5);
            var p6 = insCmd.CreateParameter(); p6.ParameterName = "@desig"; p6.Value = (object?)user.Designation ?? "Staff"; insCmd.Parameters.Add(p6);

            await insCmd.ExecuteNonQueryAsync();

            // Send Role Pending Email
            if (!string.IsNullOrWhiteSpace(user.Email))
            {
                var userEmail = user.Email;
                var userName = user.FullName;
                var userEmpId = user.EmployeeId;
                var userDept = user.Department?.Name ?? "General";
                var userDesig = user.Designation ?? "Staff";

                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _emailService.SendRolePendingEmailAsync(
                            userEmail,
                            userName,
                            userEmpId,
                            userDept,
                            userDesig);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send role pending email to {Email}", userEmail);
                    }
                });
            }
        }

        return true;
    }

    public async Task<RoleRequestStatusDto> GetRoleRequestStatusAsync(string employeeId)
    {
        var cleanId = (employeeId ?? "").Trim().ToUpper();
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.EmployeeId == cleanId);
        if (user == null)
        {
            return new RoleRequestStatusDto
            {
                EmployeeId = cleanId,
                FullName = cleanId,
                RoleStatus = "Pending",
                HasApprovedRole = false,
                Roles = new List<string>()
            };
        }

        var roles = user.Roles.Select(r => r.RoleName).ToList();
        var hasApprovedRole = roles.Count > 0;

        using var conn = _db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync();

        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT TOP 1 [Status], [AssignedRoleName] FROM [RoleRequests] WHERE [EmployeeId] = @empId ORDER BY [RequestId] DESC";
        var p = cmd.CreateParameter();
        p.ParameterName = "@empId";
        p.Value = cleanId;
        cmd.Parameters.Add(p);

        string status = hasApprovedRole ? "Approved" : "Pending";
        string? assignedRole = null;

        using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                status = reader["Status"]?.ToString() ?? status;
                assignedRole = reader["AssignedRoleName"]?.ToString();
            }
        }

        if (hasApprovedRole && string.IsNullOrEmpty(assignedRole))
        {
            assignedRole = roles[0];
            status = "Approved";
        }

        var resultRoles = roles.Count > 0 
            ? roles 
            : (status == "Approved" && !string.IsNullOrEmpty(assignedRole) ? new List<string> { assignedRole, "Employee" } : new List<string>());

        return new RoleRequestStatusDto
        {
            EmployeeId = cleanId,
            FullName = user.FullName,
            RoleStatus = status,
            HasApprovedRole = status == "Approved" || hasApprovedRole,
            AssignedRoleName = assignedRole,
            Roles = resultRoles
        };
    }

    /// <summary>
    /// Permanently deletes a user and cascades all associated dependent records across all platform tables.
    /// </summary>
    public async Task<bool> DeleteUserAsync(int userId)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null)
        {
            throw new NotFoundException($"User with ID {userId} not found.");
        }

        var userEmail = user.Email;
        var userEmpId = user.EmployeeId;

        using var transaction = await _db.Database.BeginTransactionAsync();
        try
        {
            // 1. Break self-referencing manager relationships
            if (!string.IsNullOrEmpty(userEmpId))
            {
                await _db.Database.ExecuteSqlRawAsync(
                    "UPDATE [Users] SET [ManagerEmployeeId] = NULL WHERE [ManagerEmployeeId] = {0}", userEmpId);
            }
            await _db.Database.ExecuteSqlRawAsync(
                "UPDATE [Users] SET [ManagerEmployeeId] = NULL WHERE [UserId] = {0}", userId);

            // 2. Comments: child replies first, then top-level comments
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [Comments]
                WHERE [ParentCommentId] IS NOT NULL
                  AND (
                      [UserId] = {0}
                      OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                      OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}))
                      OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0}))
                      OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT [PodcastId] FROM [Podcasts] WHERE [UploaderUserId] = {0}))
                  );
                DELETE FROM [Comments]
                WHERE [UserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0}))
                   OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT [PodcastId] FROM [Podcasts] WHERE [UploaderUserId] = {0}));
            ", userId);

            // 3. Interactions: Reactions, Bookmarks, Shares, ContentViews, HotPostsScoreCache
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [Reactions]
                WHERE [UserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0}))
                   OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT [PodcastId] FROM [Podcasts] WHERE [UploaderUserId] = {0}));

                DELETE FROM [Bookmarks]
                WHERE [UserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0}))
                   OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT [PodcastId] FROM [Podcasts] WHERE [UploaderUserId] = {0}));

                DELETE FROM [Shares]
                WHERE [UserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}));

                DELETE FROM [ContentViews]
                WHERE [UserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}));

                DELETE FROM [HotPostsScoreCache]
                WHERE ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}));
            ", userId);

            // 4. Governance & Activity: ModerationReports, Notifications, Preferences, Followers, Connections
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [ModerationReports]
                WHERE [ReporterUserId] = {0}
                   OR [ModeratorUserId] = {0}
                   OR ([ContentType] = 'Post' AND [ContentId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Article' AND [ContentId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}))
                   OR ([ContentType] = 'Video' AND [ContentId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0}))
                   OR ([ContentType] = 'Podcast' AND [ContentId] IN (SELECT [PodcastId] FROM [Podcasts] WHERE [UploaderUserId] = {0}));

                DELETE FROM [Notifications] WHERE [UserId] = {0};
                DELETE FROM [NotificationPreferences] WHERE [UserId] = {0};
                DELETE FROM [Followers] WHERE [FollowerUserId] = {0} OR [FollowingUserId] = {0};
                DELETE FROM [ConnectionRequests] WHERE [SenderId] = {0} OR [ReceiverId] = {0};
                DELETE FROM [KarmaTransactions] WHERE [UserId] = {0};
                DELETE FROM [KarmaBalances] WHERE [UserId] = {0};
                DELETE FROM [SearchHistory] WHERE [UserId] = {0};
                DELETE FROM [AuditLog] WHERE [ActorUserId] = {0};
            ", userId);

            // 5. Role Requests
            if (!string.IsNullOrEmpty(userEmail))
            {
                await _db.Database.ExecuteSqlRawAsync("DELETE FROM [RoleRequests] WHERE [Email] = {0}", userEmail);
            }

            // 6. User Profile Skills, Interests, Credentials, Roles
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [UserSkills] WHERE [UserId] = {0};
                DELETE FROM [UserInterests] WHERE [UserId] = {0};
                DELETE FROM [UserCredentials] WHERE [UserId] = {0};
                DELETE FROM [UserRoles] WHERE [UserId] = {0};
            ", userId);

            // 7. Posts and dependencies
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [PostAttachments] WHERE [PostId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0});
                DELETE FROM [PostAudienceCommunities] WHERE [PostId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0});
                DELETE FROM [PostAudienceUsers] WHERE [PostId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}) OR [UserId] = {0};
                DELETE FROM [PostMentions] WHERE [PostId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0}) OR [MentionedUserId] = {0};
                DELETE FROM [CommunityPosts] WHERE [PostId] IN (SELECT [PostId] FROM [Posts] WHERE [AuthorUserId] = {0});
                DELETE FROM [Posts] WHERE [AuthorUserId] = {0};
            ", userId);

            // 8. Articles and dependencies
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [ArticleAttachments] WHERE [ArticleId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0});
                DELETE FROM [ArticleTags] WHERE [ArticleId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0});
                DELETE FROM [ArticleVersions] WHERE [ArticleId] IN (SELECT [ArticleId] FROM [Articles] WHERE [AuthorUserId] = {0}) OR [EditedByUserId] = {0};
                DELETE FROM [Articles] WHERE [AuthorUserId] = {0};
            ", userId);

            // 9. Media: Videos & Podcasts
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [VideoTags] WHERE [VideoId] IN (SELECT [VideoId] FROM [Videos] WHERE [UploaderUserId] = {0});
                DELETE FROM [Videos] WHERE [UploaderUserId] = {0};
                DELETE FROM [Podcasts] WHERE [UploaderUserId] = {0};
            ", userId);

            // 10. Communities, Members, Admins, Jobs, Abbreviations
            await _db.Database.ExecuteSqlRawAsync(@"
                DELETE FROM [CommunityMembers] WHERE [UserId] = {0};
                UPDATE [CommunityMembers] SET [ApprovedByUserId] = NULL WHERE [ApprovedByUserId] = {0};
                DELETE FROM [CommunityAdmins] WHERE [UserId] = {0};
                DELETE FROM [CommunityPosts] WHERE [CommunityId] IN (SELECT [CommunityId] FROM [Communities] WHERE [CreatedByUserId] = {0});
                DELETE FROM [CommunityMembers] WHERE [CommunityId] IN (SELECT [CommunityId] FROM [Communities] WHERE [CreatedByUserId] = {0});
                DELETE FROM [CommunityAdmins] WHERE [CommunityId] IN (SELECT [CommunityId] FROM [Communities] WHERE [CreatedByUserId] = {0});
                DELETE FROM [PostAudienceCommunities] WHERE [CommunityId] IN (SELECT [CommunityId] FROM [Communities] WHERE [CreatedByUserId] = {0});
                DELETE FROM [Communities] WHERE [CreatedByUserId] = {0};
                DELETE FROM [Jobs] WHERE [PostedByUserId] = {0};
                UPDATE [Abbreviations] SET [CreatedBy] = NULL WHERE [CreatedBy] = {0};
            ", userId);

            // 11. Final root record deletion: Users table
            await _db.Database.ExecuteSqlRawAsync("DELETE FROM [Users] WHERE [UserId] = {0}", userId);

            await transaction.CommitAsync();
            _logger.LogInformation("Successfully deleted user {UserId} ({Email}) and all associated records.", userId, userEmail);
            return true;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Failed to completely delete user {UserId}", userId);
            throw;
        }
    }
}
