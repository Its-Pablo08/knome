import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi } from '../../utils/apiService';

const DEFAULT_PROJECT_TAGS = [
    { tag: 'MPOnline', count: 5, color: '#6366f1' },
    { tag: 'DotNet', count: 5, color: '#8b5cf6' },
    { tag: 'devops', count: 4, color: '#0ea5e9' },
    { tag: 'CSharp', count: 3, color: '#10b981' },
    { tag: 'ASPNETCore', count: 3, color: '#f59e0b' },
    { tag: 'kubernetes', count: 2, color: '#06b6d4' },
    { tag: 'Engineering', count: 2, color: '#ec4899' },
    { tag: 'Innovation', count: 2, color: '#ef4444' },
];

const PALETTE = [
    '#6366f1', '#0ea5e9', '#10b981', '#8b5cf6', 
    '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', 
    '#3b82f6', '#14b8a6'
];

export default function TrendingTagsWidget({ onTagClick }) {
    const navigate = useNavigate();
    const [tags, setTags] = useState(DEFAULT_PROJECT_TAGS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadTrendingHashtags = async () => {
            try {
                // Check short-lived cached tags (5 minute TTL) for instant load
                try {
                    const cachedStr = sessionStorage.getItem('knome_trending_tags_cache');
                    if (cachedStr) {
                        const parsed = JSON.parse(cachedStr);
                        const cachedList = Array.isArray(parsed) ? parsed : parsed?.data;
                        const cacheTime = parsed?.timestamp || 0;
                        if (Array.isArray(cachedList) && cachedList.length > 0 && isMounted) {
                            setTags(cachedList);
                            setIsLoading(false);
                            if (Date.now() - cacheTime < 300000) {
                                return; // Fresh cache hit within 5 minutes, avoid network call
                            }
                        }
                    }
                } catch (_) {}

                // 1. Fetch lightweight batch of recent posts from backend API (25 instead of 100)
                const apiPosts = await postsApi.getPosts(null, null, 1, 25).catch(() => []);
                const postsList = Array.isArray(apiPosts) ? apiPosts : (apiPosts?.data || []);

                // 2. Merge local fallback posts if any
                try {
                    const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                    localPosts.slice(0, 15).forEach(lp => {
                        const isComm = Boolean(lp.communityId || lp.sharedCommunity || lp.sharedCommunityName || lp.audienceType === 'Community' || lp.audienceType === 'SpecificCommunities' || String(lp.id || lp.postId || '').startsWith('comm_post_'));
                        if (!isComm && !postsList.some(p => String(p.id || p.postId) === String(lp.id || lp.postId))) {
                            postsList.push(lp);
                        }
                    });
                } catch (e) {}

                // 3. Extract and aggregate hashtags
                const tagCounts = new Map();
                const hashtagRegex = /#([a-zA-Z0-9_\u0900-\u097F]+)/g;

                postsList.forEach(post => {
                    const text = post.contentText || post.content || post.text || '';
                    const foundMatches = text.match(hashtagRegex) || [];
                    const postTags = new Set();

                    foundMatches.forEach(m => {
                        const clean = m.replace('#', '').trim();
                        // Ignore pure numbers (like timestamp/id tags from test scripts)
                        if (clean && clean.length >= 2 && !/^\d+$/.test(clean)) {
                            postTags.add(clean);
                        }
                    });

                    // Also check explicit tags array if present
                    if (Array.isArray(post.tags)) {
                        post.tags.forEach(t => {
                            const clean = String(t).replace('#', '').trim();
                            if (clean && clean.length >= 2 && !/^\d+$/.test(clean)) {
                                postTags.add(clean);
                            }
                        });
                    }

                    postTags.forEach(t => {
                        // Store with normalized key for aggregation, preserve canonical display casing
                        const lower = t.toLowerCase();
                        if (tagCounts.has(lower)) {
                            const existing = tagCounts.get(lower);
                            existing.count += 1;
                        } else {
                            tagCounts.set(lower, { tag: t, count: 1 });
                        }
                    });
                });

                // Also incorporate any custom tags from recent searches
                try {
                    const recentSearches = JSON.parse(localStorage.getItem('knome_recent_searches') || '[]');
                    recentSearches.forEach(s => {
                        const term = typeof s === 'string' ? s : s.searchTerm;
                        if (term && term.startsWith('#')) {
                            const clean = term.replace('#', '').trim();
                            if (clean && clean.length >= 2 && !/^\d+$/.test(clean)) {
                                const lower = clean.toLowerCase();
                                if (!tagCounts.has(lower)) {
                                    tagCounts.set(lower, { tag: clean, count: 1 });
                                }
                            }
                        }
                    });
                } catch (e) {}

                // 4. Sort by frequency count descending
                const sorted = Array.from(tagCounts.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);

                if (sorted.length > 0 && isMounted) {
                    const dynamicList = sorted.map((item, idx) => ({
                        tag: item.tag,
                        count: item.count,
                        color: PALETTE[idx % PALETTE.length]
                    }));
                    setTags(dynamicList);
                    try {
                        sessionStorage.setItem('knome_trending_tags_cache', JSON.stringify({
                            timestamp: Date.now(),
                            data: dynamicList
                        }));
                    } catch (_) {}
                }
            } catch (err) {
                console.warn('Failed to load dynamic trending tags:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadTrendingHashtags();
        return () => { isMounted = false; };
    }, []);

    const handleTagClick = (tag) => {
        if (onTagClick) {
            onTagClick(tag);
            return;
        }
        // Navigates directly to search with matching hashtag query
        navigate(`/search?q=${encodeURIComponent('#' + tag)}`);
    };

    return (
        <div className="rounded-2xl p-5"
            style={{background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-black flex items-center gap-2" style={{color: 'var(--text-primary)'}}>
                    <span className="material-symbols-outlined text-[18px] text-indigo-500" style={{fontVariationSettings:"'FILL' 1"}}>trending_up</span>
                    Trending Tags
                </h3>
                <span className="text-[11px] font-bold text-slate-400">
                    Real-time
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                {tags.map(({ tag, count, color }) => (
                    <span key={tag}
                        onClick={() => handleTagClick(tag)}
                        title={`View posts tagged with #${tag}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 group shadow-xs"
                        style={{background: `${color}15`, color, border: `1px solid ${color}30`}}>
                        <span className="group-hover:underline">#{tag}</span>
                        {typeof count === 'number' && count > 0 && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded-full font-black opacity-80"
                                style={{background: `${color}25`}}>
                                {count}
                            </span>
                        )}
                    </span>
                ))}
            </div>
        </div>
    );
}
