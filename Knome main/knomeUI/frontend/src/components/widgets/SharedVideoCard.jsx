import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveMediaUrl, getVideoThumbnail } from '../../utils/apiService';
import { useSystemConfig } from '../../utils/systemConfig';
import VideoPlayerModal from '../modals/VideoPlayerModal';
import sharedPlaylistsData from '../../data/shared_playlists.json';

/**
 * Checks if a post represents a shared Video.
 */
export const isSharedVideoPost = (post) => {
    if (!post) return false;

    // Direct object or type flags
    if (post.sharedVideo) return true;
    const typeStr = (post.type || '').toLowerCase();
    const contentTypeStr = (post.contentType || '').toLowerCase();
    const sharedType = (post.sharedContent?.type || '').toLowerCase();

    if (typeStr === 'video_share' || typeStr === 'video' || contentTypeStr === 'video' || sharedType === 'video') {
        return true;
    }

    if (post.videoId) return true;

    // Check textual content and titles
    const text = typeof post.content === 'string' 
        ? post.content 
        : (typeof post.contentText === 'string' ? post.contentText : '');
    const title = typeof post.title === 'string' ? post.title : '';

    if (
        text.includes('Shared Video:') ||
        text.includes('/videos?id=') ||
        text.includes('/videos/') ||
        text.includes('📹') ||
        text.includes('🎥')
    ) {
        return true;
    }

    if (
        title.startsWith('Shared Video:') ||
        title.includes('📹') ||
        title.includes('🎥') ||
        title.includes('🎬 Video Asset Placement')
    ) {
        return true;
    }

    // Has video attachment or videoUrl without being a clip
    if (post.videoUrl && !post.clipId && typeStr !== 'clip_share' && !text.includes('/clips')) {
        return true;
    }

    return false;
};

const cleanMediaTitle = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/^[\uFFFD\uFEFF\s]*[📹🎥🎬]\s*/, '')
        .replace(/^[\uFFFD\uFEFF\s]+/, '')
        .replace(/\uFFFD/g, '')
        .trim();
};

const extractCleanString = (val, fallback = '') => {
    if (!val) return fallback;
    if (typeof val === 'string') return val.trim() || fallback;
    if (typeof val === 'object') {
        const str = val.name || val.fullName || val.authorName || val.title || val.username || '';
        return typeof str === 'string' && str.trim() ? str.trim() : fallback;
    }
    return String(val) || fallback;
};

/**
 * Normalizes video metadata from any post structure and catalog.
 */
