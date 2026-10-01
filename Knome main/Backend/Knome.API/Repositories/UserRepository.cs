using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Knome.API.Data;
using Knome.API.DTOs.User;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;

namespace Knome.API.Repositories;

public class UserRepository : Repository<Models.User>, IUserRepository
{
    private readonly KnomeDbContext _db;

    public UserRepository(KnomeDbContext context) : base(context)
    {
        _db = context;
    }

    public async Task<Models.User?> GetProfileByIdAsync(int userId)
    {
        return await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Include(u => u.UserSkills)
            .Include(u => u.UserInterests)
            .Include(u => u.FollowerFollowerUsers)
            .Include(u => u.FollowerFollowingUsers)
            .Include(u => u.KarmaBalance)
            .FirstOrDefaultAsync(u => u.UserId == userId);
    }

    public async Task<PagedResultDto<Models.User>> GetPagedUsersAsync(UserFilterDto filter)
    {
        var query = _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Include(u => u.KarmaBalance)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(filter.SearchTerm))
        {
            var term = filter.SearchTerm.Trim().ToLower();
            query = query.Where(u =>
                u.FullName.ToLower().Contains(term) ||
                u.Email.ToLower().Contains(term) ||
                u.EmployeeId.ToLower().Contains(term));
        }

        if (filter.DepartmentId.HasValue && filter.DepartmentId.Value > 0)
        {
            query = query.Where(u => u.DepartmentId == filter.DepartmentId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.RoleName))
        {
            query = query.Where(u => u.Roles.Any(r => r.RoleName == filter.RoleName));
        }

        if (filter.IsActive.HasValue)
        {
            query = query.Where(u => u.IsActive == filter.IsActive.Value);
        }

        if (filter.IsSuspended.HasValue)
        {
            if (filter.IsSuspended.Value)
            {
                query = query.Where(u => u.IsPermanentlySuspended || (u.SuspendedUntil.HasValue && u.SuspendedUntil > Knome.API.Common.KnomeTime.Now));
            }
            else
            {
                query = query.Where(u => !u.IsPermanentlySuspended && (!u.SuspendedUntil.HasValue || u.SuspendedUntil <= Knome.API.Common.KnomeTime.Now));
            }
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(u => u.FullName)
            .Skip((filter.PageNumber - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        return new PagedResultDto<Models.User>(items, totalCount, filter.PageNumber, filter.PageSize);
    }

    public async Task UpdateUserSkillsAsync(int userId, List<string> skills)
    {
        var existingSkills = await _db.UserSkills.Where(s => s.UserId == userId).ToListAsync();
        _db.UserSkills.RemoveRange(existingSkills);

        var distinctSkills = skills
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var skill in distinctSkills)
        {
            _db.UserSkills.Add(new UserSkill
            {
                UserId = userId,
                Skill = skill
            });
        }

        await _db.SaveChangesAsync();
    }

    public async Task UpdateUserInterestsAsync(int userId, List<string> interests)
    {
        var existingInterests = await _db.UserInterests.Where(i => i.UserId == userId).ToListAsync();
        _db.UserInterests.RemoveRange(existingInterests);

        var distinctInterests = interests
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Select(i => i.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var interest in distinctInterests)
        {
            _db.UserInterests.Add(new UserInterest
            {
                UserId = userId,
                Interest = interest
            });
        }

        await _db.SaveChangesAsync();
    }

    public async Task UpdateUserRolesAsync(int userId, List<string> roleNames)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == userId);
        if (user == null)
            throw new NotFoundException($"User with ID {userId} not found.");

        user.Roles.Clear();

        foreach (var roleName in roleNames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var trimmed = roleName.Trim();
            var normalizedRole = trimmed switch
            {
                var s when s.Equals("System Admin", StringComparison.OrdinalIgnoreCase) => "System Administrator",
                var s when s.Equals("SYSADM", StringComparison.OrdinalIgnoreCase) => "System Administrator",
                var s when s.Equals("HR Admin", StringComparison.OrdinalIgnoreCase) => "HR Administrator",
                var s when s.Equals("HRADM", StringComparison.OrdinalIgnoreCase) => "HR Administrator",
                var s when s.Equals("Community Administrator", StringComparison.OrdinalIgnoreCase) => "Community Admin",
                var s when s.Equals("CADM", StringComparison.OrdinalIgnoreCase) => "Community Admin",
                var s when s.Equals("EMP", StringComparison.OrdinalIgnoreCase) => "Employee",
                _ => trimmed
            };

            var role = await _db.Roles.FirstOrDefaultAsync(r => 
                r.RoleName.ToLower() == trimmed.ToLower() || 
                r.RoleName.ToLower() == normalizedRole.ToLower() || 
                r.RoleCode.ToLower() == trimmed.ToLower() ||
                r.RoleCode.ToLower() == normalizedRole.ToLower());

            if (role == null)
                throw new BadRequestException($"Role '{roleName}' does not exist in the database.");

            if (!user.Roles.Any(r => r.RoleId == role.RoleId))
            {
                user.Roles.Add(role);
            }
        }

