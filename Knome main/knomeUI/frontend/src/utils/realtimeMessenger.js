import * as signalR from '@microsoft/signalr';
import { notificationsApi, messagesApi, parseLaptopDate, formatMessageTime } from './apiService';
import { getHubUrl } from './apiClient';

// Storage key for master messenger conversations
export const MESSAGES_STORAGE_KEY = 'knome_global_messenger_conversations';

// Dedicated broadcast channel for cross-tab and cross-window real-time messaging
const CHANNEL_NAME = 'knome_live_messenger';
let channel = null;

try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }
} catch (e) {
    console.warn('[RealtimeMessenger] BroadcastChannel not supported, falling back to storage events');
}

/**
 * Audio chime synthesizer using Web Audio API (zero external assets needed)
 */
export const playMessageChime = () => {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.10);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.45);
    } catch (e) {
        // Audio context suppressed or unsupported
    }
};

/**
 * Deterministic conversation key generator for two user IDs
 */
export const getConversationKey = (id1, id2) => {
    const a = Number(id1) || 0;
    const b = Number(id2) || 0;
    return `conv_${Math.min(a, b)}_${Math.max(a, b)}`;
};

/**
 * Standardizes raw message objects into a uniform contract
 */
export const normalizeMessage = (data) => {
    if (!data) return null;
    const rawMsg = data.message || data;
    const messageId = rawMsg.messageId || rawMsg.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const senderId = Number(data.senderId || rawMsg.senderId || 0);
    const receiverId = Number(data.receiverId || data.recipientId || rawMsg.receiverId || rawMsg.recipientId || 0);
    const content = rawMsg.content || rawMsg.text || '';
    
    let parsedAttachments = [];
    if (rawMsg.attachmentsJson) {
        try { parsedAttachments = JSON.parse(rawMsg.attachmentsJson); } catch {}
    } else if (Array.isArray(rawMsg.attachments)) {
        parsedAttachments = rawMsg.attachments;
    }

    const msgDate = rawMsg.createdDate 
        ? new Date(rawMsg.createdDate) 
        : (rawMsg.timestamp ? new Date(rawMsg.timestamp) : new Date());

    return {
        messageId,
        id: messageId,
        senderId,
        senderName: rawMsg.senderName || data.sender?.fullName || data.senderName || 'Employee',
        receiverId,
        receiverName: rawMsg.receiverName || data.recipient?.fullName || data.receiverName || '',
        content,
        text: content,
        attachmentsJson: rawMsg.attachmentsJson || null,
        attachments: parsedAttachments,
        isRead: Boolean(rawMsg.isRead),
        isDelivered: Boolean(rawMsg.isDelivered || rawMsg.isRead),
        readDate: rawMsg.readDate || null,
        createdDate: rawMsg.createdDate || msgDate.toISOString(),
        time: rawMsg.time || msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: rawMsg.timestamp || msgDate.getTime(),
        parentMessageId: rawMsg.parentMessageId || null,
        parentContent: rawMsg.parentContent || null,
        parentSenderName: rawMsg.parentSenderName || null,
        isEdited: Boolean(rawMsg.isEdited),
        editedDate: rawMsg.editedDate || null,
        isDeleted: Boolean(rawMsg.isDeleted),
        reactions: Array.isArray(rawMsg.reactions) ? rawMsg.reactions : [],
        status: 'sent'
    };
};

/**
 * Appends a message into the local master conversation storage and recalculates unreads
 */
