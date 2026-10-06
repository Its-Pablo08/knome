import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmDialogContext';
import ReportModal from '../modals/ReportModal';
import SaveToCategoryModal from '../modals/SaveToCategoryModal';
import DocumentViewerModal from '../modals/DocumentViewerModal';
import ArticleShareModal from '../modals/ArticleShareModal';
import ReactionsModal from '../modals/ReactionsModal';
import HighlightText from '../ui/HighlightText';

import { interactionsApi, postsApi, notificationsApi, searchApi, communitiesApi, resolveMediaUrl, getVideoThumbnail, formatToDDMMYYYY, resolveSharedTarget } from '../../utils/apiService';
import { checkRestrictedContent } from '../../utils/restrictedWords';

// Available reactions (FR-CI-01)
const REACTION_TYPES = {
    like: { icon: '👍', label: 'Like', color: 'text-blue-500' },
    celebrate: { icon: '🎉', label: 'Celebrate', color: 'text-amber-500' },
    support: { icon: '🤝', label: 'Support', color: 'text-purple-500' },
    heart: { icon: '❤️', label: 'Heart', color: 'text-pink-500' }
};

// ─── Fullscreen Image Lightbox ───────────────────────────────
export function ImageLightbox({ images, startIndex, onClose }) {
    const [current, setCurrent] = useState(startIndex);

    const prev = useCallback(() => setCurrent(i => (i - 1 + images.length) % images.length), [images.length]);
    const next = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'ArrowLeft')  prev();
            if (e.key === 'ArrowRight') next();
            if (e.key === 'Escape')     onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [prev, next, onClose]);

    // Prevent body scroll while open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const FALLBACK_MEDIA_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231e293b"/><stop offset="100%" stop-color="%230f172a"/></linearGradient></defs><rect width="800" height="500" fill="url(%23g)"/><circle cx="400" cy="210" r="52" fill="%236366f1" fill-opacity="0.15"/><path d="M380 195l16-20 14 18 12-14 18 24H360z" fill="%23818cf8"/><circle cx="375" cy="180" r="6" fill="%23a5b4fc"/><text x="400" y="295" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700" fill="%23f1f5f9" text-anchor="middle">Knome Enterprise Media</text><text x="400" y="322" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="%2394a3b8" text-anchor="middle">Attachment Preview</text></svg>`;

    return createPortal(
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            {/* Close */}
            <button
                onClick={onClose}
                className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all hover:bg-white/10"
            >
                <span className="material-symbols-outlined text-[24px]">close</span>
            </button>

            {/* Counter */}
            {images.length > 1 && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-white text-[13px] font-bold"
                    style={{ background: 'rgba(255,255,255,0.15)' }}>
                    {current + 1} / {images.length}
                </div>
            )}

            {/* Prev Arrow */}
            {images.length > 1 && (
                <button
                    onClick={e => { e.stopPropagation(); prev(); }}
                    className="absolute left-4 w-12 h-12 rounded-full flex items-center justify-center text-white transition-all hover:bg-white/20"
                >
                    <span className="material-symbols-outlined text-[28px]">arrow_back_ios</span>
                </button>
            )}

            {/* Image */}
            <img
                src={(() => {
                    const itm = images[current];
                    const u = typeof itm === 'string' ? itm : (itm?.url || itm?.fileUrl || '');
                    return resolveMediaUrl(u) || u;
                })()}
                onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_MEDIA_SVG; }}
                alt="Full view"
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
                style={{ userSelect: 'none' }}
                onClick={e => e.stopPropagation()}
            />

            {/* Next Arrow */}
            {images.length > 1 && (
                <button
                    onClick={e => { e.stopPropagation(); next(); }}
                    className="absolute right-4 w-12 h-12 rounded-full flex items-center justify-center text-white transition-all hover:bg-white/20"
                >
                    <span className="material-symbols-outlined text-[28px]">arrow_forward_ios</span>
                </button>
            )}

            {/* Thumbnail strip for multi-image */}
            {images.length > 1 && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                    {images.map((img, i) => (
                        <button
                            key={i}
                            onClick={e => { e.stopPropagation(); setCurrent(i); }}
                            className="w-12 h-12 rounded-lg overflow-hidden border-2 transition-all"
                            style={{ borderColor: i === current ? 'white' : 'rgba(255,255,255,0.3)' }}
                        >
                            <img 
                                src={(() => {
                                    const u = typeof img === 'string' ? img : (img?.url || img?.fileUrl || '');
                                    return resolveMediaUrl(u) || u;
                                })()} 
                                onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_MEDIA_SVG; }} 
                                alt="thumb" 
                                className="w-full h-full object-cover" 
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}

// ─── Large Screen Video Modal (Badi Screen Video Player) ─────────
export function LargeVideoModal({ video, onClose }) {
    const modalRef = useRef(null);
    const videoRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (isFullscreen) {
                    if (document.fullscreenElement) {
                        document.exitFullscreen?.().catch(() => {});
                    }
                    setIsFullscreen(false);
                } else {
                    onClose();
                }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isFullscreen, onClose]);

    if (!video) return null;

    const url = video.url || video.sourceUrl || '';
    const title = video.title || 'Video Playback';
    const isYT = video.isYT || (url.includes('youtube.com') || url.includes('youtu.be'));
    const isVimeo = url.includes('vimeo.com');

    const getEmbedUrl = (u) => {
        if (!u) return '';
        const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=))((\w|-){11})/);
        if (ytMatch && ytMatch[1]) {
            return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
        }
        const vimeoMatch = u.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch && vimeoMatch[1]) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
        }
        return u;
    };

    const toggleFullscreen = () => {
        const elem = modalRef.current;
        if (!elem) return;
        if (!document.fullscreenElement) {
            elem.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    return createPortal(
        <div
            ref={modalRef}
            className={`fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/92 backdrop-blur-xl animate-fade-in ${
                isFullscreen ? 'p-0' : 'p-3 sm:p-5 md:p-8'
            }`}
            onClick={(e) => {
                if (e.target === modalRef.current) onClose();
            }}
        >
            <div 
                className={`relative w-full bg-slate-950 border border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                    isFullscreen ? 'w-screen h-screen rounded-none border-0' : 'max-w-5xl max-h-[94vh] rounded-2xl'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="px-4 sm:px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[22px]">play_circle</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-sm sm:max-w-md md:max-w-lg" title={title}>
                                {title}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    VIDEO
                                </span>
                                <span>•</span>
                                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Large Screen Playback
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={toggleFullscreen}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Close Video"
                        >
                            <span className="material-symbols-outlined text-[22px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Player Body */}
                <div className="flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[320px] max-h-[78vh]">
                    {isYT || isVimeo ? (
                        <iframe
                            src={getEmbedUrl(url)}
                            className="w-full h-full aspect-video border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            title={title}
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            src={url}
                            controls
                            autoPlay
                            controlsList="nodownload"
                            disablePictureInPicture
                            onContextMenu={(e) => e.preventDefault()}
                            className="w-full h-full max-h-[78vh] object-contain"
                        />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── Image Grid (full-width cover layout) ────────────────────
const FALLBACK_GRID_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%231e293b"/><stop offset="100%" stop-color="%230f172a"/></linearGradient></defs><rect width="800" height="500" fill="url(%23bgG)"/><circle cx="400" cy="210" r="52" fill="%236366f1" fill-opacity="0.15"/><path d="M380 195l16-20 14 18 12-14 18 24H360z" fill="%23818cf8"/><circle cx="375" cy="180" r="6" fill="%23a5b4fc"/><text x="400" y="295" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700" fill="%23f1f5f9" text-anchor="middle">Knome Enterprise Media</text><text x="400" y="322" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="%2394a3b8" text-anchor="middle">Attachment</text></svg>`;

export function ImageGrid({ images, onImageClick }) {
    const [isImagesExpanded, setIsImagesExpanded] = useState(false);
    const validImages = (images || []).filter(img => {
        if (!img) return false;
        const u = typeof img === 'string' ? img : (img.url || img.fileUrl);
        return typeof u === 'string' && u.trim().length > 0;
    });
    if (validImages.length === 0) return null;

    const getImgUrl = (img) => {
        const u = typeof img === 'string' ? img : (img.url || img.fileUrl);
        return resolveMediaUrl(u) || u;
    };

    // Single image — full width, tall cover
    if (validImages.length === 1) {
        return (
            <div
                className="w-full overflow-hidden cursor-zoom-in group relative"
                style={{ maxHeight: '520px' }}
                onClick={() => onImageClick(0)}
            >
                <img
                    src={getImgUrl(validImages[0])}
                    onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }}
                    alt="Post media"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    style={{ maxHeight: '520px', display: 'block' }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
            </div>
        );
    }

    // Two images — side by side
    if (validImages.length === 2) {
        return (
            <div className="w-full grid grid-cols-2 gap-0.5" style={{ height: '360px' }}>
                {validImages.map((img, i) => (
                    <div
                        key={i}
                        className="overflow-hidden cursor-zoom-in group relative"
                        onClick={() => onImageClick(i)}
                    >
                        <img 
                            src={getImgUrl(img)} 
                            onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }} 
                            alt="Post media" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                    </div>
                ))}
            </div>
        );
    }

    // Three images — 1 big left, 2 stacked right
    if (validImages.length === 3) {
        return (
            <div className="w-full grid grid-cols-2 gap-0.5" style={{ height: '380px' }}>
                <div className="overflow-hidden cursor-zoom-in group relative row-span-2" onClick={() => onImageClick(0)}>
                    <img 
                        src={getImgUrl(validImages[0])} 
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }} 
                        alt="Post media" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                </div>
                {validImages.slice(1, 3).map((img, i) => (
                    <div key={i} className="overflow-hidden cursor-zoom-in group relative" style={{ height: '189px' }} onClick={() => onImageClick(i + 1)}>
                        <img 
                            src={getImgUrl(img)} 
                            onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }} 
                            alt="Post media" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                    </div>
                ))}
            </div>
        );
    }

    // Four or more images — show 4 with Read More button after 4 images
    const showImages = validImages.slice(0, 4);
    const extraCount = validImages.length - 4;

    if (extraCount > 0 && isImagesExpanded) {
        return (
            <div className="w-full flex flex-col">
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-1 p-1 bg-slate-100/60 dark:bg-slate-900/60">
                    {validImages.map((img, i) => (
                        <div
                            key={i}
                            className="overflow-hidden cursor-zoom-in group relative rounded-lg"
                            style={{ height: '200px' }}
                            onClick={() => onImageClick(i)}
                        >
                            <img 
                                src={getImgUrl(img)} 
                                onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }} 
                                alt={`Post media ${i + 1}`} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                        </div>
                    ))}
                </div>
                <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        Showing all {validImages.length} images
                    </span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsImagesExpanded(false);
                        }}
                        className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    >
                        <span>Show less</span>
                        <span className="material-symbols-outlined text-[15px]">expand_less</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col">
            <div className="w-full grid grid-cols-2 gap-0.5" style={{ height: '380px' }}>
                {showImages.map((img, i) => (
                    <div
                        key={i}
                        className="overflow-hidden cursor-zoom-in group relative"
                        onClick={() => {
                            if (i === 3 && extraCount > 0) {
                                setIsImagesExpanded(true);
                            } else {
                                onImageClick(i);
                            }
                        }}
                    >
                        <img 
                            src={getImgUrl(img)} 
                            onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_GRID_SVG; }} 
                            alt="Post media" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" 
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                        {/* Read more overlay on 4th cell when extraCount > 0 */}
                        {i === 3 && extraCount > 0 && (
                            <div 
                                className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer"
                                style={{ background: 'rgba(0,0,0,0.6)' }}
                            >
                                <span className="text-white text-2xl font-black">+{extraCount}</span>
                                <span className="text-white text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1 transition-colors">
                                    <span className="material-symbols-outlined text-[13px]">collections</span>
                                    Read more
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {extraCount > 0 && (
                <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        Showing 4 of {validImages.length} images
                    </span>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsImagesExpanded(true);
                        }}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    >
                        <span>Read more ({extraCount} more photos)</span>
                        <span className="material-symbols-outlined text-[15px]">expand_more</span>
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Interaction Caching Helpers (Survives F5 / Page Refresh) ─────────
const getCachedPostInteraction = (postId) => {
    if (!postId) return null;
    try {
        const raw = localStorage.getItem(`knome_post_interaction_${postId}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const setCachedPostInteraction = (postId, updates) => {
    if (!postId) return;
    try {
        const key = `knome_post_interaction_${postId}`;
        const existing = getCachedPostInteraction(postId) || {};
        const merged = { ...existing, ...updates, updatedAt: Date.now() };
        localStorage.setItem(key, JSON.stringify(merged));

        // Sync with knome_local_posts if post is stored locally
        try {
            const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
            let modified = false;
            const updated = localPosts.map(lp => {
                if (String(lp.id || lp.postId) === String(postId)) {
                    modified = true;
                    return {
                        ...lp,
                        likes: updates.likeCount !== undefined ? updates.likeCount : (lp.likes || 0),
                        likesCount: updates.likeCount !== undefined ? updates.likeCount : (lp.likesCount || 0),
                        userReaction: updates.reaction !== undefined ? updates.reaction : lp.userReaction,
                        comments: updates.commentCount !== undefined ? updates.commentCount : (lp.comments || 0),
                        commentsCount: updates.commentCount !== undefined ? updates.commentCount : (lp.commentsCount || 0)
                    };
                }
                return lp;
            });
            if (modified) {
                localStorage.setItem('knome_local_posts', JSON.stringify(updated));
            }
        } catch (_) {}

        // Sync with any community posts stored in localStorage
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const storageKey = localStorage.key(i);
                if (storageKey && storageKey.startsWith('knome_community_posts_')) {
                    const commPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    let cModified = false;
                    const cUpdated = commPosts.map(cp => {
                        if (String(cp.id || cp.postId) === String(postId)) {
                            cModified = true;
                            return {
                                ...cp,
                                likes: updates.likeCount !== undefined ? updates.likeCount : (cp.likes || 0),
                                likesCount: updates.likeCount !== undefined ? updates.likeCount : (cp.likesCount || 0),
                                userReaction: updates.reaction !== undefined ? updates.reaction : cp.userReaction,
                                comments: updates.commentCount !== undefined ? updates.commentCount : (cp.comments || 0),
                                commentsCount: updates.commentCount !== undefined ? updates.commentCount : (cp.commentsCount || 0)
                            };
                        }
                        return cp;
                    });
                    if (cModified) {
                        localStorage.setItem(storageKey, JSON.stringify(cUpdated));
                    }
                }
            }
        } catch (_) {}
    } catch (e) {
        console.warn('Error saving post interaction cache:', e);
    }
};

export default function PostCard({ post, onPostDeleted, searchQuery = '', isAuthorFollowed = false, isAuthorFollower = false }) {
    const { currentUser, awardRuleKarma } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    
    // Persistent Interaction States
    const postIdStr = String(post.id || post.postId || '');
    const cachedInteraction = getCachedPostInteraction(postIdStr);

    const rawServerLikes = Number(
        post.likes ?? 
        post.likesCount ?? 
        post.likeCount ?? 
        post.engagementSummary?.reactionSummary?.totalCount ?? 
        post.engagementSummary?.reactionSummary?.likeCount ?? 
        0
    );
    const initialLikeCount = cachedInteraction?.likeCount != null 
        ? Math.max(Number(cachedInteraction.likeCount), rawServerLikes) 
        : rawServerLikes;

    const initialReaction = cachedInteraction?.reaction !== undefined 
        ? cachedInteraction.reaction 
        : (post.userReaction || post.engagementSummary?.reactionSummary?.currentUserReactionType?.toLowerCase() || null);

    const [reaction, setReaction] = useState(initialReaction);
    const [likeCount, setLikeCount] = useState(initialLikeCount);
    const [shareCount, setShareCount] = useState(post.shares || post.sharesCount || 0);
    const [reactionsList, setReactionsList] = useState(post.reactions || []);
    const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);
    const [isPublishingNow, setIsPublishingNow] = useState(false);
    const isScheduled = Boolean(post.isScheduledFuture || post.status === 'Scheduled');
    const isDraft = Boolean(post.status === 'Draft');
    const [isContentExpanded, setIsContentExpanded] = useState(false);

    // Distinct reaction types currently active on this post
    const activeReactionTypes = React.useMemo(() => {
        const types = new Set();
        if (Array.isArray(post.topReactionTypes)) {
            post.topReactionTypes.forEach(t => t && types.add(t.toLowerCase()));
        }
        if (Array.isArray(post.reactionSummary?.topReactionTypes)) {
            post.reactionSummary.topReactionTypes.forEach(t => t && types.add(t.toLowerCase()));
        }
        if (Array.isArray(reactionsList)) {
            reactionsList.forEach(r => {
                const t = (r.reactionType || '').toLowerCase();
                if (t) types.add(t);
            });
        }
        if (reaction) {
            types.add(reaction.toLowerCase());
        }
        if (types.size === 0 && likeCount > 0) {
            types.add('like');
        }
        return Array.from(types);
    }, [post.topReactionTypes, post.reactionSummary, reactionsList, reaction, likeCount]);

    const [isSaved, setIsSaved] = useState(() => {
        const bookmarkedIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
        return post.isSaved || bookmarkedIds.includes(String(post.id));
    }); // FR-CI-04
    const [isSaveCategoryModalOpen, setIsSaveCategoryModalOpen] = useState(false);
    const [showComments, setShowComments] = useState(Boolean(post.isHighlighted));
    const [hasFetchedComments, setHasFetchedComments] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [reactionHover, setReactionHover] = useState(false);

    // Share Modal State
    const [shareMode, setShareMode] = useState('menu'); // 'menu' | 'community' | 'userSearch'
    const [shareSearchQuery, setShareSearchQuery] = useState('');
    const [shareSearchResults, setShareSearchResults] = useState([]);
    const [isShareSearching, setIsShareSearching] = useState(false);
    const [selectedShareUsers, setSelectedShareUsers] = useState([]);
    // Community share state
    const [shareCommunities, setShareCommunities] = useState([]);
    const [selectedShareCommunityId, setSelectedShareCommunityId] = useState('');
    const [loadingCommunities, setLoadingCommunities] = useState(false);
    const [isSharingToCommunity, setIsSharingToCommunity] = useState(false);

    // Lightbox & Document Viewer & Large Video Modal state
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [activeDocViewer, setActiveDocViewer] = useState(null);
    const [activeVideoModal, setActiveVideoModal] = useState(null);
    
    // Menu & Report (FR-SM-02)
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const menuRef = useRef(null);
    
    // Comments State with cache hydration
    const rawServerCommentCount = Number(
        post.commentsCount ?? 
        post.commentCount ?? 
        post.engagementSummary?.commentsCount ?? 
        (Array.isArray(post.comments) ? post.comments.length : 0)
    ) || 0;

    const initialCommentCount = cachedInteraction?.commentCount != null
        ? Math.max(Number(cachedInteraction.commentCount), rawServerCommentCount)
        : rawServerCommentCount;

    const [comments, setComments] = useState(post.comments || []);
    const [commentCount, setCommentCount] = useState(initialCommentCount);
    const [newComment, setNewComment] = useState('');
    const [isLoadingComments, setIsLoadingComments] = useState(false);

    // Synchronize props updates with cached values (protects against count disappearing on refresh or re-fetch)
    useEffect(() => {
        const idStr = String(post.id || post.postId || '');
        if (!idStr) return;
        const cached = getCachedPostInteraction(idStr);

        const sLikes = Number(
            post.likes ?? 
            post.likesCount ?? 
            post.likeCount ?? 
            post.engagementSummary?.reactionSummary?.totalCount ?? 
            post.engagementSummary?.reactionSummary?.likeCount ?? 
            0
        );
        const effLikes = cached?.likeCount != null ? Math.max(Number(cached.likeCount), sLikes) : sLikes;
        setLikeCount(effLikes);

        const sReaction = post.userReaction || post.engagementSummary?.reactionSummary?.currentUserReactionType?.toLowerCase() || null;
        const effReaction = cached?.reaction !== undefined ? cached.reaction : sReaction;
        setReaction(effReaction);

        const sComments = Number(
            post.commentsCount ?? 
            post.commentCount ?? 
            post.engagementSummary?.commentsCount ?? 
            (Array.isArray(post.comments) ? post.comments.length : 0)
        ) || 0;
        const effComments = cached?.commentCount != null ? Math.max(Number(cached.commentCount), sComments) : sComments;
        setCommentCount(effComments);
    }, [
        post.id, 
        post.postId, 
        post.likes, 
        post.likesCount, 
        post.likeCount, 
        post.commentsCount, 
        post.commentCount, 
        post.userReaction, 
        post.engagementSummary
    ]);

    // Synchronize isSaved with global bookmark events
    useEffect(() => {
        const handleBookmarkUpdate = (e) => {
            const curPostId = String(post.id || post.postId || '');
            const targetId = String(e?.detail?.id || e?.detail?.contentId || '');
            if (curPostId && targetId && curPostId === targetId) {
                if (e?.detail?.removed) {
                    setIsSaved(false);
                } else {
                    setIsSaved(true);
                }
            }
        };
        window.addEventListener('knome-bookmark-saved', handleBookmarkUpdate);
        return () => window.removeEventListener('knome-bookmark-saved', handleBookmarkUpdate);
    }, [post.id, post.postId]);

    // Fetch genuine comments from database API when user expands comments
    useEffect(() => {
        if (showComments && !hasFetchedComments) {
            setIsLoadingComments(true);
            interactionsApi.getComments('Post', post.id)
                .then(res => {
                    const apiComments = Array.isArray(res) ? res : (res?.data || []);
                    if (apiComments.length > 0) {
                        const formatted = apiComments.map(c => ({
                            id: c.commentId || c.id,
                            author: c.authorFullName || c.authorName || 'Colleague',
                            avatar: resolveMediaUrl(c.authorProfilePhotoUrl || c.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorFullName || 'User')}&background=6366f1&color=fff`,
                            text: c.commentText || c.text,
                            time: formatToDDMMYYYY(c.createdDate || c.createdAt || Date.now()),
                            likesCount: c.likesCount || 0,
                            isLiked: Boolean(c.isLiked),
                            userReaction: c.userReactionType?.toLowerCase() || (c.isLiked ? 'like' : null),
                            topReactionTypes: c.topReactionTypes || [],
                            replies: (c.replies || []).map(r => ({
                                id: r.commentId || r.id,
                                author: r.authorFullName || r.authorName || 'Colleague',
                                avatar: resolveMediaUrl(r.authorProfilePhotoUrl || r.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.authorFullName || 'User')}&background=6366f1&color=fff`,
                                text: r.commentText || r.text,
                                time: formatToDDMMYYYY(r.createdDate || Date.now()),
                                likesCount: r.likesCount || 0,
                                isLiked: Boolean(r.isLiked),
                                userReaction: r.userReactionType?.toLowerCase() || (r.isLiked ? 'like' : null),
                                topReactionTypes: r.topReactionTypes || [],
                                replies: []
                            }))
                        }));
                        setComments(formatted);
                        const genuineCount = Math.max(formatted.length, commentCount);
                        setCommentCount(genuineCount);
                        setCachedPostInteraction(String(post.id || post.postId), { commentCount: genuineCount });
                    }
                    setHasFetchedComments(true);
                })
                .catch(() => setHasFetchedComments(true))
                .finally(() => setIsLoadingComments(false));
        }
    }, [showComments, hasFetchedComments, post.id, post.postId]);

    // Real-time live count updates from SignalR (Reactions, Comments, Shares)
    useEffect(() => {
        const handleReactionUpdated = (e) => {
            const data = e.detail;
            if (data && String(data.contentId) === String(post.id) && String(data.contentType).toLowerCase() === 'post') {
                if (typeof data.totalLikes === 'number') {
                    setLikeCount(data.totalLikes);
                }
            }
        };

        const handleCommentUpdated = (e) => {
            const data = e.detail;
            if (data && String(data.contentId) === String(post.id) && String(data.contentType).toLowerCase() === 'post') {
                if (typeof data.commentsCount === 'number') {
                    setCommentCount(data.commentsCount);
                }
            }
        };

        const handleShareUpdated = (e) => {
            const data = e.detail;
            if (data && String(data.contentId) === String(post.id) && String(data.contentType).toLowerCase() === 'post') {
                if (typeof data.sharesCount === 'number') {
                    setShareCount(data.sharesCount);
                }
            }
        };

        window.addEventListener('knome:reaction-updated', handleReactionUpdated);
        window.addEventListener('knome:comment-updated', handleCommentUpdated);
        window.addEventListener('knome:share-updated', handleShareUpdated);

        return () => {
            window.removeEventListener('knome:reaction-updated', handleReactionUpdated);
            window.removeEventListener('knome:comment-updated', handleCommentUpdated);
            window.removeEventListener('knome:share-updated', handleShareUpdated);
        };
    }, [post.id]);
    
    // Total live comment count including nested replies
    const nestedRepliesCount = comments.reduce((acc, c) => acc + (Array.isArray(c.replies) ? c.replies.length : 0), 0);
    const displayCommentCount = comments.length > 0 ? (comments.length + nestedRepliesCount) : commentCount;

    const handleAddComment = async (e, parentCommentId = null) => {
        if (e && e.preventDefault) e.preventDefault();
        const commentText = newComment.trim();
        const foundKeyword = checkRestrictedContent(commentText);
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use restricted or abusive words ("${foundKeyword}").`, 'error');
            return;
        }
        setNewComment('');

        const curPostId = String(post.id || post.postId || '');

        try {
            const added = await interactionsApi.addComment('Post', post.id, commentText, parentCommentId);
            const formatted = {
                id: added?.commentId || added?.id || Date.now(),
                commentId: added?.commentId || added?.id,
                author: added?.authorFullName || currentUser?.name || currentUser?.fullName || 'You',
                avatar: resolveMediaUrl(added?.authorProfilePhotoUrl || currentUser?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || 'You')}&background=6366f1&color=fff`,
                text: added?.commentText || commentText,
                time: 'Just now',
                likesCount: 0,
                isLiked: false,
                replies: []
            };

            setComments(prev => [formatted, ...prev]);
            setCommentCount(prev => {
                const nextCount = prev + 1;
                setCachedPostInteraction(curPostId, { commentCount: nextCount });
                return nextCount;
            });
            if (awardRuleKarma && (post.userId || post.authorId)) {
                awardRuleKarma(post.userId || post.authorId, 'COMMENT_RECEIVED');
            }
        } catch (error) {
            console.error('Failed to add comment', error);
            const optimistic = {
                id: Date.now(),
                author: currentUser?.name || currentUser?.fullName || 'You',
                avatar: currentUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || 'You')}&background=6366f1&color=fff`,
                text: commentText,
                time: 'Just now',
                replies: []
            };
            setComments(prev => [optimistic, ...prev]);
            setCommentCount(prev => {
                const nextCount = prev + 1;
                setCachedPostInteraction(curPostId, { commentCount: nextCount });
                return nextCount;
            });
        }
    };
    
    // Timer for reaction popover delay
    const hoverTimeoutRef = useRef(null);

    // Helper to identify true image attachments
    const isImageAttachment = (a) => {
        if (!a) return false;
        const u = (a.url || a.fileUrl || '').split('?')[0].toLowerCase();
        const t = (a.type || a.fileType || '').toLowerCase();
        if (u.match(/\.(mp4|webm|ogg|mov|mkv|avi|mp3|wav|aac|m4a|flac|pdf|doc|docx|txt|xls|xlsx|ppt|pptx|csv)$/i)) {
            return false;
        }
        if (t === 'image' || t === 'img' || t === 'photo') return true;
        return Boolean(u.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp|ico)$/i)) || u.startsWith('data:image/');
    };

    // Separate image attachments from other attachments
    const imageAttachments = (post.attachments || []).filter(isImageAttachment);
    const otherAttachments = (post.attachments || []).filter(a => !isImageAttachment(a));

    const handleCopyPostLink = () => {
        const link = `${window.location.origin}/posts?id=${post.id}`;
        navigator.clipboard.writeText(link).then(() => {
            setShareCount(prev => prev + 1);
            addToast('Post permalink copied to clipboard!', 'success');
            setIsShareOpen(false);
        }).catch(() => {
            addToast('Failed to copy link', 'error');
        });
    };

    const handleShareToTimeline = async () => {
        try {
            await interactionsApi.shareContent('Post', post.id, 'Timeline');
            setShareCount(prev => prev + 1);
            if (awardRuleKarma && (post.userId || post.authorId)) {
                awardRuleKarma(post.userId || post.authorId, 'SHARE_RECEIVED');
            }
            addToast('Post shared to your timeline successfully!', 'success');
            setIsShareOpen(false);
        } catch (error) {
            console.error('Failed to share post', error);
            addToast('Failed to share post', 'error');
        }
    };

    const handleShareToCommunity = async () => {
        if (!selectedShareCommunityId) {
            addToast('Please select a community to share to.', 'warning');
            return;
        }
        setIsSharingToCommunity(true);
        const commIdNum = parseInt(selectedShareCommunityId);
        const postShareUrl = `${window.location.origin}/posts?id=${post.id}`;
        const postTitle = post.title || (post.content ? (post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content) : 'Post');

        try {
            // 1. Record backend share interaction
            await interactionsApi.shareContent('Post', post.id, 'Community', commIdNum).catch(() => {});
            
            // 2. Persist post to SQL Server database
            try {
                await postsApi.create({
                    contentText: `Shared Post: "${postTitle}"\n${postShareUrl}`,
                    audienceType: 'Community',
                    audienceCommunityIds: [commIdNum]
                });
            } catch (err) {
                console.warn('Backend community post creation notice:', err);
            }

            // 3. Save to local community posts feed for immediate UI update
            const newCommFeedPost = {
                id: `shared_post_${Date.now()}`,
                userId: currentUser?.userId || currentUser?.id || 1,
                author: currentUser?.fullName || currentUser?.name || 'Employee',
                authorName: currentUser?.fullName || currentUser?.name || 'Employee',
                authorRole: currentUser?.roleName || 'Member',
                authorAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                avatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                time: 'Just now',
                timeAgo: 'Just now',
                publishedDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                title: `Shared Post: "${postTitle}"`,
                content: `Shared Post: "${postTitle}"\n${postShareUrl}`,
                communityId: commIdNum,
                type: 'post_share',
                sharedPostId: post.id,
                sharedContent: {
                    type: 'Post',
                    id: post.id,
                    title: postTitle,
                    url: postShareUrl,
                    author: post.authorName || post.author || 'Employee'
                },
                likes: 0,
                comments: 0,
                shares: 0,
                attachments: post.attachments || [],
                images: imageAttachments || [],
                attachmentUrls: (post.attachments || []).map(a => a.url || a.fileUrl || a),
                isPinned: false
            };

            const savedKey = `knome_community_posts_${selectedShareCommunityId}`;
            const existingCommPosts = JSON.parse(localStorage.getItem(savedKey) || '[]');
            localStorage.setItem(savedKey, JSON.stringify([newCommFeedPost, ...existingCommPosts]));

            try {
                const globalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                localStorage.setItem('knome_local_posts', JSON.stringify([newCommFeedPost, ...globalPosts]));
            } catch (_) {}

            // 4. Dispatch storage and custom events for instant feed update
            window.dispatchEvent(new StorageEvent('storage', { key: savedKey }));
            window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: selectedShareCommunityId, post: newCommFeedPost } }));
            window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: selectedShareCommunityId, post: newCommFeedPost } }));
            window.dispatchEvent(new CustomEvent('post-created'));

            setShareCount(prev => prev + 1);
            if (awardRuleKarma && (post.userId || post.authorId)) {
                awardRuleKarma(post.userId || post.authorId, 'SHARE_RECEIVED');
            }
            addToast('🎉 Post successfully shared to community feed!', 'success');
            setIsShareOpen(false);
            setShareMode('menu');
        } catch (error) {
            console.error('Failed to share post to community', error);
            addToast('Failed to share post to community', 'error');
        } finally {
            setIsSharingToCommunity(false);
        }
    };

    const handleShareWithUsers = async () => {
        if (selectedShareUsers.length === 0) {
            addToast('Please select at least one user to share with.', 'warning');
            return;
        }
        try {
            const senderName = currentUser?.fullName || currentUser?.name || 'Someone';
            const postTitle = post.title || (post.content ? (post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content) : 'Post');
            const textMsg = `${senderName} shared a post with you: "${postTitle}"`;
            const postShareUrl = `${window.location.origin}/posts?id=${post.id}`;

            // 1. Backend interactions and notifications
            await Promise.all(selectedShareUsers.map(async (u) => {
                const targetId = u.id || u.userId;
                try {
                    await interactionsApi.shareContent('Post', post.id, 'User', targetId);
                } catch (_) {}
                try {
                    await notificationsApi.create({
                        recipientUserId: targetId,
                        notificationType: 'Share',
                        message: textMsg,
                        relatedContentType: 'Post',
                        referenceId: post.id
                    });
                } catch (_) {}
            }));

            setShareCount(prev => prev + selectedShareUsers.length);
            if (awardRuleKarma && (post.userId || post.authorId)) {
                awardRuleKarma(post.userId || post.authorId, 'SHARE_RECEIVED');
            }

            // 2. Save local notification event for immediate UI update with recipient isolation
            const notifsToStore = selectedShareUsers.map(u => ({
                id: `local_share_post_${post.id}_${u.id || u.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'share',
                category: 'Shares',
                icon: 'chat',
                color: 'text-blue-500',
                bg: 'bg-blue-500/10',
                text: textMsg,
                message: textMsg,
                senderName,
                senderAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                targetUserId: u.id || u.userId,
                targetEmployeeId: u.employeeId,
                recipientUserId: u.id || u.userId,
                employeeId: u.employeeId,
                unread: true,
                targetUrl: postShareUrl,
                actionLink: postShareUrl,
                linkUrl: postShareUrl,
                relatedContentType: 'Post',
                relatedContentId: post.id,
                title: postTitle
            }));

            const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            localStorage.setItem('knome_notifications', JSON.stringify([...notifsToStore, ...existingNotifs]));

            // 3. Dispatch real-time events for notification bell & dropdown update
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_notifications' }));
            window.dispatchEvent(new CustomEvent('notification-updated'));
            window.dispatchEvent(new CustomEvent('knome_new_notification'));
            notifsToStore.forEach(n => {
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: n }));
            });

            addToast(`🚀 Post successfully shared with ${selectedShareUsers.length} user(s)!`, 'success');
            setIsShareOpen(false);
            setShareMode('menu');
            setSelectedShareUsers([]);
            setShareSearchQuery('');
        } catch (error) {
            console.error('Failed to share post with users', error);
            addToast('Failed to share post with some users.', 'error');
        }
    };

    const { users: contextUsers } = useUser();
    const [allPlatformUsers, setAllPlatformUsers] = useState([]);

    useEffect(() => {
        if (!isShareOpen || shareMode !== 'userSearch') return;

        const loadUsers = async () => {
            setIsShareSearching(true);
            try {
                let merged = [...(contextUsers || [])];
                try {
                    const res = await searchApi.searchUsers(shareSearchQuery.trim()).catch(() => null);
                    const apiList = Array.isArray(res) ? res : (res?.items || []);
                    apiList.forEach(u => {
                        const uId = u.userId || u.id;
                        if (uId && !merged.some(m => String(m.userId || m.id) === String(uId))) {
                            merged.push({
                                id: uId,
                                userId: uId,
                                employeeId: u.employeeId,
                                name: u.fullName || u.name || u.title,
                                fullName: u.fullName || u.name || u.title,
                                role: u.roleName || u.role || u.designation || u.summary || 'Employee',
                                department: u.departmentName || u.department || 'MPOnline',
                                avatar: u.profilePhotoUrl || u.avatar || null
                            });
                        }
                    });
                } catch {}

                const currentId = String(currentUser?.userId || currentUser?.id || '');
                const currentEmpId = String(currentUser?.employeeId || '').toLowerCase();
                const filtered = merged.filter(u => {
                    const idMatch = String(u.userId || u.id) === currentId;
                    const empMatch = currentEmpId && String(u.employeeId || '').toLowerCase() === currentEmpId;
                    return !idMatch && !empMatch;
                });
                setAllPlatformUsers(filtered);
            } finally {
                setIsShareSearching(false);
            }
        };

        loadUsers();
    }, [isShareOpen, shareMode, contextUsers, currentUser, shareSearchQuery]);

    const displayedShareUsers = React.useMemo(() => {
        if (!shareSearchQuery.trim()) return allPlatformUsers;
        const query = shareSearchQuery.trim().toLowerCase();
        const matches = allPlatformUsers.filter(u => {
            const name = (u.name || u.fullName || '').toLowerCase();
            const empId = (u.employeeId || '').toLowerCase();
            const role = (u.role || u.roleName || u.designation || '').toLowerCase();
            const dept = (u.department || '').toLowerCase();
            return name.includes(query) || empId.includes(query) || role.includes(query) || dept.includes(query);
        });

        return matches.sort((a, b) => {
            const aName = (a.name || a.fullName || '').toLowerCase();
            const bName = (b.name || b.fullName || '').toLowerCase();
            const aStarts = aName.startsWith(query) ? 0 : (aName.includes(query) ? 1 : 2);
            const bStarts = bName.startsWith(query) ? 0 : (bName.includes(query) ? 1 : 2);
            if (aStarts !== bStarts) return aStarts - bStarts;
            return aName.localeCompare(bName);
        });
    }, [allPlatformUsers, shareSearchQuery]);

    // Fetch communities when entering community share mode
    useEffect(() => {
        if (shareMode !== 'community' || shareCommunities.length > 0) return;
        let isMounted = true;
        const fetchCommunities = async () => {
            setLoadingCommunities(true);
            try {
                const res = await communitiesApi.getMyCommunities();
                if (isMounted) {
                    const list = Array.isArray(res) ? res : (res?.data || res?.items || []);
                    setShareCommunities(list);
                    if (list.length > 0) {
                        setSelectedShareCommunityId(String(list[0].communityId || list[0].id || ''));
                    }
                }
            } catch (err) {
                console.error('Failed to load communities for share', err);
            } finally {
                if (isMounted) setLoadingCommunities(false);
            }
        };
        fetchCommunities();
        return () => { isMounted = false; };
    }, [shareMode, shareCommunities.length]);

    const currentUserId = currentUser?.userId || currentUser?.id;
    const postAuthorId = post.author?.id || post.author?.userId || post.authorUserId || post.authorId || post.userId;
    const isAuthor = Boolean(currentUserId && postAuthorId && String(currentUserId) === String(postAuthorId));

    const isUserAdmin = Boolean(
        currentUser?.isAdmin === true ||
        ['SYSADM', 'HRADM', 'CADM'].includes(currentUser?.role) ||
        ['System Administrator', 'HR Administrator', 'Community Admin', 'Community Administrator'].includes(currentUser?.roleName) ||
        (currentUser?.role && currentUser.role.toLowerCase().includes('admin')) ||
        (currentUser?.roleName && currentUser.roleName.toLowerCase().includes('admin')) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => typeof r === 'string' && (r.toLowerCase().includes('admin') || ['SYSADM', 'HRADM', 'CADM'].includes(r))))
    );

    // Allow author, admins, or any user for orphaned/local/broken posts to delete
    const isOrphanedOrLocalPost = Boolean(
        !postAuthorId ||
        post.author?.name === 'User' ||
        post.authorName === 'User' ||
        post.authorRole === 'CONTRIBUTOR' ||
        post.author?.role === 'CONTRIBUTOR' ||
        String(post.id || '').startsWith('post_local') ||
        String(post.postId || '').startsWith('post_local') ||
        post.isLocal
    );

    const canDeletePost = isAuthor || isUserAdmin || isOrphanedOrLocalPost;

    const handleDeletePost = async () => {
        if (!await confirm({ 
            title: 'Delete Post', 
            message: 'Are you sure you want to delete this post? This action cannot be undone.', 
            confirmText: 'Delete', 
            variant: 'danger' 
        })) return;

        const targetPostId = post.id || post.postId;
        if (!targetPostId) return;

        try {
            // 1. Immediately purge from local fallback posts in localStorage
            try {
                const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                const updated = localPosts.filter(lp => String(lp.id || lp.postId) !== String(targetPostId));
                localStorage.setItem('knome_local_posts', JSON.stringify(updated));
            } catch (e) {
                console.warn('Could not clean local storage:', e);
            }

            // 2. Add to persistent deleted IDs blacklist so it never reappears
            try {
                const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]');
                if (!deletedIds.includes(String(targetPostId))) {
                    deletedIds.push(String(targetPostId));
                    localStorage.setItem('knome_deleted_post_ids', JSON.stringify(deletedIds));
                }
            } catch (e) {
                console.warn('Could not update deleted ids:', e);
            }

            // 3. If numeric backend ID, call backend DELETE API
            const isNumericId = /^\d+$/.test(String(targetPostId));
            if (isNumericId) {
                try {
                    await postsApi.delete(targetPostId);
                } catch (apiErr) {
                    console.warn('Backend delete response (handled gracefully):', apiErr);
                }
            }

            setIsMenuOpen(false);
            window.dispatchEvent(new CustomEvent('post-deleted', { detail: { id: targetPostId } }));
            if (onPostDeleted) onPostDeleted(targetPostId);
            addToast("Post deleted successfully", "success");
        } catch (error) {
            console.error("Failed to delete post:", error);
            setIsMenuOpen(false);
            window.dispatchEvent(new CustomEvent('post-deleted', { detail: { id: targetPostId } }));
            if (onPostDeleted) onPostDeleted(targetPostId);
            addToast("Post removed", "success");
        }
    };

    const handlePublishNow = async () => {
        if (!await confirm({ 
            title: 'Publish Post Now', 
            message: 'Are you sure you want to publish this scheduled post immediately to the network feed?', 
            confirmText: 'Publish Now', 
            variant: 'primary' 
        })) return;

        const targetPostId = post.id || post.postId;
        if (!targetPostId) return;

        setIsPublishingNow(true);
        try {
            const isNumericId = /^\d+$/.test(String(targetPostId));
            if (isNumericId) {
                await postsApi.update(targetPostId, {
                    contentText: post.content || '',
                    audienceType: post.audienceType || 'Everyone',
                    status: 'Published',
                    scheduledDate: null,
                    attachmentUrls: (post.attachments || []).map(a => a.url),
                    attachmentTypes: (post.attachments || []).map(a => a.type === 'doc' ? 'Document' : a.type === 'image' ? 'Image' : a.type === 'video' ? 'Video' : 'Audio'),
                    mentionedUserIds: []
                });
            }

            // Also update local storage if fallback
            try {
                const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                const updated = localPosts.map(lp => {
                    if (String(lp.id || lp.postId) === String(targetPostId)) {
                        return { ...lp, status: 'Published', publishedDate: new Date().toISOString() };
                    }
                    return lp;
                });
                localStorage.setItem('knome_local_posts', JSON.stringify(updated));
            } catch (e) {}

            if (awardRuleKarma && (currentUser?.userId || currentUser?.id)) {
                const targetUid = currentUser?.userId || currentUser?.id;
                const pts = awardRuleKarma(targetUid, 'POST', { customTitle: 'Published Scheduled Post' }) || 2;
                addToast(`⚡ +${pts} Karma Points earned!`, 'info');
            }

            addToast("Post published successfully!", "success");
            window.dispatchEvent(new CustomEvent('post-created'));
            if (onPostDeleted) onPostDeleted(targetPostId);
        } catch (error) {
            console.error("Failed to publish scheduled post now:", error);
            addToast(error?.message || "Failed to publish post immediately", "error");
        } finally {
            setIsPublishingNow(false);
        }
    };

    const handleCancelSchedule = async () => {
        if (!await confirm({ 
            title: 'Cancel Scheduled Post', 
            message: 'Do you want to cancel the schedule for this post? It will be moved to Drafts.', 
            confirmText: 'Move to Drafts', 
            variant: 'danger' 
        })) return;

        const targetPostId = post.id || post.postId;
        if (!targetPostId) return;

        try {
            const isNumericId = /^\d+$/.test(String(targetPostId));
            if (isNumericId) {
                await postsApi.update(targetPostId, {
                    contentText: post.content || '',
                    audienceType: post.audienceType || 'Everyone',
                    status: 'Draft',
                    scheduledDate: null,
                    attachmentUrls: (post.attachments || []).map(a => a.url),
                    attachmentTypes: (post.attachments || []).map(a => a.type === 'doc' ? 'Document' : a.type === 'image' ? 'Image' : a.type === 'video' ? 'Video' : 'Audio'),
                    mentionedUserIds: []
                });
            }

            try {
                const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                const updated = localPosts.map(lp => {
                    if (String(lp.id || lp.postId) === String(targetPostId)) {
                        return { ...lp, status: 'Draft', scheduledDate: null };
                    }
                    return lp;
                });
                localStorage.setItem('knome_local_posts', JSON.stringify(updated));
            } catch (e) {}

            addToast("Post schedule cancelled (moved to Drafts).", "info");
            window.dispatchEvent(new CustomEvent('post-created'));
            if (onPostDeleted) onPostDeleted(targetPostId);
        } catch (error) {
            console.error("Failed to cancel post schedule:", error);
            addToast(error?.message || "Failed to cancel schedule", "error");
        }
    };

    const handleReactionMouseEnter = () => {
        hoverTimeoutRef.current = setTimeout(() => setReactionHover(true), 300);
    };

    const handleReactionMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setReactionHover(false);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleReaction = async (type) => {
        const previousReaction = reaction;
        const previousList = reactionsList;
        const previousLikeCount = likeCount;
        const newReaction = reaction === type ? null : type;

        const currentUserIdNum = Number(currentUser?.userId || currentUser?.id || 0);
        const currentUserName = currentUser?.fullName || currentUser?.name || 'You';
        const currentUserPhoto = currentUser?.profilePhotoUrl || currentUser?.avatar || null;
        const currentUserDesig = currentUser?.roleName || currentUser?.role || currentUser?.designation || 'MPOnline Team Member';
        
        let newLikeCount = previousLikeCount;
        if (previousReaction && !newReaction) {
            newLikeCount = Math.max(0, previousLikeCount - 1);
        } else if (!previousReaction && newReaction) {
            newLikeCount = previousLikeCount + 1;
        }

        // Optimistically update UI
        setReaction(newReaction);
        setLikeCount(newLikeCount);

        if (previousReaction && !newReaction) {
            setReactionsList(prev => prev.filter(r => Number(r.userId) !== currentUserIdNum));
        } else if (!previousReaction && newReaction) {
            setReactionsList(prev => [
                {
                    id: `local-${currentUserIdNum}-${Date.now()}`,
                    userId: currentUserIdNum,
                    userFullName: currentUserName,
                    userProfilePhotoUrl: currentUserPhoto,
                    userDesignation: currentUserDesig,
                    reactionType: newReaction
                },
                ...prev.filter(r => Number(r.userId) !== currentUserIdNum)
            ]);
            if (awardRuleKarma && (post.userId || post.authorId)) {
                awardRuleKarma(post.userId || post.authorId, 'LIKE_RECEIVED');
            }
        } else if (previousReaction && newReaction && previousReaction !== newReaction) {
            setReactionsList(prev => [
                {
                    id: `local-${currentUserIdNum}-${Date.now()}`,
                    userId: currentUserIdNum,
                    userFullName: currentUserName,
                    userProfilePhotoUrl: currentUserPhoto,
                    userDesignation: currentUserDesig,
                    reactionType: newReaction
                },
                ...prev.filter(r => Number(r.userId) !== currentUserIdNum)
            ]);
        }
        setReactionHover(false);

        // Immediately persist to cache (Survives F5 / Page Refresh!)
        const curPostId = String(post.id || post.postId || '');
        setCachedPostInteraction(curPostId, {
            reaction: newReaction,
            likeCount: newLikeCount
        });

        // Backend sync if numeric ID
        const isNumericId = /^\d+$/.test(curPostId);
        if (isNumericId) {
            const reactionTypeToSend = newReaction || previousReaction;
            if (!reactionTypeToSend) return;

            const formattedReaction = reactionTypeToSend.charAt(0).toUpperCase() + reactionTypeToSend.slice(1);

            try {
                const res = await interactionsApi.toggleReaction('Post', post.id || post.postId, formattedReaction);
                const summary = res?.data || res;
                if (summary && typeof summary.totalCount === 'number') {
                    const serverLikes = Number(summary.totalCount);
                    const serverReaction = summary.currentUserReactionType ? summary.currentUserReactionType.toLowerCase() : newReaction;
                    setLikeCount(serverLikes);
                    setReaction(serverReaction);
                    setCachedPostInteraction(curPostId, {
                        reaction: serverReaction,
                        likeCount: serverLikes
                    });
                }
            } catch (error) {
                console.warn('Backend toggleReaction notice (handled smoothly):', error);
                // Maintain cached interaction so user's reaction never vanishes
            }
        }
    };

    return (
        <article 
            id={post.id ? `post-${post.id}` : undefined}
            className={`w-full min-w-0 rounded-2xl overflow-hidden flex flex-col transition-all hover:-translate-y-1 ${post.isHighlighted ? 'ring-2 ring-indigo-500 shadow-2xl' : ''}`}
            style={{
                background: 'var(--bg-card)',
                border: isScheduled ? '1.5px dashed #f59e0b' : (isDraft ? '1.5px dashed #64748b' : (post.isHighlighted ? '1px solid #6366f1' : '1px solid var(--border-subtle)')),
                boxShadow: 'var(--shadow-premium)',
            }}>
            {/* Scheduled Notice Banner for Author */}
            {isScheduled && (
                <div className="mx-5 mt-4 p-3 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-blue-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-400 font-bold">
                        <span className="material-symbols-outlined text-[20px] text-amber-500 animate-pulse">schedule</span>
                        <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span>Scheduled for:</span>
                                <span className="text-slate-900 dark:text-white font-extrabold">
                                    {post.scheduledDate ? formatToDDMMYYYY(post.scheduledDate) : 'Future'}
                                </span>
                            </div>
                            <span className="block text-[10.5px] text-slate-500 dark:text-slate-400 font-normal">
                                Only visible to you until auto-published by the system.
                            </span>
                        </div>
                    </div>
                    {isAuthor && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                onClick={handlePublishNow}
                                disabled={isPublishingNow}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Publish this post immediately"
                            >
                                {isPublishingNow ? (
                                    <span className="material-symbols-outlined text-[13px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[13px]">send</span>
                                )}
                                Publish Now
                            </button>
                        </div>
                    )}
                </div>
            )}


            {/* Header */}
            <div className="p-5 pb-3 flex gap-4">
                <button 
                    onClick={() => navigate('/profile', { state: { user: post.author } })}
                    className="w-12 h-12 rounded-xl p-[2px] bg-gradient-to-br from-blue-500 to-cyan-400 shrink-0 shadow-sm transition-transform hover:scale-105 cursor-pointer"
                >
                    <img 
                        className="w-full h-full rounded-[10px] object-cover border-2 border-white dark:border-slate-900" 
                        alt={post.author?.name || "Avatar"} 
                        src={post.author?.avatar}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author?.name || 'User')}&background=6366f1&color=fff`;
                        }}
                    />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                            <button onClick={() => navigate('/profile', { state: { user: post.author } })} className="font-source-sans font-bold text-[15px] text-[#0F172A] dark:text-white leading-tight hover:underline cursor-pointer">
                                <HighlightText text={post.author?.name || post.authorName || 'Employee'} query={searchQuery} />
                            </button>
                            {post.author?.isVerified && <span className="material-symbols-outlined text-[13px] text-blue-500" style={{fontVariationSettings: "'FILL' 1"}}>verified</span>}
                            <span className="text-slate-300 dark:text-slate-700 text-[11px]">•</span>
                            <span className="font-arial text-slate-500 dark:text-slate-400 text-[12px] font-semibold uppercase tracking-wider">{post.author?.role || post.authorRole || 'Contributor'}</span>
                            {isAuthorFollowed && !isAuthor && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/60" title="You are following this colleague">
                                    <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                    <span>Following</span>
                                </span>
                            )}
                            {!isAuthorFollowed && isAuthorFollower && !isAuthor && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60" title="This colleague follows you">
                                    <span>Follows you</span>
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {/* Save & Categorize Button (FR-CI-04) */}
                            <button 
                                onClick={async () => {
                                    if (isSaved) {
                                        setIsSaved(false);
                                        try {
                                            const curPostId = String(post.id || post.postId);
                                            const bookmarkedIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
                                            localStorage.setItem('knome_bookmarked_ids', JSON.stringify(bookmarkedIds.filter(id => String(id) !== curPostId)));
                                            
                                            const localCustomSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
                                            localStorage.setItem('knome_saved_items_custom', JSON.stringify(localCustomSaved.filter(i => String(i.contentId || i.id) !== curPostId)));

                                            const existingMap = JSON.parse(localStorage.getItem('knome_item_category_map') || '{}');
                                            delete existingMap[`Post_${curPostId}`];
                                            delete existingMap[curPostId];
                                            localStorage.setItem('knome_item_category_map', JSON.stringify(existingMap));

                                            const isNumeric = /^\d+$/.test(curPostId);
                                            if (isNumeric) {
                                                await interactionsApi.toggleBookmark('Post', post.id).catch(() => {});
                                            }
                                            window.dispatchEvent(new CustomEvent('knome-bookmark-saved', { detail: { id: post.id, removed: true } }));
                                            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_items_custom' }));
                                            addToast('Item removed from saved bookmarks.', 'info');
                                        } catch (e) {
                                            console.warn('Failed to clean bookmark locally', e);
                                        }
                                    } else {
                                        setIsSaveCategoryModalOpen(true);
                                    }
                                }}
                                className={`p-1.5 rounded-lg transition-all active:scale-95 ${isSaved ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                title={isSaved ? "Unsave" : "Save & Categorize Content"}
                            >
                                <span className="material-symbols-outlined text-[18px]" style={{fontVariationSettings: isSaved ? "'FILL' 1" : "'FILL' 0"}}>bookmark</span>
                            </button>
                            {/* Direct Delete Button */}
                            {canDeletePost && (
                                <button 
                                    onClick={handleDeletePost}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                                    title="Delete Post"
                                >
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            )}
                            <div className="relative" ref={menuRef}>
                                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                                    <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                                </button>
                                {isMenuOpen && (() => {
                                    const menuTarget = resolveSharedTarget(post);
                                    return (
                                        <div className="absolute right-0 mt-1 w-48 bg-theme-60-surface border border-theme-30 rounded-xl shadow-lg py-1 z-10 animate-in fade-in zoom-in-95 duration-100">
                                            <button 
                                                onClick={() => { 
                                                    setIsMenuOpen(false); 
                                                    if (menuTarget?.url) {
                                                        navigate(menuTarget.url);
                                                    } else {
                                                        navigate('/posts?id=' + (post.id || post.postId));
                                                    }
                                                }}
                                                className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">{menuTarget?.icon || 'open_in_new'}</span> {menuTarget?.actionText || 'Open Post'}
                                            </button>
                                        <button 
                                            onClick={() => { setIsMenuOpen(false); navigate('/profile', { state: { user: post.author } }); }}
                                            className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">person</span> View Profile
                                        </button>
                                        <button 
                                            onClick={() => { setIsMenuOpen(false); setIsReportModalOpen(true); }}
                                            className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">report</span> Report Post
                                        </button>
                                        {isAuthor && (isScheduled || isDraft) && (
                                            <>
                                                <button 
                                                    onClick={() => { setIsMenuOpen(false); handlePublishNow(); }}
                                                    className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 mt-1"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">send</span> Publish Now
                                                </button>
                                                {isScheduled && (
                                                    <button 
                                                        onClick={() => { setIsMenuOpen(false); handleCancelSchedule(); }}
                                                        className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-amber-600 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">event_busy</span> Cancel Schedule
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {canDeletePost && (
                                            <button 
                                                onClick={handleDeletePost}
                                                className="w-full text-left px-4 py-2 font-source-sans text-[13px] font-bold text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 mt-1"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span> Delete Post
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                        <p className="font-arial text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            {post.time}
                        </p>
                        {isDraft && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 font-arial text-[10px] font-bold border border-slate-500/20 shadow-xs">
                                <span className="material-symbols-outlined text-[12px]">draft</span>
                                Draft
                            </span>
                        )}
                        {post.isScheduledFuture && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-arial text-[10px] font-bold border border-amber-500/20 shadow-xs animate-pulse">
                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                Scheduled (Pending)
                            </span>
                        )}
                        {post.sharedCommunityName || post.sharedCommunity?.name || post.communityName ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-arial text-[10.5px] font-bold border border-blue-500/20">
                                <span className="material-symbols-outlined text-[12px]">groups</span>
                                {post.sharedCommunityName || post.sharedCommunity?.name || post.communityName}
                            </span>
                        ) : (post.sharedWithName || post.sharedUser?.name || post.recipientName) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-arial text-[10.5px] font-bold border border-purple-500/20">
                                <span className="material-symbols-outlined text-[12px]">person</span>
                                To: {post.sharedWithName || post.sharedUser?.name || post.recipientName}
                            </span>
                        ) : (
                            <span className="font-arial text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-0.5" title="Public to Everyone">
                                <span className="material-symbols-outlined text-[11px]">public</span>
                                Everyone
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-5 pb-3">
                {post.type === 'article' && (
                    <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-black px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 w-fit">
                        <span className="material-symbols-outlined text-[12px]" style={{fontVariationSettings: "'FILL' 1"}}>article</span>
                        ARTICLE
                    </div>
                )}
                {(() => {
                    const target = resolveSharedTarget(post);
                    // Match any internal post share url (/posts?id=...) with numeric or alphanumeric id
                    const postUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/posts\?id=([a-zA-Z0-9_-]+)/i);
                    const extractedPostId = target?.id || post.sharedPostId || (postUrlMatch ? postUrlMatch[1] : null) || post.sharedContent?.id || null;

                    // Match shared post quoted title from content or post.title
                    const sharedPostTitleMatch = (post.content || '').match(/Shared (?:Post|Article|Video|Podcast|Profile):\s*"([^"]+)"/i) 
                        || (post.title || '').match(/Shared (?:Post|Article|Video|Podcast|Profile):\s*"([^"]+)"/i);
                    let sharedPostTitle = post.sharedContent?.title 
                        || (sharedPostTitleMatch ? sharedPostTitleMatch[1] : null);
                    if (!sharedPostTitle && post.title && !post.title.startsWith('Shared ')) {
                        sharedPostTitle = post.title;
                    }
                    if (!sharedPostTitle && extractedPostId) {
                        sharedPostTitle = `${target?.label || 'Post'} #${extractedPostId}`;
                    }

                    const hasExplicitArticleCard = Boolean(post.sharedArticle || post.type === 'article_share' || (post.content && (post.content.includes('Shared Article:') || post.content.includes('/article-view'))));
                    const hasExplicitPodcastCard = Boolean(post.sharedPodcast || post.type === 'podcast_share' || (post.content && (post.content.includes('Shared Podcast:') || post.content.includes('/podcasts'))));
                    const hasExplicitVideoCard = Boolean(post.sharedVideo || post.type === 'video_share' || post.videoUrl || (post.content && (post.content.includes('Shared Video:') || post.content.includes('📹'))));
                    const hasExplicitProfileCard = Boolean(post.sharedProfile || post.isProfileShare || (post.content && post.content.includes('Shared Profile:')));

                    const isWikiShare = Boolean(target?.type === 'Wiki' || post.sharedWiki || post.type === 'wiki_share' || (post.postType || '').toLowerCase() === 'wiki' || (post.content && (post.content.includes('Shared Wiki:') || post.content.includes('/wiki/view') || post.content.includes('/wiki'))));

                    const isSharedPost = Boolean(
                        !hasExplicitArticleCard && !hasExplicitPodcastCard && !hasExplicitVideoCard && !hasExplicitProfileCard && !isWikiShare &&
                        (
                            target ||
                            extractedPostId || 
                            (post.content && (post.content.includes('Shared Post:') || post.content.includes('Shared Article:') || post.content.includes('Shared Video:'))) ||
                            (post.title && (post.title.startsWith('Shared Post:') || post.title.startsWith('Shared Article:'))) ||
                            post.type === 'post_share' ||
                            post.sharedContent
                        )
                    );

                    // Clean user commentary if this is a shared post, article, video, or profile:
                    // Strip the automated template strings and internal URLs from rendered body
                    let userCommentary = post.content || '';
                    if (isSharedPost || (post.content && (post.content.includes('Shared Article:') || post.content.includes('Shared Video:') || post.content.includes('Shared Profile:')))) {
                        userCommentary = userCommentary
                            .replace(/Shared\s+(?:Post|Article|Video|Profile):\s*"[^"]*"/gi, '')
                            .replace(/(?:https?:\/\/[^\s]+)?\/(?:posts|article-view|videos|profile)\?[^\s]+/gi, '')
                            .trim();
                    }

                    const renderFormattedText = (text) => {
                        if (!text) return null;
                        const urlRegex = /(https?:\/\/[^\s]+|\/wiki(?:\/view)?\?[^\s]+)/g;
                        const parts = text.split(urlRegex);
                        return parts.map((part, index) => {
                            if (!part) return null;
                            if (part.match(urlRegex)) {
                                const cleanUrl = part.replace(/[.,;!?)]+$/, '');
                                const trailingPunctuation = part.slice(cleanUrl.length);
                                const isWikiUrl = cleanUrl.includes('/wiki') || cleanUrl.includes('/wiki/view');

                                if (isWikiUrl) {
                                    let targetPath = '/wiki';
                                    try {
                                        const urlObj = new URL(cleanUrl, window.location.origin);
                                        targetPath = urlObj.pathname + urlObj.search;
                                    } catch {
                                        const match = cleanUrl.match(/\/wiki(?:\/view)?(?:\?[^\s]+)?/i);
                                        targetPath = match ? match[0] : '/wiki';
                                    }

                                    return (
                                        <span key={index} className="inline-block my-1.5 align-middle">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    navigate(targetPath);
                                                }}
                                                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 active:scale-95 text-white shadow-sm hover:shadow-md transition-all group/wiki cursor-pointer"
                                                title="Open Wiki"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">menu_book</span>
                                                <span className="tracking-wide">Open Wiki</span>
                                                <span className="material-symbols-outlined text-[14px] group-hover/wiki:translate-x-0.5 transition-transform">arrow_forward</span>
                                            </button>
                                            {trailingPunctuation}
                                        </span>
                                    );
                                }

                                const isInternal = cleanUrl.includes('/posts') || cleanUrl.includes('/article-view') || cleanUrl.includes('/community') || cleanUrl.includes('/videos') || cleanUrl.includes('/podcasts');
                                return (
                                    <React.Fragment key={index}>
                                        <a
                                            href={cleanUrl}
                                            onClick={(e) => {
                                                if (isInternal) {
                                                    e.preventDefault();
                                                    try {
                                                        const urlObj = new URL(cleanUrl, window.location.origin);
                                                        navigate(urlObj.pathname + urlObj.search);
                                                    } catch {
                                                        window.open(cleanUrl, '_blank');
                                                    }
                                                }
                                            }}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-0.5 break-all cursor-pointer"
                                        >
                                            <span>{cleanUrl}</span>
                                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                        </a>
                                        {trailingPunctuation}
                                    </React.Fragment>
                                );
                            }
                            // Format hashtags into clickable search links
                            const hashtagRegex = /(#[a-zA-Z0-9_\u0900-\u097F]+)/g;
                            const subParts = part.split(hashtagRegex);
                            return subParts.map((subPart, subIdx) => {
                                if (subPart.match(hashtagRegex)) {
                                    return (
                                        <span
                                            key={`${index}-${subIdx}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/search?q=${encodeURIComponent(subPart)}`);
                                            }}
                                            className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer transition-colors"
                                            title={`Search posts tagged with ${subPart}`}
                                        >
                                            <HighlightText text={subPart} query={searchQuery} />
                                        </span>
                                    );
                                }
                                return <HighlightText key={`${index}-${subIdx}`} text={subPart} query={searchQuery} />;
                            });
                        });
                    };

                    const sharedAuthor = post.sharedContent?.author || null;

                    const commentaryLines = userCommentary ? userCommentary.split('\n') : [];
                    const hasMultipleLines = commentaryLines.length > 2;
                    const isLongText = (userCommentary || '').length > 140;
                    const needsReadMore = hasMultipleLines || isLongText;

                    let truncatedCommentary = userCommentary;
                    if (needsReadMore && !isContentExpanded) {
                        if (hasMultipleLines) {
                            const firstTwo = commentaryLines.slice(0, 2).join('\n');
                            if (firstTwo.length > 140) {
                                let slice = firstTwo.slice(0, 140);
                                const lastSpace = slice.lastIndexOf(' ');
                                if (lastSpace > 90) slice = slice.slice(0, lastSpace);
                                truncatedCommentary = slice.trim();
                            } else {
                                truncatedCommentary = firstTwo.trim();
                            }
                        } else {
                            let slice = userCommentary.slice(0, 140);
                            const lastSpace = slice.lastIndexOf(' ');
                            if (lastSpace > 90) slice = slice.slice(0, lastSpace);
                            truncatedCommentary = slice.trim();
                        }
                    }

                    return (
                        <>
                            {/* Render post title only if not a repetitive "Shared Post:" prefix */}
                            {post.title && !post.title.startsWith('Shared Post:') && (
                                <h3 
                                    onClick={() => {
                                        if (post.type === 'article') {
                                            navigate('/article-view?id=' + (post.articleId || post.contentId || post.id));
                                        } else {
                                            const targetId = extractedPostId || post.id || post.postId;
                                            if (targetId) navigate(`/posts?id=${targetId}`);
                                        }
                                    }}
                                    className="font-source-sans text-[16px] font-bold text-slate-900 dark:text-white mb-2 leading-snug hover:text-blue-500 cursor-pointer transition-colors"
                                >
                                    {post.title}
                                </h3>
                            )}

                            {/* Render user commentary (or normal content) with Read more after 2 lines */}
                            {userCommentary ? (
                                <div className="font-source-sans text-[14.5px] text-slate-800 dark:text-slate-200 mb-3 leading-relaxed font-normal">
                                    <p className={`whitespace-pre-wrap ${!isContentExpanded && needsReadMore ? 'line-clamp-2' : ''}`}>
                                        {renderFormattedText(isContentExpanded ? userCommentary : truncatedCommentary)}
                                    </p>
                                    {needsReadMore && !isContentExpanded && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsContentExpanded(true);
                                            }}
                                            className="font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-[13.5px] mt-1 inline-flex items-center gap-0.5 cursor-pointer transition-colors bg-transparent border-0 p-0 hover:underline select-none"
                                        >
                                            <span>Read more</span>
                                            <span className="material-symbols-outlined text-[16px]">expand_more</span>
                                        </button>
                                    )}
                                    {needsReadMore && isContentExpanded && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsContentExpanded(false);
                                            }}
                                            className="font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-[13px] mt-1 inline-flex items-center gap-0.5 cursor-pointer transition-colors bg-transparent border-0 p-0 hover:underline select-none"
                                        >
                                            <span>Show less</span>
                                            <span className="material-symbols-outlined text-[16px]">expand_less</span>
                                        </button>
                                    )}
                                </div>
                            ) : null}

                            {/* Shared Post Modern Quote Card (LinkedIn / Twitter Style) */}
                            {isSharedPost && (
                                <div 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (target?.url) {
                                            navigate(target.url);
                                            return;
                                        }
                                        const targetId = extractedPostId || post.id || post.postId;
                                        if (targetId) navigate(`/posts?id=${targetId}`);
                                    }}
                                    className={`mt-2 mb-2 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100/90 dark:hover:bg-slate-850 border border-slate-200/90 dark:border-slate-800 transition-all cursor-pointer group shadow-xs hover:shadow-md ${
                                        target?.type === 'Article' ? 'hover:border-emerald-400 dark:hover:border-emerald-500/60' :
                                        target?.type === 'Video' ? 'hover:border-rose-400 dark:hover:border-rose-500/60' :
                                        target?.type === 'Podcast' ? 'hover:border-pink-400 dark:hover:border-pink-500/60' :
                                        target?.type === 'Profile' ? 'hover:border-indigo-400 dark:hover:border-indigo-500/60' :
                                        'hover:border-blue-400 dark:hover:border-blue-500/60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3 mb-2.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-arial text-[11px] font-bold ${
                                                target?.type === 'Article' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60' :
                                                target?.type === 'Video' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60' :
                                                target?.type === 'Podcast' ? 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60' :
                                                target?.type === 'Profile' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60' :
                                                'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60'
                                            }`}>
                                                <span className="material-symbols-outlined text-[13px]">{target?.icon || 'repeat'}</span>
                                                {target?.label || 'Shared Post'}
                                            </span>
                                            {extractedPostId && (
                                                <span className="font-arial text-[11px] text-slate-400 dark:text-slate-500 font-mono font-medium">
                                                    #{extractedPostId}
                                                </span>
                                            )}
                                            {sharedAuthor && (
                                                <span className="font-arial text-[11.5px] text-slate-500 dark:text-slate-400">
                                                    by <strong className="font-source-sans text-slate-700 dark:text-slate-200 font-semibold">{sharedAuthor}</strong>
                                                </span>
                                            )}
                                        </div>
                                        <div className={`flex items-center gap-1 font-source-sans text-[12px] font-bold group-hover:translate-x-0.5 transition-all shrink-0 ${
                                            target?.type === 'Article' ? 'text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300' :
                                            target?.type === 'Video' ? 'text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300' :
                                            target?.type === 'Podcast' ? 'text-pink-600 dark:text-pink-400 group-hover:text-pink-700 dark:group-hover:text-pink-300' :
                                            target?.type === 'Profile' ? 'text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300' :
                                            'text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300'
                                        }`}>
                                            <span>{target?.actionText || 'Open Post'}</span>
                                            <span className="material-symbols-outlined text-[15px]">arrow_outward</span>
                                        </div>
                                    </div>

                                    {/* Quote Box Body with Georgia Italic voice/accent font */}
                                    <div className={`border-l-3 pl-3.5 py-1.5 bg-white/70 dark:bg-slate-950/40 rounded-r-xl ${
                                        target?.type === 'Wiki' ? 'border-teal-500/70 dark:border-teal-400/70' :
                                        target?.type === 'Article' ? 'border-emerald-500/70 dark:border-emerald-400/70' :
                                        target?.type === 'Video' ? 'border-rose-500/70 dark:border-rose-400/70' :
                                        target?.type === 'Podcast' ? 'border-pink-500/70 dark:border-pink-400/70' :
                                        target?.type === 'Profile' ? 'border-indigo-500/70 dark:border-indigo-400/70' :
                                        'border-blue-500/70 dark:border-blue-400/70'
                                    }`}>
                                        <p 
                                            className="font-georgia-italic text-[16px] text-slate-800 dark:text-slate-100 leading-relaxed group-hover:text-blue-950 dark:group-hover:text-white transition-colors line-clamp-3" 
                                            style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif', fontStyle: 'italic' }}
                                        >
                                            "{sharedPostTitle || 'Original Post'}"
                                        </p>
                                        <p className="font-arial text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                                            <span className={`material-symbols-outlined text-[14px] ${
                                                target?.type === 'Wiki' ? 'text-teal-500/70' :
                                                target?.type === 'Article' ? 'text-emerald-500/70' :
                                                target?.type === 'Video' ? 'text-rose-500/70' :
                                                target?.type === 'Podcast' ? 'text-pink-500/70' :
                                                target?.type === 'Profile' ? 'text-indigo-500/70' :
                                                'text-blue-500/70'
                                            }`}>{target?.icon || 'chat_bubble'}</span>
                                            {target?.type === 'Wiki' ? 'Click to open and read full wiki' :
                                             target?.type === 'Article' ? 'Click to open and read full article' :
                                             target?.type === 'Video' ? 'Click to open and watch full video' :
                                             target?.type === 'Podcast' ? 'Click to listen to podcast' :
                                             target?.type === 'Profile' ? 'Click to view employee profile' :
                                             'Click to open post details, discussions & full comments'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}

                {/* Shared Profile Card */}
                {(post.sharedProfile || post.isProfileShare || (post.content && post.content.includes('Shared Profile:'))) && (() => {
                    const prof = post.sharedProfile || {
                        name: (post.content?.match(/Shared Profile:\s*"([^"]+)"/i) || [])[1] || 'Colleague',
                        fullName: (post.content?.match(/Shared Profile:\s*"([^"]+)"/i) || [])[1] || 'Colleague',
                        designation: 'MPOnline Team Member',
                        department: 'MPOnline',
                        id: (post.content?.match(/\/profile\?id=([a-zA-Z0-9_-]+)/i) || [])[1] || null
                    };
                    const profId = prof.userId || prof.id;
                    const profName = prof.fullName || prof.name || 'User';
                    const profAvatar = prof.avatar || prof.profilePhotoUrl;
                    const profDesignation = prof.designation || prof.roleName || prof.role || 'Contributor';
                    const profDept = prof.department || prof.departmentName || 'General';

                    const handleOpenProfile = (e) => {
                        e.stopPropagation();
                        if (profId) {
                            navigate(`/profile?id=${profId}`, { state: { user: prof } });
                        } else {
                            navigate('/network');
                        }
                    };

                    return (
                        <div 
                            onClick={handleOpenProfile}
                            className="mt-3.5 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/25 hover:border-indigo-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md overflow-hidden group-hover:scale-105 transition-transform">
                                    {profAvatar ? (
                                        <img 
                                            src={resolveMediaUrl(profAvatar) || profAvatar} 
                                            alt={profName} 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profName)}&background=6366f1&color=fff&bold=true`;
                                            }}
                                        />
                                    ) : (
                                        profName.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold uppercase tracking-wider">
                                            SHARED PROFILE
                                        </span>
                                    </div>
                                    <h4 className="font-extrabold text-slate-900 dark:text-white text-sm truncate mt-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        {profName}
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {profDesignation} • {profDept}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleOpenProfile}
                                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer group-hover:translate-x-0.5"
                            >
                                <span className="material-symbols-outlined text-[17px]">visibility</span>
                                View Profile
                            </button>
                        </div>
                    );
                })()}
                {/* Shared Video Player / Card inside PostCard */}
                {(post.sharedVideo || post.type === 'video_share' || post.videoUrl || (post.content && (post.content.includes('Shared Video:') || post.content.includes('📹')))) && (
                    <div className="mt-3.5 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl">
                        {(() => {
                            const vidObj = post.sharedVideo || {
                                id: post.id || `shared_vid_${Date.now()}`,
                                title: post.title?.replace('📹 Shared Video: ', '').replace(/ — uploaded by.*/, '') || post.content?.replace(/^.*Shared Video: "/, '').replace(/".*/, '') || 'Shared Video',
                                sourceUrl: post.videoUrl || post.sourceUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                                thumbnail: post.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200',
                                author: post.authorName || post.author || 'MPOnline Team'
                            };
                            const vUrl = vidObj.sourceUrl || vidObj.videoUrl || post.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                            const isYT = vUrl && (vUrl.includes('youtube.com') || vUrl.includes('youtu.be'));
                            const thumb = vidObj.thumbnail || getVideoThumbnail(vidObj);

                            return (
                                <div className="flex flex-col">
                                    {/* Video preview thumbnail with Play button overlay */}
                                    <div 
                                        onClick={() => setActiveVideoModal({ url: resolveMediaUrl(vUrl) || vUrl, title: vidObj.title, isYT })}
                                        className="relative aspect-video w-full bg-slate-950 overflow-hidden group cursor-pointer"
                                    >
                                        {thumb ? (
                                            <img 
                                                src={thumb} 
                                                alt={vidObj.title} 
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-black">
                                                <span className="material-symbols-outlined text-slate-700 text-6xl">movie</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-indigo-600/90 group-hover:bg-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-500/40 group-hover:scale-110 transition-transform">
                                                <span className="material-symbols-outlined text-3xl ml-1">play_arrow</span>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-[11px] font-semibold text-white flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[14px] text-cyan-400">open_in_full</span>
                                            <span>Click to watch on large screen</span>
                                        </div>
                                    </div>
                                    <div className="p-3.5 bg-slate-900 flex items-center justify-between gap-3 border-t border-slate-800">
                                        <div className="min-w-0">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">play_circle</span>
                                                SHARED VIDEO
                                            </span>
                                            <h5 className="font-extrabold text-white text-xs sm:text-sm truncate mt-1">
                                                {vidObj.title}
                                            </h5>
                                        </div>
                                        <button
                                            onClick={() => setActiveVideoModal({ url: resolveMediaUrl(vUrl) || vUrl, title: vidObj.title, isYT })}
                                            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">open_in_full</span>
                                            <span>Watch on Large Screen</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {post.type === 'article' && (
                    <button 
                        onClick={() => navigate('/article-view?id=' + (post.articleId || post.contentId || post.id))}
                        className="mt-3 text-xs font-black text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1"
                    >
                        Read Full Article
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                )}
                {post.tags && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {post.tags.map(tag => (
                            <span key={tag} className="text-[12px] font-bold text-[#2563EB] hover:text-blue-700 hover:underline cursor-pointer transition-colors">#{tag}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Image Attachments — Full-Width Cover Grid ── */}
            {imageAttachments.length > 0 && (
                <div className="mt-2 w-full">
                    <ImageGrid
                        images={imageAttachments}
                        onImageClick={(idx) => setLightboxIndex(idx)}
                    />
                </div>
            )}

            {/* ── Non-Image Attachments (Video / Audio / Doc) ── */}
            {otherAttachments.length > 0 && (
                <div className="mt-2 w-full flex flex-col gap-2">
                    {otherAttachments.map(att => {
                        const rawUrl = att.url || att.fileUrl || '';
                        const resolvedUrl = resolveMediaUrl(rawUrl) || rawUrl;
                        const rawType = (att.type || att.fileType || '').toLowerCase();
                        const urlClean = rawUrl.split('?')[0].toLowerCase();
                        let effectiveType = rawType;
                        if (urlClean.match(/\.(mp4|webm|ogg|mov|mkv|avi)$/i)) effectiveType = 'video';
                        else if (urlClean.match(/\.(mp3|wav|ogg|aac|m4a|flac)$/i)) effectiveType = 'audio';
                        else if (urlClean.match(/\.(pdf|doc|docx|txt|xls|xlsx|ppt|pptx|csv)$/i)) effectiveType = 'doc';
                        else if (rawType === 'document') effectiveType = 'doc';

                        if (effectiveType === 'video') {
                            const displayName = (att.name && att.name !== 'attachment') ? att.name : (rawUrl.split('/').pop()?.split('?')[0] || 'Video');
                            return (
                                <div 
                                    key={att.id || rawUrl} 
                                    onClick={() => setActiveVideoModal({ url: resolvedUrl, title: displayName })}
                                    className="mx-5 mb-3 p-3.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                                >
                                    <div className="flex items-center gap-3.5 overflow-hidden min-w-0">
                                        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                                            <span className="material-symbols-outlined text-[24px]">play_circle</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={displayName}>{displayName}</p>
                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                <span className="font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                                                    VIDEO
                                                </span>
                                                <span>Click to open in large screen</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                            onClick={() => setActiveVideoModal({ url: resolvedUrl, title: displayName })}
                                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">open_in_full</span>
                                            <span>Watch Video</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        } else if (effectiveType === 'audio') {
                            return (
                                <div key={att.id || rawUrl} className="mx-5 mb-1 p-4 rounded-2xl flex items-center gap-4"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}>
                                        <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>headphones</span>
                                    </div>
                                    <audio 
                                        src={resolvedUrl} 
                                        controls 
                                        controlsList="nodownload" 
                                        onContextMenu={(e) => e.preventDefault()} 
                                        className="flex-1" 
                                    />
                                </div>
                            );
                        } else if (effectiveType === 'doc') {
                            const isPdf = att.name?.toLowerCase().endsWith('.pdf') || urlClean.endsWith('.pdf');
                            const isTxt = att.name?.toLowerCase().endsWith('.txt') || urlClean.endsWith('.txt');
                            const displayName = (att.name && att.name !== 'attachment') ? att.name : (rawUrl.split('/').pop()?.split('?')[0] || 'Document');
                            return (
                                <div 
                                    key={att.id || rawUrl} 
                                    onClick={() => setActiveDocViewer({ ...att, name: displayName, url: resolvedUrl })}
                                    className="mx-5 mb-3 p-3.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all group cursor-pointer"
                                >
                                    <div className="flex items-center gap-3.5 overflow-hidden">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
                                            isPdf ? 'bg-red-500/10 text-red-500 border border-red-500/20' : isTxt ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                                        }`}>
                                            <span className="material-symbols-outlined text-[24px]">
                                                {isPdf ? 'picture_as_pdf' : isTxt ? 'article' : 'description'}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={displayName}>{displayName}</p>
                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                <span className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded ${
                                                    isPdf ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : isTxt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {isPdf ? 'PDF' : isTxt ? 'TXT' : 'DOC'}
                                                </span>
                                                <span>Click to open in large screen</span>
                                            </div>
                                        </div>
                                    </div>
                                    {resolvedUrl && (
                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <a
                                                href={resolvedUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700/60 rounded-xl transition-all"
                                                title="Open in new tab"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            )}

            {/* ── Document Viewer Modal ── */}
            {activeDocViewer && (
                <DocumentViewerModal 
                    document={activeDocViewer} 
                    onClose={() => setActiveDocViewer(null)} 
                />
            )}

            {/* ── Large Screen Video Modal ── */}
            {activeVideoModal && (
                <LargeVideoModal 
                    video={activeVideoModal} 
                    onClose={() => setActiveVideoModal(null)} 
                />
            )}

            {/* ── Fullscreen Lightbox ── */}
            {lightboxIndex !== null && (
                <ImageLightbox
                    images={imageAttachments}
                    startIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}

            {/* ── Reactions Modal ── */}
            <ReactionsModal
                isOpen={isReactionsModalOpen}
                onClose={() => setIsReactionsModalOpen(false)}
                contentType="Post"
                contentId={post.id || post.postId}
                initialReactions={reactionsList}
            />

            {/* Interaction Counts */}
            <div className="px-5 py-2.5 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                {likeCount > 0 ? (
                    <button 
                        type="button"
                        onClick={() => setIsReactionsModalOpen(true)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer group"
                        title="View who reacted"
                    >
                        <div className="flex items-center -space-x-1.5">
                            {activeReactionTypes.map(t => {
                                const meta = REACTION_TYPES[t] || REACTION_TYPES.like;
                                const bgClass = t === 'heart' ? 'bg-rose-500' : t === 'celebrate' ? 'bg-amber-500' : t === 'support' ? 'bg-purple-500' : 'bg-blue-500';
                                return (
                                    <span 
                                        key={t}
                                        className={`w-5 h-5 rounded-full ${bgClass} text-white flex items-center justify-center text-[10px] shadow-xs ring-2 ring-white dark:ring-slate-900`}
                                    >
                                        {meta.icon}
                                    </span>
                                );
                            })}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:underline">
                            {likeCount} {likeCount === 1 ? 'reaction' : 'reactions'}
                        </span>
                    </button>
                ) : (
                    <div />
                )}
                <div className="flex items-center gap-3 text-xs font-semibold">
                    <button onClick={() => setShowComments(!showComments)} className="hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <span className="font-bold">{displayCommentCount}</span>
                        <span>{displayCommentCount === 1 ? 'comment' : 'comments'}</span>
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <span className="font-bold">{shareCount || post.sharesCount || 0}</span>
                        <span>shares</span>
                    </span>
                </div>
            </div>

            {/* Interaction Bar */}
            <div className="px-3 py-2 flex items-center justify-between relative">
                
                {/* Reaction Picker Container (FR-CI-01) */}
                <div 
                    className="relative flex-1 flex justify-center items-center"
                    onMouseEnter={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => setReactionHover(true), 150);
                    }}
                    onMouseLeave={() => {
                        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                    }}
                >
                    {/* Reaction Popover */}
                    {reactionHover && (
                        <div 
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-full px-3 py-2 flex gap-2 animate-in fade-in slide-in-from-bottom-2 z-30"
                            onMouseEnter={() => {
                                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                setReactionHover(true);
                            }}
                            onMouseLeave={() => {
                                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                            }}
                        >
                            {/* Invisible Hitbox Bridge connecting Popover to Like Button */}
                            <div className="absolute top-full left-0 right-0 h-4" />

                            {Object.entries(REACTION_TYPES).map(([key, data]) => (
                                <button 
                                    key={key}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleReaction(key);
                                    }}
                                    className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center group/react transition-transform hover:scale-125 origin-bottom cursor-pointer"
                                    title={data.label}
                                >
                                    <span className="text-[22px] group-hover/react:-translate-y-1 transition-transform">{data.icon}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <button 
                        onClick={() => toggleReaction(reaction ? null : 'like')}
                        className={`w-full flex justify-center items-center gap-2 py-2.5 rounded-xl font-bold text-[13px] transition-colors cursor-pointer ${reaction ? REACTION_TYPES[reaction].color : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        {reaction ? (
                            <>
                                <span className="text-[18px]">{REACTION_TYPES[reaction].icon}</span>
                                {REACTION_TYPES[reaction].label} ({likeCount})
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">thumb_up</span>
                                Like ({likeCount})
                            </>
                        )}
                    </button>
                </div>

                <button 
                    onClick={async () => {
                        const nextState = !showComments;
                        setShowComments(nextState);
                        if (nextState && !hasFetchedComments) {
                            try {
                                const res = await interactionsApi.getComments('Post', post.id);
                                if (res && Array.isArray(res)) {
                                    const fetchedComments = res.map(c => ({
                                        id: c.commentId,
                                        author: c.authorFullName,
                                        avatar: resolveMediaUrl(c.authorProfilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorFullName)}&background=6366f1&color=fff`,
                                        text: c.commentText,
                                        time: formatToDDMMYYYY(c.createdDate),
                                        likesCount: c.likesCount || 0,
                                        isLiked: Boolean(c.isLiked),
                                        userReaction: c.userReactionType?.toLowerCase() || (c.isLiked ? 'like' : null),
                                        topReactionTypes: c.topReactionTypes || [],
                                        replies: (c.replies || []).map(r => ({
                                            id: r.commentId,
                                            author: r.authorFullName,
                                            avatar: resolveMediaUrl(r.authorProfilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.authorFullName)}&background=6366f1&color=fff`,
                                            text: r.commentText,
                                            time: formatToDDMMYYYY(r.createdDate),
                                            likesCount: r.likesCount || 0,
                                            isLiked: Boolean(r.isLiked),
                                            userReaction: r.userReactionType?.toLowerCase() || (r.isLiked ? 'like' : null),
                                            topReactionTypes: r.topReactionTypes || [],
                                            replies: []
                                        }))
                                    }));
                                    
                                    // Merge fetched comments with any local optimistic comments added before fetch
                                    setComments(prev => {
                                        const existingIds = new Set(prev.map(p => p.id));
                                        const newFetched = fetchedComments.filter(f => !existingIds.has(f.id));
                                        return [...prev, ...newFetched];
                                    });
                                    setHasFetchedComments(true);
                                }
                            } catch (e) {
                                console.error('Failed to load comments', e);
                            }
                        }
                    }}
                    className="flex-1 flex justify-center items-center gap-2 py-2.5 rounded-xl font-bold text-[13px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
                    Comment ({displayCommentCount})
                </button>

                {/* Share Button (FR-CI-03) */}
                <div className="flex-1 relative">
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsShareOpen(!isShareOpen);
                        }}
                        className="w-full flex justify-center items-center gap-2 py-2.5 rounded-xl font-bold text-[13px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[20px]">share</span>
                        Share ({shareCount || post.sharesCount || 0})
                    </button>

                    {/* Universal Share Modal (FR-CI-03) */}
                    <ArticleShareModal 
                        isOpen={isShareOpen}
                        onClose={() => setIsShareOpen(false)}
                        post={post}
                        contentType={resolveSharedTarget(post)?.type || (post.type === 'video' ? 'Video' : post.type === 'podcast' ? 'Podcast' : post.type === 'article' ? 'Article' : 'Post')}
                        onShared={(type, count) => {
                            setShareCount(prev => prev + (count || 1));
                            if (awardRuleKarma && (post.userId || post.authorId)) {
                                awardRuleKarma(post.userId || post.authorId, 'SHARE_RECEIVED');
                            }
                        }}
                    />
                </div>
            </div>

            <ReportModal 
                isOpen={isReportModalOpen} 
                onClose={() => setIsReportModalOpen(false)} 
                targetType="Post"
                targetId={post?.postId || post?.id}
                targetName={post?.author?.name || post?.authorFullName || post?.authorName || 'Author'}
                targetUserId={post?.author?.id || post?.authorId || post?.authorUserId || post?.userId}
                targetContent={post?.content || post?.contentText || post?.text || ''}
            />

            {/* Comments Section (FR-CI-02, FR-CI-05) */}
            {showComments && (
                <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-4">Comments ({displayCommentCount})</h3>
                    
                    {/* Add Comment */}
                    <form onSubmit={(e) => handleAddComment(e, null)} className="flex gap-3 mb-6">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0 bg-indigo-500 shadow-sm mt-1">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                            <textarea 
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Add a thoughtful comment..." 
                                rows={2}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white resize-none"
                            />
                            {(() => {
                                const restrictedInComment = checkRestrictedContent(newComment);
                                return (
                                    <div className="flex items-center justify-between mt-2">
                                        <button type="button" className="text-slate-400 hover:text-indigo-500 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Attach Image">
                                            <span className="material-symbols-outlined text-[18px]">image</span>
                                        </button>
                                        {restrictedInComment ? (
                                            <div className="flex items-center gap-1.5 text-rose-500 text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg">
                                                <span className="material-symbols-outlined text-[15px]">warning</span>
                                                <span>Restricted word ("{restrictedInComment}") detected! Remove it to post.</span>
                                            </div>
                                        ) : (
                                            <button 
                                                type="submit"
                                                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
                                            >
                                                Post Comment
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </form>

                    {/* Comments List */}
                    <div className="space-y-5">
                        {comments.map(comment => (
                            <CommentThread 
                                key={comment.id} 
                                postId={post.id} 
                                comment={comment} 
                                onReplyAdded={() => {
                                    setCommentCount(p => {
                                        const nextCount = p + 1;
                                        setCachedPostInteraction(String(post.id || post.postId), { commentCount: nextCount });
                                        return nextCount;
                                    });
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Save & Categorize Modal */}
            <SaveToCategoryModal
                isOpen={isSaveCategoryModalOpen}
                onClose={() => setIsSaveCategoryModalOpen(false)}
                item={{
                    id: post.id,
                    contentType: 'Post',
                    title: post.title || '',
                    content: post.content || post.text || '',
                    image: post.image || post.mediaUrl || (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : null) || (Array.isArray(post.attachmentUrls) ? post.attachmentUrls[0] : null) || post.thumbnailUrl || post.thumbnail || null,
                    author: post.author?.name || post.author,
                    time: post.createdDate || post.time || 'Just now',
                    tags: post.tags || []
                }}
                onSaved={(savedItem) => {
                    setIsSaved(true);
                    addToast(`✅ Saved to "${savedItem.category}"!`, 'success');
                }}
            />
        </article>
    );
}

// Sub-component for nested replies (FR-CI-05)
function CommentThread({ postId, comment, depth = 0, onReplyAdded }) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replies, setReplies] = useState(comment.replies || []);

    const cachedComment = (() => {
        try {
            const raw = localStorage.getItem(`knome_comment_interaction_${comment.id}`);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    })();

    const initialCommentLikes = cachedComment?.likesCount != null ? Math.max(cachedComment.likesCount, comment.likesCount || 0) : (comment.likesCount || 0);
    const initialCommentReaction = cachedComment?.reaction !== undefined ? cachedComment.reaction : (comment.userReaction || (comment.isLiked ? 'like' : null));

    const [likesCount, setLikesCount] = useState(initialCommentLikes);
    const [reaction, setReaction] = useState(initialCommentReaction);
    const [reactionHover, setReactionHover] = useState(false);
    const hoverTimeoutRef = useRef(null);
    const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);

    useEffect(() => {
        setReplies(comment.replies || []);
    }, [comment.replies]);

    useEffect(() => {
        const cCached = (() => {
            try {
                const raw = localStorage.getItem(`knome_comment_interaction_${comment.id}`);
                return raw ? JSON.parse(raw) : null;
            } catch { return null; }
        })();
        const effLikes = cCached?.likesCount != null ? Math.max(cCached.likesCount, comment.likesCount || 0) : (comment.likesCount || 0);
        const effReaction = cCached?.reaction !== undefined ? cCached.reaction : (comment.userReaction || (comment.isLiked ? 'like' : null));
        setLikesCount(effLikes);
        setReaction(effReaction);
    }, [comment.id, comment.likesCount, comment.isLiked, comment.userReaction]);

    const activeCommentReactionTypes = React.useMemo(() => {
        const types = new Set();
        if (Array.isArray(comment.topReactionTypes)) {
            comment.topReactionTypes.forEach(t => t && types.add(t.toLowerCase()));
        }
        if (reaction) {
            types.add(reaction.toLowerCase());
        }
        if (types.size === 0 && likesCount > 0) {
            types.add('like');
        }
        return Array.from(types);
    }, [comment.topReactionTypes, reaction, likesCount]);

    const toggleCommentReaction = async (type) => {
        if (!comment.id) return;
        const previousReaction = reaction;
        const newReaction = reaction === type ? null : type;

        let newLikes = likesCount;
        if (previousReaction && !newReaction) {
            newLikes = Math.max(0, likesCount - 1);
        } else if (!previousReaction && newReaction) {
            newLikes = likesCount + 1;
        }

        setReaction(newReaction);
        setLikesCount(newLikes);
        setReactionHover(false);

        try {
            localStorage.setItem(`knome_comment_interaction_${comment.id}`, JSON.stringify({
                reaction: newReaction,
                likesCount: newLikes
            }));
        } catch (_) {}

        const reactionTypeToSend = newReaction || previousReaction;
        if (!reactionTypeToSend) return;
        const formattedReaction = reactionTypeToSend.charAt(0).toUpperCase() + reactionTypeToSend.slice(1);

        try {
            await interactionsApi.toggleReaction('Comment', comment.id, formattedReaction);
        } catch (error) {
            console.warn('Comment reaction update notice:', error);
        }
    };

    const submitReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        const foundKeyword = checkRestrictedContent(replyText.trim());
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use restricted or abusive words ("${foundKeyword}").`, 'warning');
            return;
        }

        try {
            const c = await interactionsApi.addComment('Post', postId, replyText.trim(), comment.id);
            if (c) {
                const newReply = {
                    id: c?.commentId || c?.id || Date.now(),
                    commentId: c?.commentId || c?.id,
                    author: c?.authorFullName || currentUser?.name || currentUser?.fullName || 'You',
                    avatar: resolveMediaUrl(c?.authorProfilePhotoUrl || currentUser?.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(c?.authorFullName || currentUser?.name || 'User')}&background=6366f1&color=fff`,
                    time: 'Just now',
                    text: c?.commentText || replyText.trim(),
                    likesCount: 0,
                    isLiked: false,
                    userReaction: null,
                    topReactionTypes: [],
                    replies: []
                };

                setReplies(prev => [...prev, newReply]);
                setReplyText('');
                setIsReplying(false);
                if (onReplyAdded) onReplyAdded();
            }
        } catch (error) {
            console.error('Failed to add reply', error);
            const optimisticReply = {
                id: Date.now(),
                author: 'You',
                avatar: `https://ui-avatars.com/api/?name=You&background=6366f1&color=fff`,
                time: 'Just now',
                text: replyText.trim(),
                likesCount: 0,
                isLiked: false,
                userReaction: null,
                topReactionTypes: [],
                replies: []
            };
            setReplies(prev => [...prev, optimisticReply]);
            setReplyText('');
            setIsReplying(false);
            if (onReplyAdded) onReplyAdded();
        }
    };

    const avatarUrl = comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'User')}&background=6366f1&color=fff`;

    return (
        <div className="flex gap-3">
            {/* ── Comment Reactions Modal ── */}
            <ReactionsModal
                isOpen={isReactionsModalOpen}
                onClose={() => setIsReactionsModalOpen(false)}
                contentType="Comment"
                contentId={comment.id}
            />

            <img 
                src={avatarUrl} 
                alt={comment.author || 'Avatar'} 
                className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0" 
                onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'User')}&background=6366f1&color=fff`;
                }}
            />
            <div className="flex-1">
                <div className="bg-slate-100 dark:bg-slate-800/80 rounded-2xl rounded-tl-none px-4 py-3 inline-block max-w-full">
                    <div className="flex items-baseline justify-between gap-4 mb-1">
                        <span className="font-bold text-[13px] text-slate-900 dark:text-white">{comment.author}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{comment.time}</span>
                    </div>
                    <p className="text-[13px] text-slate-700 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                </div>
                
                {/* Comment Actions */}
                <div className="flex items-center gap-3 mt-1 ml-2 text-[11px] font-bold text-slate-500">
                    <div 
                        className="relative flex items-center"
                        onMouseEnter={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => setReactionHover(true), 150);
                        }}
                        onMouseLeave={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                        }}
                    >
                        {/* Reaction Popover */}
                        {reactionHover && (
                            <div 
                                className="absolute bottom-full left-0 mb-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-full px-2 py-1.5 flex gap-1.5 animate-in fade-in slide-in-from-bottom-2 z-30"
                                onMouseEnter={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    setReactionHover(true);
                                }}
                                onMouseLeave={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = setTimeout(() => setReactionHover(false), 350);
                                }}
                            >
                                <div className="absolute top-full left-0 right-0 h-3" />
                                {Object.entries(REACTION_TYPES).map(([key, data]) => (
                                    <button 
                                        key={key}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCommentReaction(key);
                                        }}
                                        className="w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-transform hover:scale-125 cursor-pointer"
                                        title={data.label}
                                    >
                                        <span className="text-[16px]">{data.icon}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <button 
                            type="button"
                            onClick={() => toggleCommentReaction(reaction ? null : 'like')} 
                            className={`transition-colors flex items-center gap-1 cursor-pointer ${reaction ? (REACTION_TYPES[reaction]?.color || 'text-indigo-600') : 'hover:text-indigo-500'}`}
                        >
                            {reaction ? (
                                <>
                                    <span className="text-[14px]">{REACTION_TYPES[reaction]?.icon || '👍'}</span>
                                    <span>{REACTION_TYPES[reaction]?.label || 'Liked'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[14px]">thumb_up</span>
                                    <span>Like</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Reaction Counter Pill (only if likesCount > 0) */}
                    {likesCount > 0 && (
                        <button 
                            type="button"
                            onClick={() => setIsReactionsModalOpen(true)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer group text-[11px]"
                            title="View who reacted"
                        >
                            <div className="flex items-center -space-x-1">
                                {activeCommentReactionTypes.map(t => {
                                    const meta = REACTION_TYPES[t] || REACTION_TYPES.like;
                                    const bgClass = t === 'heart' ? 'bg-rose-500' : t === 'celebrate' ? 'bg-amber-500' : t === 'support' ? 'bg-purple-500' : 'bg-blue-500';
                                    return (
                                        <span 
                                            key={t}
                                            className={`w-3.5 h-3.5 rounded-full ${bgClass} text-white flex items-center justify-center text-[8px] shadow-xs`}
                                        >
                                            {meta.icon}
                                        </span>
                                    );
                                })}
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:underline">
                                {likesCount}
                            </span>
                        </button>
                    )}

                    <button 
                        type="button"
                        onClick={() => setIsReplying(!isReplying)} 
                        className="hover:text-indigo-500 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[14px]">reply</span>
                        <span>Reply</span>
                    </button>
                </div>

                {isReplying && (
                    <form onSubmit={submitReply} className="mt-3 flex items-center gap-2 max-w-md">
                        <div className="relative flex-1">
                            <input 
                                type="text" 
                                autoFocus
                                placeholder={`Reply to ${comment.author}...`} 
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-4 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                        {(() => {
                            const restrictedInReply = checkRestrictedContent(replyText);
                            if (restrictedInReply) {
                                return (
                                    <div className="flex items-center gap-1 text-rose-500 text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-full shrink-0">
                                        <span className="material-symbols-outlined text-[14px]">warning</span>
                                        <span>Restricted word ("{restrictedInReply}")</span>
                                    </div>
                                );
                            }
                            return (
                                <button 
                                    type="submit"
                                    disabled={!replyText.trim()}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-full text-xs font-semibold flex items-center gap-1 transition-all shrink-0 shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-[14px]">send</span>
                                    <span>Reply</span>
                                </button>
                            );
                        })()}
                        <button 
                            type="button"
                            onClick={() => { setIsReplying(false); setReplyText(''); }}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium transition-colors shrink-0"
                        >
                            Cancel
                        </button>
                    </form>
                )}

                {/* Nested Replies */}
                {replies && replies.length > 0 && (
                    <div className="mt-4 space-y-4 border-l border-slate-100 dark:border-slate-800 pl-4">
                        {replies.map(reply => (
                            <CommentThread key={reply.id} postId={postId} comment={reply} depth={depth + 1} onReplyAdded={onReplyAdded} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
