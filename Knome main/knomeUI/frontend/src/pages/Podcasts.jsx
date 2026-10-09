import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import { useAudio } from '../components/contexts/AudioContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import UploadPodcastModal from '../components/modals/UploadPodcastModal';
import SaveToCategoryModal from '../components/modals/SaveToCategoryModal';
import ArticleShareModal from '../components/modals/ArticleShareModal';
import { podcastsApi, savedContentApi, interactionsApi, resolveMediaUrl, getPersonalizedRecommendations } from '../utils/apiService';
import { checkRestrictedContent } from '../utils/restrictedWords';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

// Helper function to recursively insert a new reply into a nested comments tree
function addReplyToTree(items, targetId, newReply) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        const itemId = item.commentId || item.replyId || item.id;
        if (String(itemId) === String(targetId)) {
            return {
                ...item,
                replies: [...(item.replies || []), newReply]
            };
        }
        if (item.replies && item.replies.length > 0) {
            return {
                ...item,
                replies: addReplyToTree(item.replies, targetId, newReply)
            };
        }
        return item;
    });
}

// Recursive Component for Infinite Nested Threaded Comments & Replies
function ThreadedCommentItem({ item, ep, level = 0, onAddReply, activeReplyId, setActiveReplyId, replyInputMap, setReplyInputMap }) {
    const itemId = item.commentId || item.replyId || item.id;
    const authorName = item.commenterFullName || item.replierFullName || item.author || 'Employee';
    const authorAvatar = resolveMediaUrl(item.commenterProfilePhotoUrl || item.replierProfilePhotoUrl || item.avatar);
    const itemText = item.commentText || item.replyText || item.text;
    const replies = item.replies || [];
    const isReplying = activeReplyId === itemId;

    return (
        <div className={`p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs shadow-xs space-y-2 transition-all ${level > 0 ? 'ml-3 md:ml-5 border-l-2 border-indigo-400/60 dark:border-indigo-600/60 pl-3.5 mt-2 bg-slate-50/60 dark:bg-slate-800/30' : ''}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img 
                        src={authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff&bold=true`}
                        onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff&bold=true`; }}
                        alt={authorName}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                    <span className="font-bold text-slate-900 dark:text-white">{authorName}</span>
                    {level > 0 && <span className="text-[10px] text-indigo-500 font-semibold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/40">Thread</span>}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                    {new Date(item.createdDate || Date.now()).toLocaleDateString()}
                </span>
            </div>

            <p className="text-slate-700 dark:text-slate-300 pl-8 leading-relaxed font-medium">
                {itemText}
            </p>

            {/* Action Bar: Reply Button */}
            <div className="flex items-center gap-4 pl-8 pt-1 text-[11px] font-bold">
                <button 
                    onClick={() => setActiveReplyId(isReplying ? null : itemId)}
                    className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline cursor-pointer transition-colors"
                >
                    <span className="material-symbols-outlined text-[14px]">reply</span>
                    <span>Reply {replies.length > 0 ? `(${replies.length})` : ''}</span>
                </button>
            </div>

            {/* Inline Reply Input Box */}
            {isReplying && (
                <div className="ml-8 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <input 
                        type="text"
                        value={replyInputMap[itemId] || ''}
                        onChange={(e) => setReplyInputMap(prev => ({ ...prev, [itemId]: e.target.value }))}
                        onKeyDown={(e) => { 
                            if (e.key === 'Enter') {
                                onAddReply(ep, item, replyInputMap[itemId]);
                            } 
                        }}
                        placeholder={`Reply to @${authorName}...`}
                        autoFocus
                        className="flex-1 bg-slate-50 dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-xs text-slate-900 dark:text-white rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {(() => {
                        const restrictedInReply = checkRestrictedContent(replyInputMap[itemId]);
                        if (restrictedInReply) {
                            return (
                                <span className="text-rose-500 text-xs font-semibold px-2 py-1 bg-rose-50 dark:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-900/50 shrink-0">
                                    ⚠️ Restricted word ("{restrictedInReply}")
                                </span>
                            );
                        }
                        return (
                            <button 
                                onClick={() => onAddReply(ep, item, replyInputMap[itemId])}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                                Send
                            </button>
                        );
                    })()}
                    <button 
                        onClick={() => setActiveReplyId(null)}
                        className="px-2 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Recursive Nested Threaded Replies */}
            {replies.length > 0 && (
                <div className="space-y-2 pt-1">
                    {replies.map((childReply, rIdx) => (
                        <ThreadedCommentItem
                            key={childReply.replyId || childReply.id || rIdx}
                            item={childReply}
                            ep={ep}
                            level={level + 1}
                            onAddReply={onAddReply}
                            activeReplyId={activeReplyId}
                            setActiveReplyId={setActiveReplyId}
                            replyInputMap={replyInputMap}
                            setReplyInputMap={setReplyInputMap}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Podcasts() {
    const location = useLocation();
    const { currentUser } = useUser();
    const { playPodcast, currentPodcast, isPlaying } = useAudio();
    const { addToast } = useToast();
    const confirm = useConfirm();
    
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [savingPodcastModal, setSavingPodcastModal] = useState(null);
    const [sharingPodcast, setSharingPodcast] = useState(null);
    const [activeCommentsPodcastId, setActiveCommentsPodcastId] = useState(null);
    const [commentsMap, setCommentsMap] = useState({});
    const [newCommentInput, setNewCommentInput] = useState({});
    const [loadingComments, setLoadingComments] = useState({});
    const [activeReplyCommentId, setActiveReplyCommentId] = useState(null);
    const [replyInputMap, setReplyInputMap] = useState({});
    const [commentRepliesMap, setCommentRepliesMap] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('knome_podcast_comment_replies') || '{}');
        } catch {
            return {};
        }
    });

    const [activeTab, setActiveTab] = useState('All Episodes');
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [savedMap, setSavedMap] = useState({});

    // Interactive Filter State
    const [showFilterBar, setShowFilterBar] = useState(false);
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterSort, setFilterSort] = useState('Newest First');

    const [seriesData, setSeriesData] = useState([]);
    const [podcastEpisodes, setPodcastEpisodes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchPodcastsData = async () => {
        try {
            setIsLoading(true);
            const [seriesRes, podcastsRes] = await Promise.all([
                podcastsApi.getAllSeries(),
                podcastsApi.getAll()
            ]);

            if (seriesRes) {
                const seriesArray = Array.isArray(seriesRes) ? seriesRes : [];
                const mappedSeries = seriesArray.map(s => ({
                    id: s.seriesId,
                    title: s.title,
                    description: s.description || 'Enterprise Podcast Series',
                    episodes: s.episodeCount || 0,
                    category: 'Series',
                    thumbnail: s.coverImageUrl ? resolveMediaUrl(s.coverImageUrl) : 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=90&w=1600&h=1600'
                }));
                setSeriesData(mappedSeries);
            }

            if (podcastsRes) {
                const podcastsArray = Array.isArray(podcastsRes) ? podcastsRes : [];
                const mappedPodcasts = podcastsArray
                    .filter(p => p.isActive === undefined || p.isActive === null || p.isActive === true || p.isActive === 1 || p.isActive === 'true')
                    .map(p => ({
                    id: p.podcastId,
                    isActive: p.isActive !== false && p.isActive !== 0 && p.isActive !== 'false',
                    title: p.title,
                    description: p.description || '',
                    series: p.seriesTitle || 'Standalone Episode',
                    category: p.categoryName || 'General',
                    durationSeconds: p.durationSeconds || 0,
                    duration: p.durationSeconds ? `${Math.floor(p.durationSeconds / 60)}:${(p.durationSeconds % 60).toString().padStart(2, '0')}` : '00:00',
                    date: new Date(p.uploadedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    author: p.uploaderFullName,
                    authorId: p.uploaderUserId,
                    thumbnail: p.coverImageUrl ? resolveMediaUrl(p.coverImageUrl) : 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=90&w=1600&h=1600',
                    audioUrl: p.audioUrl,
                    likes: p.engagementSummary?.reactionSummary?.totalCount || p.engagementSummary?.reactionCount || p.engagementSummary?.likeCount || 0,
                    isLiked: !!p.engagementSummary?.reactionSummary?.userReaction || !!p.engagementSummary?.userReaction,
                    comments: p.engagementSummary?.commentsCount || p.engagementSummary?.commentCount || 0,
                    shares: p.engagementSummary?.sharesCount || p.engagementSummary?.shareCount || 0,
                    views: p.viewCount || p.engagementSummary?.viewsCount || 0
                }));
                setPodcastEpisodes(mappedPodcasts);
            }
        } catch (error) {
            console.error('Failed to fetch podcasts data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Live update view count when any podcast is played anywhere in the app
    useEffect(() => {
        const handlePodcastViewed = (e) => {
            const { id, viewCount, increment } = e.detail || {};
            if (id) {
                setPodcastEpisodes(prev => prev.map(p => {
                    if (Number(p.id) === Number(id)) {
                        const currentViews = Number(p.views) || 0;
                        const nextViews = (viewCount !== undefined && viewCount !== null)
                            ? Number(viewCount)
                            : currentViews + (increment || 1);
                        return { ...p, views: nextViews };
                    }
                    return p;
                }));
            }
        };
        window.addEventListener('knome_podcast_viewed', handlePodcastViewed);
        return () => window.removeEventListener('knome_podcast_viewed', handlePodcastViewed);
    }, []);

    // Auto-play / highlight podcast from URL query params (e.g. from notifications)
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const targetId = queryParams.get('id');
        if (targetId && podcastEpisodes.length > 0) {
            const found = podcastEpisodes.find(p => String(p.id) === String(targetId));
            if (found) {
                playPodcast(found);
                toggleComments(found);
            }
        }
    }, [location.search, podcastEpisodes]);

    const handleToggleLike = async (ep) => {
        const epId = ep.id;
        const wasLiked = !!ep.isLiked;
        const currentLikes = ep.likes || 0;

        setPodcastEpisodes(prev => prev.map(p => {
            if (p.id === epId) {
                return {
                    ...p,
                    isLiked: !wasLiked,
                    likes: wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1
                };
            }
            return p;
        }));

        try {
            await interactionsApi.toggleReaction('Podcast', epId, 'Like');
        } catch (err) {
            console.error('Failed to toggle reaction:', err);
        }
    };

    const toggleComments = async (ep) => {
        const epId = ep.id;
        if (activeCommentsPodcastId === epId) {
            setActiveCommentsPodcastId(null);
            return;
        }
        setActiveCommentsPodcastId(epId);

        if (!commentsMap[epId]) {
            setLoadingComments(prev => ({ ...prev, [epId]: true }));
            try {
                const savedTree = JSON.parse(localStorage.getItem(`knome_podcast_comments_tree_${epId}`) || 'null');
                if (savedTree && Array.isArray(savedTree) && savedTree.length > 0) {
                    setCommentsMap(prev => ({ ...prev, [epId]: savedTree }));
                } else {
                    const res = await interactionsApi.getComments('Podcast', epId);
                    const list = Array.isArray(res) ? res : (res?.items || res?.data || []);
                    const mappedList = list.map(c => ({ ...c, replies: c.replies || [] }));
                    setCommentsMap(prev => ({ ...prev, [epId]: mappedList }));
                }
            } catch (err) {
                console.error('Failed to fetch comments:', err);
                setCommentsMap(prev => ({ ...prev, [epId]: [] }));
            } finally {
                setLoadingComments(prev => ({ ...prev, [epId]: false }));
            }
        }
    };

    const handleAddComment = async (ep) => {
        const epId = ep.id;
        const text = (newCommentInput[epId] || '').trim();
        if (!text) return;

        const foundKeyword = checkRestrictedContent(text);
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use this restricted or abusive word - "${foundKeyword}". Comment cannot be posted.`, 'warning');
            return;
        }

        try {
            const createdComment = await interactionsApi.addComment('Podcast', epId, text);
            const newCommentObj = {
                commentId: createdComment?.commentId || Date.now(),
                commenterFullName: currentUser?.fullName || currentUser?.name || 'Employee',
                commenterProfilePhotoUrl: currentUser?.profilePhotoUrl || currentUser?.avatar,
                commentText: text,
                createdDate: new Date().toISOString(),
                replies: []
            };

            setCommentsMap(prev => {
                const updated = [...(prev[epId] || []), newCommentObj];
                try {
                    localStorage.setItem(`knome_podcast_comments_tree_${epId}`, JSON.stringify(updated));
                } catch (e) {}
                return { ...prev, [epId]: updated };
            });

            setPodcastEpisodes(prev => prev.map(p => {
                if (p.id === epId) {
                    return { ...p, comments: (p.comments || 0) + 1 };
                }
                return p;
            }));

            setNewCommentInput(prev => ({ ...prev, [epId]: '' }));
        } catch (err) {
            console.error('Failed to add comment:', err);
        }
    };

    const handleAddReply = async (ep, targetItem, textInput) => {
        const text = (textInput || '').trim();
        if (!text) return;

        const foundKeyword = checkRestrictedContent(text);
        if (foundKeyword) {
            addToast(`Security Alert: Please don't use this restricted or abusive word - "${foundKeyword}". Reply cannot be posted.`, 'warning');
            return;
        }

        const targetId = targetItem.commentId || targetItem.replyId || targetItem.id;
        const authorName = targetItem.commenterFullName || targetItem.replierFullName || targetItem.author || 'Employee';

        const newReplyObj = {
            replyId: `reply_${Date.now()}_${Math.random()}`,
            parentCommentId: targetId,
            replierFullName: currentUser?.fullName || currentUser?.name || 'Employee',
            replierProfilePhotoUrl: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
            replyText: text,
            createdDate: new Date().toISOString(),
            replies: []
        };

        setCommentsMap(prev => {
            const currentList = prev[ep.id] || [];
            const updatedList = addReplyToTree(currentList, targetId, newReplyObj);
            try {
                localStorage.setItem(`knome_podcast_comments_tree_${ep.id}`, JSON.stringify(updatedList));
            } catch (e) {}
            return { ...prev, [ep.id]: updatedList };
        });

        try {
            await interactionsApi.addComment('Podcast', ep.id, `@${authorName}: ${text}`);
        } catch (_) {}

        setReplyInputMap(prev => ({ ...prev, [targetId]: '' }));
        setActiveReplyCommentId(null);
    };

    useEffect(() => {
        fetchPodcastsData();
        
        const handleRefresh = (e) => {
            if (e?.detail?.newPodcast) {
                const p = e.detail.newPodcast;
                const newEpisode = {
                    id: p.podcastId || Date.now(),
                    title: p.title,
                    description: p.description || '',
                    series: p.seriesTitle || 'Standalone Episode',
                    category: p.categoryName || 'General',
                    durationSeconds: p.durationSeconds || 0,
                    duration: p.durationSeconds ? `${Math.floor(p.durationSeconds / 60)}:${(p.durationSeconds % 60).toString().padStart(2, '0')}` : '00:00',
                    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    author: p.uploaderFullName || currentUser?.fullName || currentUser?.name || 'Employee',
                    authorId: p.uploaderUserId || currentUser?.id,
                    thumbnail: p.coverImageUrl ? resolveMediaUrl(p.coverImageUrl) : 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=90&w=1600&h=1600',
                    audioUrl: p.audioUrl,
                    likes: 0,
                    isLiked: false,
                    comments: 0,
                    shares: 0,
                    views: 0
                };
                setPodcastEpisodes(prev => [newEpisode, ...prev.filter(x => x.id !== newEpisode.id)]);
            }
            fetchPodcastsData();
        };
        window.addEventListener('podcast-published', handleRefresh);
        return () => window.removeEventListener('podcast-published', handleRefresh);
    }, [currentUser]);

    const isAdmin = currentUser?.role === 'SYSADM' || currentUser?.role === 'CADM' || currentUser?.role === 'HRADM';

    const handleDeletePodcast = async (podcastId) => {
        const ok = await confirm({
            title: 'Delete Podcast',
            message: 'Are you sure you want to delete this podcast episode? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;
        try {
            await podcastsApi.delete(podcastId);
            addToast('Podcast deleted successfully.', 'success');
            setPodcastEpisodes(prev => prev.filter(ep => ep.id !== podcastId));
            fetchPodcastsData();
        } catch (error) {
            console.error('Failed to delete podcast:', error);
            addToast('Failed to delete podcast. ' + (error.message || ''), 'error');
        }
    };

    // Filter & Sort Logic
    const rawEpisodes = podcastEpisodes
        .filter(ep => {
            // Active filter: hide soft-deleted / inactive podcasts
            if (ep.isActive === false || ep.isActive === 0 || ep.isActive === 'false') {
                return false;
            }
            // Tab filter
            if (activeTab === 'My Podcasts') {
                if (currentUser?.name && !ep.author?.toLowerCase().includes(currentUser.name.toLowerCase())) {
                    return false;
                }
            } else if (activeTab === 'General' || activeTab === 'Tech' || activeTab === 'Leadership' || activeTab === 'Engineering') {
                if (ep.category.toLowerCase() !== activeTab.toLowerCase()) {
                    return false;
                }
            }
            // Series Card filter
            if (selectedSeries && ep.series !== selectedSeries.title) {
                return false;
            }
            // Keyword filter
            if (filterKeyword.trim()) {
                const kw = filterKeyword.toLowerCase().trim();
                const matchTitle = ep.title.toLowerCase().includes(kw);
                const matchAuthor = ep.author?.toLowerCase().includes(kw);
                const matchSeries = ep.series?.toLowerCase().includes(kw);
                if (!matchTitle && !matchAuthor && !matchSeries) return false;
            }
            // Category filter
            if (filterCategory !== 'All' && ep.category.toLowerCase() !== filterCategory.toLowerCase()) {
                return false;
            }
            return true;
        });

    const displayedEpisodes = rawEpisodes.sort((a, b) => {
        if (filterSort === 'Oldest First') return a.id - b.id;
        if (filterSort === 'Duration (Longest)') return b.durationSeconds - a.durationSeconds;
        return b.id - a.id; // Newest First
    });

    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(displayedEpisodes.length, 6, 6);

    useEffect(() => {
        resetScrollLoading();
    }, [activeTab, filterKeyword, filterCategory, filterSort, selectedSeries, resetScrollLoading]);

    const resetFilters = () => {
        setFilterKeyword('');
        setFilterCategory('All');
        setFilterSort('Newest First');
        setSelectedSeries(null);
    };

    return (
        <>
            <main className="flex-1 flex flex-col gap-8 pb-6">
                
                {/* Hero Header */}
                <div className="relative rounded-2xl overflow-hidden mb-8 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                    {/* Background effects */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-fuchsia-100/50 dark:from-fuchsia-900/20 via-transparent to-transparent pointer-events-none"></div>
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-pink-400/10 dark:bg-pink-500/10 blur-[80px] pointer-events-none"></div>
                    
                    {/* Light Streaks behind text */}
                    <div className="absolute top-[35%] left-0 w-[60%] h-[1px] bg-gradient-to-r from-fuchsia-300/40 dark:from-fuchsia-400/20 to-transparent"></div>
                    <div className="absolute top-[50%] left-0 w-[40%] h-[2px] bg-gradient-to-r from-pink-300/40 dark:from-pink-400/20 to-transparent blur-[1px]"></div>
                    <div className="absolute top-[65%] left-0 w-[50%] h-[1px] bg-gradient-to-r from-rose-300/40 dark:from-rose-400/20 to-transparent"></div>

                    {/* Content Left */}
                    <div className="relative z-10 flex flex-col items-start max-w-3xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                            ✨ Tuning into MPOnline
                        </div>
                        
                        <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 dark:from-fuchsia-400 dark:via-pink-400 dark:to-rose-400">
                                Tune Into Enterprise Insights
                            </span>
                        </h1>

                        <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                            Discover podcasts, tech talks, and leadership updates built for the next generation — anytime, anywhere.
                        </p>
                    </div>

                    {/* Action Right */}
                    <div className="relative z-10 shrink-0 flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                        {currentUser?.role !== 'SYSADM' && (
                            <button 
                                onClick={() => setIsUploadOpen(true)}
                                className="w-full sm:w-auto px-6 py-3 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-600 transition-colors shadow-lg shadow-pink-500/30 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">podcasts</span>
                                Create Podcast
                            </button>
                        )}
                    </div>
                </div>

                {/* Search & Sort Bar */}
                <div className="p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm mb-6 flex flex-col md:flex-row items-center gap-3">
                    {/* Keyword Search */}
                    <div className="relative flex-1 w-full">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
                        <input 
                            type="text"
                            value={filterKeyword}
                            onChange={(e) => setFilterKeyword(e.target.value)}
                            placeholder="Search by title, author, series..."
                            className="w-full pl-10 pr-8 py-2.5 text-xs font-bold rounded-xl outline-none border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500/30 transition-all"
                        />
                        {filterKeyword && (
                            <button onClick={() => setFilterKeyword('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        )}
                    </div>

                    {/* Sort Dropdown & Reset */}
                    <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 justify-between md:justify-end">
                        <div className="relative flex-1 md:flex-initial flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 shrink-0">Sort:</span>
                            <div className="relative">
                                <select
                                    value={filterSort}
                                    onChange={(e) => setFilterSort(e.target.value)}
                                    className="appearance-none pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-bold rounded-xl outline-none cursor-pointer focus:ring-2 focus:ring-pink-500/30 transition-all hover:bg-slate-100 dark:hover:bg-slate-700/60"
                                >
                                    <option value="Newest First">Newest First</option>
                                    <option value="Oldest First">Oldest First</option>
                                    <option value="Duration (Longest)">Duration (Longest)</option>
                                </select>
                                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">expand_more</span>
                            </div>
                        </div>

                        {/* Reset Button */}
                        {(filterKeyword || filterSort !== 'Newest First' || selectedSeries) && (
                            <button
                                onClick={resetFilters}
                                className="px-3 py-1.5 text-xs font-bold text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-xl transition-colors shrink-0 cursor-pointer"
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 w-full mb-6 overflow-x-auto no-scrollbar">
                    {['All Episodes', 'General', 'Tech', 'Leadership', 'Engineering', 'My Podcasts'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                setSelectedSeries(null);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold transition-all border shrink-0 cursor-pointer whitespace-nowrap ${
                                activeTab === tab
                                    ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-400 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <div className="animate-spin w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
                    </div>
                ) : (
                    <>
                        {/* Episodes List */}
                        <section>
                            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-6">
                                All Episodes
                            </h2>
                            
                            <div className="flex flex-col gap-3">
                                 {displayedEpisodes.slice(0, visibleCount).map(ep => {
                                    const isThisPlaying = currentPodcast?.id === ep.id && isPlaying;
                                    const isCommentsOpen = activeCommentsPodcastId === ep.id;
                                    const episodeComments = commentsMap[ep.id] || [];

                                    return (
                                        <div key={ep.id} className="group glass card-lift bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 transition-all hover:shadow-md">
                                            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                                                <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden shadow-sm bg-slate-100 dark:bg-slate-800">
                                                    <img src={ep.thumbnail} className="w-full h-full object-cover" alt="Cover" />
                                                    <button 
                                                        onClick={() => playPodcast(ep)}
                                                        className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-900/70"
                                                    >
                                                        <span className="material-symbols-outlined text-[32px] text-white">
                                                            {isThisPlaying ? 'pause_circle' : 'play_circle'}
                                                        </span>
                                                    </button>
                                                    {isThisPlaying && (
                                                        <div className="absolute bottom-1 right-1 flex items-end gap-0.5 h-3">
                                                            <div className="w-1 bg-pink-500 animate-pulse h-full"></div>
                                                            <div className="w-1 bg-pink-500 animate-pulse h-2/3 delay-75"></div>
                                                            <div className="w-1 bg-pink-500 animate-pulse h-4/5 delay-150"></div>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black text-pink-500 bg-pink-50 dark:bg-pink-900/20 px-2 py-0.5 rounded uppercase tracking-wider">
                                                            <HighlightText text={ep.series} query={filterKeyword} />
                                                        </span>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${
                                                            ep.category === 'Tech' ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-800' :
                                                            ep.category === 'Leadership' ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800' :
                                                            ep.category === 'Engineering' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' :
                                                            'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                                        }`}>
                                                            {ep.category}
                                                        </span>
                                                        <span className="text-[12px] font-bold text-slate-400">{ep.date}</span>
                                                    </div>
                                                    <h3 className="font-bold text-[15px] text-slate-900 dark:text-white truncate mb-1">
                                                        <HighlightText text={ep.title} query={filterKeyword} />
                                                    </h3>
                                                    <div className="flex flex-wrap items-center gap-3 text-[12px] font-bold text-slate-500">
                                                        <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">schedule</span> {ep.duration}</span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[14px]">person</span>
                                                            <HighlightText text={ep.author} query={filterKeyword} />
                                                        </span>
                                                        <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-bold" title="Views / Listens"><span className="material-symbols-outlined text-[14px]">visibility</span> {ep.views || 0}</span>
                                                        <span className="flex items-center gap-1 text-rose-500/90 dark:text-rose-400"><span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: ep.isLiked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span> {ep.likes || 0}</span>
                                                        <span className="flex items-center gap-1 text-indigo-500/90 dark:text-indigo-400"><span className="material-symbols-outlined text-[14px]">chat_bubble</span> {ep.comments || 0}</span>
                                                        <span className="flex items-center gap-1 text-emerald-500/90 dark:text-emerald-400"><span className="material-symbols-outlined text-[14px]">share</span> {ep.shares || 0}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 mt-4 md:mt-0">
                                                    {isAdmin && (
                                                        <button 
                                                            onClick={() => handleDeletePodcast(ep.id)}
                                                            title="Delete Episode"
                                                            className="w-10 h-10 rounded-full border border-red-500/20 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => {
                                                            setSavingPodcastModal({
                                                                ...ep,
                                                                contentType: 'Podcast',
                                                                text: ep.description || ep.title,
                                                                title: ep.title,
                                                                image: ep.thumbnail
                                                            });
                                                        }}
                                                        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                                            savedMap[ep.id]
                                                                ? 'border-amber-500 bg-amber-500 text-slate-950 font-bold shadow-md'
                                                                : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                        }`}
                                                        title={savedMap[ep.id] ? "Saved in Personal Library" : "Save Podcast to Category"}
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: savedMap[ep.id] ? "'FILL' 1" : "'FILL' 0" }}>
                                                            bookmark
                                                        </span>
                                                    </button>
                                                    <button 
                                                        onClick={() => playPodcast(ep)}
                                                        className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-[13px] rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">{isThisPlaying ? 'pause' : 'play_arrow'}</span>
                                                        {isThisPlaying ? 'Pause' : 'Play Now'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Interaction Bar (Like, Comment, Share, Views) */}
                                            <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs font-bold">
                                                <button
                                                    onClick={() => handleToggleLike(ep)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                                        ep.isLiked
                                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:text-rose-500'
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: ep.isLiked ? "'FILL' 1" : "'FILL' 0" }}>
                                                        favorite
                                                    </span>
                                                    <span>{ep.likes || 0} Likes</span>
                                                </button>

                                                <button
                                                    onClick={() => toggleComments(ep)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                                        isCommentsOpen
                                                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:text-indigo-500'
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                                                    <span>{ep.comments || 0} Comments</span>
                                                </button>

                                                <button
                                                    onClick={() => setSharingPodcast({ ...ep, contentType: 'Podcast' })}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:text-emerald-500 transition-all cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">share</span>
                                                    <span>{ep.shares || 0} Shares</span>
                                                </button>

                                                <div
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-800/50 text-cyan-700 dark:text-cyan-400 border-slate-200 dark:border-slate-700/60 font-bold select-none ml-auto"
                                                    title="Total Views & Plays"
                                                >
                                                    <span className="material-symbols-outlined text-[16px] text-cyan-600 dark:text-cyan-400">visibility</span>
                                                    <span>{ep.views || 0} Views</span>
                                                </div>
                                            </div>

                                            {/* Expandable Comments Drawer */}
                                            {isCommentsOpen && (
                                                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col gap-3 animate-fadeIn">
                                                    <div className="flex items-center justify-between font-bold text-xs text-slate-700 dark:text-slate-300">
                                                        <span>Comments ({episodeComments.length})</span>
                                                        <button onClick={() => setActiveCommentsPodcastId(null)} className="text-slate-400 hover:text-slate-600">Close</button>
                                                    </div>

                                                    {loadingComments[ep.id] ? (
                                                        <div className="py-4 text-center text-xs text-slate-400">Loading comments...</div>
                                                    ) : episodeComments.length === 0 ? (
                                                        <div className="py-3 text-center text-xs text-slate-400">No comments yet. Be the first to comment!</div>
                                                    ) : (
                                                        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                                                            {episodeComments.map((c, i) => (
                                                                <ThreadedCommentItem
                                                                    key={c.commentId || c.id || `c_${i}`}
                                                                    item={c}
                                                                    ep={ep}
                                                                    level={0}
                                                                    onAddReply={handleAddReply}
                                                                    activeReplyId={activeReplyCommentId}
                                                                    setActiveReplyId={setActiveReplyCommentId}
                                                                    replyInputMap={replyInputMap}
                                                                    setReplyInputMap={setReplyInputMap}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Add Comment Input */}
                                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                                                        <input 
                                                            type="text"
                                                            value={newCommentInput[ep.id] || ''}
                                                            onChange={(e) => setNewCommentInput(prev => ({ ...prev, [ep.id]: e.target.value }))}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment(ep); }}
                                                            placeholder="Write a comment..."
                                                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                                                        />
                                                        {(() => {
                                                            const restrictedInComment = checkRestrictedContent(newCommentInput[ep.id]);
                                                            if (restrictedInComment) {
                                                                return (
                                                                    <span className="text-rose-500 text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-900/50 shrink-0">
                                                                        ⚠️ Restricted word ("{restrictedInComment}")
                                                                    </span>
                                                                );
                                                            }
                                                            return (
                                                                <button 
                                                                    onClick={() => handleAddComment(ep)}
                                                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shrink-0"
                                                                >
                                                                    Post
                                                                </button>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <ScrollLoadingIndicator isVisible={visibleCount < displayedEpisodes.length} text="Loading more episodes on scroll..." />
                                {displayedEpisodes.length === 0 && (
                                    <div className="text-center py-8 text-slate-500">No episodes found.</div>
                                )}
                            </div>
                        </section>
                    </>
                )}

            </main>

            <UploadPodcastModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
            <SaveToCategoryModal 
                isOpen={!!savingPodcastModal} 
                onClose={() => setSavingPodcastModal(null)} 
                item={savingPodcastModal}
                onSaved={(savedItem) => {
                    if (savingPodcastModal) {
                        setSavedMap(prev => ({ ...prev, [savingPodcastModal.id]: true }));
                    }
                    setSavingPodcastModal(null);
                }}
            />
            <ArticleShareModal 
                isOpen={!!sharingPodcast}
                onClose={() => setSharingPodcast(null)}
                article={sharingPodcast}
                onShared={() => {
                    if (sharingPodcast) {
                        setPodcastEpisodes(prev => prev.map(p => p.id === sharingPodcast.id ? { ...p, shares: (p.shares || 0) + 1 } : p));
                    }
                    setSharingPodcast(null);
                }}
            />
        </>
    );
}
