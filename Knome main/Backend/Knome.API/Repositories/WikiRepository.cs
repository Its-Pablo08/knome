using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Common;
using Knome.API.Data;
using Knome.API.DTOs.Wiki;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class WikiRepository : IWikiRepository
{
    private readonly KnomeDbContext _db;

    public WikiRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<Wiki?> GetWikiByIdAsync(long wikiId, bool includeDeleted = false)
    {
        var query = _db.Wikis
            .Include(w => w.CreatedByUser)
            .Include(w => w.Category)
            .Include(w => w.WikiTags)
            .Include(w => w.WikiCollaborators)
                .ThenInclude(c => c.User)
            .Include(w => w.WikiCollaborators)
                .ThenInclude(c => c.AddedByUser)
            .Include(w => w.WikiShares)
                .ThenInclude(s => s.SharedByUser)
            .Include(w => w.WikiVersions)
            .Include(w => w.WikiSections.Where(s => !s.IsDeleted))
                .ThenInclude(s => s.CreatedByUser)
            .Include(w => w.WikiSections.Where(s => !s.IsDeleted))
                .ThenInclude(s => s.WikiCollaborators)
                    .ThenInclude(wc => wc.User)
            .AsQueryable();

        if (!includeDeleted)
        {
            query = query.Where(w => !w.IsDeleted);
        }

        return await query.FirstOrDefaultAsync(w => w.WikiId == wikiId);
    }

    public async Task<(List<Wiki> Items, int TotalCount)> GetWikisPagedAsync(
        string? tab,
        string? search,
        string? tag,
        string? status,
        int? communityId,
        int pageNumber,
        int pageSize,
        int currentUserId,
        bool isAdministrator)
    {
        var query = _db.Wikis
            .Include(w => w.CreatedByUser)
            .Include(w => w.Category)
            .Include(w => w.WikiTags)
            .Include(w => w.WikiCollaborators)
            .Include(w => w.WikiShares)
            .Include(w => w.WikiSections)
            .Where(w => !w.IsDeleted)
            .AsQueryable();

        // Status filter
        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            query = query.Where(w => w.Status == status);
        }

        // Community filter
        if (communityId.HasValue && communityId.Value > 0)
        {
            query = query.Where(w => w.WikiShares.Any(s => s.ShareType == "Community" && s.TargetId == communityId.Value));
        }

        // Tag filter
        if (!string.IsNullOrWhiteSpace(tag))
        {
            query = query.Where(w => w.WikiTags.Any(t => t.Tag.ToLower() == tag.ToLower()));
        }

        // Search filter (Title, Description, or ContentHtml)
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(w =>
                w.Title.ToLower().Contains(s) ||
                (w.Description != null && w.Description.ToLower().Contains(s)) ||
                w.WikiTags.Any(t => t.Tag.ToLower().Contains(s)));
        }

        // Tab filter
        var tabLower = (tab ?? "all").ToLower();
        if (tabLower == "my")
        {
            query = query.Where(w => w.CreatedByUserId == currentUserId ||
                w.WikiCollaborators.Any(c => c.UserId == currentUserId && c.Role == "Owner"));
        }
        else if (tabLower == "shared")
        {
            query = query.Where(w =>
                w.CreatedByUserId != currentUserId &&
                (w.WikiCollaborators.Any(c => c.UserId == currentUserId) ||
                 w.WikiShares.Any(s => (s.ShareType == "User" && s.TargetId == currentUserId))));
        }
        else if (tabLower == "archived")
        {
            query = query.Where(w => w.IsArchived || w.Status == "Archived");
        }
        else
        {
            // "all" or general list: regular users see Published wikis OR their own Drafts/Shared items
            if (!isAdministrator)
            {
                query = query.Where(w =>
                    w.Status == "Published" ||
                    w.CreatedByUserId == currentUserId ||
                    w.WikiCollaborators.Any(c => c.UserId == currentUserId));
            }
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(w => w.UpdatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<List<Wiki>> GetRecentlyUpdatedWikisAsync(
        int currentUserId,
        List<long> userCommunityIds,
        string? userDepartment,
        int count = 10,
        bool isAdministrator = false)
    {
        var query = _db.Wikis
            .Include(w => w.CreatedByUser)
            .Include(w => w.Category)
            .Include(w => w.WikiTags)
            .Include(w => w.WikiCollaborators)
            .Include(w => w.WikiShares)
            .Include(w => w.WikiSections)
            .Where(w => !w.IsDeleted)
            .AsQueryable();

        if (!isAdministrator)
        {
            query = query.Where(w =>
                w.Status == "Published" ||
                w.CreatedByUserId == currentUserId ||
                w.WikiCollaborators.Any(c => c.UserId == currentUserId) ||
                w.WikiShares.Any(s =>
                    (s.ShareType == "User" && s.TargetId == currentUserId) ||
                    (s.ShareType == "Community" && userCommunityIds.Contains(s.TargetId))));
        }

        return await query
            .OrderByDescending(w => w.UpdatedDate)
            .Take(count)
            .ToListAsync();
    }

    public async Task<Wiki> AddWikiAsync(Wiki wiki, List<string> tags)
    {
        wiki.CreatedDate = KnomeTime.Now;
        wiki.UpdatedDate = KnomeTime.Now;
        _db.Wikis.Add(wiki);
        await _db.SaveChangesAsync();

        if (tags != null && tags.Count > 0)
        {
            foreach (var t in tags.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct())
            {
                _db.WikiTags.Add(new WikiTag
                {
                    WikiId = wiki.WikiId,
                    Tag = t.Trim().TrimStart('#')
                });
            }
            await _db.SaveChangesAsync();
        }

        return wiki;
    }

    public async Task UpdateWikiAsync(Wiki wiki, List<string> tags)
    {
        wiki.UpdatedDate = KnomeTime.Now;
        _db.Wikis.Update(wiki);

        if (tags != null)
        {
            var existingTags = await _db.WikiTags.Where(t => t.WikiId == wiki.WikiId).ToListAsync();
            _db.WikiTags.RemoveRange(existingTags);

            foreach (var t in tags.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct())
            {
                _db.WikiTags.Add(new WikiTag
                {
                    WikiId = wiki.WikiId,
                    Tag = t.Trim().TrimStart('#')
                });
            }
        }

        await _db.SaveChangesAsync();
    }

    public async Task DeleteWikiAsync(Wiki wiki)
    {
        wiki.IsDeleted = true;
        wiki.UpdatedDate = KnomeTime.Now;
        _db.Wikis.Update(wiki);
        await _db.SaveChangesAsync();
    }

    public async Task ArchiveWikiAsync(Wiki wiki, bool isArchived)
    {
        wiki.IsArchived = isArchived;
        wiki.Status = isArchived ? "Archived" : "Published";
        wiki.UpdatedDate = KnomeTime.Now;
        _db.Wikis.Update(wiki);
        await _db.SaveChangesAsync();
    }

    public async Task IncrementViewCountAsync(long wikiId)
    {
        var wiki = await _db.Wikis.FindAsync(wikiId);
        if (wiki != null)
        {
            wiki.ViewCount += 1;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<List<string>> GetPopularTagsAsync(int count = 20)
    {
        return await _db.WikiTags
            .GroupBy(t => t.Tag)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .Take(count)
            .ToListAsync();
    }

    // Sections
    public async Task<List<WikiSection>> GetSectionsByWikiIdAsync(long wikiId)
    {
        return await _db.WikiSections
            .Include(s => s.CreatedByUser)
            .Include(s => s.WikiCollaborators)
                .ThenInclude(c => c.User)
            .Where(s => s.WikiId == wikiId && !s.IsDeleted)
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.SectionId)
            .ToListAsync();
    }

    public async Task<WikiSection?> GetSectionByIdAsync(long sectionId)
    {
        return await _db.WikiSections
            .Include(s => s.CreatedByUser)
            .Include(s => s.Subsections.Where(sub => !sub.IsDeleted))
            .Include(s => s.WikiCollaborators)
                .ThenInclude(c => c.User)
            .FirstOrDefaultAsync(s => s.SectionId == sectionId && !s.IsDeleted);
    }

    public async Task<WikiSection> AddSectionAsync(WikiSection section)
    {
        section.CreatedDate = KnomeTime.Now;
        section.UpdatedDate = KnomeTime.Now;
        _db.WikiSections.Add(section);

        var wiki = await _db.Wikis.FindAsync(section.WikiId);
        if (wiki != null)
        {
            wiki.UpdatedDate = KnomeTime.Now;
        }

        await _db.SaveChangesAsync();
        return section;
    }

    public async Task UpdateSectionAsync(WikiSection section)
    {
        section.UpdatedDate = KnomeTime.Now;
        _db.WikiSections.Update(section);

        var wiki = await _db.Wikis.FindAsync(section.WikiId);
        if (wiki != null)
        {
            wiki.UpdatedDate = KnomeTime.Now;
        }

        await _db.SaveChangesAsync();
    }

    public async Task DeleteSectionAsync(WikiSection section)
    {
        section.IsDeleted = true;
        section.UpdatedDate = KnomeTime.Now;
        _db.WikiSections.Update(section);

        // Also soft-delete any child subsections
        var childSubsections = await _db.WikiSections
            .Where(s => s.ParentSectionId == section.SectionId && !s.IsDeleted)
            .ToListAsync();

        foreach (var sub in childSubsections)
        {
            sub.IsDeleted = true;
            sub.UpdatedDate = KnomeTime.Now;
        }

        var wiki = await _db.Wikis.FindAsync(section.WikiId);
        if (wiki != null)
        {
            wiki.UpdatedDate = KnomeTime.Now;
        }

        await _db.SaveChangesAsync();
    }

    public async Task ReorderSectionsAsync(long wikiId, List<SectionOrderItemDto> items)
    {
        if (items == null || items.Count == 0) return;

        var sectionIds = items.Select(i => i.SectionId).ToList();
        var sections = await _db.WikiSections
            .Where(s => s.WikiId == wikiId && sectionIds.Contains(s.SectionId))
            .ToListAsync();

        foreach (var s in sections)
        {
            var match = items.FirstOrDefault(i => i.SectionId == s.SectionId);
            if (match != null)
            {
                s.SortOrder = match.SortOrder;
                s.ParentSectionId = match.ParentSectionId;
                s.UpdatedDate = KnomeTime.Now;
            }
        }

        var wiki = await _db.Wikis.FindAsync(wikiId);
        if (wiki != null)
        {
            wiki.UpdatedDate = KnomeTime.Now;
        }

        await _db.SaveChangesAsync();
    }

    // Collaborators
    public async Task<List<WikiCollaborator>> GetCollaboratorsByWikiIdAsync(long wikiId)
    {
        return await _db.WikiCollaborators
            .Include(c => c.User)
            .Include(c => c.AddedByUser)
            .Include(c => c.Section)
            .Where(c => c.WikiId == wikiId)
            .OrderBy(c => c.SectionId.HasValue ? 1 : 0)
            .ThenBy(c => c.AddedDate)
            .ToListAsync();
    }

    public async Task<WikiCollaborator?> GetCollaboratorByIdAsync(long collaboratorId)
    {
        return await _db.WikiCollaborators
            .Include(c => c.User)
            .Include(c => c.AddedByUser)
            .Include(c => c.Section)
            .FirstOrDefaultAsync(c => c.CollaboratorId == collaboratorId);
    }

    public async Task<WikiCollaborator> AddOrUpdateCollaboratorAsync(WikiCollaborator collaborator)
    {
        var existing = await _db.WikiCollaborators
            .FirstOrDefaultAsync(c =>
                c.WikiId == collaborator.WikiId &&
                c.SectionId == collaborator.SectionId &&
                c.UserId == collaborator.UserId);

        if (existing != null)
        {
            existing.Role = collaborator.Role;
            existing.AddedByUserId = collaborator.AddedByUserId;
            existing.AddedDate = KnomeTime.Now;
            await _db.SaveChangesAsync();
            return existing;
        }

        collaborator.AddedDate = KnomeTime.Now;
        _db.WikiCollaborators.Add(collaborator);
        await _db.SaveChangesAsync();
        return collaborator;
    }

    public async Task RemoveCollaboratorAsync(WikiCollaborator collaborator)
    {
        _db.WikiCollaborators.Remove(collaborator);
        await _db.SaveChangesAsync();
    }

    public async Task<string?> GetUserRoleForWikiAsync(long wikiId, int userId)
    {
        var collab = await _db.WikiCollaborators
            .Where(c => c.WikiId == wikiId && c.SectionId == null && c.UserId == userId)
            .Select(c => c.Role)
            .FirstOrDefaultAsync();

        return collab;
    }

    public async Task<string?> GetUserRoleForSectionAsync(long sectionId, int userId)
    {
        var collab = await _db.WikiCollaborators
            .Where(c => c.SectionId == sectionId && c.UserId == userId)
            .Select(c => c.Role)
            .FirstOrDefaultAsync();

        return collab;
    }

    // Shares
    public async Task<List<WikiShare>> GetSharesByWikiIdAsync(long wikiId)
    {
        return await _db.WikiShares
            .Include(s => s.SharedByUser)
            .Where(s => s.WikiId == wikiId)
            .OrderByDescending(s => s.CreatedDate)
            .ToListAsync();
    }

    public async Task<WikiShare?> GetShareByIdAsync(long shareId)
    {
        return await _db.WikiShares
            .Include(s => s.SharedByUser)
            .FirstOrDefaultAsync(s => s.ShareId == shareId);
    }

    public async Task<WikiShare> AddShareAsync(WikiShare share)
    {
        var existing = await _db.WikiShares
            .FirstOrDefaultAsync(s => s.WikiId == share.WikiId && s.ShareType == share.ShareType && s.TargetId == share.TargetId);

        if (existing != null)
        {
            existing.AccessLevel = share.AccessLevel;
            existing.SharedByUserId = share.SharedByUserId;
            existing.CreatedDate = KnomeTime.Now;
            await _db.SaveChangesAsync();
            return existing;
        }

        share.CreatedDate = KnomeTime.Now;
        _db.WikiShares.Add(share);
        await _db.SaveChangesAsync();
        return share;
    }

    public async Task RemoveShareAsync(WikiShare share)
    {
        _db.WikiShares.Remove(share);
        await _db.SaveChangesAsync();
    }

    public async Task<bool> IsWikiSharedWithUserAsync(long wikiId, int userId, List<long> userCommunityIds, string? userDepartment)
    {
        return await _db.WikiShares.AnyAsync(s =>
            s.WikiId == wikiId && (
                (s.ShareType == "User" && s.TargetId == userId) ||
                (s.ShareType == "Community" && userCommunityIds.Contains(s.TargetId))
            ));
    }

    // Versions
    public async Task<List<WikiVersion>> GetVersionsAsync(long wikiId, long? sectionId)
    {
        var query = _db.WikiVersions
            .Include(v => v.CreatedByUser)
            .Include(v => v.Section)
            .Where(v => v.WikiId == wikiId);

        if (sectionId.HasValue)
        {
            query = query.Where(v => v.SectionId == sectionId.Value);
        }
        else
        {
            query = query.Where(v => v.SectionId == null);
        }

        return await query
            .OrderByDescending(v => v.VersionNumber)
            .ToListAsync();
    }

    public async Task<WikiVersion?> GetVersionByIdAsync(long versionId)
    {
        return await _db.WikiVersions
            .Include(v => v.CreatedByUser)
            .Include(v => v.Section)
            .FirstOrDefaultAsync(v => v.VersionId == versionId);
    }

    public async Task<WikiVersion> AddVersionAsync(WikiVersion version)
    {
        version.CreatedDate = KnomeTime.Now;
        _db.WikiVersions.Add(version);
        await _db.SaveChangesAsync();
        return version;
    }

    public async Task<int> GetNextVersionNumberAsync(long wikiId, long? sectionId)
    {
        var query = _db.WikiVersions.Where(v => v.WikiId == wikiId);
        if (sectionId.HasValue)
        {
            query = query.Where(v => v.SectionId == sectionId.Value);
        }
        else
        {
            query = query.Where(v => v.SectionId == null);
        }

        var maxVersion = await query.MaxAsync(v => (int?)v.VersionNumber) ?? 0;
        return maxVersion + 1;
    }
}
