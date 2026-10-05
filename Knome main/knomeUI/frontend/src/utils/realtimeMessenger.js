import * as signalR from '@microsoft/signalr';
import { notificationsApi } from './apiService';
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
 * Appends a message into the local master conversation storage and recalculates unreads
 */
export const appendMessageToGlobalStorage = (payload, currentUserId = null) => {
    try {
        const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
        let list = [];
        if (raw) {
            try { list = JSON.parse(raw) || []; } catch (e) { list = []; }
        }

        const { conversationId, senderId, recipientId, sender, message } = payload;
        const convKey = conversationId || getConversationKey(senderId, recipientId);
        const currId = currentUserId ? Number(currentUserId) : null;
        const isSelf = currId && Number(senderId) === currId;
        const isLookingAtChat = typeof window !== 'undefined' && window.__knome_active_chat_user_id === Number(senderId);

        let found = false;
        const updated = list.map(c => {
            const pIds = (c.participantIds || []).map(Number);
            const matches = c.id === convKey || (pIds.includes(Number(senderId)) && pIds.includes(Number(recipientId)));
            if (matches) {
                found = true;
                const existingMsgs = c.messages || [];
                const isDuplicate = existingMsgs.some(m => String(m.id) === String(message.id) || (m.timestamp === message.timestamp && m.text === message.text));
                const nextMsgs = isDuplicate ? existingMsgs : [...existingMsgs, message];
                
                const unreadInc = (currId && !isSelf && !isLookingAtChat) ? 1 : 0;
                const currentUnread = c.unreadCounts?.[currId] || 0;

                return {
                    ...c,
                    lastMessage: message.text,
                    lastMessageTime: message.time,
                    lastMessageTimestamp: message.timestamp || Date.now(),
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
                    [Number(senderId)]: sender,
                    [Number(recipientId)]: payload.recipient || { userId: Number(recipientId), fullName: 'Colleague' }
                },
                participant: sender,
                unreadCounts: {
                    ...(currId ? { [currId]: (!isSelf && !isLookingAtChat) ? 1 : 0 } : {})
                },
                lastMessage: message.text,
                lastMessageTime: message.time,
                lastMessageTimestamp: message.timestamp || Date.now(),
                messages: [message]
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

// ── SignalR Client Connection Manager ──
let messengerHubConnection = null;
let connectionPromise = null;
const messageListeners = new Set();
const seenMessageIds = new Set();

const deliverMessageToListeners = (payload, currentUserId) => {
    if (!payload || !payload.message) return;
    const msgKey = String(payload.message.id || `${payload.senderId}_${payload.message.timestamp}_${payload.message.text}`);
    if (seenMessageIds.has(msgKey)) return; // Deduplicate
    seenMessageIds.add(msgKey);

    // Keep seen set under control
    if (seenMessageIds.size > 200) {
        const first = seenMessageIds.values().next().value;
        seenMessageIds.delete(first);
    }

    // Persist to local master storage
    appendMessageToGlobalStorage(payload, currentUserId);

    // Play chime sound if intended for current user and not self
    if (currentUserId && Number(payload.recipientId) === Number(currentUserId) && Number(payload.senderId) !== Number(currentUserId)) {
        playMessageChime();
    }

    // Dispatch in DOM
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('knome_live_message', { detail: payload }));
    }

    // Call registered subscribers
    messageListeners.forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[RealtimeMessenger] Subscriber error:', e); }
    });
};

/**
 * Initializes or returns active SignalR connection for the current user
 */
export const initMessengerSignalR = (userId) => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const uId = Number(userId);
    if (!uId) return Promise.resolve(null);

    if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
        messengerHubConnection.invoke("JoinUserGroup", uId).catch(() => {});
        return Promise.resolve(messengerHubConnection);
    }

    if (connectionPromise) return connectionPromise;

    const hubUrl = getHubUrl ? getHubUrl() : `http://${window.location.hostname}:5096/hubs/notifications`;

    const conn = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl, {
            accessTokenFactory: () => localStorage.getItem('knome_jwt') || '',
            transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
        })
        .configureLogging(signalR.LogLevel.None)
        .withAutomaticReconnect([0, 1000, 3000, 5000, 10000, 30000])
        .build();

    // 1. Direct message handler
    conn.on("ReceiveDirectMessage", (data) => {
        try {
            const payload = typeof data === 'string' ? JSON.parse(data) : data;
            deliverMessageToListeners(payload, uId);
        } catch (e) {
            console.error('[RealtimeMessenger] Parse error for ReceiveDirectMessage:', e);
        }
    });

    // 2. Notification fallback handler (for messages pushed as notifications)
    conn.on("ReceiveNotification", (notif) => {
        if (!notif) return;
        const isMsg = notif.eventType === 'Message' || notif.notificationType === 'Message' || notif.type === 'message';
        if (!isMsg) return;

        try {
            const senderId = Number(notif.relatedContentId || notif.referenceId || notif.senderUserId || 0);
            if (!senderId || senderId === uId) return;

            // Strip "SenderName: " prefix if present in the raw text
            let rawText = notif.message || notif.text || '';
            const colonIdx = rawText.indexOf(': "');
            if (colonIdx !== -1 && rawText.endsWith('"')) {
                rawText = rawText.substring(colonIdx + 3, rawText.length - 1);
            }

            const payload = {
                type: 'NEW_LIVE_MESSAGE',
                conversationId: getConversationKey(uId, senderId),
                senderId,
                recipientId: uId,
                sender: {
                    userId: senderId,
                    fullName: notif.senderName || 'Colleague',
                    avatar: notif.senderAvatar || null
                },
                message: {
                    id: `notif_${notif.notificationId || Date.now()}`,
                    senderId,
                    senderName: notif.senderName || 'Colleague',
                    text: rawText,
                    time: new Date(notif.createdDate || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp: new Date(notif.createdDate || Date.now()).getTime()
                }
            };

            deliverMessageToListeners(payload, uId);
        } catch (e) {
            console.error('[RealtimeMessenger] Error parsing message notification:', e);
        }
    });

    conn.onreconnected(() => {
        conn.invoke("JoinUserGroup", uId).catch(() => {});
    });

    connectionPromise = conn.start().then(() => {
        messengerHubConnection = conn;
        conn.invoke("JoinUserGroup", uId).catch(() => {});
        return conn;
    }).catch(err => {
        console.warn('[RealtimeMessenger] SignalR start warning (fallback to broadcast/polling):', err);
        return null;
    }).finally(() => {
        connectionPromise = null;
    });

    return connectionPromise;
};

