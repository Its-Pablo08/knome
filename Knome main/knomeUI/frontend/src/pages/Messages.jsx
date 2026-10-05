import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser, getUserStatusConfig, KNOWN_ROSTER_NAMES } from '../components/contexts/UserContext';
import { resolveMediaUrl, userApi, notificationsApi } from '../utils/apiService';
import { sendLiveMessage, subscribeToLiveMessages, playMessageChime, MESSAGES_STORAGE_KEY } from '../utils/realtimeMessenger';

// Storage key for all Facebook-style 1-to-1 conversations across Knome
const STORAGE_KEY = MESSAGES_STORAGE_KEY;

/**
 * Deterministic conversation key generator for any pair of user IDs.
 * Ensures User A -> User B and User B -> User A map to the exact same conversation.
 */
export const getConversationKey = (id1, id2) => {
    const a = Number(id1) || 0;
    const b = Number(id2) || 0;
    return `conv_${Math.min(a, b)}_${Math.max(a, b)}`;
};

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
 * Categorized emoji library for enterprise messenger
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
 * Standard enterprise colleague pool for seed conversations and profile lookups
 */
const DEFAULT_COLLEAGUES = [
    {
        userId: 3,
        employeeId: 'MPO103',
        fullName: 'Sourabh Sahu',
        designation: 'Software Developer',
        department: 'Information Technology',
        status: 'active',
        avatar: null
    },
    {
        userId: 2,
        employeeId: 'MPO102',
        fullName: 'Vishendra Sharma',
        designation: 'Lead Architect',
        department: 'Engineering & Tech',
        status: 'active',
        avatar: null
    },
    {
        userId: 5,
        employeeId: 'MPO105',
        fullName: 'Meghna Tiwari',
        designation: 'HR Specialist',
        department: 'Human Resources',
        status: 'idle',
        avatar: null
    },
    {
        userId: 1,
        employeeId: 'MP0108',
        fullName: 'Loveneesh Sharma',
        designation: 'Technical Program Manager',
        department: 'Operations',
        status: 'active',
        avatar: null
    },
    {
        userId: 6,
        employeeId: 'MPO106',
        fullName: 'Mayur Verma',
        designation: 'UI/UX Designer',
        department: 'Product Design',
        status: 'active',
        avatar: null
    }
];

/**
 * Resolves the other participant in a conversation so the logged-in user NEVER sees themselves
 */
const getOtherParticipant = (conv, currentUserId, contextUsers = []) => {
    const currId = Number(currentUserId);
    
    // 1. Check participantIds array for the ID that is not currentUserId
    const otherId = Array.isArray(conv.participantIds) 
        ? conv.participantIds.find(id => Number(id) !== currId)
        : null;

    // 2. Check participants map
    if (otherId && conv.participants && conv.participants[otherId]) {
        const p = conv.participants[otherId];
        if (Number(p.userId) !== currId && p.fullName) {
            return p;
        }
    }

    // 3. Fallback to conv.participant if it's not the current user
    if (conv.participant && Number(conv.participant.userId) !== currId && conv.participant.fullName) {
        return conv.participant;
    }

    // 4. Look up in contextUsers pool
    if (otherId) {
        const found = contextUsers.find(u => Number(u.userId || u.id) === Number(otherId));
        if (found) {
            return {
                userId: Number(otherId),
                fullName: found.fullName || found.name || 'Colleague',
                designation: found.designation || 'Staff',
                department: found.department || 'MPOnline',
                avatar: found.avatar || found.profilePhotoUrl || null,
                status: 'active'
            };
        }
    }

    // 5. Safe colleague fallback (never current user, never generic "User")
    const fallbackColleague = DEFAULT_COLLEAGUES.find(c => c.userId !== currId) || DEFAULT_COLLEAGUES[0];
    return fallbackColleague;
};

/**
 * Generate initial seed conversations customized for the logged-in user
 */
