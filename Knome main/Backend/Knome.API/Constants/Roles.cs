namespace Knome.API.Constants;

/// <summary>
/// Role name constants matching the RoleName column in the Roles table.
/// These are used in [Authorize(Roles = "...")] attributes and policy names.
/// RoleCode is the short code (EMP, CADM, etc.) — not used for authorization.
/// </summary>
public static class Roles
{
    public const string Employee = "Employee";
    public const string CommunityAdmin = "Community Admin";
    public const string HRAdmin = "HR Administrator";
    public const string SystemAdmin = "System Administrator";
    public const string Moderator = "Moderator";

    public const string AllAdmins = "HR Administrator,System Administrator,Community Admin,Moderator,System Admin,SYSADM,HR Admin,HRADM,Community Administrator,CADM,MOD,Admin";
    public const string SystemAndHRAdmins = "HR Administrator,System Administrator,System Admin,SYSADM,HR Admin,HRADM,Admin";
}

