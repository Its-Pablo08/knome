import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { resolveMediaUrl, userApi, messagesApi, mediaApi, clipsApi } from '../utils/apiService';
import { apiClient } from '../utils/apiClient';
import { useSystemConfig } from '../utils/systemConfig';
import DeleteMessageModal from '../components/modals/DeleteMessageModal';
import {
    initMessengerSignalR,
    sendTypingIndicator,
    fetchOnlineUserIds,
    playMessageChime,
    ensureMessengerConnected
} from '../utils/realtimeMessenger';

/**
 * Returns true if text consists exclusively of 1 to 5 emojis
 */
export const isEmojiOnly = (text) => {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    const chars = Array.from(trimmed);
    if (chars.length > 5) return false;
    const cleaned = trimmed.replace(/[\uFE00-\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]/gu, '');
    try {
        const withoutEmojis = cleaned.replace(/\p{Extended_Pictographic}/gu, '');
        return withoutEmojis.length === 0;
    } catch {
        return false;
    }
};

/**
 * Categorized emoji library
 */
const EMOJI_CATEGORIES = {
    smileys: {
        label: 'Smileys',
        icon: 'sentiment_satisfied',
        emojis: [
            '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', 
            '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', 
            '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', 
            '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', 
            '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', 
            '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', 
            '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', 
            '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', 
            '😫', '🥱', '😤', '😡', '😠', '🤬', '💀', '👻', '👽', '🤖'
        ]
    },
    gestures: {
        label: 'Gestures',
        icon: 'front_hand',
        emojis: [
            '👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '👊', '✊', '🤛', 
            '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', 
            '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '💅', '🤳', 
            '💪', '🦾', '👂', '👃', '👀', '👁️', '👅', '👄', '🧠', '🫀', 
            '🫁', '👣', '🫂', '🙏', '✍️', '🙋‍♂️', '🙋‍♀️', '🤷‍♂️', '🤷‍♀️', '🤦‍♂️'
        ]
    },
    work: {
        label: 'Work & Tech',
        icon: 'laptop_mac',
        emojis: [
            '💻', '🖥️', '⌨️', '🖱️', '📱', '📲', '☎️', '📞', '📟', '📠', 
            '🔋', '🔌', '💡', '🔦', '📁', '📂', '📄', '📃', '📑', '📊', 
            '📈', '📉', '📋', '📌', '📍', '📎', '📏', '📐', '✂️', '🔒', 
            '🔓', '🔑', '🛠️', '⚙️', '⚖️', '🧪', '🔬', '🔭', '📡', '🛰️', 
            '🚀', '🏢', '💼', '🗓️', '📅', '⏰', '⏳', '⌛', '🎯', '🏆', 
            '🥇', '🥈', '🥉', '🏅', '🎖️', '✅', '❌', '⚠️', '⚡', '🔥'
        ]
    },
    energy: {
        label: 'Fun & Energy',
        icon: 'celebration',
        emojis: [
            '🎉', '🎊', '🎈', '🎁', '🎂', '🍰', '🧁', '☕', '🍵', '🥂', 
            '🍻', '🍕', '🍔', '🍟', '🍩', '🍪', '🍫', '🍿', '⚽', '🏀', 
            '🎾', '🎮', '🎲', '🎨', '🎵', '🎸', '🎹', '🏆', '🎯', '🌟',
            '💫', '💥', '✨', '⚡', '🔥', '🌈', '☀️', '⭐', '🚀', '💯'
        ]
    },
    hearts: {
        label: 'Hearts & Love',
        icon: 'favorite',
        emojis: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', 
            '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌',
            '🌹', '🌸', '💐', '🌺', '🌷', '🌻', '🌼', '👑', '💎', '🕊️'
        ]
    }
};

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '🙌', '🚀', '💯', '✨', '🤝', '😍', '🧐', '✅'];
const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

const EMOJI_LABELS = {
    '😀': 'Grinning Face', '😃': 'Smiley Face', '😄': 'Smiling Eyes', '😁': 'Beaming Face', '😆': 'Grinning Squint',
    '😅': 'Sweat Smile', '🤣': 'ROFL', '😂': 'Tears of Joy', '🙂': 'Slight Smile', '🙃': 'Upside Down',
    '😉': 'Wink', '😊': 'Blushing Smile', '😇': 'Halo Angel', '🥰': 'Hearts Smiling', '😍': 'Heart Eyes',
    '🤩': 'Star Struck', '😘': 'Blowing Kiss', '😗': 'Kissing', '😚': 'Closed Eyes Kiss', '😋': 'Yummy',
    '😛': 'Tongue Out', '😜': 'Winking Tongue', '🤪': 'Zany Face', '😝': 'Squinting Tongue', '🤑': 'Money Mouth',
    '🤗': 'Hugging', '🤭': 'Hand Over Mouth', '🤫': 'Shushing', '🤔': 'Thinking Face', '🤐': 'Zipper Mouth',
    '🤨': 'Raised Eyebrow', '😐': 'Neutral Face', '😑': 'Expressionless', '😶': 'No Mouth', '😏': 'Smirking',
    '😒': 'Unamused', '🙄': 'Rolling Eyes', '😬': 'Grimacing', '🤥': 'Lying Pinocchio', '😌': 'Relieved',
    '😔': 'Pensive', '😪': 'Sleepy', '🤤': 'Drooling', '😴': 'Sleeping', '😷': 'Mask Face',
    '🤒': 'Thermometer', '🤕': 'Bandaged', '🤢': 'Nauseated', '🤮': 'Vomiting', '🤧': 'Sneezing',
    '🥵': 'Hot Face', '🥶': 'Cold Face', '🥴': 'Woozy', '😵': 'Dizzy', '🤯': 'Mind Blown',
    '🤠': 'Cowboy', '🥳': 'Partying Face', '😎': 'Sunglasses Cool', '🤓': 'Nerd Glass', '🧐': 'Face with Monocle',
    '😕': 'Confused', '😟': 'Worried', '🙁': 'Slight Frown', '😮': 'Open Mouth', '😯': 'Hushed',
    '😲': 'Astonished', '😳': 'Flushed', '🥺': 'Pleading Eyes', '😦': 'Frowning', '😧': 'Anguished',
    '😰': 'Anxious Sweat', '😥': 'Sad Relieved', '😢': 'Crying Tear', '😭': 'Loudly Crying', '😱': 'Screaming Fear',
    '😖': 'Confounded', '😣': 'Persevering', '😞': 'Disappointed', '😓': 'Downcast Sweat', '😩': 'Weary',
    '😫': 'Tired', '🥱': 'Yawning', '😤': 'Triumph Hmph', '😡': 'Pouting Red', '😠': 'Angry',
    '🤬': 'Swearing', '💀': 'Skull Dead', '👻': 'Ghost', '👽': 'Alien', '🤖': 'Robot',

    '👍': 'Thumbs Up', '👎': 'Thumbs Down', '👏': 'Clapping Hands', '🙌': 'Raising Hands', '👐': 'Open Hands',
    '🤲': 'Palms Together', '🤝': 'Handshake', '👊': 'Fist Bump', '✊': 'Raised Fist', '🤛': 'Left Fist',
    '🤜': 'Right Fist', '🤞': 'Fingers Crossed', '✌️': 'Peace / Victory', '🤟': 'Love You Gesture', '🤘': 'Rock On',
    '👌': 'OK Hand', '🤌': 'Pinched Fingers', '🤏': 'Pinching Hand', '👈': 'Pointing Left', '👉': 'Pointing Right',
    '👆': 'Pointing Up', '👇': 'Pointing Down', '☝️': 'Index Pointing', '👋': 'Waving Hand', '🤚': 'Raised Back of Hand',
    '🖐️': 'Splayed Hand', '✋': 'Raised Hand / Stop', '🖖': 'Vulcan Salute', '💅': 'Nail Polish', '🤳': 'Selfie',
    '💪': 'Flexed Biceps / Strong', '🦾': 'Mechanical Arm', '👂': 'Ear', '👃': 'Nose', '👀': 'Eyes Looking',
    '👁️': 'Eye', '👅': 'Tongue', '👄': 'Mouth', '🧠': 'Brain / Intellect', '🫀': 'Anatomical Heart',
    '🫁': 'Lungs', '👣': 'Footprints', '🫂': 'People Hugging', '🙏': 'Folded Hands / Thank You', '✍️': 'Writing Hand',

    '💻': 'Laptop / Code', '🖥️': 'Desktop Computer', '⌨️': 'Keyboard', '🖱️': 'Computer Mouse', '📱': 'Mobile Phone',
    '📲': 'Mobile Call', '☎️': 'Telephone', '📞': 'Phone Receiver', '📟': 'Pager', '📠': 'Fax',
    '🔋': 'Battery', '🔌': 'Power Plug', '💡': 'Lightbulb / Idea', '🔦': 'Flashlight', '📁': 'File Folder',
    '📂': 'Open Folder', '📄': 'Document Page', '📃': 'Curled Page', '📑': 'Bookmark Tabs', '📊': 'Bar Chart',
    '📈': 'Upward Trend Chart', '📉': 'Downward Trend', '📋': 'Clipboard', '📌': 'Pushpin', '📍': 'Round Pushpin',
    '📎': 'Paperclip', '📏': 'Straight Ruler', '📐': 'Triangle Ruler', '✂️': 'Scissors', '🔒': 'Locked',
    '🔓': 'Unlocked', '🔑': 'Key', '🛠️': 'Hammer and Wrench', '⚙️': 'Gear / Settings', '⚖️': 'Balance Scale',
    '🧪': 'Test Tube', '🔬': 'Microscope', '🔭': 'Telescope', '📡': 'Satellite Dish', '🛰️': 'Satellite',
    '🚀': 'Rocket / Fast Launch', '🏢': 'Office Building', '💼': 'Briefcase', '🗓️': 'Spiral Calendar', '📅': 'Calendar Date',
    '⏰': 'Alarm Clock', '⏳': 'Hourglass Flowing', '⌛': 'Hourglass Done', '🎯': 'Target Bullseye', '🏆': 'Trophy Champion',
    '🥇': '1st Place Gold Medal', '🥈': '2nd Place Silver Medal', '🥉': '3rd Place Bronze Medal', '🏅': 'Sports Medal', '🎖️': 'Military Medal',
    '✅': 'Checkmark Box', '❌': 'Cross Mark', '⚠️': 'Warning Alert', '⚡': 'High Voltage Lightning', '🔥': 'Fire / Lit',

    '❤️': 'Red Heart', '🧡': 'Orange Heart', '💛': 'Yellow Heart', '💚': 'Green Heart', '💙': 'Blue Heart',
    '💜': 'Purple Heart', '🖤': 'Black Heart', '🤍': 'White Heart', '🤎': 'Brown Heart', '💔': 'Broken Heart',
    '❣️': 'Heart Exclamation', '💕': 'Two Hearts', '💞': 'Revolving Hearts', '💓': 'Beating Heart', '💗': 'Growing Heart',
    '💖': 'Sparkling Heart', '💘': 'Heart with Arrow', '💝': 'Heart with Ribbon', '💟': 'Heart Decoration', '✨': 'Sparkles / Magic',
    '⭐': 'Star', '🌟': 'Glowing Star', '💫': 'Dizzy Star', '💥': 'Collision Boom', '💯': '100 Points',
    '🎉': 'Party Popper', '🎊': 'Confetti Ball', '🎈': 'Balloon', '🎁': 'Wrapped Gift', '🎂': 'Birthday Cake',
    '🍰': 'Shortcake', '🧁': 'Cupcake', '☕': 'Hot Coffee', '🍵': 'Green Tea', '🥂': 'Clinking Glasses',
    '🍻': 'Clinking Beer Mugs', '🍕': 'Pizza Slice', '🍔': 'Hamburger', '🍟': 'French Fries', '🍩': 'Doughnut',
    '🍪': 'Cookie', '🍫': 'Chocolate Bar', '🍿': 'Popcorn', '⚽': 'Soccer Ball', '🏀': 'Basketball',
    '🎾': 'Tennis Ball', '🎮': 'Video Game Controller', '🎲': 'Game Die', '🎨': 'Artist Palette', '🎵': 'Musical Note'
};

