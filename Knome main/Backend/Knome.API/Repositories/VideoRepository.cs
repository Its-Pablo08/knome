using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class VideoRepository : IVideoRepository
{
    private readonly KnomeDbContext _db;

    public VideoRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<Video?> GetVideoByIdAsync(long videoId)
    {
        return await _db.Videos
            .AsNoTracking()
            .Include(v => v.UploaderUser)
            .Include(v => v.Category)
            .Include(v => v.VideoTags)
            .FirstOrDefaultAsync(v => v.VideoId == videoId);
    }

    public async Task<List<Video>> GetVideosAsync(int? categoryId, string? tag, string? search, int pageNumber, int pageSize)
    {
        var query = _db.Videos
            .AsNoTracking()
            .Include(v => v.UploaderUser)
            .Include(v => v.Category)
            .Include(v => v.VideoTags)
            .AsQueryable();

        if (categoryId.HasValue)
            query = query.Where(v => v.CategoryId == categoryId.Value);

        if (!string.IsNullOrWhiteSpace(tag))
            query = query.Where(v => v.VideoTags.Any(t => t.Tag == tag));

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(v => v.Title.Contains(search) || (v.Description != null && v.Description.Contains(search)));

        return await query
            .OrderByDescending(v => v.UploadedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Video>> GetMyVideosAsync(int uploaderUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await _db.Videos
            .AsNoTracking()
            .Include(v => v.UploaderUser)
            .Include(v => v.Category)
            .Include(v => v.VideoTags)
            .Where(v => v.UploaderUserId == uploaderUserId)
            .OrderByDescending(v => v.UploadedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Video> AddVideoAsync(Video video, List<string> tags)
    {
        _db.Videos.Add(video);
        await _db.SaveChangesAsync();

        foreach (var t in tags.Distinct())
        {
            if (!string.IsNullOrWhiteSpace(t))
            {
                _db.VideoTags.Add(new VideoTag { VideoId = video.VideoId, Tag = t.Trim() });
            }
        }

        await _db.SaveChangesAsync();
        return (await GetVideoByIdAsync(video.VideoId))!;
    }

    public async Task UpdateVideoAsync(Video video, List<string> tags)
    {
        var existingTags = await _db.VideoTags.Where(vt => vt.VideoId == video.VideoId).ToListAsync();
        _db.VideoTags.RemoveRange(existingTags);

        foreach (var t in tags.Distinct())
        {
            if (!string.IsNullOrWhiteSpace(t))
            {
                _db.VideoTags.Add(new VideoTag { VideoId = video.VideoId, Tag = t.Trim() });
            }
        }

        _db.Videos.Update(video);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteVideoAsync(Video video)
    {
        var tags = await _db.VideoTags.Where(vt => vt.VideoId == video.VideoId).ToListAsync();
        _db.VideoTags.RemoveRange(tags);

        // Remove Reactions
        var reactions = await _db.Reactions.Where(r => r.ContentId == video.VideoId && r.ContentType == "Video").ToListAsync();
        _db.Reactions.RemoveRange(reactions);

        // Remove Comments
        var comments = await _db.Comments.Where(c => c.ContentId == video.VideoId && c.ContentType == "Video").ToListAsync();
        _db.Comments.RemoveRange(comments);

        // Remove Bookmarks
        var bookmarks = await _db.Bookmarks.Where(b => b.ContentId == video.VideoId && b.ContentType == "Video").ToListAsync();
        _db.Bookmarks.RemoveRange(bookmarks);

        // Remove Shares
        var shares = await _db.Shares.Where(s => s.ContentId == video.VideoId && s.ContentType == "Video").ToListAsync();
        _db.Shares.RemoveRange(shares);

        // Remove KarmaTransactions
        var karmaTx = await _db.KarmaTransactions.Where(kt => kt.RelatedContentId == video.VideoId && kt.RelatedContentType == "Video").ToListAsync();
        _db.KarmaTransactions.RemoveRange(karmaTx);

        _db.Videos.Remove(video);
        await _db.SaveChangesAsync();
    }

    public async Task IncrementViewCountAsync(long videoId)
    {
        var video = await _db.Videos.FindAsync(videoId);
        if (video != null)
        {
            video.ViewCount++;
            await _db.SaveChangesAsync();
        }
    }
}
