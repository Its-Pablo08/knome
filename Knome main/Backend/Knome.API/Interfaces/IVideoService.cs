using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Videos;

namespace Knome.API.Interfaces;

public interface IVideoService
{
    Task<VideoDto> GetVideoAsync(long videoId, int currentUserId);
    Task<List<VideoDto>> GetVideosAsync(int? categoryId, string? tag, string? search, int pageNumber, int pageSize, int currentUserId);
    Task<List<VideoDto>> GetMyVideosAsync(int currentUserId, int pageNumber = 1, int pageSize = 20);
    Task<List<VideoDto>> GetUserVideosAsync(int uploaderUserId, int currentUserId, int pageNumber = 1, int pageSize = 20);
    Task<VideoDto> CreateVideoAsync(int currentUserId, CreateVideoDto dto);
    Task<VideoDto> UpdateVideoAsync(long videoId, int currentUserId, UpdateVideoDto dto);
    Task DeleteVideoAsync(long videoId, int currentUserId, bool isCallerAdminOrMod = false);
    Task<int> IncrementViewCountAsync(long videoId, int currentUserId = 0);
}
