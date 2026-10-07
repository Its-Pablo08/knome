import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { clipsApi, resolveMediaUrl } from '../utils/apiService';

import CreateClipModal from '../components/modals/CreateClipModal';
import ClipCommentsDrawer from '../components/modals/ClipCommentsDrawer';
import ClipShareModal from '../components/modals/ClipShareModal';
import ReportClipModal from '../components/modals/ReportClipModal';
import EditClipModal from '../components/modals/EditClipModal';

// Seed demo clips matching database clip IDs (1, 2, 3)
const FALLBACK_CLIPS = [
    {
        clipId: 1,
        title: 'Welcome to Knome Clips! 🎬 Experience short-form enterprise video sharing',
        description: 'Introducing vertical short video reels at MPOnline. Share tech updates, quick tips, team milestones, and creative knowledge directly with colleagues.',
        videoUrl: 'https://vjs.zencdn.net/v/oceans.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=600&h=1000',
        durationSeconds: 30,
        hashtags: '#Innovation #MPOnline #Tech #ClipsLaunch',
        visibility: 'Public',
        status: 'Published',
        createdByUserId: 1076,
        creatorName: 'Vishendra Sharma',
        creatorRole: 'Chief Technology Officer',
        creatorDepartment: 'Engineering & Technology',
        creatorAvatar: null,
        createdDate: new Date(Date.now() - 3600000 * 3).toISOString(),
        viewCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: false,
        isMyClip: false
    },
    {
        clipId: 2,
        title: 'Micro-Animations in React 19 & Tailwind CSS ✨',
        description: 'Quick walkthrough on using smooth GPU-accelerated CSS transforms and spring physics to create stunning micro-interactions that wow enterprise users.',
        videoUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=600&h=1000',
        durationSeconds: 15,
        hashtags: '#Frontend #React #Tailwind #UIUX #Design',
        visibility: 'Public',
        status: 'Published',
        createdByUserId: 1,
        creatorName: 'Loveneesh Sharma',
        creatorRole: 'Lead Frontend Architect',
        creatorDepartment: 'Core UI Guild',
        creatorAvatar: null,
        createdDate: new Date(Date.now() - 3600000 * 8).toISOString(),
        viewCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: false,
        isMyClip: false
    },
    {
        clipId: 3,
        title: 'Building Resilient Microservices with ASP.NET Core 10 🚀',
        description: 'How we decoupled critical services using outbox patterns and asynchronous messaging in the MPOnline Enterprise Cloud stack.',
        videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600&h=1000',
        durationSeconds: 15,
        hashtags: '#DotNet #Backend #Architecture #Cloud #Engineering',
        visibility: 'Public',
        status: 'Published',
        createdByUserId: 3,
        creatorName: 'Sourabh Sahu',
        creatorRole: 'Principal Cloud Architect',
        creatorDepartment: 'Cloud Infrastructure',
        creatorAvatar: null,
        createdDate: new Date(Date.now() - 3600000 * 24).toISOString(),
        viewCount: 0,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        isLikedByCurrentUser: false,
        isBookmarkedByCurrentUser: false,
        isMyClip: false
    }
];

// Helper to detect external video embeds (YouTube, Vimeo, MS Stream, OneDrive)
const isExternalClipEmbed = (url) => {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com') || url.includes('sharepoint.com') || url.includes('onedrive.live.com') || url.includes('microsoftstream.com');
};

const getClipEmbedUrl = (u, isMuted) => {
    if (!u) return '';
    const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})/);
    if (ytMatch && ytMatch[1]) {
        const id = ytMatch[1];
        return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;
    }
    const vmMatch = u.match(/vimeo\.com\/(\d+)/);
    if (vmMatch && vmMatch[1]) {
        return `https://player.vimeo.com/video/${vmMatch[1]}?autoplay=1&muted=1&loop=1&playsinline=1`;
    }
    if (u.includes('sharepoint.com') || u.includes('onedrive.live.com')) {
        return u.includes('?') ? `${u}&action=embedview` : `${u}?action=embedview`;
    }
    return u;
};

