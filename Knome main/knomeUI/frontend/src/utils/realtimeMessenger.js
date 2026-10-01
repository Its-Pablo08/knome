import { notificationsApi } from './apiService';

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
 * Dispatches an in-app real-time notification to Navbar & Toast
 */
export const dispatchLiveMessageNotification = (sender, recipient, text) => {
    try {
        const notifPayload = {
            id: `msg_notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            type: 'message',
            eventType: 'Message',
            notificationType: 'Message',
            title: 'New Message',
            senderName: sender.fullName || sender.name || 'Colleague',
            senderAvatar: sender.avatar || sender.profilePhotoUrl || null,
            senderUserId: Number(sender.userId || sender.id),
            targetUserId: Number(recipient.userId || recipient.id),
            recipientUserId: Number(recipient.userId || recipient.id),
            userId: Number(recipient.userId || recipient.id),
            message: `${sender.fullName || sender.name || 'Colleague'}: "${text}"`,
            text: `${sender.fullName || sender.name || 'Colleague'}: "${text}"`,
            targetUrl: `/messages?userId=${Number(sender.userId || sender.id)}&name=${encodeURIComponent(sender.fullName || sender.name || '')}`,
            unread: true,
            createdDate: new Date().toISOString()
        };

        // Broadcast to current window
        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: notifPayload }));

        // Broadcast to other tabs
        if (channel) {
            channel.postMessage({
                type: 'NOTIFICATION_BROADCAST',
                notification: notifPayload
            });
        }
    } catch (err) {
        console.error('[RealtimeMessenger] Failed to dispatch live notification:', err);
    }
};

/**
 * Broadcasts a live message to all open tabs/windows, backend SignalR, and local storage
 */
export const sendLiveMessage = async ({ sender, recipient, conversationId, message }) => {
    const senderId = Number(sender.userId || sender.id);
    const recipientId = Number(recipient.userId || recipient.id);

    const payload = {
        type: 'NEW_LIVE_MESSAGE',
        conversationId,
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
            id: message.id || `msg_${Date.now()}`,
            senderId,
            senderName: sender.fullName || sender.name || 'Colleague',
            text: message.text,
            time: message.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: message.timestamp || Date.now()
        }
    };

    // 1. Broadcast via HTML5 BroadcastChannel (zero-latency cross-tab communication)
    if (channel) {
        try {
            channel.postMessage(payload);
        } catch (err) {
            console.error('[RealtimeMessenger] BroadcastChannel postMessage failed:', err);
        }
    }

    // 2. Broadcast via storage event trigger for browsers/tabs where BroadcastChannel is blocked
    try {
        localStorage.setItem('knome_last_live_message', JSON.stringify({
            ...payload,
            _randomNonce: Date.now()
        }));
    } catch (e) {}

    // 3. Dispatch in current window as well
    if (typeof window !== 'undefined') {
        try {
            window.dispatchEvent(new CustomEvent('knome_live_message', { detail: payload }));
        } catch (e) {}
    }

    // 4. Backend sync via API so SignalR broadcasts across network/machines & persists to SQL Server
    try {
        notificationsApi.createNotification({
            recipientUserId: recipientId,
            message: `${sender.fullName || sender.name || 'Colleague'}: "${message.text}"`,
            notificationType: 'Message',
            referenceId: senderId,
            relatedContentType: 'User'
        }).catch(() => {
            // Backend offline or fallback — local real-time already delivered
        });
    } catch (e) {}

    return payload;
};

/**
 * Subscribes the current user to live incoming messages and notifications
 */
export const subscribeToLiveMessages = (currentUserId, onMessageReceived) => {
    const currId = Number(currentUserId);

    const handlePayload = (payload) => {
        if (!payload || !payload.type) return;

        // A. Handle incoming chat message
        if (payload.type === 'NEW_LIVE_MESSAGE') {
            const { recipientId, senderId } = payload;
            
            // Only process if intended for current logged-in user and not sent by self
            if (Number(recipientId) === currId && Number(senderId) !== currId) {
                if (typeof onMessageReceived === 'function') {
                    onMessageReceived(payload);
                }
                playMessageChime();
            }
        }

        // B. Handle notification broadcast
        if (payload.type === 'NOTIFICATION_BROADCAST') {
            const notif = payload.notification;
            if (notif && Number(notif.recipientUserId || notif.targetUserId) === currId) {
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: notif }));
            }
        }
    };

    // 1. Listen via BroadcastChannel
    const channelListener = (event) => {
        handlePayload(event.data);
    };

    if (channel) {
        channel.addEventListener('message', channelListener);
    }

    // 2. Listen via storage event fallback
    const storageListener = (e) => {
        if (e.key === 'knome_last_live_message' && e.newValue) {
            try {
                const parsed = JSON.parse(e.newValue);
                handlePayload(parsed);
            } catch (err) {}
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', storageListener);
    }

    // 3. Listen via local window event dispatch
    const localListener = (event) => {
        if (event.detail) {
            handlePayload(event.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('knome_live_message', localListener);
    }

    return () => {
        if (channel) {
            channel.removeEventListener('message', channelListener);
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('storage', storageListener);
            window.removeEventListener('knome_live_message', localListener);
        }
    };
};
