using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Clips;

namespace Knome.API.Interfaces;

public interface IClipService
{
    Task<List<ClipDto>> GetFeedClipsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20, string? hashtag = null, long? communityId = null);
    Task<ClipDto> GetByIdAsync(long clipId, int currentUserId);
    Task<List<ClipDto>> GetUserClipsAsync(int userId, int currentUserId, int pageNumber = 1, int pageSize = 50);
    Task<ClipDto> CreateClipAsync(int userId, CreateClipDto dto);
    Task<ClipDto> UpdateClipAsync(long clipId, int userId, UpdateClipDto dto, bool isAdmin);
    Task DeleteClipAsync(long clipId, int userId, bool isAdmin);
    Task<int> RecordViewAsync(long clipId, int userId);
    Task<bool> ToggleLikeAsync(long clipId, int userId);
    Task<bool> ToggleBookmarkAsync(long clipId, int userId);
    Task<bool> ShareClipAsync(long clipId, int userId, ShareClipDto dto);
    Task<(List<ClipDto> Items, int TotalCount)> GetAllClipsForAdminAsync(int pageNumber = 1, int pageSize = 50, string? search = null, string? status = null);
    Task<ClipDto> AdminUpdateStatusAsync(long clipId, int adminUserId, string status);
}