export default function Clips() {
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const targetClipIdParam = searchParams.get('id');
    const targetTagParam = searchParams.get('tag');

    // Feed state
    const [clips, setClips] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [feedTab, setFeedTab] = useState('ForYou'); // 'ForYou', 'Saved', 'MyClips'
    const [selectedHashtag, setSelectedHashtag] = useState(targetTagParam || null);
    const [activeIndex, setActiveIndex] = useState(0);

    // Audio & Playback state
    const [isMuted, setIsMuted] = useState(true);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [videoProgress, setVideoProgress] = useState(0);
    const [showHeartBurst, setShowHeartBurst] = useState(false);
    const [showPlayPulse, setShowPlayPulse] = useState(false);

    // Modals
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isCommentsOpen, setIsCommentsOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedClipForModal, setSelectedClipForModal] = useState(null);

    // Refs for synchronization and zero-jitter scrolling
    const activeIndexRef = useRef(0);
    const clipsCountRef = useRef(0);
    const videoRefs = useRef({});
    const iframeRefs = useRef({});
    const containerRef = useRef(null);
    const recordedViewsRef = useRef(new Set());
    const scrollDebounceRef = useRef(null);

    // Helper to resolve an item (whether full clip object or clipId) to a valid clip
    const resolveToClipObj = useCallback((item) => {
        if (!item) return null;
        if (typeof item === 'object' && item.clipId != null) {
            return { ...item, isBookmarkedByCurrentUser: true };
        }
        const id = Number(item) || String(item);
        const found = FALLBACK_CLIPS.find(c => String(c.clipId) === String(id));
        if (found) {
            return { ...found, isBookmarkedByCurrentUser: true };
        }
        return null;
    }, []);

    // Multi-key local storage reader: checks user-scoped keys AND global fallback key
    const getSavedClipsLocal = useCallback(() => {
        try {
            const uId = currentUser?.userId || currentUser?.id;
            const keysToTry = [
                uId ? `knome_saved_clips_${uId}` : null,
                currentUser?.employeeId ? `knome_saved_clips_${currentUser.employeeId}` : null,
                'knome_saved_clips_active',
                'knome_saved_clips'
            ].filter(Boolean);

            const map = new Map();

            for (const k of keysToTry) {
                const raw = localStorage.getItem(k);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            parsed.forEach(item => {
                                const clipObj = resolveToClipObj(item);
                                if (clipObj && !map.has(String(clipObj.clipId))) {
                                    map.set(String(clipObj.clipId), clipObj);
                                }
                            });
                        }
                    } catch (e) {}
                }
            }
            return Array.from(map.values());
        } catch {
            return [];
        }
    }, [currentUser?.userId, currentUser?.id, currentUser?.employeeId, resolveToClipObj]);

    // Multi-key local storage writer: saves to both global key and user-scoped key
    const setSavedClipsLocal = useCallback((savedList) => {
        try {
            const uId = currentUser?.userId || currentUser?.id;
            const json = JSON.stringify(savedList);
            localStorage.setItem('knome_saved_clips', json);
            if (uId) {
                localStorage.setItem(`knome_saved_clips_${uId}`, json);
            }
            if (currentUser?.employeeId) {
                localStorage.setItem(`knome_saved_clips_${currentUser.employeeId}`, json);
            }

            // Sync to knome_saved_items_custom so it shows in /saved (SavedContent page)
            try {
                const customSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
                const nonClipItems = customSaved.filter(i => (i.contentType || '').toLowerCase() !== 'clip');
                const clipItems = savedList.map(c => ({
                    id: `Clip_${c.clipId}`,
                    contentId: c.clipId,
                    contentType: 'Clip',
                    title: c.title,
                    content: c.description || c.title,
                    thumbnailUrl: c.thumbnailUrl || c.videoUrl,
                    author: c.creatorName || 'Employee',
                    savedAt: new Date().toISOString()
                }));
                localStorage.setItem('knome_saved_items_custom', JSON.stringify([...nonClipItems, ...clipItems]));
                window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_items_custom' }));
            } catch (e) {}

            window.dispatchEvent(new CustomEvent('knome_clips_bookmarks_updated', { detail: savedList }));
        } catch (e) {
            console.warn('Failed saving clips to local cache:', e);
        }
    }, [currentUser?.userId, currentUser?.id, currentUser?.employeeId]);

    // Helper to store user's uploaded clips locally
    const getUserUploadedClipsLocal = useCallback(() => {
        try {
            const raw = localStorage.getItem('knome_my_uploaded_clips');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }, []);

    const saveUserUploadedClipLocal = useCallback((newClip) => {
        try {
            const existing = getUserUploadedClipsLocal();
            const updated = [newClip, ...existing.filter(c => String(c.clipId) !== String(newClip.clipId))];
            localStorage.setItem('knome_my_uploaded_clips', JSON.stringify(updated));
        } catch (e) {}
    }, [getUserUploadedClipsLocal]);

    // Synchronize refs
    useEffect(() => {
        activeIndexRef.current = activeIndex;
    }, [activeIndex]);

    useEffect(() => {
        clipsCountRef.current = clips.length;
    }, [clips.length]);

    // Load Clips Feed strictly matching active tab
    const loadClips = useCallback(async () => {
        setIsLoading(true);
        try {
            let loadedClips = [];

            if (feedTab === 'MyClips') {
                // Fetch strictly current user's uploaded clips from backend & local cache
                let backendMyClips = [];
                try {
                    const res = await clipsApi.getMyClips(1, 50);
                    backendMyClips = Array.isArray(res) ? res : (res?.data || []);
                } catch (e) {}

                const localMyClips = getUserUploadedClipsLocal();
                const myMap = new Map();
                localMyClips.forEach(c => myMap.set(String(c.clipId), { ...c, isMyClip: true }));
                backendMyClips.forEach(c => {
                    const idStr = String(c.clipId);
                    if (myMap.has(idStr)) {
                        myMap.set(idStr, { ...myMap.get(idStr), ...c, isMyClip: true });
                    } else {
                        myMap.set(idStr, { ...c, isMyClip: true });
                    }
                });

                // Sync saved status with local bookmarks
                const localSavedIds = new Set(getSavedClipsLocal().map(c => String(c.clipId)));
                loadedClips = Array.from(myMap.values()).map(c => ({
                    ...c,
                    isBookmarkedByCurrentUser: localSavedIds.has(String(c.clipId))
                }));
            } else if (feedTab === 'Saved') {
                // Fetch saved clips from backend AND merge with local cache
                let backendSaved = [];
                try {
                    const res = typeof clipsApi.getSavedClips === 'function'
                        ? await clipsApi.getSavedClips(1, 100)
                        : await clipsApi.getFeed(1, 100);
                    const allClips = Array.isArray(res) ? res : (res?.data || []);
                    backendSaved = allClips.filter(c => Boolean(c.isBookmarkedByCurrentUser));
                } catch (e) {}

                const localSaved = getSavedClipsLocal();
                const savedMap = new Map();
                localSaved.forEach(c => savedMap.set(String(c.clipId), { ...c, isBookmarkedByCurrentUser: true }));
                backendSaved.forEach(c => {
                    const idStr = String(c.clipId);
                    if (savedMap.has(idStr)) {
                        savedMap.set(idStr, { ...savedMap.get(idStr), ...c, isBookmarkedByCurrentUser: true });
                    } else {
                        savedMap.set(idStr, { ...c, isBookmarkedByCurrentUser: true });
                    }
                });

                loadedClips = Array.from(savedMap.values());
            } else {
                // For You feed
                const res = await clipsApi.getFeed(1, 50, selectedHashtag);
                loadedClips = Array.isArray(res) ? res : (res?.data || []);

                // Only fallback to seed demo clips if database has zero clips
                if (!loadedClips || loadedClips.length === 0) {
                    loadedClips = FALLBACK_CLIPS;
                }

                // Sync saved indicator with user's saved clips
                const localSavedIds = new Set(getSavedClipsLocal().map(c => String(c.clipId)));
                loadedClips = loadedClips.map(c => ({
                    ...c,
                    isBookmarkedByCurrentUser: Boolean(c.isBookmarkedByCurrentUser || localSavedIds.has(String(c.clipId)))
                }));
            }

            setClips(loadedClips);

            // Determine initial clip index (support deep linking via id param)
            let initialIdx = 0;
            if (targetClipIdParam && loadedClips.length > 0) {
                const targetIdx = loadedClips.findIndex(c => String(c.clipId) === String(targetClipIdParam));
                if (targetIdx !== -1) {
                    initialIdx = targetIdx;
                }
            }

            setActiveIndex(initialIdx);
            activeIndexRef.current = initialIdx;
            setVideoProgress(0);
            if (containerRef.current) {
                const itemHeight = containerRef.current.clientHeight || 0;
                containerRef.current.scrollTop = initialIdx * itemHeight;
            }
        } catch (err) {
            console.warn('API feed error:', err);
            if (feedTab === 'ForYou') {
                const localSavedIds = new Set(getSavedClipsLocal().map(c => String(c.clipId)));
                setClips(FALLBACK_CLIPS.map(c => ({
                    ...c,
                    isBookmarkedByCurrentUser: localSavedIds.has(String(c.clipId))
                })));
            } else if (feedTab === 'Saved') {
                setClips(getSavedClipsLocal());
            } else if (feedTab === 'MyClips') {
                setClips(getUserUploadedClipsLocal());
            } else {
                setClips([]);
            }
        } finally {
            setIsLoading(false);
        }
    }, [feedTab, selectedHashtag, targetClipIdParam, getSavedClipsLocal, getUserUploadedClipsLocal]);

    useEffect(() => {
        loadClips();
    }, [loadClips]);

    // Smooth Scroll To a Specific Clip Index
    const scrollToClip = useCallback((index) => {
        const container = containerRef.current;
        if (!container) return;
        const total = clipsCountRef.current;
        if (index < 0 || index >= total) return;

        const itemHeight = container.clientHeight;
        if (!itemHeight) return;

        container.scrollTo({
            top: index * itemHeight,
            behavior: 'smooth'
        });

        activeIndexRef.current = index;
        setActiveIndex(index);
        setVideoProgress(0);
    }, []);

    // Container Scroll Listener — Updates activeIndex mathematically with debounce
    const handleContainerScroll = useCallback((e) => {
        const container = e.currentTarget;
        const itemHeight = container.clientHeight;
        if (!itemHeight) return;

        const newIndex = Math.round(container.scrollTop / itemHeight);
        if (newIndex >= 0 && newIndex < clips.length && newIndex !== activeIndexRef.current) {
            clearTimeout(scrollDebounceRef.current);
            scrollDebounceRef.current = setTimeout(() => {
                if (newIndex !== activeIndexRef.current) {
                    activeIndexRef.current = newIndex;
                    setActiveIndex(newIndex);
                    setVideoProgress(0);
                }
            }, 50);
        }
    }, [clips.length]);

    // YouTube Shorts Style Wheel Handler
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let wheelLock = false;
        let wheelTimer = null;

        const handleWheel = (e) => {
            if (isCreateOpen || isCommentsOpen || isShareOpen || isReportOpen || isEditOpen) return;
            if (e.target.closest('input') || e.target.closest('textarea')) return;

            e.preventDefault();

            if (wheelLock) return;
            if (Math.abs(e.deltaY) < 18) return;

            const currentIdx = activeIndexRef.current;
            const total = clipsCountRef.current;

            if (e.deltaY > 0 && currentIdx < total - 1) {
                wheelLock = true;
                scrollToClip(currentIdx + 1);
                clearTimeout(wheelTimer);
                wheelTimer = setTimeout(() => { wheelLock = false; }, 360);
            } else if (e.deltaY < 0 && currentIdx > 0) {
                wheelLock = true;
                scrollToClip(currentIdx - 1);
                clearTimeout(wheelTimer);
                wheelTimer = setTimeout(() => { wheelLock = false; }, 360);
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            container.removeEventListener('wheel', handleWheel);
            clearTimeout(wheelTimer);
        };
    }, [isCreateOpen, isCommentsOpen, isShareOpen, isReportOpen, isEditOpen, scrollToClip]);

    // Keyboard navigation (ArrowDown, ArrowUp, PageDown, PageUp, j, k, Space, m)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isCreateOpen || isCommentsOpen || isShareOpen || isReportOpen || isEditOpen) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
                e.preventDefault();
                scrollToClip(activeIndexRef.current + 1);
            } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
                e.preventDefault();
                scrollToClip(activeIndexRef.current - 1);
            } else if (e.key === ' ') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                toggleMute();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCreateOpen, isCommentsOpen, isShareOpen, isReportOpen, isEditOpen, scrollToClip]);

    // Track active video & manage play / pause cleanly
    useEffect(() => {
        // 1. Pause all direct videos that are not active
        Object.entries(videoRefs.current).forEach(([idxStr, vid]) => {
            const idx = Number(idxStr);
            if (!vid) return;
            if (idx !== activeIndex) {
                try {
                    vid.pause();
                    vid.currentTime = 0;
                } catch (e) {}
            }
        });

        // 2. Pause all external embed iframes that are not active
        Object.entries(iframeRefs.current).forEach(([idxStr, ifr]) => {
            const idx = Number(idxStr);
            if (!ifr || !ifr.contentWindow) return;
            if (idx !== activeIndex) {
                try {
                    ifr.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'pauseVideo',
                        args: []
                    }), '*');
                } catch (e) {}
            }
        });

        const activeClip = clips[activeIndex];
        if (!activeClip) return;

        // 3. Play active video
        if (isExternalClipEmbed(activeClip.videoUrl)) {
            const ifr = iframeRefs.current[activeIndex];
            if (ifr && ifr.contentWindow) {
                try {
                    ifr.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'playVideo',
                        args: []
                    }), '*');
                    if (!isMuted) {
                        ifr.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: 'unMute',
                            args: []
                        }), '*');
                    }
                    setIsPlaying(true);
                    setIsBuffering(false);
                } catch (e) {}
            }
        } else {
            const vid = videoRefs.current[activeIndex];
            if (vid) {
                vid.muted = isMuted;
                const playPromise = vid.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsPlaying(true);
                            setIsBuffering(false);
                        })
                        .catch((err) => {
                            console.warn('Autoplay with sound prevented, falling back to muted autoplay:', err);
                            vid.muted = true;
                            setIsMuted(true);
                            vid.play()
                                .then(() => {
                                    setIsPlaying(true);
                                    setIsBuffering(false);
                                })
                                .catch(() => {
                                    setIsPlaying(false);
                                    setIsBuffering(false);
                                });
                        });
                }
            }
        }
    }, [activeIndex, isMuted, clips]);

    // Record view: exactly 1 view per user tracked authentically
    const activeClipId = clips[activeIndex]?.clipId;
    useEffect(() => {
        if (!activeClipId) return;
        const idStr = String(activeClipId);

        if (!recordedViewsRef.current.has(idStr)) {
            recordedViewsRef.current.add(idStr);

            // Optimistically ensure clip reflects viewing (at least 1 view if currently 0)
            setClips(prev => prev.map(c => {
                if (String(c.clipId) === idStr) {
                    const currentViews = Number(c.viewCount) || 0;
                    return { ...c, viewCount: Math.max(1, currentViews) };
                }
                return c;
            }));

            // Sync with backend authoritative count
            clipsApi.recordView(activeClipId)
                .then((res) => {
                    const newCount = res?.viewCount ?? (typeof res === 'number' ? res : null);
                    if (newCount !== null && newCount !== undefined && newCount > 0) {
                        setClips(prev => prev.map(c => 
                            String(c.clipId) === idStr ? { ...c, viewCount: newCount } : c
                        ));
                    }
                })
                .catch((err) => {
                    console.warn('Record view notice:', err);
                });
        }
    }, [activeClipId]);

    // Video Time Update Progress
    const handleTimeUpdate = (e) => {
        const vid = e.target;
        if (vid.duration) {
            setVideoProgress((vid.currentTime / vid.duration) * 100);
        }
    };

    const togglePlayPause = () => {
        const currentClip = clips[activeIndex];
        if (!currentClip) return;

        if (isExternalClipEmbed(currentClip.videoUrl)) {
            const ifr = iframeRefs.current[activeIndex];
            if (ifr && ifr.contentWindow) {
                const nextPlaying = !isPlaying;
                ifr.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: nextPlaying ? 'playVideo' : 'pauseVideo',
                    args: []
                }), '*');
                setIsPlaying(nextPlaying);
            }
        } else {
            const vid = videoRefs.current[activeIndex];
            if (!vid) return;

            if (vid.paused) {
                vid.play()
                    .then(() => setIsPlaying(true))
                    .catch(() => {});
            } else {
                vid.pause();
                setIsPlaying(false);
            }
        }

        setShowPlayPulse(true);
        setTimeout(() => setShowPlayPulse(false), 500);
    };

    const toggleMute = () => {
        setIsMuted(prev => {
            const next = !prev;
            const vid = videoRefs.current[activeIndex];
            if (vid) vid.muted = next;

            const ifr = iframeRefs.current[activeIndex];
            if (ifr && ifr.contentWindow) {
                ifr.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: next ? 'mute' : 'unMute',
                    args: []
                }), '*');
            }
            return next;
        });
    };

    // Double tap to like
    const lastTapRef = useRef(0);
    const handleVideoClick = () => {
        const now = Date.now();
        if (now - lastTapRef.current < 280) {
            handleLike(clips[activeIndex]);
            setShowHeartBurst(true);
            setTimeout(() => setShowHeartBurst(false), 800);
        } else {
            togglePlayPause();
        }
        lastTapRef.current = now;
    };

    // Mobile Touch Navigation
    const touchStartYRef = useRef(0);
    const handleTouchStart = (e) => {
        if (e.touches && e.touches[0]) {
            touchStartYRef.current = e.touches[0].clientY;
        }
    };
    const handleTouchEnd = (e) => {
        if (isCreateOpen || isCommentsOpen || isShareOpen || isReportOpen || isEditOpen) return;
        if (e.changedTouches && e.changedTouches[0]) {
            const diff = touchStartYRef.current - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 45) {
                if (diff > 0 && activeIndexRef.current < clipsCountRef.current - 1) {
                    scrollToClip(activeIndexRef.current + 1);
                } else if (diff < 0 && activeIndexRef.current > 0) {
                    scrollToClip(activeIndexRef.current - 1);
                }
            }
        }
    };

    // Like Action
    const handleLike = async (clip) => {
        if (!clip) return;
        const clipId = clip.clipId;
        const idStr = String(clipId);
        const currentLiked = Boolean(clip.isLikedByCurrentUser);

        // Optimistic UI update
        setClips(prev => prev.map(c => {
            if (String(c.clipId) === idStr) {
                return {
                    ...c,
                    isLikedByCurrentUser: !currentLiked,
                    likesCount: !currentLiked ? (c.likesCount || 0) + 1 : Math.max(0, (c.likesCount || 1) - 1)
                };
            }
            return c;
        }));

        try {
            await clipsApi.react(clipId, 'Like');
        } catch (err) {
            console.error('Like failed:', err);
        }
    };

    // Bookmark / Save Action — Updates both local cache and SQL backend
    const handleBookmark = async (clip) => {
        if (!clip) return;
        const clipId = clip.clipId;
        const idStr = String(clipId);
        const currentSaved = Boolean(clip.isBookmarkedByCurrentUser);
        const nextSaved = !currentSaved;

        // 1. Update local cache immediately
        const existingSaved = getSavedClipsLocal();
        let updatedSaved;
        if (nextSaved) {
            const clipToSave = { ...clip, isBookmarkedByCurrentUser: true };
            updatedSaved = [clipToSave, ...existingSaved.filter(c => String(c.clipId) !== idStr)];
        } else {
            updatedSaved = existingSaved.filter(c => String(c.clipId) !== idStr);
        }
        setSavedClipsLocal(updatedSaved);

        // 2. Optimistic UI update for currently displayed list
        setClips(prev => {
            if (feedTab === 'Saved' && !nextSaved) {
                return prev.filter(c => String(c.clipId) !== idStr);
            }
            return prev.map(c => {
                if (String(c.clipId) === idStr) {
                    return { ...c, isBookmarkedByCurrentUser: nextSaved };
                }
                return c;
            });
        });

        addToast(nextSaved ? 'Clip saved to your collection!' : 'Clip removed from saved.', 'info');

        // 3. Persist to backend database (dual endpoints)
        try {
            await clipsApi.bookmark(clipId);
        } catch (err) {
            try {
                await apiClient.post(`/interactions/Clip/${clipId}/bookmark`, {});
            } catch (err2) {
                console.warn('Backend bookmark sync notice:', err2);
            }
        }
    };

    // Delete Clip Action
    const handleDeleteClip = async (clip) => {
        if (!clip) return;
        const clipId = clip.clipId;
        const idStr = String(clipId);
        const ok = await confirm({
            title: 'Delete Short Clip',
            message: `Are you sure you want to permanently delete "${clip.title}"?`,
            confirmText: 'Delete Clip',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;

        try {
            await clipsApi.delete(clipId);
        } catch (err) {
            console.warn('Backend clip delete notice:', err);
        }

        try {
            const uploaded = getUserUploadedClipsLocal();
            localStorage.setItem('knome_my_uploaded_clips', JSON.stringify(uploaded.filter(c => String(c.clipId) !== idStr)));
            const saved = getSavedClipsLocal();
            setSavedClipsLocal(saved.filter(c => String(c.clipId) !== idStr));
        } catch (e) {}

        setClips(prev => prev.filter(c => String(c.clipId) !== idStr));
        addToast('Clip deleted successfully.', 'info');
    };

    const activeClip = clips[activeIndex] || null;

    return (
        <div className="h-full w-full bg-white text-slate-800 flex flex-col select-none rounded-2xl overflow-hidden shadow-sm border border-slate-200">
            
            {/* Top Bar Header */}
            <header className="shrink-0 px-4 sm:px-6 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-4 z-40">
                
                {/* Brand & Feed Sub-tabs */}
                <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
                            <span className="material-symbols-outlined text-white text-xl">movie</span>
                        </div>
                        <h1 className="text-lg font-black tracking-tight text-slate-900 hidden sm:block">Clips</h1>
                    </div>

                    <div className="flex items-center p-1 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-bold">
                        {[
                            { id: 'ForYou', label: 'For You', icon: 'local_fire_department' },
                            { id: 'Saved', label: 'Saved', icon: 'bookmark' },
                            { id: 'MyClips', label: 'My Clips', icon: 'person' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    setFeedTab(tab.id);
                                    setActiveIndex(0);
                                    activeIndexRef.current = 0;
                                    if (containerRef.current) containerRef.current.scrollTop = 0;
                                }}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition font-semibold cursor-pointer ${
                                    feedTab === tab.id
                                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/25'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tag Filter Badge if active */}
                {selectedHashtag && (
                    <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-600 text-xs font-bold">
                        <span>Tag: {selectedHashtag}</span>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedHashtag(null);
                                setSearchParams({});
                            }}
                            className="text-pink-600 hover:text-pink-800 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-xs">close</span>
                        </button>
                    </div>
                )}

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-xs shadow-lg shadow-pink-500/20 transition active:scale-95 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-base">add_circle</span>
                        <span className="hidden sm:inline">Create Clip</span>
                    </button>
                </div>

            </header>

            {/* Main Vertical Feed Area - YouTube Shorts Style Scroll Feed */}
            <main
                ref={containerRef}
                onScroll={handleContainerScroll}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar select-none relative"
                style={{ scrollSnapType: 'y mandatory', scrollBehavior: 'smooth' }}
            >
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                        <div className="w-10 h-10 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
                        <p className="text-sm font-medium">Loading vertical clips feed...</p>
                    </div>
                ) : clips.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-4">
                        <div className="flex flex-col items-center justify-center text-center p-8 max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm">
                            {feedTab === 'Saved' ? (
                                <>
                                    <div className="w-20 h-20 rounded-3xl bg-amber-50 text-amber-500 flex items-center justify-center mb-4 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl font-fill">bookmark</span>
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900 mb-1">No Saved Clips Yet</h2>
                                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                                        Tap the bookmark icon on any clip while browsing to save it to your personal collection.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFeedTab('ForYou');
                                            setActiveIndex(0);
                                            activeIndexRef.current = 0;
                                            if (containerRef.current) containerRef.current.scrollTop = 0;
                                        }}
                                        className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-lg shadow-pink-500/25 hover:from-pink-600 hover:to-rose-600 transition cursor-pointer"
                                    >
                                        Explore For You Clips
                                    </button>
                                </>
                            ) : feedTab === 'MyClips' ? (
                                <>
                                    <div className="w-20 h-20 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl">video_camera_front</span>
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900 mb-1">No Clips Uploaded Yet</h2>
                                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                                        You haven't uploaded any clips yet. Share a 30-second quick update, demo, or tutorial with colleagues!
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(true)}
                                        className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-lg shadow-pink-500/25 hover:from-pink-600 hover:to-rose-600 transition cursor-pointer"
                                    >
                                        Create Your First Clip
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 rounded-3xl bg-pink-50 text-pink-500 flex items-center justify-center mb-4 shadow-sm">
                                        <span className="material-symbols-outlined text-4xl">movie</span>
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900 mb-1">No clips in this feed yet</h2>
                                    <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                                        Be the first to share a short video clip, tutorial, or quick team highlight with colleagues!
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(true)}
                                        className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-lg shadow-pink-500/25 hover:from-pink-600 hover:to-rose-600 transition cursor-pointer"
                                    >
                                        Upload First Clip
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    clips.map((clip, index) => {
                        const isCurrent = index === activeIndex;
                        const isAdjacent = Math.abs(index - activeIndex) <= 1;

                        return (
                            <div
                                key={clip.clipId || index}
                                id={`clip-card-${index}`}
                                data-clip-index={index}
                                className="clip-snap-item w-full h-full snap-start snap-always flex items-center justify-center relative py-2 sm:py-3 px-2 shrink-0 select-none"
                            >
                                {/* Vertical Clip Container (9:16 Aspect Canvas) */}
                                <div
                                    className="relative w-full max-w-[400px] h-full max-h-[calc(100%-16px)] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl shadow-slate-300/70 border border-slate-200 bg-black flex items-center justify-center group"
                                >
                                    {isAdjacent ? (
                                        <>
                                            {/* Video Element or External Embed IFrame */}
                                            {isExternalClipEmbed(clip.videoUrl) ? (
                                                <div className="relative w-full h-full">
                                                    <iframe
                                                        ref={(el) => { if (el) iframeRefs.current[index] = el; }}
                                                        className="w-full h-full object-cover rounded-3xl bg-black border-0 pointer-events-auto"
                                                        src={getClipEmbedUrl(clip.videoUrl, isMuted)}
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                                        title={clip.title || 'Clip Video'}
                                                        onLoad={() => {
                                                            if (isCurrent) {
                                                                const ifr = iframeRefs.current[index];
                                                                if (ifr && ifr.contentWindow) {
                                                                    try {
                                                                        ifr.contentWindow.postMessage(JSON.stringify({
                                                                            event: 'command',
                                                                            func: 'playVideo',
                                                                            args: []
                                                                        }), '*');
                                                                    } catch (e) {}
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    {/* Click layer to handle double-tap to like and single-tap to play/pause */}
                                                    <div
                                                        className="absolute inset-0 z-10 cursor-pointer"
                                                        onClick={handleVideoClick}
                                                    />
                                                </div>
                                            ) : (
                                                <video
                                                    ref={(el) => { if (el) videoRefs.current[index] = el; }}
                                                    src={resolveMediaUrl(clip.videoUrl)}
                                                    poster={resolveMediaUrl(clip.thumbnailUrl)}
                                                    autoPlay={isCurrent}
                                                    loop
                                                    playsInline
                                                    preload="auto"
                                                    muted={isMuted}
                                                    defaultMuted
                                                    onClick={handleVideoClick}
                                                    onTimeUpdate={isCurrent ? handleTimeUpdate : undefined}
                                                    onWaiting={() => { if (isCurrent) setIsBuffering(true); }}
                                                    onPlaying={() => {
                                                        if (isCurrent) {
                                                            setIsBuffering(false);
                                                            setIsPlaying(true);
                                                        }
                                                    }}
                                                    onPause={() => {
                                                        if (isCurrent) setIsPlaying(false);
                                                    }}
                                                    onError={() => {
                                                        if (isCurrent) setIsBuffering(false);
                                                    }}
                                                    className="w-full h-full object-cover cursor-pointer"
                                                />
                                            )}

                                            {/* Buffering Spinner */}
                                            {isBuffering && isCurrent && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-25">
                                                    <div className="w-12 h-12 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
                                                </div>
                                            )}

                                            {/* Center Play Button Overlay when paused */}
                                            {!isPlaying && isCurrent && !isBuffering && (
                                                <div
                                                    onClick={togglePlayPause}
                                                    className="absolute inset-0 flex items-center justify-center bg-black/30 z-25 cursor-pointer backdrop-blur-[1px] transition"
                                                >
                                                    <div className="w-18 h-18 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition">
                                                        <span className="material-symbols-outlined text-4xl ml-1">play_arrow</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Play / Pause Animated Pulse Center Badge */}
                                            {showPlayPulse && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                                                    <div className="w-18 h-18 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white scale-125 animate-out zoom-out-50 duration-500">
                                                        <span className="material-symbols-outlined text-3xl">
                                                            {isPlaying ? 'play_arrow' : 'pause'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Double-Tap Heart Burst Animation */}
                                            {showHeartBurst && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                                                    <div className="text-pink-500 scale-150 animate-bounce duration-300 drop-shadow-[0_10px_20px_rgba(236,72,153,0.8)]">
                                                        <span className="material-symbols-outlined text-7xl font-fill">favorite</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Top Overlay Gradient & Badges */}
                                            <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between pointer-events-none z-20">
                                                <div className="flex items-center gap-2 pointer-events-auto">
                                                    {clip.communityId && (
                                                        <button
                                                            onClick={() => navigate(`/community/view?id=${clip.communityId}`)}
                                                            className="px-2.5 py-1 rounded-full bg-sky-500/20 backdrop-blur-md border border-sky-500/40 text-sky-300 text-[11px] font-bold flex items-center gap-1 hover:bg-sky-500/30 transition cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-xs">groups</span>
                                                            <span>{clip.communityName || 'Community'}</span>
                                                        </button>
                                                    )}

                                                    {clip.status === 'Draft' && (
                                                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                                                            Draft
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5 pointer-events-auto">
                                                    {(clip.isMyClip || String(clip.createdByUserId) === String(currentUser?.userId || currentUser?.id)) && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedClipForModal(clip);
                                                                    setIsEditOpen(true);
                                                                }}
                                                                className="p-2 rounded-xl bg-black/40 backdrop-blur-md text-white/80 hover:text-white hover:bg-black/60 transition cursor-pointer"
                                                                title="Edit Clip"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteClip(clip);
                                                                }}
                                                                className="p-2 rounded-xl bg-rose-500/30 backdrop-blur-md text-rose-300 hover:text-rose-100 hover:bg-rose-500/50 transition cursor-pointer"
                                                                title="Delete Clip"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={toggleMute}
                                                        className="p-2 rounded-xl bg-black/40 backdrop-blur-md text-white/80 hover:text-white transition cursor-pointer"
                                                        title={isMuted ? "Unmute" : "Mute"}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{isMuted ? 'volume_off' : 'volume_up'}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const el = document.getElementById(`clip-card-${index}`);
                                                            if (el) {
                                                                if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
                                                                else document.exitFullscreen().catch(() => {});
                                                            }
                                                        }}
                                                        className="p-2 rounded-xl bg-black/40 backdrop-blur-md text-white/80 hover:text-white transition cursor-pointer"
                                                        title="Fullscreen"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">fullscreen</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Right Floating Action Overlay Bar */}
                                            <div className="absolute right-3 bottom-14 flex flex-col items-center gap-4 z-30 pointer-events-auto">
                                                
                                                {/* Creator Avatar & Profile Shortcut */}
                                                <div className="relative mb-2">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/profile/${clip.createdByUserId}`);
                                                        }}
                                                        className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-pink-500 to-rose-500 shadow-xl overflow-hidden transition hover:scale-105 active:scale-95 cursor-pointer"
                                                        title={`View ${clip.creatorName}'s profile`}
                                                    >
                                                        <img
                                                            src={resolveMediaUrl(clip.creatorAvatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(clip.creatorName || 'User')}&background=ec4899&color=fff`}
                                                            alt={clip.creatorName}
                                                            className="w-full h-full object-cover rounded-full"
                                                        />
                                                    </button>
                                                </div>

                                                {/* Like Button */}
                                                <div className="flex flex-col items-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleLike(clip);
                                                        }}
                                                        className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition active:scale-90 shadow-xl cursor-pointer ${
                                                            clip.isLikedByCurrentUser
                                                                ? 'bg-rose-500/30 text-rose-500 scale-110'
                                                                : 'bg-black/50 text-white hover:bg-rose-500/20 hover:text-rose-400'
                                                        }`}
                                                        title="Like Clip"
                                                    >
                                                        <span className={`material-symbols-outlined text-2xl ${clip.isLikedByCurrentUser ? 'font-fill text-rose-500' : ''}`}>
                                                            favorite
                                                        </span>
                                                    </button>
                                                    <span className="text-[11px] font-bold mt-1 text-white drop-shadow">
                                                        {clip.likesCount || 0}
                                                    </span>
                                                </div>

                                                {/* Comments Drawer Button */}
                                                <div className="flex flex-col items-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedClipForModal(clip);
                                                            setIsCommentsOpen(true);
                                                        }}
                                                        className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 flex items-center justify-center transition active:scale-90 shadow-xl cursor-pointer"
                                                        title="Comments"
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">chat_bubble</span>
                                                    </button>
                                                    <span className="text-[11px] font-bold mt-1 text-white drop-shadow">
                                                        {clip.commentsCount || 0}
                                                    </span>
                                                </div>

                                                {/* Share Modal Button */}
                                                <div className="flex flex-col items-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedClipForModal(clip);
                                                            setIsShareOpen(true);
                                                        }}
                                                        className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70 flex items-center justify-center transition active:scale-90 shadow-xl cursor-pointer"
                                                        title="Share Clip"
                                                    >
                                                        <span className="material-symbols-outlined text-2xl">share</span>
                                                    </button>
                                                    <span className="text-[11px] font-bold mt-1 text-white drop-shadow">
                                                        {clip.sharesCount || 0}
                                                    </span>
                                                </div>

                                                {/* Bookmark / Save Button — High-reliability dual local & backend save */}
                                                <div className="flex flex-col items-center">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleBookmark(clip);
                                                        }}
                                                        className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition active:scale-90 shadow-xl cursor-pointer ${
                                                            clip.isBookmarkedByCurrentUser
                                                                ? 'bg-amber-500 text-white ring-2 ring-amber-400/50 shadow-amber-500/30'
                                                                : 'bg-black/50 text-white hover:bg-black/70 hover:text-amber-400'
                                                        }`}
                                                        title={clip.isBookmarkedByCurrentUser ? 'Saved' : 'Save Clip'}
                                                    >
                                                        <span className={`material-symbols-outlined text-2xl ${clip.isBookmarkedByCurrentUser ? 'font-fill text-white' : ''}`}>
                                                            bookmark
                                                        </span>
                                                    </button>
                                                </div>

                                            </div>

                                            {/* Bottom Information Overlay */}
                                            <div className="absolute inset-x-0 bottom-0 p-5 pr-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent z-20 flex flex-col gap-2 pointer-events-none">
                                                
                                                {/* Author Line */}
                                                <div className="flex items-center gap-2 pointer-events-auto">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/profile/${clip.createdByUserId}`);
                                                        }}
                                                        className="font-bold text-sm text-white hover:underline truncate cursor-pointer"
                                                    >
                                                        @{clip.creatorName || 'Employee'}
                                                    </button>
                                                    <span className="text-[11px] text-slate-300 shrink-0">
                                                        • {clip.creatorDepartment || 'MPOnline'}
                                                    </span>
                                                </div>

                                                {/* Caption / Title */}
                                                <p className="text-xs text-white font-medium leading-relaxed line-clamp-2">
                                                    {clip.title}
                                                </p>

                                                {/* Hashtags */}
                                                {clip.hashtags && (
                                                    <div className="flex flex-wrap gap-1.5 mt-0.5 pointer-events-auto">
                                                        {clip.hashtags.split(/[\s,]+/).filter(Boolean).map((tag, tIdx) => (
                                                            <button
                                                                key={tIdx}
                                                                type="button"
                                                                onClick={(e) => {
                                                                  e.stopPropagation();
                                                                  const clean = tag.startsWith('#') ? tag : `#${tag}`;
                                                                  setSelectedHashtag(clean);
                                                                  setSearchParams({ tag: clean });
                                                                }}
                                                                className="text-pink-400 hover:text-pink-300 text-xs font-bold transition cursor-pointer"
                                                            >
                                                                {tag.startsWith('#') ? tag : `#${tag}`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Views counter & Audio Sound Wave badge */}
                                                <div className="flex items-center justify-between text-[11px] text-slate-300 mt-1 pt-1">
                                                    <div className="flex items-center gap-1.5" title="Knome Internal Views">
                                                        <span className="material-symbols-outlined text-sm text-slate-400">visibility</span>
                                                        <span>{(clip.viewCount ?? 0) === 1 ? '1 view' : `${clip.viewCount || 0} views`}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-300">
                                                        <span className="material-symbols-outlined text-xs animate-pulse text-pink-500">graphic_eq</span>
                                                        <span className="text-[10px]">Original Audio</span>
                                                    </div>
                                                </div>

                                                {/* Video Playback Progress Bar */}
                                                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-1.5">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 transition-all duration-150"
                                                        style={{ width: `${videoProgress}%` }}
                                                    />
                                                </div>

                                            </div>
                                        </>
                                    ) : (
                                        /* Lightweight preview poster for distant items to conserve memory */
                                        <div
                                            className="relative w-full h-full cursor-pointer group"
                                            onClick={() => scrollToClip(index)}
                                        >
                                            <img
                                                src={resolveMediaUrl(clip.thumbnailUrl) || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=600&h=1000'}
                                                alt={clip.title}
                                                className="w-full h-full object-cover rounded-3xl"
                                            />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-3xl group-hover:bg-black/30 transition">
                                                <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white group-hover:scale-110 transition">
                                                    <span className="material-symbols-outlined text-4xl">play_arrow</span>
                                                </div>
                                            </div>
                                            <div className="absolute bottom-4 inset-x-4 p-3 bg-black/70 backdrop-blur-md rounded-2xl text-white text-xs font-semibold truncate">
                                                {clip.title}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Desktop Floating Up / Down Quick Navigation Buttons */}
                {!isLoading && clips.length > 1 && (
                    <div className="hidden md:flex flex-col gap-2 absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 z-30 pointer-events-auto">
                        <button
                            type="button"
                            disabled={activeIndex === 0}
                            onClick={() => scrollToClip(activeIndex - 1)}
                            className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200 shadow-xl backdrop-blur-md flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer"
                            title="Previous Clip (Up Arrow)"
                        >
                            <span className="material-symbols-outlined text-xl">keyboard_arrow_up</span>
                        </button>
                        <button
                            type="button"
                            disabled={activeIndex === clips.length - 1}
                            onClick={() => scrollToClip(activeIndex + 1)}
                            className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200 shadow-xl backdrop-blur-md flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer"
                            title="Next Clip (Down Arrow)"
                        >
                            <span className="material-symbols-outlined text-xl">keyboard_arrow_down</span>
                        </button>
                    </div>
                )}

            </main>

            {/* Modals & Drawers */}
            <CreateClipModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onClipCreated={(newClip) => {
                    saveUserUploadedClipLocal(newClip);
                    setClips(prev => [newClip, ...prev.filter(c => String(c.clipId) !== String(newClip.clipId))]);
                    setActiveIndex(0);
                    activeIndexRef.current = 0;
                    if (containerRef.current) containerRef.current.scrollTop = 0;
                    setFeedTab('MyClips');
                }}
            />

            <ClipCommentsDrawer
                isOpen={isCommentsOpen}
                onClose={() => setIsCommentsOpen(false)}
                clip={selectedClipForModal}
                onCommentAdded={() => {
                    setClips(prev => prev.map(c => {
                        if (c.clipId === selectedClipForModal?.clipId) {
                            return { ...c, commentsCount: (c.commentsCount || 0) + 1 };
                        }
                        return c;
                    }));
                }}
            />

            <ClipShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
                clip={selectedClipForModal}
                onClipShared={() => {
                    setClips(prev => prev.map(c => {
                        if (c.clipId === selectedClipForModal?.clipId) {
                            return { ...c, sharesCount: (c.sharesCount || 0) + 1 };
                        }
                        return c;
                    }));
                }}
            />

            <ReportClipModal
                isOpen={isReportOpen}
                onClose={() => setIsReportOpen(false)}
                clip={selectedClipForModal}
            />

            <EditClipModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                clip={selectedClipForModal}
                onClipUpdated={(updated) => {
                    setClips(prev => prev.map(c => c.clipId === updated.clipId ? { ...c, ...updated } : c));
                }}
            />

        </div>
    );
}
