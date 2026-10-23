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

    Task<bool> GetRequireArticleApprovalAsync();
    Task<bool> SetRequireArticleApprovalAsync(bool requireApproval, int actorUserId);

    Task<bool> GetRequireWikiApprovalAsync();
    Task<bool> SetRequireWikiApprovalAsync(bool requireApproval, int actorUserId);

    Task<bool> GetRequireVideoApprovalAsync();
    Task<bool> SetRequireVideoApprovalAsync(bool requireApproval, int actorUserId);

    Task<bool> GetRequirePodcastApprovalAsync();
    Task<bool> SetRequirePodcastApprovalAsync(bool requireApproval, int actorUserId);

    // Communication & Notifications
    Task<bool> GetEnableMessagingAsync();
    Task<bool> SetEnableMessagingAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableEmailAsync();
    Task<bool> SetEnableEmailAsync(bool enabled, int actorUserId);

    // Feature Modules (Posts, Articles, Clips, Wiki, Videos, Podcasts)
    Task<bool> GetEnablePostsAsync();
    Task<bool> SetEnablePostsAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableArticlesAsync();
    Task<bool> SetEnableArticlesAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableClipsAsync();
    Task<bool> SetEnableClipsAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableWikiAsync();
    Task<bool> SetEnableWikiAsync(bool enabled, int actorUserId);

    Task<bool> GetEnableVideosAsync();
    Task<bool> SetEnableVideosAsync(bool enabled, int actorUserId);

    Task<bool> GetEnablePodcastsAsync();
    Task<bool> SetEnablePodcastsAsync(bool enabled, int actorUserId);

    Task EnsureFeatureEnabledAsync(string featureKey, string featureDisplayName);

    // Full Settings DTO
    Task<ApprovalSettingDto> GetFullApprovalSettingsAsync();
    Task<ApprovalSettingDto> UpdateApprovalSettingsAsync(UpdateApprovalSettingDto updateDto, int actorUserId);

    // Generic
    Task<string?> GetSettingAsync(string key);
    Task SetSettingAsync(string key, string value, int actorUserId, string? description = null);
    Task<Dictionary<string, string>> GetAllSettingsAsync();
}
