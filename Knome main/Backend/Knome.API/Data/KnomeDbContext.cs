using System;
using System.Collections.Generic;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Data;

public partial class KnomeDbContext : DbContext
{
    public KnomeDbContext()
    {
    }

    public KnomeDbContext(DbContextOptions<KnomeDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Abbreviation> Abbreviations { get; set; }

    public virtual DbSet<Article> Articles { get; set; }

    public virtual DbSet<ArticleAttachment> ArticleAttachments { get; set; }

    public virtual DbSet<ArticleTag> ArticleTags { get; set; }

    public virtual DbSet<ArticleVersion> ArticleVersions { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<BlockedUrl> BlockedUrls { get; set; }

    public virtual DbSet<Bookmark> Bookmarks { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<Comment> Comments { get; set; }

    public virtual DbSet<Community> Communities { get; set; }

    public virtual DbSet<CommunityMember> CommunityMembers { get; set; }

    public virtual DbSet<CommunityPost> CommunityPosts { get; set; }

    public virtual DbSet<ConnectionRequest> ConnectionRequests { get; set; }

    public virtual DbSet<ContentView> ContentViews { get; set; }

    public virtual DbSet<Department> Departments { get; set; }

    public virtual DbSet<Follower> Followers { get; set; }

    public virtual DbSet<HotPostsScoreCache> HotPostsScoreCaches { get; set; }

    public virtual DbSet<Job> Jobs { get; set; }

    public virtual DbSet<KarmaBalance> KarmaBalances { get; set; }

    public virtual DbSet<KarmaTransaction> KarmaTransactions { get; set; }

    public virtual DbSet<ModerationReport> ModerationReports { get; set; }

    public virtual DbSet<Notification> Notifications { get; set; }

    public virtual DbSet<NotificationPreference> NotificationPreferences { get; set; }

    public virtual DbSet<Podcast> Podcasts { get; set; }

    public virtual DbSet<PodcastSeries> PodcastSeries { get; set; }

    public virtual DbSet<Post> Posts { get; set; }

    public virtual DbSet<PostAttachment> PostAttachments { get; set; }

    public virtual DbSet<Reaction> Reactions { get; set; }

    public virtual DbSet<RestrictedKeyword> RestrictedKeywords { get; set; }

    public virtual DbSet<Role> Roles { get; set; }

    public virtual DbSet<RoleRequest> RoleRequests { get; set; }

    public virtual DbSet<SearchHistory> SearchHistories { get; set; }

    public virtual DbSet<Share> Shares { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserCredential> UserCredentials { get; set; }

    public virtual DbSet<UserInterest> UserInterests { get; set; }

    public virtual DbSet<UserSkill> UserSkills { get; set; }

    public virtual DbSet<Video> Videos { get; set; }

    public virtual DbSet<VideoTag> VideoTags { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
        => optionsBuilder.UseSqlServer("Server=LAPTOP-458;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Abbreviation>(entity =>
        {
            entity.HasKey(e => e.AbbreviationId).HasName("PK__Abbrevia__FFEA4817234B41C5");

            entity.HasIndex(e => e.Keyword, "IX_Abbreviations_Keyword");

            entity.HasIndex(e => e.ShortCode, "IX_Abbreviations_ShortCode");

            entity.HasIndex(e => new { e.ShortCode, e.Keyword }, "UQ_Abbreviations_ShortCode_Keyword").IsUnique();

            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Keyword).HasMaxLength(100);
            entity.Property(e => e.ShortCode).HasMaxLength(50);

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.Abbreviations)
                .HasForeignKey(d => d.CreatedBy)
                .HasConstraintName("FK_Abbreviations_CreatedBy");
        });

        modelBuilder.Entity<Article>(entity =>
        {
            entity.HasKey(e => e.ArticleId).HasName("PK__Articles__9C6270E8D30B170F");

            entity.HasIndex(e => new { e.CreatedDate, e.Status }, "IX_Articles_CreatedDate").IsDescending(true, false);

            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Published");
            entity.Property(e => e.Title).HasMaxLength(150);

            entity.HasOne(d => d.AuthorUser).WithMany(p => p.Articles)
                .HasForeignKey(d => d.AuthorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Articles__Author__70DDC3D8");

            entity.HasOne(d => d.Category).WithMany(p => p.Articles)
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Articles__Catego__71D1E811");
        });

        modelBuilder.Entity<ArticleAttachment>(entity =>
        {
            entity.HasKey(e => e.AttachmentId).HasName("PK__ArticleA__442C64BEF0CAD5D9");

            entity.Property(e => e.FileType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.FileUrl).HasMaxLength(400);
            entity.Property(e => e.PublishedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Article).WithMany(p => p.ArticleAttachments)
                .HasForeignKey(d => d.ArticleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ArticleAt__Artic__7C4F7684");
        });

        modelBuilder.Entity<ArticleTag>(entity =>
        {
            entity.HasKey(e => new { e.ArticleId, e.Tag }).HasName("PK__ArticleT__A02766A951B8C039");

            entity.Property(e => e.Tag).HasMaxLength(50);

            entity.HasOne(d => d.Article).WithMany(p => p.ArticleTags)
                .HasForeignKey(d => d.ArticleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ArticleTa__Artic__797309D9");
        });

        modelBuilder.Entity<ArticleVersion>(entity =>
        {
            entity.HasKey(e => e.VersionId).HasName("PK__ArticleV__16C6400FE9E0B942");

            entity.Property(e => e.EditedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Article).WithMany(p => p.ArticleVersions)
                .HasForeignKey(d => d.ArticleId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ArticleVe__Artic__7F2BE32F");

            entity.HasOne(d => d.EditedByUser).WithMany(p => p.ArticleVersions)
                .HasForeignKey(d => d.EditedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__ArticleVe__Edite__00200768");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.AuditId).HasName("PK__AuditLog__A17F2398A7475EA7");

            entity.ToTable("AuditLog");

            entity.HasIndex(e => e.ActorUserId, "IX_AuditLog_Actor");

            entity.Property(e => e.Action)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.Ipaddress)
                .HasMaxLength(45)
                .IsUnicode(false)
                .HasColumnName("IPAddress");
            entity.Property(e => e.NewValue).IsUnicode(false);
            entity.Property(e => e.OldValue).IsUnicode(false);
            entity.Property(e => e.Reason)
                .HasMaxLength(500)
                .IsUnicode(false);
            entity.Property(e => e.TargetType)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.Timestamp).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.ActorUser).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__AuditLog__ActorU__5812160E");
        });

        modelBuilder.Entity<BlockedUrl>(entity =>
        {
            entity.HasKey(e => e.BlockedUrlId).HasName("PK__BlockedU__E9576D6238A790EB");

            entity.Property(e => e.Reason).HasMaxLength(200);
            entity.Property(e => e.UrlPattern).HasMaxLength(400);
        });

        modelBuilder.Entity<Bookmark>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.ContentType, e.ContentId }).HasName("PK__Bookmark__4E97CF9A7748E080");

            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.SavedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.User).WithMany(p => p.Bookmarks)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Bookmarks__UserI__367C1819");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(e => e.CategoryId).HasName("PK__Categori__19093A0BF6D8A805");

            entity.Property(e => e.AppliesTo)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Name).HasMaxLength(100);
        });

        modelBuilder.Entity<Comment>(entity =>
        {
            entity.HasKey(e => e.CommentId).HasName("PK__Comments__C3B4DFCA6D6D928C");

            entity.Property(e => e.CommentText).HasMaxLength(1000);
            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.ImageUrl).HasMaxLength(400);

            entity.HasOne(d => d.ParentComment).WithMany(p => p.InverseParentComment)
                .HasForeignKey(d => d.ParentCommentId)
                .HasConstraintName("FK__Comments__Parent__2EDAF651");

            entity.HasOne(d => d.User).WithMany(p => p.Comments)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Comments__UserId__2DE6D218");
        });

        modelBuilder.Entity<Community>(entity =>
        {
            entity.HasKey(e => e.CommunityId).HasName("PK__Communit__CCAA5B691667DC6C");

            entity.Property(e => e.ApprovalStatus)
                .HasMaxLength(50)
                .HasDefaultValue("Approved");
            entity.Property(e => e.BannerUrl).HasMaxLength(400);
            entity.Property(e => e.CommunityType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Name).HasMaxLength(150);
            entity.Property(e => e.ThumbnailUrl).HasMaxLength(400);

            entity.HasOne(d => d.Category).WithMany(p => p.Communities)
                .HasForeignKey(d => d.CategoryId)
                .HasConstraintName("FK__Communiti__Categ__14270015");

            entity.HasOne(d => d.CreatedByUser).WithMany(p => p.Communities)
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Communiti__Creat__151B244E");

            entity.HasMany(d => d.Users).WithMany(p => p.CommunitiesNavigation)
                .UsingEntity<Dictionary<string, object>>(
                    "CommunityAdmin",
                    r => r.HasOne<User>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__Community__UserI__208CD6FA"),
                    l => l.HasOne<Community>().WithMany()
                        .HasForeignKey("CommunityId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__Community__Commu__1F98B2C1"),
                    j =>
                    {
                        j.HasKey("CommunityId", "UserId").HasName("PK__Communit__1DD2D7ADEBCE195E");
                        j.ToTable("CommunityAdmins");
                    });
        });

        modelBuilder.Entity<CommunityMember>(entity =>
        {
            entity.HasKey(e => new { e.CommunityId, e.UserId }).HasName("PK__Communit__1DD2D7AD2D0A183B");

            entity.Property(e => e.MemberType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Subscriber");
            entity.Property(e => e.RequestedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Approved");

            entity.HasOne(d => d.ApprovedByUser).WithMany(p => p.CommunityMemberApprovedByUsers)
                .HasForeignKey(d => d.ApprovedByUserId)
                .HasConstraintName("FK_CommunityMembers_ApprovedByUser");

            entity.HasOne(d => d.Community).WithMany(p => p.CommunityMembers)
                .HasForeignKey(d => d.CommunityId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Community__Commu__18EBB532");

            entity.HasOne(d => d.User).WithMany(p => p.CommunityMemberUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Community__UserI__19DFD96B");
        });

        modelBuilder.Entity<CommunityPost>(entity =>
        {
            entity.HasKey(e => new { e.CommunityId, e.PostId }).HasName("PK__Communit__560B7D68F3B1A07D");

            entity.HasOne(d => d.Community).WithMany(p => p.CommunityPosts)
                .HasForeignKey(d => d.CommunityId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Community__Commu__236943A5");

            entity.HasOne(d => d.Post).WithMany(p => p.CommunityPosts)
                .HasForeignKey(d => d.PostId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Community__PostI__245D67DE");
        });

        modelBuilder.Entity<ConnectionRequest>(entity =>
        {
            entity.HasKey(e => e.RequestId).HasName("PK__Connecti__33A8517A44E7F3FA");

            entity.HasIndex(e => new { e.SenderId, e.ReceiverId }, "UQ_ConnectionRequests_Sender_Receiver").IsUnique();

            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Pending");
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Receiver).WithMany(p => p.ConnectionRequestReceivers)
                .HasForeignKey(d => d.ReceiverId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Connectio__Recei__0C50D423");

            entity.HasOne(d => d.Sender).WithMany(p => p.ConnectionRequestSenders)
                .HasForeignKey(d => d.SenderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Connectio__Sende__0B5CAFEA");
        });

        modelBuilder.Entity<ContentView>(entity =>
        {
            entity.HasKey(e => e.ViewId).HasName("PK__ContentV__1E371CF6AF162961");

            entity.HasIndex(e => new { e.ContentType, e.ContentId }, "IX_ContentViews_Content");

            entity.HasIndex(e => e.UserId, "IX_ContentViews_User");

            entity.HasIndex(e => new { e.ContentType, e.ContentId, e.UserId }, "UK_ContentViews_User_Content").IsUnique();

            entity.Property(e => e.ContentType).HasMaxLength(50);
            entity.Property(e => e.ViewedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.User).WithMany(p => p.ContentViews)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK_ContentViews_Users");
        });

        modelBuilder.Entity<Department>(entity =>
        {
            entity.HasKey(e => e.DepartmentId).HasName("PK__Departme__B2079BED76F24158");

            entity.HasIndex(e => e.Name, "UQ__Departme__737584F69E3F8223").IsUnique();

            entity.Property(e => e.DepartmentCode)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Name).HasMaxLength(100);
        });

        modelBuilder.Entity<Follower>(entity =>
        {
            entity.HasKey(e => new { e.FollowerUserId, e.FollowingUserId }).HasName("PK__Follower__553231FF5F77A53E");

            entity.HasIndex(e => e.FollowingUserId, "IX_Followers_FollowingUserId");

            entity.Property(e => e.FollowedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.FollowerUser).WithMany(p => p.FollowerFollowerUsers)
                .HasForeignKey(d => d.FollowerUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Followers__Follo__52593CB8");

            entity.HasOne(d => d.FollowingUser).WithMany(p => p.FollowerFollowingUsers)
                .HasForeignKey(d => d.FollowingUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Followers__Follo__534D60F1");
        });

        modelBuilder.Entity<HotPostsScoreCache>(entity =>
        {
            entity.HasKey(e => new { e.ContentType, e.ContentId, e.Window }).HasName("PK__HotPosts__E75E31902291B3E9");

            entity.ToTable("HotPostsScoreCache");

            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.Window)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.CalculatedAt).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Score).HasColumnType("decimal(12, 2)");
        });

        modelBuilder.Entity<Job>(entity =>
        {
            entity.HasKey(e => e.JobId).HasName("PK__Jobs__056690C2B251294E");

            entity.Property(e => e.ApplicationLink).HasMaxLength(400);
            entity.Property(e => e.Location).HasMaxLength(150);
            entity.Property(e => e.PostedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.SkillsRequired).HasMaxLength(500);
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Open");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Department).WithMany(p => p.Jobs)
                .HasForeignKey(d => d.DepartmentId)
                .HasConstraintName("FK__Jobs__Department__531856C7");

            entity.HasOne(d => d.PostedByUser).WithMany(p => p.Jobs)
                .HasForeignKey(d => d.PostedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Jobs__PostedByUs__540C7B00");
        });

        modelBuilder.Entity<KarmaBalance>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("PK__KarmaBal__1788CC4C93C5829E");

            entity.Property(e => e.UserId).ValueGeneratedNever();
            entity.Property(e => e.BadgeLevel)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("None");
            entity.Property(e => e.LastUpdated).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.User).WithOne(p => p.KarmaBalance)
                .HasForeignKey<KarmaBalance>(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__KarmaBala__UserI__4A8310C6");
        });

        modelBuilder.Entity<KarmaTransaction>(entity =>
        {
            entity.HasKey(e => e.TransactionId).HasName("PK__KarmaTra__55433A6B57A5BAC6");

            entity.Property(e => e.ActivityType)
                .HasMaxLength(40)
                .IsUnicode(false);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.RelatedContentType)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.KarmaTransactions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__KarmaTran__UserI__46B27FE2");
        });

        modelBuilder.Entity<ModerationReport>(entity =>
        {
            entity.HasKey(e => e.ReportId).HasName("PK__Moderati__D5BD4805C1B1ACCF");

            entity.Property(e => e.ActionTaken)
                .HasMaxLength(40)
                .IsUnicode(false);
            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.ReasonCode)
                .HasMaxLength(40)
                .IsUnicode(false);
            entity.Property(e => e.ReportedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Pending");

            entity.HasOne(d => d.ModeratorUser).WithMany(p => p.ModerationReportModeratorUsers)
                .HasForeignKey(d => d.ModeratorUserId)
                .HasConstraintName("FK__Moderatio__Moder__5AB9788F");

            entity.HasOne(d => d.ReporterUser).WithMany(p => p.ModerationReportReporterUsers)
                .HasForeignKey(d => d.ReporterUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Moderatio__Repor__58D1301D");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.NotificationId).HasName("PK__Notifica__20CF2E120C5DCE29");

            entity.HasIndex(e => new { e.UserId, e.IsRead, e.CreatedDate }, "IX_Notifications_UserId_IsRead").IsDescending(false, false, true);

            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.EventType)
                .HasMaxLength(40)
                .IsUnicode(false);
            entity.Property(e => e.Message).HasMaxLength(400);
            entity.Property(e => e.RelatedContentType)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Notificat__UserI__3A4CA8FD");
        });

        modelBuilder.Entity<NotificationPreference>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.EventType }).HasName("PK__Notifica__0B311D149813ABCB");

            entity.Property(e => e.EventType)
                .HasMaxLength(40)
                .IsUnicode(false);
            entity.Property(e => e.BellEnabled).HasDefaultValue(true);

            entity.HasOne(d => d.User).WithMany(p => p.NotificationPreferences)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Notificat__UserI__3F115E1A");
        });

        modelBuilder.Entity<Podcast>(entity =>
        {
            entity.HasKey(e => e.PodcastId).HasName("PK__Podcasts__EB669354D3593FB4");

            entity.Property(e => e.CoverImageUrl).HasMaxLength(400);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.UploadedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Category).WithMany(p => p.Podcasts)
                .HasForeignKey(d => d.CategoryId)
                .HasConstraintName("FK__Podcasts__Catego__0F624AF8");

            entity.HasOne(d => d.Series).WithMany(p => p.Podcasts)
                .HasForeignKey(d => d.SeriesId)
                .HasConstraintName("FK__Podcasts__Series__10566F31");

            entity.HasOne(d => d.UploaderUser).WithMany(p => p.Podcasts)
                .HasForeignKey(d => d.UploaderUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Podcasts__Upload__0E6E26BF");
        });

        modelBuilder.Entity<PodcastSeries>(entity =>
        {
            entity.HasKey(e => e.SeriesId).HasName("PK__PodcastS__F3A1C1615055E291");

            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Title).HasMaxLength(150);
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasKey(e => e.PostId).HasName("PK__Posts__AA126018DD2B1FB3");

            entity.HasIndex(e => new { e.CreatedDate, e.Status }, "IX_Posts_CreatedDate_Status").IsDescending(true, false);

            entity.Property(e => e.AudienceType)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Everyone");
            entity.Property(e => e.ContentText).HasMaxLength(400);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Published");

            entity.HasOne(d => d.AuthorUser).WithMany(p => p.Posts)
                .HasForeignKey(d => d.AuthorUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Posts__AuthorUse__5DCAEF64");

            entity.HasMany(d => d.Communities).WithMany(p => p.Posts)
                .UsingEntity<Dictionary<string, object>>(
                    "PostAudienceCommunity",
                    r => r.HasOne<Community>().WithMany()
                        .HasForeignKey("CommunityId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_PostAudienceCommunities_Community"),
                    l => l.HasOne<Post>().WithMany()
                        .HasForeignKey("PostId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__PostAudie__PostI__66603565"),
                    j =>
                    {
                        j.HasKey("PostId", "CommunityId").HasName("PK__PostAudi__26D8C5AEFF39936A");
                        j.ToTable("PostAudienceCommunities");
                    });

            entity.HasMany(d => d.MentionedUsers).WithMany(p => p.Posts1)
                .UsingEntity<Dictionary<string, object>>(
                    "PostMention",
                    r => r.HasOne<User>().WithMany()
                        .HasForeignKey("MentionedUserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__PostMenti__Menti__6E01572D"),
                    l => l.HasOne<Post>().WithMany()
                        .HasForeignKey("PostId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__PostMenti__PostI__6D0D32F4"),
                    j =>
                    {
                        j.HasKey("PostId", "MentionedUserId").HasName("PK__PostMent__FFFB4DD1850617FE");
                        j.ToTable("PostMentions");
                    });

            entity.HasMany(d => d.Users).WithMany(p => p.PostsNavigation)
                .UsingEntity<Dictionary<string, object>>(
                    "PostAudienceUser",
                    r => r.HasOne<User>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__PostAudie__UserI__6A30C649"),
                    l => l.HasOne<Post>().WithMany()
                        .HasForeignKey("PostId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__PostAudie__PostI__693CA210"),
                    j =>
                    {
                        j.HasKey("PostId", "UserId").HasName("PK__PostAudi__7B6AECDC9FE71179");
                        j.ToTable("PostAudienceUsers");
                    });
        });

        modelBuilder.Entity<PostAttachment>(entity =>
        {
            entity.HasKey(e => e.AttachmentId).HasName("PK__PostAtta__442C64BE67E06085");

            entity.Property(e => e.FileType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.FileUrl).HasMaxLength(400);
            entity.Property(e => e.PublishedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Post).WithMany(p => p.PostAttachments)
                .HasForeignKey(d => d.PostId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__PostAttac__PostI__6383C8BA");
        });

        modelBuilder.Entity<Reaction>(entity =>
        {
            entity.HasKey(e => e.ReactionId).HasName("PK__Reaction__46DDF9B4828879A4");

            entity.HasIndex(e => new { e.ContentType, e.ContentId, e.ReactionType }, "IX_Reactions_Content");

            entity.HasIndex(e => new { e.ContentType, e.ContentId, e.UserId }, "UQ_Reaction").IsUnique();

            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.ReactionType)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.Reactions)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Reactions__UserI__2A164134");
        });

        modelBuilder.Entity<RestrictedKeyword>(entity =>
        {
            entity.HasKey(e => e.KeywordId).HasName("PK__Restrict__37C135218347B3D4");

            entity.HasIndex(e => e.Keyword, "UQ__Restrict__1D3264F679BC1151").IsUnique();

            entity.Property(e => e.Keyword).HasMaxLength(100);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(e => e.RoleId).HasName("PK__Roles__8AFACE1AD948B781");

            entity.HasIndex(e => e.RoleCode, "UQ__Roles__D62CB59CA09861C0").IsUnique();

            entity.Property(e => e.Description)
                .HasMaxLength(300)
                .IsUnicode(false);
            entity.Property(e => e.RoleCode)
                .HasMaxLength(10)
                .IsUnicode(false);
            entity.Property(e => e.RoleName)
                .HasMaxLength(50)
                .IsUnicode(false);
        });

        modelBuilder.Entity<RoleRequest>(entity =>
        {
            entity.HasKey(e => e.RequestId).HasName("PK__RoleRequ__33A8517AFFF2EAFA");

            entity.Property(e => e.AdminComment).HasMaxLength(500);
            entity.Property(e => e.AssignedBy)
                .HasMaxLength(50)
                .IsUnicode(false);
            entity.Property(e => e.AssignedRoleName).HasMaxLength(50);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.DepartmentName).HasMaxLength(100);
            entity.Property(e => e.Designation).HasMaxLength(100);
            entity.Property(e => e.Email)
                .HasMaxLength(150)
                .IsUnicode(false);
            entity.Property(e => e.EmployeeId)
                .HasMaxLength(50)
                .IsUnicode(false);
            entity.Property(e => e.FullName).HasMaxLength(150);
            entity.Property(e => e.RequestedRoleCode)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasDefaultValue("EMP");
            entity.Property(e => e.Status)
                .HasMaxLength(30)
                .IsUnicode(false)
                .HasDefaultValue("Pending");
        });

        modelBuilder.Entity<SearchHistory>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("SearchHistory");

            entity.Property(e => e.SearchTerm).HasMaxLength(200);
            entity.Property(e => e.SearchedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.User).WithMany()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__SearchHis__UserI__42E1EEFE");
        });

        modelBuilder.Entity<Share>(entity =>
        {
            entity.HasKey(e => e.ShareId).HasName("PK__Shares__D32A3FEE7721F089");

            entity.Property(e => e.ContentType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.SharedToType)
                .HasMaxLength(20)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithMany(p => p.Shares)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Shares__UserId__32AB8735");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.UserId).HasName("PK__Users__1788CC4C6148FEAB");

            entity.HasIndex(e => e.DepartmentId, "IX_Users_Department");

            entity.HasIndex(e => e.Email, "IX_Users_Email");

            entity.HasIndex(e => e.EmployeeId, "IX_Users_EmployeeId");

            entity.HasIndex(e => e.EmployeeId, "UQ__Users__7AD04F10650894CC").IsUnique();

            entity.HasIndex(e => e.Email, "UQ__Users__A9D10534769FA794").IsUnique();

            entity.Property(e => e.Bio)
                .HasMaxLength(1000)
                .IsUnicode(false);
            entity.Property(e => e.BioVisibility)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Public");
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.Designation)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.Email).HasMaxLength(150);
            entity.Property(e => e.EmployeeId)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.FullName)
                .HasMaxLength(150)
                .IsUnicode(false);
            entity.Property(e => e.InterestsVisibility)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Public");
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Location)
                .HasMaxLength(100)
                .IsUnicode(false);
            entity.Property(e => e.ManagerEmployeeId)
                .HasMaxLength(30)
                .IsUnicode(false);
            entity.Property(e => e.MobileNo)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.NetworkVisibility)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Public");
            entity.Property(e => e.PhotosVisibility)
                .HasMaxLength(20)
                .IsUnicode(false)
                .HasDefaultValue("Public");
            entity.Property(e => e.ProfilePhotoUrl)
                .HasMaxLength(400)
                .IsUnicode(false);

            entity.HasOne(d => d.Department).WithMany(p => p.Users)
                .HasForeignKey(d => d.DepartmentId)
                .HasConstraintName("FK__Users__Departmen__3F466844");

            entity.HasOne(d => d.ManagerEmployee).WithMany(p => p.InverseManagerEmployee)
                .HasPrincipalKey(p => p.EmployeeId)
                .HasForeignKey(d => d.ManagerEmployeeId)
                .HasConstraintName("FK_Users_Manager");

            entity.HasMany(d => d.Roles).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "UserRole",
                    r => r.HasOne<Role>().WithMany()
                        .HasForeignKey("RoleId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__UserRoles__RoleI__49C3F6B7"),
                    l => l.HasOne<User>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK__UserRoles__UserI__48CFD27E"),
                    j =>
                    {
                        j.HasKey("UserId", "RoleId").HasName("PK__UserRole__AF2760ADD28CAAD5");
                        j.ToTable("UserRoles");
                    });
        });

        modelBuilder.Entity<UserCredential>(entity =>
        {
            entity.HasKey(e => e.UserId);

            entity.Property(e => e.UserId).ValueGeneratedNever();
            entity.Property(e => e.LastUpdated).HasDefaultValueSql("(sysdatetime())");
            entity.Property(e => e.PasswordHash)
                .HasMaxLength(255)
                .IsUnicode(false);
            entity.Property(e => e.PasswordSalt)
                .HasMaxLength(255)
                .IsUnicode(false);

            entity.HasOne(d => d.User).WithOne(p => p.UserCredential)
                .HasForeignKey<UserCredential>(d => d.UserId)
                .HasConstraintName("FK_UserCredentials_Users");
        });

        modelBuilder.Entity<UserInterest>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.Interest }).HasName("PK__UserInte__7B88AA11D188BCB4");

            entity.Property(e => e.Interest).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.UserInterests)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__UserInter__UserI__4F7CD00D");
        });

        modelBuilder.Entity<UserSkill>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.Skill }).HasName("PK__UserSkil__6E87431012A394F2");

            entity.Property(e => e.Skill).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.UserSkills)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__UserSkill__UserI__4CA06362");
        });

        modelBuilder.Entity<Video>(entity =>
        {
            entity.HasKey(e => e.VideoId).HasName("PK__Videos__BAE5126A69CCDA1D");

            entity.HasIndex(e => e.UploadedDate, "IX_Videos_UploadedDate").IsDescending();

            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.SourceType)
                .HasMaxLength(20)
                .IsUnicode(false);
            entity.Property(e => e.SourceUrl).HasMaxLength(400);
            entity.Property(e => e.ThumbnailUrl).HasMaxLength(400);
            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.UploadedDate).HasDefaultValueSql("(sysdatetime())");

            entity.HasOne(d => d.Category).WithMany(p => p.Videos)
                .HasForeignKey(d => d.CategoryId)
                .HasConstraintName("FK__Videos__Category__04E4BC85");

            entity.HasOne(d => d.UploaderUser).WithMany(p => p.Videos)
                .HasForeignKey(d => d.UploaderUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__Videos__Uploader__03F0984C");
        });

        modelBuilder.Entity<VideoTag>(entity =>
        {
            entity.HasKey(e => new { e.VideoId, e.Tag }).HasName("PK__VideoTag__86A0042B9AC42704");

            entity.Property(e => e.Tag).HasMaxLength(50);

            entity.HasOne(d => d.Video).WithMany(p => p.VideoTags)
                .HasForeignKey(d => d.VideoId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK__VideoTags__Video__09A971A2");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
