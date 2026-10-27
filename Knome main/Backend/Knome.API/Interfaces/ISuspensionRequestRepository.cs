using System.Collections.Generic;
using System.Threading.Tasks;
using Knome.API.Models;

namespace Knome.API.Interfaces;

public interface ISuspensionRequestRepository
{
    Task<SuspensionRequest> CreateAsync(SuspensionRequest request);
    Task<SuspensionRequest?> GetByIdAsync(long requestId);
    Task<List<SuspensionRequest>> GetAllAsync(string? status = null);
    Task<List<SuspensionRequest>> GetByRequesterIdAsync(int requesterUserId, string? status = null);
    Task<bool> HasPendingRequestAsync(int targetUserId);
    Task<SuspensionRequest> UpdateAsync(SuspensionRequest request);
}
