using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.Wiki;
using Knome.API.Interfaces;
using Knome.API.Responses;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Knome.API.Controllers;

[Authorize]
[ApiController]
[Route("api/wikis")]
public class WikiController : KnomeControllerBase
{
    private readonly IWikiService _wikiService;

    public WikiController(IWikiService wikiService)
    {
        _wikiService = wikiService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResponse<WikiDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetWikis(
        [FromQuery] string? tab,
        [FromQuery] string? search,
        [FromQuery] string? tag,
        [FromQuery] string? status,
        [FromQuery] int? communityId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        var (items, total) = await _wikiService.GetWikisAsync(tab, search, tag, status, communityId, pageNumber, pageSize, GetCurrentUserId());
        var paged = PagedResponse<WikiDto>.Create(items, pageNumber, pageSize, total);
        return Ok(ApiResponse<PagedResponse<WikiDto>>.SuccessResponse(200, "Wikis retrieved successfully.", paged));
    }

    [HttpGet("my")]
    [ProducesResponseType(typeof(ApiResponse<PagedResponse<WikiDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyWikis([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var (items, total) = await _wikiService.GetMyWikisAsync(GetCurrentUserId(), pageNumber, pageSize);
        var paged = PagedResponse<WikiDto>.Create(items, pageNumber, pageSize, total);
        return Ok(ApiResponse<PagedResponse<WikiDto>>.SuccessResponse(200, "My Wikis retrieved successfully.", paged));
    }

    [HttpGet("shared")]
    [ProducesResponseType(typeof(ApiResponse<PagedResponse<WikiDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSharedWithMeWikis([FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 20)
    {
        var (items, total) = await _wikiService.GetSharedWithMeWikisAsync(GetCurrentUserId(), pageNumber, pageSize);
        var paged = PagedResponse<WikiDto>.Create(items, pageNumber, pageSize, total);
        return Ok(ApiResponse<PagedResponse<WikiDto>>.SuccessResponse(200, "Shared Wikis retrieved successfully.", paged));
    }

    [HttpGet("recent")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRecentlyUpdatedWikis([FromQuery] int count = 10)
    {
        var items = await _wikiService.GetRecentlyUpdatedWikisAsync(GetCurrentUserId(), count);
        return Ok(ApiResponse<List<WikiDto>>.SuccessResponse(200, "Recently updated Wikis retrieved successfully.", items));
    }

    [HttpGet("tags")]
    [ProducesResponseType(typeof(ApiResponse<List<string>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPopularTags([FromQuery] int count = 20)
    {
        var tags = await _wikiService.GetPopularTagsAsync(count);
        return Ok(ApiResponse<List<string>>.SuccessResponse(200, "Wiki tags retrieved successfully.", tags));
    }

    [HttpGet("{id:long}")]
    [ProducesResponseType(typeof(ApiResponse<WikiDetailDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetWikiDetail(long id)
    {
        var wiki = await _wikiService.GetWikiDetailAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<WikiDetailDto>.SuccessResponse(200, "Wiki detail retrieved successfully.", wiki));
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<WikiDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateWiki([FromBody] CreateWikiDto dto)
    {
        var created = await _wikiService.CreateWikiAsync(GetCurrentUserId(), dto);
        return StatusCode(StatusCodes.Status201Created, ApiResponse<WikiDto>.SuccessResponse(201, "Wiki created successfully.", created));
    }

    [HttpPut("{id:long}")]
    [ProducesResponseType(typeof(ApiResponse<WikiDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateWiki(long id, [FromBody] UpdateWikiDto dto)
    {
        var updated = await _wikiService.UpdateWikiAsync(id, GetCurrentUserId(), dto);
        return Ok(ApiResponse<WikiDto>.SuccessResponse(200, "Wiki updated successfully.", updated));
    }

    [HttpDelete("{id:long}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteWiki(long id)
    {
        await _wikiService.DeleteWikiAsync(id, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Wiki deleted successfully."));
    }

    [HttpPost("{id:long}/restore")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RestoreWiki(long id)
    {
        await _wikiService.RestoreWikiAsync(id, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Wiki restored successfully."));
    }

    [HttpPost("{id:long}/archive")]
    [ProducesResponseType(typeof(ApiResponse<WikiDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ToggleArchive(long id, [FromBody] ArchiveRequestDto? request = null)
    {
        var isArchived = request?.IsArchived ?? true;
        var result = await _wikiService.ToggleArchiveWikiAsync(id, GetCurrentUserId(), isArchived);
        var msg = isArchived ? "Wiki archived successfully." : "Wiki restored from archive.";
        return Ok(ApiResponse<WikiDto>.SuccessResponse(200, msg, result));
    }

    [HttpPost("{id:long}/view")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordView(long id)
    {
        var views = await _wikiService.RecordWikiViewAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<int>.SuccessResponse(200, "Wiki view recorded.", views));
    }

    // Sections
    [HttpGet("{id:long}/sections")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiSectionDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSections(long id)
    {
        var sections = await _wikiService.GetSectionsAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<List<WikiSectionDto>>.SuccessResponse(200, "Sections retrieved successfully.", sections));
    }

    [HttpGet("{id:long}/sections/{sectionId:long}")]
    [ProducesResponseType(typeof(ApiResponse<WikiSectionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSection(long id, long sectionId)
    {
        var section = await _wikiService.GetSectionAsync(id, sectionId, GetCurrentUserId());
        return Ok(ApiResponse<WikiSectionDto>.SuccessResponse(200, "Section retrieved successfully.", section));
    }

    [HttpPost("{id:long}/sections")]
    [ProducesResponseType(typeof(ApiResponse<WikiSectionDto>), StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateSection(long id, [FromBody] CreateWikiSectionDto dto)
    {
        var created = await _wikiService.CreateSectionAsync(id, GetCurrentUserId(), dto);
        return StatusCode(StatusCodes.Status201Created, ApiResponse<WikiSectionDto>.SuccessResponse(201, "Section created successfully.", created));
    }

    [HttpPut("{id:long}/sections/{sectionId:long}")]
    [ProducesResponseType(typeof(ApiResponse<WikiSectionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateSection(long id, long sectionId, [FromBody] UpdateWikiSectionDto dto)
    {
        var updated = await _wikiService.UpdateSectionAsync(id, sectionId, GetCurrentUserId(), dto);
        return Ok(ApiResponse<WikiSectionDto>.SuccessResponse(200, "Section updated successfully.", updated));
    }

    [HttpDelete("{id:long}/sections/{sectionId:long}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteSection(long id, long sectionId)
    {
        await _wikiService.DeleteSectionAsync(id, sectionId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Section deleted successfully."));
    }

    [HttpPut("{id:long}/sections/reorder")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> ReorderSections(long id, [FromBody] ReorderSectionsDto dto)
    {
        await _wikiService.ReorderSectionsAsync(id, GetCurrentUserId(), dto);
        return Ok(ApiResponse.SuccessResponse(200, "Sections reordered successfully."));
    }

    // Collaborators
    [HttpGet("{id:long}/collaborators")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiCollaboratorDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCollaborators(long id)
    {
        var collabs = await _wikiService.GetCollaboratorsAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<List<WikiCollaboratorDto>>.SuccessResponse(200, "Collaborators retrieved successfully.", collabs));
    }

    [HttpPost("{id:long}/collaborators")]
    [ProducesResponseType(typeof(ApiResponse<WikiCollaboratorDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddCollaborator(long id, [FromBody] AddCollaboratorDto dto)
    {
        var collab = await _wikiService.AddOrUpdateCollaboratorAsync(id, GetCurrentUserId(), dto);
        return Ok(ApiResponse<WikiCollaboratorDto>.SuccessResponse(200, "Collaborator updated successfully.", collab));
    }

    [HttpDelete("{id:long}/collaborators/{collaboratorId:long}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveCollaborator(long id, long collaboratorId)
    {
        await _wikiService.RemoveCollaboratorAsync(id, collaboratorId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Collaborator removed successfully."));
    }

    // Shares
    [HttpGet("{id:long}/shares")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiShareDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetShares(long id)
    {
        var shares = await _wikiService.GetSharesAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<List<WikiShareDto>>.SuccessResponse(200, "Shares retrieved successfully.", shares));
    }

    [HttpPost("{id:long}/shares")]
    [ProducesResponseType(typeof(ApiResponse<WikiShareDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ShareWiki(long id, [FromBody] ShareWikiDto dto)
    {
        var share = await _wikiService.ShareWikiAsync(id, GetCurrentUserId(), dto);
        return Ok(ApiResponse<WikiShareDto>.SuccessResponse(200, "Wiki shared successfully.", share));
    }

    [HttpDelete("{id:long}/shares/{shareId:long}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveShare(long id, long shareId)
    {
        await _wikiService.RemoveShareAsync(id, shareId, GetCurrentUserId());
        return Ok(ApiResponse.SuccessResponse(200, "Share removed successfully."));
    }

    [HttpGet("departments")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiDepartmentDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDepartments()
    {
        var depts = await _wikiService.GetDepartmentsAsync();
        return Ok(ApiResponse<List<WikiDepartmentDto>>.SuccessResponse(200, "Departments retrieved successfully.", depts));
    }

    // Version History
    [HttpGet("{id:long}/versions")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiVersionDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVersions(long id, [FromQuery] long? sectionId)
    {
        var versions = await _wikiService.GetVersionsAsync(id, sectionId, GetCurrentUserId());
        return Ok(ApiResponse<List<WikiVersionDto>>.SuccessResponse(200, "Versions retrieved successfully.", versions));
    }

    [HttpGet("{id:long}/versions/{versionId:long}")]
    [ProducesResponseType(typeof(ApiResponse<WikiVersionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVersionDetail(long id, long versionId)
    {
        var version = await _wikiService.GetVersionDetailAsync(id, versionId, GetCurrentUserId());
        return Ok(ApiResponse<WikiVersionDto>.SuccessResponse(200, "Version detail retrieved successfully.", version));
    }

    [HttpPost("{id:long}/versions/{versionId:long}/restore")]
    [ProducesResponseType(typeof(ApiResponse<WikiVersionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> RestoreVersion(long id, long versionId, [FromBody] RestoreVersionDto? dto = null)
    {
        var restored = await _wikiService.RestoreVersionAsync(id, versionId, GetCurrentUserId(), dto ?? new RestoreVersionDto());
        return Ok(ApiResponse<WikiVersionDto>.SuccessResponse(200, "Version restored successfully.", restored));
    }

    // Activities
    [HttpGet("{id:long}/activities")]
    [ProducesResponseType(typeof(ApiResponse<List<WikiActivityDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetActivities(long id)
    {
        var activities = await _wikiService.GetActivitiesAsync(id, GetCurrentUserId());
        return Ok(ApiResponse<List<WikiActivityDto>>.SuccessResponse(200, "Activities retrieved successfully.", activities));
    }
}

public class ArchiveRequestDto
{
    public bool IsArchived { get; set; } = true;
}
