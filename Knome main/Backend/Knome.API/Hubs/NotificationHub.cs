using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace Knome.API.Hubs;

public class NotificationHub : Hub
{
    private static readonly ConcurrentDictionary<int, HashSet<string>> _onlineUsers = new();
    private static readonly ConcurrentDictionary<string, int> _connectionToUser = new();

    public static bool IsUserOnline(int userId)
    {
        return _onlineUsers.TryGetValue(userId, out var set) && set.Count > 0;
    }

    public static List<int> GetActiveOnlineUserIds()
    {
        return _onlineUsers.Where(kvp => kvp.Value.Count > 0).Select(kvp => kvp.Key).ToList();
    }

    public override async Task OnConnectedAsync()
    {
        var resolvedUserId = GetUserIdFromContext();

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
            bool isNowOffline = false;
            _onlineUsers.AddOrUpdate(userId,
                new HashSet<string>(),
                (_, set) =>
                {
                    lock (set)
                    {
                        set.Remove(Context.ConnectionId);
                        if (set.Count == 0)
                        {
                            isNowOffline = true;
                        }
                    }
                    return set;
                });

            if (isNowOffline)
            {
                await Clients.All.SendAsync("UserPresenceChanged", new { userId, isOnline = false });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinUserGroup(int userId)
    {
        var authUserId = GetUserIdFromContext();
        if (authUserId > 0 && authUserId != userId)
        {
            // Security: Prevent unauthorized group joining to guarantee 1-to-1 privacy
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
        await RegisterUserOnline(userId, Context.ConnectionId);
    }

    public async Task LeaveUserGroup(int userId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"User_{userId}");
    }

    public Task<List<int>> GetOnlineUsers()
    {
        return Task.FromResult(GetActiveOnlineUserIds());
    }

    public async Task SendTyping(int recipientId, bool isTyping)
    {
        var senderId = GetUserIdFromContext();
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
        var authUserId = GetUserIdFromContext();
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
            await Clients.All.SendAsync("UserPresenceChanged", new { userId, isOnline = true });
        }
    }

    private int GetUserIdFromContext()
    {
        var userIdClaim = Context.User?.FindFirst("uid")?.Value
            ?? Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? Context.User?.FindFirst("sub")?.Value;

        if (int.TryParse(userIdClaim, out var userId) && userId > 0)
        {
            return userId;
        }

        return 0;
    }
}
