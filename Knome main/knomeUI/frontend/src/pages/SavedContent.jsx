import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { savedContentApi, resolveMediaUrl } from '../utils/apiService';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';
import { useScrollLoading } from '../hooks/useScrollLoading';
import * as signalR from '@microsoft/signalr';
import { getHubUrl } from '../utils/apiClient';
import { analyzeContentCategory } from '../components/modals/SaveToCategoryModal';

const DEFAULT_CATEGORIES = [
    { id: 'all', name: 'All Categories', icon: 'folder_open', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
    { id: 'work', name: 'Work & Tech', icon: 'computer', color: 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' },
    { id: 'hr', name: 'HR & Policies', icon: 'gavel', color: 'bg-rose-500/10 text-rose-600 border border-rose-500/20' },
    { id: 'favorites', name: 'Favorites', icon: 'star', color: 'bg-amber-500/10 text-amber-600 border border-amber-500/20' },
    { id: 'readlater', name: 'Read Later', icon: 'schedule', color: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' },
];

export const getDefaultThumbnail = (contentType = '', category = '') => {
    const typeLower = (contentType || '').toLowerCase();
    const catLower = (category || '').toLowerCase();

    if (typeLower === 'video') {
        return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600';
    }
    if (typeLower === 'podcast') {
        return 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=600';
    }
    if (typeLower === 'article') {
        if (catLower.includes('design')) return 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&q=80&w=600';
        if (catLower.includes('hr') || catLower.includes('policy')) return 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=600';
        return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600';
    }
    if (typeLower === 'document' || typeLower === 'job') {
        return 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=600';
    }
    // Default for Posts & General Content
    return 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=600';
};

const extractText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join(' ');
    if (typeof val === 'object') return val.text || val.content || val.description || val.title || val.subtitle || '';
    return String(val);
};

export default function SavedContent() {
    const navigate = useNavigate();

    // Filter & Search State
    const [activeTab, setActiveTab] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('NewestSaved');

    // Data State
    const [savedItems, setSavedItems] = useState([]);
    const [counts, setCounts] = useState({ totalCount: 0, postsCount: 0, articlesCount: 0, videosCount: 0, podcastsCount: 0, documentsCount: 0 });
    const [pageNumber, setPageNumber] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionId, setActionId] = useState(null); // For loading spinner on unsave button

    // 📁 Category Management State (Standard Fixed Categories Only)
    const [categories] = useState(() => {
        try {
            // Overwrite and sanitize localStorage to remove any custom folders (e.g. ghgffd)
            localStorage.setItem('knome_saved_categories', JSON.stringify(DEFAULT_CATEGORIES));
        } catch (e) {}
        return DEFAULT_CATEGORIES;
    });
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [itemCategoryMap, setItemCategoryMap] = useState(() => {
        const saved = localStorage.getItem('knome_item_category_map');
        const parsed = saved ? JSON.parse(saved) : {
            'Post_10075': 'hr',
            'Post_10071': 'work',
            'Post_51': 'favorites'
        };
        const validIds = ['all', 'work', 'hr', 'favorites', 'readlater'];
        let changed = false;
        Object.keys(parsed).forEach(k => {
            if (!validIds.includes(parsed[k])) {
                parsed[k] = 'work';
                changed = true;
            }
        });
        if (changed || !saved) {
            localStorage.setItem('knome_item_category_map', JSON.stringify(parsed));
        }
        return parsed;
    });

    useEffect(() => {
        if (selectedCategory === 'design' || !['all', 'work', 'hr', 'favorites', 'readlater'].includes(selectedCategory)) {
            setSelectedCategory('all');
        }
    }, [selectedCategory]);

    // Modal State
    const [assigningItem, setAssigningItem] = useState(null);

    const tabs = [
        { id: 'All', label: 'All Types', countKey: 'totalCount' },
        { id: 'Posts', label: 'Posts', countKey: 'postsCount' },
        { id: 'Articles', label: 'Articles', countKey: 'articlesCount' },
        { id: 'Videos', label: 'Videos', countKey: 'videosCount' },
        { id: 'Podcasts', label: 'Audio', countKey: 'podcastsCount' },
    ];

    // Load counts
    const loadCounts = useCallback(async () => {
        try {
            const res = await savedContentApi.getSavedCounts();
            const payload = res?.data ?? res;
            const apiCounts = (payload && typeof payload === 'object') ? {
                totalCount: payload.totalCount || 0,
                postsCount: payload.postsCount || 0,
                articlesCount: payload.articlesCount || 0,
                videosCount: payload.videosCount || 0,
                podcastsCount: payload.podcastsCount || 0,
                documentsCount: payload.documentsCount || 0,
            } : { totalCount: 0, postsCount: 0, articlesCount: 0, videosCount: 0, podcastsCount: 0, documentsCount: 0 };

            const localCustomSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            let localPosts = 0, localArticles = 0, localVideos = 0, localPodcasts = 0;
            localCustomSaved.forEach(item => {
                const t = (item.contentType || 'Post').toLowerCase();
                if (t === 'post') localPosts++;
                else if (t === 'article') localArticles++;
                else if (t === 'video') localVideos++;
                else if (t === 'podcast') localPodcasts++;
            });

            const pCount = Math.max(apiCounts.postsCount || 0, localPosts);
            const aCount = Math.max(apiCounts.articlesCount || 0, localArticles);
            const vCount = Math.max(apiCounts.videosCount || 0, localVideos);
            const podCount = Math.max(apiCounts.podcastsCount || 0, localPodcasts);
            const sumTypes = pCount + aCount + vCount + podCount;
            const calculatedTotal = Math.max(
                apiCounts.totalCount || 0,
                sumTypes,
                localCustomSaved.length
            );

            setCounts({
                totalCount: calculatedTotal,
                postsCount: pCount,
                articlesCount: aCount,
                videosCount: vCount,
                podcastsCount: podCount,
                documentsCount: apiCounts.documentsCount || 0,
            });
        } catch (e) {
            console.error('Failed to load saved counts', e);
        }
    }, []);

    // Load saved content list
    const loadSavedContent = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await savedContentApi.getSavedContent({
                contentType: activeTab,
                search: searchQuery,
                sortBy,
                pageNumber,
                pageSize: 20,
            });

            const payload = res?.data ?? res;
            const items = payload ? (Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : [])) : [];

            // Merge local custom category bookmarks from SaveToCategoryModal
            const localCustomSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const formattedLocal = localCustomSaved
                .filter(s => {
                    if (activeTab === 'All') return true;
                    const type = (s.contentType || 'Post').toLowerCase();
                    const tab = activeTab.toLowerCase();
                    if (tab === 'posts') return type === 'post';
                    if (tab === 'articles') return type === 'article';
                    if (tab === 'videos') return type === 'video';
                    if (tab === 'podcasts') return type === 'podcast';
                    return true;
                })
                .map(s => ({
                    id: s.id,
                    contentId: s.contentId || s.id,
                    contentType: s.contentType || 'Post',
                    title: extractText(s.title),
                    summary: extractText(s.content),
                    contentText: extractText(s.content),
                    thumbnailUrl: s.thumbnailUrl || s.image || s.thumbnail || s.coverImage || s.mediaUrl || (Array.isArray(s.mediaUrls) ? s.mediaUrls[0] : null) || (Array.isArray(s.attachmentUrls) ? s.attachmentUrls[0] : null),
                    authorFullName: extractText(s.author),
                    savedAt: s.savedAt || s.savedDate || s.createdAt || new Date().toISOString(),
                    savedDate: s.savedAt || s.savedDate || s.createdAt || new Date().toISOString(),
                    userCategory: s.category,
                    categoryName: s.category
                }));

            const formattedApiItems = items.map(i => ({
                ...i,
                savedDate: i.savedDate || i.SavedDate || i.savedAt || i.createdAt || i.createdDate || new Date().toISOString(),
                savedAt: i.savedAt || i.savedDate || i.SavedDate || i.createdAt || i.createdDate || new Date().toISOString(),
            }));

            const combined = [...formattedLocal, ...formattedApiItems];
            const deduped = Array.from(new Map(combined.map(i => [String(i.contentId || i.id), i])).values());

            deduped.sort((a, b) => {
                const dateA = new Date(a.savedDate || a.savedAt || a.createdAt || 0).getTime() || 0;
                const dateB = new Date(b.savedDate || b.savedAt || b.createdAt || 0).getTime() || 0;
                return sortBy === 'OldestSaved' ? dateA - dateB : dateB - dateA;
            });

            setSavedItems(deduped);
            setTotalCount(deduped.length);
        } catch (e) {
            console.error('Failed to load saved content', e);
            // Fall back to local saved items if API fails
            const localCustomSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const formattedLocal = localCustomSaved
                .filter(s => {
                    if (activeTab === 'All') return true;
                    const type = (s.contentType || 'Post').toLowerCase();
                    const tab = activeTab.toLowerCase();
                    if (tab === 'posts') return type === 'post';
                    if (tab === 'articles') return type === 'article';
                    if (tab === 'videos') return type === 'video';
                    if (tab === 'podcasts') return type === 'podcast';
                    return true;
                })
                .map(s => ({
                    id: s.id,
                    contentId: s.contentId || s.id,
                    contentType: s.contentType || 'Post',
                    title: extractText(s.title),
                    summary: extractText(s.content),
                    contentText: extractText(s.content),
                    thumbnailUrl: s.thumbnailUrl || s.image || s.thumbnail || s.coverImage || s.mediaUrl || (Array.isArray(s.mediaUrls) ? s.mediaUrls[0] : null) || (Array.isArray(s.attachmentUrls) ? s.attachmentUrls[0] : null),
                    authorFullName: extractText(s.author),
                    savedAt: s.savedAt || s.savedDate || s.createdAt || new Date().toISOString(),
                    savedDate: s.savedAt || s.savedDate || s.createdAt || new Date().toISOString(),
                    userCategory: s.category,
                    categoryName: s.category
                }));

            formattedLocal.sort((a, b) => {
                const dateA = new Date(a.savedDate || a.savedAt || a.createdAt || 0).getTime() || 0;
                const dateB = new Date(b.savedDate || b.savedAt || b.createdAt || 0).getTime() || 0;
                return sortBy === 'OldestSaved' ? dateA - dateB : dateB - dateA;
            });

            setSavedItems(formattedLocal);
            setTotalCount(formattedLocal.length);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, searchQuery, sortBy, pageNumber]);

    useEffect(() => {
        const handleBookmarkSaved = (e) => {
            if (e?.detail?.removed) {
                const remId = String(e.detail.contentId || e.detail.id);
                setSavedItems(prev => prev.filter(i => String(i.contentId || i.id) !== remId));
                return;
            }
            loadSavedContent();
        };
        window.addEventListener('knome-bookmark-saved', handleBookmarkSaved);
        return () => window.removeEventListener('knome-bookmark-saved', handleBookmarkSaved);
    }, [loadSavedContent]);

    useEffect(() => {
        loadCounts();
        loadSavedContent();
    }, [loadCounts, loadSavedContent]);

    // Real-time SignalR listener for live bookmark updates
    useEffect(() => {
        const token = localStorage.getItem('knome_jwt');
        const isLoggingOut = typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true';
        if (!token || isLoggingOut) return;

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
            try { connection.stop().catch(() => {}); } catch {}
        };

        const handleLogoutEvent = () => stopConnection();
        window.addEventListener('knome:logout', handleLogoutEvent);

        connection.on('BookmarkUpdated', () => {
            if (!isStopped) {
                loadCounts();
                loadSavedContent();
            }
        });

        connection.start().then(() => {
            if (isStopped) {
                stopConnection();
            }
        }).catch(() => {
            /* Silently ignore */
        });

        return () => {
            window.removeEventListener('knome:logout', handleLogoutEvent);
            stopConnection();
        };
    }, [loadCounts, loadSavedContent]);

    // Unsave (Bookmark toggle) action
    const handleUnsave = async (e, item) => {
        e.stopPropagation();
        const targetId = item.contentId || item.id || item.postId || item.articleId || item.videoId || item.podcastId;
        const targetType = item.contentType || 'Post';
        const key = `${targetType}_${targetId}`;
        setActionId(key);

        // 1. Optimistically remove from state immediately
        setSavedItems((prev) => prev.filter((i) => {
            const curId = String(i.contentId || i.id);
            const isMatch = curId === String(targetId);
            if (isMatch && i.contentType && targetType) {
                return i.contentType.toLowerCase() !== targetType.toLowerCase();
            }
            return !isMatch;
        }));

        // 2. Decrement counts
        setCounts((prev) => {
            const type = (targetType || '').toLowerCase();
            return {
                ...prev,
                totalCount: Math.max(0, prev.totalCount - 1),
                postsCount: type === 'post' ? Math.max(0, prev.postsCount - 1) : prev.postsCount,
                articlesCount: type === 'article' ? Math.max(0, prev.articlesCount - 1) : prev.articlesCount,
                videosCount: type === 'video' ? Math.max(0, prev.videosCount - 1) : prev.videosCount,
                podcastsCount: (type === 'podcast' || type === 'audio') ? Math.max(0, prev.podcastsCount - 1) : prev.podcastsCount,
            };
        });
        setTotalCount((prev) => Math.max(0, prev - 1));

        // 3. Clean up all localStorage persistence
        try {
            const existingCustom = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const updatedCustom = existingCustom.filter((i) => {
                const curId = String(i.contentId || i.id);
                const isMatch = curId === String(targetId);
                if (isMatch && i.contentType && targetType) {
                    return i.contentType.toLowerCase() !== targetType.toLowerCase();
                }
                return !isMatch;
            });
            localStorage.setItem('knome_saved_items_custom', JSON.stringify(updatedCustom));

            const existingBookmarked = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
            const updatedBookmarked = existingBookmarked.filter((id) => String(id) !== String(targetId));
            localStorage.setItem('knome_bookmarked_ids', JSON.stringify(updatedBookmarked));

            const existingMap = JSON.parse(localStorage.getItem('knome_item_category_map') || '{}');
            delete existingMap[`${targetType}_${targetId}`];
            delete existingMap[`${item.contentType}_${item.contentId}`];
            delete existingMap[`${item.contentType}_${item.id}`];
            delete existingMap[`Post_${targetId}`];
            delete existingMap[`Article_${targetId}`];
            delete existingMap[`Video_${targetId}`];
            delete existingMap[`Podcast_${targetId}`];
            delete existingMap[String(targetId)];
            delete existingMap[targetId];
            localStorage.setItem('knome_item_category_map', JSON.stringify(existingMap));
            setItemCategoryMap(existingMap);
        } catch (storageErr) {
            console.warn('Failed to clean localStorage bookmarks:', storageErr);
        }

        // 4. Notify other components across the app
        try {
            window.dispatchEvent(new CustomEvent('knome-bookmark-saved', { 
                detail: { id: targetId, contentId: targetId, contentType: targetType, removed: true } 
            }));
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_items_custom' }));
        } catch (e) {}

        // 5. Sync with Backend API
        try {
            const isNumeric = /^\d+$/.test(String(targetId));
            if (isNumeric) {
                await savedContentApi.toggleBookmark(targetType, targetId);
            }
        } catch (err) {
            console.warn('Backend toggleBookmark notice (item removed locally):', err?.message || err);
        } finally {
            setActionId(null);
            try {
                await loadCounts();
            } catch {}
        }
    };

    // Category Assignment Handler
    const handleAssignCategory = (itemKey, categoryId) => {
        const updatedMap = { ...itemCategoryMap, [itemKey]: categoryId };
        setItemCategoryMap(updatedMap);
        localStorage.setItem('knome_item_category_map', JSON.stringify(updatedMap));
        setAssigningItem(null);
    };

    // Helper formatting
    const formatDate = (dateStr) => {
        if (!dateStr) return 'Recently';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getTypeColor = (type) => {
        switch (type?.toLowerCase()) {
            case 'article': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
            case 'video': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
            case 'audio':
            case 'podcast': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            case 'job':
            case 'document': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
            default: return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        }
    };

    const getTypeIcon = (type) => {
        switch (type?.toLowerCase()) {
            case 'article': return 'article';
            case 'video': return 'play_circle';
            case 'audio':
            case 'podcast': return 'audiotrack';
            case 'job':
            case 'document': return 'description';
            default: return 'dynamic_feed';
        }
    };

    const normalizeCategoryId = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        const clean = raw.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '');
        if (clean === 'work' || clean === 'work_tech' || clean.includes('work') || clean.includes('tech')) return 'work';
        if (clean === 'hr' || clean === 'hr_policies' || clean.includes('hr') || clean.includes('policy')) return 'hr';
        if (clean === 'favorites' || clean === 'favorite' || clean === 'starred' || clean.includes('fav')) return 'favorites';
        if (clean === 'readlater' || clean === 'read_later' || clean.includes('read') || clean.includes('later')) return 'readlater';
        if (clean === 'design' || clean === 'design_arch' || clean.includes('design') || clean.includes('arch')) return 'work';

        // Match against existing custom categories
        const found = categories.find(c => c.id === clean || c.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') === clean);
        if (found && found.id !== 'all') return found.id;

        return null;
    };

    const getItemCategoryId = (item) => {
        if (!item) return 'work';
        const itemKey1 = `${item.contentType}_${item.contentId}`;
        const itemKey2 = `${item.contentType}_${item.id}`;

        // 1. Explicitly mapped in itemCategoryMap
        const mapped = itemCategoryMap[itemKey1] || itemCategoryMap[itemKey2] || itemCategoryMap[item.contentId] || itemCategoryMap[item.id];
        const normMapped = normalizeCategoryId(mapped);
        if (normMapped) return normMapped;

        // 2. Item explicit category property from backend or bookmark
        const raw = item.categoryId || item.userCategory || item.category || item.categoryName || item.categoryOrCommunity;
        const normRaw = normalizeCategoryId(raw);
        if (normRaw) return normRaw;

        // 3. Intelligent AI / content analysis
        try {
            const analysis = analyzeContentCategory(
                item.summary || item.contentText || item.content || '',
                item.title || '',
                item.tags || [item.contentType || '']
            );
            if (analysis && analysis.id && analysis.id !== 'all') {
                const normAnalyzed = normalizeCategoryId(analysis.id);
                if (normAnalyzed) return normAnalyzed;
            }
        } catch (e) {}

        // 4. Default to a valid category folder (never 'all')
        const type = (item.contentType || '').toLowerCase();
        if (type === 'video' || type === 'article') return 'work';
        return 'readlater';
    };

    // Filter items by category
    const categoryFilteredItems = useMemo(() => {
        return savedItems.filter(item => {
            if (selectedCategory === 'all') return true;
            const itemCatId = getItemCategoryId(item);
            return itemCatId === selectedCategory;
        });
    }, [savedItems, selectedCategory, itemCategoryMap]);

    // Sorted items (Newest Saved vs Oldest Saved)
    const sortedItems = useMemo(() => {
        return [...categoryFilteredItems].sort((a, b) => {
            const dateA = new Date(a.savedDate || a.savedAt || a.createdAt || 0).getTime() || 0;
            const dateB = new Date(b.savedDate || b.savedAt || b.createdAt || 0).getTime() || 0;
            if (sortBy === 'OldestSaved') {
                return dateA - dateB;
            }
            return dateB - dateA;
        });
    }, [categoryFilteredItems, sortBy]);

    // Infinite Scroll Hook
    const { visibleCount: visibleItemCount, reset: resetScrollLoading } = useScrollLoading(sortedItems.length, 8, 8);

    useEffect(() => {
        resetScrollLoading();
    }, [selectedCategory, activeTab, sortBy, resetScrollLoading]);

    // Exact count of items in each category folder and sum across all folders
    const validCategoryFolders = categories.filter(c => c.id !== 'all');
    const folderCountsSum = validCategoryFolders.reduce((sum, cat) => {
        return sum + savedItems.filter(item => getItemCategoryId(item) === cat.id).length;
    }, 0);

    const totalTypeCount = (counts.postsCount || 0) + (counts.articlesCount || 0) + (counts.videosCount || 0) + (counts.podcastsCount || 0);
    const unifiedTotalCount = activeTab === 'All' ? Math.max(folderCountsSum, savedItems.length) : (counts.totalCount || savedItems.length);

    return (
        <main className="flex-1 flex flex-col gap-5 pb-6 min-w-0 text-slate-800 dark:text-slate-100 font-sans">
            
            {/* Hero Header */}
            <div className="relative rounded-2xl overflow-hidden shadow-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-6 md:px-8 md:py-7 gap-6">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-amber-100/50 dark:from-amber-900/20 via-transparent to-transparent pointer-events-none"></div>
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-amber-400/10 dark:bg-amber-500/10 blur-[80px] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[11px] font-bold mb-2 backdrop-blur-md uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[16px]">bookmark</span>
                        <span>Personal Library & Folders</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight mb-2 text-slate-900 dark:text-white">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 dark:from-amber-400 dark:via-orange-400 dark:to-yellow-400">
                            Saved Content & Categories
                        </span>
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-xs md:text-sm font-medium leading-relaxed max-w-2xl">
                        Organize your bookmarked posts, technical articles, videos, and podcasts into custom category folders.
                    </p>
                </div>
            </div>

            {/* Filter Tabs & Search / Sort Controls */}
            <div className="glass rounded-2xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Content Type Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar whitespace-nowrap">
                    {tabs.map((tab) => {
                        const count = tab.id === 'All' ? unifiedTotalCount : (counts[tab.countKey] || 0);
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setPageNumber(1);
                                }}
                                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Search & Sort Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="relative flex-1 md:w-56">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                        <input
                            type="text"
                            placeholder="Search saved items..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPageNumber(1);
                            }}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        />
                    </div>

                    <select
                        value={sortBy}
                        onChange={(e) => {
                            setSortBy(e.target.value);
                            setPageNumber(1);
                        }}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                    >
                        <option value="NewestSaved">Newest Saved</option>
                        <option value="OldestSaved">Oldest Saved</option>
                    </select>
                </div>
            </div>

            {/* 📁 CATEGORIES BAR & CREATION BUTTON */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs">
                <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500 text-[18px]">folder_special</span>
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Category Folders
                        </h2>
                    </div>
                </div>

                {/* Categories Pills */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        const catItemCount = cat.id === 'all' 
                            ? folderCountsSum 
                            : savedItems.filter(item => getItemCategoryId(item) === cat.id).length;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shrink-0 border ${
                                    isSelected
                                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm scale-[1.02]'
                                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
                                <span>{cat.name}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                    isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                }`}>
                                    {catItemCount}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Error Banner with Retry */}
            {error && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[24px]">error</span>
                        <p className="text-sm font-semibold">{error}</p>
                    </div>
                    <button
                        onClick={loadSavedContent}
                        className="px-4 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-colors shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Skeleton Loading State */}
            {isLoading && (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="glass bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 animate-pulse flex flex-col md:flex-row gap-4">
                            <div className="w-full md:w-44 h-28 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0"></div>
                            <div className="flex-1 flex flex-col gap-2 justify-center">
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4"></div>
                                <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && sortedItems.length === 0 && (
                <div className="glass rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center flex flex-col items-center justify-center min-h-[300px]">
                    <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-[32px]">folder_off</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1.5">No Items in this Category</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-5 leading-relaxed">
                        {selectedCategory !== 'all'
                            ? `No saved items assigned to "${categories.find(c => c.id === selectedCategory)?.name}". Assign items to this category or select All Categories.`
                            : `You haven't bookmarked any items yet.`}
                    </p>
                    {selectedCategory !== 'all' ? (
                        <button
                            onClick={() => setSelectedCategory('all')}
                            className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs transition-transform"
                        >
                            View All Categories
                        </button>
                    ) : (
                        <button
                            onClick={() => navigate('/')}
                            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-transform"
                        >
                            Explore Feed
                        </button>
                    )}
                </div>
            )}

            {/* Saved Content Items List */}
            {!isLoading && !error && sortedItems.length > 0 && (
                <div className="flex flex-col gap-3">
                    {sortedItems.slice(0, visibleItemCount).map((item) => {
                        const itemKey = `${item.contentType || 'Post'}_${item.contentId || item.id}`;
                        const isUnsaving = actionId === itemKey;
                        const isAvailable = item.isAvailable !== false;
                        const assignedCatId = getItemCategoryId(item);
                        const assignedCat = categories.find(c => c.id === assignedCatId) || categories.find(c => c.id === 'work') || categories[1] || categories[0];

                        const rawImage = item.thumbnailUrl || item.image || item.thumbnail || item.coverImage || item.mediaUrl || (Array.isArray(item.mediaUrls) ? item.mediaUrls[0] : null) || (Array.isArray(item.attachmentUrls) ? item.attachmentUrls[0] : null);
                        const thumbnailSrc = rawImage ? resolveMediaUrl(rawImage) : getDefaultThumbnail(item.contentType, item.userCategory || item.categoryName);

                        return (
                            <div
                                key={itemKey}
                                onClick={() => {
                                    if (isAvailable && item.targetUrl) {
                                        navigate(item.targetUrl);
                                    }
                                }}
                                className={`group glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col md:flex-row gap-4 relative overflow-hidden transition-all duration-200 ${
                                    isAvailable ? 'hover:border-amber-500/50 hover:shadow-md cursor-pointer' : 'opacity-80'
                                }`}
                            >
                                {/* Thumbnail / Media Image */}
                                <img
                                    src={thumbnailSrc}
                                    alt={extractText(item.title)}
                                    className="w-full md:w-44 h-28 object-cover rounded-xl shrink-0 border border-slate-100 dark:border-slate-800"
                                    onError={(e) => {
                                        e.target.src = getDefaultThumbnail(item.contentType, item.userCategory || item.categoryName);
                                    }}
                                />

                                {/* Content Info */}
                                <div className="flex-1 flex flex-col justify-between pr-8">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                            {/* Type Tag */}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${getTypeColor(item.contentType)}`}>
                                                {item.contentType}
                                            </span>

                                            {/* 📁 Category Badge (Clickable to change category) */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAssigningItem(item);
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${assignedCat.color || 'bg-slate-100 text-slate-700'}`}
                                                title="Click to change Category"
                                            >
                                                <span className="material-symbols-outlined text-[13px]">{assignedCat.icon}</span>
                                                <span>{assignedCat.name}</span>
                                                <span className="material-symbols-outlined text-[11px] opacity-60">edit</span>
                                            </button>

                                            <span className="text-[11px] font-semibold text-slate-400">
                                                Saved {formatDate(item.savedDate || item.savedAt || item.createdAt)}
                                            </span>
                                        </div>

                                        <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white mb-1 leading-snug group-hover:text-amber-500 transition-colors line-clamp-2">
                                            <HighlightText text={extractText(item.title)} query={searchQuery} />
                                        </h3>

                                        {isAvailable ? (
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                                                <HighlightText text={extractText(item.summary || item.contentText)} query={searchQuery} />
                                            </p>
                                        ) : (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-semibold mb-2">
                                                <span className="material-symbols-outlined text-[15px]">visibility_off</span>
                                                <span>{item.unavailabilityReason || 'Content Unavailable'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Author & Footer Info */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                        <div className="flex items-center gap-2">
                                            {item.authorAvatar ? (
                                                <img
                                                    src={resolveMediaUrl(item.authorAvatar)}
                                                    alt={extractText(item.authorName || item.authorFullName)}
                                                    className="w-5 h-5 rounded-full object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                                                    {extractText(item.authorName || item.authorFullName || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                <HighlightText text={extractText(item.authorName || item.authorFullName || 'Knome Member')} query={searchQuery} />
                                            </span>
                                            {item.authorRole && (
                                                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                                                    • {item.authorRole}
                                                </span>
                                            )}
                                        </div>

                                        {(item.likesCount > 0 || item.commentsCount > 0) && (
                                            <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-400">
                                                {item.likesCount > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[13px]">favorite</span>
                                                        {item.likesCount}
                                                    </span>
                                                )}
                                                {item.commentsCount > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[13px]">chat_bubble</span>
                                                        {item.commentsCount}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Unsave / Bookmark Button */}
                                <button
                                    onClick={(e) => handleUnsave(e, item)}
                                    disabled={isUnsaving}
                                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-rose-500 hover:text-white text-amber-500 flex items-center justify-center shadow-xs transition-all hover:scale-110 z-10 cursor-pointer"
                                    title="Unsave item"
                                >
                                    {isUnsaving ? (
                                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                            bookmark
                                        </span>
                                    )}
                                </button>
                            </div>
                        );
                    })}

                    {/* Infinite Scroll Progress Indicator */}
                    {visibleItemCount < sortedItems.length && (
                        <div className="py-6 text-center flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
                            <span className="material-symbols-outlined text-[20px] animate-spin text-amber-500">progress_activity</span>
                            <span>Loading more saved items on scroll...</span>
                        </div>
                    )}
                </div>
            )}

            {/* ─── MODAL: ASSIGN CATEGORY TO ITEM ─── */}
            {assigningItem && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl animate-in zoom-in-95 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-indigo-600 font-bold">
                                <span className="material-symbols-outlined text-xl">folder_zip</span>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">Assign Category</h3>
                            </div>
                            <button onClick={() => setAssigningItem(null)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 font-semibold line-clamp-1">
                            Item: "{assigningItem.title}"
                        </p>

                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                            {categories.filter(c => c.id !== 'all').map((cat) => {
                                const itemKey = `${assigningItem.contentType || 'Post'}_${assigningItem.contentId || assigningItem.id}`;
                                const isCurrent = getItemCategoryId(assigningItem) === cat.id;

                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleAssignCategory(itemKey, cat.id)}
                                        className={`w-full p-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer border ${
                                            isCurrent
                                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
                                            <span>{cat.name}</span>
                                        </div>
                                        {isCurrent && <span className="material-symbols-outlined text-[16px]">check</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
