namespace Knome.API.Constants;

public static class ContentTypes
{
    public const string Post = "Post";
    public const string Article = "Article";
    public const string Video = "Video";
    public const string Podcast = "Podcast";
    public const string Community = "Community";
    public const string Job = "Job";
    public const string Document = "Document";
    public const string Profile = "Profile";
    public const string Comment = "Comment";
    public const string Wiki = "Wiki";

    public static readonly string[] All = { Post, Article, Video, Podcast, Community, Job, Document, Profile, Comment, Wiki };

    public static string Normalize(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return string.Empty;
        var trimmed = contentType.Trim();
        if (trimmed.Equals(Post, StringComparison.OrdinalIgnoreCase)) return Post;
        if (trimmed.Equals(Article, StringComparison.OrdinalIgnoreCase)) return Article;
        if (trimmed.Equals(Video, StringComparison.OrdinalIgnoreCase)) return Video;
        if (trimmed.Equals(Podcast, StringComparison.OrdinalIgnoreCase)) return Podcast;
        if (trimmed.Equals(Community, StringComparison.OrdinalIgnoreCase)) return Community;
        if (trimmed.Equals(Job, StringComparison.OrdinalIgnoreCase)) return Job;
        if (trimmed.Equals(Document, StringComparison.OrdinalIgnoreCase)) return Document;
        if (trimmed.Equals(Profile, StringComparison.OrdinalIgnoreCase)) return Profile;
        if (trimmed.Equals(Comment, StringComparison.OrdinalIgnoreCase)) return Comment;
        if (trimmed.Equals(Wiki, StringComparison.OrdinalIgnoreCase)) return Wiki;
        return trimmed;
    }

    public static bool IsValid(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return false;
        var norm = Normalize(contentType);
        return norm == Post || norm == Article || norm == Video || norm == Podcast || norm == Community || norm == Job || norm == Document || norm == Profile || norm == Comment || norm == Wiki;
    }
}

public static class ReactionTypes
{
    public const string Like = "Like";
    public const string Celebrate = "Celebrate";
    public const string Support = "Support";
    public const string Heart = "Heart";

    public static readonly string[] All = { Like, Celebrate, Support, Heart };

    public static bool IsValid(string? reactionType)
    {
        if (string.IsNullOrWhiteSpace(reactionType)) return false;
        return All.Any(a => a.Equals(reactionType, StringComparison.OrdinalIgnoreCase));
    }
}

public static class SharedToTypes
{
    public const string Timeline = "Timeline";
    public const string Community = "Community";
    public const string User = "User";
    public const string External = "External";

    public static readonly string[] All = { Timeline, Community, User, External };

    public static bool IsValid(string? sharedToType)
    {
        if (string.IsNullOrWhiteSpace(sharedToType)) return false;
        return sharedToType == Timeline || sharedToType == Community || sharedToType == User || sharedToType == External;
    }
}

public static class ReportStatuses
{
    public const string Pending = "Pending";
    public const string UnderReview = "Under Review";
    public const string Resolved = "Resolved";
    public const string Dismissed = "Dismissed";
}

public static class ReportReasonCodes
{
    public const string Spam = "Spam";
    public const string Harassment = "Harassment";
    public const string Inappropriate = "Inappropriate";
    public const string Copyright = "Copyright";
    public const string Other = "Other";

    public static readonly string[] All = { Spam, Harassment, Inappropriate, Copyright, Other };

    public static bool IsValid(string? reasonCode)
    {
        if (string.IsNullOrWhiteSpace(reasonCode)) return false;
        return reasonCode == Spam || reasonCode == Harassment || reasonCode == Inappropriate || reasonCode == Copyright || reasonCode == Other;
    }
}
