using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Wiki;
using Knome.API.Models;

namespace Knome.API.Interfaces;

public interface IWikiRepository
{
    // Wikis
    Task<Wiki?> GetWikiByIdAsync(long wikiId, bool includeDeleted = false);
    Task<(List<Wiki> Items, int TotalCount)> GetWikisPagedAsync(
        string? tab,
        string? search,
        string? tag,
        string? status,
        int? communityId,
        int pageNumber,
        int pageSize,
        int currentUserId,
        bool isAdministrator);
    Task<List<Wiki>> GetRecentlyUpdatedWikisAsync(int currentUserId, List<long> userCommunityIds, string? userDepartment, int count = 10, bool isAdministrator = false);
    Task<Wiki> AddWikiAsync(Wiki wiki, List<string> tags);
    Task UpdateWikiAsync(Wiki wiki, List<string> tags);
    Task DeleteWikiAsync(Wiki wiki);
    Task ArchiveWikiAsync(Wiki wiki, bool isArchived);
    Task IncrementViewCountAsync(long wikiId);
    Task<List<string>> GetPopularTagsAsync(int count = 20);

    // Sections
    Task<List<WikiSection>> GetSectionsByWikiIdAsync(long wikiId);
    Task<WikiSection?> GetSectionByIdAsync(long sectionId);
    Task<WikiSection> AddSectionAsync(WikiSection section);
    Task UpdateSectionAsync(WikiSection section);
    Task DeleteSectionAsync(WikiSection section);
    Task ReorderSectionsAsync(long wikiId, List<SectionOrderItemDto> items);

    // Collaborators
    Task<List<WikiCollaborator>> GetCollaboratorsByWikiIdAsync(long wikiId);
    Task<WikiCollaborator?> GetCollaboratorByIdAsync(long collaboratorId);
    Task<WikiCollaborator> AddOrUpdateCollaboratorAsync(WikiCollaborator collaborator);
    Task RemoveCollaboratorAsync(WikiCollaborator collaborator);
    Task<string?> GetUserRoleForWikiAsync(long wikiId, int userId);
    Task<string?> GetUserRoleForSectionAsync(long sectionId, int userId);

    // Shares
    Task<List<WikiShare>> GetSharesByWikiIdAsync(long wikiId);
    Task<WikiShare?> GetShareByIdAsync(long shareId);
    Task<WikiShare> AddShareAsync(WikiShare share);
    Task RemoveShareAsync(WikiShare share);
    Task<bool> IsWikiSharedWithUserAsync(long wikiId, int userId, List<long> userCommunityIds, string? userDepartment);

    // Versions
    Task<List<WikiVersion>> GetVersionsAsync(long wikiId, long? sectionId);
    Task<WikiVersion?> GetVersionByIdAsync(long versionId);
    Task<WikiVersion> AddVersionAsync(WikiVersion version);
    Task<int> GetNextVersionNumberAsync(long wikiId, long? sectionId);
}
