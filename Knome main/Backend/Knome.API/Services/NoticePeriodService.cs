using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Knome.API.Data;
using Knome.API.DTOs.Settings;
using Knome.API.Exceptions;
using Knome.API.Hubs;
using Knome.API.Interfaces;
using Knome.API.Models;

namespace Knome.API.Services;

public class NoticePeriodService : INoticePeriodService
{
    public const string NoticePeriodConfigKey = "NoticePeriodConfig";

    private readonly KnomeDbContext _db;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly IAuditLogService _auditLogService;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public NoticePeriodService(
        KnomeDbContext db,
        IHubContext<NotificationHub> hubContext,
        IAuditLogService auditLogService)
    {
        _db = db;
        _hubContext = hubContext;
        _auditLogService = auditLogService;
    }

    public static string NormalizeKey(string? val)
    {
        if (string.IsNullOrWhiteSpace(val)) return string.Empty;
        var trimmed = val.Trim().ToUpperInvariant();
        if (trimmed.StartsWith("MPO") || trimmed.StartsWith("MP0"))
        {
            return "MPO" + trimmed.Substring(3);
        }
        return trimmed;
    }

    public async Task<NoticePeriodConfigDto> GetConfigAsync()
    {
        var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.SettingKey == NoticePeriodConfigKey);
        if (setting == null || string.IsNullOrWhiteSpace(setting.SettingValue))
        {
            return new NoticePeriodConfigDto { IsEnabled = true };
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<NoticePeriodConfigDto>(setting.SettingValue, JsonOpts);
            return parsed ?? new NoticePeriodConfigDto { IsEnabled = true };
        }
        catch
        {
            return new NoticePeriodConfigDto { IsEnabled = true };
        }
    }

    private async Task SaveConfigInternalAsync(NoticePeriodConfigDto config, int actorUserId, string description)
    {
        var json = JsonSerializer.Serialize(config, JsonOpts);
        var existing = await _db.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == NoticePeriodConfigKey);
        if (existing == null)
        {
            existing = new SystemSetting
            {
                SettingKey = NoticePeriodConfigKey,
                SettingValue = json,
                Description = description,
                UpdatedDate = Knome.API.Common.KnomeTime.Now,
                UpdatedByUserId = actorUserId > 0 ? actorUserId : null
            };
            _db.SystemSettings.Add(existing);
        }
        else
        {
            existing.SettingValue = json;
            existing.Description = description;
            existing.UpdatedDate = Knome.API.Common.KnomeTime.Now;
            existing.UpdatedByUserId = actorUserId > 0 ? actorUserId : null;
        }

        await _db.SaveChangesAsync();

        try
        {
            await _hubContext.Clients.All.SendAsync("NoticePeriodUpdated", config);
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to broadcast NoticePeriodUpdated via NotificationHub.");
        }
    }

    public async Task<NoticePeriodConfigDto> SetPolicyEnabledAsync(bool isEnabled, int actorUserId)
    {
        var config = await GetConfigAsync();
        config.IsEnabled = isEnabled;

        var desc = isEnabled 
            ? "Notice Period Post-Scheduling Guard enabled by HR Admin." 
            : "Notice Period Post-Scheduling Guard disabled by HR Admin.";

        await SaveConfigInternalAsync(config, actorUserId, desc);
        await _auditLogService.RecordAsync(
            actorUserId, 
            isEnabled ? "Enable Notice Period Guard" : "Disable Notice Period Guard", 
            "SystemSetting", 
            0, 
            desc);

        return config;
    }

    public async Task<NoticePeriodConfigDto> ToggleEmployeeNoticeAsync(ToggleEmployeeNoticeDto dto, int actorUserId)
    {
        var config = await GetConfigAsync();
        if (config.Employees == null) config.Employees = new(StringComparer.OrdinalIgnoreCase);

        // Resolve user from DB if possible
        User? dbUser = null;
        if (dto.UserId.HasValue && dto.UserId.Value > 0)
        {
            dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == dto.UserId.Value);
        }
        else if (!string.IsNullOrWhiteSpace(dto.EmployeeId))
        {
            var empIdNorm = NormalizeKey(dto.EmployeeId);
            dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.EmployeeId == dto.EmployeeId || u.EmployeeId == empIdNorm);
        }
        else if (!string.IsNullOrWhiteSpace(dto.Email))
        {
            var emailLower = dto.Email.Trim().ToLowerInvariant();
            dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower);
        }

        var effectiveUid = dbUser?.UserId ?? dto.UserId ?? 0;
        var effectiveEmpId = dbUser?.EmployeeId ?? dto.EmployeeId ?? string.Empty;
        var effectiveEmail = dbUser?.Email ?? dto.Email ?? string.Empty;
        var effectiveName = dbUser?.FullName ?? dto.Name ?? "Employee";

        var empKey = NormalizeKey(effectiveEmpId);
        var uidKey = effectiveUid > 0 ? effectiveUid.ToString() : string.Empty;

        // Check if currently marked
        bool isCurrentlyMarked = false;
        if (!string.IsNullOrEmpty(empKey) && config.Employees.ContainsKey(empKey)) isCurrentlyMarked = true;
        if (!string.IsNullOrEmpty(uidKey) && config.Employees.ContainsKey(uidKey)) isCurrentlyMarked = true;
        if (!isCurrentlyMarked && dbUser != null)
        {
            isCurrentlyMarked = IsUserMatchedInNotice(dbUser, config);
        }

        bool targetMark = dto.IsMarked.HasValue ? dto.IsMarked.Value : !isCurrentlyMarked;

        if (targetMark)
        {
            // Mark in notice
            var actorUser = actorUserId > 0 ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == actorUserId) : null;
            var record = new NoticePeriodEmployeeDto
            {
                PrimaryKey = !string.IsNullOrEmpty(empKey) ? empKey : (!string.IsNullOrEmpty(uidKey) ? uidKey : $"USER_{DateTime.UtcNow.Ticks}"),
                EmployeeId = effectiveEmpId,
                UserId = effectiveUid > 0 ? effectiveUid : null,
                Id = effectiveUid > 0 ? effectiveUid : null,
                Name = effectiveName,
                FullName = effectiveName,
                Email = effectiveEmail,
                Designation = dbUser?.Designation ?? dto.Designation ?? "Staff Member",
                Department = dto.Department ?? "General",
                Role = dto.Role ?? "Employee",
                MarkedAt = DateTime.UtcNow,
                MarkedBy = actorUser?.FullName ?? "HR Administrator",
                MarkedByRole = "HR Admin",
                NoticeDays = dto.NoticeDays ?? 30,
                Reason = dto.Reason ?? "Notice Period Registered",
                DisablePostScheduling = true,
                Status = "In Notice Period"
            };

            if (!string.IsNullOrEmpty(empKey)) config.Employees[empKey] = record;
            if (!string.IsNullOrEmpty(uidKey)) config.Employees[uidKey] = record;
            if (effectiveUid > 0 && !config.Employees.ContainsKey(effectiveUid.ToString()))
            {
                config.Employees[effectiveUid.ToString()] = record;
            }

            await SaveConfigInternalAsync(config, actorUserId, $"Marked {effectiveName} as In Notice Period (post scheduling disabled).");
            await _auditLogService.RecordAsync(
                actorUserId, 
                "Notice Period Assigned", 
                "User", 
                effectiveUid, 
                $"Employee {effectiveName} ({effectiveEmpId}) marked In Notice Period. Post scheduling disabled.");
        }
        else
        {
            // Unmark from notice
            var keysToRemove = new List<string>();
            foreach (var kvp in config.Employees)
            {
                var emp = kvp.Value;
                if (emp == null) continue;
                bool match = false;
                if (!string.IsNullOrEmpty(empKey) && NormalizeKey(emp.EmployeeId) == empKey) match = true;
                if (effectiveUid > 0 && (emp.UserId == effectiveUid || emp.Id == effectiveUid)) match = true;
                if (!string.IsNullOrEmpty(effectiveEmail) && (emp.Email ?? "").Trim().ToLowerInvariant() == effectiveEmail.Trim().ToLowerInvariant()) match = true;
                if (NormalizeKey(kvp.Key) == empKey || kvp.Key == uidKey) match = true;

                if (match) keysToRemove.Add(kvp.Key);
            }

            foreach (var k in keysToRemove)
            {
                config.Employees.Remove(k);
            }

            await SaveConfigInternalAsync(config, actorUserId, $"Removed {effectiveName} from Notice Period (post scheduling restored).");
            await _auditLogService.RecordAsync(
                actorUserId, 
                "Notice Period Revoked", 
                "User", 
                effectiveUid, 
                $"Employee {effectiveName} ({effectiveEmpId}) removed from Notice Period. Post scheduling restored.");
        }

        return config;
    }

    public async Task<bool> IsUserInNoticePeriodAsync(int userId)
    {
        if (userId <= 0) return false;
        var config = await GetConfigAsync();
        if (!config.IsEnabled) return false;

        var uidStr = userId.ToString();
        if (config.Employees != null && config.Employees.ContainsKey(uidStr)) return true;

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null) return false;

        return IsUserMatchedInNotice(user, config);
    }

    public async Task<bool> IsUserInNoticePeriodAsync(string employeeIdOrEmail)
    {
        if (string.IsNullOrWhiteSpace(employeeIdOrEmail)) return false;
        var config = await GetConfigAsync();
        if (!config.IsEnabled) return false;

        var norm = NormalizeKey(employeeIdOrEmail);
        if (config.Employees != null && config.Employees.ContainsKey(norm)) return true;

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => 
            u.EmployeeId == employeeIdOrEmail || 
            u.EmployeeId == norm || 
            u.Email.ToLower() == employeeIdOrEmail.ToLower());

        if (user == null) return false;

        return IsUserMatchedInNotice(user, config);
    }

    public async Task EnsureCanSchedulePostAsync(int userId)
    {
        var inNotice = await IsUserInNoticePeriodAsync(userId);
        if (inNotice)
        {
            throw new BadRequestException("Post scheduling is disabled while in Notice Period.");
        }
    }

    public async Task<NoticePeriodStatusResultDto> CheckUserNoticeStatusAsync(int userId)
    {
        var inNotice = await IsUserInNoticePeriodAsync(userId);
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId);

        return new NoticePeriodStatusResultDto
        {
            UserId = userId,
            EmployeeId = user?.EmployeeId ?? string.Empty,
            InNoticePeriod = inNotice,
            DisablePostScheduling = inNotice,
            Status = inNotice ? "In Notice Period" : "Standard Active"
        };
    }

    private static bool IsUserMatchedInNotice(User user, NoticePeriodConfigDto config)
    {
        if (config.Employees == null || config.Employees.Count == 0) return false;

        var empIdNorm = NormalizeKey(user.EmployeeId);
        var emailNorm = (user.Email ?? string.Empty).Trim().ToLowerInvariant();
        var nameNorm = (user.FullName ?? string.Empty).Trim().ToLowerInvariant();
        var uid = user.UserId;

        foreach (var kvp in config.Employees)
        {
            var emp = kvp.Value;
            if (emp == null) continue;

            if (emp.UserId.HasValue && emp.UserId.Value == uid) return true;
            if (emp.Id.HasValue && emp.Id.Value == uid) return true;

            if (!string.IsNullOrEmpty(empIdNorm) && NormalizeKey(emp.EmployeeId) == empIdNorm) return true;

            if (!string.IsNullOrEmpty(emailNorm) && (emp.Email ?? string.Empty).Trim().ToLowerInvariant() == emailNorm) return true;

            if (!string.IsNullOrEmpty(nameNorm) && nameNorm.Length > 2 && (emp.FullName ?? emp.Name ?? string.Empty).Trim().ToLowerInvariant() == nameNorm) return true;

            var keyNorm = NormalizeKey(kvp.Key);
            if (!string.IsNullOrEmpty(empIdNorm) && keyNorm == empIdNorm) return true;
            if (kvp.Key == uid.ToString()) return true;
        }

        return false;
    }
}
