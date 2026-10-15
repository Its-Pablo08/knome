using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Knome.API.Data;
using Knome.API.DTOs.Settings;
using Knome.API.Interfaces;
using Knome.API.Models;

namespace Knome.API.Services;

public class SystemSettingService : ISystemSettingService
{
    private readonly KnomeDbContext _db;
    private readonly IAuditLogService _auditLogService;

    public const string RequireApprovalKey = "RequireContentAndCommunityApproval";
    public const string RequireCommunityApprovalKey = "RequireCommunityApproval";
    public const string RequireVideoApprovalKey = "RequireVideoApproval";
    public const string RequirePodcastApprovalKey = "RequirePodcastApproval";
    public const string EnableMessagingKey = "EnableMessaging";
    public const string EnableEmailKey = "EnableEmail";
    public const string EnablePostsKey = "EnablePosts";
    public const string EnableArticlesKey = "EnableArticles";
    public const string EnableClipsKey = "EnableClips";
    public const string EnableWikiKey = "EnableWiki";
    public const string EnableVideosKey = "EnableVideos";
    public const string EnablePodcastsKey = "EnablePodcasts";

    public const string DefaultApprovalDescription = "Require administrator approval before communities, videos and podcasts are published.";

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, (bool Value, DateTime Expiration)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(30);

    public static void InvalidateCache() => _cache.Clear();

    public SystemSettingService(KnomeDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    private async Task<bool> GetBooleanSettingAsync(string key, bool defaultValue = true)
    {
        if (_cache.TryGetValue(key, out var entry) && entry.Expiration > DateTime.UtcNow)
        {
            return entry.Value;
        }

        try
        {
            var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == key);
            bool result;
            if (setting == null)
            {
                // If specific approval key not set, fallback to master approval setting
                if (key == RequireCommunityApprovalKey || key == RequireVideoApprovalKey || key == RequirePodcastApprovalKey)
                {
                    result = await GetRequireContentAndCommunityApprovalAsync();
                }
                else
                {
                    result = defaultValue;
                }
            }
            else
            {
                result = !string.Equals(setting.SettingValue, "false", StringComparison.OrdinalIgnoreCase);
            }

            _cache[key] = (result, DateTime.UtcNow.Add(CacheDuration));
            return result;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error reading setting {Key} from database. Defaulting to {Default}.", key, defaultValue);
            return defaultValue;
        }
    }

    private async Task<bool> SetBooleanSettingAsync(string key, bool value, int actorUserId, string description)
    {
        _cache.Clear();
        var stringVal = value ? "true" : "false";
        var existing = await _db.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == key);
        var oldVal = existing?.SettingValue ?? (value ? "false" : "true");

        if (existing == null)
        {
            existing = new SystemSetting
            {
                SettingKey = key,
                SettingValue = stringVal,
                Description = description,
                UpdatedDate = Knome.API.Common.KnomeTime.Now,
                UpdatedByUserId = actorUserId > 0 ? actorUserId : null
            };
            _db.SystemSettings.Add(existing);
        }
        else
        {
            existing.SettingValue = stringVal;
            existing.Description = description;
            existing.UpdatedDate = Knome.API.Common.KnomeTime.Now;
            existing.UpdatedByUserId = actorUserId > 0 ? actorUserId : null;
        }

        await _db.SaveChangesAsync();

        // Audit Trail
        try
        {
            await _auditLogService.RecordAsync(
                actorUserId > 0 ? actorUserId : 1,
                "UpdateSetting",
                "SystemSetting",
                1,
                reason: $"System Setting '{key}' changed from {(oldVal == "false" ? "OFF" : "ON")} to {(value ? "ON" : "OFF")}"
            );
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to record audit log for setting {Key}", key);
        }

