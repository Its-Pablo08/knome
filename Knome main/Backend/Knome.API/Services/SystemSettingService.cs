using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;

namespace Knome.API.Services;

public class SystemSettingService : ISystemSettingService
{
    private readonly KnomeDbContext _db;
    private readonly IAuditLogService _auditLogService;
    public const string RequireApprovalKey = "RequireContentAndCommunityApproval";
    public const string DefaultApprovalDescription = "Require administrator approval before communities, videos and podcasts are published.";

    public SystemSettingService(KnomeDbContext db, IAuditLogService auditLogService)
    {
        _db = db;
        _auditLogService = auditLogService;
    }

    public async Task<bool> GetRequireContentAndCommunityApprovalAsync()
    {
        try
        {
            var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == RequireApprovalKey);
            if (setting == null)
            {
                return true; // Default is ON (existing behavior)
            }

            return !string.Equals(setting.SettingValue, "false", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error reading RequireContentAndCommunityApproval setting from database. Defaulting to true.");
            return true;
        }
    }

    public async Task<bool> SetRequireContentAndCommunityApprovalAsync(bool requireApproval, int actorUserId)
    {
        var stringVal = requireApproval ? "true" : "false";
        var existing = await _db.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == RequireApprovalKey);
        var oldVal = existing?.SettingValue ?? "true";

        if (existing == null)
        {
            existing = new SystemSetting
            {
                SettingKey = RequireApprovalKey,
                SettingValue = stringVal,
                Description = DefaultApprovalDescription,
                UpdatedDate = Knome.API.Common.KnomeTime.Now,
                UpdatedByUserId = actorUserId > 0 ? actorUserId : null
            };
            _db.SystemSettings.Add(existing);
        }
        else
        {
            existing.SettingValue = stringVal;
            existing.UpdatedDate = Knome.API.Common.KnomeTime.Now;
            existing.UpdatedByUserId = actorUserId > 0 ? actorUserId : null;
        }

        await _db.SaveChangesAsync();

        // Audit Log
        try
        {
            await _auditLogService.RecordAsync(
                actorUserId > 0 ? actorUserId : 1,
                "UpdateSetting",
                "SystemSetting",
                1,
                reason: $"Content & Community Approval changed from {(oldVal == "false" ? "OFF" : "ON")} to {(requireApproval ? "ON" : "OFF")}"
            );
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to record audit log for approval setting update");
        }

        return requireApproval;
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
        if (!dict.ContainsKey(RequireApprovalKey))
        {
            dict[RequireApprovalKey] = "true";
        }
        return dict;
    }
}
