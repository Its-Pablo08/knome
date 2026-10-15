using System;
using System.Collections.Generic;

namespace Knome.API.DTOs.Interactions;

public class CommentDto
{
    public long CommentId { get; set; }
    public string ContentType { get; set; } = null!;
    public long ContentId { get; set; }
    public int UserId { get; set; }
    public string AuthorEmployeeId { get; set; } = null!;
    public string AuthorFullName { get; set; } = null!;
    public string? AuthorDesignation { get; set; }
    public string? AuthorProfilePhotoUrl { get; set; }
    public long? ParentCommentId { get; set; }
    public string CommentText { get; set; } = null!;
    public string? ImageUrl { get; set; }
    public DateTime CreatedDate { get; set; }
    public int RepliesCount { get; set; }
    public int LikesCount { get; set; }
    public int DislikesCount { get; set; }
    public bool IsLiked { get; set; }
    public bool IsDisliked { get; set; }
    public string? UserReactionType { get; set; }
    public List<string> TopReactionTypes { get; set; } = new List<string>();
    public List<CommentDto> Replies { get; set; } = new List<CommentDto>();
}

public class CreateCommentDto
{
    public string CommentText { get; set; } = null!;
    public long? ParentCommentId { get; set; }
    public string? ImageUrl { get; set; }
}

public class UpdateCommentDto
{
    public string CommentText { get; set; } = null!;
    public string? ImageUrl { get; set; }
}
