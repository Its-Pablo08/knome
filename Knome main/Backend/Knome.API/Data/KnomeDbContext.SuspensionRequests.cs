using Microsoft.EntityFrameworkCore;
using Knome.API.Models;

namespace Knome.API.Data;

public partial class KnomeDbContext
{
    public virtual DbSet<SuspensionRequest> SuspensionRequests { get; set; } = null!;

    public static void ConfigureSuspensionRequestEntities(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SuspensionRequest>(entity =>
        {
            entity.HasKey(e => e.RequestId);
            entity.ToTable("SuspensionRequests");

            entity.HasIndex(e => new { e.Status, e.CreatedAt });
            entity.HasIndex(e => e.TargetUserId);
            entity.HasIndex(e => e.RequestedByUserId);

            entity.Property(e => e.TargetEmployeeId).HasMaxLength(50);
            entity.Property(e => e.TargetFullName).HasMaxLength(200);
            entity.Property(e => e.TargetEmail).HasMaxLength(200);
            entity.Property(e => e.TargetDesignation).HasMaxLength(200);
            entity.Property(e => e.TargetDepartment).HasMaxLength(200);
            entity.Property(e => e.TargetAvatar).HasMaxLength(500);
            entity.Property(e => e.RequestedByName).HasMaxLength(200);
            entity.Property(e => e.RequestedByRole).HasMaxLength(100).HasDefaultValue("Moderator");
            entity.Property(e => e.Duration).HasMaxLength(50).HasDefaultValue("7d");
            entity.Property(e => e.Category).HasMaxLength(200);
            entity.Property(e => e.ContentType).HasMaxLength(50);
            entity.Property(e => e.Status).HasMaxLength(50).HasDefaultValue("Pending");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysutcdatetime())");
            entity.Property(e => e.ReviewedByName).HasMaxLength(200);
            entity.Property(e => e.ReviewedByRole).HasMaxLength(100);

            entity.HasOne(d => d.TargetUser)
                .WithMany()
                .HasForeignKey(d => d.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(d => d.RequestedByUser)
                .WithMany()
                .HasForeignKey(d => d.RequestedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(d => d.ReviewedByUser)
                .WithMany()
                .HasForeignKey(d => d.ReviewedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
