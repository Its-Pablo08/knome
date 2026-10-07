using Microsoft.EntityFrameworkCore;
using Knome.API.Models;

namespace Knome.API.Data;

public partial class KnomeDbContext
{
    public virtual DbSet<Clip> Clips { get; set; } = null!;
    public virtual DbSet<ClipShare> ClipShares { get; set; } = null!;

    public static void ConfigureClipEntities(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Clip>(entity =>
        {
            entity.HasKey(e => e.ClipId);
            entity.ToTable("Clips");

            entity.HasIndex(e => e.CreatedDate).IsDescending();
            entity.HasIndex(e => e.CreatedByUserId);
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.CommunityId);
            entity.HasIndex(e => new { e.IsDeleted, e.IsActive });

            entity.Property(e => e.Title).HasMaxLength(250);
            entity.Property(e => e.Description).HasMaxLength(2000);
            entity.Property(e => e.VideoUrl).HasMaxLength(1000);
            entity.Property(e => e.ThumbnailUrl).HasMaxLength(1000);
            entity.Property(e => e.DurationSeconds).HasDefaultValue(0);
            entity.Property(e => e.Hashtags).HasMaxLength(500);
            entity.Property(e => e.Visibility).HasMaxLength(50).HasDefaultValue("Public");
            entity.Property(e => e.Status).HasMaxLength(50).HasDefaultValue("Published");
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.ViewCount).HasDefaultValue(0);
            entity.Property(e => e.LikesCount).HasDefaultValue(0);
            entity.Property(e => e.CommentsCount).HasDefaultValue(0);
            entity.Property(e => e.SharesCount).HasDefaultValue(0);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);

            entity.HasOne(d => d.CreatedByUser)
                .WithMany()
                .HasForeignKey(d => d.CreatedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);

            entity.HasOne(d => d.Community)
                .WithMany()
                .HasForeignKey(d => d.CommunityId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ClipShare>(entity =>
        {
            entity.HasKey(e => e.ShareId);
            entity.ToTable("ClipShares");

            entity.HasIndex(e => e.ClipId);
            entity.HasIndex(e => new { e.SharedToType, e.TargetId });

            entity.Property(e => e.SharedToType).HasMaxLength(50);
            entity.Property(e => e.Note).HasMaxLength(500);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.Clip)
                .WithMany(p => p.ClipShares)
                .HasForeignKey(d => d.ClipId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.SharedByUser)
                .WithMany()
                .HasForeignKey(d => d.SharedByUserId)
                .OnDelete(DeleteBehavior.ClientSetNull);
        });
    }
}
