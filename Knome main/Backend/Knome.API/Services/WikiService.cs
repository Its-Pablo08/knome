using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Common;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Wiki;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Services;

public class WikiService : IWikiService
{
    private readonly IWikiRepository _repo;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly ISuspensionGuard _suspensionGuard;
    private readonly IAuditLogService _auditLog;
    private readonly INotificationService _notificationService;

    public WikiService(
        IWikiRepository repo,
        KnomeDbContext db,
        IMapper mapper,
        ISuspensionGuard suspensionGuard,
        IAuditLogService auditLog,
        INotificationService notificationService)
    {
        _repo = repo;
        _db = db;
        _mapper = mapper;
        _suspensionGuard = suspensionGuard;
        _auditLog = auditLog;
        _notificationService = notificationService;
    }

    private async Task<bool> IsAdministratorAsync(int userId)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null) return false;
        return user.Roles.Any(r =>
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM")));
    }

    private async Task<List<long>> GetUserCommunityIdsAsync(int userId)
    {
        return await _db.CommunityMembers
            .Where(m => m.UserId == userId && (m.Status == "Active" || m.Status == "Approved"))
            .Select(m => (long)m.CommunityId)
            .ToListAsync();
    }

    private async Task<string> ResolveUserPermissionForWikiAsync(Wiki wiki, int userId, bool isAdministrator)
    {
        if (isAdministrator) return "Owner";
        if (wiki.CreatedByUserId == userId) return "Owner";

        var collabRole = wiki.WikiCollaborators
            .Where(c => c.SectionId == null && c.UserId == userId)
            .Select(c => c.Role)
            .FirstOrDefault();

        if (!string.IsNullOrEmpty(collabRole)) return collabRole;

        // Check if user has an editor share
        var userShare = wiki.WikiShares
            .Where(s => s.ShareType == "User" && s.TargetId == userId)
            .Select(s => s.AccessLevel)
            .FirstOrDefault();

        if (userShare == "Editor") return "Editor";

        // Check community editor share
        var userCommunities = await GetUserCommunityIdsAsync(userId);
        var commEditor = wiki.WikiShares
            .Any(s => s.ShareType == "Community" && userCommunities.Contains(s.TargetId) && s.AccessLevel == "Editor");
        if (commEditor) return "Editor";

        // Check department sphere editor share
        var userDeptId = await _db.Users.Where(u => u.UserId == userId).Select(u => u.DepartmentId).FirstOrDefaultAsync();
        if (userDeptId.HasValue)
        {
            var deptEditor = wiki.WikiShares
                .Any(s => s.ShareType == "Group" && s.TargetId == userDeptId.Value && s.AccessLevel == "Editor");
            if (deptEditor) return "Editor";
        }

        return "Viewer";
    }

    private async Task EnsureCanViewWikiAsync(Wiki wiki, int userId, bool isAdministrator)
    {
        if (isAdministrator) return;
        if (wiki.CreatedByUserId == userId) return;

        // Drafts are strictly private to creator, owner, and editors
        if (wiki.Status == "Draft")
        {
            var isCollab = wiki.WikiCollaborators.Any(c => c.UserId == userId && (c.Role == "Owner" || c.Role == "Editor"));
            if (!isCollab)
                throw new ForbiddenException("This Wiki is currently a Draft and only accessible to its authors/collaborators.");
            return;
        }

        // Check collaborators
        if (wiki.WikiCollaborators.Any(c => c.UserId == userId)) return;

        // Check direct user share
        if (wiki.WikiShares.Any(s => s.ShareType == "User" && s.TargetId == userId)) return;

        // Check community share
        var commIds = await GetUserCommunityIdsAsync(userId);
        if (wiki.WikiShares.Any(s => s.ShareType == "Community" && commIds.Contains(s.TargetId))) return;

        // Check department sphere ("Group") share
        var userDeptId = await _db.Users.Where(u => u.UserId == userId).Select(u => u.DepartmentId).FirstOrDefaultAsync();
        if (userDeptId.HasValue && wiki.WikiShares.Any(s => s.ShareType == "Group" && s.TargetId == userDeptId.Value)) return;

        // If Published or Archived and no restricted target shares, public to organization
        var hasRestrictedShares = wiki.WikiShares.Any(s => s.ShareType == "User" || s.ShareType == "Community" || s.ShareType == "Group");
        if ((wiki.Status == "Published" || wiki.Status == "Archived") && !hasRestrictedShares) return;

        throw new ForbiddenException("You do not have permission to view this Wiki.");
    }

    private async Task EnsureCanEditWikiAsync(Wiki wiki, int userId, bool isAdministrator)
    {
        if (isAdministrator) return;
        if (wiki.CreatedByUserId == userId) return;

        var role = await ResolveUserPermissionForWikiAsync(wiki, userId, isAdministrator);
        if (role == "Owner" || role == "Editor") return;

        throw new ForbiddenException("You do not have Editor or Owner permissions for this Wiki.");
    }

    private async Task EnsureCanManageWikiAsync(Wiki wiki, int userId, bool isAdministrator)
    {
        if (isAdministrator) return;
        if (wiki.CreatedByUserId == userId) return;

        var isOwner = wiki.WikiCollaborators.Any(c => c.SectionId == null && c.UserId == userId && c.Role == "Owner");
        if (isOwner) return;

        throw new ForbiddenException("Only the Wiki Owner or Administrator can perform this action.");
    }

    // Wiki CRUD & Search
    public async Task<(List<WikiDto> Items, int TotalCount)> GetWikisAsync(
        string? tab,
        string? search,
        string? tag,
        string? status,
        int? communityId,
        int pageNumber,
        int pageSize,
        int currentUserId)
    {
        var isAdmin = await IsAdministratorAsync(currentUserId);
        var (wikis, total) = await _repo.GetWikisPagedAsync(tab, search, tag, status, communityId, pageNumber, pageSize, currentUserId, isAdmin);

        var dtos = new List<WikiDto>();
        foreach (var w in wikis)
        {
            var dto = _mapper.Map<WikiDto>(w);
            var perm = await ResolveUserPermissionForWikiAsync(w, currentUserId, isAdmin);
            dto.UserPermission = perm;
            dto.CanEdit = perm == "Owner" || perm == "Editor";
            dto.CanDelete = perm == "Owner";
            dto.CanManageCollaborators = perm == "Owner";
            dtos.Add(dto);
        }

        return (dtos, total);
    }

    public async Task<(List<WikiDto> Items, int TotalCount)> GetMyWikisAsync(int currentUserId, int pageNumber, int pageSize)
    {
        return await GetWikisAsync("my", null, null, null, null, pageNumber, pageSize, currentUserId);
    }

    public async Task<(List<WikiDto> Items, int TotalCount)> GetSharedWithMeWikisAsync(int currentUserId, int pageNumber, int pageSize)
    {
        return await GetWikisAsync("shared", null, null, null, null, pageNumber, pageSize, currentUserId);
    }

    public async Task<List<WikiDto>> GetRecentlyUpdatedWikisAsync(int currentUserId, int count = 10)
    {
        var isAdmin = await IsAdministratorAsync(currentUserId);
        var commIds = await GetUserCommunityIdsAsync(currentUserId);
        var user = await _db.Users.Include(u => u.Department).FirstOrDefaultAsync(u => u.UserId == currentUserId);
        var wikis = await _repo.GetRecentlyUpdatedWikisAsync(currentUserId, commIds, user?.Department?.Name, count, isAdmin);

        var dtos = new List<WikiDto>();
        foreach (var w in wikis)
        {
            var dto = _mapper.Map<WikiDto>(w);
            var perm = await ResolveUserPermissionForWikiAsync(w, currentUserId, isAdmin);
            dto.UserPermission = perm;
            dto.CanEdit = perm == "Owner" || perm == "Editor";
            dto.CanDelete = perm == "Owner";
            dto.CanManageCollaborators = perm == "Owner";
            dtos.Add(dto);
        }

        return dtos;
    }

    public async Task<WikiDetailDto> GetWikiDetailAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var dto = _mapper.Map<WikiDetailDto>(wiki);
        var perm = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
        dto.UserPermission = perm;
        dto.CanEdit = perm == "Owner" || perm == "Editor";
        dto.CanDelete = perm == "Owner";
        dto.CanManageCollaborators = perm == "Owner";

        // Map Sections hierarchically (recursive n-tier nesting)
        var allSections = wiki.WikiSections.Where(s => !s.IsDeleted).OrderBy(s => s.SortOrder).ToList();
        dto.Sections = BuildHierarchicalSections(allSections, null, wiki, currentUserId, perm, isAdmin);

        // Collaborators
        dto.Collaborators = wiki.WikiCollaborators.Select(c => _mapper.Map<WikiCollaboratorDto>(c)).ToList();

        // Shares (filter out orphaned deleted entities WIKI-023)
        var shares = new List<WikiShareDto>();
        foreach (var s in wiki.WikiShares)
        {
            var shareDto = _mapper.Map<WikiShareDto>(s);
            if (s.ShareType == "Community")
            {
                var comm = await _db.Communities.FindAsync((int)s.TargetId);
                if (comm == null || !comm.IsActive) continue;
                shareDto.TargetName = comm.Name;
                shareDto.TargetDescription = comm.Description;
                shareDto.TargetAvatarUrl = comm.ThumbnailUrl;
            }
            else if (s.ShareType == "User")
            {
                var u = await _db.Users.Include(usr => usr.Department).FirstOrDefaultAsync(usr => usr.UserId == (int)s.TargetId);
                if (u == null || !u.IsActive) continue;
                shareDto.TargetName = u.FullName;
                shareDto.TargetDescription = u.Designation ?? u.Department?.Name;
                shareDto.TargetAvatarUrl = u.ProfilePhotoUrl;
            }
            else if (s.ShareType == "Group")
            {
                var dept = await _db.Departments.FindAsync((int)s.TargetId);
                if (dept == null) continue;
                shareDto.TargetName = dept.Name;
                shareDto.TargetDescription = "Department Sphere";
            }
            shares.Add(shareDto);
        }
        dto.Shares = shares;

        // Recent Activities
        dto.RecentActivities = await GetActivitiesAsync(wikiId, currentUserId);

        return dto;
    }

    private string ResolveSectionPermission(Wiki wiki, WikiSection section, int userId, string wikiLevelPerm, bool isAdmin)
    {
        if (isAdmin || wiki.CreatedByUserId == userId || wikiLevelPerm == "Owner") return "Owner";
        if (wikiLevelPerm == "Editor") return "Editor";

        var secRole = section.WikiCollaborators
            .Where(c => c.UserId == userId)
            .Select(c => c.Role)
            .FirstOrDefault();

        if (!string.IsNullOrEmpty(secRole)) return secRole;

        return "Viewer";
    }

    private List<WikiSectionDto> BuildHierarchicalSections(
        List<WikiSection> allSections,
        long? parentId,
        Wiki wiki,
        int currentUserId,
        string parentPerm,
        bool isAdmin)
    {
        var children = allSections
            .Where(s => s.ParentSectionId == parentId)
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.SectionId)
            .ToList();

        var result = new List<WikiSectionDto>();
        foreach (var c in children)
        {
            var secDto = _mapper.Map<WikiSectionDto>(c);
            var secPerm = ResolveSectionPermission(wiki, c, currentUserId, parentPerm, isAdmin);
            secDto.UserPermission = secPerm;
            secDto.CanEdit = secPerm == "Owner" || secPerm == "Editor";
            secDto.CanDelete = secPerm == "Owner";
            secDto.Subsections = BuildHierarchicalSections(allSections, c.SectionId, wiki, currentUserId, secPerm, isAdmin);
            result.Add(secDto);
        }
        return result;
    }

    public async Task<WikiDto> CreateWikiAsync(int currentUserId, CreateWikiDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);

        if (dto.CategoryId.HasValue && dto.CategoryId.Value > 0)
        {
            var catExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!catExists)
                throw new BadRequestException($"Category with ID {dto.CategoryId.Value} does not exist.");
        }

        var sanitizedContent = HtmlSanitizerHelper.Sanitize(dto.ContentHtml);

        var wiki = new Wiki
        {
            Title = dto.Title.Trim(),
            Description = dto.Description?.Trim(),
            ContentHtml = sanitizedContent,
            Status = string.IsNullOrWhiteSpace(dto.Status) ? "Published" : dto.Status,
            CreatedByUserId = currentUserId,
            CategoryId = dto.CategoryId > 0 ? dto.CategoryId : null,
            CoverImageUrl = dto.CoverImageUrl,
            IsArchived = false,
            IsDeleted = false,
            ViewCount = 0
        };

        using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var created = await _repo.AddWikiAsync(wiki, dto.Tags);

            // Record initial version 1
            var initialVersion = new WikiVersion
            {
                WikiId = created.WikiId,
                SectionId = null,
                VersionNumber = 1,
                Title = created.Title,
                Description = created.Description,
                ContentHtml = sanitizedContent,
                ChangeSummary = "Initial creation",
                CreatedByUserId = currentUserId
            };
            await _repo.AddVersionAsync(initialVersion);

            // Add creator as Wiki Owner collaborator
            await _repo.AddOrUpdateCollaboratorAsync(new WikiCollaborator
            {
                WikiId = created.WikiId,
                SectionId = null,
                UserId = currentUserId,
                Role = "Owner",
                AddedByUserId = currentUserId
            });

            // Add initial collaborators if provided
            if (dto.InitialCollaborators != null && dto.InitialCollaborators.Count > 0)
            {
                foreach (var c in dto.InitialCollaborators.Where(c => c.UserId != currentUserId))
                {
                    await _repo.AddOrUpdateCollaboratorAsync(new WikiCollaborator
                    {
                        WikiId = created.WikiId,
                        SectionId = c.SectionId,
                        UserId = c.UserId,
                        Role = string.IsNullOrWhiteSpace(c.Role) ? "Viewer" : c.Role,
                        AddedByUserId = currentUserId
                    });
                }
            }

            // Add initial shares if provided
            if (dto.InitialShares != null && dto.InitialShares.Count > 0)
            {
                foreach (var s in dto.InitialShares)
                {
                    await _repo.AddShareAsync(new WikiShare
                    {
                        WikiId = created.WikiId,
                        ShareType = s.ShareType,
                        TargetId = s.TargetId,
                        AccessLevel = string.IsNullOrWhiteSpace(s.AccessLevel) ? "Viewer" : s.AccessLevel,
                        SharedByUserId = currentUserId
                    });
                }
            }

            // Log audit activity
            await _auditLog.RecordAsync(currentUserId, "WikiCreated", "Wiki", created.WikiId, $"Created Wiki '{created.Title}'");

            await tx.CommitAsync();

            var result = await _repo.GetWikiByIdAsync(created.WikiId);
            var resultDto = _mapper.Map<WikiDto>(result);
            resultDto.UserPermission = "Owner";
            resultDto.CanEdit = true;
            resultDto.CanDelete = true;
            resultDto.CanManageCollaborators = true;
            return resultDto;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<WikiDto> UpdateWikiAsync(long wikiId, int currentUserId, UpdateWikiDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanEditWikiAsync(wiki, currentUserId, isAdmin);

        // Optimistic concurrency check (WIKI-014)
        if (dto.ExpectedUpdatedDate.HasValue && wiki.UpdatedDate > dto.ExpectedUpdatedDate.Value.AddSeconds(1))
        {
            throw new ConflictException("This Wiki overview has been modified by another collaborator since you loaded it. Please reload the latest changes to avoid overwriting them.");
        }

        if (dto.CategoryId.HasValue && dto.CategoryId.Value > 0)
        {
            var catExists = await _db.Categories.AnyAsync(c => c.CategoryId == dto.CategoryId.Value);
            if (!catExists)
                throw new BadRequestException($"Category with ID {dto.CategoryId.Value} does not exist.");
        }

        wiki.Title = dto.Title.Trim();
        wiki.Description = dto.Description?.Trim();
        wiki.ContentHtml = HtmlSanitizerHelper.Sanitize(dto.ContentHtml);

        if (!string.IsNullOrWhiteSpace(dto.Status) && dto.Status != wiki.Status)
        {
            // Only Owner or Admin can archive or unarchive a Wiki (WIKI-005)
            if (dto.Status == "Archived" || wiki.Status == "Archived")
            {
                await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);
            }
            wiki.Status = dto.Status;
            wiki.IsArchived = dto.Status == "Archived";
        }
        if (dto.CategoryId.HasValue) wiki.CategoryId = dto.CategoryId > 0 ? dto.CategoryId : null;
        if (!string.IsNullOrWhiteSpace(dto.CoverImageUrl)) wiki.CoverImageUrl = dto.CoverImageUrl;

        await _repo.UpdateWikiAsync(wiki, dto.Tags);

        // Record version snapshot
        var nextVersion = await _repo.GetNextVersionNumberAsync(wikiId, null);
        await _repo.AddVersionAsync(new WikiVersion
        {
            WikiId = wikiId,
            SectionId = null,
            VersionNumber = nextVersion,
            Title = wiki.Title,
            Description = wiki.Description,
            ContentHtml = wiki.ContentHtml,
            ChangeSummary = dto.ChangeSummary ?? "Updated overview content",
            CreatedByUserId = currentUserId
        });

        // Audit activity
        await _auditLog.RecordAsync(currentUserId, "WikiUpdated", "Wiki", wikiId, $"Updated Wiki '{wiki.Title}' (Version {nextVersion})");

        var updated = await _repo.GetWikiByIdAsync(wikiId);
        var resultDto = _mapper.Map<WikiDto>(updated);
        var perm = await ResolveUserPermissionForWikiAsync(updated!, currentUserId, isAdmin);
        resultDto.UserPermission = perm;
        resultDto.CanEdit = true;
        resultDto.CanDelete = perm == "Owner";
        resultDto.CanManageCollaborators = perm == "Owner";
        return resultDto;
    }

    public async Task DeleteWikiAsync(long wikiId, int currentUserId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);

        await _repo.DeleteWikiAsync(wiki);
        await _auditLog.RecordAsync(currentUserId, "WikiDeleted", "Wiki", wikiId, $"Deleted Wiki '{wiki.Title}'");
    }

    public async Task RestoreWikiAsync(long wikiId, int currentUserId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId, includeDeleted: true);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);

        await _repo.RestoreWikiAsync(wiki);
        await _auditLog.RecordAsync(currentUserId, "WikiRestored", "Wiki", wikiId, $"Restored Wiki '{wiki.Title}' from trash");
    }

    public async Task<WikiDto> ToggleArchiveWikiAsync(long wikiId, int currentUserId, bool isArchived)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);

        await _repo.ArchiveWikiAsync(wiki, isArchived);
        var action = isArchived ? "WikiArchived" : "WikiUnarchived";
        await _auditLog.RecordAsync(currentUserId, action, "Wiki", wikiId, $"{(isArchived ? "Archived" : "Restored")} Wiki '{wiki.Title}'");

        var updated = await _repo.GetWikiByIdAsync(wikiId);
        var resultDto = _mapper.Map<WikiDto>(updated);
        var perm = await ResolveUserPermissionForWikiAsync(updated!, currentUserId, isAdmin);
        resultDto.UserPermission = perm;
        resultDto.CanEdit = perm == "Owner" || perm == "Editor";
        resultDto.CanDelete = perm == "Owner";
        resultDto.CanManageCollaborators = perm == "Owner";
        return resultDto;
    }

    public async Task<int> RecordWikiViewAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null) return 0;

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        await _repo.IncrementViewCountAsync(wikiId);
        return wiki.ViewCount + 1;
    }

    public async Task<List<string>> GetPopularTagsAsync(int count = 20)
    {
        return await _repo.GetPopularTagsAsync(count);
    }

    // Sections
    public async Task<List<WikiSectionDto>> GetSectionsAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var perm = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
        var sections = await _repo.GetSectionsByWikiIdAsync(wikiId);

        return BuildHierarchicalSections(sections, null, wiki, currentUserId, perm, isAdmin);
    }

    public async Task<WikiSectionDto> GetSectionAsync(long wikiId, long sectionId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var section = await _repo.GetSectionByIdAsync(sectionId);
        if (section == null || section.WikiId != wikiId)
            throw new NotFoundException($"Section with ID {sectionId} not found.");

        var perm = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
        var secPerm = ResolveSectionPermission(wiki, section, currentUserId, perm, isAdmin);

        var dto = _mapper.Map<WikiSectionDto>(section);
        dto.UserPermission = secPerm;
        dto.CanEdit = secPerm == "Owner" || secPerm == "Editor";
        dto.CanDelete = secPerm == "Owner";
        return dto;
    }

    public async Task<WikiSectionDto> CreateSectionAsync(long wikiId, int currentUserId, CreateWikiSectionDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanEditWikiAsync(wiki, currentUserId, isAdmin);

        if (dto.ParentSectionId.HasValue && dto.ParentSectionId.Value > 0)
        {
            var parentSection = await _repo.GetSectionByIdAsync(dto.ParentSectionId.Value);
            if (parentSection == null || parentSection.WikiId != wikiId || parentSection.IsDeleted)
            {
                throw new BadRequestException("The specified parent section does not exist in this Wiki.");
            }
        }

        var sanitizedContent = HtmlSanitizerHelper.Sanitize(dto.ContentHtml);

        var section = new WikiSection
        {
            WikiId = wikiId,
            ParentSectionId = dto.ParentSectionId,
            Title = dto.Title.Trim(),
            ContentHtml = sanitizedContent,
            SortOrder = dto.SortOrder,
            CreatedByUserId = currentUserId,
            IsDeleted = false
        };

        var created = await _repo.AddSectionAsync(section);

        // Initial version 1 for section
        await _repo.AddVersionAsync(new WikiVersion
        {
            WikiId = wikiId,
            SectionId = created.SectionId,
            VersionNumber = 1,
            Title = created.Title,
            ContentHtml = sanitizedContent,
            ChangeSummary = dto.ChangeSummary ?? "Initial section creation",
            CreatedByUserId = currentUserId
        });

        await _auditLog.RecordAsync(currentUserId, "SectionAdded", "Wiki", wikiId, $"Added section '{created.Title}'");

        var result = await _repo.GetSectionByIdAsync(created.SectionId);
        var resultDto = _mapper.Map<WikiSectionDto>(result);
        resultDto.UserPermission = "Owner";
        resultDto.CanEdit = true;
        resultDto.CanDelete = true;
        return resultDto;
    }

    public async Task<WikiSectionDto> UpdateSectionAsync(long wikiId, long sectionId, int currentUserId, UpdateWikiSectionDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var section = await _repo.GetSectionByIdAsync(sectionId);
        if (section == null || section.WikiId != wikiId)
            throw new NotFoundException($"Section with ID {sectionId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        var perm = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
        var secPerm = ResolveSectionPermission(wiki, section, currentUserId, perm, isAdmin);

        if (secPerm != "Owner" && secPerm != "Editor")
            throw new ForbiddenException("You do not have Editor permissions for this section.");

        // Optimistic concurrency check (WIKI-014)
        if (dto.ExpectedUpdatedDate.HasValue && section.UpdatedDate > dto.ExpectedUpdatedDate.Value.AddSeconds(1))
        {
            throw new ConflictException("This section has been modified by another collaborator since you loaded it. Please reload the latest changes to avoid overwriting them.");
        }

        if (dto.ParentSectionId.HasValue && dto.ParentSectionId.Value > 0)
        {
            if (dto.ParentSectionId.Value == sectionId)
            {
                throw new BadRequestException("A section cannot be its own parent.");
            }

            var parentSection = await _repo.GetSectionByIdAsync(dto.ParentSectionId.Value);
            if (parentSection == null || parentSection.WikiId != wikiId || parentSection.IsDeleted)
            {
                throw new BadRequestException("The specified parent section does not exist in this Wiki.");
            }

            // Cycle detection: ensure sectionId is not an ancestor of parentSection
            var visited = new HashSet<long> { sectionId };
            var currParentId = (long?)dto.ParentSectionId.Value;
            while (currParentId.HasValue)
            {
                if (visited.Contains(currParentId.Value))
                {
                    throw new BadRequestException("Circular section hierarchy detected. A section cannot be child of its own descendant.");
                }
                visited.Add(currParentId.Value);
                var ancestor = await _repo.GetSectionByIdAsync(currParentId.Value);
                currParentId = ancestor?.ParentSectionId;
            }

            section.ParentSectionId = dto.ParentSectionId;
        }
        else
        {
            section.ParentSectionId = null;
        }

        section.Title = dto.Title.Trim();
        section.ContentHtml = HtmlSanitizerHelper.Sanitize(dto.ContentHtml);
        section.SortOrder = dto.SortOrder;

        await _repo.UpdateSectionAsync(section);

        // Record next version
        var nextVersion = await _repo.GetNextVersionNumberAsync(wikiId, sectionId);
        await _repo.AddVersionAsync(new WikiVersion
        {
            WikiId = wikiId,
            SectionId = sectionId,
            VersionNumber = nextVersion,
            Title = section.Title,
            ContentHtml = section.ContentHtml,
            ChangeSummary = dto.ChangeSummary ?? "Updated section content",
            CreatedByUserId = currentUserId
        });

        await _auditLog.RecordAsync(currentUserId, "SectionUpdated", "Wiki", wikiId, $"Updated section '{section.Title}' (Version {nextVersion})");

        var updated = await _repo.GetSectionByIdAsync(sectionId);
        var resultDto = _mapper.Map<WikiSectionDto>(updated);
        resultDto.UserPermission = secPerm;
        resultDto.CanEdit = true;
        resultDto.CanDelete = secPerm == "Owner";
        return resultDto;
    }

    public async Task DeleteSectionAsync(long wikiId, long sectionId, int currentUserId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var section = await _repo.GetSectionByIdAsync(sectionId);
        if (section == null || section.WikiId != wikiId)
            throw new NotFoundException($"Section with ID {sectionId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        var perm = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
        var secPerm = ResolveSectionPermission(wiki, section, currentUserId, perm, isAdmin);

        if (secPerm != "Owner")
            throw new ForbiddenException("Only the Wiki Owner or Section Creator can delete this section.");

        await _repo.DeleteSectionAsync(section);
        await _auditLog.RecordAsync(currentUserId, "SectionDeleted", "Wiki", wikiId, $"Deleted section '{section.Title}'");
    }

    public async Task ReorderSectionsAsync(long wikiId, int currentUserId, ReorderSectionsDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanEditWikiAsync(wiki, currentUserId, isAdmin);

        await _repo.ReorderSectionsAsync(wikiId, dto.Items);
        await _auditLog.RecordAsync(currentUserId, "SectionsReordered", "Wiki", wikiId, "Reordered sections outline");
    }

    // Collaborators
    public async Task<List<WikiCollaboratorDto>> GetCollaboratorsAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var list = await _repo.GetCollaboratorsByWikiIdAsync(wikiId);
        return list.Select(c => _mapper.Map<WikiCollaboratorDto>(c)).ToList();
    }

    public async Task<WikiCollaboratorDto> AddOrUpdateCollaboratorAsync(long wikiId, int currentUserId, AddCollaboratorDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);

        var targetUser = await _db.Users.FindAsync(dto.UserId);
        if (targetUser == null)
            throw new NotFoundException($"Target user {dto.UserId} not found.");

        var collab = new WikiCollaborator
        {
            WikiId = wikiId,
            SectionId = dto.SectionId,
            UserId = dto.UserId,
            Role = string.IsNullOrWhiteSpace(dto.Role) ? "Viewer" : dto.Role,
            AddedByUserId = currentUserId
        };

        var saved = await _repo.AddOrUpdateCollaboratorAsync(collab);
        var actionText = $"Added collaborator {targetUser.FullName} as {saved.Role}";
        await _auditLog.RecordAsync(currentUserId, "CollaboratorAdded", "Wiki", wikiId, actionText);

        // Notify added collaborator
        try
        {
            await _notificationService.PublishAsync(
                dto.UserId,
                NotificationTypes.Wiki,
                $"You have been added as a {saved.Role} to Wiki: '{wiki.Title}'",
                ContentTypes.Wiki,
                wikiId);
        }
        catch { }

        var fresh = await _repo.GetCollaboratorByIdAsync(saved.CollaboratorId);
        return _mapper.Map<WikiCollaboratorDto>(fresh);
    }

    public async Task RemoveCollaboratorAsync(long wikiId, long collaboratorId, int currentUserId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanManageWikiAsync(wiki, currentUserId, isAdmin);

        var collab = await _repo.GetCollaboratorByIdAsync(collaboratorId);
        if (collab == null || collab.WikiId != wikiId)
            throw new NotFoundException($"Collaborator {collaboratorId} not found.");

        // Cannot remove the original creator
        if (collab.UserId == wiki.CreatedByUserId)
            throw new BadRequestException("Cannot remove the creator/primary owner of the Wiki.");

        await _repo.RemoveCollaboratorAsync(collab);
        await _auditLog.RecordAsync(currentUserId, "CollaboratorRemoved", "Wiki", wikiId, $"Removed collaborator #{collaboratorId}");
    }

    // Shares
    public async Task<List<WikiShareDto>> GetSharesAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var shares = await _repo.GetSharesByWikiIdAsync(wikiId);
        var dtos = new List<WikiShareDto>();
        foreach (var s in shares)
        {
            var dto = _mapper.Map<WikiShareDto>(s);
            if (s.ShareType == "Community")
            {
                var comm = await _db.Communities.FindAsync((int)s.TargetId);
                if (comm == null || !comm.IsActive) continue;
                dto.TargetName = comm.Name;
                dto.TargetDescription = comm.Description;
                dto.TargetAvatarUrl = comm.ThumbnailUrl;
            }
            else if (s.ShareType == "User")
            {
                var u = await _db.Users.Include(usr => usr.Department).FirstOrDefaultAsync(usr => usr.UserId == (int)s.TargetId);
                if (u == null || !u.IsActive) continue;
                dto.TargetName = u.FullName;
                dto.TargetDescription = u.Designation ?? u.Department?.Name;
                dto.TargetAvatarUrl = u.ProfilePhotoUrl;
            }
            else if (s.ShareType == "Group")
            {
                var dept = await _db.Departments.FindAsync((int)s.TargetId);
                if (dept == null) continue;
                dto.TargetName = dept.Name;
                dto.TargetDescription = "Department Sphere";
            }
            dtos.Add(dto);
        }
        return dtos;
    }

    public async Task<WikiShareDto> ShareWikiAsync(long wikiId, int currentUserId, ShareWikiDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var canEdit = isAdmin || wiki.CreatedByUserId == currentUserId;
        if (!canEdit)
        {
            var role = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
            canEdit = (role == "Owner" || role == "Editor");
        }

        if (!canEdit)
        {
            throw new ForbiddenException("Only document Owners and Editors have permission to share this Wiki.");
        }

        // Validate target entity existence (WIKI-023)
        if (dto.ShareType == "User")
        {
            var userExists = await _db.Users.AnyAsync(u => u.UserId == dto.TargetId && u.IsActive);
            if (!userExists)
                throw new BadRequestException($"Target User #{dto.TargetId} does not exist or has been deactivated.");
        }
        else if (dto.ShareType == "Community")
        {
            var commExists = await _db.Communities.AnyAsync(c => c.CommunityId == dto.TargetId && c.IsActive);
            if (!commExists)
                throw new BadRequestException($"Target Community #{dto.TargetId} does not exist or has been deleted.");
        }
        else if (dto.ShareType == "Group")
        {
            var deptExists = await _db.Departments.AnyAsync(d => d.DepartmentId == dto.TargetId);
            if (!deptExists)
                throw new BadRequestException($"Target Department #{dto.TargetId} does not exist.");
        }
        else
        {
            throw new BadRequestException($"Invalid share type '{dto.ShareType}'. Must be User, Community, or Group.");
        }

        var requestedAccess = string.IsNullOrWhiteSpace(dto.AccessLevel) ? "Viewer" : dto.AccessLevel;
        var finalAccess = (requestedAccess == "Editor" || requestedAccess == "Owner") ? requestedAccess : "Viewer";

        // Check if share already exists to update access level instead of creating duplicate
        var existingShares = await _repo.GetSharesByWikiIdAsync(wikiId);
        var existingShare = existingShares.FirstOrDefault(s => s.ShareType == dto.ShareType && s.TargetId == dto.TargetId);

        WikiShare saved;
        if (existingShare != null)
        {
            existingShare.AccessLevel = finalAccess;
            _db.WikiShares.Update(existingShare);
            await _db.SaveChangesAsync();
            saved = existingShare;
        }
        else
        {
            var share = new WikiShare
            {
                WikiId = wikiId,
                ShareType = dto.ShareType,
                TargetId = dto.TargetId,
                AccessLevel = finalAccess,
                SharedByUserId = currentUserId
            };
            saved = await _repo.AddShareAsync(share);
        }

        await _auditLog.RecordAsync(currentUserId, "WikiShared", "Wiki", wikiId, $"Shared Wiki with {dto.ShareType} #{dto.TargetId} ({saved.AccessLevel})");

        var resultDto = _mapper.Map<WikiShareDto>(saved);
        if (saved.ShareType == "Community")
        {
            var comm = await _db.Communities.FindAsync((int)saved.TargetId);
            resultDto.TargetName = comm?.Name ?? $"Community #{saved.TargetId}";
            resultDto.TargetDescription = comm?.Description;
            resultDto.TargetAvatarUrl = comm?.ThumbnailUrl;
        }
        else if (saved.ShareType == "User")
        {
            var u = await _db.Users.Include(usr => usr.Department).FirstOrDefaultAsync(usr => usr.UserId == (int)saved.TargetId);
            resultDto.TargetName = u?.FullName ?? $"User #{saved.TargetId}";
            resultDto.TargetDescription = u?.Designation ?? u?.Department?.Name;
            resultDto.TargetAvatarUrl = u?.ProfilePhotoUrl;

            // Notify user
            try
            {
                await _notificationService.PublishAsync(
                    (int)saved.TargetId,
                    NotificationTypes.Share,
                    $"A Wiki has been shared with you: '{wiki.Title}'",
                    ContentTypes.Wiki,
                    wikiId);
            }
            catch { }
        }
        else if (saved.ShareType == "Group")
        {
            var dept = await _db.Departments.FindAsync((int)saved.TargetId);
            resultDto.TargetName = dept?.Name ?? $"Group #{saved.TargetId}";
            resultDto.TargetDescription = "Department Sphere";
        }
        return resultDto;
    }

    public async Task RemoveShareAsync(long wikiId, long shareId, int currentUserId)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        var canEdit = isAdmin || wiki.CreatedByUserId == currentUserId;
        if (!canEdit)
        {
            var role = await ResolveUserPermissionForWikiAsync(wiki, currentUserId, isAdmin);
            canEdit = (role == "Owner" || role == "Editor");
        }

        var share = await _repo.GetShareByIdAsync(shareId);
        if (share == null || share.WikiId != wikiId)
            throw new NotFoundException($"Share {shareId} not found.");

        if (!canEdit && share.SharedByUserId != currentUserId)
        {
            throw new ForbiddenException("You do not have permission to remove this share.");
        }

        await _repo.RemoveShareAsync(share);
        await _auditLog.RecordAsync(currentUserId, "WikiShareRemoved", "Wiki", wikiId, $"Removed share #{shareId}");
    }

    public async Task<List<WikiDepartmentDto>> GetDepartmentsAsync()
    {
        return await _db.Departments
            .OrderBy(d => d.Name)
            .Select(d => new WikiDepartmentDto
            {
                DepartmentId = d.DepartmentId,
                Name = d.Name,
                DepartmentCode = d.DepartmentCode
            })
            .ToListAsync();
    }

    // Version History
    public async Task<List<WikiVersionDto>> GetVersionsAsync(long wikiId, long? sectionId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var versions = await _repo.GetVersionsAsync(wikiId, sectionId);
        return versions.Select(v => _mapper.Map<WikiVersionDto>(v)).ToList();
    }

    public async Task<WikiVersionDto> GetVersionDetailAsync(long wikiId, long versionId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanViewWikiAsync(wiki, currentUserId, isAdmin);

        var version = await _repo.GetVersionByIdAsync(versionId);
        if (version == null || version.WikiId != wikiId)
            throw new NotFoundException($"Version {versionId} not found.");

        return _mapper.Map<WikiVersionDto>(version);
    }

    public async Task<WikiVersionDto> RestoreVersionAsync(long wikiId, long versionId, int currentUserId, RestoreVersionDto dto)
    {
        await _suspensionGuard.EnsureNotSuspendedAsync(currentUserId);
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var isAdmin = await IsAdministratorAsync(currentUserId);
        await EnsureCanEditWikiAsync(wiki, currentUserId, isAdmin);

        var targetVersion = await _repo.GetVersionByIdAsync(versionId);
        if (targetVersion == null || targetVersion.WikiId != wikiId)
            throw new NotFoundException($"Version {versionId} not found.");

        if (targetVersion.SectionId.HasValue)
        {
            // Restore section (supports restoring soft-deleted sections)
            var section = await _repo.GetSectionByIdAsync(targetVersion.SectionId.Value, includeDeleted: true);
            if (section == null)
                throw new NotFoundException($"Section #{targetVersion.SectionId.Value} no longer exists.");

            if (section.IsDeleted)
            {
                section.IsDeleted = false;
            }
            section.Title = targetVersion.Title;
            section.ContentHtml = targetVersion.ContentHtml;
            await _repo.UpdateSectionAsync(section);

            var nextVersionNum = await _repo.GetNextVersionNumberAsync(wikiId, targetVersion.SectionId);
            var restoredVersion = await _repo.AddVersionAsync(new WikiVersion
            {
                WikiId = wikiId,
                SectionId = targetVersion.SectionId,
                VersionNumber = nextVersionNum,
                Title = section.Title,
                ContentHtml = section.ContentHtml,
                ChangeSummary = dto?.RestoreComment ?? $"Restored to Version {targetVersion.VersionNumber}",
                CreatedByUserId = currentUserId
            });

            await _auditLog.RecordAsync(currentUserId, "VersionRestored", "Wiki", wikiId, $"Restored section '{section.Title}' to Version {targetVersion.VersionNumber}");
            return _mapper.Map<WikiVersionDto>(restoredVersion);
        }
        else
        {
            // Restore wiki overview
            wiki.Title = targetVersion.Title;
            if (targetVersion.Description != null) wiki.Description = targetVersion.Description;
            wiki.ContentHtml = targetVersion.ContentHtml;
            await _repo.UpdateWikiAsync(wiki, wiki.WikiTags?.Select(t => t.Tag).ToList() ?? new List<string>());

            var nextVersionNum = await _repo.GetNextVersionNumberAsync(wikiId, null);
            var restoredVersion = await _repo.AddVersionAsync(new WikiVersion
            {
                WikiId = wikiId,
                SectionId = null,
                VersionNumber = nextVersionNum,
                Title = wiki.Title,
                Description = wiki.Description,
                ContentHtml = wiki.ContentHtml,
                ChangeSummary = dto?.RestoreComment ?? $"Restored to Version {targetVersion.VersionNumber}",
                CreatedByUserId = currentUserId
            });

            await _auditLog.RecordAsync(currentUserId, "VersionRestored", "Wiki", wikiId, $"Restored Wiki overview to Version {targetVersion.VersionNumber}");
            return _mapper.Map<WikiVersionDto>(restoredVersion);
        }
    }

    // Activity / Audit Trail
    public async Task<List<WikiActivityDto>> GetActivitiesAsync(long wikiId, int currentUserId)
    {
        var wiki = await _repo.GetWikiByIdAsync(wikiId);
        if (wiki == null)
            throw new NotFoundException($"Wiki with ID {wikiId} not found.");

        var logs = await _db.AuditLogs
            .Include(a => a.ActorUser)
            .Where(a => a.TargetType == "Wiki" && a.TargetId == wikiId)
            .OrderByDescending(a => a.Timestamp)
            .Take(50)
            .ToListAsync();

        return logs.Select(l => new WikiActivityDto
        {
            ActivityId = l.AuditId,
            WikiId = l.TargetId,
            Action = l.Action,
            ActorUserId = l.ActorUserId,
            ActorUserName = l.ActorUser != null ? l.ActorUser.FullName : $"User #{l.ActorUserId}",
            ActorUserAvatar = l.ActorUser?.ProfilePhotoUrl,
            Reason = l.Reason,
            Details = l.Reason,
            Timestamp = l.Timestamp
        }).ToList();
    }
}