export const resolveVideoInfo = (post) => {
    if (!post) {
        return {
            videoId: null,
            title: 'Enterprise Video',
            thumbnailUrl: null,
            videoUrl: null,
            duration: 'Video Session',
            description: '',
            category: 'Training & Tutorials',
            authorName: 'MPOnline Creator',
            authorAvatar: null,
            authorRole: 'Enterprise Contributor',
            views: '0',
            likes: 0
        };
    }

    const sv = (typeof post.sharedVideo === 'object' && post.sharedVideo !== null) ? post.sharedVideo : {};
    const sc = (typeof post.sharedContent === 'object' && post.sharedContent !== null) ? post.sharedContent : {};
    const authorObj = (typeof post.author === 'object' && post.author !== null) ? post.author : null;

    const text = typeof post.content === 'string' 
        ? post.content 
        : (typeof post.contentText === 'string' ? post.contentText : '');

    // 1. Video ID
    let videoId = sv.id || sv.videoId || post.videoId || sc.id || post.contentId || null;
    if (!videoId && text) {
        const idMatch = text.match(/\/videos(?:\?id=|\/)([a-zA-Z0-9_-]+)/i) ||
                        (typeof post.link === 'string' ? post.link.match(/\/videos(?:\?id=|\/)([a-zA-Z0-9_-]+)/i) : null) ||
                        (typeof post.url === 'string' ? post.url.match(/\/videos(?:\?id=|\/)([a-zA-Z0-9_-]+)/i) : null);
        if (idMatch) videoId = idMatch[1];
    }
    if (!videoId && (post.id && String(post.id).includes('20048'))) {
        videoId = '20048';
    }

    // 2. Title
    let rawTitle = sv.title || post.videoTitle || sc.title || null;
    if (!rawTitle && text) {
        const titleMatch = text.match(/Shared Video:\s*"([^"\n]+)"/i);
        if (titleMatch) rawTitle = titleMatch[1];
    }
    if (!rawTitle && post.title && typeof post.title === 'string') {
        rawTitle = post.title
            .replace(/^📢\s*/, '')
            .replace(/^[📹🎥🎬]\s*/, '')
            .replace(/^Shared Video:\s*/i, '')
            .replace(/"/g, '')
            .trim();
    }
    let title = extractCleanString(rawTitle, 'Enterprise Video');
    title = cleanMediaTitle(title) || 'Enterprise Video';

    // 3. Thumbnail & Video Url
    let thumbnailUrl = sv.thumbnail || sv.thumbnailUrl || post.thumbnail || post.thumbnailUrl || sc.thumbnail || null;
    let videoUrl = sv.sourceUrl || sv.videoUrl || post.videoUrl || post.sourceUrl || null;

    if (Array.isArray(post.attachments)) {
        for (const att of post.attachments) {
            const url = typeof att === 'string' ? att : (att?.fileUrl || att?.url || '');
            if (url && typeof url === 'string') {
                if (url.match(/\.(mp4|webm|mov|mkv)(\?.*)?$/i) && !videoUrl) {
                    videoUrl = url;
                } else if (url.match(/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i) && !thumbnailUrl) {
                    thumbnailUrl = url;
                }
            }
        }
    }

    if (Array.isArray(post.attachmentUrls)) {
        for (const url of post.attachmentUrls) {
            if (url && typeof url === 'string') {
                if (url.match(/\.(mp4|webm|mov|mkv)(\?.*)?$/i) && !videoUrl) {
                    videoUrl = url;
                } else if (url.match(/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i) && !thumbnailUrl) {
                    thumbnailUrl = url;
                }
            }
        }
    }

    if (!thumbnailUrl && videoUrl) {
        thumbnailUrl = getVideoThumbnail({ videoUrl }) || null;
    }

    // 4. Description
    let description = sv.description || post.videoDescription || post.description || '';
    if (!description && text) {
        description = text
            .replace(/Shared Video:\s*"[^"]*"/gi, '')
            .replace(/https?:\/\/[^\s]+/gi, '')
            .replace(/\/videos(?:\?id=|\/)[^\s]+/gi, '')
            .replace(/^[\uFFFD\uFEFF\s]*[📹🎥🎬]\s*/, '')
            .replace(/\uFFFD/g, '')
            .trim();
    }

    // 5. Category & Duration
    const category = sv.category || post.category || 'Training & Tutorials';
    const duration = sv.duration || post.duration || 'Video Session';

    // 6. Author / Creator Info
    const rawAuthorName = sv.author || sv.authorName || sc.author || post.authorName || 
                          post.authorFullName || authorObj?.fullName || authorObj?.name || 
                          (typeof post.author === 'string' ? post.author : '') || 
                          'MPOnline Team';
    const authorName = extractCleanString(rawAuthorName, 'MPOnline Team');

    const rawAuthorAvatar = sv.authorAvatar || post.authorProfilePhotoUrl || post.authorAvatar || 
                            authorObj?.avatar || authorObj?.profilePhotoUrl || post.avatar || null;
    const authorAvatar = (typeof rawAuthorAvatar === 'string' && rawAuthorAvatar.trim()) ? rawAuthorAvatar.trim() : null;

    const rawAuthorRole = sv.authorRole || sv.authorDesignation || post.authorDesignation || 
                          post.authorRole || authorObj?.designation || authorObj?.role || 
                          post.role || 'Enterprise Contributor';
    const authorRole = extractCleanString(rawAuthorRole, 'Enterprise Contributor');

    return {
        videoId,
        title,
        thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : null,
        videoUrl: typeof videoUrl === 'string' ? videoUrl : null,
        duration,
        description,
        category,
        authorName,
        authorAvatar,
        authorRole,
        views: sv.views || post.views || '0',
        likes: sv.likes || post.likes || 0
    };
};

/**
 * SharedVideoCard Component
 * Displays a clean, modern, and professional video preview card in Communities and Post feeds.
 * Includes thumbnail, video title, description, creator name, duration badge, and prominent Play button.
 * Clicking the card opens playback seamlessly.
 */
