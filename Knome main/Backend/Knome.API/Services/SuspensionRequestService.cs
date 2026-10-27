using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using Knome.API.Common;
using Knome.API.Constants;
using Knome.API.Data;
using Knome.API.DTOs.Notifications;
using Knome.API.DTOs.User;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Knome.API.Models;
using Microsoft.EntityFrameworkCore;
using Serilog;

namespace Knome.API.Services;

public class SuspensionRequestService : ISuspensionRequestService
{
    private readonly ISuspensionRequestRepository _repo;
    private readonly KnomeDbContext _db;
    private readonly IMapper _mapper;
    private readonly IAuditLogService _auditLogService;
    private readonly INotificationService _notificationService;

    public SuspensionRequestService(
        ISuspensionRequestRepository repo,
        KnomeDbContext db,
        IMapper mapper,
        IAuditLogService auditLogService,
        INotificationService notificationService)
    {
        _repo = repo;
        _db = db;
        _mapper = mapper;
        _auditLogService = auditLogService;
        _notificationService = notificationService;
    }

    private static bool IsAdministrator(User user)
    {
        if (user == null || user.Roles == null) return false;
        return user.Roles.Any(r =>
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == Roles.CommunityAdmin || r.RoleCode == "CADM" ||
            (r.RoleName != null && r.RoleName.Contains("Admin")) ||
            (r.RoleCode != null && r.RoleCode.Contains("ADM")));
    }

    private static bool IsHRorSystemAdmin(User user)
    {
        if (user == null || user.Roles == null) return false;
        return user.Roles.Any(r =>
            r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM" ||
            r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
            r.RoleName == "System Admin" || r.RoleName == "HR Admin");
    }

    public async Task<SuspensionRequestDto> CreateSuspensionRequestAsync(int requesterUserId, CreateSuspensionRequestDto dto)
    {
        // 1. Fetch target user
        var targetUser = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.UserId == dto.TargetUserId);

        if (targetUser == null)
        {
            throw new NotFoundException($"Target user with ID {dto.TargetUserId} was not found.");
        }

        // Prevent suspending self
        if (targetUser.UserId == requesterUserId)
        {
            throw new BadRequestException("You cannot submit a suspension request for your own account.");
        }

        // Prevent suspending System Administrators
        if (targetUser.UserId == 1 || (targetUser.Roles != null && targetUser.Roles.Any(r => r.RoleCode == "SYSADM" || r.RoleName == Roles.SystemAdmin)))
        {
            throw new BadRequestException("System Administrators cannot be suspended.");
        }

        // Check if employee is already suspended
        bool isAlreadySuspended = !targetUser.IsActive || targetUser.IsPermanentlySuspended || (targetUser.SuspendedUntil.HasValue && targetUser.SuspendedUntil.Value > KnomeTime.Now);
        if (isAlreadySuspended)
        {
            throw new BadRequestException($"Employee '{targetUser.FullName}' is already suspended.");
        }

        // Check for duplicate pending suspension requests
        bool hasPendingRequest = await _repo.HasPendingRequestAsync(dto.TargetUserId);
        if (hasPendingRequest)
        {
            throw new BadRequestException($"A suspension request for '{targetUser.FullName}' is already pending HR review.");
        }

