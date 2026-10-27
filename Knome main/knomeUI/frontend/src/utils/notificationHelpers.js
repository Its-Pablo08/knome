import { parseLaptopDate } from './apiService';

/**
 * Utility helpers for Instagram-style Notifications, Date Formatting, and Recipient Isolation
 */

/**
 * Format any date/timestamp value to standard DD-MM-YYYY, hh:mm AM/PM format according to laptop local time.
 */
export const formatNotificationDate = (dateVal) => {
    if (!dateVal) return formatToday();
    const d = parseLaptopDate(dateVal);
    if (!d || isNaN(d.getTime())) return formatToday();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day}-${month}-${year}, ${pad(hours)}:${minutes} ${ampm}`;
};

export const formatToday = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day}-${month}-${year}, ${pad(hours)}:${minutes} ${ampm}`;
};

/**
 * Categorize a date into Instagram-style time sections:
 * 'Today', 'This Week', or 'Earlier'
 */
export const getTimeGroup = (dateVal) => {
    if (!dateVal) return 'Today';
    const d = parseLaptopDate(dateVal);
    if (!d || isNaN(d.getTime())) return 'Today';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const itemTime = d.getTime();

    // Within today (after midnight today)
    if (itemTime >= todayStart) {
        return 'Today';
    }

    // Within last 7 days
    const sevenDaysAgo = todayStart - (7 * 24 * 60 * 60 * 1000);
    if (itemTime >= sevenDaysAgo) {
        return 'This Week';
    }

    return 'Earlier';
};

/**
 * Check if the given notification is meant for the currently logged-in user.
 * Prevents cross-account notification leak in multi-user/shared sessions.
 */
export const isNotificationForUser = (notif, currentUser) => {
    if (!currentUser || !notif) return false;

    // Collect all possible IDs belonging to currentUser
    const myIds = new Set([
        currentUser.id,
        currentUser.userId,
        currentUser.employeeId,
        currentUser.empId,
        currentUser.email?.toLowerCase(),
        currentUser.username?.toLowerCase()
    ].filter(Boolean).map(v => String(v).trim().toLowerCase()));

    // Target fields in notification
    const targets = [
        notif.targetUserId,
        notif.recipientUserId,
        notif.userId,
        notif.employeeId,
        notif.recipientId,
        notif.targetEmpId
    ].filter(Boolean).map(v => String(v).trim().toLowerCase());

    // If notification has no target at all (e.g. system broadcast), allow if it's explicitly broad
    if (targets.length === 0) {
        if (notif.isBroadcast || notif.type === 'BROADCAST' || notif.type === 'ANNOUNCEMENT' || notif.isEveryone || notif.type === 'post_everyone' || notif.type === 'everyone') {
            return true;
        }
        return false;
    }

    // Check if any target matches my IDs
    return targets.some(target => myIds.has(target));
};

/**
 * Check if the notification was initiated by the current user themselves.
 * Prevents self-loopback (e.g. when I share a post, I shouldn't get a notification saying I shared it with myself).
 */
export const isSelfNotification = (notif, currentUser) => {
    if (!currentUser || !notif) return false;

    const myIds = new Set([
        currentUser.id,
        currentUser.userId,
        currentUser.employeeId,
        currentUser.empId
    ].filter(Boolean).map(v => String(v).trim().toLowerCase()));

    const senderIds = [
        notif.senderUserId,
        notif.senderId,
        notif.actorUserId,
        notif.fromUserId
    ].filter(Boolean).map(v => String(v).trim().toLowerCase());

    if (senderIds.length > 0 && senderIds.some(sId => myIds.has(sId))) {
        return true;
    }

    // Also check senderName match against current user's fullName / name
    const myNames = [currentUser.fullName, currentUser.name, currentUser.displayName]
        .filter(Boolean)
        .map(n => String(n).trim().toLowerCase());

    const senderName = String(notif.senderName || notif.actorName || notif.fromName || '')
        .trim()
        .toLowerCase();

    if (senderName && myNames.includes(senderName)) {
        // If it's the sender themselves, flag as self-notification
        return true;
    }

    return false;
};

/**
 * Parses a notification message or structure into a senderName and action text
 * for Instagram-style bold sender display.
 * E.g., "Vilash Deshmukh liked your post" -> { sender: "Vilash Deshmukh", action: "liked your post." }
 */
