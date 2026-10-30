import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSystemConfig } from '../utils/systemConfig';
import { searchApi, resolveMediaUrl, saveRecentSearch, getLocalRecentSearches, clearLocalRecentSearches } from '../utils/apiService';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

const CATEGORIES = [
    { id: 'All', label: 'All Results', icon: 'grid_view' },
    { id: 'People', label: 'People', icon: 'person' },
    { id: 'Post', label: 'Posts', icon: 'edit_square' },
    { id: 'Article', label: 'Articles', icon: 'article' },
    { id: 'Video', label: 'Videos', icon: 'videocam' },
    { id: 'Wiki', label: 'Wiki', icon: 'menu_book' },
    { id: 'Community', label: 'Communities', icon: 'group' },
    { id: 'Hashtags', label: 'Hashtags', icon: 'tag' },
    { id: 'Podcast', label: 'Audio', icon: 'audiotrack' },
];

export default function Search() {
    const navigate = useNavigate();
    const { isPostsEnabled, isArticlesEnabled, isVideosEnabled, isPodcastsEnabled, isWikiEnabled, isClipsEnabled } = useSystemConfig();
    const queryParams = useQuery();
    const initialQuery = queryParams.get('q') || '';
    const initialType = queryParams.get('type') || 'All';

    const activeCategories = useMemo(() => {
        return CATEGORIES.filter(cat => {
            if (cat.id === 'Post' && !isPostsEnabled) return false;
            if (cat.id === 'Article' && !isArticlesEnabled) return false;
            if (cat.id === 'Video' && !isVideosEnabled) return false;
            if (cat.id === 'Wiki' && !isWikiEnabled) return false;
            if (cat.id === 'Podcast' && !isPodcastsEnabled) return false;
            return true;
        });
    }, [isPostsEnabled, isArticlesEnabled, isVideosEnabled, isWikiEnabled, isPodcastsEnabled]);

    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [activeCategory, setActiveCategory] = useState(initialType);
    const [activeSort, setActiveSort] = useState('relevance');
    const [activeDepartment, setActiveDepartment] = useState('All');
    const [activeDateRange, setActiveDateRange] = useState('All Time');

    const [results, setResults] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    const [recentSearches, setRecentSearches] = useState([]);
    const [trendingSearches, setTrendingSearches] = useState([]);

    // Sync input when URL query parameter changes
    useEffect(() => {
        setSearchQuery(initialQuery);
        setActiveCategory(initialType);
        if (initialQuery && initialQuery.trim().length >= 3) {
            const q = initialQuery.trim();
            saveRecentSearch(q);
            setRecentSearches(prev => [
                { searchTerm: q, searchDate: new Date().toISOString() },
                ...prev.filter(item => item.searchTerm.toLowerCase() !== q.toLowerCase())
            ].slice(0, 10));
            searchApi.saveHistory(q);
        }
    }, [initialQuery, initialType]);

    // Load recent history and trending queries
    const loadSidebarData = useCallback(async () => {
        try {
            const [histRes, trendRes] = await Promise.all([
                searchApi.getHistory(10).catch(() => null),
                searchApi.getTrending(8).catch(() => null)
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
            console.error('Failed to load search sidebar data', e);
            setRecentSearches(getLocalRecentSearches());
        }
    }, []);

    useEffect(() => {
        loadSidebarData();
    }, [loadSidebarData]);

    // Calculate Date Range ISO strings for API
    const getDateRangeIso = (range) => {
        const now = new Date();
        if (range === 'Past 24 Hours') {
            const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            return { fromDate: from.toISOString(), toDate: now.toISOString() };
        }
        if (range === 'Past Week') {
            const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return { fromDate: from.toISOString(), toDate: now.toISOString() };
        }
        if (range === 'Past Month') {
            const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return { fromDate: from.toISOString(), toDate: now.toISOString() };
        }
        return { fromDate: null, toDate: null };
    };

    // Fetch search results from API (Minimum 3 characters required)
    const performSearch = useCallback(async (isLoadMore = false) => {
        const queryTerm = searchQuery.trim();
        if (!queryTerm || queryTerm.length < 3) {
            setResults([]);
            setTotalCount(0);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const pageToFetch = isLoadMore ? pageNumber + 1 : 1;
            const { fromDate, toDate } = getDateRangeIso(activeDateRange);
            const res = await searchApi.search(
                queryTerm,
                activeCategory,
                pageToFetch,
                20,
                activeSort,
                activeDepartment,
                null,
                null,
                fromDate,
                toDate
            );

            const rawItems = res?.items || (Array.isArray(res) ? res : []);
            const items = rawItems.filter(item => {
                const type = (item.contentType || item.type || '').toLowerCase();
                if (type === 'post' && !isPostsEnabled) return false;
                if (type === 'article' && !isArticlesEnabled) return false;
                if (type === 'video' && !isVideosEnabled) return false;
                if (type === 'podcast' && !isPodcastsEnabled) return false;
                if (type === 'wiki' && !isWikiEnabled) return false;
                if (type === 'clip' && !isClipsEnabled) return false;
                return true;
            });
            const total = res?.totalCount || items.length;

            if (isLoadMore) {
                setResults(prev => {
                    const updated = [...prev, ...items];
                    setHasMore(items.length === 20 && updated.length < total);
                    return updated;
                });
                setPageNumber(pageToFetch);
            } else {
                setResults(items);
                setPageNumber(1);
                setHasMore(items.length === 20 && items.length < total);
            }

            setTotalCount(total);
        } catch (err) {
            console.error('Error fetching global search results', err);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, activeCategory, activeSort, activeDepartment, activeDateRange, isPostsEnabled, isArticlesEnabled, isVideosEnabled, isPodcastsEnabled, isWikiEnabled, isClipsEnabled]);

    useEffect(() => {
        if (activeCategory !== 'All' && !activeCategories.some(c => c.id === activeCategory)) {
            setActiveCategory('All');
        }
    }, [activeCategories, activeCategory]);

    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(false);
        }, 200);
        return () => clearTimeout(timer);
    }, [performSearch]);

    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 400) {
                if (!isSearching && hasMore) {
                    performSearch(true);
                }
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isSearching, hasMore, performSearch]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const term = searchQuery.trim();
        if (!term || term.length < 3) return;

        // Save to Recent Searches ONLY on explicit search submit
        saveRecentSearch(term);
        setRecentSearches(prev => [
            { searchTerm: term, searchDate: new Date().toISOString() },
            ...prev.filter(item => item.searchTerm.toLowerCase() !== term.toLowerCase())
        ].slice(0, 10));
        searchApi.saveHistory(term);

        navigate(`/search?q=${encodeURIComponent(term)}&type=${activeCategory}`);
    };

    const handleClearHistory = async (e, term = null) => {
        if (e) e.stopPropagation();

        // 1. Immediately update state
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

    const handleItemClick = (item) => {
        const type = item.contentType;
        const id = item.id;

        if (type === 'User' || type === 'People') {
            navigate(`/profile/${id}`, { state: { user: { id, userId: id, name: item.title, avatar: item.authorProfilePhotoUrl, roleName: item.summary, department: item.departmentName } } });
        } else if (type === 'Article') {
            navigate(`/article-view?id=${id}`);
        } else if (type === 'Community') {
            navigate(`/community/view?id=${id}`);
        } else if (type === 'Video') {
            navigate('/videos');
        } else if (type === 'Podcast') {
            navigate('/podcasts');
        } else if (type === 'Job') {
            navigate('/jobs');
        } else if (type === 'Post') {
            navigate(`/posts?id=${id}`);
        } else {
            navigate('/');
        }
    };

    return (
        <main className="flex-1 min-w-0 flex flex-col gap-6 pb-6">
            
            {/* Hero Header */}
            <div className="relative rounded-2xl overflow-hidden mb-2 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-violet-100/50 dark:from-violet-900/20 via-transparent to-transparent pointer-events-none"></div>
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-violet-400/10 dark:bg-violet-500/10 blur-[80px] pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                        ✨ Universal Enterprise Search
                    </div>
                    <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 dark:from-violet-400 dark:via-purple-400 dark:to-fuchsia-400">
                            Search & Discovery
                        </span>
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                        Instantly find people, articles, posts, videos, audio, and communities across TechnoSocial.
                    </p>
                </div>
            </div>

            {/* Category Navigation Bar */}
            <div className="flex overflow-x-auto custom-scrollbar gap-2 pb-2">
                {activeCategories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => {
                            setActiveCategory(cat.id);
                            navigate(`/search?q=${encodeURIComponent(searchQuery)}&type=${cat.id}`);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-[13px] font-bold shrink-0 transition-all flex items-center gap-2 border ${
                            activeCategory === cat.id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col gap-6 order-2 lg:order-1">
                    
                    {/* Primary Search Input */}
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-2xl">search</span>
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search people, posts, articles, videos, communities..." 
                            className="w-full pl-12 pr-12 py-4 text-lg font-bold rounded-2xl outline-none shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                        />
                        {searchQuery && (
                            <button 
                                type="button"
                                onClick={() => setSearchQuery('')} 
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        )}
                    </form>

                    {/* Results Container */}
                    <div className="glass rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 min-h-[500px] flex flex-col overflow-hidden">
                        
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h2 className="text-[13px] font-bold text-slate-500">
                                {isSearching ? 'Searching...' : (
                                    searchQuery 
                                        ? `Found ${totalCount} results for "${searchQuery}"` 
                                        : `Showing ${totalCount} ${activeCategory === 'All' ? 'items' : activeCategory}`
                                )}
                            </h2>
                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Department Filter */}
                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <span className="text-[11px] font-bold text-slate-400">Dept:</span>
                                    <select
                                        value={activeDepartment}
                                        onChange={(e) => setActiveDepartment(e.target.value)}
                                        className="bg-transparent text-[12px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                                    >
                                        <option value="All">All Depts</option>
                                        <option value="Engineering">Engineering</option>
                                        <option value="Design">Design</option>
                                        <option value="Human Resources">HR</option>
                                        <option value="Operations">Operations</option>
                                    </select>
                                </div>

                                {/* Date Range Filter */}
                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <span className="text-[11px] font-bold text-slate-400">Date:</span>
                                    <select
                                        value={activeDateRange}
                                        onChange={(e) => setActiveDateRange(e.target.value)}
                                        className="bg-transparent text-[12px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                                    >
                                        <option value="All Time">All Time</option>
                                        <option value="Past 24 Hours">Past 24 Hours</option>
                                        <option value="Past Week">Past Week</option>
                                        <option value="Past Month">Past Month</option>
                                    </select>
                                </div>

                                {/* Sort By Filter */}
                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <span className="text-[11px] font-bold text-slate-400">Sort:</span>
                                    <select
                                        value={activeSort}
                                        onChange={(e) => setActiveSort(e.target.value)}
                                        className="bg-transparent text-[12px] font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                                    >
                                        <option value="relevance">Relevance</option>
                                        <option value="date">Newest First</option>
                                        <option value="popularity">Popularity</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
                            {/* Loading Skeleton */}
                            {isSearching && (
                                <div className="space-y-4 animate-pulse">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-4">
                                            <div className="w-14 h-14 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0"></div>
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                                                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-2/3"></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Results Items */}
                            {!isSearching && searchQuery && results.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    {results.map((res, idx) => {
                                        const isUser = res.contentType === 'User' || res.contentType === 'People';
                                        const thumb = resolveMediaUrl(res.thumbnailUrl || res.authorProfilePhotoUrl);
                                        return (
                                            <div 
                                                key={`${res.contentType}-${res.id}-${idx}`} 
                                                onClick={() => handleItemClick(res)}
                                                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-between group cursor-pointer"
                                            >
                                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                                    {thumb ? (
                                                        <img src={thumb} alt={res.title} className={`w-14 h-14 ${isUser ? 'rounded-full' : 'rounded-xl'} object-cover shrink-0 border border-slate-200 dark:border-slate-800 shadow-sm`} />
                                                    ) : (
                                                        <div className={`w-14 h-14 ${isUser ? 'rounded-full' : 'rounded-xl'} bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 text-xl font-bold`}>
                                                            {isUser ? '👤' : res.contentType === 'Community' ? '👥' : res.contentType === 'Video' ? '🎥' : res.contentType === 'Podcast' ? '🎙️' : '📄'}
                                                        </div>
                                                    )}
                                                    
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/50">
                                                                {isUser ? 'People' : res.contentType}
                                                            </span>
                                                            <h4 className="text-[15px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors whitespace-normal break-words">
                                                                <HighlightText text={res.title || (res.contentType === 'Post' ? `${res.authorFullName || 'Employee'}'s Post` : res.summary)} query={searchQuery} />
                                                            </h4>
                                                        </div>
                                                        
                                                        <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                                            <HighlightText text={res.summary} query={searchQuery} />
                                                        </p>

                                                        {isUser ? (
                                                            res.departmentName && (
                                                                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                                                                    Department: <HighlightText text={res.departmentName} query={searchQuery} />
                                                                </p>
                                                            )
                                                        ) : (
                                                            res.authorFullName && (
                                                                <p className="text-[11px] font-semibold text-slate-400 mt-1">
                                                                    By <HighlightText text={res.authorFullName} query={searchQuery} /> • {new Date(res.createdDate).toLocaleDateString()}
                                                                </p>
                                                            )
                                                        )}
                                                    </div>
                                                </div>

                                                <span className="material-symbols-outlined text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-4">chevron_right</span>
                                            </div>
                                        );
                                    })}

                                    <ScrollLoadingIndicator isVisible={isSearching && results.length > 0} text="Loading more search results on scroll..." />

                                    {hasMore && !isSearching && (
                                        <button
                                            onClick={() => performSearch(true)}
                                            className="mt-4 w-full py-3 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-500 hover:text-white transition-colors"
                                        >
                                            Load More Results
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Empty State */}
                            {!isSearching && searchQuery && results.length === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                        <span className="material-symbols-outlined text-[36px] text-slate-400">search_off</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No matching results found</h3>
                                    <p className="text-[14px] text-slate-500 max-w-sm">We couldn't find anything matching "{searchQuery}". Try selecting "All Results" or searching a different term.</p>
                                </div>
                            )}

                        </div>
                    </div>

                </div>

                {/* Right Sidebar: Recent History & Trending Queries */}
                <aside className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-6 order-1 lg:order-2">
                    
                    {/* Recent Searches */}
                    <div className="glass rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">history</span>
                                Recent Searches
                            </h3>
                            {recentSearches.length > 0 && (
                                <button onClick={(e) => handleClearHistory(e, null)} className="text-[10px] font-bold text-indigo-500 hover:underline">
                                    Clear All
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            {recentSearches.length > 0 ? (
                                recentSearches.slice(0, 10).map((rec, i) => (
                                    <div key={i} className="flex items-center justify-between group rounded-xl px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                        <button 
                                            onClick={() => { setSearchQuery(rec.searchTerm); navigate(`/search?q=${encodeURIComponent(rec.searchTerm)}`); }}
                                            className="text-left text-[13px] font-bold text-slate-700 dark:text-slate-300 truncate flex-1"
                                        >
                                            {rec.searchTerm}
                                        </button>
                                        <button 
                                            onClick={(e) => handleClearHistory(e, rec.searchTerm)}
                                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-[12px] text-slate-400 italic">No search history yet.</p>
                            )}
                        </div>
                    </div>


                </aside>
            </div>

        </main>
    );
}