        // 2. Fetch requester user
        var requesterUser = await _db.Users
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.UserId == requesterUserId);

        string requesterName = requesterUser?.FullName ?? "Moderator";
        string requesterRole = "Moderator";
        if (requesterUser?.Roles != null && requesterUser.Roles.Count > 0)
        {
            var firstRole = requesterUser.Roles.FirstOrDefault();
            if (firstRole != null)
            {
                requesterRole = firstRole.RoleName ?? "Moderator";
            }
        }

        // 3. Construct reason & duration
        string category = !string.IsNullOrWhiteSpace(dto.Category) ? dto.Category.Trim() : "Violation of community guidelines";
        string note = dto.Reason?.Trim() ?? string.Empty;
        string fullReason = !string.IsNullOrWhiteSpace(dto.FullReason)
            ? dto.FullReason.Trim()
            : (!string.IsNullOrWhiteSpace(note) ? $"{category}: {note}" : category);

        string durationStr = !string.IsNullOrWhiteSpace(dto.Duration) ? dto.Duration : (dto.DurationDays.HasValue ? $"{dto.DurationDays}d" : "7d");
        int? durationDays = dto.DurationDays;
        if (!durationDays.HasValue && !dto.IsPermanent && !dto.CustomDate.HasValue)
        {
            if (durationStr.EndsWith("d", StringComparison.OrdinalIgnoreCase) && int.TryParse(durationStr.TrimEnd('d', 'D'), out int d))
            {
                durationDays = d;
            }
            else
            {
                durationDays = 7;
            }
        }

        var request = new SuspensionRequest
        {
            TargetUserId = targetUser.UserId,
            TargetEmployeeId = targetUser.EmployeeId ?? $"EMP{targetUser.UserId}",
            TargetFullName = targetUser.FullName,
            TargetEmail = targetUser.Email,
            TargetDesignation = targetUser.Designation ?? "Employee",
            TargetDepartment = targetUser.Department?.Name ?? "MPOnline",
            TargetAvatar = targetUser.ProfilePhotoUrl,
            RequestedByUserId = requesterUserId,
            RequestedByName = requesterName,
            RequestedByRole = requesterRole,
            Duration = durationStr,
            DurationDays = durationDays,
            CustomDate = dto.CustomDate,
            IsPermanent = dto.IsPermanent,
            Category = category,
            Reason = note,
            FullReason = fullReason,
            ReportId = dto.ReportId,
            ContentId = dto.ContentId,
            ContentType = dto.ContentType,
            Status = "Pending",
            CreatedAt = KnomeTime.Now
        };

        var created = await _repo.CreateAsync(request);

        // 4. Notify HR Administrators and System Administrators
        try
        {
            var hrAdmins = await _db.Users
                .Include(u => u.Roles)
                .Where(u => u.IsActive && u.Roles.Any(r =>
                    r.RoleName == Roles.HRAdmin || r.RoleCode == "HRADM" ||
                    r.RoleName == Roles.SystemAdmin || r.RoleCode == "SYSADM"))
                .ToListAsync();

            string notifMsg = $"Account suspension request for {targetUser.FullName} submitted by {requesterName} ({requesterRole}). Requires HR review & approval.";

            foreach (var hr in hrAdmins)
            {
                await _notificationService.CreateNotificationAsync(new CreateNotificationDto
                {
                    RecipientUserId = hr.UserId,
                    NotificationType = "HRSuspensionRequest",
                    Message = notifMsg,
                    RelatedContentType = "SuspensionRequest",
                    ReferenceId = created.RequestId
                }, requesterUserId);
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to send notifications for suspension request {RequestId}", created.RequestId);
        }

        // 5. Audit Log
        try
        {
            await _auditLogService.RecordAsync(
                requesterUserId,
                "SuspensionRequestSubmitted",
                "User",
                targetUser.UserId,
                $"Submitted suspension request for {targetUser.FullName} ({targetUser.EmployeeId}): {fullReason} (Duration: {durationStr})"
            );
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to record audit log for suspension request {RequestId}", created.RequestId);
        }

        return _mapper.Map<SuspensionRequestDto>(created);
    }

    public async Task<List<SuspensionRequestDto>> GetSuspensionRequestsAsync(int requesterUserId, string? status = null)
    {
        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == requesterUserId);
        bool canViewAll = user != null && (IsHRorSystemAdmin(user) || IsAdministrator(user));

        List<SuspensionRequest> requests;
        if (canViewAll)
        {
            requests = await _repo.GetAllAsync(status);
        }
        else
        {
            requests = await _repo.GetByRequesterIdAsync(requesterUserId, status);
        }

        return _mapper.Map<List<SuspensionRequestDto>>(requests);
    }

    public async Task<SuspensionRequestDto> ApproveSuspensionRequestAsync(int reviewerUserId, long requestId)
    {
        var reviewerUser = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == reviewerUserId);
        if (reviewerUser == null || !IsHRorSystemAdmin(reviewerUser))
        {
            throw new ForbiddenException("Only HR Administrators and System Administrators can approve employee account suspensions.");
        }

        var request = await _repo.GetByIdAsync(requestId);
        if (request == null)
        {
            throw new NotFoundException($"Suspension request #{requestId} was not found.");
        }

        if (request.Status != "Pending")
        {
            throw new BadRequestException($"Suspension request #{requestId} has already been {request.Status.ToLower()}.");
        }

        // 1. Execute account suspension on target user
        var targetUser = await _db.Users.FirstOrDefaultAsync(u => u.UserId == request.TargetUserId);
        if (targetUser != null)
        {
            targetUser.IsActive = false;
            targetUser.IsPermanentlySuspended = request.IsPermanent;

            if (request.IsPermanent)
            {
                targetUser.SuspendedUntil = null;
            }
            else if (request.CustomDate.HasValue && request.CustomDate.Value > KnomeTime.Now)
            {
                targetUser.SuspendedUntil = request.CustomDate.Value;
            }
            else if (request.DurationDays.HasValue && request.DurationDays.Value > 0)
            {
                targetUser.SuspendedUntil = KnomeTime.Now.AddDays(request.DurationDays.Value);
            }
            else
            {
                targetUser.SuspendedUntil = KnomeTime.Now.AddDays(7);
            }

            _db.Users.Update(targetUser);
            await _db.SaveChangesAsync();
        }

        // 2. Mark request as Approved
        request.Status = "Approved";
        request.ReviewedAt = KnomeTime.Now;
        request.ReviewedByUserId = reviewerUserId;
        request.ReviewedByName = reviewerUser.FullName;
        request.ReviewedByRole = reviewerUser.Roles.FirstOrDefault()?.RoleName ?? "HR Administrator";
        await _repo.UpdateAsync(request);

        // Auto-resolve any other pending requests for this same target user
        var duplicatePending = await _db.SuspensionRequests
            .Where(r => r.TargetUserId == request.TargetUserId && r.RequestId != requestId && r.Status == "Pending")
            .ToListAsync();
        foreach (var dup in duplicatePending)
        {
            dup.Status = "Approved";
            dup.ReviewedAt = KnomeTime.Now;
            dup.ReviewedByUserId = reviewerUserId;
            dup.ReviewedByName = reviewerUser.FullName;
            dup.ReviewedByRole = reviewerUser.Roles.FirstOrDefault()?.RoleName ?? "HR Administrator";
            dup.RejectionReason = null;
            await _repo.UpdateAsync(dup);
        }

        // 3. Notify requester
        try
        {
            await _notificationService.CreateNotificationAsync(new CreateNotificationDto
            {
                RecipientUserId = request.RequestedByUserId,
                NotificationType = "SuspensionApproved",
                Message = $"Your suspension request for {request.TargetFullName} was approved by {reviewerUser.FullName}. The account has been suspended.",
                RelatedContentType = "SuspensionRequest",
                ReferenceId = request.TargetUserId
            }, reviewerUserId);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to send approval notification for request {RequestId}", requestId);
        }

        // 4. Record audit log
        try
        {
            await _auditLogService.RecordAsync(
                reviewerUserId,
                "SuspensionRequestApproved",
                "User",
                request.TargetUserId,
                $"Approved suspension request #{requestId} for {request.TargetFullName}: {request.FullReason} (Duration: {request.Duration})"
            );
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to record audit log for approved suspension request {RequestId}", requestId);
        }

        return _mapper.Map<SuspensionRequestDto>(request);
    }

    public async Task<SuspensionRequestDto> RejectSuspensionRequestAsync(int reviewerUserId, long requestId, ReviewSuspensionRequestDto dto)
    {
        var reviewerUser = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.UserId == reviewerUserId);
        if (reviewerUser == null || !IsHRorSystemAdmin(reviewerUser))
        {
            throw new ForbiddenException("Only HR Administrators and System Administrators can decline suspension requests.");
        }

        var request = await _repo.GetByIdAsync(requestId);
        if (request == null)
        {
            throw new NotFoundException($"Suspension request #{requestId} was not found.");
        }

        if (request.Status != "Pending")
        {
            throw new BadRequestException($"Suspension request #{requestId} has already been {request.Status.ToLower()}.");
        }

        string rejectionReason = !string.IsNullOrWhiteSpace(dto?.Reason)
            ? dto.Reason.Trim()
            : "Declined per HR Administrator governance review.";

        request.Status = "Rejected";
        request.ReviewedAt = KnomeTime.Now;
        request.ReviewedByUserId = reviewerUserId;
        request.ReviewedByName = reviewerUser.FullName;
        request.ReviewedByRole = reviewerUser.Roles.FirstOrDefault()?.RoleName ?? "HR Administrator";
        request.RejectionReason = rejectionReason;

        await _repo.UpdateAsync(request);

        // Notify requester
        try
        {
            await _notificationService.CreateNotificationAsync(new CreateNotificationDto
            {
                RecipientUserId = request.RequestedByUserId,
                NotificationType = "SuspensionRejected",
                Message = $"Your suspension request for {request.TargetFullName} was declined by {reviewerUser.FullName}. Reason: \"{rejectionReason}\".",
                RelatedContentType = "SuspensionRequest",
                ReferenceId = request.TargetUserId
            }, reviewerUserId);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to send rejection notification for request {RequestId}", requestId);
        }

        // Audit Log
        try
        {
            await _auditLogService.RecordAsync(
                reviewerUserId,
                "SuspensionRequestRejected",
                "User",
                request.TargetUserId,
                $"Rejected suspension request #{requestId} for {request.TargetFullName}. Reason: {rejectionReason}"
            );
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to record audit log for rejected suspension request {RequestId}", requestId);
        }

        return _mapper.Map<SuspensionRequestDto>(request);
    }
}
