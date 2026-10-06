using System;
using System.Collections.Generic;

namespace Knome.API.Models;

public partial class UserMessage
{
    public long MessageId { get; set; }

    public int SenderId { get; set; }

    public int ReceiverId { get; set; }

    public byte[] CipherText { get; set; } = null!;

    public byte[] Nonce { get; set; } = null!;

    public byte[] AuthTag { get; set; } = null!;

    public int KeyVersion { get; set; }

    public string? AttachmentsJson { get; set; }

    public bool IsRead { get; set; }

    public DateTime? ReadDate { get; set; }

    public bool IsDeletedBySender { get; set; }

    public bool IsDeletedByReceiver { get; set; }

    public long? ParentMessageId { get; set; }

    public bool IsEdited { get; set; }

    public DateTime? EditedDate { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime CreatedDate { get; set; }

    public DateTime UpdatedDate { get; set; }

    public virtual User Receiver { get; set; } = null!;

    public virtual User Sender { get; set; } = null!;

    public virtual UserMessage? ParentMessage { get; set; }

    public virtual ICollection<UserMessageReaction> Reactions { get; set; } = new List<UserMessageReaction>();
}