export const parseNotificationContent = (notif) => {
    let rawSender = String(notif.senderName || notif.actorName || notif.fromName || '').trim();
    let message = String(notif.message || notif.text || notif.title || '').trim();
    let wikiTitle = notif.wikiTitle || null;

    // Discard generic placeholder names so we can extract the real employee name
    let sender = /^(colleague|system|user|teammate)$/i.test(rawSender) ? '' : rawSender;

    // Check for Wiki notification patterns
    const isWiki = (notif.relatedContentType || '').toLowerCase() === 'wiki' ||
                   (notif.type || '').toLowerCase().includes('wiki') ||
                   Boolean(notif.wikiId) ||
                   message.toLowerCase().includes('wiki');

    if (isWiki) {
        // Extract wiki title from any quotes if present: "...", '...', “...”, ‘...’, `...`
        const titleMatch = message.match(/["“”'‘’`]([^"“”'‘’`]+)["“”'‘’`]/);
        if (titleMatch && titleMatch[1]) {
            wikiTitle = titleMatch[1].trim();
        } else if (!wikiTitle) {
            // Check for title following colon: e.g. ...with you: Title
            const colonIdx = message.indexOf(':');
            if (colonIdx !== -1) {
                const candidate = message.substring(colonIdx + 1).trim().replace(/^["“”'‘’`]|["“”'‘’`]$/g, '').trim();
                if (candidate && candidate.length > 1 && !candidate.startsWith('http')) {
                    wikiTitle = candidate;
                }
            }
        }

        // Extract sender from message if not already given
        if (!sender) {
            const sMatch = message.match(/^(.+?)\s+(?:shared|added|invited)\b/i);
            if (sMatch && sMatch[1] && sMatch[1].toLowerCase() !== 'you' && sMatch[1].toLowerCase() !== 'a') {
                sender = sMatch[1].trim();
            }
        }

        const fallbackSender = sender || notif.title || 'Knowledge Base';

        if (message.toLowerCase().includes('added as a') || message.toLowerCase().includes('added as an')) {
            const roleMatch = message.match(/added as a[n]?\s+([a-zA-Z]+)\s+to Wiki/i);
            const role = roleMatch ? roleMatch[1] : 'Editor';
            const article = /^[aeiou]/i.test(role) ? 'an' : 'a';
            return {
                sender: fallbackSender,
                action: `added you as ${article} ${role} to Wiki`,
                wikiTitle,
                isWiki: true
            };
        }

        if (message.toLowerCase().includes('shared a wiki in ') || message.toLowerCase().includes('shared a new wiki in ')) {
            const commMatch = message.match(/shared (?:a |a new )?wiki in ([^:.]+)/i);
            const commName = commMatch ? commMatch[1].trim() : 'Community';
            return {
                sender: fallbackSender,
                action: `shared a Wiki in ${commName}`,
                wikiTitle,
                isWiki: true
            };
        }

        return {
            sender: fallbackSender,
            action: 'shared a Wiki with you',
            wikiTitle,
            isWiki: true
        };
    }

    // 1. Check for approvals / rejections:
    // E.g.: "🎉 Congratulations! Your community "testing sourabh" has been approved by Deepak Simrodia and is now live."
    // E.g.: "🎉 Great news! Your community "testing sourabh" has been approved by HR Admin (Deepak Simrodia) and is now live!"
    // E.g.: "❌ Your community request for "testing sourabh" was not approved by Deepak Simrodia. Reason: ..."
    const approvalMatch = message.match(/(?:has been |was |is )?(approved|declined|rejected|not approved)\s+by\s+(?:(?:HR Admin|Community Admin|Admin|Moderator)\s*\(([^)]+)\)|([A-Za-z\s.'-]+?))(?:\s+and\s+is\s+now\s+(?:live|published)|\s*\(now\s+live\)|\s*\.|\s*!|\s+Reason:|$)/i);

    if (approvalMatch) {
        const actorName = (approvalMatch[2] || approvalMatch[3] || '').trim();
        const decision = approvalMatch[1].toLowerCase();
        const isApproved = decision === 'approved';

        const quotedMatch = message.match(/["“”'‘’`]([^"“”'‘’`]+)["“”'‘’`]/);
        const itemName = quotedMatch ? quotedMatch[1].trim() : '';

        const reasonMatch = message.match(/Reason:\s*([^.\r\n]+)/i);
        const reasonText = reasonMatch ? ` (Reason: ${reasonMatch[1].trim()})` : '';

        const effectiveSender = (!/^(system|admin|administrator|colleague)$/i.test(actorName) && actorName) ? actorName : (sender || 'Administrator');

        let actionText = '';
        if (message.toLowerCase().includes('community')) {
            if (isApproved) {
                actionText = itemName ? `approved your community "${itemName}" and is now live.` : 'approved your community request and is now live.';
            } else {
                actionText = itemName ? `declined your community request for "${itemName}".${reasonText}` : `declined your community request.${reasonText}`;
            }
        } else if (message.toLowerCase().includes('article')) {
            if (isApproved) {
                actionText = itemName ? `approved your article "${itemName}" and is now published.` : 'approved your article request and is now published.';
            } else {
                actionText = itemName ? `declined your article "${itemName}".${reasonText}` : `declined your article request.${reasonText}`;
            }
        } else {
            actionText = isApproved ? `approved your request.` : `declined your request.${reasonText}`;
        }

        return {
            sender: effectiveSender,
            action: actionText,
            wikiTitle,
            isWiki: false
        };
    }

    // 2. Check for Community Approval Request
    // E.g.: "📋 New Community Approval Request: sourabh singh created "testing sourabh". Awaiting HR / Admin approval."
    const approvalReqMatch = message.match(/New Community Approval Request:\s*([A-Za-z\s.'-]+?)\s+created\s+["“”'‘’`]([^"“”'‘’`]+)["“”'‘’`]/i);
    if (approvalReqMatch) {
        const creatorName = approvalReqMatch[1].trim();
        const commName = approvalReqMatch[2].trim();
        return {
            sender: creatorName,
            action: `created community "${commName}". Awaiting approval.`,
            wikiTitle,
            isWiki: false
        };
    }

    // 3. Check for Community Invitations
    // E.g.: "📢 Deepak Simrodia invited you to join the community "testing sourabh"."
    const commInviteMatch = message.match(/(?:📢\s*)?([A-Za-z\s.'-]+?)\s+invited you to join (?:the )?community\s+["“”'‘’`]([^"“”'‘’`]+)["“”'‘’`]/i);
    if (commInviteMatch) {
        const inviter = commInviteMatch[1].trim();
        const commName = commInviteMatch[2].trim();
        return {
            sender: inviter,
            action: `invited you to join community "${commName}".`,
            wikiTitle,
            isWiki: false
        };
    }

    // 4. Check for broadcast announcements with pipe "|" separator
    // E.g.: "Organization Announcement | test"
    // E.g.: "Upcoming Public Holiday Notice | All MPOnline offices will remain closed..."
    if (message.includes('|')) {
        const pipeIdx = message.indexOf('|');
        const headerTitle = message.substring(0, pipeIdx).trim();
        const bodyContent = message.substring(pipeIdx + 1).trim();
        if (headerTitle && bodyContent) {
            return {
                sender: sender || headerTitle,
                action: bodyContent,
                wikiTitle,
                isWiki: false
            };
        }
    }

    // 5. Clean leading emojis & symbols before social action extraction
    const cleanMsg = message.replace(/^[\p{Emoji}\p{Extended_Pictographic}\s•\-–—:|📢🎉📋❌✅]+/u, '').trim();

    // 6. Check for standard social actions
    const knownActions = [
        ' liked your post',
        ' commented on your post',
        ' replied to your comment',
        ' shared a post with you',
        ' shared an article with you',
        ' shared a video with you',
        ' shared a wiki with you',
        ' shared a podcast with you',
        ' sent you a connection request',
        ' accepted your connection request',
        ' followed you',
        ' requested to join',
        ' approved your request',
        ' rejected your request',
        ' posted in ',
        ' shared a new post in ',
        ' published a new post',
        ' published a new article',
        ' published a new video',
        ' published a new podcast',
        ' uploaded a clip',
        ' tagged you',
        ' mentioned you'
    ];

    for (const act of knownActions) {
        const idx = cleanMsg.toLowerCase().indexOf(act.toLowerCase());
        if (idx > 0) {
            const extractedSender = cleanMsg.substring(0, idx).trim();
            const action = cleanMsg.substring(idx).trim();
            return { 
                sender: sender || extractedSender, 
                action, 
                wikiTitle, 
                isWiki: false 
            };
        }
    }

    // 7. Check for actions with "... by <Name>"
    const byMatch = cleanMsg.match(/(.+?)\s+by\s+([A-Za-z\s.'-]+?)(?:\.|$|!)/i);
    if (byMatch && byMatch[2] && byMatch[2].trim().length > 2) {
        const candidateActor = byMatch[2].trim();
        if (!/^(system|admin|administrator|colleague|mponline)$/i.test(candidateActor)) {
            return {
                sender: candidateActor,
                action: byMatch[1].trim() + '.',
                wikiTitle,
                isWiki: false
            };
        }
    }

    // 8. If sender is already populated, clean the message
    if (sender) {
        let action = message;
        if (action.toLowerCase().startsWith(sender.toLowerCase())) {
            action = action.slice(sender.length).trim();
            if (action.startsWith(':') || action.startsWith('-')) {
                action = action.slice(1).trim();
            }
        }
        return { sender, action: action || 'sent an update.', wikiTitle, isWiki: false };
    }

    // 9. Fallback: Use notification title or category, never "Colleague"
    return {
        sender: notif.title || (notif.category ? `${notif.category} Update` : 'MPOnline Team'),
        action: message,
        wikiTitle,
        isWiki: false
    };
};
