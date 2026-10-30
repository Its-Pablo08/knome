using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
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
    private static readonly SemaphoreSlim ConfigLock = new(1, 1);

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

    // Canonical roster alias mapping to bridge frontend INITIAL_USERS IDs and SQL Server UserIds/EmployeeIds
    private static readonly (int RosterId, string EmpId, string Email, string Name)[] CanonicalRosterAliases = new[]
    {
        (1057, "MPO652", "deepak.simrodia@mponline.gov.in", "deepak simrodia"),
        (108,  "MPO108", "loveneesh.sharma@mponline.gov.in", "loveneesh sharma"),
        (100,  "EMP100", "mayurbansal7089@gmail.com", "mayur bansal"),
        (101,  "EMP101", "meghna@gmail.com", "meghna tiwari"),
        (52,   "EMP052", "sourabhsahu45@gmail.com", "sourabh sahu"),
        (889,  "MPO889", "vilash.deshmukh@mponline.gov.in", "vilash deshmukh"),
        (2001, "MPO201", "rohit.verma@mponline.gov.in", "rohit verma")
    };

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

    private static bool IsActiveNoticeRecord(NoticePeriodEmployeeDto? emp)
    {
        if (emp == null) return false;
        if (emp.DisablePostScheduling == false) return false;
        if (!string.IsNullOrWhiteSpace(emp.Status) &&
            (emp.Status.Equals("Standard Active", StringComparison.OrdinalIgnoreCase) ||
             emp.Status.Equals("Standard", StringComparison.OrdinalIgnoreCase) ||
             emp.Status.Equals("Restored", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }
        return true;
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
            if (parsed == null)
            {
                return new NoticePeriodConfigDto { IsEnabled = true };
            }

            var normalizedEmployees = new Dictionary<string, NoticePeriodEmployeeDto>(StringComparer.OrdinalIgnoreCase);
            if (parsed.Employees != null)
            {
                foreach (var kvp in parsed.Employees)
                {
                    if (!string.IsNullOrWhiteSpace(kvp.Key) && IsActiveNoticeRecord(kvp.Value))
                    {
                        normalizedEmployees[kvp.Key.Trim()] = kvp.Value;
                    }
                }
            }

            return new NoticePeriodConfigDto
            {
                IsEnabled = parsed.IsEnabled,
                Employees = normalizedEmployees
            };
        }
        catch
        {
            return new NoticePeriodConfigDto { IsEnabled = true };
        }
    }

    private async Task SaveConfigInternalAsync(NoticePeriodConfigDto config, int actorUserId, string description)
    {
        int? validActorId = null;
        if (actorUserId > 0)
        {
            var exists = await _db.Users.AsNoTracking().AnyAsync(u => u.UserId == actorUserId);
            if (exists) validActorId = actorUserId;
        }

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
                UpdatedByUserId = validActorId
            };
            _db.SystemSettings.Add(existing);
        }
        else
        {
            existing.SettingValue = json;
            existing.Description = description;
            existing.UpdatedDate = Knome.API.Common.KnomeTime.Now;
            existing.UpdatedByUserId = validActorId;
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

    private async Task SafeRecordAuditAsync(int actorUserId, string actionType, string entityName, int entityId, string description)
    {
        if (actorUserId <= 0) return;
        try
        {
            var exists = await _db.Users.AsNoTracking().AnyAsync(u => u.UserId == actorUserId);
            if (exists)
            {
                await _auditLogService.RecordAsync(actorUserId, actionType, entityName, entityId, description);
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Non-fatal: failed to record Notice Period audit log.");
        }
    }

    public async Task<NoticePeriodConfigDto> SetPolicyEnabledAsync(bool isEnabled, int actorUserId)
    {
        await ConfigLock.WaitAsync();
        try
        {
            var config = await GetConfigAsync();
            config.IsEnabled = isEnabled;

            var desc = isEnabled 
                ? "Notice Period Post-Scheduling Guard enabled by HR Admin." 
                : "Notice Period Post-Scheduling Guard disabled by HR Admin.";

            await SaveConfigInternalAsync(config, actorUserId, desc);
            await SafeRecordAuditAsync(
                actorUserId, 
                isEnabled ? "Enable Notice Period Guard" : "Disable Notice Period Guard", 
                "SystemSetting", 
                0, 
                desc);

            return config;
        }
        finally
        {
            ConfigLock.Release();
        }
    }

    public async Task<NoticePeriodConfigDto> ToggleEmployeeNoticeAsync(ToggleEmployeeNoticeDto dto, int actorUserId)
    {
        await ConfigLock.WaitAsync();
        try
        {
            var config = await GetConfigAsync();
            if (config.Employees == null) config.Employees = new(StringComparer.OrdinalIgnoreCase);

            // Resolve user from DB using sequential fallbacks (in case frontend UserId differs from SQL UserId)
            User? dbUser = null;
            if (dto.UserId.HasValue && dto.UserId.Value > 0)
            {
                dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == dto.UserId.Value);
            }
            if (dbUser == null && !string.IsNullOrWhiteSpace(dto.EmployeeId))
            {
                var empIdNorm = NormalizeKey(dto.EmployeeId);
                var empIdZero = empIdNorm.StartsWith("MPO") ? "MP0" + empIdNorm.Substring(3) : empIdNorm;
                dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u =>
                    u.EmployeeId == dto.EmployeeId ||
                    u.EmployeeId == empIdNorm ||
                    u.EmployeeId == empIdZero);
            }
            if (dbUser == null && !string.IsNullOrWhiteSpace(dto.Email))
            {
                var emailLower = dto.Email.Trim().ToLowerInvariant();
                dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower);
            }
            if (dbUser == null && !string.IsNullOrWhiteSpace(dto.Name))
            {
                var nameLower = dto.Name.Trim().ToLowerInvariant();
                dbUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.FullName.ToLower() == nameLower);
            }

            var effectiveUid = dbUser?.UserId ?? dto.UserId ?? 0;
            var dtoUid = dto.UserId ?? 0;
            var effectiveEmpId = !string.IsNullOrWhiteSpace(dbUser?.EmployeeId) ? dbUser.EmployeeId : (dto.EmployeeId ?? string.Empty);
            var effectiveEmail = !string.IsNullOrWhiteSpace(dbUser?.Email) ? dbUser.Email : (dto.Email ?? string.Empty);
            var effectiveName = !string.IsNullOrWhiteSpace(dbUser?.FullName) ? dbUser.FullName : (dto.Name ?? "Employee");

            var empKey = NormalizeKey(effectiveEmpId);
            var dtoEmpKey = NormalizeKey(dto.EmployeeId);
            var uidKey = effectiveUid > 0 ? effectiveUid.ToString() : string.Empty;
            var dtoUidKey = dtoUid > 0 ? dtoUid.ToString() : string.Empty;
            var emailKey = !string.IsNullOrWhiteSpace(effectiveEmail) ? effectiveEmail.Trim().ToLowerInvariant() : string.Empty;
            var dtoEmailKey = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim().ToLowerInvariant() : string.Empty;
            var nameNorm = !string.IsNullOrWhiteSpace(effectiveName) ? effectiveName.Trim().ToLowerInvariant() : string.Empty;
            var dtoNameNorm = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name.Trim().ToLowerInvariant() : string.Empty;

            // Gather all alias keys (including canonical roster mappings) for this employee
            var candidateEmpKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidateUidKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidateEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var candidateNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (!string.IsNullOrEmpty(empKey)) candidateEmpKeys.Add(empKey);
            if (!string.IsNullOrEmpty(dtoEmpKey)) candidateEmpKeys.Add(dtoEmpKey);
            if (!string.IsNullOrEmpty(uidKey)) candidateUidKeys.Add(uidKey);
            if (!string.IsNullOrEmpty(dtoUidKey)) candidateUidKeys.Add(dtoUidKey);
            if (!string.IsNullOrEmpty(emailKey)) candidateEmails.Add(emailKey);
            if (!string.IsNullOrEmpty(dtoEmailKey)) candidateEmails.Add(dtoEmailKey);
            if (!string.IsNullOrEmpty(nameNorm) && !nameNorm.Equals("employee", StringComparison.OrdinalIgnoreCase)) candidateNames.Add(nameNorm);
            if (!string.IsNullOrEmpty(dtoNameNorm) && !dtoNameNorm.Equals("employee", StringComparison.OrdinalIgnoreCase)) candidateNames.Add(dtoNameNorm);

            foreach (var alias in CanonicalRosterAliases)
            {
                if (candidateEmpKeys.Contains(alias.EmpId) ||
                    candidateUidKeys.Contains(alias.RosterId.ToString()) ||
                    candidateEmails.Contains(alias.Email) ||
                    candidateNames.Contains(alias.Name))
                {
                    candidateEmpKeys.Add(alias.EmpId);
                    candidateUidKeys.Add(alias.RosterId.ToString());
                    candidateEmails.Add(alias.Email);
                    candidateNames.Add(alias.Name);
                }
            }

            // Check if currently marked
            bool isCurrentlyMarked = false;
            if (!string.IsNullOrEmpty(empKey) && config.Employees.ContainsKey(empKey)) isCurrentlyMarked = true;
            if (!string.IsNullOrEmpty(uidKey) && config.Employees.ContainsKey(uidKey)) isCurrentlyMarked = true;
            if (!string.IsNullOrEmpty(dtoUidKey) && config.Employees.ContainsKey(dtoUidKey)) isCurrentlyMarked = true;
            if (!string.IsNullOrEmpty(emailKey) && config.Employees.ContainsKey(emailKey)) isCurrentlyMarked = true;
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
                    PrimaryKey = !string.IsNullOrEmpty(empKey) ? empKey : (!string.IsNullOrEmpty(uidKey) ? uidKey : (!string.IsNullOrEmpty(emailKey) ? emailKey : $"USER_{DateTime.UtcNow.Ticks}")),
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
                if (!string.IsNullOrEmpty(dtoUidKey)) config.Employees[dtoUidKey] = record;
                if (!string.IsNullOrEmpty(emailKey)) config.Employees[emailKey] = record;

                await SaveConfigInternalAsync(config, actorUserId, $"Marked {effectiveName} as In Notice Period (post scheduling disabled).");
                await SafeRecordAuditAsync(
                    actorUserId, 
                    "Notice Period Assigned", 
                    "User", 
                    effectiveUid, 
                    $"Employee {effectiveName} ({effectiveEmpId}) marked In Notice Period. Post scheduling disabled.");
            }
            else
            {
                // Unmark from notice — remove all matching keys and aliases
                var keysToRemove = new List<string>();
                foreach (var kvp in config.Employees)
                {
                    var key = kvp.Key ?? string.Empty;
                    var emp = kvp.Value;
                    bool match = false;

                    var keyNorm = NormalizeKey(key);
                    if (!string.IsNullOrEmpty(keyNorm) && candidateEmpKeys.Contains(keyNorm)) match = true;
                    if (candidateUidKeys.Contains(key.Trim())) match = true;
                    if (candidateEmails.Contains(key.Trim().ToLowerInvariant())) match = true;

                    if (!match && emp != null)
                    {
                        var recEmpNorm = NormalizeKey(emp.EmployeeId);
                        var recUidStr = (emp.UserId ?? emp.Id)?.ToString() ?? string.Empty;
                        var recEmail = (emp.Email ?? string.Empty).Trim().ToLowerInvariant();
                        var recName = (emp.FullName ?? emp.Name ?? string.Empty).Trim().ToLowerInvariant();

                        if (!string.IsNullOrEmpty(recEmpNorm) && candidateEmpKeys.Contains(recEmpNorm)) match = true;
                        if (!string.IsNullOrEmpty(recUidStr) && candidateUidKeys.Contains(recUidStr)) match = true;
                        if (!string.IsNullOrEmpty(recEmail) && candidateEmails.Contains(recEmail)) match = true;
                        if (!string.IsNullOrEmpty(recName) && recName.Length > 2 && candidateNames.Contains(recName)) match = true;
                    }

                    if (match) keysToRemove.Add(kvp.Key);
                }

                foreach (var k in keysToRemove)
                {
                    config.Employees.Remove(k);
                }

                await SaveConfigInternalAsync(config, actorUserId, $"Removed {effectiveName} from Notice Period (post scheduling restored).");
                await SafeRecordAuditAsync(
                    actorUserId, 
                    "Notice Period Revoked", 
                    "User", 
                    effectiveUid, 
                    $"Employee {effectiveName} ({effectiveEmpId}) removed from Notice Period. Post scheduling restored.");
            }

            return config;
        }
        finally
        {
            ConfigLock.Release();
        }
    }

    public async Task<bool> IsUserInNoticePeriodAsync(int userId)
    {
        if (userId <= 0) return false;
        var config = await GetConfigAsync();
        if (!config.IsEnabled || config.Employees == null || config.Employees.Count == 0) return false;

        var uidStr = userId.ToString();
        if (config.Employees.TryGetValue(uidStr, out var directEmp) && IsActiveNoticeRecord(directEmp))
        {
            return true;
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null)
        {
            // Check if userId corresponds to a canonical frontend roster ID
            var alias = CanonicalRosterAliases.FirstOrDefault(a => a.RosterId == userId);
            if (!string.IsNullOrEmpty(alias.EmpId))
            {
                var empZero = alias.EmpId.StartsWith("MPO") ? "MP0" + alias.EmpId.Substring(3) : alias.EmpId;
                user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u =>
                    u.EmployeeId == alias.EmpId ||
                    u.EmployeeId == empZero ||
                    u.Email.ToLower() == alias.Email);

                user ??= new User
                {
                    UserId = userId,
                    EmployeeId = alias.EmpId,
                    Email = alias.Email,
                    FullName = alias.Name
                };
            }
        }

        if (user == null) return false;

        return IsUserMatchedInNotice(user, config);
    }

    public async Task<bool> IsUserInNoticePeriodAsync(string employeeIdOrEmail)
    {
        if (string.IsNullOrWhiteSpace(employeeIdOrEmail)) return false;
        var config = await GetConfigAsync();
        if (!config.IsEnabled || config.Employees == null || config.Employees.Count == 0) return false;

        var norm = NormalizeKey(employeeIdOrEmail);
        if (config.Employees.TryGetValue(norm, out var directEmp) && IsActiveNoticeRecord(directEmp))
        {
            return true;
        }

        var empZero = norm.StartsWith("MPO") ? "MP0" + norm.Substring(3) : norm;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => 
            u.EmployeeId == employeeIdOrEmail || 
            u.EmployeeId == norm || 
            u.EmployeeId == empZero ||
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
        var user = userId > 0 ? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.UserId == userId) : null;

        return new NoticePeriodStatusResultDto
        {
            UserId = userId,
            EmployeeId = user?.EmployeeId ?? string.Empty,
            InNoticePeriod = inNotice,
            DisablePostScheduling = inNotice,
            Status = inNotice ? "In Notice Period" : "Standard Active"
        };
    }

    public async Task<NoticePeriodStatusResultDto> CheckUserNoticeStatusAsync(string identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
        {
            return new NoticePeriodStatusResultDto
            {
                InNoticePeriod = false,
                DisablePostScheduling = false,
                Status = "Standard Active"
            };
        }

        if (int.TryParse(identifier, out var uid) && uid > 0)
        {
            return await CheckUserNoticeStatusAsync(uid);
        }

        var inNotice = await IsUserInNoticePeriodAsync(identifier);
        var norm = NormalizeKey(identifier);
        var empZero = norm.StartsWith("MPO") ? "MP0" + norm.Substring(3) : norm;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u =>
            u.EmployeeId == identifier ||
            u.EmployeeId == norm ||
            u.EmployeeId == empZero ||
            u.Email.ToLower() == identifier.ToLower());

        return new NoticePeriodStatusResultDto
        {
            UserId = user?.UserId ?? 0,
            EmployeeId = user?.EmployeeId ?? identifier,
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
            if (!IsActiveNoticeRecord(emp)) continue;

            if (uid > 0 && emp.UserId.HasValue && emp.UserId.Value == uid) return true;
            if (uid > 0 && emp.Id.HasValue && emp.Id.Value == uid) return true;

            if (!string.IsNullOrEmpty(empIdNorm) && NormalizeKey(emp.EmployeeId) == empIdNorm) return true;

            if (!string.IsNullOrEmpty(emailNorm) && (emp.Email ?? string.Empty).Trim().ToLowerInvariant() == emailNorm) return true;

            if (!string.IsNullOrEmpty(nameNorm) && nameNorm.Length > 2 && (emp.FullName ?? emp.Name ?? string.Empty).Trim().ToLowerInvariant() == nameNorm) return true;

            var keyNorm = NormalizeKey(kvp.Key);
            if (!string.IsNullOrEmpty(empIdNorm) && keyNorm == empIdNorm) return true;
            if (uid > 0 && kvp.Key == uid.ToString()) return true;
        }

        return false;
    }
}
