using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Clips;
using Knome.API.Models;

namespace Knome.API.Interfaces;

public interface IClipRepository
{
    Task<List<Clip>> GetFeedClipsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20, string? hashtag = null, long? communityId = null);
    Task<Clip?> GetByIdAsync(long clipId);
    Task<List<Clip>> GetUserClipsAsync(int userId, int currentUserId, int pageNumber = 1, int pageSize = 50);
    Task<List<Clip>> GetAllClipsForAdminAsync(int pageNumber = 1, int pageSize = 50, string? search = null, string? status = null);
    Task<int> GetAdminClipsCountAsync(string? search = null, string? status = null);
    Task<Clip> AddAsync(Clip clip);
    Task UpdateAsync(Clip clip);
    Task<bool> SoftDeleteAsync(long clipId, int deletedByUserId);
    Task IncrementViewCountAsync(long clipId);
    Task IncrementShareCountAsync(long clipId);
    Task<ClipShare> AddShareAsync(ClipShare share);
    Task<bool> IsLikedByUserAsync(long clipId, int userId);
    Task<bool> IsBookmarkedByUserAsync(long clipId, int userId);
    Task<Dictionary<long, bool>> GetLikedClipsMapAsync(IEnumerable<long> clipIds, int userId);
    Task<Dictionary<long, bool>> GetBookmarkedClipsMapAsync(IEnumerable<long> clipIds, int userId);
    Task<List<ClipViewerDto>> GetClipViewersAsync(long clipId);
    Task<ClipEngagementDto> GetClipEngagementAsync(long clipId);
    Task<Dictionary<long, int>> GetCommentsCountMapAsync(IEnumerable<long> clipIds);
}

