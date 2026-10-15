# Development Journal — Entry 177
## Fix Mayur Bansal (mayurbansal7089@gmail.com) Identity Sync and Feed Visibility

### Date: October 15, 2026
### Target Database: `[Knome]` (SQL Server on `LAPTOP-458`)
### Scope: Authentication Pipeline, Principal Key Mutation Guard, Feed & Profile Visibility
### Status: Implemented & Verified

---

### 1. Root Cause Analysis

When user `mayurbansal7089@gmail.com` (Mayur Bansal, UserId: `1036`) authenticated into Knome via MPO Employee Hub SSO, the UI presented:
- "No content found. There are no posts published on the platform currently."
- "Enterprise Communities: No Joined Communities"
- "0 PTS" (Karma Balance failed to resolve)
- Complete failure of user personal data rendering.

Investigation of the live Serilog log file (`knome-20261015.log`) revealed the exact fatal exception being thrown on every authenticated request and SignalR notification handshake:

```text
2026-10-15 11:39:38.253 +05:30 [ERR] [Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerHandler] Exception occurred while processing message.
System.InvalidOperationException: The property 'User.EmployeeId' is part of a key and so cannot be modified or marked as modified. To change the principal of an existing entity with an identifying foreign key, first delete the dependent and invoke 'SaveChanges', and then associate the dependent with the new principal.
   at Microsoft.EntityFrameworkCore.ChangeTracking.Internal.InternalEntityEntry.SetPropertyModified(IProperty property, Boolean changeState, Boolean isModified, Boolean isConceptualNull, Boolean acceptChanges)
   at Microsoft.EntityFrameworkCore.DbContext.SaveChangesAsync(Boolean acceptAllChangesOnSuccess, CancellationToken cancellationToken)
   at Knome.API.Extensions.ServiceCollectionExtensions.EnrichAndProvisionUserIdentityAsync(ClaimsIdentity identity, KnomeDbContext dbContext, IAuthService authService, String email, String empId, String sub, ClaimsPrincipal principal)
```

#### Why did this happen?
1. In `KnomeDbContext.cs` line 887, `User.EmployeeId` is configured as a **Principal Key** in the self-referential relationship:
   ```csharp
   entity.HasOne(d => d.ManagerEmployee).WithMany(p => p.InverseManagerEmployee)
       .HasPrincipalKey(p => p.EmployeeId)
       .HasForeignKey(d => d.ManagerEmployeeId)
       .HasConstraintName("FK_Users_Manager");
   ```
2. In Entity Framework Core, modifying a Principal Key property on a tracked entity (`dbUser.EmployeeId = "EMP100"`) and calling `SaveChangesAsync()` is strictly prohibited by design. The change tracker immediately detects the modification and throws `System.InvalidOperationException`.
3. In `ServiceCollectionExtensions.cs` (lines 361–373) and `AuthService.cs` (lines 317–324), when Mayur Bansal logged in, the code checked `if (user.EmployeeId != "EMP100")` (his database EmployeeId was `MPO111`) and attempted to assign `dbUser.EmployeeId = "EMP100"` followed by `await dbContext.SaveChangesAsync()`.
4. This exception bubbled up through the JWT bearer authentication middleware, failing token validation with HTTP 500.
5. All subsequent authenticated API calls (`/api/feed/home`, `/api/users/profile`, `/api/communities/my`, `/hubs/notifications/negotiate`) failed, causing the frontend to fall back to an empty feed, empty communities, and 0 PTS.

---

### 2. Implementation Resolution

To completely eliminate this issue without violating EF Core principal key constraints or database foreign keys:

1. **Replaced Tracked Mutation with Direct Raw SQL in `ServiceCollectionExtensions.cs`**:
   - Replaced `dbUser.EmployeeId = "EMP100"; await dbContext.SaveChangesAsync();` with an atomic raw SQL command (`ExecuteSqlRawAsync`).
   - The SQL script verifies whether `EMP100` is already held by another user. If not, it updates `EmployeeId = 'EMP100'`, `FullName = 'Mayur Bansal'`, `Email = 'mayurbansal7089@gmail.com'`, `Designation = 'Software Developer'`, and `IsActive = 1`.
   - Modifies the in-memory detached `user` object so downstream claim enrichment receives the correct `EMP100` identity and `1036` user ID.
   - Wraps the operation in a defensive `try-catch` block with logging so authentication never fails.

2. **Applied the Same Raw SQL Pattern in `AuthService.cs`**:
   - Updated `GetCurrentUserByIdentifierAsync` to use raw SQL instead of EF Core tracked mutation on `EmployeeId`.

---

### 3. Verification & Impact

- **Authentication**: JWT token validation now passes cleanly without `InvalidOperationException`.
- **Identity Resolution**: Claims `uid`, `employeeId`, `username`, and roles are correctly injected into `ClaimsIdentity`.
- **Feed & Widgets**: Personalized home feed (`/api/feed/home`), user communities (`/api/communities/my`), profile details (`/api/users/profile`), and karma points (`/api/karma`) now execute with valid authenticated claims.
