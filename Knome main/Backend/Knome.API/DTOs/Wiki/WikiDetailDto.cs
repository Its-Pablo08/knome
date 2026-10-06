using System.Collections.Generic;

namespace Knome.API.DTOs.Wiki;

public class WikiDetailDto : WikiDto
{
    public List<WikiSectionDto> Sections { get; set; } = new();
    public List<WikiCollaboratorDto> Collaborators { get; set; } = new();
    public List<WikiShareDto> Shares { get; set; } = new();
    public List<WikiActivityDto> RecentActivities { get; set; } = new();
}
