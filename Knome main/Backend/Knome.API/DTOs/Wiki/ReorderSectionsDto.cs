using System.Collections.Generic;

namespace Knome.API.DTOs.Wiki;

public class SectionOrderItemDto
{
    public long SectionId { get; set; }
    public long? ParentSectionId { get; set; }
    public int SortOrder { get; set; }
}

public class ReorderSectionsDto
{
    public List<SectionOrderItemDto> Items { get; set; } = new();
}