export const appendMessageToGlobalStorage = (payload, currentUserId = null) => {
    try {
        const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
        let list = [];
        if (raw) {
            try { list = JSON.parse(raw) || []; } catch (e) { list = []; }
        }

        const norm = normalizeMessage(payload);
        if (!norm) return list;

        const senderId = norm.senderId;
        const recipientId = norm.receiverId;
        const convKey = getConversationKey(senderId, recipientId);
        const currId = currentUserId ? Number(currentUserId) : null;
        const isSelf = currId && Number(senderId) === currId;
        const isLookingAtChat = typeof window !== 'undefined' && window.__knome_active_chat_user_id === Number(senderId);

        const displaySummary = norm.text || 
            (Array.isArray(norm.attachments) && norm.attachments.length > 0 
                ? (norm.attachments.length === 1 ? `📎 ${norm.attachments[0].name || 'Attachment'}` : `📎 ${norm.attachments.length} Attachments`) 
                : 'Attachment');

        let found = false;
        const updated = list.map(c => {
            const pIds = (c.participantIds || []).map(Number);
            const matches = c.id === convKey || (pIds.includes(Number(senderId)) && pIds.includes(Number(recipientId)));
            if (matches) {
                found = true;
                const existingMsgs = c.messages || [];
                const existingIdx = existingMsgs.findIndex(m => String(m.id || m.messageId) === String(norm.id));
                let nextMsgs;
                if (existingIdx !== -1) {
                    nextMsgs = [...existingMsgs];
                    nextMsgs[existingIdx] = { ...existingMsgs[existingIdx], ...norm };
                } else {
                    nextMsgs = [...existingMsgs, norm];
                }
                
                const unreadInc = (currId && !isSelf && !isLookingAtChat) ? 1 : 0;
                const currentUnread = c.unreadCounts?.[currId] || 0;

                return {
                    ...c,
                    lastMessage: displaySummary || c.lastMessage || 'Attachment',
                    lastMessageTime: norm.time,
                    lastMessageTimestamp: norm.timestamp || Date.now(),
                    unreadCounts: {
                        ...(c.unreadCounts || {}),
                        ...(currId ? { [currId]: currentUnread + unreadInc } : {})
                    },
                    messages: nextMsgs
                };
            }
            return c;
        });

        if (!found) {
            const newConv = {
                id: convKey,
                participantIds: [Number(senderId), Number(recipientId)],
                participants: {
                    [Number(senderId)]: { userId: Number(senderId), fullName: norm.senderName || 'Employee' },
                    [Number(recipientId)]: { userId: Number(recipientId), fullName: norm.receiverName || 'Employee' }
                },
                participant: { userId: Number(senderId), fullName: norm.senderName || 'Employee' },
                unreadCounts: {
                    ...(currId ? { [currId]: (!isSelf && !isLookingAtChat) ? 1 : 0 } : {})
                },
                lastMessage: displaySummary || 'Attachment',
                lastMessageTime: norm.time,
                lastMessageTimestamp: norm.timestamp || Date.now(),
                messages: [norm]
            };
            updated.unshift(newConv);
        }

        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(updated));

        if (currId) {
            const totalUnread = updated.reduce((acc, c) => acc + (c.unreadCounts?.[currId] || 0), 0);
            localStorage.setItem(`knome_unread_messages_count_${currId}`, String(totalUnread));
            localStorage.setItem('knome_unread_messages_count', String(totalUnread));
            window.dispatchEvent(new CustomEvent('knome_messages_updated', { detail: { unreadCount: totalUnread } }));
        }

        return updated;
    } catch (err) {
        console.warn('[RealtimeMessenger] Failed to update global message storage:', err);
        return null;
    }
};

// ── Shared Singleton SignalR Client Connection Manager ──
let messengerHubConnection = null;
let connectionPromise = null;
const messageListeners = new Set();
const seenMessageIds = new Set();
let activeRegisteredUserId = null;
let watchdogReconnectTimer = null;
let reconnectAttemptCount = 0;

export const getMessengerConnection = () => messengerHubConnection;

const deliverMessageToListeners = (rawPayload, currentUserId) => {
    const norm = normalizeMessage(rawPayload);
    if (!norm) return;

    const msgKey = String(norm.id || `${norm.senderId}_${norm.timestamp}_${norm.text}`);
    if (seenMessageIds.has(msgKey)) return; // Deduplicate
    seenMessageIds.add(msgKey);

    if (seenMessageIds.size > 200) {
        const first = seenMessageIds.values().next().value;
        seenMessageIds.delete(first);
    }

    // Persist to local master storage
    appendMessageToGlobalStorage(norm, currentUserId);

    // Play chime sound if intended for current user and not self, and not actively viewing that partner's chat
    const currId = currentUserId ? Number(currentUserId) : null;
    const isMe = currId && Number(norm.senderId) === currId;
    const isCurrentActiveChat = typeof window !== 'undefined' && window.__knome_active_chat_user_id === Number(norm.senderId);

    if (currId && Number(norm.receiverId) === currId && !isMe && !isCurrentActiveChat) {
        playMessageChime();
    }

    // Dispatch normalized live message event across DOM
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('knome_live_message', { detail: norm }));
        window.dispatchEvent(new CustomEvent('knome_receive_direct_message', { detail: norm }));
    }

    // Call registered subscribers
    messageListeners.forEach(fn => {
        try { fn(norm); } catch (e) { console.error('[RealtimeMessenger] Subscriber error:', e); }
    });
};

