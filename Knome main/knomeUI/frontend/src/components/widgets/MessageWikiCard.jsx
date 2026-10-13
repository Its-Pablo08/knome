import React, { useState, useEffect } from 'react';
import { wikiApi } from '../../utils/wikiService';
import { resolveMediaUrl } from '../../utils/apiService';

// Module-level in-memory cache to prevent redundant HTTP requests across messages and re-renders
const wikiCache = new Map();

/**
 * Robust extraction of Wiki ID from raw text or URL patterns:
 * Handles:
 * - http://localhost:5173/wiki/view?id=8
 * - http://localhost:5173/wiki/8
 * - /wiki/view?id=8
 * - /wiki/8
 * - /wikis/8
 * - Parameters like ?id=8&section=1
 */
export const extractWikiIdFromText = (text) => {
    if (!text || typeof text !== 'string') return null;

    // 1. Matches /wiki/view?id=123 or /wiki?id=123 with optional domain/protocol
    const queryMatch = text.match(/(?:https?:\/\/[^\s]+)?\/?wikis?(?:\/view)?\?[^#\s]*\bid=([0-9]+)/i);
    if (queryMatch) return queryMatch[1];

    // 2. Matches /wiki/123 or /wikis/123 with optional domain/protocol
    const pathMatch = text.match(/(?:https?:\/\/[^\s]+)?\/?wikis?\/([0-9]+)(?:[?#/]|$)/i);
    if (pathMatch) return pathMatch[1];

    return null;
};

/**
 * Formats conversation snippet for sidebar list
 */
export const formatConversationPreviewText = (text) => {
    if (!text) return 'No messages yet';
    const wikiId = extractWikiIdFromText(text);
    if (wikiId) {
        const cached = wikiCache.get(String(wikiId));
        return cached?.title ? `📄 Wiki: ${cached.title}` : '📄 Wiki Document';
    }
    return text;
};

/**
 * Interactive preview card for Wiki links shared in chat messages.
 * Matches existing Knome chat UI and clips preview design.
 */
export default function MessageWikiCard({ wikiId, isMe, navigate }) {
    const [wikiData, setWikiData] = useState(() => wikiCache.get(String(wikiId)) || null);
    const [isLoading, setIsLoading] = useState(!wikiCache.has(String(wikiId)));
    const [error, setError] = useState(null);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        if (!wikiId) return;
        const key = String(wikiId);
        if (wikiCache.has(key)) {
            setWikiData(wikiCache.get(key));
            setIsLoading(false);
            return;
        }

        let isMounted = true;
        setIsLoading(true);
        setError(null);

        wikiApi.getWiki(wikiId)
            .then(res => {
                const data = res?.data !== undefined ? res.data : res;
                if (data && isMounted) {
                    wikiCache.set(key, data);
                    setWikiData(data);
                }
            })
            .catch(err => {
                if (!isMounted) return;
                const status = err?.response?.status || err?.status;
                if (status === 403) {
                    setError('restricted');
                } else if (status === 404) {
                    setError('not_found');
                } else {
                    setError('error');
                }
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => { isMounted = false; };
    }, [wikiId]);

    const handleOpenWiki = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (navigate) {
            navigate(`/wiki/view?id=${wikiId}`);
        } else {
            window.location.href = `/wiki/view?id=${wikiId}`;
        }
    };

    const title = wikiData?.title || `Wiki Document #${wikiId}`;
    const author = wikiData?.createdByUserName || wikiData?.authorName || 'Colleague';
    const description = wikiData?.description || (wikiData?.contentHtml ? wikiData.contentHtml.replace(/<[^>]*>/g, '').trim().slice(0, 140) : '') || 'Enterprise documentation & knowledge base';
    const rawCover = wikiData?.coverImageUrl;
    const coverUrl = !imgFailed && rawCover ? (resolveMediaUrl(rawCover) || rawCover) : null;
    const sectionsCount = wikiData?.sectionsCount ?? (Array.isArray(wikiData?.sections) ? wikiData.sections.length : 0);
    const categoryName = wikiData?.categoryName;

    // Loading Skeleton
    if (isLoading) {
        return (
            <div className={`mt-2 rounded-2xl p-2.5 sm:p-3 border animate-pulse select-none max-w-md ${
                isMe
                    ? 'bg-black/20 border-white/20'
                    : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
            }`}>
                <div className="flex items-center gap-3">
                    <div className="w-16 h-18 sm:w-20 sm:h-22 rounded-xl bg-slate-300/40 dark:bg-slate-700/60 shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                        <div className="h-3 bg-slate-300/40 dark:bg-slate-700/60 rounded w-1/3" />
                        <div className="h-4 bg-slate-300/40 dark:bg-slate-700/60 rounded w-4/5" />
                        <div className="h-3 bg-slate-300/40 dark:bg-slate-700/60 rounded w-full" />
                    </div>
                </div>
            </div>
        );
    }

    // Permission Denied State
    if (error === 'restricted') {
        return (
            <div
                onClick={handleOpenWiki}
                className={`mt-2 rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer group shadow-sm select-none max-w-md ${
                    isMe
                        ? 'bg-black/25 hover:bg-black/35 border-amber-400/40 text-white'
                        : 'bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100/90 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800 text-slate-900 dark:text-white'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenWiki(e); }}
                title="Private Wiki - Click to view access permissions"
            >
                <div className="flex items-center gap-3 p-2.5 sm:p-3">
                    <div className="w-14 h-16 sm:w-16 sm:h-18 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-sm text-white">
                        <span className="material-symbols-outlined text-2xl">lock</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                                <span className="material-symbols-outlined text-[11px]">lock</span>
                                Restricted Wiki
                            </span>
                            <span className={`text-[10.5px] truncate ${isMe ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                                • #{wikiId}
                            </span>
                        </div>
                        <p className={`text-xs sm:text-[13px] font-bold truncate ${isMe ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                            Access Restricted Document
                        </p>
                        <p className={`text-[11px] truncate mt-0.5 ${isMe ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                            This Wiki is private or restricted to authorized collaborators.
                        </p>
                        <div className="flex items-center gap-1 mt-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 group-hover:underline">
                            <span>Open Wiki (Check Permissions)</span>
                            <span className="material-symbols-outlined text-[13px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Normal / Accessible Preview Card
    return (
        <div
            onClick={handleOpenWiki}
            className={`mt-2 rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer group shadow-sm select-none max-w-md ${
                isMe
                    ? 'bg-black/25 hover:bg-black/35 border-white/25 text-white backdrop-blur-xs'
                    : 'bg-slate-50 dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-700 hover:border-cyan-500/60 dark:hover:border-cyan-500/60 text-slate-900 dark:text-white'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenWiki(e); }}
            title="Click to directly open this Wiki document"
        >
            <div className="flex items-center gap-3 p-2.5 sm:p-3">
                {/* Reel/Cover Image Box */}
                <div className="relative w-16 h-18 sm:w-20 sm:h-22 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-black/10 dark:border-white/10 flex items-center justify-center shadow-xs">
                    {coverUrl ? (
                        <img
                            src={coverUrl}
                            alt={title}
                            onError={() => setImgFailed(true)}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 flex flex-col items-center justify-center p-2 text-white">
                            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">
                                menu_book
                            </span>
                            <span className="text-[9px] font-extrabold uppercase tracking-wider mt-1 opacity-90 text-center line-clamp-1">
                                {categoryName || 'Wiki'}
                            </span>
                        </div>
                    )}
                    {/* Hover subtle icon overlay */}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-cyan-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all shadow-md">
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </div>
                    </div>
                </div>

                {/* Details & CTA Column */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {/* Top Tag Row */}
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 dark:text-cyan-300 border border-cyan-500/30">
                            <span className="material-symbols-outlined text-[11px]">menu_book</span>
                            Knome Wiki
                        </span>
                        <span className={`text-[10.5px] truncate flex items-center gap-1 ${isMe ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            • {author}
                        </span>
                        {sectionsCount > 0 && (
                            <span className={`text-[10px] hidden sm:inline ${isMe ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                                • {sectionsCount} {sectionsCount === 1 ? 'sec' : 'secs'}
                            </span>
                        )}
                    </div>

                    {/* Wiki Title */}
                    <p className={`text-xs sm:text-[13.5px] font-bold line-clamp-1 leading-snug group-hover:text-cyan-400 transition-colors ${
                        isMe ? 'text-white' : 'text-slate-900 dark:text-slate-100'
                    }`}>
                        {title}
                    </p>

                    {/* Short Description */}
                    <p className={`text-[11px] line-clamp-2 mt-0.5 leading-relaxed ${
                        isMe ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                        {description}
                    </p>

                    {/* Clickable Open Wiki CTA */}
                    <div className="flex items-center gap-1 mt-1.5 text-[11px] font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors">
                        <span className="inline-flex items-center gap-1">
                            <span>Open Wiki</span>
                            <span className="material-symbols-outlined text-[13px] group-hover:translate-x-0.5 transition-transform">
                                arrow_forward
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