const generateSeedConversations = (currentUserId, currentUser) => {
    const currId = Number(currentUserId) || 1;
    const currName = currentUser?.fullName || currentUser?.name || 'You';
    const currDesig = currentUser?.designation || 'Employee';
    const currDept = currentUser?.department || 'MPOnline';
    const currAvatar = currentUser?.profilePhotoUrl || currentUser?.avatar || null;

    const myProfile = {
        userId: currId,
        fullName: currName,
        designation: currDesig,
        department: currDept,
        avatar: currAvatar,
        status: 'active'
    };

    // Filter colleagues to only include others (never self)
    const otherColleagues = DEFAULT_COLLEAGUES.filter(c => Number(c.userId) !== currId);

    const seedConfigs = [
        {
            colleague: otherColleagues[0] || DEFAULT_COLLEAGUES[0],
            unread: 1,
            time: '10:45 AM',
            timestamp: Date.now() - 15 * 60 * 1000,
            lastMsg: `Hey ${currName.split(' ')[0]}, did you review the Q3 enterprise architecture slides?`,
            msgs: [
                { id: 'm1', senderId: otherColleagues[0]?.userId || 3, text: `Hi ${currName.split(' ')[0]}, hope you are having a productive morning!`, time: '10:30 AM' },
                { id: 'm2', senderId: currId, text: `Good morning ${otherColleagues[0]?.fullName.split(' ')[0] || 'there'}! Doing well, thank you.`, time: '10:35 AM' },
                { id: 'm3', senderId: otherColleagues[0]?.userId || 3, text: `Hey ${currName.split(' ')[0]}, did you review the Q3 enterprise architecture slides?`, time: '10:45 AM' }
            ]
        },
        {
            colleague: otherColleagues[1] || DEFAULT_COLLEAGUES[1],
            unread: 1,
            time: '09:15 AM',
            timestamp: Date.now() - 90 * 60 * 1000,
            lastMsg: 'The API latency fix is deployed to staging. Testing looks clean.',
            msgs: [
                { id: 'm4', senderId: otherColleagues[1]?.userId || 2, text: 'Morning team! Database indexing optimization completed yesterday.', time: '09:00 AM' },
                { id: 'm5', senderId: currId, text: 'Excellent! Are query response times under 50ms now?', time: '09:10 AM' },
                { id: 'm6', senderId: otherColleagues[1]?.userId || 2, text: 'The API latency fix is deployed to staging. Testing looks clean.', time: '09:15 AM' }
            ]
        },
        {
            colleague: otherColleagues[2] || DEFAULT_COLLEAGUES[2],
            unread: 0,
            time: 'Yesterday',
            timestamp: Date.now() - 24 * 3600 * 1000,
            lastMsg: 'Thanks for submitting the quarterly team feedback form.',
            msgs: [
                { id: 'm7', senderId: otherColleagues[2]?.userId || 5, text: 'Hello! Just a quick reminder regarding the wellness survey.', time: 'Yesterday 3:15 PM' },
                { id: 'm8', senderId: currId, text: 'Just completed it right now!', time: 'Yesterday 3:45 PM' },
                { id: 'm9', senderId: otherColleagues[2]?.userId || 5, text: 'Thanks for submitting the quarterly team feedback form.', time: 'Yesterday 4:00 PM' }
            ]
        },
        {
            colleague: otherColleagues[3] || DEFAULT_COLLEAGUES[3],
            unread: 0,
            time: 'Sep 29',
            timestamp: Date.now() - 48 * 3600 * 1000,
            lastMsg: 'Townhall schedule has been finalized for next Friday at 4 PM.',
            msgs: [
                { id: 'm10', senderId: otherColleagues[3]?.userId || 1, text: 'Townhall schedule has been finalized for next Friday at 4 PM.', time: 'Sep 29 2:00 PM' }
            ]
        }
    ];

    return seedConfigs.map(cfg => {
        const cId = Number(cfg.colleague.userId);
        return {
            id: getConversationKey(currId, cId),
            participantIds: [currId, cId],
            participants: {
                [currId]: myProfile,
                [cId]: cfg.colleague
            },
            participant: cfg.colleague,
            unreadCounts: {
                [currId]: cfg.unread,
                [cId]: 0
            },
            lastMessage: cfg.lastMsg,
            lastMessageTime: cfg.time,
            lastMessageTimestamp: cfg.timestamp,
            messages: cfg.msgs.map(m => ({
                id: m.id,
                senderId: Number(m.senderId),
                text: m.text,
                time: m.time,
                timestamp: cfg.timestamp
            }))
        };
    });
};