/**
 * Initializes or returns active SignalR connection for the current user
 */
export const initMessengerSignalR = (userId, forceReconnect = false) => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const uId = Number(userId || activeRegisteredUserId);
    if (!uId) return Promise.resolve(null);

    activeRegisteredUserId = uId;

    if (!forceReconnect && messengerHubConnection) {
        if (messengerHubConnection.state === signalR.HubConnectionState.Connected) {
            messengerHubConnection.invoke("JoinUserGroup", uId).catch(() => {});
            return Promise.resolve(messengerHubConnection);
        }
        if (messengerHubConnection.state === signalR.HubConnectionState.Connecting ||
            messengerHubConnection.state === signalR.HubConnectionState.Reconnecting) {
            return connectionPromise || Promise.resolve(messengerHubConnection);
        }
    }

    if (connectionPromise && !forceReconnect) return connectionPromise;

    if (forceReconnect && messengerHubConnection) {
        try {
            if (messengerHubConnection.state !== signalR.HubConnectionState.Disconnected) {
                messengerHubConnection.stop().catch(() => {});
            }
        } catch {}
        messengerHubConnection = null;
    }

    const hubUrl = getHubUrl ? getHubUrl() : `http://${window.location.hostname}:5096/hubs/notifications`;

    const conn = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
            accessTokenFactory: () => localStorage.getItem('knome_jwt') || '',
            transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
        })
        .configureLogging(signalR.LogLevel.Warning)
        .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: retryContext => {
                // Exponential backoff: 0s, 1s, 2s, 4s, 8s, up to 15s max
                return Math.min(1000 * Math.pow(1.8, retryContext.previousRetryCount), 15000);
            }
        })
        .build();

    conn.serverTimeoutInMilliseconds = 60000;
    conn.keepAliveIntervalInMilliseconds = 15000;

    // 1. Direct message handler
    conn.on("ReceiveDirectMessage", (data) => {
        try {
            const raw = typeof data === 'string' ? JSON.parse(data) : data;
            deliverMessageToListeners(raw, uId);
        } catch (e) {
            console.error('[RealtimeMessenger] Error processing ReceiveDirectMessage:', e);
        }
    });

    conn.on("MessageEdited", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_message_edited', { detail: payload }));
            }
        } catch (e) {}
    });

    conn.on("MessageDeleted", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_message_deleted', { detail: payload }));
            }
        } catch (e) {}
    });

    conn.on("MessageReactionUpdated", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_message_reaction_updated', { detail: payload }));
            }
        } catch (e) {}
    });

    conn.on("UserTyping", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            const senderId = Number(payload.senderId || payload.SenderId);
            const recipientId = Number(payload.recipientId || payload.RecipientId);
            const isTyping = Boolean(payload.isTyping ?? payload.IsTyping);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_user_typing', { detail: { senderId, recipientId, isTyping } }));
            }
        } catch (e) {}
    });

    conn.on("MessagesRead", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            const partnerId = Number(payload.partnerId || payload.PartnerId);
            const readDate = payload.readDate || payload.ReadDate || new Date().toISOString();
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_messages_read', { detail: { partnerId, readDate } }));
            }
        } catch (e) {}
    });

    conn.on("UserPresenceChanged", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            const userId = Number(payload.userId || payload.UserId);
            const isOnline = Boolean(payload.isOnline ?? payload.IsOnline);
            const lastSeen = payload.lastSeen || payload.LastSeen || null;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('knome_user_presence_changed', { detail: { userId, isOnline, lastSeen } }));
            }
        } catch (e) {}
    });

    // 2. Notifications & System Events Forwarder
    conn.on("ReceiveNotification", (notif) => {
        if (!notif) return;
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: notif }));
        }

        const isMsg = notif.eventType === 'Message' || notif.notificationType === 'Message' || notif.type === 'message';
        if (!isMsg) return;

        try {
            const senderId = Number(notif.relatedContentId || notif.referenceId || notif.senderUserId || 0);
            if (!senderId || senderId === uId) return;

            let rawText = notif.message || notif.text || '';
            let parsedAttachments = [];
            const attTagIdx = rawText.indexOf(' __ATT__:');
            if (attTagIdx !== -1) {
                try {
                    parsedAttachments = JSON.parse(rawText.substring(attTagIdx + 9));
                } catch (e) {}
                rawText = rawText.substring(0, attTagIdx);
            }

            const colonIdx = rawText.indexOf(': "');
            if (colonIdx !== -1 && rawText.endsWith('"')) {
                rawText = rawText.substring(colonIdx + 3, rawText.length - 1);
            }

            const payload = {
                messageId: `notif_${notif.notificationId || Date.now()}`,
                id: `notif_${notif.notificationId || Date.now()}`,
                senderId,
                senderName: notif.senderName || 'Employee',
                receiverId: uId,
                content: rawText,
                text: rawText,
                attachments: parsedAttachments,
                createdDate: notif.createdDate || new Date().toISOString(),
                time: formatMessageTime(notif.createdDate || Date.now()),
                timestamp: (parseLaptopDate(notif.createdDate) || new Date()).getTime(),
                status: 'sent'
            };

            deliverMessageToListeners(payload, uId);
        } catch (e) {
            console.error('[RealtimeMessenger] Error parsing message notification:', e);
        }
    });

    conn.on("ReactionCountUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:reaction-updated', { detail: data }));
        }
    });

    conn.on("CommentCountUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:comment-updated', { detail: data }));
        }
    });

    conn.on("ShareCountUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:share-updated', { detail: data }));
        }
    });

    conn.on("ViewCountUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:view-updated', { detail: data }));
        }
    });

    conn.on("ClipEngagementUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:clip-engagement-updated', { detail: data }));
        }
    });

    conn.on("CommunityMembersUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: data }));
            window.dispatchEvent(new Event('storage'));
        }
    });

    conn.on("NoticePeriodUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:notice-period-updated', { detail: data }));
        }
    });

    conn.on("SystemConfigUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:system-config-updated', { detail: data }));
        }
    });

    conn.on("BookmarkUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:bookmark-updated', { detail: data }));
        }
    });

    conn.on("BroadcastUpdated", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:broadcast-updated', { detail: data }));
        }
    });

    conn.on("BroadcastDeleted", (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome:broadcast-deleted', { detail: data }));
        }
    });

    conn.onreconnecting((error) => {
        console.warn('[RealtimeMessenger] SignalR connection dropped. Reconnecting...', error);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome_messenger_reconnecting', { detail: { error, userId: uId } }));
        }
    });

    conn.onreconnected((connectionId) => {
        console.log('[RealtimeMessenger] SignalR connection restored! Re-joining user group for user:', uId);
        reconnectAttemptCount = 0;
        if (watchdogReconnectTimer) {
            clearTimeout(watchdogReconnectTimer);
            watchdogReconnectTimer = null;
        }
        conn.invoke("JoinUserGroup", uId).catch(() => {});
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome_messenger_reconnected', { detail: { connectionId, userId: uId } }));
        }
    });

    conn.onclose((error) => {
        console.warn('[RealtimeMessenger] SignalR connection closed completely:', error);
        if (messengerHubConnection === conn) {
            messengerHubConnection = null;
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome_messenger_disconnected', { detail: { error, userId: uId } }));
        }
        if (activeRegisteredUserId && typeof navigator !== 'undefined' && navigator.onLine) {
            scheduleWatchdogReconnect(activeRegisteredUserId);
        }
    });

    connectionPromise = conn.start().then(() => {
        messengerHubConnection = conn;
        reconnectAttemptCount = 0;
        if (watchdogReconnectTimer) {
            clearTimeout(watchdogReconnectTimer);
            watchdogReconnectTimer = null;
        }
        conn.invoke("JoinUserGroup", uId).catch(() => {});
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('knome_messenger_reconnected', { detail: { userId: uId } }));
        }
        return conn;
    }).catch(err => {
        console.warn('[RealtimeMessenger] SignalR start warning (fallback to broadcast/polling):', err);
        if (activeRegisteredUserId && typeof navigator !== 'undefined' && navigator.onLine) {
            scheduleWatchdogReconnect(activeRegisteredUserId);
        }
        return null;
    }).finally(() => {
        connectionPromise = null;
    });

    return connectionPromise;
};

