using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class ClipRepository : IClipRepository
{
    private readonly KnomeDbContext _db;

    public ClipRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<List<Clip>> GetFeedClipsAsync(int currentUserId, int pageNumber = 1, int pageSize = 20, string? hashtag = null, long? communityId = null)
    {
        // 1. Get communities the current user has joined
        var joinedCommunityIds = await _db.CommunityMembers
            .AsNoTracking()
            .Where(m => m.UserId == currentUserId && (m.Status == "Approved" || m.Status == "Active" || m.Status == "Joined"))
            .Select(m => (long)m.CommunityId)
            .ToListAsync();

        var query = _db.Clips
            .AsNoTracking()
            .Include(c => c.CreatedByUser)
            .Include(c => c.Community)
            .Where(c => !c.IsDeleted && c.IsActive);

        // Visibility filter:
        // - Public: everyone
        // - Community: member of community or author
        // - Specific: user is mentioned in AudienceUserIds or author
        // - Draft: only author
        var userIdStr = currentUserId.ToString();

        query = query.Where(c =>
            (c.CreatedByUserId == currentUserId) ||
            (c.Status == "Published" &&
                (
                    c.Visibility == "Public" ||
                    (c.Visibility == "Community" && c.CommunityId.HasValue && joinedCommunityIds.Contains(c.CommunityId.Value)) ||
                    (c.Visibility == "Specific" && c.AudienceUserIds != null && c.AudienceUserIds.Contains(userIdStr))
                )
            )
        );

        if (communityId.HasValue && communityId.Value > 0)
        {
            query = query.Where(c => c.CommunityId == communityId.Value);
        }

        if (!string.IsNullOrWhiteSpace(hashtag))
        {
            var cleanTag = hashtag.Trim().TrimStart('#');
            query = query.Where(c => (c.Hashtags != null && c.Hashtags.Contains(cleanTag)) ||
                                     c.Title.Contains(cleanTag));
        }

        return await query
            .OrderByDescending(c => c.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Clip?> GetByIdAsync(long clipId)
    {
        return await _db.Clips
            .Include(c => c.CreatedByUser)
            .Include(c => c.Community)
            .FirstOrDefaultAsync(c => c.ClipId == clipId && !c.IsDeleted);
    }

    public async Task<List<Clip>> GetUserClipsAsync(int userId, int currentUserId, int pageNumber = 1, int pageSize = 50)
    {
        var isOwnProfile = userId == currentUserId;

        var query = _db.Clips
            .AsNoTracking()
            .Include(c => c.CreatedByUser)
            .Include(c => c.Community)
            .Where(c => c.CreatedByUserId == userId && !c.IsDeleted && c.IsActive);

        if (!isOwnProfile)
        {
            // Only published clips visible to other users
            query = query.Where(c => c.Status == "Published" && c.Visibility == "Public");
        }

        return await query
            .OrderByDescending(c => c.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Clip>> GetAllClipsForAdminAsync(int pageNumber = 1, int pageSize = 50, string? search = null, string? status = null)
    {
        var query = _db.Clips
            .AsNoTracking()
            .Include(c => c.CreatedByUser)
            .Include(c => c.Community)
            .Where(c => !c.IsDeleted);

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            query = query.Where(c => c.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            query = query.Where(c => c.Title.Contains(s) ||
                                     (c.Description != null && c.Description.Contains(s)) ||
                                     (c.Hashtags != null && c.Hashtags.Contains(s)) ||
                                     (c.CreatedByUser != null && c.CreatedByUser.FullName.Contains(s)));
        }

        return await query
            .OrderByDescending(c => c.CreatedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<int> GetAdminClipsCountAsync(string? search = null, string? status = null)
    {
        var query = _db.Clips.AsNoTracking().Where(c => !c.IsDeleted);

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            query = query.Where(c => c.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            query = query.Where(c => c.Title.Contains(s) ||
                                     (c.Description != null && c.Description.Contains(s)) ||
                                     (c.Hashtags != null && c.Hashtags.Contains(s)) ||
                                     (c.CreatedByUser != null && c.CreatedByUser.FullName.Contains(s)));
        }

        return await query.CountAsync();
    }

    public async Task<Clip> AddAsync(Clip clip)
    {
        clip.CreatedDate = DateTime.UtcNow;
        clip.UpdatedDate = DateTime.UtcNow;
        _db.Clips.Add(clip);
        await _db.SaveChangesAsync();
        return clip;
    }

    public async Task UpdateAsync(Clip clip)
    {
        clip.UpdatedDate = DateTime.UtcNow;
        _db.Clips.Update(clip);
        await _db.SaveChangesAsync();
    }

    public async Task<bool> SoftDeleteAsync(long clipId, int deletedByUserId)
    {
        var clip = await _db.Clips.FirstOrDefaultAsync(c => c.ClipId == clipId);
        if (clip == null) return false;

        clip.IsDeleted = true;
        clip.IsActive = false;
        clip.Status = "Removed";
        clip.UpdatedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task IncrementViewCountAsync(long clipId)
    {
        var clip = await _db.Clips.FirstOrDefaultAsync(c => c.ClipId == clipId);
        if (clip != null)
        {
            clip.ViewCount += 1;
            await _db.SaveChangesAsync();
        }
    }

    public async Task IncrementShareCountAsync(long clipId)
    {
        var clip = await _db.Clips.FirstOrDefaultAsync(c => c.ClipId == clipId);
        if (clip != null)
        {
            clip.SharesCount += 1;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<ClipShare> AddShareAsync(ClipShare share)
    {
        share.CreatedDate = DateTime.UtcNow;
        _db.ClipShares.Add(share);
        await _db.SaveChangesAsync();
        return share;
    }

    public async Task<bool> IsLikedByUserAsync(long clipId, int userId)
    {
        return await _db.Reactions
            .AsNoTracking()
            .AnyAsync(r => r.ContentType == ContentTypes.Clip && r.ContentId == clipId && r.UserId == userId);
    }

    public async Task<bool> IsBookmarkedByUserAsync(long clipId, int userId)
    {
        return await _db.Bookmarks
            .AsNoTracking()
            .AnyAsync(b => b.ContentType == ContentTypes.Clip && b.ContentId == clipId && b.UserId == userId);
    }

    public async Task<Dictionary<long, bool>> GetLikedClipsMapAsync(IEnumerable<long> clipIds, int userId)
    {
        var ids = clipIds.Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<long, bool>();

        var likedIds = await _db.Reactions
            .AsNoTracking()
            .Where(r => r.ContentType == ContentTypes.Clip && ids.Contains(r.ContentId) && r.UserId == userId)
            .Select(r => r.ContentId)
            .ToListAsync();

        var set = new HashSet<long>(likedIds);
        return ids.ToDictionary(id => id, id => set.Contains(id));
    }

    public async Task<Dictionary<long, bool>> GetBookmarkedClipsMapAsync(IEnumerable<long> clipIds, int userId)
    {
        var ids = clipIds.Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<long, bool>();

        var bookmarkedIds = await _db.Bookmarks
            .AsNoTracking()
            .Where(b => b.ContentType == ContentTypes.Clip && ids.Contains(b.ContentId) && b.UserId == userId)
            .Select(b => b.ContentId)
            .ToListAsync();

        var set = new HashSet<long>(bookmarkedIds);
        return ids.ToDictionary(id => id, id => set.Contains(id));
    }
}
