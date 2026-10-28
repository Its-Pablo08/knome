using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Knome.API.Hubs;

[Microsoft.AspNetCore.Cors.EnableCors(Constants.ApiConstants.CorsPolicyName)]
public class NotificationHub : Hub
{
    private static readonly ConcurrentDictionary<int, HashSet<string>> _onlineUsers = new();
    private static readonly ConcurrentDictionary<string, int> _connectionToUser = new();
    private static readonly ConcurrentDictionary<int, DateTime> _userLastSeen = new();
    private static readonly ConcurrentDictionary<int, CancellationTokenSource> _disconnectGraceTimers = new();

    private readonly IServiceScopeFactory _scopeFactory;

    public NotificationHub(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public static bool IsUserOnline(int userId)
    {
        return _onlineUsers.TryGetValue(userId, out var set) && set.Count > 0;
    }

    public static List<int> GetActiveOnlineUserIds()
    {
        return _onlineUsers.Where(kvp => kvp.Value.Count > 0).Select(kvp => kvp.Key).ToList();
    }

    public static DateTime? GetUserLastSeen(int userId)
    {
        return _userLastSeen.TryGetValue(userId, out var dt) ? dt : null;
    }

    public override async Task OnConnectedAsync()
    {
        var resolvedUserId = await GetUserIdFromContextAsync();

        if (resolvedUserId > 0)
        {
            await RegisterUserOnline(resolvedUserId, Context.ConnectionId);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connectionToUser.TryRemove(Context.ConnectionId, out var userId))
        {
            bool hasRemainingConnections = false;
            _onlineUsers.AddOrUpdate(userId,
                new HashSet<string>(),
                (_, set) =>
                {
                    lock (set)
                    {
                        set.Remove(Context.ConnectionId);
                        hasRemainingConnections = set.Count > 0;
                    }
                    return set;
                });

            if (!hasRemainingConnections)
            {
                // User has no remaining active connections on this or other devices.
                // Start an 8-second grace period before broadcasting offline
                // to prevent presence flicker during page reloads or brief connection renegotiation.
                StartDisconnectGracePeriod(userId);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinUserGroup(int userId)
    {
        if (userId <= 0) return;

        var authUserId = await GetUserIdFromContextAsync();
        if (authUserId > 0 && authUserId != userId)
        {
            // Security: Prevent unauthorized group joining to guarantee 1-to-1 privacy
            return;
        }

        await RegisterUserOnline(userId, Context.ConnectionId);
    }

    public async Task LeaveUserGroup(int userId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"User_{userId}");
    }

    public async Task UserLoggingOut(int userId)
    {
        var authUserId = await GetUserIdFromContextAsync();
        if (authUserId > 0 && authUserId != userId) return;

        // Cancel any pending grace timer
        if (_disconnectGraceTimers.TryRemove(userId, out var cts))
        {
            try { cts.Cancel(); cts.Dispose(); } catch { }
        }

        _onlineUsers.TryRemove(userId, out _);
        var now = DateTime.UtcNow;
        _userLastSeen[userId] = now;

        await Clients.All.SendAsync("UserPresenceChanged", new
        {
            userId,
            isOnline = false,
            lastSeen = now
        });
    }

    public Task<List<int>> GetOnlineUsers()
    {
        return Task.FromResult(GetActiveOnlineUserIds());
    }

    public Task<object> GetUserPresence(int userId)
    {
        var isOnline = IsUserOnline(userId);
        var lastSeen = GetUserLastSeen(userId);
        return Task.FromResult<object>(new
        {
            userId,
            isOnline,
            lastSeen
        });
    }

    public async Task SendTyping(int recipientId, bool isTyping)
    {
        var senderId = await GetUserIdFromContextAsync();
        if (senderId <= 0 && _connectionToUser.TryGetValue(Context.ConnectionId, out var mappedId))
        {
            senderId = mappedId;
        }

        if (senderId > 0 && recipientId > 0)
        {
            await Clients.Group($"User_{recipientId}").SendAsync("UserTyping", new
            {
                senderId,
                recipientId,
                isTyping
            });
        }
    }

    public async Task SendDirectMessage(object messagePayload)
    {
        var authUserId = await GetUserIdFromContextAsync();
        if (authUserId <= 0 && _connectionToUser.TryGetValue(Context.ConnectionId, out var mappedId))
        {
            authUserId = mappedId;
        }
        if (authUserId <= 0) return;

        try
        {
            if (messagePayload is System.Text.Json.JsonElement elem)
            {
                int recipientId = 0;
                if (elem.TryGetProperty("recipientId", out var rProp) && rProp.TryGetInt32(out var rId))
                    recipientId = rId;
                else if (elem.TryGetProperty("receiverId", out var rcProp) && rcProp.TryGetInt32(out var rcId))
                    recipientId = rcId;
                else if (elem.TryGetProperty("recipientUserId", out var ruProp) && ruProp.TryGetInt32(out var ruId))
                    recipientId = ruId;

                int senderId = authUserId;

                if (recipientId > 0)
                {
                    await Clients.Group($"User_{recipientId}").SendAsync("ReceiveDirectMessage", messagePayload);
                    if (senderId != recipientId)
                    {
                        await Clients.Group($"User_{senderId}").SendAsync("ReceiveDirectMessage", messagePayload);
                    }
                }
            }
        }
        catch
        {
            // Fallback
        }
    }

    private async Task RegisterUserOnline(int userId, string connectionId)
    {
        _connectionToUser[connectionId] = userId;
        await Groups.AddToGroupAsync(connectionId, $"User_{userId}");

        // If a disconnect grace period was counting down for this user, cancel it immediately
        if (_disconnectGraceTimers.TryRemove(userId, out var cts))
        {
            try { cts.Cancel(); cts.Dispose(); } catch { }
        }

        bool isNewlyOnline = false;
        _onlineUsers.AddOrUpdate(userId,
            _ =>
            {
                isNewlyOnline = true;
                return new HashSet<string> { connectionId };
            },
            (_, set) =>
            {
                lock (set)
                {
                    if (set.Count == 0)
                    {
                        isNewlyOnline = true;
                    }
                    set.Add(connectionId);
                }
                return set;
            });

        if (isNewlyOnline)
        {
            await Clients.All.SendAsync("UserPresenceChanged", new
            {
                userId,
                isOnline = true,
                timestamp = DateTime.UtcNow
            });
        }
    }

    private void StartDisconnectGracePeriod(int userId)
    {
        if (_disconnectGraceTimers.TryRemove(userId, out var existingCts))
        {
            try { existingCts.Cancel(); existingCts.Dispose(); } catch { }
        }

        var cts = new CancellationTokenSource();
        _disconnectGraceTimers[userId] = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(8), cts.Token);
                if (cts.IsCancellationRequested) return;

                bool isStillOffline = false;
                if (_onlineUsers.TryGetValue(userId, out var set))
                {
                    lock (set)
                    {
                        if (set.Count == 0)
                        {
                            isStillOffline = true;
                        }
                    }
                }
                else
                {
                    isStillOffline = true;
                }

                if (isStillOffline)
                {
                    _disconnectGraceTimers.TryRemove(userId, out _);
                    var now = DateTime.UtcNow;
                    _userLastSeen[userId] = now;

                    await Clients.All.SendAsync("UserPresenceChanged", new
                    {
                        userId,
                        isOnline = false,
                        lastSeen = now
                    });

                    // Update user's ModifiedDate in database asynchronously
                    try
                    {
                        using var scope = _scopeFactory.CreateScope();
                        var db = scope.ServiceProvider.GetRequiredService<Data.KnomeDbContext>();
                        var dbUser = await db.Users.FindAsync(userId);
                        if (dbUser != null)
                        {
                            dbUser.ModifiedDate = now;
                            await db.SaveChangesAsync();
                        }
                    }
                    catch { }
                }
            }
            catch (OperationCanceledException)
            {
                // Reconnected within grace period
            }
            catch (Exception ex)
            {
                Serilog.Log.Warning(ex, "Error in disconnect grace period for user {UserId}", userId);
            }
        }, cts.Token);
    }

    private async Task<int> GetUserIdFromContextAsync()
    {
        var uidClaim = Context.User?.FindFirst("uid")?.Value
            ?? Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? Context.User?.FindFirst("sub")?.Value;

        if (int.TryParse(uidClaim, out var userId) && userId > 0)
        {
            return userId;
        }

        // If numeric parse failed (e.g. MPO SSO token containing employeeId or string GUID in sub), resolve via DB
        var empId = Context.User?.FindFirst("employeeId")?.Value
            ?? Context.User?.FindFirst("employee_id")?.Value
            ?? Context.User?.FindFirst("empId")?.Value
            ?? Context.User?.FindFirst("username")?.Value;

        if (string.IsNullOrEmpty(empId) && !string.IsNullOrEmpty(uidClaim) && !uidClaim.Contains('@'))
        {
            empId = uidClaim;
        }

        var email = Context.User?.FindFirst("email")?.Value
            ?? Context.User?.FindFirst(ClaimTypes.Email)?.Value
            ?? (uidClaim != null && uidClaim.Contains('@') ? uidClaim : null);

        if (!string.IsNullOrEmpty(empId) || !string.IsNullOrEmpty(email))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<Data.KnomeDbContext>();
                var matched = await db.Users.AsNoTracking().FirstOrDefaultAsync(
                    u => (!string.IsNullOrEmpty(empId) && u.EmployeeId == empId) ||
                         (!string.IsNullOrEmpty(email) && u.Email == email));

                if (matched != null && matched.UserId > 0)
                {
                    return matched.UserId;
                }
            }
            catch (Exception ex)
            {
                Serilog.Log.Warning(ex, "Failed to resolve user ID in NotificationHub from database");
            }
        }

        return 0;
    }
}