/**
 * Watchdog timer that persistently attempts to re-establish SignalR connection if disconnected
 */
function scheduleWatchdogReconnect(userId) {
    if (watchdogReconnectTimer) clearTimeout(watchdogReconnectTimer);
    const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptCount), 15000);
    reconnectAttemptCount++;

    watchdogReconnectTimer = setTimeout(() => {
        if (!activeRegisteredUserId) return;
        if (!messengerHubConnection || messengerHubConnection.state === signalR.HubConnectionState.Disconnected) {
            console.log(`[RealtimeMessenger] Watchdog attempting SignalR reconnect (attempt ${reconnectAttemptCount})...`);
            initMessengerSignalR(userId);
        }
    }, delay);
}

/**
 * Explicit user logout notification to immediately mark user offline without grace period
 */
export const userLoggingOut = (userId) => {
    const uId = Number(userId || activeRegisteredUserId);
    if (!uId) return;
    if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
        messengerHubConnection.invoke("UserLoggingOut", uId).catch(() => {});
    }
};

/**
 * Subscribes the current user to live incoming messages and notifications
 */
export const subscribeToLiveMessages = (currentUserId, onMessageReceived) => {
    const currId = Number(currentUserId);
    if (!currId) return () => {};

    initMessengerSignalR(currId);

    const listener = (payload) => {
        if (!payload) return;
        const norm = normalizeMessage(payload);
        if (!norm) return;
        if (Number(norm.receiverId) === currId && Number(norm.senderId) !== currId) {
            if (typeof onMessageReceived === 'function') {
                onMessageReceived(norm);
            }
        }
    };
    messageListeners.add(listener);

    const channelListener = (event) => {
        deliverMessageToListeners(event.data, currId);
    };
    if (channel) {
        channel.addEventListener('message', channelListener);
    }

    const storageListener = (e) => {
        if (e.key === 'knome_last_live_message' && e.newValue) {
            try {
                const parsed = JSON.parse(e.newValue);
                deliverMessageToListeners(parsed, currId);
            } catch (err) {}
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', storageListener);
    }

    const localListener = (event) => {
        if (event.detail) {
            deliverMessageToListeners(event.detail, currId);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('knome_live_message', localListener);
    }

    return () => {
        messageListeners.delete(listener);
        if (channel) {
            channel.removeEventListener('message', channelListener);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('storage', storageListener);
            window.removeEventListener('knome_live_message', localListener);
        }
    };
};

/**
 * Sends a real-time typing indicator to the recipient
 */
export const sendTypingIndicator = (recipientId, isTyping) => {
    if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
        messengerHubConnection.invoke("SendTyping", Number(recipientId), Boolean(isTyping)).catch(() => {});
    }
};

/**
 * Fetches the active list of currently online user IDs from SignalR or REST API fallback
 */
export const fetchOnlineUserIds = async () => {
    if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
        try {
            const list = await messengerHubConnection.invoke("GetOnlineUsers");
            if (Array.isArray(list)) return list;
        } catch (e) {
            // fallback to REST API
        }
    }
    try {
        const res = await messagesApi.getOnlineUsers();
        return Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
        return [];
    }
};

