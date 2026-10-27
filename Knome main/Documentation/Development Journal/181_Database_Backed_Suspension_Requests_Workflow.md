# Development Journal — Entry 181: Database-Backed Suspension Requests Workflow & Governance Integration

## Date & Author
- **Date**: 2026-10-27
- **Author**: Antigravity Pair Programmer
- **Scope**: Database Architecture, Backend API, Role-Based Access Control & Frontend Data Binding for Suspension Requests

---

## 1. Objectives & Executive Summary
1. **Replace LocalStorage-Based Suspension Requests**: Previously, Moderator suspension requests were stored in client browser `localStorage` and encoded in notification payloads (`__KNOME_PAYLOAD__`). This caused requests to disappear across different user sessions, devices, and InPrivate windows, leaving the HR Administrator with 0 pending requests.
2. **Database Schema Creation (`[dbo].[SuspensionRequests]`)**: Implement a dedicated, enterprise-grade relational table in SQL Server `Knome` database to persistently record suspension proposals, duration, reason, requester, reviewer, status (`Pending`, `Approved`, `Rejected`), and timestamps.
3. **Backend API Endpoints & Role-Based Authorization**:
   - `GET /api/users/suspension-requests?status={status}`: Gated to `HR Administrator` and `System Administrator`.
   - `POST /api/users/suspension-requests`: Authorized for `Moderator`, `HR Administrator`, and `System Administrator`.
   - `POST /api/users/suspension-requests/{id}/approve`: Gated to `HR Administrator` and `System Administrator` — executes user suspension, updates request status, records audit log, and notifies stakeholders.
   - `POST /api/users/suspension-requests/{id}/reject`: Gated to `HR Administrator` and `System Administrator` — records rejection reason and notifies the moderator.
4. **Frontend Integration & Real-Time Sync (`AdminConsole.jsx` & `apiService.js`)**:
   - Wire `syncSuspensionRequestsFromBackend` to call `adminApi.getSuspensionRequests('All')`.
   - Update `handleConfirmSuspend` for non-HR administrators to submit suspension proposals directly to the backend API.
   - Update `handleApproveSuspensionRequest` and `handleRejectSuspensionRequest` to interact with backend endpoints.
   - Bind request cards with real employee information (full name, avatar, employee ID, designation, department), requester details, category/reason, duration, submission date, and status chips.
   - Ensure dynamic metric counters (`All Requests`, `Pending HR`, `Approved`, `Rejected`) and the top tab badge accurately reflect live database counts.
5. **Community Scope Safeguard**: Ensure community-level member suspensions in `SuspendUserModal.jsx` remain scoped to communities and do not route to HR governance approval.

---

## 2. Technical Architecture & Implementation Details

### A. Database Layer (`[dbo].[SuspensionRequests]`)
- **Table Definition**:
  ```sql
  CREATE TABLE [dbo].[SuspensionRequests] (
      [RequestId] INT IDENTITY(1,1) NOT NULL,
      [UserId] INT NOT NULL,
      [RequestedByUserId] INT NOT NULL,
      [ReviewedByUserId] INT NULL,
      [Duration] NVARCHAR(50) NOT NULL,
      [SuspendedUntil] DATETIME2(7) NULL,
      [ReasonCategory] NVARCHAR(150) NOT NULL,
      [ReasonNote] NVARCHAR(1000) NULL,
      [Status] NVARCHAR(50) NOT NULL CONSTRAINT [DF_SuspensionRequests_Status] DEFAULT ('Pending'),
      [RejectionReason] NVARCHAR(1000) NULL,
      [CreatedAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_SuspensionRequests_CreatedAt] DEFAULT (sysdatetime()),
      [ReviewedAt] DATETIME2(7) NULL,
      CONSTRAINT [PK_SuspensionRequests] PRIMARY KEY CLUSTERED ([RequestId] ASC),
      CONSTRAINT [FK_SuspensionRequests_TargetUser] FOREIGN KEY ([UserId]) REFERENCES [dbo].[Users] ([UserId]),
      CONSTRAINT [FK_SuspensionRequests_RequestedByUser] FOREIGN KEY ([RequestedByUserId]) REFERENCES [dbo].[Users] ([UserId]),
      CONSTRAINT [FK_SuspensionRequests_ReviewedByUser] FOREIGN KEY ([ReviewedByUserId]) REFERENCES [dbo].[Users] ([UserId])
  );
  ```