export default function SharedVideoCard({ post, onPlay }) {
    const { isVideosEnabled } = useSystemConfig();
    const navigate = useNavigate();
    const initialVideoInfo = useMemo(() => resolveVideoInfo(post), [post]);

    const [hydratedDetails, setHydratedDetails] = useState(null);
    const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

    // Hydrate video details from persistent storage or catalog if needed
    useEffect(() => {
        let isMounted = true;
        const targetId = initialVideoInfo.videoId;
        const targetTitle = (initialVideoInfo.title || '').toLowerCase().trim();

        const findMatchingEpisode = (items) => {
            if (!Array.isArray(items)) return null;
            return items.find(v => {
                if (!v) return false;
                if (targetId && String(v.id) === String(targetId)) return true;
                if (targetTitle && v.title) {
                    const vt = cleanMediaTitle(v.title).toLowerCase();
                    return vt === targetTitle || vt.includes(targetTitle) || targetTitle.includes(vt);
                }
                return false;
            });
        };

        // 1. Search in shared_playlists.json
        try {
            if (Array.isArray(sharedPlaylistsData)) {
                for (const pl of sharedPlaylistsData) {
                    if (Array.isArray(pl.episodes)) {
                        const match = findMatchingEpisode(pl.episodes);
                        if (match && isMounted) {
                            setHydratedDetails(match);
                            return;
                        }
                    }
                }
            }
        } catch (_) {}

        // 2. Search in localStorage playlists
        try {
            const localPlaylists = JSON.parse(localStorage.getItem('knome_playlists') || '[]');
            for (const pl of localPlaylists) {
                if (Array.isArray(pl.episodes)) {
                    const match = findMatchingEpisode(pl.episodes);
                    if (match && isMounted) {
                        setHydratedDetails(match);
                        return;
                    }
                }
            }
        } catch (_) {}

        // 3. Search in localStorage uploaded & saved videos
        try {
            const localVids = JSON.parse(localStorage.getItem('knome_my_uploaded_videos') || '[]');
            const savedVids = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const allLocal = [...localVids, ...savedVids];
            const match = findMatchingEpisode(allLocal);
            if (match && isMounted) {
                setHydratedDetails(match);
                return;
            }
        } catch (_) {}

        return () => { isMounted = false; };
    }, [initialVideoInfo.videoId, initialVideoInfo.title]);

    if (isVideosEnabled === false) return null;

    // Combine initial info with hydrated catalog metadata
    const rawEffectiveTitle = hydratedDetails?.title || initialVideoInfo.title;
    const effectiveTitle = cleanMediaTitle(rawEffectiveTitle) || 'Enterprise Video';

    const rawThumb = hydratedDetails?.thumbnail || hydratedDetails?.thumbnailUrl || initialVideoInfo.thumbnailUrl;
    const effectiveThumbnail = rawThumb ? (resolveMediaUrl(rawThumb) || rawThumb) : null;

    const rawSourceUrl = hydratedDetails?.sourceUrl || hydratedDetails?.videoUrl || initialVideoInfo.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    const effectiveVideoUrl = resolveMediaUrl(rawSourceUrl) || rawSourceUrl;

    const effectiveAuthor = hydratedDetails?.author || initialVideoInfo.authorName || 'MPOnline Creator';
    const effectiveRole = hydratedDetails?.authorDesignation || hydratedDetails?.authorRole || initialVideoInfo.authorRole || 'Enterprise Contributor';
    const effectiveAvatar = resolveMediaUrl(hydratedDetails?.authorAvatar || initialVideoInfo.authorAvatar) || null;

    const effectiveCategory = hydratedDetails?.category || initialVideoInfo.category || 'Training & Tutorials';
    const effectiveDuration = hydratedDetails?.duration || initialVideoInfo.duration || 'Session';

    // Meaningful description fallback
    let effectiveDescription = hydratedDetails?.description || initialVideoInfo.description;
    if (!effectiveDescription || effectiveDescription.trim().length < 5 || effectiveDescription.trim() === 'AI') {
        effectiveDescription = `High-definition enterprise video session "${effectiveTitle}" shared by ${effectiveAuthor}. Explore comprehensive architecture insights, best practices, and team walkthroughs.`;
    }

    const videoId = hydratedDetails?.id || initialVideoInfo.videoId || '20048';

    const videoPayload = {
        id: videoId,
        title: effectiveTitle,
        description: effectiveDescription,
        thumbnail: effectiveThumbnail,
        sourceUrl: effectiveVideoUrl,
        author: effectiveAuthor,
        authorDesignation: effectiveRole,
        authorAvatar: effectiveAvatar,
        category: effectiveCategory,
        duration: effectiveDuration,
        likes: hydratedDetails?.likes || initialVideoInfo.likes || 0,
        shares: hydratedDetails?.shares || 0
    };

    const handleOpenPlayback = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (typeof onPlay === 'function') {
            onPlay(videoPayload);
            return;
        }

        // Open in-place professional modal player
        setIsPlayerModalOpen(true);
    };

    const handleNavigateToVideosPage = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        navigate(`/videos?id=${videoId}&title=${encodeURIComponent(effectiveTitle)}&url=${encodeURIComponent(effectiveVideoUrl)}`);
    };

    const authorInitials = (effectiveAuthor || 'M').charAt(0).toUpperCase();

    return (
        <>
            <div
                onClick={handleOpenPlayback}
                className="mt-3.5 mb-2.5 rounded-2xl p-3 sm:p-3.5 bg-gradient-to-r from-slate-50 via-white to-cyan-50/20 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer group select-none overflow-hidden"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        handleOpenPlayback(e);
                    }
                }}
                aria-label={`Play video: ${effectiveTitle}`}
            >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4.5">
                    
                    {/* ── Video Thumbnail Preview & Play Overlay ── */}
                    <div className="relative w-full sm:w-56 md:w-64 h-48 sm:h-36 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-200/60 dark:border-slate-800/80 shadow-xs">
                        {effectiveThumbnail ? (
                            <img
                                src={effectiveThumbnail}
                                alt={effectiveTitle}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1200';
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-2 text-center">
                                <span className="material-symbols-outlined text-cyan-400 text-3xl mb-1">smart_display</span>
                                <span className="text-[11px] font-bold text-slate-300">{effectiveCategory}</span>
                            </div>
                        )}

                        {/* High-contrast gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />

                        {/* Video Category Badge (Top-Left) */}
                        <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/80 backdrop-blur-xs border border-cyan-500/40 text-[9.5px] font-black text-cyan-300 flex items-center gap-1 shadow-md">
                            <span className="material-symbols-outlined text-[12px] text-cyan-400" style={{ fontVariationSettings: "'FILL' 1" }}>smart_display</span>
                            <span>VIDEO</span>
                        </div>

                        {/* Prominent Play Button (Center Overlay) */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-cyan-500/30 transform group-hover:scale-110 transition-transform duration-300 ring-4 ring-white/20">
                                <span className="material-symbols-outlined text-[26px] ml-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                            </div>
                        </div>

                        {/* Duration / Quality Badge (Bottom-Right) */}
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/85 backdrop-blur-xs text-[10px] font-extrabold text-white flex items-center gap-1 shadow-md border border-white/10">
                            <span className="material-symbols-outlined text-[12px] text-cyan-400">schedule</span>
                            <span>{effectiveDuration}</span>
                        </div>
                    </div>

                    {/* ── Metadata & Information Column ── */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-0.5">
                        <div>
                            {/* Header Tags Row */}
                            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/40 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                    <span className="material-symbols-outlined text-[13px]">play_circle</span>
                                    <span>{effectiveCategory}</span>
                                </span>
                                
                                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px]">ondemand_video</span>
                                    <span>Enterprise Stream</span>
                                </span>
                            </div>

                            {/* Video Title */}
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-[17px] group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-1 leading-snug">
                                {effectiveTitle}
                            </h4>

                            {/* Video Description */}
                            <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                                {effectiveDescription}
                            </p>
                        </div>

                        {/* Creator & Actions Footer Row */}
                        <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                            
                            {/* Creator attribution */}
                            <div className="flex items-center gap-2.5 min-w-0">
                                {effectiveAvatar ? (
                                    <img
                                        src={effectiveAvatar}
                                        alt={effectiveAuthor}
                                        className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(effectiveAuthor)}&background=06b6d4&color=fff&bold=true`;
                                        }}
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                        {authorInitials}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                        Shared by <span className="text-slate-900 dark:text-white font-extrabold">{effectiveAuthor}</span>
                                    </p>
                                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                        {effectiveRole}
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleOpenPlayback}
                                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all cursor-pointer"
                                    title="Play video right here"
                                >
                                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                                    <span>Play Video</span>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={handleNavigateToVideosPage}
                                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                                    title="Open video on dedicated page"
                                    aria-label="Open video on dedicated page"
                                >
                                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                </button>
                            </div>

                        </div>
                    </div>

                </div>
            </div>

            {/* Seamless Video Player Modal for In-Place Full Playback */}
            {isPlayerModalOpen && (
                <VideoPlayerModal
                    isOpen={isPlayerModalOpen}
                    onClose={() => setIsPlayerModalOpen(false)}
                    video={videoPayload}
                />
            )}
        </>
    );
}
