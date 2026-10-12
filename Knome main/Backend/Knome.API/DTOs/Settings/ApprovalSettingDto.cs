using System;

namespace Knome.API.DTOs.Settings;

public class ApprovalSettingDto
{
    public string SettingKey { get; set; } = "RequireContentAndCommunityApproval";
    public bool RequireApproval { get; set; } = true;
    public string Description { get; set; } = "Require administrator approval before communities, videos and podcasts are published.";

    // Independent Toggles
    public bool RequireCommunityApproval { get; set; } = true;
    public bool RequireVideoApproval { get; set; } = true;
    public bool RequirePodcastApproval { get; set; } = true;
    public bool EnableMessaging { get; set; } = true;
    public bool EnableEmail { get; set; } = true;

    // Feature Module Toggles
    public bool EnablePosts { get; set; } = true;
    public bool EnableArticles { get; set; } = true;
    public bool EnableClips { get; set; } = true;
    public bool EnableWiki { get; set; } = true;
    public bool EnableVideos { get; set; } = true;
    public bool EnablePodcasts { get; set; } = true;

    public DateTime? UpdatedDate { get; set; }
    public int? UpdatedByUserId { get; set; }
}

public class UpdateApprovalSettingDto
{
    public bool? RequireApproval { get; set; }
    public bool? RequireCommunityApproval { get; set; }
    public bool? RequireVideoApproval { get; set; }
    public bool? RequirePodcastApproval { get; set; }
    public bool? EnableMessaging { get; set; }
    public bool? EnableEmail { get; set; }

    // Feature Module Toggles
    public bool? EnablePosts { get; set; }
    public bool? EnableArticles { get; set; }
    public bool? EnableClips { get; set; }
    public bool? EnableWiki { get; set; }
    public bool? EnableVideos { get; set; }
    public bool? EnablePodcasts { get; set; }
}