/**
 * Fetches online status and last seen for a specific user ID
 */
export const fetchUserPresence = async (userId) => {
    const uId = Number(userId);
    if (!uId) return null;
    if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
        try {
            const status = await messengerHubConnection.invoke("GetUserPresence", uId);
            if (status) return status;
        } catch (e) {}
    }
    try {
        const res = await messagesApi.getOnlineStatus(uId);
        return (res && res.data !== undefined) ? res.data : res;
    } catch (e) {
        return null;
    }
};

/**
 * Ensures SignalR is connected and actively joined to the user group
 */
export const ensureMessengerConnected = (userId) => {
    const uId = Number(userId || activeRegisteredUserId);
    if (!uId) return Promise.resolve(null);
    if (messengerHubConnection) {
        if (messengerHubConnection.state === signalR.HubConnectionState.Connected) {
            messengerHubConnection.invoke("JoinUserGroup", uId).catch(() => {});
            return Promise.resolve(messengerHubConnection);
        }
        if (messengerHubConnection.state === signalR.HubConnectionState.Connecting ||
            messengerHubConnection.state === signalR.HubConnectionState.Reconnecting) {
            return connectionPromise || Promise.resolve(messengerHubConnection);
        }
    }
    return initMessengerSignalR(uId, false);
};

// Global Browser Online / Offline Watchdogs
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('[RealtimeMessenger] Browser went ONLINE. Resuming realtime messaging and SignalR connection...');
        reconnectAttemptCount = 0;
        if (activeRegisteredUserId) {
            initMessengerSignalR(activeRegisteredUserId, true);
        }
        window.dispatchEvent(new CustomEvent('knome_network_restored', { detail: { timestamp: Date.now() } }));
    });

    window.addEventListener('offline', () => {
        console.warn('[RealtimeMessenger] Browser went OFFLINE.');
        window.dispatchEvent(new CustomEvent('knome_messenger_disconnected', { detail: { offline: true } }));
    });
}
