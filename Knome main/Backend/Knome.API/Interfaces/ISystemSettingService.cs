using System.Collections.Generic;
using System.Threading.Tasks;

namespace Knome.API.Interfaces;

public interface ISystemSettingService
{
    Task<bool> GetRequireContentAndCommunityApprovalAsync();
    Task<bool> SetRequireContentAndCommunityApprovalAsync(bool requireApproval, int actorUserId);
    Task<string?> GetSettingAsync(string key);
    Task SetSettingAsync(string key, string value, int actorUserId, string? description = null);
    Task<Dictionary<string, string>> GetAllSettingsAsync();
}
