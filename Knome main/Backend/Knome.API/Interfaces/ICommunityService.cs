using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Communities;

namespace Knome.API.Interfaces;

public interface ICommunityService
{
    // Discovery & Details
    Task<List<Knome.API.DTOs.Categories.CategoryDto>> GetCommunityCategoriesAsync();
    Task<CommunityDto> GetCommunityAsync(int communityId, int currentUserId);
    Task<List<CommunityDto>> GetCommunitiesAsync(int? categoryId, string? type, string? search, int pageNumber, int pageSize, int currentUserId);
    Task<List<CommunityDto>> GetMyCommunitiesAsync(int currentUserId);
    Task<List<CommunityDto>> GetUserCommunitiesAsync(int targetUserId);

    // Create, Update & Delete
    Task<CommunityDto> CreateCommunityAsync(int currentUserId, CreateCommunityDto dto);
    Task<CommunityDto> UpdateCommunityAsync(int communityId, int currentUserId, UpdateCommunityDto dto);
    Task DeleteCommunityAsync(int communityId, int currentUserId);
    Task<bool> CheckCommunityNameExistsAsync(string? name, int? excludeCommunityId = null);

    // Approval Workflow
    Task<List<CommunityDto>> GetPendingCommunitiesAsync(int currentUserId);
    Task<CommunityDto> ApproveCommunityAsync(int communityId, int currentUserId);
    Task RejectCommunityAsync(int communityId, int currentUserId, RejectCommunityDto dto);

    // Membership & Joining
    Task<CommunityMemberDto> JoinCommunityAsync(int communityId, int currentUserId);
    Task LeaveCommunityAsync(int communityId, int currentUserId);
    Task<List<CommunityMemberDto>> GetMembersAsync(int communityId, string? status, int pageNumber, int pageSize, int currentUserId);
    Task<CommunityMemberDto> DecideMembershipAsync(int communityId, int targetUserId, int currentUserId, DecideMembershipDto dto);
    Task RemoveMemberAsync(int communityId, int targetUserId, int currentUserId);
    Task<List<CommunityMemberDto>> AddMembersAsync(int communityId, int currentUserId, AddCommunityMembersDto dto);

    // Admin Delegation
    Task AddAdminAsync(int communityId, int targetUserId, int currentUserId);
    Task RemoveAdminAsync(int communityId, int targetUserId, int currentUserId);

    // Posts & Feed
    Task<List<CommunityPostItemDto>> GetCommunityPostsAsync(int communityId, int pageNumber, int pageSize, int currentUserId);
    Task<CommunityPostItemDto> CreateCommunityPostAsync(int communityId, int currentUserId, CreateCommunityPostDto dto);
    Task<CommunityPostItemDto> PinPostAsync(int communityId, long postId, int currentUserId, PinCommunityPostDto dto);

    // Files & Documents
    Task<List<CommunityFileDto>> GetCommunityFilesAsync(int communityId, int currentUserId);
    Task<CommunityFileDto> AddCommunityFileAsync(int communityId, int currentUserId, CommunityFileDto dto);
    Task DeleteCommunityFileAsync(int communityId, string fileId, int currentUserId);
}
