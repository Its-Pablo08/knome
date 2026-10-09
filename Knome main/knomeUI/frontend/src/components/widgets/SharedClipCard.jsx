import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveMediaUrl, getVideoThumbnail, clipsApi } from '../../utils/apiService';

/**
 * Formats duration in seconds to M:SS display.
 */
export const formatClipDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const extractString = (val, fallback = '') => {
    if (!val) return fallback;
    if (typeof val === 'string') return val.trim() || fallback;
    if (typeof val === 'object') {
        const str = val.name || val.fullName || val.authorName || val.title || val.username || '';
        return typeof str === 'string' && str.trim() ? str.trim() : fallback;
    }
    return String(val) || fallback;
};

/**
 * Checks if a post represents a shared Clip.
 */
export const isClipPost = (post) => {
    if (!post) return false;
    if (post.sharedClip || post.type === 'clip_share' || post.clipId) return true;

    const content = typeof post.content === 'string' ? post.content : (typeof post.contentText === 'string' ? post.contentText : '');
    return Boolean(
        content.includes('Shared Clip:') ||
        content.includes('Check out this Clip:') ||
        content.includes('/clips?id=') ||
        content.includes('/clips/')
    );
};

/**
 * Extracts and normalizes clip metadata from any post structure.
 */
export const resolveClipInfo = (post) => {
    if (!post) {
        return {
            clipId: null,
            title: 'Knome Clip',
            thumbnailUrl: null,
            videoUrl: null,
            duration: null,
            description: null,
            hashtags: null,
            sharerName: 'Colleague',
            sharerAvatar: null,
            sharerRole: 'Enterprise Contributor'
        };
    }

    const sc = (typeof post.sharedClip === 'object' && post.sharedClip !== null) ? post.sharedClip : {};
    const authorObj = (typeof post.author === 'object' && post.author !== null) ? post.author : null;

    // 1. Clip ID
    let clipId = sc.clipId || sc.id || post.clipId || post.sharedClipId || null;
    const text = typeof post.contentText === 'string' ? post.contentText : (typeof post.content === 'string' ? post.content : '');
    if (!clipId && text) {
        const idMatch = text.match(/\/clips(?:\?id=|\/)([a-zA-Z0-9_-]+)/i) || 
                        (typeof post.link === 'string' ? post.link.match(/\/clips(?:\?id=|\/)([a-zA-Z0-9_-]+)/i) : null);
        if (idMatch) clipId = idMatch[1];
    }

    // 2. Title
    let rawTitle = sc.title || post.clipTitle || null;
    if (!rawTitle && text) {
        const titleMatch = text.match(/(?:Shared Clip:\s*"|Check out this Clip:\s*")([^"\n]+)"/i);
        if (titleMatch) rawTitle = titleMatch[1];
    }
    if (!rawTitle && post.title && typeof post.title === 'string' && (post.title.includes('Clip') || post.type === 'clip_share')) {
        rawTitle = post.title.replace(/^🎬\s*(?:Shared Clip:\s*)?/i, '').replace(/"/g, '').trim();
    }
    const title = extractString(rawTitle, 'Knome Clip');

    // 3. Thumbnail & Video Url
    let thumbnailUrl = sc.thumbnailUrl || sc.thumbnail || post.clipThumbnail || post.thumbnailUrl || post.thumbnail || null;
    let videoUrl = sc.videoUrl || sc.sourceUrl || post.clipVideoUrl || post.videoUrl || null;

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

    const duration = sc.duration || sc.durationSeconds || post.clipDuration || post.durationSeconds || null;
    const description = sc.description || post.clipDescription || post.description || null;
    const hashtags = sc.hashtags || post.clipHashtags || post.hashtags || null;

    // 4. Sharer Info
    const rawSharerName = sc.sharerName || sc.authorName || post.authorFullName || post.authorName || 
                          authorObj?.fullName || authorObj?.name || (typeof post.author === 'string' ? post.author : '') || 
                          'Colleague';
    const sharerName = extractString(rawSharerName, 'Colleague');

    const rawSharerAvatar = sc.sharerAvatar || post.authorProfilePhotoUrl || post.authorAvatar || 
                            authorObj?.avatar || authorObj?.profilePhotoUrl || post.avatar || null;
    const sharerAvatar = (typeof rawSharerAvatar === 'string' && rawSharerAvatar.trim()) ? rawSharerAvatar.trim() : null;

    const rawSharerRole = sc.sharerRole || post.authorDesignation || post.authorRole || 
                          authorObj?.designation || authorObj?.role || post.role || 
                          'Enterprise Contributor';
    const sharerRole = extractString(rawSharerRole, 'Enterprise Contributor');

    return {
        clipId,
        title,
        thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : null,
        videoUrl: typeof videoUrl === 'string' ? videoUrl : null,
        duration,
        description,
        hashtags,
        sharerName,
        sharerAvatar,
        sharerRole
    };
};

/**
 * SharedClipCard Component
 * Displays a professional, elegant, balanced Clip card in feeds.
 * Clicking ANYWHERE on the card opens and plays the exact Clip directly.
 */
export default function SharedClipCard({ post }) {
    const navigate = useNavigate();
    const clipInfo = resolveClipInfo(post);
    const [clipDetails, setClipDetails] = useState(null);

    useEffect(() => {
        const cid = clipInfo.clipId;
        if (!cid) return;
        let isMounted = true;

        try {
            const localClips = JSON.parse(localStorage.getItem('knome_my_uploaded_clips') || '[]');
            const localSaved = JSON.parse(localStorage.getItem('knome_saved_clips') || '[]');
            const found = [...localClips, ...localSaved].find(c => String(c.clipId || c.id) === String(cid));
            if (found && isMounted) {
                setClipDetails(found);
                return;
            }
        } catch {}

        if (typeof clipsApi?.getById === 'function') {
            clipsApi.getById(cid).then(res => {
                const data = res?.data !== undefined ? res.data : res;
                if (data && (data.clipId || data.id) && isMounted) {
                    setClipDetails(data);
                }
            }).catch(() => {});
        }

        return () => { isMounted = false; };
    }, [clipInfo.clipId]);

    const handleOpenClip = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (clipInfo.clipId) {
            navigate(`/clips?id=${clipInfo.clipId}`);
        } else {
            navigate('/clips');
        }
    };

    const effectiveTitle = clipDetails?.title || clipInfo.title || 'Knome Clip';
    const effectiveThumb = resolveMediaUrl(clipDetails?.thumbnailUrl || clipInfo.thumbnailUrl) || clipDetails?.thumbnailUrl || clipInfo.thumbnailUrl;
    const effectiveDuration = clipDetails?.durationSeconds || clipDetails?.duration || clipInfo.duration;
    const durationLabel = formatClipDuration(effectiveDuration);
    
    // Clean and prepare description snippet
    const rawDesc = clipDetails?.description || clipInfo.description || (typeof post?.contentText === 'string' ? post.contentText : (typeof post?.content === 'string' ? post.content : ''));
    let cleanDesc = '';
    if (typeof rawDesc === 'string') {
        cleanDesc = rawDesc
            .replace(/Shared Clip:\s*"[^"]*"/gi, '')
            .replace(/Check out this Clip:\s*"[^"]*"/gi, '')
            .replace(/https?:\/\/[^\s]+/gi, '')
            .replace(/\/clips(?:\?id=|\/)[^\s]+/gi, '')
            .replace(/🎬/g, '')
            .trim();
    }
    if (!cleanDesc || cleanDesc.length < 3) {
        cleanDesc = 'Short-form enterprise video clip. Tap anywhere to open and watch in the vertical player.';
    }

    const effectiveHashtags = clipDetails?.hashtags || clipInfo.hashtags || null;

    return (
        <div
            onClick={handleOpenClip}
            className="mt-3.5 mb-2 rounded-2xl p-3 sm:p-3.5 bg-gradient-to-r from-slate-50 via-white to-pink-50/25 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-pink-500/50 dark:hover:border-pink-500/50 shadow-xs hover:shadow-md transition-all duration-300 cursor-pointer group select-none"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handleOpenClip(e);
                }
            }}
            aria-label={`Watch shared clip: ${effectiveTitle}`}
        >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4">
                
                {/* Thumbnail Preview */}
                <div className="relative w-full sm:w-44 md:w-48 h-40 sm:h-32 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-200/60 dark:border-slate-800/80 shadow-xs">
                    {effectiveThumb ? (
                        <img
                            src={effectiveThumb}
                            alt={effectiveTitle}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600';
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-pink-950 to-slate-950 p-2 text-center">
                            <span className="material-symbols-outlined text-pink-400 text-3xl mb-1">movie_filter</span>
                            <span className="text-[10px] font-bold text-slate-300">Knome Clip</span>
                        </div>
                    )}

                    {/* Gradient overlay for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                    {/* Top Clip Badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-xs border border-pink-500/30 text-[9px] font-black text-pink-300 flex items-center gap-1 shadow-xs">
                        <span className="material-symbols-outlined text-[11px] text-pink-400">movie_filter</span>
                        <span>CLIP</span>
                    </div>

                    {/* Hover subtle play indicator */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                        <div className="w-9 h-9 rounded-full bg-pink-500/90 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-200">
                            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                        </div>
                    </div>

                    {/* Bottom Duration Badge */}
                    {durationLabel && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-bold text-white shadow-xs">
                            {durationLabel}
                        </div>
                    )}
                </div>

                {/* Metadata & Information Column */}
                <div className="flex-1 min-w-0 flex flex-col justify-center self-stretch py-1">
                    <div>
                        {/* Header Tag */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 border border-pink-200 dark:border-pink-800/40 px-2 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                                <span className="material-symbols-outlined text-[13px]">movie_filter</span>
                                <span>KNOME CLIP</span>
                            </span>
                            {durationLabel ? (
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[13px] text-slate-400">timer</span>
                                    {durationLabel}
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    HD Reel
                                </span>
                            )}
                        </div>

                        {/* Title */}
                        <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-[17px] group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors line-clamp-1 leading-snug">
                            {effectiveTitle}
                        </h4>

                        {/* Description snippet */}
                        <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-1 leading-relaxed">
                            {cleanDesc}
                        </p>

                        {/* Hashtags if available */}
                        {effectiveHashtags && (
                            <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1 line-clamp-1">
                                {effectiveHashtags}
                            </p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