        await _db.SaveChangesAsync();
    }

    public async Task<int> GetMutualConnectionsCountAsync(int userId1, int userId2)
    {
        if (userId1 == userId2)
            return 0;

        var user1Following = _db.Followers
            .Where(f => f.FollowerUserId == userId1)
            .Select(f => f.FollowingUserId);

        var user2Following = _db.Followers
            .Where(f => f.FollowerUserId == userId2)
            .Select(f => f.FollowingUserId);

        return await user1Following.Intersect(user2Following).CountAsync();
    }

    public async Task<bool> DepartmentExistsAsync(int departmentId)
    {
        return await _db.Departments.AnyAsync(d => d.DepartmentId == departmentId);
    }

    public async Task<List<int>> GetAllActiveUserIdsAsync()
    {
        return await _db.Users
            .Where(u => u.IsActive && !u.IsPermanentlySuspended)
            .Select(u => u.UserId)
            .ToListAsync();
    }

    public async Task<bool> IsFollowingAsync(int followerUserId, int followingUserId)
    {
        return await _db.Followers.AnyAsync(f => f.FollowerUserId == followerUserId && f.FollowingUserId == followingUserId);
    }

    public async Task AddFollowerAsync(int followerUserId, int followingUserId)
    {
        _db.Followers.Add(new Models.Follower
        {
            FollowerUserId = followerUserId,
            FollowingUserId = followingUserId
        });
        await _db.SaveChangesAsync();
    }

    public async Task RemoveFollowerAsync(int followerUserId, int followingUserId)
    {
        var follow = await _db.Followers
            .FirstOrDefaultAsync(f => f.FollowerUserId == followerUserId && f.FollowingUserId == followingUserId);
        if (follow != null)
        {
            _db.Followers.Remove(follow);
            await _db.SaveChangesAsync();
        }
    }

    public async Task SaveChangesAsync()
    {
        await _db.SaveChangesAsync();
    }

    public async Task<List<Models.User>> GetNetworkSuggestionsAsync(int userId, int limit)
    {
        var currentUser = await _db.Users
            .Include(u => u.UserSkills)
            .FirstOrDefaultAsync(u => u.UserId == userId);

        var userDepartmentId = currentUser?.DepartmentId;
        var userSkillNames = currentUser?.UserSkills.Select(s => s.Skill.ToLower()).ToList() ?? new List<string>();

        var followingIds = await _db.Followers
            .Where(f => f.FollowerUserId == userId)
            .Select(f => f.FollowingUserId)
            .ToListAsync();

        var pendingIds = await _db.ConnectionRequests
            .Where(cr => (cr.SenderId == userId || cr.ReceiverId == userId) && (cr.Status == "Pending" || cr.Status == "PENDING"))
            .Select(cr => cr.SenderId == userId ? cr.ReceiverId : cr.SenderId)
            .ToListAsync();

        var excludedIds = followingIds.Concat(pendingIds).Distinct().ToList();

        var candidateUsers = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Include(u => u.UserSkills)
            .Where(u => u.IsActive && !u.IsPermanentlySuspended && u.UserId != userId && !excludedIds.Contains(u.UserId))
            .ToListAsync();

        var scored = candidateUsers.Select(u => {
            int score = 0;
            if (userDepartmentId.HasValue && u.DepartmentId == userDepartmentId.Value) score += 5;
            
            var matchingSkillCount = u.UserSkills.Count(s => userSkillNames.Contains(s.Skill.ToLower()));
            score += matchingSkillCount * 3;

            return new { User = u, Score = score };
        })
        .OrderByDescending(x => x.Score)
        .ThenByDescending(x => x.User.CreatedDate)
        .Take(limit)
        .Select(x => x.User)
        .ToList();

        return scored;
    }

    public async Task<List<Models.User>> GetFollowersAsync(int userId)
    {
        return await _db.Followers
            .Include(f => f.FollowerUser)
            .ThenInclude(u => u.Department)
            .Include(f => f.FollowerUser.Roles)
            .Where(f => f.FollowingUserId == userId)
            .Select(f => f.FollowerUser)
            .ToListAsync();
    }

    public async Task<List<Models.User>> GetFollowingAsync(int userId)
    {
        return await _db.Followers
            .Include(f => f.FollowingUser)
            .ThenInclude(u => u.Department)
            .Include(f => f.FollowingUser.Roles)
            .Where(f => f.FollowerUserId == userId)
            .Select(f => f.FollowingUser)
            .ToListAsync();
    }

    public async Task<Models.ConnectionRequest?> GetConnectionRequestAsync(int senderId, int receiverId)
    {
        return await _db.ConnectionRequests
            .FirstOrDefaultAsync(cr => cr.SenderId == senderId && cr.ReceiverId == receiverId);
    }

    public async Task AddConnectionRequestAsync(Models.ConnectionRequest request)
    {
        _db.ConnectionRequests.Add(request);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateConnectionRequestAsync(Models.ConnectionRequest request)
    {
        request.UpdatedDate = Knome.API.Common.KnomeTime.Now;
        _db.ConnectionRequests.Update(request);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveConnectionRequestAsync(Models.ConnectionRequest request)
    {
        _db.ConnectionRequests.Remove(request);
        await _db.SaveChangesAsync();
    }

    public async Task AddBidirectionalFollowAsync(int userId1, int userId2)
    {
        var existing1 = await _db.Followers.AnyAsync(f => f.FollowerUserId == userId1 && f.FollowingUserId == userId2);
        if (!existing1)
        {
            _db.Followers.Add(new Models.Follower { FollowerUserId = userId1, FollowingUserId = userId2 });
        }

        var existing2 = await _db.Followers.AnyAsync(f => f.FollowerUserId == userId2 && f.FollowingUserId == userId1);
        if (!existing2)
        {
            _db.Followers.Add(new Models.Follower { FollowerUserId = userId2, FollowingUserId = userId1 });
        }

        await _db.SaveChangesAsync();
    }

    public async Task RemoveBidirectionalFollowAsync(int userId1, int userId2)
    {
        var follows = await _db.Followers
            .Where(f => (f.FollowerUserId == userId1 && f.FollowingUserId == userId2) ||
                        (f.FollowerUserId == userId2 && f.FollowingUserId == userId1))
            .ToListAsync();

        if (follows.Any())
        {
            _db.Followers.RemoveRange(follows);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<List<Models.User>> GetMutualConnectionsAsync(int userId1, int userId2)
    {
        var user1Connections = await _db.Followers
            .Where(f => f.FollowerUserId == userId1)
            .Select(f => f.FollowingUserId)
            .ToListAsync();

        var user2Connections = await _db.Followers
            .Where(f => f.FollowerUserId == userId2)
            .Select(f => f.FollowingUserId)
            .ToListAsync();

        var mutualIds = user1Connections.Intersect(user2Connections).ToList();

        return await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Where(u => mutualIds.Contains(u.UserId) && u.IsActive)
            .ToListAsync();
    }

    public async Task<List<Models.ConnectionRequest>> GetPendingReceivedConnectionRequestsAsync(int userId)
    {
        return await _db.ConnectionRequests
            .Include(cr => cr.Sender)
            .ThenInclude(u => u.Department)
            .Include(cr => cr.Sender.Roles)
            .Where(cr => cr.ReceiverId == userId && (cr.Status == "Pending" || cr.Status == "PENDING"))
            .OrderByDescending(cr => cr.CreatedDate)
            .ToListAsync();
    }

    public async Task<List<Models.ConnectionRequest>> GetPendingSentConnectionRequestsAsync(int userId)
    {
        return await _db.ConnectionRequests
            .Include(cr => cr.Receiver)
            .ThenInclude(u => u.Department)
            .Include(cr => cr.Receiver.Roles)
            .Where(cr => cr.SenderId == userId && (cr.Status == "Pending" || cr.Status == "PENDING"))
            .OrderByDescending(cr => cr.CreatedDate)
            .ToListAsync();
    }

    public async Task<List<Models.User>> GetConnectionsAsync(int userId)
    {
        var connectedUserIds = await _db.Followers
            .Where(f => f.FollowerUserId == userId)
            .Select(f => f.FollowingUserId)
            .ToListAsync();

        return await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Where(u => connectedUserIds.Contains(u.UserId) && u.IsActive)
            .OrderBy(u => u.FullName)
            .ToListAsync();
    }
}
