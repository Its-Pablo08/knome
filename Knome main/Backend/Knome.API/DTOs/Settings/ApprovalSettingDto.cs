using System;

namespace Knome.API.DTOs.Settings;

public class ApprovalSettingDto
{
    public string SettingKey { get; set; } = "RequireContentAndCommunityApproval";
    public bool RequireApproval { get; set; } = true;
    public string Description { get; set; } = "Require administrator approval before communities, videos and podcasts are published.";
    public DateTime? UpdatedDate { get; set; }
    public int? UpdatedByUserId { get; set; }
}

public class UpdateApprovalSettingDto
{
    public bool RequireApproval { get; set; }
}
