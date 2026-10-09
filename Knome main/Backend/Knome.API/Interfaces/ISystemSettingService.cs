using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Settings;

namespace Knome.API.Interfaces;

public interface ISystemSettingService
{
    // Master indicator
    Task<bool> GetRequireContentAndCommunityApprovalAsync();
    Task<bool> SetRequireContentAndCommunityApprovalAsync(bool requireApproval, int actorUserId);

    // Independent Content Approvals
    Task<bool> GetRequireCommunityApprovalAsync();
    Task<bool> SetRequireCommunityApprovalAsync(bool requireApproval, int actorUserId);

    Task<bool> GetRequireVideoApprovalAsync();
    Task<bool> SetRequireVideoApprovalAsync(bool requireApproval, int actorUserId);

    Task<bool> GetRequirePodcastApprovalAsync();
    Task<bool> SetRequirePodcastApprovalAsync(bool requireApproval, int actorUserId);

    // Communication & Notifications
    Task<bool> GetEnableMessagingAsync();
    Task<bool> SetEnableMessagingAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableEmailAsync();
    Task<bool> SetEnableEmailAsync(bool enabled, int actorUserId);

    // Full Settings DTO
    Task<ApprovalSettingDto> GetFullApprovalSettingsAsync();
    Task<ApprovalSettingDto> UpdateApprovalSettingsAsync(UpdateApprovalSettingDto updateDto, int actorUserId);

    // Generic
    Task<string?> GetSettingAsync(string key);
    Task SetSettingAsync(string key, string value, int actorUserId, string? description = null);
    Task<Dictionary<string, string>> GetAllSettingsAsync();
}
