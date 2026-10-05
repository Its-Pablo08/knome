using System.Threading.Tasks;
using Knome.API.DTOs.User;
using Microsoft.AspNetCore.Http;

namespace Knome.API.Interfaces;

public interface IUserService
{
    // Employee Self-Service Operations
    Task<UserProfileDto> GetUserProfileAsync(int targetUserId, int requestingUserId);
    Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto);
    Task<UserProfileDto> UpdateBioAsync(int userId, UpdateBioDto dto);
    Task<UserProfileDto> UpdateSkillsAsync(int userId, UpdateSkillsDto dto);
    Task<UserProfileDto> UpdateProfileImageAsync(int userId, IFormFile file);

    // HR / System Administrator Operations
    Task<PagedResultDto<UserSummaryDto>> GetPagedUsersAsync(UserFilterDto filter);
    Task<UserProfileDto> ChangeDepartmentAsync(int userId, ChangeDepartmentDto dto);
    Task<UserProfileDto> ChangeRolesAsync(int userId, ChangeRoleDto dto);
    Task<UserProfileDto> ActivateUserAsync(int actorUserId, int userId);
    Task<UserProfileDto> SuspendUserAsync(int actorUserId, int userId, SuspendUserDto dto);

    // Follow / Unfollow (FR-PN-01, FR-NT-01)
    Task FollowUserAsync(int followerUserId, int followingUserId);
    Task UnfollowUserAsync(int followerUserId, int followingUserId);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetNetworkSuggestionsAsync(int userId, int limit = 10);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetFollowingAsync(int userId, int requestingUserId = 0);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetFollowersAsync(int userId, int requestingUserId = 0);

    // Connection Requests (FR-NT-01 Modified)
    Task SendConnectionRequestAsync(int senderId, int receiverId);
    Task AcceptConnectionRequestAsync(int userId, int requestId);
    Task RejectConnectionRequestAsync(int userId, int requestId);
    Task CancelConnectionRequestAsync(int currentUserId, int targetUserId);
    Task RemoveConnectionAsync(int currentUserId, int targetUserId);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetPendingReceivedRequestsAsync(int currentUserId);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetPendingSentRequestsAsync(int currentUserId);
    Task<System.Collections.Generic.List<NetworkUserDto>> GetConnectionsAsync(int currentUserId, int targetUserId);

    // Role Requests
    Task<System.Collections.Generic.List<KnomeRoleRequestDto>> GetRoleRequestsAsync(string? status = null);
    Task<bool> ApproveRoleRequestAsync(int actorUserId, int requestId, ApproveKnomeRoleRequestDto dto);
    Task<bool> RejectRoleRequestAsync(int actorUserId, int requestId, RejectKnomeRoleRequestDto dto);
    Task<bool> RegisterPendingRoleRequestAsync(string employeeId);
    Task<RoleRequestStatusDto> GetRoleRequestStatusAsync(string employeeId);

    // User Deletion & Associated Data Cascade
    Task<bool> DeleteUserAsync(int userId);
}
