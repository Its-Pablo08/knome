namespace Knome.API.Constants;

public static class PostAudiences
{
    public const string Everyone = "Everyone";
    public const string Connections = "Connections";
    public const string Community = "Community";

    public static readonly string[] All = { Everyone, Connections, Community };

    public static bool IsValid(string? audience)
    {
        if (string.IsNullOrWhiteSpace(audience)) return false;
        return audience == Everyone || audience == Connections || audience == Community;
    }
}

public static class PostStatuses
{
    public const string Published = "Published";
    public const string Scheduled = "Scheduled";
    public const string Draft = "Draft";
    public const string Archived = "Archived";

    public static readonly string[] All = { Published, Scheduled, Draft, Archived };

    public static bool IsValid(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return status == Published || status == Scheduled || status == Draft || status == Archived;
    }
}

public static class ArticleStatuses
{
    public const string Published = "Published";
    public const string Scheduled = "Scheduled";
    public const string Draft = "Draft";
    public const string Archived = "Archived";
    public const string PendingApproval = "PendingApproval";
    public const string Rejected = "Rejected";

    public static readonly string[] All = { Published, Scheduled, Draft, Archived, PendingApproval, Rejected };

    public static bool IsValid(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return false;
        return status == Published || status == Scheduled || status == Draft || status == Archived || status == PendingApproval || status == Rejected;
    }
}

public static class AttachmentTypes
{
    public const string Image = "Image";
    public const string Document = "Document";
    public const string Video = "Video";
    public const string Audio = "Audio";
}
