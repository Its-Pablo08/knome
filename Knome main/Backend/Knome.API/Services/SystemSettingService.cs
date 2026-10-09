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

    public const string DefaultApprovalDescription = "Require administrator approval before communities, videos and podcasts are published.";

    public SystemSettingService(KnomeDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    private async Task<bool> GetBooleanSettingAsync(string key, bool defaultValue = true)
    {
        try
        {
            var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == key);
            if (setting == null)
            {
                // If specific approval key not set, fallback to master approval setting
                if (key == RequireCommunityApprovalKey || key == RequireVideoApprovalKey || key == RequirePodcastApprovalKey)
                {
                    return await GetRequireContentAndCommunityApprovalAsync();
                }
                return defaultValue;
            }

            return !string.Equals(setting.SettingValue, "false", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error reading setting {Key} from database. Defaulting to {Default}.", key, defaultValue);
            return defaultValue;
        }
    }

    private async Task<bool> SetBooleanSettingAsync(string key, bool value, int actorUserId, string description)
    {
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
    public async Task<bool> GetRequireContentAndCommunityApprovalAsync()
    {
        try
        {
            var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == RequireApprovalKey);
            if (setting == null) return true;
            return !string.Equals(setting.SettingValue, "false", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error reading RequireContentAndCommunityApproval. Defaulting to true.");
            return true;
        }
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

    // ── Full Aggregated Settings DTO ──
    public async Task<ApprovalSettingDto> GetFullApprovalSettingsAsync()
    {
        var master = await GetRequireContentAndCommunityApprovalAsync();
        var comm = await GetRequireCommunityApprovalAsync();
        var video = await GetRequireVideoApprovalAsync();
        var pod = await GetRequirePodcastApprovalAsync();
        var msg = await GetEnableMessagingAsync();
        var email = await GetEnableEmailAsync();

        var masterRow = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == RequireApprovalKey);

        return new ApprovalSettingDto
        {
            SettingKey = RequireApprovalKey,
            RequireApproval = master,
            RequireCommunityApproval = comm,
            RequireVideoApproval = video,
            RequirePodcastApproval = pod,
            EnableMessaging = msg,
            EnableEmail = email,
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
        return dict;
    }
}
