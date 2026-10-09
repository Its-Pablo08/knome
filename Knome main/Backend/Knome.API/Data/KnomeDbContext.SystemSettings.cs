using Microsoft.EntityFrameworkCore;
using Knome.API.Models;

namespace Knome.API.Data;

public partial class KnomeDbContext
{
    public virtual DbSet<SystemSetting> SystemSettings { get; set; } = null!;

    public static void ConfigureSystemSettingEntities(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.HasKey(e => e.SettingKey);
            entity.ToTable("SystemSettings");

            entity.Property(e => e.SettingKey).HasMaxLength(100);
            entity.Property(e => e.SettingValue).HasColumnType("nvarchar(max)");
            entity.Property(e => e.Description).HasMaxLength(500);
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(sysutcdatetime())");

            entity.HasOne(d => d.UpdatedByUser)
                .WithMany()
                .HasForeignKey(d => d.UpdatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