        return value;
    }

    // ── Master Setting ──
    public Task<bool> GetRequireContentAndCommunityApprovalAsync()
    {
        return GetBooleanSettingAsync(RequireApprovalKey, true);
    }

    public async Task<bool> SetRequireContentAndCommunityApprovalAsync(bool requireApproval, int actorUserId)
    {
        return await SetBooleanSettingAsync(
            RequireApprovalKey,
            requireApproval,
            actorUserId,
            DefaultApprovalDescription
        );
    }

    // ── Community Approval ──
    public Task<bool> GetRequireCommunityApprovalAsync()
    {
        return GetBooleanSettingAsync(RequireCommunityApprovalKey, true);
    }

    public Task<bool> SetRequireCommunityApprovalAsync(bool requireApproval, int actorUserId)
    {
        return SetBooleanSettingAsync(
            RequireCommunityApprovalKey,
            requireApproval,
            actorUserId,
            "Require administrator approval before communities are published."
        );
    }

    // ── Video Approval ──
    public Task<bool> GetRequireVideoApprovalAsync()
    {
        return GetBooleanSettingAsync(RequireVideoApprovalKey, true);
    }

    public Task<bool> SetRequireVideoApprovalAsync(bool requireApproval, int actorUserId)
    {
        return SetBooleanSettingAsync(
            RequireVideoApprovalKey,
            requireApproval,
            actorUserId,
            "Require administrator approval before user videos are published."
        );
    }

    // ── Podcast Approval ──
    public Task<bool> GetRequirePodcastApprovalAsync()
    {
        return GetBooleanSettingAsync(RequirePodcastApprovalKey, true);
    }

    public Task<bool> SetRequirePodcastApprovalAsync(bool requireApproval, int actorUserId)
    {
        return SetBooleanSettingAsync(
            RequirePodcastApprovalKey,
            requireApproval,
            actorUserId,
            "Require administrator approval before user podcasts are published."
        );
    }

    // ── Messaging ──
    public Task<bool> GetEnableMessagingAsync()
    {
        return GetBooleanSettingAsync(EnableMessagingKey, true);
    }

    public Task<bool> SetEnableMessagingAsync(bool enabled, int actorUserId)
    {
        return SetBooleanSettingAsync(
            EnableMessagingKey,
            enabled,
            actorUserId,
            "Enable direct user-to-user messaging and chat channels across the platform."
        );
    }

    // ── Email ──
    public Task<bool> GetEnableEmailAsync()
    {
        return GetBooleanSettingAsync(EnableEmailKey, true);
    }

    public Task<bool> SetEnableEmailAsync(bool enabled, int actorUserId)
    {
        return SetBooleanSettingAsync(
            EnableEmailKey,
            enabled,
            actorUserId,
            "Enable outgoing email dispatch and notification services."
        );
    }

    // ── Posts ──
    public Task<bool> GetEnablePostsAsync() => GetBooleanSettingAsync(EnablePostsKey, true);
    public Task<bool> SetEnablePostsAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnablePostsKey, enabled, actorUserId, "Enable posts feed, status sharing, and discussions.");

    // ── Articles ──
    public Task<bool> GetEnableArticlesAsync() => GetBooleanSettingAsync(EnableArticlesKey, true);
    public Task<bool> SetEnableArticlesAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnableArticlesKey, enabled, actorUserId, "Enable technical articles, categories, and publications.");

    // ── Clips ──
    public Task<bool> GetEnableClipsAsync() => GetBooleanSettingAsync(EnableClipsKey, true);
    public Task<bool> SetEnableClipsAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnableClipsKey, enabled, actorUserId, "Enable short-form video clips and reels.");

    // ── Wiki ──
    public Task<bool> GetEnableWikiAsync() => GetBooleanSettingAsync(EnableWikiKey, true);
    public Task<bool> SetEnableWikiAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnableWikiKey, enabled, actorUserId, "Enable knowledge base wiki documentation and hierarchies.");

    // ── Videos ──
    public Task<bool> GetEnableVideosAsync() => GetBooleanSettingAsync(EnableVideosKey, true);
    public Task<bool> SetEnableVideosAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnableVideosKey, enabled, actorUserId, "Enable enterprise video media portal and streaming.");

    // ── Podcasts ──
    public Task<bool> GetEnablePodcastsAsync() => GetBooleanSettingAsync(EnablePodcastsKey, true);
    public Task<bool> SetEnablePodcastsAsync(bool enabled, int actorUserId) => SetBooleanSettingAsync(EnablePodcastsKey, enabled, actorUserId, "Enable audio podcast series, episodes, and streaming.");

    public async Task EnsureFeatureEnabledAsync(string featureKey, string featureDisplayName)
    {
        var isEnabled = await GetBooleanSettingAsync(featureKey, true);
        if (!isEnabled)
        {
            throw new Knome.API.Exceptions.ForbiddenException($"The {featureDisplayName} module is currently disabled by administrator.");
        }
    }

    // ── Full Aggregated Settings DTO ──
    public async Task<ApprovalSettingDto> GetFullApprovalSettingsAsync()
    {
        var allSettings = await _db.SystemSettings.AsNoTracking().ToListAsync();
        var map = allSettings.ToDictionary(s => s.SettingKey, s => s, StringComparer.OrdinalIgnoreCase);

        bool parseSetting(string key, bool defaultVal)
        {
            if (map.TryGetValue(key, out var s) && !string.IsNullOrWhiteSpace(s.SettingValue))
            {
                var val = !string.Equals(s.SettingValue, "false", StringComparison.OrdinalIgnoreCase);
                _cache[key] = (val, DateTime.UtcNow.Add(CacheDuration));
                return val;
            }
            _cache[key] = (defaultVal, DateTime.UtcNow.Add(CacheDuration));
            return defaultVal;
        }

        var master = parseSetting(RequireApprovalKey, true);
        var comm = map.ContainsKey(RequireCommunityApprovalKey) ? parseSetting(RequireCommunityApprovalKey, true) : master;
        var video = map.ContainsKey(RequireVideoApprovalKey) ? parseSetting(RequireVideoApprovalKey, true) : master;
        var pod = map.ContainsKey(RequirePodcastApprovalKey) ? parseSetting(RequirePodcastApprovalKey, true) : master;
        var msg = parseSetting(EnableMessagingKey, true);
        var email = parseSetting(EnableEmailKey, true);
        var posts = parseSetting(EnablePostsKey, true);
        var articles = parseSetting(EnableArticlesKey, true);
        var clips = parseSetting(EnableClipsKey, true);
        var wiki = parseSetting(EnableWikiKey, true);
        var videos = parseSetting(EnableVideosKey, true);
        var podcasts = parseSetting(EnablePodcastsKey, true);

        map.TryGetValue(RequireApprovalKey, out var masterRow);

        return new ApprovalSettingDto
        {
            SettingKey = RequireApprovalKey,
            RequireApproval = master,
            RequireCommunityApproval = comm,
            RequireVideoApproval = video,
            RequirePodcastApproval = pod,
            EnableMessaging = msg,
            EnableEmail = email,
            EnablePosts = posts,
            EnableArticles = articles,
            EnableClips = clips,
            EnableWiki = wiki,
            EnableVideos = videos,
            EnablePodcasts = podcasts,
            Description = DefaultApprovalDescription,
            UpdatedDate = masterRow?.UpdatedDate ?? Knome.API.Common.KnomeTime.Now,
            UpdatedByUserId = masterRow?.UpdatedByUserId
        };
    }

    public async Task<ApprovalSettingDto> UpdateApprovalSettingsAsync(UpdateApprovalSettingDto updateDto, int actorUserId)
    {
        if (updateDto.RequireApproval.HasValue)
        {
            await SetRequireContentAndCommunityApprovalAsync(updateDto.RequireApproval.Value, actorUserId);
        }
        if (updateDto.RequireCommunityApproval.HasValue)
        {
            await SetRequireCommunityApprovalAsync(updateDto.RequireCommunityApproval.Value, actorUserId);
        }
        if (updateDto.RequireVideoApproval.HasValue)
        {
            await SetRequireVideoApprovalAsync(updateDto.RequireVideoApproval.Value, actorUserId);
        }
        if (updateDto.RequirePodcastApproval.HasValue)
        {
            await SetRequirePodcastApprovalAsync(updateDto.RequirePodcastApproval.Value, actorUserId);
        }
        if (updateDto.EnableMessaging.HasValue)
        {
            await SetEnableMessagingAsync(updateDto.EnableMessaging.Value, actorUserId);
        }
        if (updateDto.EnableEmail.HasValue)
        {
            await SetEnableEmailAsync(updateDto.EnableEmail.Value, actorUserId);
        }

        // Feature Modules
        if (updateDto.EnablePosts.HasValue)
        {
            await SetEnablePostsAsync(updateDto.EnablePosts.Value, actorUserId);
        }
        if (updateDto.EnableArticles.HasValue)
        {
            await SetEnableArticlesAsync(updateDto.EnableArticles.Value, actorUserId);
        }
        if (updateDto.EnableClips.HasValue)
        {
            await SetEnableClipsAsync(updateDto.EnableClips.Value, actorUserId);
        }
        if (updateDto.EnableWiki.HasValue)
        {
            await SetEnableWikiAsync(updateDto.EnableWiki.Value, actorUserId);
        }
        if (updateDto.EnableVideos.HasValue)
        {
            await SetEnableVideosAsync(updateDto.EnableVideos.Value, actorUserId);
        }
        if (updateDto.EnablePodcasts.HasValue)
        {
            await SetEnablePodcastsAsync(updateDto.EnablePodcasts.Value, actorUserId);
        }

        return await GetFullApprovalSettingsAsync();
    }

    public async Task<string?> GetSettingAsync(string key)
    {
        var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == key);
        return setting?.SettingValue;
    }

    public async Task SetSettingAsync(string key, string value, int actorUserId, string? description = null)
    {
        var existing = await _db.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == key);
        if (existing == null)
        {
            existing = new SystemSetting
            {
                SettingKey = key,
                SettingValue = value,
                Description = description,
                UpdatedDate = Knome.API.Common.KnomeTime.Now,
                UpdatedByUserId = actorUserId > 0 ? actorUserId : null
            };
            _db.SystemSettings.Add(existing);
        }
        else
        {
            existing.SettingValue = value;
            if (description != null) existing.Description = description;
            existing.UpdatedDate = Knome.API.Common.KnomeTime.Now;
            existing.UpdatedByUserId = actorUserId > 0 ? actorUserId : null;
        }
        await _db.SaveChangesAsync();
    }

    public async Task<Dictionary<string, string>> GetAllSettingsAsync()
    {
        var list = await _db.SystemSettings.AsNoTracking().ToListAsync();
        var dict = list.ToDictionary(s => s.SettingKey, s => s.SettingValue);
        if (!dict.ContainsKey(RequireApprovalKey)) dict[RequireApprovalKey] = "true";
        if (!dict.ContainsKey(RequireCommunityApprovalKey)) dict[RequireCommunityApprovalKey] = "true";
        if (!dict.ContainsKey(RequireVideoApprovalKey)) dict[RequireVideoApprovalKey] = "true";
        if (!dict.ContainsKey(RequirePodcastApprovalKey)) dict[RequirePodcastApprovalKey] = "true";
        if (!dict.ContainsKey(EnableMessagingKey)) dict[EnableMessagingKey] = "true";
        if (!dict.ContainsKey(EnableEmailKey)) dict[EnableEmailKey] = "true";
        if (!dict.ContainsKey(EnablePostsKey)) dict[EnablePostsKey] = "true";
        if (!dict.ContainsKey(EnableArticlesKey)) dict[EnableArticlesKey] = "true";
        if (!dict.ContainsKey(EnableClipsKey)) dict[EnableClipsKey] = "true";
        if (!dict.ContainsKey(EnableWikiKey)) dict[EnableWikiKey] = "true";
        if (!dict.ContainsKey(EnableVideosKey)) dict[EnableVideosKey] = "true";
        if (!dict.ContainsKey(EnablePodcastsKey)) dict[EnablePodcastsKey] = "true";
        return dict;
    }
}