export default function Messages() {
    const { currentUser, users: contextUsers } = useUser();
    const currentUserId = Number(currentUser?.userId || currentUser?.id || 1);
    const location = useLocation();
    const navigate = useNavigate();

    // ── Global Conversations State from localStorage ──
    const [allConversations, setAllConversations] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {}
        return generateSeedConversations(currentUserId, currentUser);
    });

    const [activeConvId, setActiveConvId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread'
    const [inputMessage, setInputMessage] = useState('');
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [colleagueSearch, setColleagueSearch] = useState('');
    const [showMobileChat, setShowMobileChat] = useState(false);

    // ── Rich Emoji Picker States ──
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const [emojiCategory, setEmojiCategory] = useState('smileys');
    const [emojiSearch, setEmojiSearch] = useState('');
    const [hoveredEmoji, setHoveredEmoji] = useState(null);
    const emojiPickerRef = useRef(null);
    const chatInputRef = useRef(null);

    // ── Message Hover & Reaction States ──
    const [activeHoverMsgId, setActiveHoverMsgId] = useState(null);
    const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState(null);
    const [messageReactions, setMessageReactions] = useState(() => {
        try {
            const raw = localStorage.getItem('knome_message_reactions');
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    const toggleReaction = (msgId, emoji) => {
        setMessageReactions(prev => {
            const currentForMsg = prev[msgId] || {};
            const users = currentForMsg[emoji] || [];
            const hasReacted = users.includes(currentUserId);
            const nextUsers = hasReacted ? users.filter(u => u !== currentUserId) : [...users, currentUserId];

            const nextForMsg = { ...currentForMsg };
            if (nextUsers.length === 0) {
                delete nextForMsg[emoji];
            } else {
                nextForMsg[emoji] = nextUsers;
            }

            const nextAll = { ...prev, [msgId]: nextForMsg };
            try {
                localStorage.setItem('knome_message_reactions', JSON.stringify(nextAll));
            } catch {}
            return nextAll;
        });
    };

    // Auto-close emoji picker on click outside or Escape
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
                setIsEmojiPickerOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsEmojiPickerOpen(false);
            }
        };
        if (isEmojiPickerOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isEmojiPickerOpen]);

    const handleSelectEmoji = (emoji) => {
        setInputMessage(prev => prev + emoji);
        chatInputRef.current?.focus();
    };

    // Smart keyword and category search
    const displayedEmojis = useMemo(() => {
        const q = emojiSearch.trim().toLowerCase();
        if (!q) {
            return EMOJI_CATEGORIES[emojiCategory]?.emojis || EMOJI_CATEGORIES.smileys.emojis;
        }
        const all = Object.values(EMOJI_CATEGORIES).flatMap(c => c.emojis);
        const unique = Array.from(new Set(all));
        return unique.filter(em => {
            if (em.includes(q)) return true;
            const label = (EMOJI_LABELS[em] || '').toLowerCase();
            return label.includes(q);
        });
    }, [emojiCategory, emojiSearch]);

    const messagesEndRef = useRef(null);
    const chatFeedRef = useRef(null);

    // Save master conversations store to localStorage & broadcast unread count
    const saveMasterConversations = useCallback((updatedList) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
            // Calculate unread count specifically for current logged-in user
            const myUnread = updatedList.reduce((acc, c) => {
                if (c.participantIds && c.participantIds.map(Number).includes(currentUserId)) {
                    return acc + (c.unreadCounts?.[currentUserId] || 0);
                }
                return acc;
            }, 0);
            localStorage.setItem(`knome_unread_messages_count_${currentUserId}`, String(myUnread));
            localStorage.setItem('knome_unread_messages_count', String(myUnread));
            window.dispatchEvent(new CustomEvent('knome_messages_updated', { detail: { unreadCount: myUnread } }));
        } catch (e) {}
    }, [currentUserId]);

    // Filter conversations for the current logged-in user (reusable, 1-to-1)
    const userConversations = useMemo(() => {
        return allConversations.filter(c => {
            if (!Array.isArray(c.participantIds)) return true;
            return c.participantIds.map(Number).includes(currentUserId);
        }).sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
    }, [allConversations, currentUserId]);

    // Active conversation object
    const activeConversation = useMemo(() => {
        if (!activeConvId) {
            return userConversations[0] || null;
        }
        return userConversations.find(c => c.id === activeConvId) || userConversations[0] || null;
    }, [userConversations, activeConvId]);

    // Active other participant info (guaranteed to be the recipient, never self)
    const activeOtherParticipant = useMemo(() => {
        if (!activeConversation) return null;
        return getOtherParticipant(activeConversation, currentUserId, contextUsers);
    }, [activeConversation, currentUserId, contextUsers]);

    // Auto-select initial conversation on first load if activeConvId is not set
    useEffect(() => {
        if (!activeConvId && userConversations.length > 0) {
            setActiveConvId(userConversations[0].id);
        }
    }, [userConversations, activeConvId]);

    // Auto-scroll chat feed to bottom strictly within the feed container without scrolling outer window
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

    // Instant jump to bottom when switching conversation
    useEffect(() => {
        const timer = setTimeout(() => {
            scrollToBottom(false);
        }, 40);
        return () => clearTimeout(timer);
    }, [activeConversation?.id, scrollToBottom]);

    // Smooth scroll when new message is appended
    useEffect(() => {
        scrollToBottom(true);
    }, [activeConversation?.messages?.length, scrollToBottom]);

    // Keep activeConvIdRef in sync to avoid stale closures in event listeners
    const activeConvIdRef = useRef(activeConvId);
    useEffect(() => {
        activeConvIdRef.current = activeConvId;
    }, [activeConvId]);

    // Track active chat recipient so Navbar can avoid duplicate toasts when chat is open
    useEffect(() => {
        if (activeOtherParticipant?.userId) {
            window.__knome_active_chat_user_id = Number(activeOtherParticipant.userId);
        } else {
            window.__knome_active_chat_user_id = null;
        }
        return () => {
            window.__knome_active_chat_user_id = null;
        };
    }, [activeOtherParticipant?.userId]);

    // Cross-tab synchronization via storage event on STORAGE_KEY
    useEffect(() => {
        const handleStorageUpdate = (e) => {
            if (e.key === STORAGE_KEY && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (Array.isArray(parsed)) {
                        setAllConversations(parsed);
                    }
                } catch (err) {}
            }
        };
        window.addEventListener('storage', handleStorageUpdate);
        return () => window.removeEventListener('storage', handleStorageUpdate);
    }, []);

    // ── Live Real-Time Message Receiver for Current Logged-In User ──
    useEffect(() => {
        const uId = Number(currentUser?.userId || currentUser?.id || 1);
        if (!uId) return;

        const unsubscribe = subscribeToLiveMessages(uId, (livePayload) => {
            const { sender, message, conversationId } = livePayload;
            if (!sender || !message) return;

            const senderId = Number(sender.userId || sender.id);
            const expectedConvKey = getConversationKey(uId, senderId);
            const isCurrentlyActive = (
                activeConvIdRef.current === expectedConvKey || 
                activeConvIdRef.current === conversationId
            );

            setAllConversations(prev => {
                let found = false;
                const updated = prev.map(c => {
                    const cParticipantIds = (c.participantIds || []).map(Number);
                    const matches = c.id === expectedConvKey || c.id === conversationId ||
                                    (cParticipantIds.includes(uId) && cParticipantIds.includes(senderId));

                    if (matches) {
                        found = true;
                        const existingMsgs = c.messages || [];
                        const isDuplicate = existingMsgs.some(m => m.id === message.id);
                        const nextMsgs = isDuplicate ? existingMsgs : [...existingMsgs, message];
                        const unreadInc = isCurrentlyActive ? 0 : 1;

                        return {
                            ...c,
                            lastMessage: message.text,
                            lastMessageTime: message.time,
                            lastMessageTimestamp: message.timestamp || Date.now(),
                            unreadCounts: {
                                ...c.unreadCounts,
                                [uId]: (c.unreadCounts?.[uId] || 0) + unreadInc
                            },
                            messages: nextMsgs
                        };
                    }
                    return c;
                });

                if (!found) {
                    // Conversation doesn't exist yet: create 1-to-1 conversation on the fly
                    const myProfile = {
                        userId: uId,
                        fullName: currentUser?.fullName || currentUser?.name || 'You',
                        designation: currentUser?.designation || 'Staff',
                        department: currentUser?.department || 'MPOnline',
                        avatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                        status: 'active'
                    };
                    const newConv = {
                        id: expectedConvKey,
                        participantIds: [uId, senderId],
                        participants: {
                            [uId]: myProfile,
                            [senderId]: sender
                        },
                        participant: sender,
                        unreadCounts: {
                            [uId]: isCurrentlyActive ? 0 : 1,
                            [senderId]: 0
                        },
                        lastMessage: message.text,
                        lastMessageTime: message.time,
                        lastMessageTimestamp: message.timestamp || Date.now(),
                        messages: [message]
                    };
                    const nextList = [newConv, ...prev];
                    saveMasterConversations(nextList);
                    return nextList;
                }

                saveMasterConversations(updated);
                return updated;
            });

            // Smooth scroll to bottom if currently looking at this chat
            if (isCurrentlyActive) {
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 50);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [currentUser, saveMasterConversations]);

    // ── Remote Sync Fallback: Pull latest messages periodically & on window focus ──
    const syncRemoteMessages = useCallback(async () => {
        const uId = Number(currentUser?.userId || currentUser?.id);
        if (!uId) return;

        try {
            const res = await notificationsApi.getAll(false, 1, 30);
            const notifs = res?.data || (Array.isArray(res) ? res : []);
            const messageNotifs = notifs.filter(n => 
                n.eventType === 'Message' || n.notificationType === 'Message'
            );
            if (messageNotifs.length === 0) return;

            setAllConversations(prev => {
                let changed = false;
                const next = [...prev];

                messageNotifs.forEach(notif => {
                    const senderId = Number(notif.relatedContentId || notif.referenceId || notif.senderUserId || 0);
                    if (!senderId || senderId === uId) return;

                    const convKey = getConversationKey(uId, senderId);
                    let rawText = notif.message || notif.text || '';
                    const colonIdx = rawText.indexOf(': "');
                    if (colonIdx !== -1 && rawText.endsWith('"')) {
                        rawText = rawText.substring(colonIdx + 3, rawText.length - 1);
                    }

                    const notifMsgId = `notif_${notif.notificationId}`;
                    const notifTimestamp = new Date(notif.createdDate || Date.now()).getTime();

                    const cIdx = next.findIndex(c => 
                        c.id === convKey || 
                        (Array.isArray(c.participantIds) && c.participantIds.map(Number).includes(senderId) && c.participantIds.map(Number).includes(uId))
                    );

                    if (cIdx !== -1) {
                        const existingMsgs = next[cIdx].messages || [];
                        const alreadyExists = existingMsgs.some(m => String(m.id) === notifMsgId || (m.timestamp === notifTimestamp && m.text === rawText));
                        if (!alreadyExists) {
                            changed = true;
                            const newMsgObj = {
                                id: notifMsgId,
                                senderId,
                                senderName: notif.senderName || 'Colleague',
                                text: rawText,
                                time: new Date(notif.createdDate || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                timestamp: notifTimestamp
                            };
                            next[cIdx] = {
                                ...next[cIdx],
                                lastMessage: rawText,
                                lastMessageTime: newMsgObj.time,
                                lastMessageTimestamp: notifTimestamp,
                                messages: [...existingMsgs, newMsgObj]
                            };
                        }
                    }
                });

                if (changed) {
                    saveMasterConversations(next);
                    return next;
                }
                return prev;
            });
        } catch (err) {}
    }, [currentUser, saveMasterConversations]);

    useEffect(() => {
        syncRemoteMessages();
        const interval = setInterval(syncRemoteMessages, 4000);
        const handleFocus = () => syncRemoteMessages();
        window.addEventListener('focus', handleFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
        };
    }, [syncRemoteMessages]);

    // ── Handle Opening or Creating 1-to-1 Conversation with a Specific User ──
    const openConversationWithUser = useCallback((targetUser) => {
        const targetId = Number(targetUser.userId || targetUser.id);
        if (!targetId || targetId === currentUserId) return;

        const convKey = getConversationKey(currentUserId, targetId);
        
        // 1. Check if conversation already exists between current user and target user
        const existing = allConversations.find(c => {
            if (c.id === convKey) return true;
            if (Array.isArray(c.participantIds)) {
                return c.participantIds.map(Number).includes(currentUserId) &&
                       c.participantIds.map(Number).includes(targetId);
            }
            return false;
        });

        if (existing) {
            // Re-use existing conversation!
            setActiveConvId(existing.id);
            setShowMobileChat(true);
            setIsNewChatOpen(false);

            // Clear unread count for current user
            const updated = allConversations.map(c => {
                if (c.id === existing.id) {
                    return {
                        ...c,
                        unreadCounts: {
                            ...c.unreadCounts,
                            [currentUserId]: 0
                        }
                    };
                }
                return c;
            });
            setAllConversations(updated);
            saveMasterConversations(updated);
            return;
        }

        // 2. Conversation does NOT exist: Create brand new 1-to-1 conversation
        const targetName = targetUser.fullName || targetUser.name || 'Colleague';
        const targetDesig = targetUser.designation || 'Staff';
        const targetDept = targetUser.department || targetUser.departmentName || 'MPOnline';
        const targetAvatar = targetUser.avatar || targetUser.profilePhotoUrl || null;

        const myProfile = {
            userId: currentUserId,
            fullName: currentUser?.fullName || currentUser?.name || 'You',
            designation: currentUser?.designation || 'Team Member',
            department: currentUser?.department || 'MPOnline',
            avatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
            status: 'active'
        };

        const targetProfile = {
            userId: targetId,
            fullName: targetName,
            designation: targetDesig,
            department: targetDept,
            avatar: targetAvatar,
            status: 'active'
        };

        const newConversation = {
            id: convKey,
            participantIds: [currentUserId, targetId],
            participants: {
                [currentUserId]: myProfile,
                [targetId]: targetProfile
            },
            participant: targetProfile,
            unreadCounts: {
                [currentUserId]: 0,
                [targetId]: 0
            },
            lastMessage: `Started conversation with ${targetName}`,
            lastMessageTime: 'Just now',
            lastMessageTimestamp: Date.now(),
            messages: []
        };

        const updatedList = [newConversation, ...allConversations];
        setAllConversations(updatedList);
        saveMasterConversations(updatedList);
        setActiveConvId(newConversation.id);
        setShowMobileChat(true);
        setIsNewChatOpen(false);
    }, [allConversations, currentUserId, currentUser, saveMasterConversations]);

    // ── URL Query Listener: When user clicks "Message" from Profile, People, Community ──
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const queryUserId = searchParams.get('userId') || searchParams.get('user') || searchParams.get('id');
        const queryName = searchParams.get('name');

        if (!queryUserId) return;

        const targetId = Number(queryUserId);
        if (!targetId || targetId === currentUserId) return;

        // Try finding target user in contextUsers roster
        const matchedUser = (contextUsers || []).find(u => Number(u.userId || u.id) === targetId);

        if (matchedUser) {
            openConversationWithUser(matchedUser);
        } else {
            // Build temporary target profile from query params & roster dictionary
            const rosterName = KNOWN_ROSTER_NAMES?.[queryUserId] || queryName || 'Colleague';
            const constructedUser = {
                userId: targetId,
                id: targetId,
                fullName: queryName ? decodeURIComponent(queryName) : rosterName,
                name: queryName ? decodeURIComponent(queryName) : rosterName,
                designation: 'Staff Colleague',
                department: 'MPOnline Enterprise',
                avatar: null,
                status: 'active'
            };
            openConversationWithUser(constructedUser);
        }
    }, [location.search, currentUserId, contextUsers, openConversationWithUser]);

    // Select conversation from list
    const handleSelectConversation = (convId) => {
        setActiveConvId(convId);
        setShowMobileChat(true);

        // Mark as read for current user
        const updated = allConversations.map(c => {
            if (c.id === convId) {
                return {
                    ...c,
                    unreadCounts: {
                        ...c.unreadCounts,
                        [currentUserId]: 0
                    }
                };
            }
            return c;
        });
        setAllConversations(updated);
        saveMasterConversations(updated);
    };

    // ── Send Message Handler ──
    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        const text = inputMessage.trim();
        if (!text || !activeConversation || !activeOtherParticipant) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const targetConvId = activeConversation.id;
        const otherId = Number(activeOtherParticipant.userId);

        const newMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            senderId: currentUserId,
            senderName: currentUser?.fullName || currentUser?.name || 'Me',
            text,
            time: timeStr,
            timestamp: now.getTime()
        };

        const updatedWithMyMsg = allConversations.map(c => {
            if (c.id === targetConvId) {
                const existingMsgs = c.messages || [];
                return {
                    ...c,
                    lastMessage: text,
                    lastMessageTime: timeStr,
                    lastMessageTimestamp: now.getTime(),
                    messages: [...existingMsgs, newMessage]
                };
            }
            return c;
        });

        setAllConversations(updatedWithMyMsg);
        saveMasterConversations(updatedWithMyMsg);
        setInputMessage('');

        // Real-Time Delivery: Broadcast to recipient across tabs, windows, and backend SignalR
        try {
            await sendLiveMessage({
                sender: {
                    userId: currentUserId,
                    fullName: currentUser?.fullName || currentUser?.name || 'Colleague',
                    designation: currentUser?.designation || 'Staff',
                    department: currentUser?.department || 'MPOnline',
                    avatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null
                },
                recipient: activeOtherParticipant,
                conversationId: targetConvId,
                message: newMessage
            });
        } catch (err) {
            console.error('[Messages] Failed to send live message:', err);
        }
    };

    // Filter conversations based on search and unread tab
    const filteredConversations = useMemo(() => {
        return userConversations.filter(c => {
            const otherP = getOtherParticipant(c, currentUserId, contextUsers);
            const otherName = (otherP?.fullName || '').toLowerCase();
            const lastMsg = (c.lastMessage || '').toLowerCase();
            const q = searchQuery.toLowerCase();

            const matchesSearch = !q || otherName.includes(q) || lastMsg.includes(q);
            if (!matchesSearch) return false;

            const myUnread = c.unreadCounts?.[currentUserId] || 0;
            if (filterTab === 'unread') return myUnread > 0;
            return true;
        });
    }, [userConversations, searchQuery, filterTab, currentUserId, contextUsers]);

    // Available colleagues from user roster for "New Chat" modal (excluding self)
    const availableColleagues = useMemo(() => {
        const pool = (contextUsers && contextUsers.length > 0) ? contextUsers : DEFAULT_COLLEAGUES;
        return pool.filter(u => {
            const uId = Number(u.userId || u.id);
            if (uId === currentUserId) return false;
            if (!colleagueSearch) return true;
            const q = colleagueSearch.toLowerCase();
            return (u.fullName || u.name || '').toLowerCase().includes(q) ||
                   (u.designation || '').toLowerCase().includes(q) ||
                   (u.department || '').toLowerCase().includes(q);
        });
    }, [contextUsers, currentUserId, colleagueSearch]);

    // Total unread count for current user
    const totalUnreadCount = useMemo(() => {
        return userConversations.reduce((acc, c) => acc + (c.unreadCounts?.[currentUserId] || 0), 0);
    }, [userConversations, currentUserId]);

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
                            onClick={() => setIsNewChatOpen(true)}
                            className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                            title="Start New Chat"
                        >
                            <span className="material-symbols-outlined text-[18px]">edit_square</span>
                            <span className="hidden sm:inline">New Chat</span>
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
                                placeholder="Search messages or colleagues..."
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
                                All ({userConversations.length})
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
                        {filteredConversations.length > 0 ? (
                            filteredConversations.map(conv => {
                                const isSelected = conv.id === activeConversation?.id;
                                const otherP = getOtherParticipant(conv, currentUserId, contextUsers);
                                const myUnread = conv.unreadCounts?.[currentUserId] || 0;
                                const avatarUrl = resolveMediaUrl(otherP?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherP?.fullName || 'Colleague')}&background=06b6d4&color=fff`;

                                return (
                                    <div
                                        key={conv.id}
                                        onClick={() => handleSelectConversation(conv.id)}
                                        className={`p-3 flex items-center gap-3 cursor-pointer transition-all ${
                                            isSelected
                                                ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-l-4 border-l-cyan-500'
                                                : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                                        }`}
                                    >
                                        {/* Avatar with Status Dot */}
                                        <div className="relative shrink-0">
                                            <img
                                                src={avatarUrl}
                                                alt={otherP?.fullName || 'Colleague'}
                                                className="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                            />
                                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                                                otherP?.status === 'active' ? 'bg-emerald-500' : (otherP?.status === 'idle' ? 'bg-amber-500' : 'bg-slate-400')
                                            }`}></span>
                                        </div>

                                        {/* Text Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <h2 className="text-xs font-black text-slate-900 dark:text-white truncate">
                                                    {otherP?.fullName}
                                                </h2>
                                                <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                                    {conv.lastMessageTime}
                                                </span>
                                            </div>
                                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate mb-1">
                                                {otherP?.designation} • {otherP?.department}
                                            </p>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`text-[11.5px] truncate ${
                                                    myUnread > 0 
                                                        ? 'font-bold text-slate-900 dark:text-white' 
                                                        : 'text-slate-500 dark:text-slate-400'
                                                }`}>
                                                    {conv.lastMessage || 'No messages yet'}
                                                </p>
                                                {myUnread > 0 && (
                                                    <span className="px-1.5 py-0.5 text-[9.5px] font-black rounded-full bg-cyan-500 text-white shrink-0">
                                                        {myUnread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-slate-400 text-xs">
                                <span className="material-symbols-outlined text-3xl mb-2 text-slate-300 dark:text-slate-600 block">chat_bubble_outline</span>
                                No conversations found.
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT PANE: Active Chat View (Facebook Messenger Style) ── */}
                {activeConversation && activeOtherParticipant ? (
                    <div className={`flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900 ${
                        showMobileChat ? 'flex' : 'hidden md:flex'
                    }`}>
                        {/* Chat Top Header: User B Profile & Status */}
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
                                        src={resolveMediaUrl(activeOtherParticipant.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeOtherParticipant.fullName)}&background=06b6d4&color=fff`}
                                        alt={activeOtherParticipant.fullName}
                                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                    />
                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                            {activeOtherParticipant.fullName}
                                        </h2>
                                        {activeOtherParticipant.department && (
                                            <span className="hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                {activeOtherParticipant.department}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </div>

                        {/* Chat Messages Feed */}
                        <div ref={chatFeedRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 bg-slate-50/40 dark:bg-slate-950/20 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 overscroll-contain">
                            {/* Day Separator Pill */}
                            <div className="flex items-center justify-center my-2">
                                <span className="px-3 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10.5px] font-bold shadow-xs">
                                    Direct Messenger Conversation
                                </span>
                            </div>

                            {(activeConversation.messages || []).map((msg, i) => {
                                const isMe = Number(msg.senderId) === currentUserId;
                                const isOnlyEm = isEmojiOnly(msg.text);
                                const reactions = messageReactions[msg.id] || msg.reactions || {};
                                const hasReactions = Object.keys(reactions).length > 0;
                                const isHovered = activeHoverMsgId === (msg.id || i);
                                const isPickerOpenForMsg = activeReactionPickerMsgId === (msg.id || i);

                                return (
                                    <div
                                        key={msg.id || i}
                                        onMouseEnter={() => setActiveHoverMsgId(msg.id || i)}
                                        onMouseLeave={() => setActiveHoverMsgId(null)}
                                        className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1`}
                                    >
                                        <div className={`relative flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {/* Main message bubble or standalone emoji */}
                                            {isOnlyEm ? (
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
                                                    <p className="break-words whitespace-pre-wrap emoji-font text-[13px] leading-relaxed">{msg.text}</p>
                                                </div>
                                            )}

                                            {/* Quick reaction hover button */}
                                            <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ${
                                                isPickerOpenForMsg ? '!opacity-100' : ''
                                            }`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveReactionPickerMsgId(prev => prev === (msg.id || i) ? null : (msg.id || i))}
                                                    className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center justify-center text-xs shadow-xs cursor-pointer transition-all hover:scale-110"
                                                    title="Add reaction"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">add_reaction</span>
                                                </button>
                                            </div>

                                            {/* Floating mini reaction picker popover */}
                                            {isPickerOpenForMsg && (
                                                <div className={`absolute bottom-full mb-1.5 z-30 flex items-center gap-1 p-1 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-full shadow-xl border border-slate-200/80 dark:border-slate-700/80 animate-in fade-in zoom-in-95 duration-100 ${
                                                    isMe ? 'right-0' : 'left-0'
                                                }`}>
                                                    {['👍', '❤️', '😂', '🔥', '🎉', '👏', '🚀', '🧐'].map(rEm => (
                                                        <button
                                                            key={rEm}
                                                            type="button"
                                                            onClick={() => {
                                                                toggleReaction(msg.id || i, rEm);
                                                                setActiveReactionPickerMsgId(null);
                                                            }}
                                                            className="w-7 h-7 flex items-center justify-center text-base rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-130 transition-transform cursor-pointer emoji-font select-none"
                                                            title={EMOJI_LABELS[rEm] || rEm}
                                                        >
                                                            {rEm}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Reactions Badges Pill Row */}
                                        {hasReactions && (
                                            <div className={`flex flex-wrap items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {Object.entries(reactions).map(([rEm, uIds]) => {
                                                    const count = Array.isArray(uIds) ? uIds.length : (typeof uIds === 'number' ? uIds : 1);
                                                    if (count <= 0) return null;
                                                    const reactedByMe = Array.isArray(uIds) && uIds.includes(currentUserId);
                                                    return (
                                                        <button
                                                            key={rEm}
                                                            type="button"
                                                            onClick={() => toggleReaction(msg.id || i, rEm)}
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                                                                reactedByMe
                                                                    ? 'bg-cyan-50 dark:bg-cyan-950/80 border-cyan-400 dark:border-cyan-600 text-cyan-700 dark:text-cyan-300 shadow-2xs'
                                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                                            }`}
                                                        >
                                                            <span className="emoji-font text-sm">{rEm}</span>
                                                            <span className="text-[10px] font-black">{count}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Timestamp */}
                                        <div className="flex items-center gap-1 mt-0.5 px-1 text-[10px] text-slate-400 font-semibold">
                                            <span>{msg.time}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Bottom Input Area */}
                        <form onSubmit={handleSendMessage} className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative z-20 sticky bottom-0">
                            {/* Rich Floating Emoji Picker Popover */}
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
                                                placeholder="Search emojis (e.g. think, fire, rocket)..."
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-7 py-1 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder:text-slate-400"
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
                                                    onClick={() => handleSelectEmoji(em)}
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
                                        {displayedEmojis.length > 0 ? (
                                            displayedEmojis.map((em, idx) => (
                                                <button
                                                    key={`${em}-${idx}`}
                                                    type="button"
                                                    onMouseEnter={() => setHoveredEmoji(em)}
                                                    onMouseLeave={() => setHoveredEmoji(null)}
                                                    onClick={() => handleSelectEmoji(em)}
                                                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-2xl sm:text-[26px] hover:scale-130 transition-transform rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer emoji-font select-none active:scale-95"
                                                    title={EMOJI_LABELS[em] || em}
                                                >
                                                    {em}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="col-span-full py-6 text-center text-xs text-slate-400 font-medium">
                                                No emojis match "{emojiSearch}"
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Live Preview & Info Bar */}
                                    <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 min-h-[32px]">
                                        {hoveredEmoji ? (
                                            <>
                                                <span className="emoji-font text-2xl leading-none">{hoveredEmoji}</span>
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                                    {EMOJI_LABELS[hoveredEmoji] || 'Emoji'}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                                Click any emoji to insert into message
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-1.5 focus-within:border-cyan-500 transition-colors">
                                <input
                                    ref={chatInputRef}
                                    type="text"
                                    value={inputMessage}
                                    onChange={e => setInputMessage(e.target.value)}
                                    placeholder={`Message ${activeOtherParticipant.fullName}...`}
                                    className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none emoji-font"
                                />

                                <div className="flex items-center gap-1 shrink-0">
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
                                    <button
                                        type="submit"
                                        disabled={!inputMessage.trim()}
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
                    <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center bg-slate-50/30 dark:bg-slate-950/20 h-full min-h-0">
                        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-4xl">chat</span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white mb-1">
                            Your Messages
                        </h2>
                        <p className="text-xs text-slate-400 max-w-sm mb-6">
                            Send direct messages, files, and notes to your MPOnline colleagues. Pick a conversation or start a new chat.
                        </p>
                        <button
                            onClick={() => setIsNewChatOpen(true)}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">add_comment</span>
                            Start a Conversation
                        </button>
                    </div>
                )}
            </div>

            {/* ── MODAL: Start New Conversation with a Colleague ── */}
            {isNewChatOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-600">add_comment</span>
                                New Conversation
                            </h2>
                            <button
                                onClick={() => setIsNewChatOpen(false)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    value={colleagueSearch}
                                    onChange={e => setColleagueSearch(e.target.value)}
                                    placeholder="Search colleague by name or department..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:border-cyan-500"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[380px]">
                            {availableColleagues.length > 0 ? (
                                availableColleagues.map(user => {
                                    const uName = user.fullName || user.name || 'Colleague';
                                    const uId = Number(user.userId || user.id);
                                    const avatarUrl = resolveMediaUrl(user.profilePhotoUrl || user.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(uName)}&background=06b6d4&color=fff`;

                                    return (
                                        <div
                                            key={uId}
                                            onClick={() => openConversationWithUser(user)}
                                            className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img src={avatarUrl} alt={uName} className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                                                <div className="min-w-0">
                                                    <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">{uName}</h3>
                                                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                                        {user.designation || 'Staff'} • {user.department || user.departmentName || 'MPOnline'}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[18px]">chat</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-8 text-center text-slate-400 text-xs">
                                    No colleagues found matching "{colleagueSearch}".
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