/**
 * Broadcasts a live message to all open tabs/windows, backend SignalR, and local storage
 */
export const sendLiveMessage = async ({ sender, recipient, conversationId, message }) => {
    const senderId = Number(sender.userId || sender.id);
    const recipientId = Number(recipient.userId || recipient.id);

    const payload = {
        type: 'NEW_LIVE_MESSAGE',
        conversationId: conversationId || getConversationKey(senderId, recipientId),
        senderId,
        recipientId,
        sender: {
            userId: senderId,
            fullName: sender.fullName || sender.name || 'Colleague',
            designation: sender.designation || 'Staff',
            department: sender.department || 'MPOnline',
            avatar: sender.avatar || sender.profilePhotoUrl || null,
            status: 'active'
        },
        recipient: {
            userId: recipientId,
            fullName: recipient.fullName || recipient.name || 'Colleague',
            designation: recipient.designation || 'Staff',
            department: recipient.department || 'MPOnline',
            avatar: recipient.avatar || recipient.profilePhotoUrl || null,
            status: 'active'
        },
        message: {
            id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            senderId,
            senderName: sender.fullName || sender.name || 'Colleague',
            text: message.text,
            time: message.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: message.timestamp || Date.now()
        }
    };

    // Mark as seen locally to prevent echo loop
    seenMessageIds.add(String(payload.message.id));

    // 1. Broadcast via HTML5 BroadcastChannel (zero-latency same-browser cross-tab)
    if (channel) {
        try {
            channel.postMessage(payload);
        } catch (err) {
            console.error('[RealtimeMessenger] BroadcastChannel postMessage failed:', err);
        }
    }

    // 2. Broadcast via storage event trigger for browsers/tabs fallback
    try {
        localStorage.setItem('knome_last_live_message', JSON.stringify({
            ...payload,
            _randomNonce: Date.now()
        }));
    } catch (e) {}

    // 3. Dispatch in current window
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent('knome_live_message', { detail: payload }));
        } catch (e) {}
    }

    // 4. Update master conversation store locally for sender
    appendMessageToGlobalStorage(payload, senderId);

    // 5. Send via active SignalR connection (instantly reaches recipient across network/browsers)
    try {
        if (messengerHubConnection && messengerHubConnection.state === signalR.HubConnectionState.Connected) {
            messengerHubConnection.invoke("SendDirectMessage", payload).catch(() => {});
        } else {
            initMessengerSignalR(senderId).then(conn => {
                if (conn && conn.state === signalR.HubConnectionState.Connected) {
                    conn.invoke("SendDirectMessage", payload).catch(() => {});
                }
            }).catch(() => {});
        }
    } catch (e) {}

    // 6. Backend API sync: Persists message notification into SQL Server & triggers hub broadcast
    try {
        const createFn = notificationsApi.createNotification || notificationsApi.create;
        if (createFn) {
            createFn({
                recipientUserId: recipientId,
                message: `${sender.fullName || sender.name || 'Colleague'}: "${message.text}"`,
                notificationType: 'Message',
                referenceId: senderId,
                relatedContentType: 'User'
            }).catch(() => {});
        }
    } catch (e) {}

    return payload;
};

/**
 * Subscribes the current user to live incoming messages and notifications
 */
export const subscribeToLiveMessages = (currentUserId, onMessageReceived) => {
    const currId = Number(currentUserId);
    if (!currId) return () => {};

    // 1. Start or join SignalR
    initMessengerSignalR(currId);

    // 2. Register callback in listener set
    const listener = (payload) => {
        if (!payload || !payload.type) return;
        if (payload.type === 'NEW_LIVE_MESSAGE') {
            const { recipientId, senderId } = payload;
            if (Number(recipientId) === currId && Number(senderId) !== currId) {
                if (typeof onMessageReceived === 'function') {
                    onMessageReceived(payload);
                }
            }
        }
    };
    messageListeners.add(listener);

    // 3. Listen via BroadcastChannel
    const channelListener = (event) => {
        deliverMessageToListeners(event.data, currId);
    };
    if (channel) {
        channel.addEventListener('message', channelListener);
    }

    // 4. Listen via storage event fallback
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

    // 5. Listen via window CustomEvent
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
