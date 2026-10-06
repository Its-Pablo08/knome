namespace Knome.API.Constants;

/// <summary>
/// Canonical notification event categories. Producers reference these constants
/// when publishing; the notification core treats them as opaque strings, so new
/// modules can add their own category without changing the engine.
/// </summary>
public static class NotificationTypes
{
    public const string Job = "Job";
    public const string Community = "Community";
    public const string Mention = "Mention";
    public const string Reaction = "Reaction";
    public const string Badge = "Badge";
    public const string Follower = "Follower";
    public const string HrAnnouncement = "HRAnnouncement";
    public const string Comment = "Comment";
    public const string CommunityInvite = "CommunityInvite";
    public const string CommunityJoin = "CommunityJoin";
    public const string Share = "Share";
    public const string ConnectionRequest = "ConnectionRequest";
}

/// <summary>
/// Constants for the relatedContentType parameter when publishing notifications.
/// Resolves F-030 magic string warnings across User, Community, Job, and Karma services.
/// </summary>
public static class NotificationContentTypes
{
    public const string Post = "Post";
    public const string Article = "Article";
    public const string Video = "Video";
    public const string Podcast = "Podcast";
    public const string Community = "Community";
    public const string User = "User";
    public const string Job = "Job";
    public const string Badge = "Badge";
    public const string Wiki = "Wiki";
}