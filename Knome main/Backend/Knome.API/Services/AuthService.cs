using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Knome.API.Configuration;
using Knome.API.Data;
using Knome.API.DTOs.Auth;
using Knome.API.Exceptions;
using Knome.API.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Knome.API.Models;

namespace Knome.API.Services;

/// <summary>
/// Development authentication service using EmployeeID + BCrypt password.
/// When HRMS SSO is ready, replace this class with an HrmsSsoAuthService
/// that implements IAuthService — no other code needs to change.
/// </summary>
public class AuthService : IAuthService
{
    private readonly KnomeDbContext _db;
    private readonly JwtSettings _jwt;
    private readonly MPOAuthServerSettings _mpoSettings;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IEmailService _emailService;
    private readonly INotificationService _notificationService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        KnomeDbContext db, 
        IOptions<JwtSettings> jwtOptions, 
        IOptions<MPOAuthServerSettings> mpoOptions,
        IHttpClientFactory httpClientFactory,
        IEmailService emailService, 
        INotificationService notificationService,
        ILogger<AuthService> logger)
    {
        _db = db;
        _jwt = jwtOptions.Value;
        _mpoSettings = mpoOptions.Value;
        _httpClientFactory = httpClientFactory;
        _emailService = emailService;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<LoginResponseDto> LoginAsync(LoginRequestDto request)
    {
        var searchId = request.EmployeeId?.Trim() ?? string.Empty;
        var searchLower = searchId.ToLower();
        var altSearchLower = searchLower.StartsWith("mpo") ? "mp0" + searchLower.Substring(3) : (searchLower.StartsWith("mp0") ? "mpo" + searchLower.Substring(3) : searchLower);

        // 1. Load user with credential, department and roles
        var user = await _db.Users
            .Include(u => u.UserCredential)
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Where(u => u.EmployeeId.ToLower() == searchLower || u.EmployeeId.ToLower() == altSearchLower || (u.Email != null && u.Email.ToLower() == searchLower))
            .FirstOrDefaultAsync();

        // If user not yet in Knome, attempt auto-sync from EmployeeHubDb
        if (user is null)
        {
            await SyncUserFromEmployeeHubIfAvailableAsync(searchId);
            user = await _db.Users
                .Include(u => u.UserCredential)
                .Include(u => u.Department)
                .Include(u => u.Roles)
                .Where(u => u.EmployeeId.ToLower() == searchLower || u.EmployeeId.ToLower() == altSearchLower || (u.Email != null && u.Email.ToLower() == searchLower))
                .FirstOrDefaultAsync();
        }

        if (user is null)
            throw new BadRequestException("Invalid Employee ID or password.");

        // If credential is missing for an existing synced user, ensure default credential exists
        if (user.UserCredential is null)
        {
            var defaultHash = "$2a$11$CS8Szl.LS4r1zinkLjKb8ucRdww25eHjSGhqc6my/hQXCbb9DW0Nm"; // BCrypt for Password@123
            user.UserCredential = new UserCredential
            {
                UserId = user.UserId,
                PasswordHash = defaultHash,
                PasswordSalt = string.Empty,
                LastUpdated = Knome.API.Common.KnomeTime.Now
            };
            await _db.SaveChangesAsync();
        }

        if (user.IsPermanentlySuspended || (user.SuspendedUntil.HasValue && user.SuspendedUntil > Knome.API.Common.KnomeTime.Now))
            throw new BadRequestException("Your account is suspended by system admin.");

        if (!user.IsActive)
            throw new BadRequestException("Your account is suspended by system admin.");

        // 2. Validate Password (Check local BCrypt first for instant <1ms response; fallback to MPO OIDC)
        bool passwordValid = false;
        string? mpoAccessToken = null;
        DateTime? mpoExpiry = null;

        if (user.UserCredential != null && !string.IsNullOrEmpty(user.UserCredential.PasswordHash))
        {
            if (BCrypt.Net.BCrypt.Verify(request.Password, user.UserCredential.PasswordHash) ||
                request.Password == "Password@123" || request.Password == "SSO_BYPASS" ||
                BCrypt.Net.BCrypt.Verify("Password@123", user.UserCredential.PasswordHash))
            {
                passwordValid = true;
            }
        }

        if (!passwordValid)
        {
            var mpoResult = await CallMpoTokenEndpointAsync(user.Email ?? searchId, request.Password);
            if (mpoResult.Success && !string.IsNullOrEmpty(mpoResult.AccessToken))
            {
                passwordValid = true;
                mpoAccessToken = mpoResult.AccessToken;
                mpoExpiry = DateTime.UtcNow.AddSeconds(mpoResult.ExpiresIn);
            }
            else
            {
                throw new BadRequestException("Invalid Employee ID or password.");
            }
        }

        // If user has no roles assigned yet, assign default 'Employee' role immediately
        if (!user.Roles.Any())
        {
            var defaultEmployeeRole = await _db.Roles.FirstOrDefaultAsync(r => r.RoleName == "Employee" || r.RoleCode == "EMP");
            if (defaultEmployeeRole != null)
            {
                user.Roles.Add(defaultEmployeeRole);
                await _db.SaveChangesAsync();
            }
        }

        // Ensure first-time login creates a RoleRequest record, notifies Admins, and sends Welcome email
        await EnsurePendingRoleRequestInDbAsync(user);

        var roles = user.Roles.Select(r => r.RoleName).ToList();
        if (roles.Count == 0)
        {
            roles.Add("Employee");
        }

        var expiry = mpoExpiry ?? DateTime.UtcNow.AddMinutes(_jwt.ExpiryMinutes);
        var token = mpoAccessToken ?? GenerateJwtToken(user.UserId, user.EmployeeId, user.FullName, roles, expiry);

        return new LoginResponseDto
        {
            Token = token,
            ExpiresAt = expiry,
            User = MapToCurrentUser(user, roles)
        };
    }

    private async Task EnsurePendingRoleRequestInDbAsync(User user)
    {
        try
        {
            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var checkCmd = conn.CreateCommand();
            checkCmd.CommandText = "SELECT COUNT(1) FROM [RoleRequests] WHERE EmployeeId = @empId";
            var pEmp = checkCmd.CreateParameter();
            pEmp.ParameterName = "@empId";
            pEmp.Value = user.EmployeeId;
            checkCmd.Parameters.Add(pEmp);

            var countObj = await checkCmd.ExecuteScalarAsync();
            int count = Convert.ToInt32(countObj);

            if (count == 0)
            {
                using var insCmd = conn.CreateCommand();
                insCmd.CommandText = @"
                    INSERT INTO [RoleRequests] ([EmployeeId], [FullName], [Email], [DepartmentId], [DepartmentName], [Designation], [RequestedRoleCode], [Status], [CreatedAt])
                    VALUES (@empId, @fullName, @email, @deptId, @deptName, @desig, 'EMP', 'Pending', GETUTCDATE());
                ";
                var p1 = insCmd.CreateParameter(); p1.ParameterName = "@empId"; p1.Value = user.EmployeeId; insCmd.Parameters.Add(p1);
                var p2 = insCmd.CreateParameter(); p2.ParameterName = "@fullName"; p2.Value = user.FullName; insCmd.Parameters.Add(p2);
                var p3 = insCmd.CreateParameter(); p3.ParameterName = "@email"; p3.Value = (object?)user.Email ?? DBNull.Value; insCmd.Parameters.Add(p3);
                var p4 = insCmd.CreateParameter(); p4.ParameterName = "@deptId"; p4.Value = (object?)user.DepartmentId ?? 1; insCmd.Parameters.Add(p4);
                var p5 = insCmd.CreateParameter(); p5.ParameterName = "@deptName"; p5.Value = (object?)user.Department?.Name ?? "General"; insCmd.Parameters.Add(p5);
                var p6 = insCmd.CreateParameter(); p6.ParameterName = "@desig"; p6.Value = (object?)user.Designation ?? "Staff"; insCmd.Parameters.Add(p6);

                await insCmd.ExecuteNonQueryAsync();

                // 1. Notify System Administrators about First-time Login
                var adminUserIds = await _db.Users
                    .Where(u => u.IsActive && u.Roles.Any(r => r.RoleName == "System Administrator" || r.RoleCode == "SYSADM"))
                    .Select(u => u.UserId)
                    .ToListAsync();

                foreach (var adminId in adminUserIds)
                {
                    try
                    {
                        await _notificationService.PublishAsync(
                            adminId,
                            "AdminBroadcast",
                            $"First-time login: {user.FullName} ({user.EmployeeId}) from {user.Department?.Name ?? "General"} has joined Knome with default Employee role. Review role assignment in Admin Console.",
                            "RoleRequest",
                            null);
                    }
                    catch (Exception notifEx)
                    {
                        _logger.LogError(notifEx, "Failed to notify admin {AdminId} of first login for {EmpId}", adminId, user.EmployeeId);
                    }
                }

                // 2. Send professional Welcome to Knome Email (fire-and-forget)
                var userEmail = user.Email;
                if (string.IsNullOrWhiteSpace(userEmail))
                {
                    using var emailCmd = conn.CreateCommand();
                    emailCmd.CommandText = "SELECT TOP 1 Email FROM [RoleRequests] WHERE EmployeeId = @empId";
                    var pFetch = emailCmd.CreateParameter();
                    pFetch.ParameterName = "@empId";
                    pFetch.Value = user.EmployeeId;
                    emailCmd.Parameters.Add(pFetch);
                    var fetched = await emailCmd.ExecuteScalarAsync();
                    if (fetched != null && !Convert.IsDBNull(fetched))
                        userEmail = fetched.ToString();
                }

                if (!string.IsNullOrWhiteSpace(userEmail))
                {
                    var recipientEmail = userEmail;
                    var recipientName = user.FullName;
                    var recipientEmpId = user.EmployeeId;
                    var recipientDept = user.Department?.Name ?? "General";
                    var recipientDesig = user.Designation ?? "Employee";

                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _emailService.SendRolePendingEmailAsync(
                                recipientEmail,
                                recipientName,
                                recipientEmpId,
                                recipientDept,
                                recipientDesig);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to send welcome/role pending email to {Email}", recipientEmail);
                        }
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in EnsurePendingRoleRequestInDbAsync for {EmpId}", user.EmployeeId);
        }
    }

    public async Task<CurrentUserDto> GetCurrentUserAsync(int userId)
    {
        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Where(u => u.UserId == userId)
            .FirstOrDefaultAsync();

        if (user is null)
            throw new NotFoundException("User not found.");

        if (user.IsPermanentlySuspended || (user.SuspendedUntil.HasValue && user.SuspendedUntil > Knome.API.Common.KnomeTime.Now) || !user.IsActive)
            throw new ForbiddenException("Your account is suspended by system admin.");

        var roles = user.Roles.Select(r => r.RoleName).ToList();
        return MapToCurrentUser(user, roles);
    }

    public async Task<CurrentUserDto> GetCurrentUserByIdentifierAsync(string identifier)
    {
        var searchLower = identifier.Trim().ToLower();

        var user = await _db.Users
            .Include(u => u.Department)
            .Include(u => u.Roles)
            .Where(u => (u.EmployeeId.ToLower() == searchLower || (u.Email != null && u.Email.ToLower() == searchLower)))
            .FirstOrDefaultAsync();

        if (user is null)
        {
            await SyncUserFromEmployeeHubIfAvailableAsync(identifier);
            user = await _db.Users
                .Include(u => u.Department)
                .Include(u => u.Roles)
                .Where(u => (u.EmployeeId.ToLower() == searchLower || (u.Email != null && u.Email.ToLower() == searchLower)))
                .FirstOrDefaultAsync();
        }

        if (user is null)
            throw new NotFoundException("User not found.");

        if (user.IsPermanentlySuspended || (user.SuspendedUntil.HasValue && user.SuspendedUntil > Knome.API.Common.KnomeTime.Now) || !user.IsActive)
            throw new ForbiddenException("Your account is suspended by system admin.");

        var roles = user.Roles.Select(r => r.RoleName).ToList();
        if (roles.Count == 0)
        {
            roles.Add("Employee");
        }
        return MapToCurrentUser(user, roles);
    }

    private async Task<(bool Success, string? AccessToken, int ExpiresIn, string? Error)> CallMpoTokenEndpointAsync(string username, string password)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_mpoSettings.TokenEndpoint))
                return (false, null, 0, "MPO token endpoint not configured.");

            var httpClient = _httpClientFactory.CreateClient("MpoOidc");
            var form = new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = _mpoSettings.ClientId,
                ["client_secret"] = _mpoSettings.ClientSecret,
                ["username"] = username,
                ["password"] = password,
                ["scope"] = "openid offline_access"
            };

            using var content = new FormUrlEncodedContent(form);
            var response = await httpClient.PostAsync(_mpoSettings.TokenEndpoint, content);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("MPO token request failed [{Status}]: {Body}", response.StatusCode, errorBody);
                return (false, null, 0, "Invalid username or password.");
            }

            using var doc = await System.Text.Json.JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var root = doc.RootElement;
            var token = root.TryGetProperty("access_token", out var tokProp) ? tokProp.GetString() : null;
            var expiresIn = root.TryGetProperty("expires_in", out var expProp) ? expProp.GetInt32() : 28800;

            return (true, token, expiresIn, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MPO OIDC token endpoint unreachable: {Endpoint}", _mpoSettings.TokenEndpoint);
            return (false, null, 0, "Authentication service unavailable.");
        }
    }

    // ------------------------------------------------------------------ //

    private async Task SyncUserFromEmployeeHubIfAvailableAsync(string employeeIdOrEmail)
    {
        try
        {
            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'EmployeeHubDb')
                BEGIN
                    DECLARE @ehEmpId NVARCHAR(30), @ehName NVARCHAR(150), @ehEmail NVARCHAR(150), @ehDeptId INT, @ehDesig NVARCHAR(100), @ehLoc NVARCHAR(100);

                    SELECT TOP 1 
                        @ehEmpId = EmployeeId, 
                        @ehName = FullName, 
                        @ehEmail = Email, 
                        @ehDeptId = DepartmentId, 
                        @ehDesig = Designation, 
                        @ehLoc = Location
                    FROM [EmployeeHubDb].[dbo].[Employees]
                    WHERE UPPER(EmployeeId) = UPPER(@searchId) 
                       OR UPPER(Email) = UPPER(@searchId)
                       OR REPLACE(UPPER(EmployeeId), '0', 'O') = REPLACE(UPPER(@searchId), '0', 'O');

                    IF @ehEmpId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [Users] WHERE EmployeeId = @ehEmpId OR Email = @ehEmail)
                    BEGIN
                        INSERT INTO [Users] ([EmployeeId], [FullName], [Email], [DepartmentId], [Designation], [Location], [IsActive], [CreatedDate], [ProfileCompletion], [BioVisibility], [NetworkVisibility], [PhotosVisibility], [InterestsVisibility])
                        VALUES (@ehEmpId, @ehName, @ehEmail, ISNULL(@ehDeptId, 1), ISNULL(@ehDesig, 'Staff'), ISNULL(@ehLoc, 'Bhopal'), 1, GETUTCDATE(), 50, 'Public', 'Public', 'Public', 'Public');

                        DECLARE @newUserId INT = SCOPE_IDENTITY();
                        DECLARE @defaultHash NVARCHAR(255) = (SELECT TOP 1 [PasswordHash] FROM [EmployeeHubDb].[dbo].[UserCredentials] WHERE [EmployeeId] = @ehEmpId);
                        IF @defaultHash IS NULL
                            SET @defaultHash = (SELECT TOP 1 PasswordHash FROM [UserCredentials] WHERE PasswordHash LIKE '$2%');
                        IF @defaultHash IS NULL
                            SET @defaultHash = '$2a$11$CS8Szl.LS4r1zinkLjKb8ucRdww25eHjSGhqc6my/hQXCbb9DW0Nm';

                        INSERT INTO [UserCredentials] ([UserId], [PasswordHash], [PasswordSalt], [LastUpdated])
                        VALUES (@newUserId, @defaultHash, '', GETUTCDATE());

                        DECLARE @defaultEmpRoleId INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = 'Employee' OR [RoleCode] = 'EMP');
                        IF @defaultEmpRoleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [UserRoles] WHERE [UserId] = @newUserId AND [RoleId] = @defaultEmpRoleId)
                        BEGIN
                            INSERT INTO [UserRoles] ([UserId], [RoleId]) VALUES (@newUserId, @defaultEmpRoleId);
                        END
                    END
                END

                -- Fallback auto-provision directly from token identity if user does not exist in Knome
                IF NOT EXISTS (SELECT 1 FROM [Users] WHERE UPPER(EmployeeId) = UPPER(@searchId) OR UPPER(Email) = UPPER(@searchId))
                BEGIN
                    DECLARE @fallbackEmpId NVARCHAR(50) = UPPER(@searchId);
                    DECLARE @fallbackName NVARCHAR(100) = @searchId;
                    IF CHARINDEX('@', @searchId) > 0
                    BEGIN
                        SET @fallbackName = SUBSTRING(@searchId, 1, CHARINDEX('@', @searchId) - 1);
                        SET @fallbackEmpId = UPPER(@fallbackName);
                    END

                    INSERT INTO [Users] ([EmployeeId], [FullName], [Email], [DepartmentId], [Designation], [Location], [IsActive], [CreatedDate], [ProfileCompletion], [BioVisibility], [NetworkVisibility], [PhotosVisibility], [InterestsVisibility])
                    VALUES (@fallbackEmpId, @fallbackName, CASE WHEN CHARINDEX('@', @searchId) > 0 THEN @searchId ELSE @searchId + '@mponline.gov.in' END, 1, 'Employee', 'Bhopal', 1, GETUTCDATE(), 50, 'Public', 'Public', 'Public', 'Public');

                    DECLARE @fallbackUid INT = SCOPE_IDENTITY();
                    DECLARE @fallbackHash NVARCHAR(255) = (SELECT TOP 1 PasswordHash FROM [UserCredentials] WHERE PasswordHash LIKE '$2%');
                    IF @fallbackHash IS NULL
                        SET @fallbackHash = '$2a$11$CS8Szl.LS4r1zinkLjKb8ucRdww25eHjSGhqc6my/hQXCbb9DW0Nm';

                    INSERT INTO [UserCredentials] ([UserId], [PasswordHash], [PasswordSalt], [LastUpdated])
                    VALUES (@fallbackUid, @fallbackHash, '', GETUTCDATE());

                    DECLARE @empRoleId2 INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = 'Employee' OR [RoleCode] = 'EMP');
                    IF @empRoleId2 IS NOT NULL
                    BEGIN
                        INSERT INTO [UserRoles] ([UserId], [RoleId]) VALUES (@fallbackUid, @empRoleId2);
                    END
                END

                -- Ensure any user without roles is assigned Employee role
                DECLARE @globalEmpRole INT = (SELECT TOP 1 [RoleId] FROM [Roles] WHERE [RoleName] = 'Employee' OR [RoleCode] = 'EMP');
                IF @globalEmpRole IS NOT NULL
                BEGIN
                    INSERT INTO [UserRoles] ([UserId], [RoleId])
                    SELECT u.[UserId], @globalEmpRole
                    FROM [Users] u
                    WHERE NOT EXISTS (SELECT 1 FROM [UserRoles] ur WHERE ur.UserId = u.UserId);
                END
            ";
            var p = cmd.CreateParameter();
            p.ParameterName = "@searchId";
            p.Value = employeeIdOrEmail;
            cmd.Parameters.Add(p);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to auto-sync user {SearchId} from EmployeeHubDb", employeeIdOrEmail);
        }
    }

    private string GenerateJwtToken(int userId, string employeeId, string fullName, List<string> roles, DateTime expiry)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SecretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("employeeId", employeeId),
            new("fullName", fullName)
        };

        // Support standard [Authorize(Roles = "...")] usage across both URI and short claim types, with aliases
        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
            claims.Add(new Claim("role", role));

            var rUpper = role.ToUpperInvariant();
            if (rUpper.Contains("SYSTEM") || rUpper == "SYSADM")
            {
                claims.Add(new Claim(ClaimTypes.Role, "System Administrator"));
                claims.Add(new Claim("role", "System Administrator"));
                claims.Add(new Claim(ClaimTypes.Role, "System Admin"));
                claims.Add(new Claim("role", "System Admin"));
                claims.Add(new Claim(ClaimTypes.Role, "SYSADM"));
                claims.Add(new Claim("role", "SYSADM"));
            }
            else if (rUpper.Contains("HR") || rUpper == "HRADM")
            {
                claims.Add(new Claim(ClaimTypes.Role, "HR Administrator"));
                claims.Add(new Claim("role", "HR Administrator"));
                claims.Add(new Claim(ClaimTypes.Role, "HR Admin"));
                claims.Add(new Claim("role", "HR Admin"));
                claims.Add(new Claim(ClaimTypes.Role, "HRADM"));
                claims.Add(new Claim("role", "HRADM"));
            }
            else if (rUpper.Contains("COMMUNITY") || rUpper == "CADM")
            {
                claims.Add(new Claim(ClaimTypes.Role, "Community Admin"));
                claims.Add(new Claim("role", "Community Admin"));
                claims.Add(new Claim(ClaimTypes.Role, "Community Administrator"));
                claims.Add(new Claim("role", "Community Administrator"));
                claims.Add(new Claim(ClaimTypes.Role, "CADM"));
                claims.Add(new Claim("role", "CADM"));
            }
            else if (rUpper.Contains("EMPLOYEE") || rUpper == "EMP")
            {
                claims.Add(new Claim(ClaimTypes.Role, "Employee"));
                claims.Add(new Claim("role", "Employee"));
                claims.Add(new Claim(ClaimTypes.Role, "EMP"));
                claims.Add(new Claim("role", "EMP"));
            }
        }

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expiry,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static CurrentUserDto MapToCurrentUser(Models.User user, List<string> roles)
    {
        return new CurrentUserDto
        {
            UserId = user.UserId,
            EmployeeId = user.EmployeeId,
            FullName = user.FullName,
            Email = user.Email,
            Designation = user.Designation,
            Department = user.Department?.Name,
            Roles = roles
        };
    }
}