- **Indexes**:
  - `IX_SuspensionRequests_Status_CreatedAt` for high-performance tab and queue filtering.
  - `IX_SuspensionRequests_UserId` for tracking user suspension proposal history.
  - `IX_SuspensionRequests_RequestedByUserId` for moderator queue attribution.
- **Migration & Startup Seeding**:
  - Migration script: `Documentation/Database/Create_Suspension_Requests_Table.sql`.
  - Application startup initializer: `Backend/Knome.API/Data/SuspensionRequestDbInitializer.cs`, invoked during startup via `START_KNOME.ps1` and `ApplicationBuilderExtensions.cs`.

### B. Backend API Architecture
- **Entity Model**: `Backend/Knome.API/Models/SuspensionRequest.cs` with full EF Core navigation properties (`TargetUser`, `RequestedByUser`, `ReviewedByUser`).
- **DbContext Extension**: `Backend/Knome.API/Data/KnomeDbContext.SuspensionRequests.cs` defining `DbSet<SuspensionRequest> SuspensionRequests` and Fluent API configurations.
- **DTOs**:
  - `CreateSuspensionRequestDto.cs`: Target `UserId`, `Duration`, `ReasonCategory`, `ReasonNote`, `CustomEndDate`.
  - `SuspensionRequestDto.cs`: Comprehensive output model including target employee details (`EmployeeId`, `FullName`, `ProfilePhotoUrl`, `Designation`, `Department`), requester details, status, review timestamps, and rejection note.
  - `ReviewSuspensionRequestDto.cs`: `RejectionReason` (optional on approval, required on rejection).
- **AutoMapper (`UserProfile.cs`)**:
  - Mapped entity fields with explicit fallback mapping for `EmployeeId`, `FullName`, `Designation`, and `Department`.
- **Repository Pattern (`SuspensionRequestRepository.cs`)**:
  - `GetByIdAsync(int id)`: Eagerly loads navigation properties (`TargetUser`, `RequestedByUser`, `ReviewedByUser`).
  - `GetAllAsync(string? status)`: Dynamic query filtering by status with newest first ordering (`CreatedAt DESC`).
  - `AddAsync(SuspensionRequest request)`: Persists new request to SQL Server.
  - `UpdateAsync(SuspensionRequest request)`: Commits status, review timestamps, and notes.
- **Service Layer (`SuspensionRequestService.cs`)**:
  - **`CreateAsync`**:
    - Validates target employee exists and is not a protected administrator.
    - Resolves duration (`24h`, `3d`, `7d`, `14d`, `30d`, `Indefinite`, or custom date) to `SuspendedUntil` timestamp.
    - Saves request with `Status = "Pending"`.
    - Dispatches in-app notification to all HR Administrators.
  - **`ApproveAsync`**:
    - Validates request is in `Pending` state.
    - Marks `Status = "Approved"`, `ReviewedByUserId`, `ReviewedAt = KnomeTime.Now`.
    - Invokes `IUserRepository.UpdateAsync` on the target employee: sets `IsActive = false` and `SuspendedUntil`.
    - Logs governance audit event via `IAuditLogService` (`Action = "UserSuspended"`, `Category = "Governance"`).
    - Dispatches confirmation notification to the proposing Moderator and target employee.
  - **`RejectAsync`**:
    - Validates request is in `Pending` state.
    - Marks `Status = "Rejected"`, sets `RejectionReason`, `ReviewedByUserId`, `ReviewedAt = KnomeTime.Now`.
    - Logs governance audit event via `IAuditLogService` (`Action = "SuspensionRequestRejected"`).
    - Dispatches notification to proposing Moderator with the rejection explanation.
