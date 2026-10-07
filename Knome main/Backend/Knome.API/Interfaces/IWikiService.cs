using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Wiki;

namespace Knome.API.Interfaces;

public interface IWikiService
{
    // Wiki CRUD & Search
    Task<(List<WikiDto> Items, int TotalCount)> GetWikisAsync(
        string? tab,
        string? search,
        string? tag,
        string? status,
        int? communityId,
        int pageNumber,
        int pageSize,
        int currentUserId);
    Task<(List<WikiDto> Items, int TotalCount)> GetMyWikisAsync(int currentUserId, int pageNumber, int pageSize);
    Task<(List<WikiDto> Items, int TotalCount)> GetSharedWithMeWikisAsync(int currentUserId, int pageNumber, int pageSize);
    Task<List<WikiDto>> GetRecentlyUpdatedWikisAsync(int currentUserId, int count = 10);
    Task<WikiDetailDto> GetWikiDetailAsync(long wikiId, int currentUserId);
    Task<WikiDto> CreateWikiAsync(int currentUserId, CreateWikiDto dto);
    Task<WikiDto> UpdateWikiAsync(long wikiId, int currentUserId, UpdateWikiDto dto);
    Task DeleteWikiAsync(long wikiId, int currentUserId);
    Task RestoreWikiAsync(long wikiId, int currentUserId);
    Task<WikiDto> ToggleArchiveWikiAsync(long wikiId, int currentUserId, bool isArchived);
    Task<int> RecordWikiViewAsync(long wikiId, int currentUserId);
    Task<List<string>> GetPopularTagsAsync(int count = 20);

    // Sections
    Task<List<WikiSectionDto>> GetSectionsAsync(long wikiId, int currentUserId);
    Task<WikiSectionDto> GetSectionAsync(long wikiId, long sectionId, int currentUserId);
    Task<WikiSectionDto> CreateSectionAsync(long wikiId, int currentUserId, CreateWikiSectionDto dto);
    Task<WikiSectionDto> UpdateSectionAsync(long wikiId, long sectionId, int currentUserId, UpdateWikiSectionDto dto);
    Task DeleteSectionAsync(long wikiId, long sectionId, int currentUserId);
    Task ReorderSectionsAsync(long wikiId, int currentUserId, ReorderSectionsDto dto);

    // Collaborators
    Task<List<WikiCollaboratorDto>> GetCollaboratorsAsync(long wikiId, int currentUserId);
    Task<WikiCollaboratorDto> AddOrUpdateCollaboratorAsync(long wikiId, int currentUserId, AddCollaboratorDto dto);
    Task RemoveCollaboratorAsync(long wikiId, long collaboratorId, int currentUserId);

    // Shares
    Task<List<WikiShareDto>> GetSharesAsync(long wikiId, int currentUserId);
    Task<WikiShareDto> ShareWikiAsync(long wikiId, int currentUserId, ShareWikiDto dto);
    Task RemoveShareAsync(long wikiId, long shareId, int currentUserId);
    Task<List<WikiDepartmentDto>> GetDepartmentsAsync();

    // Version History
    Task<List<WikiVersionDto>> GetVersionsAsync(long wikiId, long? sectionId, int currentUserId);
    Task<WikiVersionDto> GetVersionDetailAsync(long wikiId, long versionId, int currentUserId);
    Task<WikiVersionDto> RestoreVersionAsync(long wikiId, long versionId, int currentUserId, RestoreVersionDto dto);

    // Activity / Audit Trail
    Task<List<WikiActivityDto>> GetActivitiesAsync(long wikiId, int currentUserId);
}