/**
 * Extracts a Clip ID from shared text or URL patterns
 */
export const extractClipIdFromText = (text) => {
    if (!text || typeof text !== 'string') return null;
    const match = text.match(/(?:https?:\/\/[^\s]+)?\/clips(?:\?id=|\/)([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : null;
};

/**
 * Interactive preview card for clips shared in messages
 */
function MessageClipCard({ clipId, isMe, navigate }) {
    const [clipData, setClipData] = useState(null);

    useEffect(() => {
        if (!clipId) return;
        let isMounted = true;
        // 1. Check local caches for zero latency
        try {
            const localClips = JSON.parse(localStorage.getItem('knome_my_uploaded_clips') || '[]');
            const localSaved = JSON.parse(localStorage.getItem('knome_saved_clips') || '[]');
            const found = [...localClips, ...localSaved].find(c => String(c.clipId || c.id) === String(clipId));
            if (found && isMounted) {
                setClipData(found);
                return;
            }
        } catch {}

        // 2. Query backend API
        if (typeof clipsApi?.getById === 'function') {
            clipsApi.getById(clipId).then(res => {
                const data = res?.data !== undefined ? res.data : res;
                if (data && (data.clipId || data.id) && isMounted) {
                    setClipData(data);
                }
            }).catch(() => {});
        }

        return () => { isMounted = false; };
    }, [clipId]);

    const handleOpenClip = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`/clips?id=${clipId}`);
    };

    const title = clipData?.title || `Knome Clip #${clipId}`;
    const rawThumb = clipData?.thumbnailUrl || clipData?.videoUrl;
    const thumb = resolveMediaUrl(rawThumb) || rawThumb;
    const author = clipData?.creatorName || 'Colleague';

    return (
        <div
            onClick={handleOpenClip}
            className={`mt-2 rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer group shadow-sm select-none ${
                isMe
                    ? 'bg-black/25 hover:bg-black/35 border-white/25 text-white'
                    : 'bg-slate-50 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-700 hover:border-pink-500/60 text-slate-900 dark:text-white'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenClip(e); }}
            title="Click to directly open and play this clip"
        >
            <div className="flex items-center gap-3 p-2.5">
                {/* Reel Thumbnail or Video Box */}
                <div className="relative w-14 h-18 sm:w-16 sm:h-20 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-black/20 flex items-center justify-center">
                    {thumb && !thumb.includes('.mp4') ? (
                        <img 
                            src={thumb} 
                            alt={title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-pink-600 via-rose-600 to-indigo-900 flex items-center justify-center">
                            <span className="material-symbols-outlined text-white/90 text-2xl">movie</span>
                        </div>
                    )}
                    {/* Play Badge Overlay */}
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/10 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-sm font-fill ml-0.5">play_arrow</span>
                        </div>
                    </div>
                </div>

                {/* Info & Watch CTA */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/30">
                            <span className="material-symbols-outlined text-[11px]">movie</span>
                            Knome Clip
                        </span>
                        <span className={`text-[10.5px] truncate ${isMe ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                            • {author}
                        </span>
                    </div>

                    <p className={`text-xs sm:text-[13px] font-bold line-clamp-2 leading-snug group-hover:text-pink-400 transition-colors ${
                        isMe ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                    }`}>
                        {title}
                    </p>

                    <div className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-pink-400 group-hover:text-pink-300 transition-colors">
                        <span>Tap to watch & play clip</span>
                        <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Tokenizes and formats message text with clickable links and @mentions
 */
const renderMessageContentWithLinks = (text, isMe, navigate) => {
    if (!text) return null;
    const tokenRegex = /(https?:\/\/[^\s]+|\/clips(?:\?id=|\/)[a-zA-Z0-9_-]+|@[a-zA-Z0-9_\s]+?(?=\s|[.,!?]|$))/gi;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
        if (!part) return null;

        // 1. @mention
        if (part.startsWith('@') && part.length > 1) {
            return (
                <span
                    key={idx}
                    className={`font-bold px-1 py-0.5 rounded ${
                        isMe
                            ? 'bg-black/20 text-white underline decoration-white/40'
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    }`}
                >
                    {part}
                </span>
            );
        }

        // 2. URL or internal /clips link
        const isUrl = /^https?:\/\//i.test(part) || /^\/clips(?:\?id=|\/)/i.test(part);
        if (isUrl) {
            const clipIdMatch = /(?:https?:\/\/[^\s]+)?\/clips(?:\?id=|\/)([a-zA-Z0-9_-]+)/i.exec(part);
            const clipId = clipIdMatch ? clipIdMatch[1] : null;

            const handleLinkClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (clipId) {
                    navigate(`/clips?id=${clipId}`);
                } else {
                    try {
                        const urlObj = new URL(part, window.location.origin);
                        if (urlObj.origin === window.location.origin) {
                            navigate(urlObj.pathname + urlObj.search + urlObj.hash);
                            return;
                        }
                    } catch {}
                    window.open(part, '_blank', 'noopener,noreferrer');
                }
            };

            return (
                <a
                    key={idx}
                    href={part}
                    onClick={handleLinkClick}
                    className={`underline font-semibold cursor-pointer break-all transition-colors inline-flex items-center gap-0.5 ${
                        isMe
                            ? 'text-cyan-200 hover:text-white decoration-cyan-300/60'
                            : 'text-indigo-600 dark:text-cyan-400 hover:underline decoration-indigo-400'
                    }`}
                    title={clipId ? `Open & play Clip #${clipId}` : 'Open link'}
                >
                    <span>{part}</span>
                    {clipId && (
                        <span className="material-symbols-outlined text-[13px] inline leading-none ml-0.5">
                            play_circle
                        </span>
                    )}
                </a>
            );
        }

        return <span key={idx}>{part}</span>;
    });
};

export default function Messages() {
    const { isMessagingEnabled } = useSystemConfig();
    const { currentUser, users: contextUsers } = useUser();
    const { addToast } = useToast();
    const currentUserId = Number(currentUser?.userId || currentUser?.id || 0);
    const location = useLocation();
    const navigate = useNavigate();

    // ── 1st-Degree Connections State ──
    const [connectedUserIds, setConnectedUserIds] = useState(new Set());
    const [isConnectionsLoaded, setIsConnectionsLoaded] = useState(false);
    const [pendingConnectIds, setPendingConnectIds] = useState(new Set());

    // ── Real-Time Online Presence State ──
    const [onlineUserIds, setOnlineUserIds] = useState(new Set());

    // ── Real API Conversations & Messages State ──
    const [conversations, setConversations] = useState([]);
    const [isLoadingConversations, setIsLoadingConversations] = useState(true);
    const [conversationsError, setConversationsError] = useState(null);

    const [activePartnerId, setActivePartnerId] = useState(null);
    const [activePartnerDraft, setActivePartnerDraft] = useState(null);
    const [activeHistory, setActiveHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    const [isNetworkOffline, setIsNetworkOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const conversationsRef = useRef(conversations);
    conversationsRef.current = conversations;
    const activePartnerIdRef = useRef(activePartnerId);
    activePartnerIdRef.current = activePartnerId;
    const activePartnerDraftRef = useRef(activePartnerDraft);
    activePartnerDraftRef.current = activePartnerDraft;

    // ── Pagination State ──
    const [historyPage, setHistoryPage] = useState(1);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);

    // ── Typing Indicator States ──
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const partnerTypingTimerRef = useRef(null);
    const typingDebounceTimerRef = useRef(null);

    // ── Reply, Edit & Reaction States ──
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [messageToDelete, setMessageToDelete] = useState(null);
    const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState(null);

    // ── Drafts State (per partner) ──
    const [drafts, setDrafts] = useState(() => {
        try {
            const raw = localStorage.getItem(`knome_message_drafts_${currentUserId}`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    // ── New Message Candidate Search State ──
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [colleagueSearch, setColleagueSearch] = useState('');
    const [searchedUsers, setSearchedUsers] = useState([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread'
    const [inputMessage, setInputMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const isSendingRef = useRef(false);
    const [showMobileChat, setShowMobileChat] = useState(false);

    // ── Emoji & File Attachment States ──
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [emojiCategory, setEmojiCategory] = useState('smileys');
    const [emojiSearch, setEmojiSearch] = useState('');
    const [hoveredEmoji, setHoveredEmoji] = useState(null);
    const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
    const emojiPickerRef = useRef(null);
    const chatInputRef = useRef(null);

    const [attachedFiles, setAttachedFiles] = useState([]);
    const [previewMediaModal, setPreviewMediaModal] = useState(null);
    const fileAttachmentInputRef = useRef(null);

    const messagesEndRef = useRef(null);
    const chatFeedRef = useRef(null);

    // Format raw API message to UI message
    const formatMessageItem = useCallback((m) => {
        if (!m) return null;
        let parsedAttachments = [];
        if (m.attachmentsJson) {
            try {
                parsedAttachments = JSON.parse(m.attachmentsJson);
            } catch {}
        }
        const msgDate = m.createdDate ? new Date(m.createdDate) : new Date();
        const rawContent = m.content || m.text || '';
        const cleanContent = (rawContent === '\u200B' || rawContent === ' ') ? '' : rawContent;
        return {
            id: m.messageId,
            messageId: m.messageId,
            senderId: Number(m.senderId),
            senderName: m.senderName || '',
            receiverId: Number(m.receiverId),
            content: cleanContent,
            text: cleanContent,
            attachments: Array.isArray(parsedAttachments) ? parsedAttachments : [],
            isRead: Boolean(m.isRead),
            isEdited: Boolean(m.isEdited),
            isDeleted: Boolean(m.isDeleted),
            parentMessageId: m.parentMessageId,
            parentContent: m.parentContent,
            parentSenderName: m.parentSenderName,
            reactions: Array.isArray(m.reactions) ? m.reactions : [],
            time: msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: msgDate.getTime(),
            createdDate: m.createdDate || msgDate.toISOString(),
            status: 'sent'
        };
    }, []);

    // ── Helper to check if a message can be edited (within 15 minutes of sending) ──
    const canEditMessage = useCallback((msg) => {
        if (!msg || msg.status === 'sending' || msg.isDeleted) return false;
        const msgTime = msg.timestamp || (msg.createdDate ? new Date(msg.createdDate).getTime() : 0);
        if (!msgTime) return false;
        const diffMinutes = (Date.now() - msgTime) / (1000 * 60);
        return diffMinutes <= 15;
    }, []);

    // ── Load Connections to enforce messaging restrictions ──
    const loadConnections = useCallback(async () => {
        if (!currentUserId) return;
        try {
            const res = await userApi.getConnections(currentUserId);
            const list = Array.isArray(res) ? res : (res?.data || []);
            const ids = new Set(list.map(u => Number(u.id || u.userId)).filter(Boolean));
            setConnectedUserIds(ids);
            setIsConnectionsLoaded(true);
        } catch (err) {
            console.warn('[Messages] Failed to load connections:', err);
            setIsConnectionsLoaded(true);
        }
    }, [currentUserId]);

    useEffect(() => {
        loadConnections();
        window.addEventListener('network-updated', loadConnections);
        return () => window.removeEventListener('network-updated', loadConnections);
    }, [loadConnections]);

    // Send connection request directly from chat restriction banner
    const handleSendConnectRequest = async (targetId, targetName) => {
        try {
            await userApi.connect(targetId);
            setPendingConnectIds(prev => new Set([...prev, targetId]));
            addToast(`Connection request sent to ${targetName}. Once accepted, you can message each other.`, 'success');
        } catch (err) {
            const msg = err?.message || '';
            if (msg.includes('already') || msg.includes('Already')) {
                addToast('A connection request is already pending.', 'info');
                setPendingConnectIds(prev => new Set([...prev, targetId]));
            } else {
                addToast('Failed to send connection request.', 'error');
            }
        }
    };

    // ── Real-Time SignalR Connection & Event Subscriptions ──
    useEffect(() => {
        if (!currentUserId || !isMessagingEnabled) return;

        const loadOnline = () => {
            fetchOnlineUserIds().then(ids => {
                if (Array.isArray(ids)) {
                    setOnlineUserIds(new Set(ids.map(Number)));
                }
            });
        };
        initMessengerSignalR(currentUserId).then(loadOnline);
        loadOnline();

        // 1. New live message received
        const handleLiveMessage = (e) => {
            const data = e.detail;
            if (!data) return;

            const senderId = Number(data.senderId);
            const receiverId = Number(data.receiverId);

            // Format incoming message
            const newMsg = formatMessageItem(data);

            // Update active conversation history if currently open
            if (activePartnerId && (senderId === activePartnerId || receiverId === activePartnerId)) {
                setHistoryError(null);
                setActiveHistory(prev => {
                    // Check if this message already exists by ID
                    const exists = prev.some(m => 
                        String(m.id) === String(newMsg.id) || 
                        String(m.messageId) === String(newMsg.id) ||
                        (m.messageId && newMsg.messageId && String(m.messageId) === String(newMsg.messageId))
                    );
                    if (exists) return prev;

                    // If sent by me, check if an optimistic temp message exists and replace it
                    if (senderId === currentUserId) {
                        const tempIndex = prev.findIndex(m => 
                            String(m.id).startsWith('temp_') && 
                            Number(m.receiverId) === receiverId &&
                            ((m.text || '').trim() === (newMsg.text || '').trim() || !m.text || !newMsg.text)
                        );
                        if (tempIndex !== -1) {
                            const next = [...prev];
                            next[tempIndex] = newMsg;
                            return next;
                        }
                    }

                    return [...prev, newMsg];
                });

                // Mark read if looking at this chat and message was sent by partner
                if (senderId === activePartnerId) {
                    messagesApi.markAsRead(activePartnerId).catch(() => {});
                }
            }

            // Refresh conversations list to update sidebar preview and unread count
            fetchConversations(true);

            // Play audio chime if received from partner
            if (receiverId === currentUserId && senderId !== currentUserId) {
                playMessageChime();
            }
        };

        // 2. Message edited
        const handleMessageEdited = (e) => {
            const data = e.detail;
            if (!data) return;
            setActiveHistory(prev => prev.map(m => {
                if (String(m.id) === String(data.messageId)) {
                    return { ...m, text: data.content, content: data.content, isEdited: true, editedDate: data.editedDate };
                }
                return m;
            }));
            fetchConversations(true);
        };

        // 3. Message deleted (WhatsApp style: Delete for Everyone vs Delete for Me)
        const handleMessageDeleted = (e) => {
            const data = e.detail;
            if (!data) return;
            if (data.deleteForEveryone) {
                setActiveHistory(prev => prev.map(m => {
                    if (String(m.id) === String(data.messageId)) {
                        return { ...m, isDeleted: true, text: 'This message was deleted', content: 'This message was deleted', attachments: [] };
                    }
                    return m;
                }));
            } else {
                // Delete for me: remove message completely for the deleting user
                setActiveHistory(prev => prev.filter(m => String(m.id) !== String(data.messageId)));
            }
            fetchConversations(true);
        };

        // 4. Message reactions updated
        const handleReactionUpdated = (e) => {
            const data = e.detail;
            if (!data) return;
            setActiveHistory(prev => prev.map(m => {
                if (String(m.id) === String(data.messageId)) {
                    return { ...m, reactions: data.reactions || [] };
                }
                return m;
            }));
        };

        // 5. User typing indicator
        const handleUserTyping = (e) => {
            const data = e.detail;
            if (!data) return;
            if (activePartnerId && Number(data.senderId) === activePartnerId) {
                setIsPartnerTyping(Boolean(data.isTyping));
                if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
                if (data.isTyping) {
                    partnerTypingTimerRef.current = setTimeout(() => {
                        setIsPartnerTyping(false);
                    }, 3000);
                }
            }
        };

        // 6. Messages marked as read by other user
        const handleMessagesRead = (e) => {
            const data = e.detail;
            if (!data) return;
            if (activePartnerId && Number(data.partnerId) === activePartnerId) {
                setActiveHistory(prev => prev.map(m => {
                    if (Number(m.senderId) === currentUserId) {
                        return { ...m, isRead: true };
                    }
                    return m;
                }));
            }
        };

        // 7. Presence change
        const handlePresenceChanged = (e) => {
            const data = e.detail;
            if (!data) return;
            const uId = Number(data.userId);
            setOnlineUserIds(prev => {
                const next = new Set(prev);
                if (data.isOnline) {
                    next.add(uId);
                } else {
                    next.delete(uId);
                }
                return next;
            });
        };

        window.addEventListener('knome_receive_direct_message', handleLiveMessage);
        window.addEventListener('knome_message_edited', handleMessageEdited);
        window.addEventListener('knome_message_deleted', handleMessageDeleted);
        window.addEventListener('knome_message_reaction_updated', handleReactionUpdated);
        window.addEventListener('knome_user_typing', handleUserTyping);
        window.addEventListener('knome_messages_read', handleMessagesRead);
        window.addEventListener('knome_user_presence_changed', handlePresenceChanged);

        return () => {
            window.removeEventListener('knome_receive_direct_message', handleLiveMessage);
            window.removeEventListener('knome_message_edited', handleMessageEdited);
            window.removeEventListener('knome_message_deleted', handleMessageDeleted);
            window.removeEventListener('knome_message_reaction_updated', handleReactionUpdated);
            window.removeEventListener('knome_user_typing', handleUserTyping);
            window.removeEventListener('knome_messages_read', handleMessagesRead);
            window.removeEventListener('knome_user_presence_changed', handlePresenceChanged);
            if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
            if (typingDebounceTimerRef.current) clearTimeout(typingDebounceTimerRef.current);
        };
    }, [currentUserId, activePartnerId, formatMessageItem]);

    // ── Fetch Conversations from Real API ──
    const fetchConversations = useCallback(async (isSilent = false) => {
        if (!currentUserId || !isMessagingEnabled) return;
        if (!isSilent) {
            setIsLoadingConversations(true);
            setConversationsError(null);
        }
        try {
            const res = await messagesApi.getConversations();
            const list = res?.data || (Array.isArray(res) ? res : []);
            setConversations(list);
            try {
                localStorage.setItem(`knome_cached_conversations_${currentUserId}`, JSON.stringify(list));
            } catch (_) {}

            const totalUnread = list.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
            localStorage.setItem(`knome_unread_messages_count_${currentUserId}`, String(totalUnread));
            localStorage.setItem('knome_unread_messages_count', String(totalUnread));
            window.dispatchEvent(new CustomEvent('knome_messages_updated', { detail: { unreadCount: totalUnread } }));

            if (!activePartnerIdRef.current && list.length > 0 && !activePartnerDraftRef.current) {
                setActivePartnerId(list[0].partnerId);
            }
        } catch (err) {
            console.warn('[Messages] Notice: Server conversations temporarily unavailable:', err);
            try {
                const cached = JSON.parse(localStorage.getItem(`knome_cached_conversations_${currentUserId}`) || '[]');
                if (cached.length > 0) {
                    setConversations(cached);
                    setConversationsError(null);
                } else {
                    setConversations([]);
                    // Do not show fatal error block; let user start new conversation
                    setConversationsError(null);
                }
            } catch (_) {
                setConversations([]);
                setConversationsError(null);
            }
        } finally {
            if (!isSilent) {
                setIsLoadingConversations(false);
            }
        }
    }, [currentUserId, isMessagingEnabled]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // ── Fetch Message History for Active Conversation ──
    const fetchActiveHistory = useCallback(async (partnerId, isSilent = false) => {
        if (!partnerId || !currentUserId) return;
        if (!isSilent) {
            // Check instant local cache first to avoid blank buffering
            try {
                const cached = JSON.parse(localStorage.getItem(`knome_cached_messages_${currentUserId}_${partnerId}`) || '[]');
                if (Array.isArray(cached) && cached.length > 0) {
                    setActiveHistory(cached);
                    setIsLoadingHistory(false);
                } else {
                    setIsLoadingHistory(true);
                }
            } catch (_) {
                setIsLoadingHistory(true);
            }
            setHistoryError(null);
        }
        try {
            const res = await messagesApi.getHistory(partnerId, 1, 50);
            const rawList = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            const formatted = rawList.map(formatMessageItem).filter(Boolean);

            setHistoryError(null);
            setHistoryPage(1);
            setHasMoreHistory(rawList.length >= 50);

            // Cache conversation messages locally for instant load and offline resilience
            try {
                localStorage.setItem(`knome_cached_messages_${currentUserId}_${partnerId}`, JSON.stringify(formatted));
            } catch (_) {}

            setActiveHistory(prev => {
                const inFlight = prev.filter(m => m.status === 'sending' || m.status === 'failed');
                const existingMap = new Map(formatted.map(m => [m.id, m]));
                inFlight.forEach(ifMsg => {
                    if (!existingMap.has(ifMsg.id)) {
                        formatted.push(ifMsg);
                    }
                });
                return formatted;
            });

            // Mark conversation as read on server (only update state if unreadCount was > 0)
            messagesApi.markAsRead(partnerId).then(() => {
                setConversations(prev => {
                    const target = prev.find(c => c.partnerId === partnerId);
                    if (!target || target.unreadCount === 0) return prev;
                    return prev.map(c => c.partnerId === partnerId ? { ...c, unreadCount: 0 } : c);
                });
            }).catch(() => {});
        } catch (err) {
            console.warn('[Messages] Failed to fetch message history from server, checking local cache:', err);
            
            // Check local storage cache fallback
            let hasCache = false;
            try {
                const cached = JSON.parse(localStorage.getItem(`knome_cached_messages_${currentUserId}_${partnerId}`) || '[]');
                if (Array.isArray(cached) && cached.length > 0) {
                    setActiveHistory(cached);
                    setHistoryError(null);
                    hasCache = true;
                }
            } catch (_) {}

            if (!hasCache) {
                // If conversation summary has a preview, create initial preview message so conversation is usable
                const convSummary = conversationsRef.current.find(c => c.partnerId === partnerId);
                if (convSummary && (convSummary.lastMessageText || convSummary.lastMessagePreview)) {
                    const fallbackDate = convSummary.lastMessageDate ? new Date(convSummary.lastMessageDate) : new Date();
                    const syntheticMsg = {
                        id: convSummary.lastMessageId || `preview_${partnerId}`,
                        messageId: convSummary.lastMessageId || `preview_${partnerId}`,
                        senderId: convSummary.partnerId,
                        senderName: convSummary.partnerName || 'Colleague',
                        receiverId: currentUserId,
                        content: convSummary.lastMessageText || convSummary.lastMessagePreview,
                        text: convSummary.lastMessageText || convSummary.lastMessagePreview,
                        attachments: [],
                        isRead: true,
                        time: fallbackDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        timestamp: fallbackDate.getTime(),
                        createdDate: fallbackDate.toISOString(),
                        status: 'sent'
                    };
                    setActiveHistory([syntheticMsg]);
                    setHistoryError(null);
                } else if (!isSilent) {
                    setHistoryError('Failed to load message history.');
                }
            }
        } finally {
            if (!isSilent) {
                setIsLoadingHistory(false);
            }
        }
    }, [currentUserId, formatMessageItem]);

    // When active partner changes, fetch history and load draft
    useEffect(() => {
        if (activePartnerId) {
            fetchActiveHistory(activePartnerId);
            setIsPartnerTyping(false);
            setReplyingTo(null);
            setEditingMessageId(null);

            // Restore draft message
            const savedDraft = drafts[activePartnerId] || '';
            setInputMessage(savedDraft);
        } else {
            setActiveHistory([]);
            setInputMessage('');
        }
    }, [activePartnerId, fetchActiveHistory]);

    // ── Network Disconnect / Reconnect Auto-Healing Watchdog ──
    useEffect(() => {
        if (!currentUserId) return;

        const handleOffline = () => {
            console.warn('[Messages] Network disconnected.');
            setIsNetworkOffline(true);
        };

        const handleReconnecting = () => {
            setIsReconnecting(true);
        };

        const handleRestored = () => {
            console.log('[Messages] Network restored/reconnected. Auto-healing chat and resyncing messages...');
            setIsNetworkOffline(false);
            setIsReconnecting(false);
            setHistoryError(null);
            apiClient.clearCache();

            // Re-ensure SignalR connection is active
            ensureMessengerConnected(currentUserId);

            // Fetch online status and conversations
            fetchOnlineUserIds().then(ids => {
                if (Array.isArray(ids)) {
                    setOnlineUserIds(new Set(ids.map(Number)));
                }
            }).catch(() => {});
            fetchConversations(true);

            // Re-fetch active conversation history automatically
            if (activePartnerId) {
                fetchActiveHistory(activePartnerId, true);
            }
        };

        window.addEventListener('online', handleRestored);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('knome_network_restored', handleRestored);
        window.addEventListener('knome_messenger_reconnected', handleRestored);
        window.addEventListener('knome_messenger_reconnecting', handleReconnecting);

        return () => {
            window.removeEventListener('online', handleRestored);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('knome_network_restored', handleRestored);
            window.removeEventListener('knome_messenger_reconnected', handleRestored);
            window.removeEventListener('knome_messenger_reconnecting', handleReconnecting);
        };
    }, [currentUserId, activePartnerId, fetchConversations, fetchActiveHistory]);

    // ── Infinite Scrolling for Older Messages ──
    const handleChatFeedScroll = async () => {
        if (!chatFeedRef.current || isLoadingMoreHistory || !hasMoreHistory || !activePartnerId) return;
        if (chatFeedRef.current.scrollTop === 0) {
            setIsLoadingMoreHistory(true);
            const oldScrollHeight = chatFeedRef.current.scrollHeight;
            try {
                const nextPage = historyPage + 1;
                const res = await messagesApi.getHistory(activePartnerId, nextPage, 50);
                const olderRaw = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                if (olderRaw.length === 0) {
                    setHasMoreHistory(false);
                } else {
                    const formattedOlder = olderRaw.map(formatMessageItem).filter(Boolean);
                    setActiveHistory(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newItems = formattedOlder.filter(m => !existingIds.has(m.id));
                        return [...newItems, ...prev];
                    });
                    setHistoryPage(nextPage);

                    requestAnimationFrame(() => {
                        if (chatFeedRef.current) {
                            chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight - oldScrollHeight;
                        }
                    });
                }
            } catch (e) {
                console.error('[Messages] Failed to load older history:', e);
            } finally {
                setIsLoadingMoreHistory(false);
            }
        }
    };

    // ── Active Partner Info Resolution ──
    const activePartnerSummary = useMemo(() => {
        return conversations.find(c => c.partnerId === activePartnerId) || null;
    }, [conversations, activePartnerId]);

    const activePartner = useMemo(() => {
        if (activePartnerSummary) {
            return {
                userId: activePartnerSummary.partnerId,
                id: activePartnerSummary.partnerId,
                fullName: activePartnerSummary.partnerName,
                employeeId: activePartnerSummary.partnerEmployeeId,
                designation: activePartnerSummary.partnerDesignation || 'Colleague',
                department: activePartnerSummary.partnerDepartment || 'MPOnline',
                avatar: activePartnerSummary.partnerAvatarUrl,
                isConnected: activePartnerSummary.isConnected ?? connectedUserIds.has(activePartnerSummary.partnerId)
            };
        }
        if (activePartnerDraft) {
            return activePartnerDraft;
        }
        return null;
    }, [activePartnerSummary, activePartnerDraft, connectedUserIds]);

    const isPartnerOnline = useMemo(() => {
        if (!activePartner) return false;
        const partnerId = Number(activePartner.userId || activePartner.id);
        return onlineUserIds.has(partnerId);
    }, [activePartner, onlineUserIds]);

    const isTargetConnected = useMemo(() => {
        if (!activePartner) return false;
        if (typeof activePartner.isConnected === 'boolean') {
            return activePartner.isConnected;
        }
        return connectedUserIds.has(Number(activePartner.userId || activePartner.id));
    }, [activePartner, connectedUserIds]);

    // ── Search Candidates in "New Message" Modal ──
    useEffect(() => {
        if (!isNewChatOpen) return;
        const timer = setTimeout(async () => {
            setIsSearchingUsers(true);
            try {
                const res = await messagesApi.searchUsers(colleagueSearch);
                const list = res?.data || (Array.isArray(res) ? res : []);
                setSearchedUsers(list);
            } catch (e) {
                setSearchedUsers([]);
            } finally {
                setIsSearchingUsers(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [isNewChatOpen, colleagueSearch]);

    // ── URL Query Listener: When user clicks "Message" on Profile/Network ──
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const queryUserId = searchParams.get('userId') || searchParams.get('user') || searchParams.get('id');
        const queryName = searchParams.get('name');

        if (!queryUserId) return;
        const targetId = Number(queryUserId);
        if (!targetId || targetId === currentUserId) return;

        const existing = conversationsRef.current.find(c => c.partnerId === targetId);
        if (existing) {
            setActivePartnerId(targetId);
            setActivePartnerDraft(null);
            setShowMobileChat(true);
            setIsNewChatOpen(false);
            return;
        }

        const matched = (contextUsers || []).find(u => Number(u.userId || u.id) === targetId);
        if (matched) {
            const draftProfile = {
                userId: targetId,
                id: targetId,
                fullName: matched?.fullName || matched?.name || (queryName ? decodeURIComponent(queryName) : 'Colleague'),
                employeeId: matched?.employeeId,
                designation: matched?.designation || 'Colleague',
                department: matched?.department || 'MPOnline',
                avatar: matched?.avatar || matched?.profilePhotoUrl || null,
                isConnected: connectedUserIds.has(targetId)
            };
            setActivePartnerDraft(draftProfile);
            setActivePartnerId(targetId);
            setShowMobileChat(true);
            setIsNewChatOpen(false);
        } else {
            userApi.getById(targetId).then(res => {
                const u = res?.data || res;
                if (u) {
                    const draftProfile = {
                        userId: targetId,
                        id: targetId,
                        fullName: u.fullName || u.name || (queryName ? decodeURIComponent(queryName) : 'Colleague'),
                        employeeId: u.employeeId,
                        designation: u.designation || 'Colleague',
                        department: u.department || 'MPOnline',
                        avatar: u.avatar || u.profilePhotoUrl || null,
                        isConnected: connectedUserIds.has(targetId)
                    };
                    setActivePartnerDraft(draftProfile);
                    setActivePartnerId(targetId);
                    setShowMobileChat(true);
                    setIsNewChatOpen(false);
                }
            }).catch(() => {
                const fallbackProfile = {
                    userId: targetId,
                    id: targetId,
                    fullName: queryName ? decodeURIComponent(queryName) : 'Colleague',
                    designation: 'Colleague',
                    department: 'MPOnline',
                    avatar: null,
                    isConnected: connectedUserIds.has(targetId)
                };
                setActivePartnerDraft(fallbackProfile);
                setActivePartnerId(targetId);
                setShowMobileChat(true);
                setIsNewChatOpen(false);
            });
        }
    }, [location.search, currentUserId, contextUsers, connectedUserIds]);

    // ── Auto-scroll chat feed to bottom ──
    const scrollToBottom = useCallback((smooth = true) => {
        if (chatFeedRef.current) {
            if (smooth) {
                chatFeedRef.current.scrollTo({
                    top: chatFeedRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
            }
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => scrollToBottom(false), 50);
        return () => clearTimeout(timer);
    }, [activePartnerId, scrollToBottom]);

    useEffect(() => {
        scrollToBottom(true);
    }, [activeHistory.length, scrollToBottom]);

    // Scroll to specific quoted message in feed
    const scrollToMessage = (msgId) => {
        if (!msgId) return;
        const el = document.getElementById(`msg_bubble_${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-cyan-500', 'transition-all');
            setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-500'), 1500);
        } else {
            addToast('Quoted message is earlier in history.', 'info');
        }
    };

    // ── File Attachments Handlers ──
    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getFileIcon = (fileName = '', fileType = '') => {
        const ext = String(fileName || '').split('.').pop().toLowerCase();
        if (fileType?.startsWith('image/')) return { icon: 'image', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800' };
        if (ext === 'pdf') return { icon: 'picture_as_pdf', color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800' };
        if (['doc', 'docx'].includes(ext)) return { icon: 'description', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800' };
        if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'table_view', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' };
        if (['ppt', 'pptx'].includes(ext)) return { icon: 'slideshow', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' };
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: 'folder_zip', color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/60 border-yellow-200 dark:border-yellow-800' };
        if (fileType?.startsWith('video/')) return { icon: 'video_file', color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800' };
        if (fileType?.startsWith('audio/')) return { icon: 'audio_file', color: 'text-pink-500 bg-pink-50 dark:bg-pink-950/60 border-pink-200 dark:border-pink-800' };
        return { icon: 'draft', color: 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700' };
    };

    const handleDownloadAttachment = async (e, att) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!att) return;
        const rawUrl = att.url || att.dataUrl || att.uploadUrl;
        const attUrl = resolveMediaUrl(rawUrl) || rawUrl;
        if (!attUrl) return;

        try {
            if (attUrl.startsWith('data:') || attUrl.startsWith('blob:')) {
                const a = document.createElement('a');
                a.href = attUrl;
                a.download = att.name || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }

            const response = await fetch(attUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = att.name || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            window.open(attUrl, '_blank');
        }
    };

    const processFiles = (files) => {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => {
            const isImage = file.type?.startsWith('image/');
            const reader = new FileReader();

            reader.onload = () => {
                const dataUrl = reader.result;
                const newAtt = {
                    id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    name: file.name || (isImage ? 'image.png' : 'attachment'),
                    size: file.size || 0,
                    type: file.type || (isImage ? 'image/png' : 'application/octet-stream'),
                    isImage: Boolean(isImage),
                    dataUrl: dataUrl,
                    file: file,
                    isUploading: true
                };

                const uploadPromise = mediaApi.uploadFile(file, isImage ? 'image' : 'doc')
                    .then(res => {
                        const resolvedUrl = res?.url || res?.data?.url || (typeof res === 'string' ? res : null);
                        if (resolvedUrl) {
                            setAttachedFiles(current => current.map(item => 
                                item.id === newAtt.id ? { ...item, uploadUrl: resolvedUrl, isUploading: false } : item
                            ));
                            return resolvedUrl;
                        }
                        return null;
                    })
                    .catch(err => {
                        console.warn('[Messages] File upload fallback to dataUrl:', err);
                        setAttachedFiles(current => current.map(item => 
                            item.id === newAtt.id ? { ...item, isUploading: false } : item
                        ));
                        return null;
                    });

                newAtt.uploadPromise = uploadPromise;
                setAttachedFiles(prev => [...prev, newAtt]);
            };

            reader.readAsDataURL(file);
        });
    };

    const handleFileSelect = (e) => {
        processFiles(e.target.files);
        e.target.value = '';
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const filesToProcess = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type?.indexOf('image') !== -1 || items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) filesToProcess.push(file);
            }
        }
        if (filesToProcess.length > 0) {
            processFiles(filesToProcess);
        }
    };

    const removeAttachedFile = (fileId) => {
        setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
    };

    // ── Input, Mention & Typing Handlers ──
    const handleSelectMention = (user) => {
        if (!user) return;
        const cursor = chatInputRef.current?.selectionStart || inputMessage.length;
        const textBeforeCursor = inputMessage.slice(0, cursor);
        const textAfterCursor = inputMessage.slice(cursor);
        const atIndex = textBeforeCursor.lastIndexOf('@');
        if (atIndex !== -1) {
            const newTextBefore = textBeforeCursor.slice(0, atIndex) + `@${user.fullName} `;
            const newFullText = newTextBefore + textAfterCursor;
            setInputMessage(newFullText);
            setShowMentionSuggestions(false);
            setTimeout(() => {
                if (chatInputRef.current) {
                    chatInputRef.current.focus();
                    const newPos = newTextBefore.length;
                    chatInputRef.current.setSelectionRange(newPos, newPos);
                }
            }, 50);
        }
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputMessage(val);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

        // Check for @mention trigger
        const cursor = e.target.selectionStart || val.length;
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\s]*)$/);
        if (atMatch && activePartner) {
            setShowMentionSuggestions(true);
        } else {
            setShowMentionSuggestions(false);
        }

        if (activePartnerId) {
            setDrafts(prev => {
                const next = { ...prev, [activePartnerId]: val };
                try {
                    localStorage.setItem(`knome_message_drafts_${currentUserId}`, JSON.stringify(next));
                } catch {}
                return next;
            });

            sendTypingIndicator(activePartnerId, true);
            if (typingDebounceTimerRef.current) clearTimeout(typingDebounceTimerRef.current);
            typingDebounceTimerRef.current = setTimeout(() => {
                sendTypingIndicator(activePartnerId, false);
            }, 2500);
        }
    };

    // ── SEND MESSAGE HANDLER ──
    const handleSendMessage = async (e) => {
        if (e) {
            e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
        }
        if (isSendingRef.current) return;

        const text = inputMessage.trim();
        if ((!text && attachedFiles.length === 0) || !activePartner) return;

        isSendingRef.current = true;
        setIsSending(true);
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const targetPartnerId = Number(activePartner.userId || activePartner.id);

        // Stop typing indicator
        sendTypingIndicator(targetPartnerId, false);

        // Resolve attachments
        const currentAttachments = await Promise.all(attachedFiles.map(async f => {
            let finalUrl = f.uploadUrl;
            if (!finalUrl && f.uploadPromise) {
                try {
                    finalUrl = await f.uploadPromise;
                } catch {}
            }
            return {
                id: f.id,
                name: f.name,
                size: f.size,
                type: f.type,
                isImage: Boolean(f.isImage),
                url: finalUrl || f.dataUrl
            };
        }));

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const optimisticMsg = {
            id: tempId,
            messageId: tempId,
            senderId: currentUserId,
            senderName: currentUser?.fullName || 'Me',
            receiverId: targetPartnerId,
            content: text,
            text: text,
            attachments: currentAttachments,
            isRead: false,
            parentMessageId: replyingTo?.id || null,
            parentContent: replyingTo?.text || null,
            parentSenderName: replyingTo?.senderName || null,
            time: timeStr,
            timestamp: now.getTime(),
            status: 'sending'
        };

        setActiveHistory(prev => [...prev, optimisticMsg]);
        setInputMessage('');
        setAttachedFiles([]);
        setIsEmojiPickerOpen(false);
        setReplyingTo(null);

        // Clear stored draft for this partner
        setDrafts(prev => {
            const next = { ...prev };
            delete next[targetPartnerId];
            try {
                localStorage.setItem(`knome_message_drafts_${currentUserId}`, JSON.stringify(next));
            } catch {}
            return next;
        });

        if (chatInputRef.current) {
            chatInputRef.current.style.height = 'auto';
        }

        try {
            const attJson = currentAttachments.length > 0 ? JSON.stringify(currentAttachments) : null;
            const payloadText = text || (currentAttachments.length > 0 ? '\u200B' : '');
            const res = await messagesApi.send(targetPartnerId, payloadText, attJson, replyingTo?.id);
            const serverMsg = res?.data || res;

            setActiveHistory(prev => {
                // If SignalR handleLiveMessage already added or replaced the message with serverMsg.messageId:
                const alreadyHasServerId = prev.some(m => 
                    (String(m.id) === String(serverMsg.messageId) || String(m.messageId) === String(serverMsg.messageId)) && 
                    m.id !== tempId
                );
                if (alreadyHasServerId) {
                    // Remove optimistic temp message to avoid duplicate display
                    return prev.filter(m => m.id !== tempId);
                }
                // Otherwise update optimistic temp message with real server ID
                return prev.map(m => m.id === tempId ? {
                    ...m,
                    id: serverMsg.messageId || tempId,
                    messageId: serverMsg.messageId,
                    status: 'sent'
                } : m);
            });

            fetchConversations(true);
            setActivePartnerDraft(null);
        } catch (err) {
            console.error('[Messages] Failed to send message:', err);
            setActiveHistory(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
            const msg = err?.data?.message || err?.message || 'Failed to deliver message.';
            addToast(`Delivery failed: ${msg}`, 'error');
        } finally {
            isSendingRef.current = false;
            setIsSending(false);
        }
    };

    // Retry sending a previously failed message
    const handleRetrySend = async (failedMsg) => {
        if (!failedMsg || !activePartner) return;
        const targetPartnerId = Number(activePartner.userId || activePartner.id);

        setActiveHistory(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sending' } : m));

        try {
            const attJson = failedMsg.attachments?.length > 0 ? JSON.stringify(failedMsg.attachments) : null;
            const rawFailedText = (failedMsg.text || failedMsg.content || '').trim();
            const payloadText = rawFailedText || (failedMsg.attachments?.length > 0 ? '\u200B' : '');
            const res = await messagesApi.send(targetPartnerId, payloadText, attJson, failedMsg.parentMessageId);
            const serverMsg = res?.data || res;

            setActiveHistory(prev => prev.map(m => m.id === failedMsg.id ? {
                ...m,
                id: serverMsg.messageId || failedMsg.id,
                messageId: serverMsg.messageId,
                status: 'sent'
            } : m));

            fetchConversations(true);
        } catch (err) {
            console.error('[Messages] Retry failed:', err);
            setActiveHistory(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'failed' } : m));
            const msg = err?.data?.message || err?.message || 'Failed to deliver message.';
            addToast(`Retry failed: ${msg}`, 'error');
        }
    };

    // Edit message (restricted to 15 minutes from sending)
    const handleSaveEdit = async (messageId) => {
        const text = editingContent.trim();
        if (!text) return;
        const targetMsg = activeHistory.find(m => m.id === messageId || m.messageId === messageId);
        if (targetMsg && !canEditMessage(targetMsg)) {
            addToast('Messages can only be edited within 15 minutes of sending.', 'warning');
            setEditingMessageId(null);
            setEditingContent('');
            return;
        }
        try {
            const res = await messagesApi.editMessage(messageId, text);
            const updated = res?.data || res;
            setActiveHistory(prev => prev.map(m => m.id === messageId ? {
                ...m,
                text: text,
                content: text,
                isEdited: true,
                editedDate: updated.editedDate || new Date().toISOString()
            } : m));
            setEditingMessageId(null);
            setEditingContent('');
            addToast('Message edited.', 'success');
            fetchConversations(true);
        } catch (err) {
            const errMsg = err?.data?.message || err?.response?.data?.message || err?.message || 'Failed to save edited message.';
            addToast(errMsg, 'error');
        }
    };

    // Open delete confirmation modal (WhatsApp style)
    const handleDeleteMessageClick = (msg) => {
        if (!msg) return;
        setMessageToDelete(msg);
    };

    // Confirm delete execution (Delete for Me vs Delete for Everyone)
    const confirmDeleteMessage = async (msg, deleteForEveryone = false) => {
        if (!msg) return;
        const msgId = msg.id || msg.messageId;
        try {
            await messagesApi.deleteMessage(msgId, deleteForEveryone);
            if (deleteForEveryone) {
                setActiveHistory(prev => prev.map(m => (m.id === msgId || m.messageId === msgId) ? {
                    ...m,
                    isDeleted: true,
                    text: 'This message was deleted',
                    content: 'This message was deleted',
                    attachments: []
                } : m));
                addToast('Message deleted for everyone.', 'info');
            } else {
                setActiveHistory(prev => prev.filter(m => m.id !== msgId && m.messageId !== msgId));
                addToast('Message deleted for you.', 'info');
            }
            setMessageToDelete(null);
            fetchConversations(true);
        } catch (err) {
            console.error('[Messages] Failed to delete message:', err);
            const errMsg = err?.data?.message || err?.response?.data?.message || err?.message || 'Failed to delete message.';
            addToast(errMsg, 'error');
        }
    };

    // Toggle reaction
    const handleToggleReaction = async (messageId, reactionType) => {
        if (!messageId || !reactionType) return;
        setActiveReactionPickerMsgId(null);
        try {
            const res = await messagesApi.toggleReaction(messageId, reactionType);
            const list = res?.data || (Array.isArray(res) ? res : []);
            setActiveHistory(prev => prev.map(m => (m.id === messageId || m.messageId === messageId) ? {
                ...m,
                reactions: list
            } : m));
        } catch (err) {
            addToast('Failed to update reaction.', 'error');
        }
    };

    // Copy message text to clipboard
    const handleCopyMessage = (text) => {
        if (!text) return;
        navigator.clipboard?.writeText(text);
        addToast('Message copied to clipboard', 'info');
    };

    // ── Filter Conversations ──
    const filteredConversations = useMemo(() => {
        return conversations.filter(c => {
            const partnerName = (c.partnerName || '').toLowerCase();
            const lastMsg = (c.lastMessage || '').toLowerCase();
            const q = searchQuery.toLowerCase();

            const matchesSearch = !q || partnerName.includes(q) || lastMsg.includes(q);
            if (!matchesSearch) return false;

            if (filterTab === 'unread') return (c.unreadCount || 0) > 0;
            return true;
        });
    }, [conversations, searchQuery, filterTab]);

    const totalUnreadCount = useMemo(() => {
        return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    }, [conversations]);

    // ── Deduplicated Display History for Active Conversation ──
    const displayHistory = useMemo(() => {
        const seenKeys = new Set();
        const serverMessages = activeHistory.filter(m => m.messageId && !String(m.messageId).startsWith('temp_'));

        return activeHistory.filter(m => {
            // Deduplicate by messageId or id
            const idKey = m.messageId ? `msg_${m.messageId}` : (m.id ? `id_${m.id}` : null);
            if (idKey) {
                if (seenKeys.has(idKey)) return false;
                seenKeys.add(idKey);
            }

            // If this is a pending temp message, but a real server message with matching text and sender/receiver already exists, filter it out
            if (m.id && String(m.id).startsWith('temp_')) {
                const hasMatchingServerMsg = serverMessages.some(sm => 
                    Number(sm.senderId) === Number(m.senderId) && 
                    Number(sm.receiverId) === Number(m.receiverId) && 
                    (sm.text || '').trim() === (m.text || '').trim()
                );
                if (hasMatchingServerMsg) return false;
            }

            return true;
        });
    }, [activeHistory]);

    if (!isMessagingEnabled) {
        return (
            <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 shadow-sm border border-blue-100 dark:border-blue-900/60">
                    <span className="material-symbols-outlined text-[36px]">chat_bubble_outline</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Direct Messaging is Disabled</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
                    Direct messaging is currently turned off by the System Administrator. The messaging service and chat channels are temporarily inaccessible.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-2 active:scale-95"
                >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    <span>Return to Home</span>
                </button>
            </div>
        );
    }

    return (
        <div className="w-full flex-1 flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            {/* Split Screen Messenger Container */}
            <div className="flex-1 flex min-h-0 h-full overflow-hidden relative">
                
                {/* ── LEFT PANE: Conversation Roster ── */}
                <div className={`w-full md:w-[340px] lg:w-[380px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full min-h-0 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 ${
                    showMobileChat ? 'hidden md:flex' : 'flex'
                }`}>
                    {/* Header */}
                    <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400 text-[24px]">chat</span>
                            <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Messages</h1>
                            {totalUnreadCount > 0 && (
                                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-cyan-500 text-white shadow-xs">
                                    {totalUnreadCount} new
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                setIsNewChatOpen(true);
                                setColleagueSearch('');
                            }}
                            className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                            title="Start New Message"
                        >
                            <span className="material-symbols-outlined text-[18px]">edit_square</span>
                            <span className="hidden sm:inline">New Message</span>
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="shrink-0 p-3 border-b border-slate-200/80 dark:border-slate-800">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search conversations..."
                                className="w-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-cyan-500 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                            )}
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <button
                                onClick={() => setFilterTab('all')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    filterTab === 'all'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                                }`}
                            >
                                All ({conversations.length})
                            </button>
                            <button
                                onClick={() => setFilterTab('unread')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                    filterTab === 'unread'
                                        ? 'bg-cyan-600 text-white shadow-xs'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                                }`}
                            >
                                Unread
                                {totalUnreadCount > 0 && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Conversations Scroll List */}
                    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar overscroll-contain">
                        {isLoadingConversations ? (
                            <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center">
                                <span className="material-symbols-outlined animate-spin text-2xl text-cyan-600 mb-2">progress_activity</span>
                                <span>Loading messages...</span>
                            </div>
                        ) : conversationsError ? (
                            <div className="p-6 text-center text-rose-500 text-xs flex flex-col items-center">
                                <span className="material-symbols-outlined text-2xl mb-1">error_outline</span>
                                <p className="mb-2 font-semibold">{conversationsError}</p>
                                <button
                                    onClick={() => fetchConversations()}
                                    className="px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-rose-100"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : filteredConversations.length > 0 ? (
                            filteredConversations.map(conv => {
                                const isSelected = conv.partnerId === activePartnerId;
                                const avatarUrl = resolveMediaUrl(conv.partnerAvatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(conv.partnerName || 'Colleague')}&background=06b6d4&color=fff`;
                                const isOnline = onlineUserIds.has(Number(conv.partnerId));
                                const hasDraft = Boolean(drafts[conv.partnerId]);

                                return (
                                    <div
                                        key={conv.partnerId}
                                        onClick={() => {
                                            setActivePartnerId(conv.partnerId);
                                            setActivePartnerDraft(null);
                                            setShowMobileChat(true);
                                        }}
                                        className={`p-3 flex items-center gap-3 cursor-pointer transition-all ${
                                            isSelected
                                                ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-l-4 border-l-cyan-500'
                                                : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                                        }`}
                                    >
                                        {/* Avatar with Status */}
                                        <div className="relative shrink-0">
                                            <img
                                                src={avatarUrl}
                                                alt={conv.partnerName || 'Colleague'}
                                                className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                            />
                                            {isOnline ? (
                                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" title="Online" />
                                            ) : (
                                                <span className="absolute bottom-0 right-0 w-3 h-3 bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900 rounded-full" title="Offline" />
                                            )}
                                        </div>

                                        {/* Text Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <h2 className="text-xs font-black text-slate-900 dark:text-white truncate">
                                                        {conv.partnerName}
                                                    </h2>
                                                </div>
                                                <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                                    {conv.lastMessageTime}
                                                </span>
                                            </div>
                                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate mb-1">
                                                {conv.partnerDesignation || 'Colleague'} {conv.partnerDepartment ? `• ${conv.partnerDepartment}` : ''}
                                            </p>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-[11.5px] truncate ${
                                                    conv.unreadCount > 0 
                                                        ? 'font-bold text-slate-900 dark:text-white' 
                                                        : 'text-slate-500 dark:text-slate-400'
                                                }`}>
                                                    {hasDraft ? (
                                                        <span>
                                                            <span className="text-amber-500 dark:text-amber-400 font-bold">Draft: </span>
                                                            <span>{drafts[conv.partnerId]}</span>
                                                        </span>
                                                    ) : (
                                                        conv.lastMessage || 'No messages yet'
                                                    )}
                                                </p>
                                                {conv.unreadCount > 0 && (
                                                    <span className="px-1.5 py-0.5 text-[9.5px] font-black rounded-full bg-cyan-500 text-white shrink-0">
                                                        {conv.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            /* Empty State */
                            <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center">
                                <div className="w-12 h-12 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-[24px]">chat_bubble_outline</span>
                                </div>
                                <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                                    {searchQuery ? 'No matching conversations' : 'No conversations yet'}
                                </p>
                                <p className="text-[11px] text-slate-400 max-w-xs mb-4">
                                    {searchQuery ? 'Try searching another colleague name.' : 'Start messaging colleagues on Knome.'}
                                </p>
                                {!searchQuery && (
                                    <button
                                        onClick={() => {
                                            setIsNewChatOpen(true);
                                            setColleagueSearch('');
                                        }}
                                        className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">edit_square</span>
                                        <span>New Message</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT PANE: Active Chat View ── */}
                {activePartner ? (
                    <div className={`flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900 ${
                        showMobileChat ? 'flex' : 'hidden md:flex'
                    }`}>
                        {/* Chat Top Header: Partner Profile & Online Status */}
                        <div className="shrink-0 p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 sticky top-0 z-20 shadow-xs">
                            <div className="flex items-center gap-3 min-w-0">
                                {/* Mobile Back Button */}
                                <button
                                    onClick={() => setShowMobileChat(false)}
                                    className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                                    title="Back to conversations"
                                >
                                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                                </button>

                                <div className="relative shrink-0">
                                    <img
                                        src={resolveMediaUrl(activePartner.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(activePartner.fullName)}&background=06b6d4&color=fff`}
                                        alt={activePartner.fullName}
                                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                    />
                                    {isPartnerOnline ? (
                                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                                    ) : (
                                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-400 border-2 border-white dark:border-slate-900 rounded-full" />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                            {activePartner.fullName}
                                        </h2>
                                        {activePartner.department && (
                                            <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                {activePartner.department}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                        <span>{activePartner.designation}</span>
                                        <span>•</span>
                                        {isPartnerOnline ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                <span>Online</span>
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                <span>Offline</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Offline / Reconnecting Network Status Alert */}
                        {isNetworkOffline && (
                            <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-semibold animate-in fade-in duration-150">
                                <span className="material-symbols-outlined text-[15px]">wifi_off</span>
                                <span>Network connection lost. Messages will automatically sync once restored.</span>
                            </div>
                        )}
                        {isReconnecting && !isNetworkOffline && (
                            <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-semibold animate-in fade-in duration-150">
                                <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
                                <span>Reconnecting to Knome messenger...</span>
                            </div>
                        )}

                        {/* Chat Messages Feed */}
                        <div
                            ref={chatFeedRef}
                            onScroll={handleChatFeedScroll}
                            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/40 dark:bg-slate-950/20 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 overscroll-contain"
                        >
                            {/* Infinite Scroll Top Loader */}
                            {isLoadingMoreHistory && (
                                <div className="py-2 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                    <span>Loading older messages...</span>
                                </div>
                            )}

                            {/* Floating history refresh error bar if messages already present */}
                            {historyError && displayHistory.length > 0 && (
                                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs mb-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="material-symbols-outlined text-[16px] shrink-0">error_outline</span>
                                        <span className="truncate">{historyError}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setHistoryError(null);
                                            apiClient.clearCache();
                                            ensureMessengerConnected(currentUserId);
                                            fetchActiveHistory(activePartnerId || activePartner?.userId);
                                        }}
                                        className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[10.5px] font-bold hover:bg-rose-700 shrink-0 cursor-pointer shadow-xs"
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}

                            {/* Encryption Badge Indicator */}
                            <div className="flex items-center justify-center my-2">
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10.5px] font-bold shadow-xs">
                                    <span className="material-symbols-outlined text-[13px] text-emerald-600 dark:text-emerald-400">lock</span>
                                    <span>Private 1-to-1 Encrypted Messaging</span>
                                </span>
                            </div>

                            {isLoadingHistory ? (
                                <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center">
                                    <span className="material-symbols-outlined animate-spin text-2xl text-cyan-600 mb-2">progress_activity</span>
                                    <span>Loading conversation...</span>
                                </div>
                            ) : historyError && displayHistory.length === 0 ? (
                                <div className="p-6 text-center text-rose-500 text-xs flex flex-col items-center">
                                    <span className="material-symbols-outlined text-2xl mb-1">error_outline</span>
                                    <p className="mb-2 font-semibold">{historyError}</p>
                                    <button
                                        onClick={() => {
                                            setHistoryError(null);
                                            apiClient.clearCache();
                                            ensureMessengerConnected(currentUserId);
                                            fetchActiveHistory(activePartnerId || activePartner?.userId);
                                        }}
                                        className="px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-[11px] font-bold cursor-pointer hover:bg-rose-100"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : displayHistory.length === 0 ? (
                                <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
                                        <span className="material-symbols-outlined text-2xl">waving_hand</span>
                                    </div>
                                    <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">Say hello to {activePartner.fullName}!</p>
                                    <p className="text-[11px] text-slate-400">Your direct messages are private and encrypted.</p>
                                </div>
                            ) : (
                                displayHistory.map((msg, i) => {
                                    const isMe = Number(msg.senderId) === currentUserId;
                                    const isOnlyEm = isEmojiOnly(msg.text) && (!msg.attachments || msg.attachments.length === 0);
                                    const isEditing = editingMessageId === msg.id;

                                    return (
                                        <div
                                            key={msg.id || i}
                                            id={`msg_bubble_${msg.id}`}
                                            className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1`}
                                        >
                                            <div className={`relative flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                {/* Action Bar on Hover */}
                                                {!msg.isDeleted && !isEditing && (
                                                    <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 px-0.5 shrink-0 ${isMe ? 'order-first' : 'order-last'}`}>
                                                        {/* Reply Action */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setReplyingTo({
                                                                    id: msg.id,
                                                                    text: msg.text,
                                                                    senderName: isMe ? 'You' : (msg.senderName || activePartner.fullName)
                                                                });
                                                                chatInputRef.current?.focus();
                                                            }}
                                                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                                            title="Reply"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">reply</span>
                                                        </button>

                                                        {/* React Popover Trigger */}
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveReactionPickerMsgId(prev => prev === msg.id ? null : msg.id)}
                                                                className="p-1 rounded-md text-slate-400 hover:text-amber-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                                                title="React"
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">add_reaction</span>
                                                            </button>

                                                            {/* Mini Reaction Bar */}
                                                            {activeReactionPickerMsgId === msg.id && (
                                                                <div className="absolute bottom-full mb-1 z-30 flex items-center gap-1 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-lg animate-in zoom-in-95 duration-100">
                                                                    {MESSAGE_REACTIONS.map(em => (
                                                                        <button
                                                                            key={em}
                                                                            type="button"
                                                                            onClick={() => handleToggleReaction(msg.id, em)}
                                                                            className="w-7 h-7 flex items-center justify-center hover:scale-130 transition-transform rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer emoji-font text-base"
                                                                        >
                                                                            {em}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Copy Action */}
                                                        {msg.text && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopyMessage(msg.text)}
                                                                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                                                title="Copy text"
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">content_copy</span>
                                                            </button>
                                                        )}

                                                        {/* Edit Action (Sender only, allowed up to 15 mins) */}
                                                        {isMe && msg.status !== 'sending' && !msg.isDeleted && canEditMessage(msg) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingMessageId(msg.id);
                                                                    setEditingContent(msg.text || '');
                                                                }}
                                                                className="p-1 rounded-md text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                                                title="Edit message (available up to 15 mins)"
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">edit</span>
                                                            </button>
                                                        )}

                                                        {/* Delete Action (Sender or Receiver - WhatsApp functionality) */}
                                                        {msg.status !== 'sending' && !msg.isDeleted && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteMessageClick(msg)}
                                                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                                                title={isMe ? "Delete message" : "Delete message for me"}
                                                            >
                                                                <span className="material-symbols-outlined text-[15px]">delete</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Message Content Bubble */}
                                                {msg.isDeleted ? (
                                                    <div className="px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-xs italic text-slate-400 dark:text-slate-500 flex items-center gap-1.5 select-none">
                                                        <span className="material-symbols-outlined text-[15px]">block</span>
                                                        <span>This message was deleted</span>
                                                    </div>
                                                ) : isEditing ? (
                                                    /* Inline Edit Box */
                                                    <div className="w-72 sm:w-80 p-2.5 bg-white dark:bg-slate-800 border border-cyan-500 rounded-2xl shadow-md flex flex-col gap-2">
                                                        <textarea
                                                            value={editingContent}
                                                            onChange={e => setEditingContent(e.target.value)}
                                                            rows={2}
                                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs text-slate-900 dark:text-white outline-none resize-none"
                                                            autoFocus
                                                        />
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingMessageId(null)}
                                                                className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveEdit(msg.id)}
                                                                className="px-3 py-1 bg-cyan-600 text-white rounded-lg text-[11px] font-bold hover:bg-cyan-700 cursor-pointer shadow-xs"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : isOnlyEm ? (
                                                    <div className={`py-1 px-1.5 select-none transition-transform duration-200 hover:scale-110 cursor-default ${
                                                        isMe ? 'text-right' : 'text-left'
                                                    }`}>
                                                        <span className="emoji-font text-5xl sm:text-6xl leading-none inline-block drop-shadow-md filter">
                                                            {msg.text}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs text-xs font-medium leading-relaxed ${
                                                            isMe
                                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-xs'
                                                                : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs'
                                                        }`}
                                                    >
                                                        {/* Quoted Replying Context */}
                                                        {msg.parentMessageId && (
                                                            <div
                                                                onClick={() => scrollToMessage(msg.parentMessageId)}
                                                                className={`mb-2 p-2 rounded-xl text-[11px] border-l-2 cursor-pointer transition-opacity hover:opacity-90 ${
                                                                    isMe
                                                                        ? 'bg-black/15 border-white/60 text-blue-100'
                                                                        : 'bg-slate-100 dark:bg-slate-700/60 border-indigo-500 text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <p className="font-bold text-[10px] uppercase tracking-wider opacity-90">
                                                                    {msg.parentSenderName || 'Colleague'}
                                                                </p>
                                                                <p className="truncate opacity-80 mt-0.5">
                                                                    {msg.parentContent || 'Message'}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Attachments */}
                                                        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                                                            <div className={`flex flex-col gap-2 ${msg.text ? 'mb-2' : ''}`}>
                                                                {msg.attachments.map(att => {
                                                                    const isImg = att.isImage || (att.type && att.type.startsWith('image/')) || /\.(png|jpe?g|gif|webp|svg)$/i.test(att.name || '');
                                                                    const rawUrl = att.url || att.dataUrl || att.uploadUrl;
                                                                    const attUrl = resolveMediaUrl(rawUrl) || rawUrl;
                                                                    const fileStyle = getFileIcon(att.name, att.type);

                                                                    if (isImg) {
                                                                        return (
                                                                            <div key={att.id || att.name} className="relative group/att rounded-xl overflow-hidden border border-white/20 dark:border-slate-700/60 max-w-xs shadow-xs">
                                                                                <img 
                                                                                    src={attUrl} 
                                                                                    alt={att.name} 
                                                                                    onClick={() => setPreviewMediaModal({ url: attUrl, name: att.name, isImage: true })}
                                                                                    className="w-full max-h-60 object-cover cursor-pointer transition-transform hover:scale-[1.02]" 
                                                                                    loading="lazy"
                                                                                />
                                                                                <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-white text-[11px] opacity-90 group-hover/att:opacity-100 transition-opacity">
                                                                                    <span className="truncate max-w-[170px]" title={att.name}>{att.name}</span>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={e => handleDownloadAttachment(e, att)} 
                                                                                        className="p-1 rounded hover:bg-white/20 transition-colors flex items-center cursor-pointer"
                                                                                        title={`Download ${att.name}`}
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return (
                                                                        <div 
                                                                            key={att.id || att.name} 
                                                                            className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                                                                                isMe 
                                                                                    ? 'bg-white/15 border-white/25 text-white hover:bg-white/20' 
                                                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-850'
                                                                            }`}
                                                                        >
                                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${fileStyle.color}`}>
                                                                                <span className="material-symbols-outlined text-[18px]">{fileStyle.icon}</span>
                                                                            </div>
                                                                            <div className="flex-1 min-w-0 flex flex-col text-left">
                                                                                <span className="text-xs font-bold truncate leading-tight" title={att.name}>
                                                                                    {att.name}
                                                                                </span>
                                                                                <span className={`text-[10.5px] mt-0.5 ${isMe ? 'text-blue-100' : 'text-slate-400'}`}>
                                                                                    {formatFileSize(att.size)}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <a
                                                                                    href={attUrl}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                                                        isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-200/70 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                                                    }`}
                                                                                    title="View / Open document"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                                                </a>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={e => handleDownloadAttachment(e, att)}
                                                                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                                                        isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-200/70 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                                                    }`}
                                                                                    title={`Download ${att.name}`}
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {msg.text && (
                                                            <div className="flex flex-col gap-1">
                                                                <p className="break-words whitespace-pre-wrap emoji-font text-[13px] leading-relaxed">
                                                                    {renderMessageContentWithLinks(msg.text, isMe, navigate)}
                                                                </p>
                                                                {/* Rich interactive Clip preview card if message contains a clip link */}
                                                                {(() => {
                                                                    const clipId = extractClipIdFromText(msg.text);
                                                                    return clipId ? (
                                                                        <MessageClipCard clipId={clipId} isMe={isMe} navigate={navigate} />
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Reactions Pill Display */}
                                            {Array.isArray(msg.reactions) && msg.reactions.length > 0 && !msg.isDeleted && (
                                                <div className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    {msg.reactions.map(r => (
                                                        <button
                                                            key={r.reactionType}
                                                            type="button"
                                                            onClick={() => handleToggleReaction(msg.id, r.reactionType)}
                                                            className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                                                                r.hasReacted
                                                                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 shadow-2xs'
                                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                                            }`}
                                                            title={r.hasReacted ? 'Click to remove reaction' : 'Click to react'}
                                                        >
                                                            <span className="emoji-font text-sm">{r.reactionType}</span>
                                                            <span className="text-[11px]">{r.count}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Status, Timestamp & Edited Badge */}
                                            <div className="flex items-center gap-1.5 mt-0.5 px-1 text-[10px] text-slate-400 font-semibold">
                                                <span>{msg.time}</span>
                                                {msg.isEdited && !msg.isDeleted && (
                                                    <span className="italic text-slate-400">Edited</span>
                                                )}
                                                {isMe && !msg.isDeleted && (
                                                    msg.status === 'sending' ? (
                                                        <span className="text-slate-400 flex items-center gap-0.5 italic">
                                                            <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                                                            <span>Sending</span>
                                                        </span>
                                                    ) : msg.status === 'failed' ? (
                                                        <span className="text-rose-500 font-bold flex items-center gap-1">
                                                            <span>Failed</span>
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleRetrySend(msg)}
                                                                className="underline hover:text-rose-600 cursor-pointer"
                                                            >
                                                                Retry
                                                            </button>
                                                        </span>
                                                    ) : msg.isRead ? (
                                                        <span className="material-symbols-outlined text-[14px] text-cyan-500 font-bold" title="Read">
                                                            done_all
                                                        </span>
                                                    ) : (
                                                        <span className="material-symbols-outlined text-[13px] text-slate-400" title="Delivered">
                                                            done
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Real-time Typing Indicator Bar */}
                        {isPartnerTyping && (
                            <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 font-semibold bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                                <span>{activePartner.fullName} is typing</span>
                                <span className="flex gap-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.4s]"></span>
                                </span>
                            </div>
                        )}

                        {/* Chat Bottom Composer Form */}
                        <form onSubmit={handleSendMessage} className="shrink-0 p-3 sm:pr-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative z-20 sticky bottom-0">
                            
                            {/* Replying Context Bar */}
                            {replyingTo && (
                                <div className="flex items-center justify-between p-2 mb-2 bg-indigo-50/90 dark:bg-indigo-950/70 border-l-4 border-indigo-500 rounded-r-xl animate-in fade-in duration-150">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                            Replying to {replyingTo.senderName}
                                        </p>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                            {replyingTo.text || 'Attachment'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setReplyingTo(null)}
                                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                        title="Cancel reply"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Floating Emoji Picker Popover */}
                            {isEmojiPickerOpen && (
                                <div 
                                    ref={emojiPickerRef}
                                    className="absolute bottom-full mb-3 right-0 sm:right-2 z-50 w-80 sm:w-96 bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.22)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col backdrop-blur-2xl"
                                    style={{ maxHeight: '390px' }}
                                >
                                    {/* Header & Smart Search */}
                                    <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/80 dark:bg-slate-850/60">
                                        <div className="flex-1 relative">
                                            <span className="material-symbols-outlined absolute left-2.5 top-1.5 text-cyan-500 text-[17px]">search</span>
                                            <input 
                                                type="text"
                                                value={emojiSearch}
                                                onChange={e => setEmojiSearch(e.target.value)}
                                                placeholder="Search emojis..."
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-7 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500 transition-all placeholder:text-slate-400"
                                                autoFocus
                                            />
                                            {emojiSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEmojiSearch('')}
                                                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">cancel</span>
                                                </button>
                                            )}
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setIsEmojiPickerOpen(false)}
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                            title="Close"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    </div>

                                    {/* Quick Reactions Bar */}
                                    {!emojiSearch && (
                                        <div className="px-2.5 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-850 dark:to-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                                            <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0 px-1">
                                                Top:
                                            </span>
                                            {QUICK_EMOJIS.map(em => (
                                                <button
                                                    key={em}
                                                    type="button"
                                                    onMouseEnter={() => setHoveredEmoji(em)}
                                                    onMouseLeave={() => setHoveredEmoji(null)}
                                                    onClick={() => {
                                                        setInputMessage(prev => prev + em);
                                                        chatInputRef.current?.focus();
                                                    }}
                                                    className="w-7 h-7 shrink-0 flex items-center justify-center text-lg hover:scale-130 transition-transform rounded-lg hover:bg-white dark:hover:bg-slate-700/90 cursor-pointer emoji-font select-none"
                                                    title={EMOJI_LABELS[em] || em}
                                                >
                                                    {em}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Category Tabs */}
                                    {!emojiSearch && (
                                        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-2 py-1 gap-1 bg-white dark:bg-slate-900">
                                            {Object.entries(EMOJI_CATEGORIES).map(([catKey, cat]) => (
                                                <button
                                                    key={catKey}
                                                    type="button"
                                                    onClick={() => setEmojiCategory(catKey)}
                                                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer select-none ${
                                                        emojiCategory === catKey
                                                            ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-950/80 dark:to-blue-950/80 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                    }`}
                                                    title={cat.label}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
                                                    <span className="hidden sm:inline text-[10.5px]">{cat.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Emoji Grid */}
                                    <div className="p-2.5 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-[200px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                        {(EMOJI_CATEGORIES[emojiCategory]?.emojis || []).map((em, idx) => (
                                            <button
                                                key={`${em}-${idx}`}
                                                type="button"
                                                onClick={() => {
                                                    setInputMessage(prev => prev + em);
                                                    chatInputRef.current?.focus();
                                                }}
                                                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-2xl sm:text-[26px] hover:scale-130 transition-transform rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer emoji-font select-none active:scale-95"
                                                title={EMOJI_LABELS[em] || em}
                                            >
                                                {em}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Staged Attachments Preview Bar */}
                            {attachedFiles.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 max-h-36 overflow-y-auto">
                                    {attachedFiles.map(att => {
                                        const fileStyle = getFileIcon(att.name, att.type);
                                        return (
                                            <div 
                                                key={att.id} 
                                                className="relative flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 pr-2.5 shadow-2xs group"
                                            >
                                                {att.isImage ? (
                                                    <img 
                                                        src={att.dataUrl} 
                                                        alt={att.name} 
                                                        className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700" 
                                                    />
                                                ) : (
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${fileStyle.color}`}>
                                                        <span className="material-symbols-outlined text-[18px]">{fileStyle.icon}</span>
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0 max-w-[130px] sm:max-w-[170px]">
                                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={att.name}>
                                                        {att.name}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">
                                                        {formatFileSize(att.size)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachedFile(att.id)}
                                                    className="ml-1 w-5 h-5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                                                    title="Remove file"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">close</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* @Mention Autocomplete Popover */}
                            {showMentionSuggestions && activePartner && (
                                <div className="absolute bottom-full mb-2 left-3 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-1.5 w-64 animate-in fade-in duration-100">
                                    <p className="text-[10px] uppercase font-bold text-slate-400 px-2 py-0.5">Mention Colleague</p>
                                    <button
                                        type="button"
                                        onClick={() => handleSelectMention(activePartner)}
                                        className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left cursor-pointer transition-colors"
                                    >
                                        <img
                                            src={resolveMediaUrl(activePartner.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(activePartner.fullName)}&background=06b6d4&color=fff`}
                                            alt={activePartner.fullName}
                                            className="w-6 h-6 rounded-full object-cover"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">@{activePartner.fullName}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{activePartner.designation}</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Chat Input Bar */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 focus-within:border-cyan-500 transition-colors">
                                <textarea
                                    ref={chatInputRef}
                                    rows={1}
                                    value={inputMessage}
                                    onChange={handleInputChange}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleSendMessage(e);
                                        }
                                    }}
                                    onPaste={handlePaste}
                                    placeholder={`Message ${activePartner.fullName}... (Enter to send, Shift+Enter for new line)`}
                                    className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none emoji-font resize-none max-h-28 overflow-y-auto leading-relaxed custom-scrollbar"
                                    disabled={isSending}
                                />

                                <div className="flex items-center gap-1 shrink-0">
                                    {/* File Attachment Button */}
                                    <input 
                                        type="file" 
                                        ref={fileAttachmentInputRef} 
                                        onChange={handleFileSelect} 
                                        multiple 
                                        className="hidden" 
                                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileAttachmentInputRef.current?.click()}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer relative ${
                                            attachedFiles.length > 0
                                                ? 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400'
                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                                        }`}
                                        title="Attach files"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">attach_file</span>
                                        {attachedFiles.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-600 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                                {attachedFiles.length}
                                            </span>
                                        )}
                                    </button>

                                    {/* Emoji Picker Button */}
                                    <button
                                        type="button"
                                        onClick={() => setIsEmojiPickerOpen(prev => !prev)}
                                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                            isEmojiPickerOpen
                                                ? 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400'
                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700'
                                        }`}
                                        title="Pick an Emoji"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">mood</span>
                                    </button>

                                    {/* Send Button */}
                                    <button
                                        type="submit"
                                        disabled={(!inputMessage.trim() && attachedFiles.length === 0) || isSending}
                                        className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
                                    >
                                        <span>Send</span>
                                        <span className="material-symbols-outlined text-[15px]">send</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                ) : (
                    /* Initial Empty State on Desktop */
                    <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center bg-slate-50/30 dark:bg-slate-950/20 h-full min-h-0">
                        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl">chat</span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">
                            Your Messages
                        </h2>
                        <p className="text-xs text-slate-400 max-w-sm mb-6">
                            Send direct private messages, documents, and notes to your Knome colleagues. Pick a conversation or start a new message.
                        </p>
                        <button
                            onClick={() => {
                                setIsNewChatOpen(true);
                                setColleagueSearch('');
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">add_comment</span>
                            <span>Start a Conversation</span>
                        </button>
                    </div>
                )}
            </div>

            {/* ── MODAL: Start New Direct Message (User Candidate Search) ── */}
            {isNewChatOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-600">edit_square</span>
                                <h3 className="font-black text-sm text-slate-900 dark:text-white">New Message</h3>
                            </div>
                            <button
                                onClick={() => {
                                    setIsNewChatOpen(false);
                                    setColleagueSearch('');
                                }}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Search Input in Modal */}
                        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    value={colleagueSearch}
                                    onChange={e => setColleagueSearch(e.target.value)}
                                    placeholder="Search by name, employee ID, email, role, department..."
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Candidates List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 custom-scrollbar">
                            {isSearchingUsers ? (
                                <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center">
                                    <span className="material-symbols-outlined animate-spin text-2xl text-cyan-600 mb-2">progress_activity</span>
                                    <span>Searching Knome colleagues...</span>
                                </div>
                            ) : searchedUsers.length > 0 ? (
                                searchedUsers.map(colleague => {
                                    const cId = Number(colleague.userId);
                                    const avatarUrl = resolveMediaUrl(colleague.avatarUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(colleague.fullName || 'Colleague')}&background=06b6d4&color=fff`;
                                    const isOnline = onlineUserIds.has(cId);

                                    return (
                                        <div
                                            key={cId}
                                            onClick={() => {
                                                const draft = {
                                                    userId: cId,
                                                    id: cId,
                                                    fullName: colleague.fullName,
                                                    employeeId: colleague.employeeId,
                                                    designation: colleague.designation || 'Colleague',
                                                    department: colleague.department || 'MPOnline',
                                                    avatar: colleague.avatarUrl,
                                                    isConnected: colleague.isConnected
                                                };
                                                setActivePartnerDraft(draft);
                                                setActivePartnerId(cId);
                                                setShowMobileChat(true);
                                                setIsNewChatOpen(false);
                                                setColleagueSearch('');
                                            }}
                                            className="p-2.5 flex items-center gap-3 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                        >
                                            <div className="relative shrink-0">
                                                <img
                                                    src={avatarUrl}
                                                    alt={colleague.fullName}
                                                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                                />
                                                {isOnline ? (
                                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
                                                ) : (
                                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900 rounded-full" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                        {colleague.fullName}
                                                    </h4>
                                                    {colleague.employeeId && (
                                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                                            {colleague.employeeId}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10.5px] text-slate-400 truncate">
                                                    {colleague.designation || 'Colleague'} {colleague.department ? `• ${colleague.department}` : ''}
                                                </p>
                                                {colleague.email && (
                                                    <p className="text-[10px] text-slate-400 truncate">
                                                        {colleague.email}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">arrow_forward_ios</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center text-slate-400 text-xs">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
                                        <span className="material-symbols-outlined text-[24px]">person_search</span>
                                    </div>
                                    <p className="font-bold text-slate-800 dark:text-slate-200 mb-1">
                                        {colleagueSearch ? `No colleagues found matching "${colleagueSearch}"` : 'Search for a Colleague'}
                                    </p>
                                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                                        Type a name, employee ID, role, or department to find anyone at Knome.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full-screen Media Preview Lightbox Modal ── */}
            {previewMediaModal && (
                <div 
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
                    onClick={() => setPreviewMediaModal(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <div className="absolute -top-10 right-0 flex items-center gap-2">
                            <button 
                                type="button"
                                onClick={e => handleDownloadAttachment(e, previewMediaModal)} 
                                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Download"
                            >
                                <span className="material-symbols-outlined text-[20px]">download</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setPreviewMediaModal(null)} 
                                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <img 
                            src={previewMediaModal.url} 
                            alt={previewMediaModal.name} 
                            className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl object-contain border border-white/20"
                        />
                        <p className="text-white/80 text-xs font-semibold mt-2.5 tracking-wide">
                            {previewMediaModal.name}
                        </p>
                    </div>
                </div>
            )}

            {/* ── WhatsApp-Style Delete Message Confirmation Modal ── */}
            {messageToDelete && (
                <DeleteMessageModal
                    isOpen={Boolean(messageToDelete)}
                    message={messageToDelete}
                    isMe={Boolean(messageToDelete && Number(messageToDelete.senderId) === Number(currentUserId))}
                    onClose={() => setMessageToDelete(null)}
                    onDeleteForMe={() => confirmDeleteMessage(messageToDelete, false)}
                    onDeleteForEveryone={() => confirmDeleteMessage(messageToDelete, true)}
                />
            )}
        </div>
    );
}