- **REST Endpoints (`UserController.cs`)**:
  - `GET /api/users/suspension-requests?status={status}`: `[Authorize(Roles = $"{Roles.HRAdmin},{Roles.SystemAdmin}")]`
  - `POST /api/users/suspension-requests`: `[Authorize(Roles = $"{Roles.Moderator},{Roles.HRAdmin},{Roles.SystemAdmin}")]`
  - `POST /api/users/suspension-requests/{id}/approve`: `[Authorize(Roles = $"{Roles.HRAdmin},{Roles.SystemAdmin}")]`
  - `POST /api/users/suspension-requests/{id}/reject`: `[Authorize(Roles = $"{Roles.HRAdmin},{Roles.SystemAdmin}")]`

### C. Frontend Architecture & Binding
- **API Client (`apiService.js`)**:
  - `adminApi.getSuspensionRequests(status)`
  - `adminApi.createSuspensionRequest(payload)`
  - `adminApi.approveSuspensionRequest(id)`
  - `adminApi.rejectSuspensionRequest(id, rejectionReason)`
- **Admin Console (`AdminConsole.jsx`)**:
  - Updated `syncSuspensionRequestsFromBackend` to call `adminApi.getSuspensionRequests('All')`.
  - Dynamic metric cards:
    - `All Requests`: Total request count.
    - `Pending HR`: Requests with `status === 'Pending'`.
    - `Approved`: Requests with `status === 'Approved'`.
    - `Rejected`: Requests with `status === 'Rejected'`.
  - Top tab counter badge: Dynamically displays pending count in `#requests` tab button.
  - Interactive Actions:
    - "Approve & Suspend": Invokes `handleApproveSuspensionRequest`, immediately updating user status and request status.
    - "Reject": Opens prompt/modal for rejection explanation and invokes `handleRejectSuspensionRequest`.
  - Reinstatement / Reactivate: Calls `adminApi.activateUser(userId)` to restore suspended accounts.
- **Community Isolation (`SuspendUserModal.jsx`)**:
  - Guarded `isCommunityScope` so community-level member suspensions bypass HR governance and execute direct community actions.

---

## 3. End-to-End Verification & Results

1. **Moderator Proposal Submission**:
   - Authenticated as Moderator `Deepak Simrodia` (`UserId 1057`, `MPO652`).
   - Submitted suspension request for Employee `Mayur Bansal` (`UserId 1036`, `EMP100`).
   - **Result**: Request #4 created in SQL Server `[dbo].[SuspensionRequests]` with `Status = 'Pending'`, `Duration = '7 Days'`, `ReasonCategory = 'Violation of community guidelines'`.
2. **HR Administrator Review & Approval**:
   - Authenticated as HR Administrator `Meghna Tiwari` (`UserId 5`, `Emp101`).
   - Retrieved pending suspension requests via `GET /api/users/suspension-requests?status=All`.
   - Executed approval via `POST /api/users/suspension-requests/4/approve`.
   - **Result**: Request #4 status updated to `Approved`, `ReviewedByUserId = 5`. Target employee `Mayur Bansal` (`UserId 1036`) updated in `[dbo].[Users]` to `IsActive = False` and `SuspendedUntil = 2026-11-03T04:52:18.846Z`.
3. **Rejection Workflow**:
   - Submitted second suspension request (Request #5) for `Mayur Bansal`.
   - HR Admin rejected Request #5 with note: `"First-time minor infraction; issue addressed via counseling session."`.
   - **Result**: Request #5 status updated to `Rejected`, `RejectionReason` persisted in SQL Server, employee remained in current active status.
4. **Compilation & Builds**:
   - Backend: `dotnet build "Knome main/Backend/Knome.API" -nologo` succeeded with 0 errors.
   - Frontend: `npm run build` in `knomeUI/frontend` built in 1.48s with 0 errors.
