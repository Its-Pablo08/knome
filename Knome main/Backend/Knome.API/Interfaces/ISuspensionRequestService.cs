using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.DTOs.User;

namespace Knome.API.Interfaces;

public interface ISuspensionRequestService
{
    Task<SuspensionRequestDto> CreateSuspensionRequestAsync(int requesterUserId, CreateSuspensionRequestDto dto);
    Task<List<SuspensionRequestDto>> GetSuspensionRequestsAsync(int requesterUserId, string? status = null);
    Task<SuspensionRequestDto> ApproveSuspensionRequestAsync(int reviewerUserId, long requestId);
    Task<SuspensionRequestDto> RejectSuspensionRequestAsync(int reviewerUserId, long requestId, ReviewSuspensionRequestDto dto);
}
