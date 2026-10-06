using System;

namespace Knome.API.DTOs.Wiki;

public class WikiActivityDto
{
    public long ActivityId { get; set; }
    public long WikiId { get; set; }
    public string Action { get; set; } = string.Empty; // 'Created', 'Updated', 'SectionAdded', 'SectionUpdated', 'SectionDeleted', 'CollaboratorAdded', 'CollaboratorRemoved', 'Shared', 'Archived', 'Unarchived', 'RestoredVersion'
    public int ActorUserId { get; set; }
    public string ActorUserName { get; set; } = string.Empty;
    public string? ActorUserAvatar { get; set; }
    public string? Reason { get; set; }
    public string? Details { get; set; }
    public DateTime Timestamp { get; set; }
}
