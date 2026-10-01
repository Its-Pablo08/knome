import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useUser, getUserStatusConfig } from '../contexts/UserContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import NotificationSettingsModal, { DEFAULT_NOTIF_PREFERENCES } from '../modals/NotificationSettingsModal';
import RoleFaqModal from '../modals/RoleFaqModal';
import NotificationToast from '../ui/NotificationToast';
import HighlightText from '../ui/HighlightText';
import knomeLogo from '../../assets/knome_logo.png';
import knomeLogoDark from '../../assets/knome_logo_dark.png';
import { notificationsApi, profileApi, searchApi, karmaApi, resolveMediaUrl, saveRecentSearch, getLocalRecentSearches, clearLocalRecentSearches } from '../../utils/apiService';
import { useConfirm } from '../contexts/ConfirmDialogContext';
import * as signalR from '@microsoft/signalr';
import { getHubUrl } from '../../utils/apiClient';
import { formatNotificationDate, getTimeGroup, isNotificationForUser, isSelfNotification, parseNotificationContent } from '../../utils/notificationHelpers';
import { subscribeToLiveMessages } from '../../utils/realtimeMessenger';

const DISCOVER_CATEGORIES = [
    { id: 'All', label: 'All', icon: 'grid_view' },
    { id: 'People', label: 'People', icon: 'person' },
    { id: 'Post', label: 'Posts', icon: 'dynamic_feed' },
    { id: 'Article', label: 'Articles', icon: 'article' },
    { id: 'Video', label: 'Videos', icon: 'videocam' },
    { id: 'Community', label: 'Communities', icon: 'group' },
    { id: 'Podcast', label: 'Audio', icon: 'podcasts' },
];

