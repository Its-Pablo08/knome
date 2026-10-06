using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Data;

public partial class KnomeDbContext
{
    public virtual DbSet<UserMessage> UserMessages { get; set; }
    public virtual DbSet<UserMessageReaction> UserMessageReactions { get; set; }

    public static void ConfigureUserMessageEntities(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserMessage>(entity =>
        {
            entity.HasKey(e => e.MessageId);
            entity.ToTable("UserMessages");

            entity.HasIndex(e => new { e.SenderId, e.ReceiverId, e.CreatedDate }, "IX_UserMessages_Conversation");
            entity.HasIndex(e => new { e.ReceiverId, e.IsRead }, "IX_UserMessages_Unread");

            entity.Property(e => e.KeyVersion).HasDefaultValue(1);
            entity.Property(e => e.IsRead).HasDefaultValue(false);
            entity.Property(e => e.IsDeletedBySender).HasDefaultValue(false);
            entity.Property(e => e.IsDeletedByReceiver).HasDefaultValue(false);
            entity.Property(e => e.IsEdited).HasDefaultValue(false);
            entity.Property(e => e.IsDeleted).HasDefaultValue(false);
            entity.Property(e => e.Nonce).HasMaxLength(12);
            entity.Property(e => e.AuthTag).HasMaxLength(16);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(getutcdate())");
            entity.Property(e => e.UpdatedDate).HasDefaultValueSql("(getutcdate())");

            entity.HasOne(d => d.Sender)
                .WithMany()
                .HasForeignKey(d => d.SenderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserMessages_Sender");

            entity.HasOne(d => d.Receiver)
                .WithMany()
                .HasForeignKey(d => d.ReceiverId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserMessages_Receiver");

            entity.HasOne(d => d.ParentMessage)
                .WithMany()
                .HasForeignKey(d => d.ParentMessageId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_UserMessages_ParentMessage");

            entity.HasMany(d => d.Reactions)
                .WithOne(r => r.Message)
                .HasForeignKey(r => r.MessageId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("FK_UserMessageReactions_Message");
        });

        modelBuilder.Entity<UserMessageReaction>(entity =>
        {
            entity.HasKey(e => e.ReactionId);
            entity.ToTable("UserMessageReactions");

            entity.HasIndex(e => e.MessageId, "IX_UserMessageReactions_MessageId");
            entity.HasIndex(e => e.UserId, "IX_UserMessageReactions_UserId");
            entity.HasIndex(e => new { e.MessageId, e.UserId, e.ReactionType }, "UQ_UserMessageReactions_UserMessageReaction").IsUnique();

            entity.Property(e => e.ReactionType).HasMaxLength(32);
            entity.Property(e => e.CreatedDate).HasDefaultValueSql("(getutcdate())");

            entity.HasOne(d => d.User)
                .WithMany()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserMessageReactions_User");
        });
    }
}
