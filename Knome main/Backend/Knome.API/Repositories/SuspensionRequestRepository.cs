using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class SuspensionRequestRepository : ISuspensionRequestRepository
{
    private readonly KnomeDbContext _db;

    public SuspensionRequestRepository(KnomeDbContext db)
    {
        _db = db;
    }

    public async Task<SuspensionRequest> CreateAsync(SuspensionRequest request)
    {
        _db.SuspensionRequests.Add(request);
        await _db.SaveChangesAsync();
        return request;
    }

    public async Task<SuspensionRequest?> GetByIdAsync(long requestId)
    {
        return await _db.SuspensionRequests
            .Include(r => r.TargetUser)
            .Include(r => r.RequestedByUser)
            .Include(r => r.ReviewedByUser)
            .FirstOrDefaultAsync(r => r.RequestId == requestId);
    }

    public async Task<List<SuspensionRequest>> GetAllAsync(string? status = null)
    {
        var query = _db.SuspensionRequests.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(r => r.Status == status);
        }

        return await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
    }

    public async Task<List<SuspensionRequest>> GetByRequesterIdAsync(int requesterUserId, string? status = null)
    {
        var query = _db.SuspensionRequests.AsNoTracking()
            .Where(r => r.RequestedByUserId == requesterUserId);

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(r => r.Status == status);
        }

        return await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
    }

    public async Task<bool> HasPendingRequestAsync(int targetUserId)
    {
        return await _db.SuspensionRequests
            .AnyAsync(r => r.TargetUserId == targetUserId && r.Status == "Pending");
    }

    public async Task<SuspensionRequest> UpdateAsync(SuspensionRequest request)
    {
        _db.SuspensionRequests.Update(request);
        await _db.SaveChangesAsync();
        return request;
    }
}
