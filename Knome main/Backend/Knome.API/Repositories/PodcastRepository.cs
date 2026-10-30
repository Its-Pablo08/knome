using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class PodcastRepository : IPodcastRepository
{
    private readonly KnomeDbContext _db;

    public PodcastRepository(KnomeDbContext db)
    {
        _db = db;
    }

    // --- Series ---
    public async Task<PodcastSeries?> GetSeriesByIdAsync(int seriesId)
    {
        return await _db.PodcastSeries
            .AsNoTracking()
            .Include(s => s.Podcasts.Where(p => p.IsActive))
            .FirstOrDefaultAsync(s => s.SeriesId == seriesId);
    }

    public async Task<List<PodcastSeries>> GetAllSeriesAsync()
    {
        return await _db.PodcastSeries
            .AsNoTracking()
            .Include(s => s.Podcasts.Where(p => p.IsActive))
            .OrderBy(s => s.Title)
            .ToListAsync();
    }

    public async Task<PodcastSeries> AddSeriesAsync(PodcastSeries series)
    {
        _db.PodcastSeries.Add(series);
        await _db.SaveChangesAsync();
        return series;
    }

    public async Task UpdateSeriesAsync(PodcastSeries series)
    {
        _db.PodcastSeries.Update(series);
        await _db.SaveChangesAsync();
    }

    public async Task DeleteSeriesAsync(PodcastSeries series)
    {
        // If series has episodes, either detach or remove depending on constraints. Since SeriesId is nullable in Podcast, let's null out SeriesId on remaining podcasts
        var podcasts = await _db.Podcasts.Where(p => p.SeriesId == series.SeriesId).ToListAsync();
        foreach (var p in podcasts)
        {
            p.SeriesId = null;
        }
        await _db.SaveChangesAsync();

        _db.PodcastSeries.Remove(series);
        await _db.SaveChangesAsync();
    }

    // --- Episodes ---
    public async Task<Podcast?> GetPodcastByIdAsync(long podcastId)
    {
        return await _db.Podcasts
            .AsNoTracking()
            .Include(p => p.UploaderUser)
            .Include(p => p.Category)
            .Include(p => p.Series)
            .FirstOrDefaultAsync(p => p.PodcastId == podcastId);
    }

    public async Task<List<Podcast>> GetPodcastsAsync(int? seriesId, int? categoryId, string? search, int pageNumber, int pageSize)
    {
        var query = _db.Podcasts
            .AsNoTracking()
            .Include(p => p.UploaderUser)
            .Include(p => p.Category)
            .Include(p => p.Series)
            .Where(p => p.IsActive)
            .AsQueryable();

        if (seriesId.HasValue)
            query = query.Where(p => p.SeriesId == seriesId.Value);

        if (categoryId.HasValue)
            query = query.Where(p => p.CategoryId == categoryId.Value);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p => p.Title.Contains(search) || (p.Description != null && p.Description.Contains(search)));

        return await query
            .OrderByDescending(p => p.UploadedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<List<Podcast>> GetMyPodcastsAsync(int uploaderUserId, int pageNumber = 1, int pageSize = 20)
    {
        return await _db.Podcasts
            .AsNoTracking()
            .Include(p => p.UploaderUser)
            .Include(p => p.Category)
            .Include(p => p.Series)
            .Where(p => p.UploaderUserId == uploaderUserId && p.IsActive)
            .OrderByDescending(p => p.UploadedDate)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public async Task<Podcast> AddPodcastAsync(Podcast podcast)
    {
        podcast.IsActive = true;
        _db.Podcasts.Add(podcast);
        await _db.SaveChangesAsync();
        return (await GetPodcastByIdAsync(podcast.PodcastId))!;
    }

    public async Task UpdatePodcastAsync(Podcast podcast)
    {
        _db.Podcasts.Update(podcast);
        await _db.SaveChangesAsync();
    }

    public async Task DeletePodcastAsync(Podcast podcast)
    {
        podcast.IsActive = false;
        _db.Podcasts.Update(podcast);
        await _db.SaveChangesAsync();
    }

    public async Task<int> IncrementViewCountAsync(long podcastId)
    {
        var podcast = await _db.Podcasts.FindAsync(podcastId);
        if (podcast != null)
        {
            podcast.ViewCount++;
            await _db.SaveChangesAsync();
            return podcast.ViewCount;
        }
        return 0;
    }
}
