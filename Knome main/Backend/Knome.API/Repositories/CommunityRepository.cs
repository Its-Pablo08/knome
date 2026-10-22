using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class CommunityRepository : ICommunityRepository
{
    private readonly KnomeDbContext _db;

    public CommunityRepository(KnomeDbContext db)
    {
        _db = db;
    }

    // --- Community CRUD & Discovery ---
    public async Task<Community?> GetCommunityByIdAsync(int communityId)
    {
        return await _db.Communities
            .Include(c => c.Category)
            .Include(c => c.CreatedByUser)
            .Include(c => c.Users) // Admins
            .Include(c => c.CommunityMembers)
            .FirstOrDefaultAsync(c => c.CommunityId == communityId && c.IsActive);
    }

    public async Task<Community?> GetCommunityByIdAnyStatusAsync(int communityId)
    {
        return await _db.Communities
            .Include(c => c.Category)
            .Include(c => c.CreatedByUser)
            .Include(c => c.Users) // Admins
            .Include(c => c.CommunityMembers)
            .FirstOrDefaultAsync(c => c.CommunityId == communityId);
    }

    public async Task<List<Community>> GetPendingCommunitiesAsync()
    {
        return await _db.Communities
            .Where(c => !c.IsActive && c.ApprovalStatus == "Pending")
            .Include(c => c.Category)
            .Include(c => c.CreatedByUser)
                .ThenInclude(u => u.Department)
            .Include(c => c.CommunityMembers)
            .OrderByDescending(c => c.CreatedDate)
            .ToListAsync();
    }

    public async Task<List<Community>> GetCommunitiesAsync(int? categoryId, string? type, string? search, int pageNumber, int pageSize)
    {
        var query = _db.Communities
            .Where(c => c.IsActive && (c.ApprovalStatus == null || c.ApprovalStatus == "Approved"))
            .Include(c => c.Category)
            .Include(c => c.CreatedByUser)
            .Include(c => c.CommunityMembers)
            .AsQueryable();

        if (categoryId.HasValue)
            query = query.Where(c => c.CategoryId == categoryId.Value);

        if (!string.IsNullOrWhiteSpace(type))
            query = query.Where(c => c.CommunityType == type);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c => c.Name.Contains(search) || (c.Description != null && c.Description.Contains(search)));

        return await query
            .OrderByDescending(c => c.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Community>> GetUserCommunitiesAsync(int userId)
    {
        return await _db.Communities
            .Where(c => (c.IsActive && (c.ApprovalStatus == null || c.ApprovalStatus == "Approved")) || 
                        (c.CreatedByUserId == userId && c.ApprovalStatus == "Pending"))
            .Include(c => c.Category)
            .Include(c => c.CreatedByUser)
            .Include(c => c.CommunityMembers)
            .Where(c => c.CommunityMembers.Any(m => m.UserId == userId && (m.Status == "Approved" || m.Status == "Active")) ||
                        c.Users.Any(u => u.UserId == userId) ||
                        c.CreatedByUserId == userId ||
                        c.CommunityType == "Default" ||
                        c.CommunityType == "Org")
            .OrderByDescending(c => c.CreatedDate)
            .ToListAsync();
    }

    public async Task<Community> AddCommunityAsync(Community community)
    {
        _db.Communities.Add(community);
        await _db.SaveChangesAsync();
        return community;
    }

    public async Task UpdateCommunityAsync(Community community)
    {
        _db.Communities.Update(community);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteCommunityAsync(Community community)
    {
        community.IsActive = false;
        _db.Communities.Update(community);
        await _db.SaveChangesAsync();
    }

    public async Task<bool> CommunityNameExistsAsync(string name, int? excludeCommunityId = null)
    {
        var query = _db.Communities.Where(c => c.IsActive);
        if (excludeCommunityId.HasValue)
            query = query.Where(c => c.CommunityId != excludeCommunityId.Value);

        var trimmed = name.Trim().ToLower();
        return await query.AnyAsync(c => c.Name.ToLower() == trimmed);
    }

    // --- Community Admins ---
    public async Task<bool> IsCommunityAdminAsync(int communityId, int userId)
    {
        var inAdminsTable = await _db.Communities
            .Where(c => c.CommunityId == communityId && c.Users.Any(u => u.UserId == userId))
            .AnyAsync();

        if (inAdminsTable)
            return true;

        return await _db.CommunityMembers
            .AnyAsync(m => m.CommunityId == communityId && m.UserId == userId && m.MemberType == CommunityMemberTypes.Admin && (m.Status == CommunityMemberStatuses.Approved || m.Status == "Active"));
    }

    public async Task AddCommunityAdminAsync(int communityId, int userId)
    {
        var community = await _db.Communities.Include(c => c.Users).FirstOrDefaultAsync(c => c.CommunityId == communityId);
        var user = await _db.Users.FindAsync(userId);
        if (community != null && user != null && !community.Users.Any(u => u.UserId == userId))
        {
            community.Users.Add(user);
        }

        var member = await _db.CommunityMembers.FirstOrDefaultAsync(m => m.CommunityId == communityId && m.UserId == userId);
        if (member != null && member.MemberType != CommunityMemberTypes.Admin)
        {
            member.MemberType = CommunityMemberTypes.Admin;
        }

        await _db.SaveChangesAsync();
    }

    public async Task RemoveCommunityAdminAsync(int communityId, int userId)
    {
        var community = await _db.Communities.Include(c => c.Users).FirstOrDefaultAsync(c => c.CommunityId == communityId);
        var user = community?.Users.FirstOrDefault(u => u.UserId == userId);
        if (community != null && user != null)
        {
            community.Users.Remove(user);
        }

        var member = await _db.CommunityMembers.FirstOrDefaultAsync(m => m.CommunityId == communityId && m.UserId == userId);
        if (member != null && member.MemberType == CommunityMemberTypes.Admin)
        {
            member.MemberType = CommunityMemberTypes.Member;
        }

        await _db.SaveChangesAsync();
    }

    public async Task<int> GetCommunityAdminsCountAsync(int communityId)
    {
        var adminUserIds = await _db.Communities
            .Where(c => c.CommunityId == communityId)
            .SelectMany(c => c.Users.Select(u => u.UserId))
            .ToListAsync();

        var memberAdminUserIds = await _db.CommunityMembers
            .Where(m => m.CommunityId == communityId && m.MemberType == CommunityMemberTypes.Admin && (m.Status == CommunityMemberStatuses.Approved || m.Status == "Active"))
            .Select(m => m.UserId)
            .ToListAsync();

        return adminUserIds.Concat(memberAdminUserIds).Distinct().Count();
    }

    // --- Members ---
    public async Task<CommunityMember?> GetMemberAsync(int communityId, int userId)
    {
        return await _db.CommunityMembers
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.CommunityId == communityId && m.UserId == userId);
    }

    public async Task<CommunityMember> AddMemberAsync(CommunityMember member)
    {
        _db.CommunityMembers.Add(member);
        await _db.SaveChangesAsync();
        return member;
    }

    public async Task UpdateMemberAsync(CommunityMember member)
    {
        _db.CommunityMembers.Update(member);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveMemberAsync(CommunityMember member)
    {
        _db.CommunityMembers.Remove(member);
        await _db.SaveChangesAsync();
    }

    public async Task<List<CommunityMember>> GetMembersAsync(int communityId, string? status, int pageNumber, int pageSize)
    {
        var query = _db.CommunityMembers
            .Include(m => m.User)
            .Include(m => m.ApprovedByUser)
            .Where(m => m.CommunityId == communityId)
            .AsQueryable();

        if (string.Equals(status, CommunityMemberStatuses.Banned, StringComparison.OrdinalIgnoreCase) || 
            string.Equals(status, "Suspended", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(m => m.Status == CommunityMemberStatuses.Banned || m.Status == "Suspended" || m.Status == "banned" || m.Status == "suspended");
        }
        else if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(m => m.Status == status);
        }
        else
        {
            query = query.Where(m => m.Status == CommunityMemberStatuses.Approved || m.Status == "Active");
        }

        return await query
            .OrderByDescending(m => m.RequestedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    // --- Posts & Feed ---
    public async Task<CommunityPost?> GetCommunityPostAsync(int communityId, long postId)
    {
        return await _db.CommunityPosts
            .Include(cp => cp.Post)
            .ThenInclude(p => p.AuthorUser)
            .FirstOrDefaultAsync(cp => cp.CommunityId == communityId && cp.PostId == postId);
    }

    public async Task<CommunityPost> AddCommunityPostAsync(CommunityPost communityPost)
    {
        _db.CommunityPosts.Add(communityPost);
        await _db.SaveChangesAsync();
        return communityPost;
    }

    public async Task UpdateCommunityPostAsync(CommunityPost communityPost)
    {
        _db.CommunityPosts.Update(communityPost);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteCommunityPostAsync(CommunityPost communityPost)
    {
        _db.CommunityPosts.Remove(communityPost);
        await _db.SaveChangesAsync();
    }

    public async Task<List<CommunityPost>> GetCommunityPostsAsync(int communityId, int pageNumber, int pageSize)
    {
        return await _db.CommunityPosts
            .Include(cp => cp.Post)
            .ThenInclude(p => p.AuthorUser)
            .Where(cp => cp.CommunityId == communityId && cp.Post.Status == "Published")
            .OrderByDescending(cp => cp.IsPinned)
            .ThenByDescending(cp => cp.Post.PublishedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<int> GetPinnedPostsCountAsync(int communityId)
    {
        return await _db.CommunityPosts
            .Where(cp => cp.CommunityId == communityId && cp.IsPinned)
            .CountAsync();
    }
}
