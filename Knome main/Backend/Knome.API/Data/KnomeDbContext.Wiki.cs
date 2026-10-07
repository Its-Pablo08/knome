using Microsoft.EntityFrameworkCore;
using Knome.API.Models;

namespace Knome.API.Data;

public partial class KnomeDbContext
{
    public virtual DbSet<Wiki> Wikis { get; set; } = null!;
    public virtual DbSet<WikiSection> WikiSections { get; set; } = null!;
    public virtual DbSet<WikiCollaborator> WikiCollaborators { get; set; } = null!;
    public virtual DbSet<WikiShare> WikiShares { get; set; } = null!;
    public virtual DbSet<WikiTag> WikiTags { get; set; } = null!;
    public virtual DbSet<WikiVersion> WikiVersions { get; set; } = null!;

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        ConfigureUserMessageEntities(modelBuilder);
        ConfigureWikiEntities(modelBuilder);
        ConfigureClipEntities(modelBuilder);
    }

    private static void ConfigureWikiEntities(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Wiki>(entity =>
        {
            entity.HasKey(e => e.WikiId);
            entity.ToTable("Wikis");

            entity.HasIndex(e => e.CreatedDate).IsDescending();
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CreatedByUserId);

            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.Status).HasMaxLength(20).HasDefaultValue("Published");
            entity.Property(e => e.CoverImageUrl).HasMaxLength(500);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.IsArchived).HasDefaultValue(false);
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);
            entity.Property(e => e.ViewCount).HasDefaultValue(0);

            entity.HasOne(d => d.CreatedByUser)
                .WithMany()
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.Category)
                .WithMany()
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<WikiSection>(entity =>
        {
            entity.HasKey(e => e.SectionId);
            entity.ToTable("WikiSections");

            entity.HasIndex(e => new { e.WikiId, e.SortOrder });
            entity.HasIndex(e => e.ParentSectionId);

            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.SortOrder).HasDefaultValue(0);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);

            entity.HasOne(d => d.Wiki)
                .WithMany(p => p.WikiSections)
                .HasForeignKey(d => d.WikiId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.ParentSection)
                .WithMany(p => p.Subsections)
                .HasForeignKey(d => d.ParentSectionId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.CreatedByUser)
                .WithMany()
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        });

        modelBuilder.Entity<WikiCollaborator>(entity =>
        {
            entity.HasKey(e => e.CollaboratorId);
            entity.ToTable("WikiCollaborators");

            entity.HasIndex(e => e.UserId);

            entity.Property(e => e.Role).HasMaxLength(20).HasDefaultValue("Viewer");
            entity.Property(e => e.AddedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.Wiki)
                .WithMany(p => p.WikiCollaborators)
                .HasForeignKey(d => d.WikiId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.Section)
                .WithMany(p => p.WikiCollaborators)
                .HasForeignKey(d => d.SectionId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.User)
                .WithMany()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.AddedByUser)
                .WithMany()
                .HasForeignKey(d => d.AddedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        });

        modelBuilder.Entity<WikiShare>(entity =>
        {
            entity.HasKey(e => e.ShareId);
            entity.ToTable("WikiShares");

            entity.HasIndex(e => e.WikiId);
            entity.HasIndex(e => new { e.ShareType, e.TargetId });

            entity.Property(e => e.ShareType).HasMaxLength(20);
            entity.Property(e => e.AccessLevel).HasMaxLength(20).HasDefaultValue("Viewer");
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.Wiki)
                .WithMany(p => p.WikiShares)
                .HasForeignKey(d => d.WikiId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.SharedByUser)
                .WithMany()
                .HasForeignKey(d => d.SharedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        });

        modelBuilder.Entity<WikiTag>(entity =>
        {
            entity.HasKey(e => new { e.WikiId, e.Tag });
            entity.ToTable("WikiTags");

            entity.Property(e => e.Tag).HasMaxLength(50);

            entity.HasOne(d => d.Wiki)
                .WithMany(p => p.WikiTags)
                .HasForeignKey(d => d.WikiId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WikiVersion>(entity =>
        {
            entity.HasKey(e => e.VersionId);
            entity.ToTable("WikiVersions");

            entity.HasIndex(e => new { e.WikiId, e.VersionNumber });
            entity.HasIndex(e => new { e.SectionId, e.VersionNumber });

            entity.Property(e => e.Title).HasMaxLength(200);
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.ChangeSummary).HasMaxLength(500);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.Wiki)
                .WithMany(p => p.WikiVersions)
                .HasForeignKey(d => d.WikiId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.Section)
                .WithMany(p => p.WikiVersions)
                .HasForeignKey(d => d.SectionId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.CreatedByUser)
                .WithMany()
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        });
    }
}
