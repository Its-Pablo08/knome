using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class User
{
    public int UserId { get; set; }

    public string EmployeeId { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? Designation { get; set; }

    public int? DepartmentId { get; set; }

    public string? Location { get; set; }

    public string? ProfilePhotoUrl { get; set; }

    public string? Bio { get; set; }

    public string BioVisibility { get; set; } = null!;

    public string NetworkVisibility { get; set; } = null!;

    public string PhotosVisibility { get; set; } = null!;

    public string InterestsVisibility { get; set; } = null!;

    public bool IsActive { get; set; }

    public DateTime? SuspendedUntil { get; set; }

    public bool IsPermanentlySuspended { get; set; }

    public DateTime CreatedDate { get; set; }

    public DateTime? LastSyncedFromHrmsDate { get; set; }

    public string? MobileNo { get; set; }

    public string? ManagerEmployeeId { get; set; }

    public DateOnly? JoiningDate { get; set; }

    public DateTime? LastLogin { get; set; }

    public byte ProfileCompletion { get; set; }

    public int? CreatedBy { get; set; }

    public int? ModifiedBy { get; set; }

    public DateTime? ModifiedDate { get; set; }

    public virtual ICollection<Abbreviation> Abbreviations { get; set; } = new List<Abbreviation>();

    public virtual ICollection<ArticleVersion> ArticleVersions { get; set; } = new List<ArticleVersion>();

    public virtual ICollection<Article> Articles { get; set; } = new List<Article>();

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual ICollection<Bookmark> Bookmarks { get; set; } = new List<Bookmark>();

    public virtual ICollection<Comment> Comments { get; set; } = new List<Comment>();

    public virtual ICollection<Community> Communities { get; set; } = new List<Community>();

    public virtual ICollection<CommunityMember> CommunityMemberApprovedByUsers { get; set; } = new List<CommunityMember>();

    public virtual ICollection<CommunityMember> CommunityMemberUsers { get; set; } = new List<CommunityMember>();

    public virtual ICollection<ConnectionRequest> ConnectionRequestReceivers { get; set; } = new List<ConnectionRequest>();

    public virtual ICollection<ConnectionRequest> ConnectionRequestSenders { get; set; } = new List<ConnectionRequest>();

    public virtual ICollection<ContentView> ContentViews { get; set; } = new List<ContentView>();

    public virtual Department? Department { get; set; }

    public virtual ICollection<Follower> FollowerFollowerUsers { get; set; } = new List<Follower>();

    public virtual ICollection<Follower> FollowerFollowingUsers { get; set; } = new List<Follower>();

    public virtual ICollection<User> InverseManagerEmployee { get; set; } = new List<User>();

    public virtual ICollection<Job> Jobs { get; set; } = new List<Job>();

    public virtual KarmaBalance? KarmaBalance { get; set; }

    public virtual ICollection<KarmaTransaction> KarmaTransactions { get; set; } = new List<KarmaTransaction>();

    public virtual User? ManagerEmployee { get; set; }

    public virtual ICollection<ModerationReport> ModerationReportModeratorUsers { get; set; } = new List<ModerationReport>();

    public virtual ICollection<ModerationReport> ModerationReportReporterUsers { get; set; } = new List<ModerationReport>();

    public virtual ICollection<NotificationPreference> NotificationPreferences { get; set; } = new List<NotificationPreference>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<Podcast> Podcasts { get; set; } = new List<Podcast>();

    public virtual ICollection<Post> Posts { get; set; } = new List<Post>();

    public virtual ICollection<Reaction> Reactions { get; set; } = new List<Reaction>();

    public virtual ICollection<Share> Shares { get; set; } = new List<Share>();

    public virtual UserCredential? UserCredential { get; set; }

    public virtual ICollection<UserInterest> UserInterests { get; set; } = new List<UserInterest>();

    public virtual ICollection<UserSkill> UserSkills { get; set; } = new List<UserSkill>();

    public virtual ICollection<Video> Videos { get; set; } = new List<Video>();

    public virtual ICollection<Community> CommunitiesNavigation { get; set; } = new List<Community>();

    public virtual ICollection<Post> Posts1 { get; set; } = new List<Post>();

    public virtual ICollection<Post> PostsNavigation { get; set; } = new List<Post>();

    public virtual ICollection<Role> Roles { get; set; } = new List<Role>();
}