export default function Navbar() {
    const { currentUser, setCurrentUser, users, logout } = useUser();
    const confirm = useConfirm();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
    const userStatusConfig = getUserStatusConfig(currentUser);
    const { pathname } = useLocation();
    const navigate = useNavigate();
    
    // User Karma Points State
    const [userKarma, setUserKarma] = useState(currentUser?.karmaPoints ?? currentUser?.karma ?? 0);

    useEffect(() => {
        if (currentUser?.karmaPoints !== undefined || currentUser?.karma !== undefined) {
            setUserKarma(currentUser.karmaPoints ?? currentUser.karma ?? 0);
        }
        const fetchKarma = async () => {
            try {
                const bal = await karmaApi.getMyBalance();
                const total = bal?.totalPoints ?? bal?.data?.totalPoints;
                if (typeof total === 'number') {
                    setUserKarma(total);
                }
            } catch {
                /* fallback to existing userKarma */
            }
        };
        fetchKarma();

        const handleKarmaUpdated = (e) => {
            if (e.detail?.totalKarma !== undefined && typeof e.detail.totalKarma === 'number') {
                setUserKarma(e.detail.totalKarma);
            } else if (e.detail?.points) {
                setUserKarma(prev => prev + e.detail.points);
            } else {
                fetchKarma();
            }
        };

        const handleContentCreated = () => {
            setTimeout(() => {
                fetchKarma();
            }, 300);
        };

        window.addEventListener('karma-updated', handleKarmaUpdated);
        window.addEventListener('post-created', handleContentCreated);
        window.addEventListener('article-created', handleContentCreated);

        return () => {
            window.removeEventListener('karma-updated', handleKarmaUpdated);
            window.removeEventListener('post-created', handleContentCreated);
            window.removeEventListener('article-created', handleContentCreated);
        };
    }, [currentUser?.userId, currentUser?.employeeId, currentUser?.karma]);

    const isSysAdmin = ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
                       ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) || 
                       ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN'].includes(String(currentUser?.designation || '').toUpperCase()) ||
                       (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => 
                           ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(r || '').toUpperCase())
                       ));

    // Direct Messages unread count synchronization
    const [unreadMsgCount, setUnreadMsgCount] = useState(() => {
        try {
            const userId = Number(currentUser?.userId || currentUser?.id || 1);
            const userSpecific = localStorage.getItem(`knome_unread_messages_count_${userId}`);
            if (userSpecific !== null) return parseInt(userSpecific, 10) || 0;
            const stored = localStorage.getItem('knome_unread_messages_count');
            if (stored !== null) return parseInt(stored, 10) || 0;
            const convs = localStorage.getItem('knome_global_messenger_conversations');
            if (convs) {
                const parsed = JSON.parse(convs);
                if (Array.isArray(parsed)) {
                    return parsed.reduce((sum, c) => {
                        if (c.participantIds && c.participantIds.map(Number).includes(userId)) {
                            return sum + (c.unreadCounts?.[userId] || 0);
                        }
                        return sum;
                    }, 0);
                }
            }
        } catch (e) {}
        return 2;
    });

    useEffect(() => {
        const handleMsgUpdate = (e) => {
            if (e?.detail?.unreadCount !== undefined) {
                setUnreadMsgCount(e.detail.unreadCount);
            } else {
                try {
                    const userId = Number(currentUser?.userId || currentUser?.id || 1);
                    const userSpecific = localStorage.getItem(`knome_unread_messages_count_${userId}`);
                    if (userSpecific !== null) {
                        setUnreadMsgCount(parseInt(userSpecific, 10) || 0);
                        return;
                    }
                    const stored = localStorage.getItem('knome_unread_messages_count');
                    if (stored !== null) setUnreadMsgCount(parseInt(stored, 10) || 0);
                } catch (err) {}
            }
        };
        window.addEventListener('knome_messages_updated', handleMsgUpdate);
        window.addEventListener('storage', handleMsgUpdate);
        return () => {
            window.removeEventListener('knome_messages_updated', handleMsgUpdate);
            window.removeEventListener('storage', handleMsgUpdate);
        };
    }, [currentUser]);

    // Live Cross-Tab & Cross-User Real-time Message Subscription
    useEffect(() => {
        const uId = Number(currentUser?.userId || currentUser?.id);
        if (!uId) return;

        const unsubscribe = subscribeToLiveMessages(uId, (livePayload) => {
            const { sender, message } = livePayload;
            if (!sender || !message) return;

            const notifItem = {
                id: `live_msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                type: 'message',
                eventType: 'Message',
                notificationType: 'Message',
                title: 'New Message',
                senderName: sender.fullName || sender.name || 'Colleague',
                senderAvatar: sender.avatar,
                senderUserId: sender.userId,
                targetUserId: uId,
                recipientUserId: uId,
                userId: uId,
                message: `${sender.fullName || sender.name || 'Colleague'}: "${message.text}"`,
                text: `${sender.fullName || sender.name || 'Colleague'}: "${message.text}"`,
                targetUrl: `/messages?userId=${sender.userId}&name=${encodeURIComponent(sender.fullName || sender.name || '')}`,
                unread: true,
                createdDate: new Date().toISOString()
            };

            setAllNotifs(prev => [notifItem, ...prev.filter(n => String(n.id) !== String(notifItem.id))]);
            
            // Always display real-time notification popup for incoming messages
            setToastNotification(notifItem);
            setUnreadMsgCount(prev => prev + 1);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [currentUser?.userId, currentUser?.id]);

    // Smart Enterprise Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [recentSearches, setRecentSearches] = useState([]);
    const [trendingSearches, setTrendingSearches] = useState([]);
    const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    // Fetch Recent Searches & Trending Searches when dropdown opens
    useEffect(() => {
        if (!showSuggestions) return;

        const loadInitialSearchData = async () => {
            try {
                const [histRes, trendRes] = await Promise.all([
                    searchApi.getHistory(10).catch(() => null),
                    searchApi.getTrending(6).catch(() => null)
                ]);
                const apiItems = Array.isArray(histRes) ? histRes : (histRes?.data || []);
                const localItems = getLocalRecentSearches();

                const combined = [...localItems];
                apiItems.forEach(item => {
                    const term = typeof item === 'string' ? item : item.searchTerm;
                    if (term && !combined.some(c => c.searchTerm.toLowerCase() === term.toLowerCase())) {
                        combined.push({ searchTerm: term, searchDate: item.searchDate || new Date().toISOString() });
                    }
                });

                setRecentSearches(combined.slice(0, 10));
                setTrendingSearches(Array.isArray(trendRes) ? trendRes : (trendRes?.data || []));
            } catch (e) {
                console.error('Failed to load search history/trending data', e);
                setRecentSearches(getLocalRecentSearches());
            }
        };

        loadInitialSearchData();
    }, [showSuggestions]);

    // Real-time debounced search suggestions (Requires at least 3 characters)
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.trim().length < 3) {
            setSuggestions([]);
            setIsSearchingSuggestions(false);
            setSelectedIndex(-1);
            return;
        }

        setIsSearchingSuggestions(true);
        const timer = setTimeout(async () => {
            try {
                const res = await searchApi.getSuggestions(searchQuery, 8);
                const items = Array.isArray(res) ? res : (res?.data || []);
                setSuggestions(items);
            } catch (e) {
                console.error('Failed to fetch search suggestions', e);
                setSuggestions([]);
            } finally {
                setIsSearchingSuggestions(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSearch = (query, categoryFilter = null) => {
        const q = query ? query.trim() : searchQuery.trim();
        if (!q || q.length < 3) return;

        // Save immediately to Recent Searches state & localStorage
        saveRecentSearch(q);
        setRecentSearches(prev => [
            { searchTerm: q, searchDate: new Date().toISOString() },
            ...prev.filter(item => item.searchTerm.toLowerCase() !== q.toLowerCase())
        ].slice(0, 10));

        // Push to backend API asynchronously
        searchApi.saveHistory(q);

        setSearchQuery('');
        setShowSuggestions(false);
        setSelectedIndex(-1);

        const typeParam = categoryFilter && categoryFilter !== 'All' ? `&type=${encodeURIComponent(categoryFilter)}` : '';
        navigate(`/search?q=${encodeURIComponent(q)}${typeParam}`);
    };

    const handleClearHistory = async (e, term = null) => {
        if (e) e.stopPropagation();
        
        // 1. Immediately update local state
        if (term) {
            setRecentSearches(prev => prev.filter(item => item.searchTerm.toLowerCase() !== term.toLowerCase()));
        } else {
            setRecentSearches([]);
        }

        // 2. Immediately clear localStorage
        clearLocalRecentSearches(term);

        // 3. Clear backend search history
        try {
            await searchApi.clearHistory(term).catch(() => null);
        } catch (err) {
            console.error('Failed to clear search history', err);
        }
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                const selected = suggestions[selectedIndex];
                setShowSuggestions(false);
                setSearchQuery('');
                if (selected.contentType === 'User' || selected.type === 'User') {
                    navigate('/profile', { 
                        state: { 
                            user: { 
                                userId: selected.id, 
                                id: selected.id, 
                                name: selected.title, 
                                fullName: selected.title, 
                                profilePhotoUrl: selected.thumbnailUrl, 
                                avatar: selected.thumbnailUrl 
                            } 
                        } 
                    });
                } else {
                    handleSearch(selected.title);
                }
            } else {
                handleSearch(searchQuery);
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('theme');
        if (saved) return saved === 'dark';
        return false;
    });

    // Notification Preferences State (Loaded from localStorage per user)
    const [notifPreferences, setNotifPreferences] = useState(() => {
        try {
            const uid = currentUser?.userId || currentUser?.id || localStorage.getItem('knome_userId') || localStorage.getItem('knome_employeeId') || 'default';
            const saved = localStorage.getItem(`knome_notif_prefs_${uid}`);
            if (saved) return { ...DEFAULT_NOTIF_PREFERENCES, ...JSON.parse(saved) };
        } catch (_) {}
        return DEFAULT_NOTIF_PREFERENCES;
    });

    const notifPreferencesRef = useRef(notifPreferences);
    useEffect(() => {
        notifPreferencesRef.current = notifPreferences;
    }, [notifPreferences]);

    useEffect(() => {
        const uid = currentUser?.userId || currentUser?.id || localStorage.getItem('knome_userId') || localStorage.getItem('knome_employeeId') || 'default';
        const loadPrefs = () => {
            try {
                const saved = localStorage.getItem(`knome_notif_prefs_${uid}`);
                if (saved) {
                    const parsed = { ...DEFAULT_NOTIF_PREFERENCES, ...JSON.parse(saved) };
                    setNotifPreferences(parsed);
                    notifPreferencesRef.current = parsed;
                }
            } catch (_) {}
        };
        loadPrefs();

        const handlePrefsUpdated = (e) => {
            if (e.detail) {
                const merged = { ...DEFAULT_NOTIF_PREFERENCES, ...e.detail };
                setNotifPreferences(merged);
                notifPreferencesRef.current = merged;
            } else {
                loadPrefs();
            }
        };

        window.addEventListener('notification-preferences-updated', handlePrefsUpdated);
        return () => {
            window.removeEventListener('notification-preferences-updated', handlePrefsUpdated);
        };
    }, [currentUser?.userId, currentUser?.id]);

    // Notifications state (FR-NT-01, FR-NT-04)
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
    const [allNotifs, setAllNotifs] = useState([]);
    const [toastNotification, setToastNotification] = useState(null);
    const [activeNotifFilter, setActiveNotifFilter] = useState('All'); // All | Reactions | Comments | Connections | Mentions | System
    const [notifSearchQuery, setNotifSearchQuery] = useState('');

    // Refs for outside click detection
    const notifDropdownRef = useRef(null);
    const userMenuDropdownRef = useRef(null);
    const searchDropdownRef = useRef(null);

    // Auto-close notification dropdown, search suggestions & user menu when clicking anywhere outside or pressing Escape
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target)) {
                setIsNotifOpen(false);
            }
            if (userMenuDropdownRef.current && !userMenuDropdownRef.current.contains(event.target)) {
                setIsUserMenuOpen(false);
            }
            if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setIsNotifOpen(false);
                setIsUserMenuOpen(false);
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('touchstart', handleClickOutside, true);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('touchstart', handleClickOutside, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const playChimeSound = () => {
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
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(880, now);
            osc2.frequency.setValueAtTime(1320, now + 0.08);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc1.stop(now + 0.12);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.55);
        } catch (e) {
            // Audio context blocked or unsupported
        }
    };

    const formatRelativeTime = (dateStr) => {
        return formatNotificationDate(dateStr);
    };

    // Helper: Determine if an in-app notification is allowed according to user preferences
    const isNotificationAllowed = (n, prefs) => {
        if (!prefs) return true;
        const type = (n.notificationType || n.eventType || n.type || '').toLowerCase();
        const msg = (n.message || n.text || n.title || '').toLowerCase();
        const cat = (n.category || '').toLowerCase();
        const relType = (n.relatedContentType || '').toLowerCase();

        // 1. Comments & Replies
        const isComment = cat === 'comments' || type.includes('comment') || msg.includes('commented') || msg.includes('comment') || msg.includes('replied');
        if (isComment) return prefs.comments !== false;

        // 2. Reactions & Likes
        const isReaction = cat === 'reactions' || type.includes('reaction') || type.includes('like') || msg.includes('liked') || msg.includes('reacted');
        if (isReaction) return prefs.reactions !== false;

        // 3. Followers & Connections
        const isFollow = cat === 'connections' || type.includes('follow') || type.includes('connection') || msg.includes('following') || msg.includes('connection');
        if (isFollow) return prefs.followers !== false;

        // 4. Community Invitations & Join Requests
        const isCommInvite = type.includes('community_invite') || type.includes('join_request') || type.includes('invite') || msg.includes('invited') || msg.includes('invitation');
        if (isCommInvite) return prefs.communityInvites !== false;

        // 5. @Mentions
        const isMention = cat === 'mentions' || type.includes('mention') || msg.includes('mentioned');
        if (isMention) return prefs.mentions !== false;

        // 6. Job Postings
        const isJob = type.includes('job') || relType === 'job' || msg.includes('job') || msg.includes('vacancy') || msg.includes('opening');
        if (isJob) return prefs.jobPostings !== false;

        // 7. Community Posts & Updates
        const isCommPost = cat === 'community' || type.includes('community') || relType === 'community' || msg.includes('community');
        if (isCommPost) return prefs.communityPosts !== false;

        return true;
    };

    const mapNotificationItem = (n) => {
        const type = (n.notificationType || n.eventType || '').toLowerCase();
        const isFollow = type.includes('follow');
        const isConnectionReq = type.includes('connection');
        const msg = (n.message || n.text || n.title || '').toLowerCase();
        const relType = (n.relatedContentType || '').toLowerCase();
        const isReaction = type.includes('reaction') || type.includes('like') || msg.includes('liked') || msg.includes('reacted');
        const isComment = (type.includes('comment') || msg.includes('commented') || msg.includes('replied')) && !isReaction;
        const isMention = type.includes('mention');
        const isShare = type.includes('share') || msg.includes('shared');
        const isCommunity = type.includes('community') || relType === 'community' || msg.includes('community');

        let icon = 'notifications';
        let color = 'text-slate-400';
        let bg = 'bg-slate-500/10';
        let category = 'System';

        const isMsg = type.includes('message') || type.includes('chat') || msg.includes('sent you a message');
        if (isMsg) {
            icon = 'chat';
            color = 'text-cyan-500';
            bg = 'bg-cyan-500/10';
            category = 'Messages';
        } else if (isFollow || isConnectionReq) {
            icon = isConnectionReq ? 'connect_without_contact' : 'person_add';
            color = 'text-indigo-500';
            bg = 'bg-indigo-500/10';
            category = 'Connections';
        } else if (isReaction) {
            icon = 'favorite';
            color = 'text-rose-500';
            bg = 'bg-rose-500/10';
            category = 'Reactions';
        } else if (isComment) {
            icon = 'chat_bubble';
            color = 'text-blue-500';
            bg = 'bg-blue-500/10';
            category = 'Comments';
        } else if (isMention) {
            icon = 'alternate_email';
            color = 'text-purple-500';
            bg = 'bg-purple-500/10';
            category = 'Mentions';
        } else if (isShare) {
            icon = 'share';
            color = 'text-emerald-500';
            bg = 'bg-emerald-500/10';
            category = 'Shares';
        } else if (isCommunity) {
            icon = 'groups';
            color = 'text-indigo-500';
            bg = 'bg-indigo-500/10';
            category = 'Community';
        }

        let senderName = n.senderName || n.actorName;
        if (!senderName || senderName === 'System') {
            const match = (n.message || '').match(/^(.+?)\s+(shared|invited|sent|commented|liked|reacted|posted|mentioned)\b/i);
            if (match && match[1].trim()) {
                senderName = match[1].trim();
            } else {
                senderName = 'Colleague';
            }
        }
        const senderAvatar = resolveMediaUrl(n.senderAvatar) || (senderName && senderName !== 'System' ? `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=6366f1&color=fff` : null);
        const dateVal = n.createdAt || n.createdDate || n.created_at;
        const refId = n.relatedContentId || n.referenceId;

        let targetUrl = n.targetUrl;
        if (isConnectionReq || type.includes('connection') || msg.includes('connection request')) {
            targetUrl = msg.includes('accepted') ? '/network?tab=Connections' : '/network?tab=Requests';
        } else if (!targetUrl) {
            if (msg.includes('post') || type.includes('post') || type.includes('share') || relType === 'post') {
                targetUrl = refId ? `/posts?id=${refId}` : '/posts';
            } else if (msg.includes('article') || type.includes('article') || relType === 'article') {
                targetUrl = refId ? `/article-view?id=${refId}` : '/articles';
            } else if (msg.includes('community') || type.includes('community') || relType === 'community') {
                targetUrl = refId ? `/community/view?id=${refId}` : '/community';
            } else if (msg.includes('video') || type.includes('video') || relType === 'video') {
                targetUrl = refId ? `/videos?id=${refId}` : '/videos';
            } else if (msg.includes('podcast') || type.includes('podcast') || relType === 'podcast') {
                targetUrl = refId ? `/podcasts?id=${refId}` : '/podcasts';
            } else if (isMsg) {
                targetUrl = refId ? `/messages?userId=${refId}` : '/messages';
            }
        }

        const dateFormatted = formatNotificationDate(dateVal);
        const parsed = parseNotificationContent({ senderName, message: n.message || n.text || n.title });

        const isAccepted = msg.includes('accepted');

        return {
            id: n.notificationId || n.id,
            category,
            type: (isConnectionReq && !isAccepted) ? 'follow_request' : (isConnectionReq && isAccepted ? 'connection_accepted' : (isFollow ? 'follow' : type)),
            title: n.title || (isAccepted ? 'Connection Accepted' : (isFollow ? 'New Follower' : (isConnectionReq ? 'Connection Request' : 'Notification'))),
            text: n.message || n.text,
            message: n.message || n.text,
            parsedSender: parsed.sender,
            parsedAction: parsed.action,
            targetUrl,
            relatedContentType: n.relatedContentType,
            relatedContentId: n.relatedContentId || n.referenceId,
            createdDate: dateVal,
            time: dateFormatted,
            displayDate: dateFormatted,
            unread: !n.isRead,
            icon,
            color,
            bg,
            senderUserId: n.senderUserId || n.actorUserId,
            senderName,
            senderAvatar,
            handled: n.isRead || isAccepted,
            status: isAccepted ? 'approved' : 'pending'
        };
    };

    // Read community notifications from localStorage (invite, join_request, approved, rejected)
    const getLocalCommunityNotifs = () => {
        try {
            const all = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const isCurrentUserAdmin = ['SYSADM', 'CADM'].includes(currentUser?.role) ||
                ['System Administrator', 'HR Administrator', 'Community Administrator', 'System Admin'].includes(currentUser?.roleName);

            return all
                .filter(n => {
                    // Prevent self-loopback
                    if (isSelfNotification(n, currentUser)) return false;

                    if (!['community_invite', 'join_request', 'community_approved', 'community_rejected', 'community', 'invite'].includes(n.type) && !(n.category === 'Community')) return false;
                    
                    if (isNotificationForUser(n, currentUser)) return true;
                    if (currentUser?.id && n.targetCreatorId && String(n.targetCreatorId) === String(currentUser.id)) return true;
                    if (n.type === 'join_request' && (n.targetUserId === 'admin' || isCurrentUserAdmin)) return true;
                    return false;
                })
                .map(n => {
                    const dateVal = n.createdDate || n.createdAt || n.timestamp || n.date;
                    const dateFormatted = formatNotificationDate(dateVal);
                    const parsed = parseNotificationContent({ senderName: n.senderName || 'Community Admin', message: n.text || n.message });
                    return {
                        id: n.id || `local_${n.communityId}_${n.targetUserId}_${n.type}`,
                        type: n.type || 'community_invite',
                        category: 'Community',
                        icon: n.icon || 'group_add',
                        color: n.color || 'text-indigo-400',
                        bg: n.bg || 'bg-indigo-500/10',
                        text: n.text || n.message,
                        message: n.text || n.message,
                        parsedSender: parsed.sender,
                        parsedAction: parsed.action,
                        senderName: n.senderName || 'Community Admin',
                        senderAvatar: n.senderAvatar || null,
                        senderUserId: n.senderUserId,
                        time: dateFormatted,
                        displayDate: dateFormatted,
                        createdDate: dateVal,
                        unread: n.unread !== false,
                        isLocalNotif: true,
                        targetUrl: n.actionLink || (n.communityId ? `/community/view?id=${n.communityId}` : '/community'),
                        relatedContentId: n.communityId,
                        relatedContentType: 'community',
                        communityName: n.communityName,
                        communityId: n.communityId,
                    };
                });
        } catch (e) {
            return [];
        }
    };

    // Read ALL localStorage notifications including video shares, media approvals, etc.
    const getLocalGenericNotifs = () => {
        try {
            const all = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            return all
                .filter(n => {
                    // Prevent self-loopback
                    if (isSelfNotification(n, currentUser)) return false;

                    // Skip community-type notifications (handled by getLocalCommunityNotifs)
                    if (['community_invite', 'join_request', 'community_approved', 'community_rejected'].includes(n.type)) return false;
                    if (n.category === 'Community') return false;

                    // Strict recipient check
                    if (!isNotificationForUser(n, currentUser)) return false;

                    return true;
                })
                .map(n => {
                    const isVideo = n.type === 'video_shared' || n.relatedContentType === 'Video' || (n.text || '').toLowerCase().includes('video');
                    const isPodcast = n.type === 'podcast_shared' || n.relatedContentType === 'Podcast' || (n.text || '').toLowerCase().includes('podcast');
                    const isArticle = n.type === 'article_shared' || n.relatedContentType === 'Article' || (n.text || '').toLowerCase().includes('article');
                    const isPost = n.type === 'post_shared' || n.relatedContentType === 'Post' || (n.text || '').toLowerCase().includes('post');
                    const isCommunity = n.type === 'community_shared' || n.relatedContentType === 'Community' || (n.text || '').toLowerCase().includes('community');
                    const isShare = n.type?.includes('share') || (n.text || '').toLowerCase().includes('shared');
                    const vTitle = n.videoTitle || n.mediaTitle;
                    const vId = n.videoId || n.relatedContentId;
                    const vUrl = n.videoUrl || n.sourceUrl;
                    
                    let targetUrl = n.targetUrl || n.actionLink || n.linkUrl;
                    if (!targetUrl) {
                        if (isCommunity) {
                            targetUrl = n.communityId ? `/community/view?id=${n.communityId}` : '/community';
                        } else if (isVideo) {
                            const params = new URLSearchParams();
                            if (vId) params.set('id', vId);
                            if (vTitle) params.set('title', vTitle);
                            if (vUrl) params.set('url', vUrl);
                            targetUrl = `/videos${params.toString() ? `?${params.toString()}` : ''}`;
                        } else if (isPodcast) {
                            targetUrl = n.relatedContentId ? `/podcasts?id=${n.relatedContentId}` : '/podcasts';
                        } else if (isArticle) {
                            targetUrl = n.relatedContentId ? `/article-view?id=${n.relatedContentId}` : '/articles';
                        } else {
                            targetUrl = n.relatedContentId ? `/posts?id=${n.relatedContentId}` : '/posts';
                        }
                    }

                    const dateVal = n.createdDate || n.createdAt || n.timestamp || n.date;
                    const dateFormatted = formatNotificationDate(dateVal);
                    const parsed = parseNotificationContent({ senderName: n.senderName || 'Teammate', message: n.text || n.message });

                    let icon = 'notifications';
                    let color = 'text-slate-400';
                    let bg = 'bg-slate-500/10';
                    if (isVideo) {
                        icon = 'videocam';
                        color = 'text-rose-500';
                        bg = 'bg-rose-500/10';
                    } else if (isPodcast) {
                        icon = 'podcasts';
                        color = 'text-pink-500';
                        bg = 'bg-pink-500/10';
                    } else if (isArticle) {
                        icon = 'article';
                        color = 'text-emerald-500';
                        bg = 'bg-emerald-500/10';
                    } else if (isCommunity) {
                        icon = 'groups';
                        color = 'text-indigo-400';
                        bg = 'bg-indigo-500/10';
                    } else if (isPost) {
                        icon = 'chat';
                        color = 'text-blue-500';
                        bg = 'bg-blue-500/10';
                    } else if (isShare) {
                        icon = 'share';
                        color = 'text-emerald-500';
                        bg = 'bg-emerald-500/10';
                    }

                    return {
                        id: n.id,
                        type: n.type || 'notification',
                        category: n.category || (isCommunity ? 'Community' : (isShare ? 'Shares' : (isVideo ? 'Social' : 'System'))),
                        icon,
                        color,
                        bg,
                        text: n.text || n.message,
                        message: n.text || n.message,
                        parsedSender: parsed.sender,
                        parsedAction: parsed.action,
                        senderName: n.senderName || 'Teammate',
                        senderAvatar: n.senderAvatar || null,
                        senderUserId: n.senderUserId,
                        time: dateFormatted,
                        displayDate: dateFormatted,
                        createdDate: dateVal,
                        unread: n.unread !== false,
                        isLocalNotif: true,
                        targetUrl,
                        relatedContentType: isVideo ? 'Video' : (isPodcast ? 'Podcast' : (isArticle ? 'Article' : (isCommunity ? 'Community' : (isPost ? 'Post' : n.relatedContentType)))),
                        relatedContentId: n.relatedContentId || n.videoId,
                        videoId: n.videoId,
                        videoTitle: vTitle,
                        videoUrl: vUrl,
                    };
                });
        } catch (e) {
            return [];
        }
    };

    const sortNotifsDescending = (notifs) => {
        return [...notifs].sort((a, b) => {
            const dateA = new Date(a.createdDate || a.createdAt || a.timestamp || 0).getTime();
            const dateB = new Date(b.createdDate || b.createdAt || b.timestamp || 0).getTime();
            
            if (dateA && dateB && dateA !== dateB) {
                return dateB - dateA; // Newest first
            }

            if (a.unread && !b.unread) return -1;
            if (!a.unread && b.unread) return 1;

            const idA = Number(a.id) || 0;
            const idB = Number(b.id) || 0;
            return idB - idA;
        });
    };

    const fetchNotifications = async () => {
        try {
            const res = await notificationsApi.getAll(false);
            let apiNotifs = [];
            if (Array.isArray(res)) {
                apiNotifs = res.map(mapNotificationItem);
            } else if (Array.isArray(res?.data)) {
                apiNotifs = res.data.map(mapNotificationItem);
            } else if (res?.items && Array.isArray(res.items)) {
                apiNotifs = res.items.map(mapNotificationItem);
            }
            // Merge local community invite notifications + local video/generic notifications
            const localCommunityNotifs = getLocalCommunityNotifs();
            const localGenericNotifs = getLocalGenericNotifs();
            const apiIds = new Set(apiNotifs.map(n => String(n.id)));
            const freshCommunity = localCommunityNotifs.filter(n => !apiIds.has(String(n.id)));
            const freshGeneric = localGenericNotifs.filter(n => !apiIds.has(String(n.id)) && !freshCommunity.some(c => String(c.id) === String(n.id)));
            const combined = [...freshCommunity, ...freshGeneric, ...apiNotifs];
            setAllNotifs(sortNotifsDescending(combined));
        } catch (error) {
            // Fallback: show all local notifs sorted newest first without polluting console
            setAllNotifs(sortNotifsDescending([...getLocalCommunityNotifs(), ...getLocalGenericNotifs()]));
        }
    };

    useEffect(() => {
        fetchNotifications();

        // Listen for real-time community invite events (fired by CreateCommunityModal)
        const handleCommunityInviteSent = (e) => {
            const { invitedUserIds = [], communityName, senderName, senderUserId } = e.detail || {};
            if (isSelfNotification({ senderUserId, senderName }, currentUser)) return;
            if (!invitedUserIds.includes(currentUser?.id) && !invitedUserIds.includes(currentUser?.userId)) return;

            // Re-read localStorage to pick up the new notif
            const localNotifs = getLocalCommunityNotifs();
            const newNotif = localNotifs.find(n => n.communityName === communityName && n.unread);
            if (newNotif) {
                newNotif.createdDate = newNotif.createdDate || new Date().toISOString();
                newNotif.createdAt = newNotif.createdAt || new Date().toISOString();
                newNotif.unread = true;
                newNotif.time = formatNotificationDate(newNotif.createdDate);
                newNotif.displayDate = newNotif.time;
                setAllNotifs(prev => {
                    const filtered = prev.filter(n => String(n.id) !== String(newNotif.id));
                    return [newNotif, ...filtered];
                });
                if (isNotificationAllowed(newNotif, notifPreferencesRef.current)) {
                    setToastNotification(newNotif);
                    playChimeSound();
                }
            }
        };

        // Also listen for storage changes (multi-tab invite, share, or backend update)
        const handleStorageChange = () => {
            fetchNotifications();
            const localCommunityNotifs = getLocalCommunityNotifs();
            const localGenericNotifs = getLocalGenericNotifs();
            const allLocal = [...localCommunityNotifs, ...localGenericNotifs];
            if (allLocal.length > 0) {
                setAllNotifs(prev => {
                    const prevLocalIds = new Set(prev.filter(n => n.isLocalNotif).map(n => String(n.id)));
                    const newOnes = allLocal.filter(n => !prevLocalIds.has(String(n.id)) && !isSelfNotification(n, currentUser) && isNotificationForUser(n, currentUser));
                    if (newOnes.length === 0) return prev;
                    // Show toast for brand-new notification
                    if (newOnes[0].unread && isNotificationAllowed(newOnes[0], notifPreferencesRef.current)) {
                        setToastNotification(newOnes[0]);
                        playChimeSound();
                    }
                    return sortNotifsDescending([...newOnes, ...prev.filter(n => !n.isLocalNotif)]);
                });
            }
        };

        // Listen for real-time generic notifications (e.g. profile shares)
        const handleGenericNotificationReceived = (e) => {
            const notif = e.detail;
            if (!notif) return;
            if (isSelfNotification(notif, currentUser)) {
                return; // Notification initiated by self, skip
            }
            if (!isNotificationForUser(notif, currentUser)) {
                return; // Notification meant for another user
            }
            notif.createdDate = notif.createdDate || new Date().toISOString();
            notif.createdAt = notif.createdAt || new Date().toISOString();
            notif.unread = true;
            notif.time = formatNotificationDate(notif.createdDate);
            notif.displayDate = notif.time;
            setAllNotifs(prev => [notif, ...prev.filter(n => String(n.id) !== String(notif.id))]);
            if (isNotificationAllowed(notif, notifPreferencesRef.current)) {
                setToastNotification(notif);
                playChimeSound();
            }
        };

        window.addEventListener('community-invite-sent', handleCommunityInviteSent);
        window.addEventListener('knome_notification_received', handleGenericNotificationReceived);
        window.addEventListener('notification-updated', handleStorageChange);
        window.addEventListener('knome_new_notification', handleStorageChange);
        window.addEventListener('storage', handleStorageChange);

        const token = localStorage.getItem('knome_jwt');
        const isLoggingOut = typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true';
        if (!token || !currentUser || isLoggingOut) return;

        const protocol = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'https:' : 'http:';
        const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
        const hubUrl = getHubUrl ? getHubUrl() : `${protocol}//${host}:5096/hubs/notifications`;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, {
                accessTokenFactory: () => localStorage.getItem('knome_jwt') || '',
                transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
            })
            .configureLogging(signalR.LogLevel.None)
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .build();

        let isStopped = false;
        const stopConnection = () => {
            isStopped = true;
            try {
                connection.stop().catch(() => {});
            } catch {}
        };

        const handleLogoutEvent = () => {
            stopConnection();
        };
        window.addEventListener('knome:logout', handleLogoutEvent);

        connection.on("ReceiveNotification", (notification) => {
            if (isSelfNotification(notification, currentUser)) {
                return; // Ignore self-triggered notification
            }
            const mapped = mapNotificationItem(notification);
            mapped.createdDate = new Date().toISOString();
            mapped.createdAt = new Date().toISOString();
            mapped.time = formatNotificationDate(mapped.createdDate);
            mapped.displayDate = mapped.time;
            mapped.unread = true;
            setAllNotifs(prev => {
                const filtered = prev.filter(item => String(item.id) !== String(mapped.id));
                return [mapped, ...filtered];
            });
            if (isNotificationAllowed(mapped, notifPreferencesRef.current)) {
                setToastNotification(mapped);
                playChimeSound();
            }
            window.dispatchEvent(new CustomEvent('network-updated'));
        });

        connection.on("ReactionCountUpdated", (data) => {
            window.dispatchEvent(new CustomEvent('knome:reaction-updated', { detail: data }));
        });

        connection.on("CommentCountUpdated", (data) => {
            window.dispatchEvent(new CustomEvent('knome:comment-updated', { detail: data }));
        });

        connection.on("ShareCountUpdated", (data) => {
            window.dispatchEvent(new CustomEvent('knome:share-updated', { detail: data }));
        });

        const joinGroup = () => {
            const currentUid = currentUser?.userId || currentUser?.id;
            if (currentUid && connection.state === signalR.HubConnectionState.Connected) {
                connection.invoke("JoinUserGroup", Number(currentUid)).catch(() => {});
            }
        };

        connection.start().then(() => {
            if (isStopped) {
                stopConnection();
                return;
            }
            joinGroup();
        }).catch(() => {
            /* Silently ignore startup/re-negotiation traces */
        });

        connection.onreconnected(() => {
            if (!isStopped) {
                fetchNotifications();
                joinGroup();
            }
        });

        // Periodic polling backup every 15 seconds to ensure notifications are never missed
        const notifInterval = setInterval(() => {
            if (!isStopped && localStorage.getItem('knome_jwt')) {
                fetchNotifications();
            }
        }, 15000);

        const handleWindowFocus = () => {
            if (!isStopped && localStorage.getItem('knome_jwt')) {
                fetchNotifications();
            }
        };
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            clearInterval(notifInterval);
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('community-invite-sent', handleCommunityInviteSent);
            window.removeEventListener('knome_notification_received', handleGenericNotificationReceived);
            window.removeEventListener('notification-updated', handleStorageChange);
            window.removeEventListener('knome_new_notification', handleStorageChange);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('knome:logout', handleLogoutEvent);
            stopConnection();
        };
    }, [currentUser]);

    // Filter notifications based on active user preferences
    const allowedNotifs = useMemo(() => {
        return allNotifs.filter(n => isNotificationAllowed(n, notifPreferences));
    }, [allNotifs, notifPreferences]);

    const notifications = useMemo(() => {
        return allowedNotifs.filter(n => {
            const matchesCategory = activeNotifFilter === 'All' || n.category === activeNotifFilter;
            const matchesQuery = !notifSearchQuery || n.text?.toLowerCase().includes(notifSearchQuery.toLowerCase()) || n.senderName?.toLowerCase().includes(notifSearchQuery.toLowerCase()) || n.message?.toLowerCase().includes(notifSearchQuery.toLowerCase());
            return matchesCategory && matchesQuery;
        });
    }, [allowedNotifs, activeNotifFilter, notifSearchQuery]);

    const groupedNotifications = useMemo(() => {
        const groups = { 'Today': [], 'This Week': [], 'Earlier': [] };
        notifications.forEach(n => {
            const grp = getTimeGroup(n.createdDate || n.createdAt || n.timestamp || n.date);
            if (groups[grp]) {
                groups[grp].push(n);
            } else {
                groups['Earlier'].push(n);
            }
        });
        return groups;
    }, [notifications]);

    const unreadCount = useMemo(() => {
        return allowedNotifs.filter(n => n.unread).length;
    }, [allowedNotifs]);

    const markAllRead = async () => {
        try {
            await notificationsApi.markAllRead().catch(() => {});
            const stored = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const updated = stored.map(n => ({ ...n, unread: false }));
            localStorage.setItem('knome_notifications', JSON.stringify(updated));
            setAllNotifs(prev => prev.map(n => ({ ...n, unread: false, handled: true })));
        } catch (error) {
            console.error("Failed to mark all as read", error);
        }
    };

    const clearAllNotifications = async () => {
        try {
            await notificationsApi.markAllRead().catch(() => {});
            const stored = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const currentUserIdStr = String(currentUser?.id || currentUser?.userId || '');
            const remaining = stored.filter(n => {
                const targetIdStr = String(n.targetUserId || n.userId || '');
                return currentUserIdStr && targetIdStr !== currentUserIdStr;
            });
            localStorage.setItem('knome_notifications', JSON.stringify(remaining));
            setAllNotifs([]);
        } catch (error) {
            setAllNotifs([]);
        }
    };

    const resolveCommunityTarget = (notif) => {
        if (notif.communityId) return `/community/view?id=${notif.communityId}`;
        if (notif.targetUrl && notif.targetUrl.includes('/community/view')) return notif.targetUrl;
        if (notif.linkUrl && notif.linkUrl.includes('/community/view')) return notif.linkUrl;
        if (notif.actionLink && notif.actionLink.includes('/community/view')) return notif.actionLink;

        const txt = notif.text || notif.message || '';
        // Extract community name: look for 'community "Name"' or first quoted text
        const commMatch = txt.match(/community\s+"([^"]+)"/i) || txt.match(/"([^"]+)"/);
        const commName = commMatch ? commMatch[1] : notif.communityName;

        if (commName) {
            const normalizedName = commName.trim().toLowerCase();

            // 1. Check custom communities in localStorage
            try {
                const allCustom = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                const found = allCustom.find(c => (c.name || c.title || '').trim().toLowerCase() === normalizedName);
                if (found) return `/community/view?id=${found.id}`;
            } catch (e) { /* ignore */ }

            // 2. Check user joined communities
            try {
                const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
                const joined = JSON.parse(localStorage.getItem(userKey) || '[]');
                const foundJoined = joined.find(c => (c.name || '').trim().toLowerCase() === normalizedName);
                if (foundJoined) return `/community/view?id=${foundJoined.id}`;
            } catch (e) { /* ignore */ }

            // 3. Known enterprise seed map
            const seedMap = {
                'higher': 101,
                'devops & ai innovation hub': 101,
                'react developer hub': 102,
                'employee engagement hub': 103,
                'tech innovation hub': 1,
                'technology innovation hub': 1,
                'frontend developers guild': 3,
                'database architects': 4,
                'hr & general announcements': 5,
                'culture & hr hub': 6
            };
            const mappedId = seedMap[normalizedName];
            if (mappedId) return `/community/view?id=${mappedId}`;
        }

        return '/community';
    };

    const handleNotificationClick = (notif) => {
        setIsNotifOpen(false);

        if (notif.unread && notif.id) {
            // Mark read in localStorage for local community invite notifs
            if (notif.isLocalNotif) {
                try {
                    const stored = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                    const updated = stored.map(n => String(n.id) === String(notif.id) ? { ...n, unread: false } : n);
                    localStorage.setItem('knome_notifications', JSON.stringify(updated));
                } catch (e) { /* ignore */ }
            } else {
                notificationsApi.markRead(notif.id).catch(err => console.error('Mark read failed:', err));
            }
            setAllNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false, handled: true } : n));
        }

        let dest = notif.targetUrl || notif.linkUrl || notif.actionLink;
        const msg = (notif.text || notif.message || '').toLowerCase();
        const relType = (notif.relatedContentType || '').toLowerCase();
        const refId = notif.relatedContentId || notif.referenceId || notif.videoId;
        // Ensure post notifications are never misinterpreted as profile shares
        const isPostNotif = relType === 'post' || notif.isPost || notif.type?.toLowerCase().includes('post') || (msg.includes('posted') && !msg.includes('podcast'));
        const isProfileShare = !isPostNotif && (relType === 'profile' || notif.type === 'profile_share' || (notif.type === 'share' && relType === 'user'))
            && !msg.includes('video') && !msg.includes('podcast') && notif.type !== 'video_shared' && notif.type !== 'podcast_shared';

        if (isProfileShare) {
            const profUrlMatch = (notif.text || notif.message || '').match(/(?:https?:\/\/[^\s]+)?\/profile\?id=([a-zA-Z0-9_-]+)/i);
            const resolvedUserId = profUrlMatch ? profUrlMatch[1] : (notif.targetProfileUser?.userId || notif.senderUserId || refId || 1);
            const targetUser = notif.targetProfileUser || {
                userId: resolvedUserId,
                id: resolvedUserId,
                name: notif.senderName || 'Employee',
                fullName: notif.senderName || 'Employee',
                avatar: notif.senderAvatar || null
            };
            navigate(resolvedUserId ? `/profile?id=${resolvedUserId}` : '/profile', { state: { user: targetUser } });
            return;
        }

        const isVideoNotif = relType === 'video' || notif.isVideo || notif.type?.includes('video') || (msg.includes('video') && !msg.includes('podcast'));
        const isPodcastNotif = !isVideoNotif && (relType === 'podcast' || notif.isPodcast || notif.type?.includes('podcast') || msg.includes('podcast'));
        const isArticleNotif = !isVideoNotif && !isPodcastNotif && (relType === 'article' || notif.isArticle || notif.type?.includes('article') || msg.includes('article') || msg.includes('blog'));
        const isCommNotif = !isVideoNotif && !isPodcastNotif && !isArticleNotif && !isPostNotif && (notif.isCommunity || relType === 'community' || notif.category === 'Community' || notif.type?.includes('community') || msg.includes('community') || notif.communityId || notif.communityName);

        if (isVideoNotif) {
            let vId = refId || notif.videoId;
            let vTitle = notif.videoTitle || notif.mediaTitle;
            let videoUrl = notif.videoUrl || notif.sourceUrl;
            
            if (!vTitle && !vId) {
                const titleMatch = (notif.text || notif.message || '').match(/"([^"]+)"|'([^']+)'/);
                if (titleMatch) {
                    vTitle = titleMatch[1] || titleMatch[2];
                }
            }

            const searchParams = new URLSearchParams();
            if (vId) searchParams.set('id', vId);
            if (vTitle) searchParams.set('title', vTitle);
            if (videoUrl) searchParams.set('url', videoUrl);

            const queryString = searchParams.toString();
            dest = `/videos${queryString ? `?${queryString}` : ''}`;
            
            navigate(dest, { 
                state: { 
                    videoTitle: vTitle, 
                    videoId: vId, 
                    videoUrl: videoUrl,
                    senderName: notif.senderName 
                } 
            });
            return;
        } else if (isPodcastNotif) {
            dest = refId ? `/podcasts?id=${refId}` : (dest || '/podcasts');
        } else if (isArticleNotif) {
            dest = refId ? `/article-view?id=${refId}` : (dest || '/articles');
        } else if (isPostNotif) {
            dest = refId ? `/posts?id=${refId}` : (dest || '/posts');
        } else if (isCommNotif) {
            dest = resolveCommunityTarget(notif);
        } else if (notif.type === 'message' || notif.type === 'chat' || notif.eventType === 'Message' || relType === 'message' || msg.includes('message') || msg.includes('sent you a message')) {
            const senderId = notif.senderUserId || notif.senderId || refId;
            const senderName = notif.senderName || notif.parsedSender || '';
            dest = senderId ? `/messages?userId=${senderId}&name=${encodeURIComponent(senderName)}` : '/messages';
        } else if (notif.type === 'follow_request' || notif.type?.includes('connection') || msg.includes('connection request') || msg.includes('connection')) {
            dest = msg.includes('accepted') ? '/network?tab=Connections' : '/network?tab=Requests';
        } else if (relType === 'user' || notif.type?.includes('follow')) {
            const uId = refId || notif.senderUserId;
            dest = uId ? `/profile?id=${uId}` : '/profile';
        } else if (!dest) {
            dest = '/posts';
        }

        const currentPath = window.location.pathname + window.location.search;
        if (currentPath === dest) {
            window.location.reload();
        } else {
            navigate(dest);
        }
    };

    const handleDeleteNotification = async (e, notifId) => {
        e.stopPropagation();
        // Remove from localStorage if it's a local community invite notif
        try {
            const stored = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const updated = stored.filter(n => String(n.id) !== String(notifId));
            localStorage.setItem('knome_notifications', JSON.stringify(updated));
        } catch (err) { /* ignore */ }
        setAllNotifs(prev => prev.filter(n => n.id !== notifId));
        try {
            await notificationsApi.delete(notifId);
        } catch (err) {
            // Local notif — backend 404 is expected, silently ignore
        }
    };

    const handleApproveFollowRequest = async (e, notifId, approve) => {
        e.stopPropagation();
        const targetNotif = allNotifs.find(n => n.id === notifId);
        if (!targetNotif) return;

        const targetId = targetNotif.senderUserId || targetNotif.relatedContentId || targetNotif.id;

        // Optimistic UI state update
        setAllNotifs(prev => prev.map(n => {
            if (n.id === notifId) {
                return {
                    ...n,
                    unread: false,
                    handled: true,
                    status: approve ? 'approved' : 'declined',
                    text: approve ? `You accepted connection request from ${n.senderName || 'user'}.` : `You declined connection request from ${n.senderName || 'user'}.`
                };
            }
            return n;
        }));

        try {
            if (approve) {
                await profileApi.acceptConnection(targetId);
            } else {
                await profileApi.rejectConnection(targetId);
            }
            window.dispatchEvent(new CustomEvent('network-updated'));
        } catch (error) {
            console.error("Failed to update connection request", error);
        }
    };

    const handleApproveRequest = () => {};
    const handleFollowBack = (e, notif) => {
        e.stopPropagation();
        if (notif.senderUserId) {
            profileApi.follow(notif.senderUserId).catch(err => console.error("Failed to follow back", err));
        }
    };

    // Apply theme on mount and when isDark changes
    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(prev => !prev);

    return (
        <>
        {/* TopNavBar */}
        <nav className="fixed top-0 left-0 right-0 w-full z-50 transition-colors duration-300">
            <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 h-[72px] flex items-center justify-between gap-3 lg:gap-5 w-full">
                
                {/* ─── LEFT: Logo & Navigation ─── */}
                <div className="flex items-center gap-3 sm:gap-5 justify-start shrink-0">
                    {/* Mobile Hamburger Menu Toggle Button */}
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('knome_toggle_mobile_sidebar'))}
                        className="md:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 transition-all flex items-center justify-center shrink-0 shadow-xs cursor-pointer active:scale-95"
                        title="Toggle Navigation Menu"
                        aria-label="Toggle Navigation Menu"
                    >
                        <span className="material-symbols-outlined text-[24px]">menu</span>
                    </button>

                    <Link to="/" className="flex items-center gap-2 sm:gap-3 transition-all duration-200 hover:scale-[1.02] shrink-0 group">
                        <div className="flex flex-col justify-center">
                            <img 
                                src={knomeLogo} 
                                alt="KNOME" 
                                className="h-9 sm:h-10 md:h-11 w-auto max-w-[200px] sm:max-w-[280px] object-contain block dark:hidden drop-shadow-xs group-hover:scale-105 transition-transform duration-300" 
                            />
                            <img 
                                src={knomeLogoDark} 
                                alt="KNOME" 
                                className="h-9 sm:h-10 md:h-11 w-auto max-w-[200px] sm:max-w-[280px] object-contain hidden dark:block drop-shadow-xs group-hover:scale-105 transition-transform duration-300" 
                            />
                            <span className="hidden xl:inline-block text-[10px] md:text-[10.5px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-none tracking-tight pl-0.5 whitespace-nowrap">
                                Knowledge Sharing, Group & Technical Post
                            </span>
                        </div>
                    </Link>
                </div>

                {/* ─── CENTER: Smart Search & Discovery (Dynamic Flex Width - Never Collides or Overlaps) ─── */}
                <div className="hidden lg:flex items-center justify-center flex-1 min-w-0 max-w-[460px] xl:max-w-[520px] mx-2">
                    <div className="relative w-full min-w-0 z-50" ref={searchDropdownRef}>
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none transition-colors"
                            style={{color: 'var(--text-muted)'}}>search</span>
                        <input
                            type="text"
                            placeholder="Search posts, people, articles, videos, communities..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                            onKeyDown={handleKeyDown}
                            className="w-full pl-10 pr-[76px] sm:pr-[82px] py-2 text-[13px] sm:text-[13.5px] font-medium rounded-full outline-none transition-all focus:ring-2 focus:ring-blue-500/25 placeholder:text-slate-500 dark:placeholder:text-slate-400"
                            style={{
                                background: isDark ? 'rgba(14, 26, 56, 0.7)' : 'rgba(239, 246, 255, 0.85)',
                                border: '1px solid var(--border-mid)',
                                color: 'var(--text-primary)',
                                backdropFilter: 'blur(12px)',
                            }}
                        />

                        {/* Right-side controls: Clear (close) button + Icon-only Search button */}
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 shrink-0">
                            {searchQuery && (
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); setSearchQuery(''); }}
                                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-center cursor-pointer shrink-0"
                                    title="Clear search"
                                >
                                    <span className="material-symbols-outlined text-[15px] block">close</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSearch(searchQuery);
                                }}
                                onClick={() => handleSearch(searchQuery)}
                                className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white transition-all shadow-xs hover:shadow-md hover:brightness-110 active:scale-95 cursor-pointer select-none shrink-0"
                                style={{
                                    background: 'linear-gradient(135deg, var(--accent-primary, #2563eb), var(--accent-deep, #4f46e5))',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                                }}
                                title="Search & Discover"
                            >
                                <span className="material-symbols-outlined text-[16px] leading-none">search</span>
                            </button>
                        </div>

                        {/* Search Overlay Dropdown (Universal Enterprise Search & Discovery) */}
                        {showSuggestions && (
                            <div className="absolute top-12 left-0 w-full rounded-2xl overflow-hidden shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                                style={{
                                    background: isDark ? 'rgba(8, 15, 32, 0.98)' : 'rgba(255,255,255,0.98)',
                                    border: '1px solid var(--border-mid)',
                                    backdropFilter: 'blur(24px)',
                                    boxShadow: 'var(--shadow-premium)'
                                }}>
                                
                                {/* Discover by Category Bar */}
                                <div className="px-3 pt-1 pb-2 border-b" style={{ borderColor: 'var(--border-mid)' }}>
                                    <div className="flex items-center justify-between mb-1.5 px-0.5">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[13px] text-indigo-500">explore</span>
                                            Discover by Category
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                                        {DISCOVER_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setShowSuggestions(false);
                                                    if (searchQuery.trim()) {
                                                        handleSearch(searchQuery, cat.id);
                                                    } else {
                                                        navigate(cat.id === 'All' ? '/search' : `/search?type=${cat.id}`);
                                                    }
                                                }}
                                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 flex items-center gap-1.5 transition-all bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer select-none"
                                            >
                                                <span className="material-symbols-outlined text-[13px]">{cat.icon}</span>
                                                <span>{cat.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Mode A: Real-time Suggestions while typing */}
                                {searchQuery.trim() !== '' ? (
                                    isSearchingSuggestions ? (
                                        <div className="px-4 py-6 text-center text-slate-400 flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"></div>
                                            <span className="text-[12px] font-medium">Searching across Knome...</span>
                                        </div>
                                    ) : suggestions.length > 0 ? (
                                        <div className="flex flex-col">
                                            <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
                                                <div className="px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                                    Top Matches
                                                </div>
                                                {suggestions.map((item, idx) => {
                                                    const resolvedThumb = resolveMediaUrl(item.thumbnailUrl);
                                                    const isHighlighted = idx === selectedIndex;
                                                    return (
                                                        <button
                                                            key={`${item.contentType}-${item.id}-${idx}`}
                                                            onMouseDown={() => {
                                                                setShowSuggestions(false);
                                                                setSearchQuery('');
                                                                if (item.contentType === 'User' || item.type === 'User') {
                                                                    navigate('/profile', { 
                                                                        state: { 
                                                                            user: { 
                                                                                userId: item.id, 
                                                                                id: item.id, 
                                                                                name: item.title, 
                                                                                fullName: item.title, 
                                                                                profilePhotoUrl: item.thumbnailUrl, 
                                                                                avatar: item.thumbnailUrl 
                                                                            } 
                                                                        } 
                                                                    });
                                                                } else if (item.contentType === 'Article') {
                                                                    navigate(`/article-view?id=${item.id}`);
                                                                } else if (item.contentType === 'Community') {
                                                                    navigate(`/community/view?id=${item.id}`);
                                                                } else {
                                                                    handleSearch(item.title);
                                                                }
                                                            }}
                                                            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${isHighlighted ? 'bg-blue-500/15' : 'hover:bg-blue-500/10'}`}
                                                        >
                                                            {resolvedThumb ? (
                                                                <img src={resolvedThumb} alt={item.title} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-800" />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0">
                                                                    {item.contentType === 'User' ? '👤' : item.contentType === 'Community' ? '👥' : item.contentType === 'Video' ? '🎥' : '📄'}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[13px] font-bold truncate leading-tight" style={{color: 'var(--text-primary)'}}>
                                                                    <HighlightText text={item.title} query={searchQuery} />
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 truncate">
                                                                    <HighlightText text={item.subtitle} query={searchQuery} />
                                                                </p>
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                                {item.contentType}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="p-2 border-t" style={{ borderColor: 'var(--border-mid)' }}>
                                                <button
                                                    onMouseDown={() => handleSearch(searchQuery)}
                                                    className="w-full py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                                >
                                                    <span>Search all categories for &ldquo;{searchQuery}&rdquo;</span>
                                                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-6 text-center text-[13px] text-slate-500">
                                            No instant preview for &ldquo;{searchQuery}&rdquo;.
                                            <button
                                                onMouseDown={() => handleSearch(searchQuery)}
                                                className="block mx-auto mt-2 text-xs font-bold text-blue-500 hover:underline cursor-pointer"
                                            >
                                                Search all categories for &ldquo;{searchQuery}&rdquo; &rarr;
                                            </button>
                                        </div>
                                    )
                                ) : (
                                    /* Mode B: Recent Searches & Trending Topics when empty/focused */
                                    <div className="flex flex-col gap-3 py-1">
                                        {/* Recent Searches */}
                                        {recentSearches.length > 0 && (
                                            <div>
                                                <div className="px-4 py-1 flex items-center justify-between">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[13px]">history</span>
                                                        Recent Searches ({Math.min(recentSearches.length, 10)})
                                                    </span>
                                                    <button 
                                                        onMouseDown={(e) => handleClearHistory(e, null)}
                                                        className="text-[10px] font-bold text-blue-500 hover:underline cursor-pointer"
                                                    >
                                                        Clear All
                                                    </button>
                                                </div>
                                                {recentSearches.slice(0, 8).map((rec, idx) => (
                                                    <div 
                                                        key={`rec-${idx}`}
                                                        onMouseDown={() => handleSearch(rec.searchTerm)}
                                                        className="px-4 py-2 flex items-center justify-between hover:bg-blue-500/10 cursor-pointer transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <span className="material-symbols-outlined text-[16px] text-slate-400">history</span>
                                                            <span className="text-[13px] font-semibold" style={{color: 'var(--text-primary)'}}>{rec.searchTerm}</span>
                                                        </div>
                                                        <button 
                                                            onMouseDown={(e) => handleClearHistory(e, rec.searchTerm)}
                                                            className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                                                            title="Remove search"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Trending Topics / Searches */}
                                        {trendingSearches.length > 0 && (
                                            <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border-mid)' }}>
                                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[13px] text-amber-500">trending_up</span>
                                                    Trending on Knome
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {trendingSearches.map((trend, idx) => {
                                                        const term = typeof trend === 'string' ? trend : (trend.searchTerm || trend.title || '');
                                                        if (!term) return null;
                                                        return (
                                                            <button
                                                                key={`trend-${idx}`}
                                                                type="button"
                                                                onMouseDown={() => handleSearch(term)}
                                                                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-1 cursor-pointer transition-all"
                                                            >
                                                                <span className="text-slate-400 font-bold text-[11px]">#</span>
                                                                <span>{term}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── RIGHT: Actions & Profile ─── */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 justify-end ml-auto">

                    {/* Karma Badge (Visible for HR Admin, Community Admin, and all members; System Admin is exempt) */}
                    {currentUser && !isSysAdmin && (
                        <Link to="/karma-history" className="relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full transition-all hover:scale-105 group cursor-pointer shrink-0"
                            style={{
                                background: isDark 
                                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.1))' 
                                    : 'linear-gradient(135deg, rgba(254, 243, 199, 0.9), rgba(253, 230, 138, 0.6))',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)'
                            }}
                            title={`${userKarma.toLocaleString()} Karma Points`}>
                            <span className="material-symbols-outlined text-amber-500 text-[16px] transition-transform group-hover:scale-110 shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>military_tech</span>
                            <span className="text-[12px] font-black text-amber-600 dark:text-amber-400 tracking-tight whitespace-nowrap">{userKarma.toLocaleString()}</span>
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700/70 dark:text-amber-300/70 whitespace-nowrap">pts</span>
                        </Link>
                    )}

                    {/* ─── Role & Platform FAQ Guide Button ─── */}
                    <button
                        onClick={() => setIsFaqModalOpen(true)}
                        title="Knome Role & Platform FAQs (How to use Knome properly)"
                        className="relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer group shrink-0"
                        style={{
                            background: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                            border: '1px solid var(--border-mid)',
                            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <span className="material-symbols-outlined text-[18px] text-indigo-600 dark:text-indigo-400 group-hover:rotate-12 transition-transform shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>
                            help
                        </span>
                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            FAQ
                        </span>
                    </button>

                    {/* ─── Theme Toggle ─── */}
                    <button
                        onClick={toggleTheme}
                        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 group cursor-pointer shrink-0"
                        style={{
                            background: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                            border: '1px solid var(--border-mid)',
                            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <span className="material-symbols-outlined text-[18px] transition-all duration-300 group-hover:rotate-12 shrink-0"
                            style={{
                                color: isDark ? '#fbbf24' : '#4f46e5',
                                fontVariationSettings: "'FILL' 1"
                            }}>
                            {isDark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>


                    {/* Notifications */}
                    <div className="relative shrink-0" ref={notifDropdownRef}>
                        <button
                            onClick={() => {
                                const nextState = !isNotifOpen;
                                setIsNotifOpen(nextState);
                                if (nextState) fetchNotifications();
                            }}
                            className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                            style={{
                                background: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                                border: '1px solid var(--border-mid)',
                                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
                            }}
                        >
                            <span className="material-symbols-outlined text-[19px] text-theme-30-text shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>notifications</span>
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 rounded-full flex items-center justify-center text-[9px] font-black text-white px-1.5 animate-pulse shadow-md select-none pointer-events-none"
                                    style={{
                                        background: 'linear-gradient(135deg, #f43f5e, #fb923c)',
                                        minWidth: '18px', height: '18px',
                                        boxShadow: '0 0 12px rgba(244,63,94,0.75)'
                                    }}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Instagram-Style Notification Dropdown */}
                        {isNotifOpen && (
                            <div className="absolute right-0 top-12 w-96 rounded-2xl overflow-hidden shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                    background: isDark ? 'rgba(8, 15, 32, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                                    border: '1px solid var(--border-mid)',
                                    backdropFilter: 'blur(24px)',
                                    boxShadow: isDark ? '0 24px 80px rgba(0,0,0,0.85)' : '0 24px 80px rgba(37,99,235,0.12), 0 4px 24px rgba(0,0,0,0.08)'
                                }}>
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor: 'var(--border-mid)'}}>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Notifications</span>
                                        {unreadCount > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-500 dark:bg-blue-400/20 dark:text-blue-300">
                                                {unreadCount} new
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        {allowedNotifs.length > 0 && (
                                            <button onClick={markAllRead} className="text-[11px] font-bold text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors cursor-pointer">Mark read</button>
                                        )}
                                        <button onClick={() => { setIsNotifSettingsOpen(true); setIsNotifOpen(false); }} title="Notification Settings" className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors ml-1 cursor-pointer">
                                            <span className="material-symbols-outlined text-[17px]">settings</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Category Filters */}
                                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto custom-scrollbar">
                                    {['All', 'Shares', 'Reactions', 'Comments', 'Connections', 'Community', 'Mentions'].map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setActiveNotifFilter(cat)}
                                            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                                                activeNotifFilter === cat 
                                                    ? 'bg-blue-600 text-white shadow-xs' 
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Live Notification Search */}
                                <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">search</span>
                                        <input
                                            type="text"
                                            value={notifSearchQuery}
                                            onChange={(e) => setNotifSearchQuery(e.target.value)}
                                            placeholder="Search notifications..."
                                            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* Instagram-Style Grouped Notifications List */}
                                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                                    {['Today', 'This Week', 'Earlier'].map((groupKey) => {
                                        const items = groupedNotifications[groupKey] || [];
                                        if (items.length === 0) return null;

                                        return (
                                            <div key={groupKey} className="border-b last:border-b-0 border-slate-100/60 dark:border-slate-800/40">
                                                {/* Section Header */}
                                                <div className="sticky top-0 z-10 px-4 py-1.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-between border-y border-slate-100 dark:border-slate-800/80">
                                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">{groupKey}</span>
                                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{items.length}</span>
                                                </div>

                                                {/* Section Cards */}
                                                <div className="divide-y divide-slate-100/60 dark:divide-slate-800/30">
                                                    {items.map((n, idx) => (
                                                        <div 
                                                            key={n.id ? `${n.id}-${idx}` : idx} 
                                                            onClick={() => handleNotificationClick(n)}
                                                            className={`group relative flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${n.unread ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                                                        >
                                                            {/* Instagram-Style Avatar with Badge */}
                                                            <div className="relative shrink-0 mt-0.5">
                                                                {n.senderAvatar ? (
                                                                    <img 
                                                                        src={n.senderAvatar} 
                                                                        alt={n.senderName} 
                                                                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
                                                                        onError={(e) => {
                                                                            e.currentTarget.onerror = null;
                                                                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(n.senderName || 'User')}&background=6366f1&color=fff`;
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${n.bg} border border-slate-200/50 dark:border-slate-700/50 shadow-xs`}>
                                                                        <span className={`material-symbols-outlined text-[19px] ${n.color}`} style={{fontVariationSettings:"'FILL' 1"}}>{n.icon}</span>
                                                                    </div>
                                                                )}
                                                                {/* Mini badge icon at bottom right of avatar */}
                                                                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 shadow-xs border border-slate-200 dark:border-slate-700`}>
                                                                    <span className={`material-symbols-outlined text-[10px] ${n.color}`} style={{fontVariationSettings:"'FILL' 1"}}>{n.icon}</span>
                                                                </div>
                                                            </div>

                                                            {/* Instagram-Style Notification Text */}
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[12.5px] leading-snug text-slate-800 dark:text-slate-200">
                                                                    <span className="font-bold text-slate-900 dark:text-white mr-1">
                                                                        <HighlightText text={n.parsedSender || n.senderName || n.title || 'Colleague'} query={notifSearchQuery} />
                                                                    </span>
                                                                    <span className="text-slate-600 dark:text-slate-300">
                                                                        <HighlightText text={n.parsedAction || n.text || n.message} query={notifSearchQuery} />
                                                                    </span>
                                                                </p>

                                                                {/* Date in standard DD-MM-YYYY format */}
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                                        {n.time || n.displayDate}
                                                                    </span>
                                                                    {n.category && n.category !== 'System' && (
                                                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                                                            {n.category}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Inline Action Buttons for Follow Requests */}
                                                                {n.type === 'follow_request' && !n.handled && (
                                                                    <div className="flex items-center gap-2 mt-2">
                                                                        <button 
                                                                            onClick={(e) => handleApproveFollowRequest(e, n.id, true)}
                                                                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                                                                        >
                                                                            Accept
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => handleApproveFollowRequest(e, n.id, false)}
                                                                            className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                                                                        >
                                                                            Decline
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {/* Follow Back Button */}
                                                                {n.type === 'follow_request' && n.handled && n.status === 'approved' && !n.followedBack && (
                                                                    <div className="mt-2">
                                                                        <button 
                                                                            onClick={(e) => handleFollowBack(e, n)}
                                                                            className="px-3 py-1 bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 border border-pink-500/20 rounded-lg text-[11px] font-bold transition-colors shadow-xs cursor-pointer"
                                                                        >
                                                                            Follow Back
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {/* Inline Action Button for Shared Content or Invitations */}
                                                                {(() => {
                                                                    const textLower = (n.text || n.message || '').toLowerCase();
                                                                    const relType = (n.relatedContentType || '').toLowerCase();
                                                                    const isVid = n.isVideo || relType === 'video' || n.type === 'video_share' || n.type === 'video_shared' || (textLower.includes('video') && !textLower.includes('podcast'));
                                                                    const isPod = !isVid && (n.isPodcast || relType === 'podcast' || n.type === 'podcast_share' || n.type === 'podcast_shared' || textLower.includes('podcast'));
                                                                    const isArt = !isVid && !isPod && (n.isArticle || relType === 'article' || n.type === 'article_share' || n.type === 'article_shared' || textLower.includes('article') || textLower.includes('blog'));
                                                                    const isPost = !isVid && !isPod && !isArt && (n.isPost || relType === 'post' || n.type === 'post_share' || n.type === 'post_shared' || textLower.includes('post'));
                                                                    const isComm = !isVid && !isPod && !isArt && (n.isCommunity || relType === 'community' || n.type === 'invite' || n.type === 'community_invite' || n.type === 'community_shared' || textLower.includes('community'));

                                                                    if (isVid) {
                                                                        return (
                                                                            <div className="mt-2">
                                                                                <button 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleNotificationClick(n);
                                                                                    }}
                                                                                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">videocam</span>
                                                                                    Watch Video
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    if (isPod) {
                                                                        return (
                                                                            <div className="mt-2">
                                                                                <button 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleNotificationClick(n);
                                                                                    }}
                                                                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">podcasts</span>
                                                                                    Listen Podcast
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    if (isArt) {
                                                                        return (
                                                                            <div className="mt-2">
                                                                                <button 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleNotificationClick(n);
                                                                                    }}
                                                                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">article</span>
                                                                                    Read Article
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    if (isPost) {
                                                                        return (
                                                                            <div className="mt-2">
                                                                                <button 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleNotificationClick(n);
                                                                                    }}
                                                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">chat</span>
                                                                                    View Post
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    if (isComm) {
                                                                        return (
                                                                            <div className="mt-2">
                                                                                <button 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleNotificationClick(n);
                                                                                    }}
                                                                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">groups</span>
                                                                                    View Community
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>

                                                            {/* Right actions: Unread indicator & Hover delete */}
                                                            <div className="flex items-center gap-1 shrink-0 self-center">
                                                                {n.unread && <div className="w-2 h-2 rounded-full bg-blue-500 mr-1 shadow-xs"></div>}
                                                                <button 
                                                                    onClick={(e) => handleDeleteNotification(e, n.id)} 
                                                                    title="Delete notification"
                                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all rounded-lg cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {notifications.length === 0 && (
                                        <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                                                <span className="material-symbols-outlined text-[24px]">notifications_paused</span>
                                            </div>
                                            <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">No Notifications</p>
                                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium max-w-xs">
                                                Only real & current notifications for your account will appear here.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User Avatar & Menu */}
                    <div className="relative shrink-0" ref={userMenuDropdownRef}>
                        <button
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 rounded-full transition-all hover:scale-105 cursor-pointer select-none shrink-0"
                            style={{
                                background: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(241, 245, 249, 0.9)',
                                border: '1px solid var(--border-mid)',
                                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)'
                            }}
                        >
                            <div className="relative p-[1.5px] rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shrink-0">
                                <img 
                                    className="w-7 h-7 rounded-full object-cover shadow-xs" 
                                    alt="Avatar" 
                                    src={resolveMediaUrl(currentUser?.profilePhotoUrl) || currentUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.fullName || 'User')}&background=6366f1&color=fff`}
                                    onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.fullName || 'User')}&background=6366f1&color=fff`;
                                    }}
                                />
                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${userStatusConfig.dotClass}`} title={`Status: ${userStatusConfig.label}`}></div>
                            </div>
                            <div className="hidden sm:flex flex-col items-start text-left min-w-0">
                                <span className="text-[12.5px] sm:text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight max-w-[85px] md:max-w-[110px] xl:max-w-[140px]" title={currentUser?.fullName || currentUser?.name || 'User'}>
                                    {currentUser?.fullName || currentUser?.name || 'User'}
                                </span>
                                <span className="text-[9.5px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-none truncate max-w-[85px] md:max-w-[110px] xl:max-w-[140px]">{currentUser?.roleName || currentUser?.role || 'Employee'}</span>
                            </div>
                            <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">expand_more</span>
                        </button>

                        {isUserMenuOpen && (
                            <div className="absolute right-0 top-12 w-64 rounded-2xl overflow-hidden shadow-2xl z-50"
                                style={{
                                    background: isDark ? 'rgba(8, 15, 32, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                                    border: '1px solid var(--border-mid)',
                                    backdropFilter: 'blur(24px)',
                                    boxShadow: isDark ? '0 24px 80px rgba(0,0,0,0.8)' : '0 24px 80px rgba(37,99,235,0.12), 0 4px 24px rgba(0,0,0,0.08)'
                                }}>
                                <div className="px-4 py-3.5 border-b" style={{borderColor: 'var(--border-mid)'}}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{currentUser?.name || currentUser?.fullName || 'User'}</p>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none shrink-0 ${userStatusConfig.badgeClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${userStatusConfig.dotClass}`}></span>
                                            {userStatusConfig.label}
                                        </span>
                                    </div>
                                    <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{currentUser?.roleName || currentUser?.role || 'Employee'}</p>
                                </div>
                                <div className="py-1.5">
                                    <div className="border-t px-3 py-2" style={{borderColor: 'var(--border-mid)'}}>
                                        <Link to="/profile" onClick={() => setIsUserMenuOpen(false)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <span className="material-symbols-outlined text-[16px]">person</span> My Profile
                                        </Link>
                                        <button
                                            onClick={async () => {
                                                setIsUserMenuOpen(false);
                                                const ok = await confirm({
                                                    title: 'Confirm Logout',
                                                    message: "Are you sure you want to log out of Knome? You will be redirected to MPO Employee Hub.",
                                                    confirmText: 'Yes, Log Out',
                                                    cancelText: 'Cancel',
                                                    variant: 'danger'
                                                });
                                                if (ok) {
                                                    logout('https://counselling-1.mponline.demo.gov.in:3001/applications');
                                                }
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors mt-0.5 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">logout</span> Log Out
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>

        {isNotifSettingsOpen && <NotificationSettingsModal isOpen={isNotifSettingsOpen} onClose={() => setIsNotifSettingsOpen(false)} />}
        {isFaqModalOpen && <RoleFaqModal isOpen={isFaqModalOpen} onClose={() => setIsFaqModalOpen(false)} />}
        {toastNotification && <NotificationToast notification={toastNotification} onClose={() => setToastNotification(null)} />}
        </>
    );
}
