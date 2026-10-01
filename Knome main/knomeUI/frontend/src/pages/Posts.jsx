import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import PostCard from '../components/widgets/PostCard';
import DraftCard from '../components/widgets/DraftCard';
import CreatePostModal from '../components/modals/CreatePostModal';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import { useScrollLoading } from '../hooks/useScrollLoading';
import HotPostsWidget from '../components/widgets/HotPostsWidget';
import TrendingTagsWidget from '../components/widgets/TrendingTagsWidget';
import { postsApi, mapPost, getPersonalizedRecommendations } from '../utils/apiService';
import { deleteDraft, clearUserDraft, getUserDraft, removeDraftFromLocalPosts } from '../utils/draftManager';
import { useToast } from '../components/contexts/ToastContext';

export default function Posts() {
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const targetPostId = queryParams.get('id') || queryParams.get('postId') || queryParams.get('highlight');
    const initialTag = queryParams.get('tag') || queryParams.get('hashtag') || null;
    const initialSearch = queryParams.get('q') || '';
    
    // Core state
    const [posts, setPosts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [selectedTag, setSelectedTag] = useState(initialTag ? initialTag.replace('#', '') : 'All');
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [draftToEdit, setDraftToEdit] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tag = params.get('tag') || params.get('hashtag');
        if (tag) {
            setSelectedTag(tag.replace('#', ''));
        }
        const q = params.get('q');
        if (q !== null && q !== undefined) {
            setSearchQuery(q);
        }
    }, [location.search]);

    const loadPosts = async () => {
        setIsLoading(true);
        try {
            const data = await postsApi.getPosts(null, null, 1, 100);
            let mapped = data ? data.map(mapPost) : [];

            // Merge local fallback posts if any (only include explicit drafts saved via 'Save as Draft')
            try {
                const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]').map(String);
                const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                const cleanedLocalPosts = localPosts.filter(lp => lp.status !== 'Draft' || lp.savedAsDraft === true);
                if (cleanedLocalPosts.length !== localPosts.length) {
                    localStorage.setItem('knome_local_posts', JSON.stringify(cleanedLocalPosts));
                }
                cleanedLocalPosts.forEach(lp => {
                    const lpIdStr = String(lp.id || lp.postId || '');
                    if (!deletedIds.includes(lpIdStr) && !mapped.some(m => String(m.id || m.postId) === lpIdStr)) {
                        mapped.unshift(mapPost(lp));
                    }
                });
            } catch (e) {}

            // Ensure current active user draft is fresh and synced in mapped posts ONLY if explicitly saved as draft
            try {
                const currentUid = currentUser?.userId || currentUser?.id;
                const activeDraft = getUserDraft(currentUid);
                if (activeDraft && activeDraft.savedAsDraft) {
                    const draftIdStr = String(activeDraft.id || activeDraft.postId || '');
                    const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]').map(String);
                    if (!deletedIds.includes(draftIdStr)) {
                        const mappedDraft = mapPost({
                            ...activeDraft,
                            authorId: currentUid,
                            authorName: currentUser?.fullName || currentUser?.name || 'You',
                            authorAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar,
                            authorRole: currentUser?.designation || currentUser?.roleName || 'Employee',
                            status: 'Draft'
                        });
                        const existingIdx = mapped.findIndex(m => String(m.id || m.postId) === draftIdStr);
                        if (existingIdx >= 0) {
                            mapped[existingIdx] = mappedDraft;
                        } else {
                            mapped.unshift(mappedDraft);
                        }
                    }
                }
            } catch (e) {}

            // Filter out any posts present in deleted IDs blacklist
            try {
                const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]').map(String);
                if (deletedIds.length > 0) {
                    mapped = mapped.filter(p => !deletedIds.includes(String(p.id)) && !deletedIds.includes(String(p.postId)));
                }
            } catch (e) {}
            
            // If target post ID is specified via notification link, ensure it is fetched and prioritized
            if (targetPostId) {
                const targetIdNum = parseInt(targetPostId, 10);
                const exists = mapped.some(p => p.id === targetIdNum);
                if (!exists) {
                    try {
                        const targetData = await postsApi.getById(targetIdNum);
                        if (targetData) {
                            const mappedTarget = mapPost(targetData);
                            mappedTarget.isHighlighted = true;
                            mapped = [mappedTarget, ...mapped];
                        }
                    } catch (e) {
                        console.warn("Could not fetch target post:", e);
                    }
                } else {
                    mapped = mapped.map(p => p.id === targetIdNum ? { ...p, isHighlighted: true } : p);
                }
            }

            // Filter posts based on publication schedule and draft privacy
            const currentUserIdStr = String(currentUser?.userId || currentUser?.id || '');
            const accessiblePosts = mapped.filter(p => {
                if (p.status === 'Draft') {
                    // Draft: author only
                    const authorIdStr = String(p.author?.id || p.authorId || p.userId || '');
                    return authorIdStr === currentUserIdStr;
                }
                if (p.status === 'Scheduled' && p.scheduledDate) {
                    const schedTime = new Date(p.scheduledDate).getTime();
                    const now = Date.now();
                    if (schedTime > now) {
                        // Future: author only
                        const authorIdStr = String(p.author?.id || p.authorId || p.userId || '');
                        return authorIdStr === currentUserIdStr;
                    }
                }
                return true;
            });

            setPosts(accessiblePosts);
        } catch (error) {
            console.error('Failed to load posts', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadPosts();
        const handlePostDeleted = (e) => {
            const deletedId = e?.detail?.id || e;
            if (deletedId) {
                const delStr = String(deletedId);
                setPosts(prev => prev.filter(p => String(p.id) !== delStr && String(p.postId) !== delStr));
            }
        };
        const handlePostCreated = () => {
            loadPosts();
        };

        // Check every 15s to transition scheduled posts live according to scheduled publication time
        const interval = setInterval(() => {
            loadPosts();
        }, 15000);

        window.addEventListener('post-deleted', handlePostDeleted);
        window.addEventListener('post-created', handlePostCreated);
        window.addEventListener('knome_drafts_updated', handlePostCreated);
        return () => {
            clearInterval(interval);
            window.removeEventListener('post-deleted', handlePostDeleted);
            window.removeEventListener('post-created', handlePostCreated);
            window.removeEventListener('knome_drafts_updated', handlePostCreated);
        };
    }, [targetPostId, currentUser?.id]);



    // Count author's upcoming scheduled posts and private drafts
    const authorScheduledCount = posts.filter(p => (p.status === 'Scheduled' || p.isScheduledFuture)).length;
    const authorDraftCount = posts.filter(p => p.status === 'Draft').length;

    // Filter and sort logic — highlighted target post always at top
    const rawPosts = posts.filter(post => {
        const matchesSearch = !searchQuery || (post.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (post.author?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = selectedTag === 'All' ? post.status !== 'Draft' : 
                           selectedTag === '🔥 Hot Posts' ? post.status !== 'Draft' :
                           selectedTag === '⏰ Scheduled' ? (post.status === 'Scheduled' || post.isScheduledFuture) : 
                           selectedTag === '📝 Drafts' ? post.status === 'Draft' :
                           (
                               post.status !== 'Draft' && (
                                   (post.tags && post.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())) ||
                                   ((post.content || '').toLowerCase().includes('#' + selectedTag.toLowerCase()))
                               )
                           );
        return matchesSearch && matchesTag;
    });

    const filteredPosts = (selectedTag === '🔥 Hot Posts'
        ? [...rawPosts].sort((a, b) => {
            const scoreA = Number(a.likesCount || a.likes || 0) * 2 + Number(a.commentsCount || a.comments || 0) * 3 + Number(a.sharesCount || a.shares || 0) * 4;
            const scoreB = Number(b.likesCount || b.likes || 0) * 2 + Number(b.commentsCount || b.comments || 0) * 3 + Number(b.sharesCount || b.shares || 0) * 4;
            return scoreB - scoreA;
        })
        : rawPosts
    ).sort((a, b) => {
        if (a.isHighlighted) return -1;
        if (b.isHighlighted) return 1;
        return 0;
    });

    // Infinite Scroll Hook
    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(filteredPosts.length, 6, 6);

    useEffect(() => {
        resetScrollLoading();
    }, [searchQuery, selectedTag, resetScrollLoading]);

    const handlePostCreated = () => {
        setSelectedTag('All');
        // Small delay so backend processes the new post before refetch
        setTimeout(() => loadPosts(), 300);
    };

    return (
        <div className="flex-1 min-w-0 flex flex-col gap-6 pb-6">
            
            {/* Hero Header */}
            <div className="relative rounded-2xl overflow-hidden mb-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                {/* Background effects */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-blue-100/60 dark:from-blue-950/30 via-transparent to-transparent pointer-events-none"></div>
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-blue-400/10 dark:bg-blue-500/10 blur-[80px] pointer-events-none"></div>
                
                {/* Light Streaks behind text */}
                <div className="absolute top-[35%] left-0 w-[60%] h-[1px] bg-gradient-to-r from-blue-300/40 dark:from-blue-400/20 to-transparent"></div>
                <div className="absolute top-[50%] left-0 w-[40%] h-[2px] bg-gradient-to-r from-indigo-300/40 dark:from-indigo-400/20 to-transparent blur-[1px]"></div>
                <div className="absolute top-[65%] left-0 w-[50%] h-[1px] bg-gradient-to-r from-cyan-300/40 dark:from-cyan-400/20 to-transparent"></div>

                {/* Content Left */}
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                        💬 Live Workplace Feed
                    </div>
                    
                    <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 dark:from-blue-400 dark:via-indigo-400 dark:to-cyan-400">
                            Connect With Workplace Pulse
                        </span>
                    </h1>

                    <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                        Share instant thoughts, project breakthroughs, team questions, and celebrate milestones across the network.
                    </p>
                </div>

                {/* Action Right */}
                <div className="relative z-10 shrink-0 flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                    {currentUser?.role !== 'SYSADM' && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedTag(selectedTag === '📝 Drafts' ? 'All' : '📝 Drafts');
                                    setTimeout(() => {
                                        document.getElementById('posts-feed-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 50);
                                }}
                                className={`w-full sm:w-auto px-5 py-3 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border active:scale-95 shadow-sm ${
                                    selectedTag === '📝 Drafts'
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md dark:bg-slate-700 dark:border-slate-600'
                                        : 'bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300 backdrop-blur-xs'
                                }`}
                                title="View all saved drafts"
                            >
                                <span className={`material-symbols-outlined text-[20px] ${selectedTag === '📝 Drafts' ? 'text-amber-400' : 'text-amber-500'}`}>
                                    draft
                                </span>
                                <span>Drafts</span>
                                {authorDraftCount > 0 && (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-black transition-colors ${
                                        selectedTag === '📝 Drafts'
                                            ? 'bg-amber-400 text-slate-950'
                                            : 'bg-amber-500 text-white'
                                    }`}>
                                        {authorDraftCount}
                                    </span>
                                )}
                            </button>

                            <button 
                                type="button"
                                onClick={() => {
                                    setDraftToEdit(null);
                                    setIsCreatePostOpen(true);
                                }}
                                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[20px]">edit_square</span>
                                Write Post
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Primary Quick Filter Pills & Active Tag Indicator */}
            <div id="posts-feed-section" className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                    <button
                        onClick={() => setSelectedTag('All')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            selectedTag === 'All'
                                ? 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400 shadow-xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        All Posts
                    </button>
                    <button
                        onClick={() => setSelectedTag('🔥 Hot Posts')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                            selectedTag === '🔥 Hot Posts'
                                ? 'bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-400 shadow-xs font-black'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        <span>🔥</span>
                        <span>Hot Posts</span>
                    </button>
                    {authorScheduledCount > 0 && (
                        <button
                            onClick={() => setSelectedTag('⏰ Scheduled')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                                selectedTag === '⏰ Scheduled'
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            <span>Scheduled</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                                selectedTag === '⏰ Scheduled' ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
                            }`}>
                                {authorScheduledCount}
                            </span>
                        </button>
                    )}
                    {authorDraftCount > 0 && (
                        <button
                            onClick={() => setSelectedTag('📝 Drafts')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                                selectedTag === '📝 Drafts'
                                    ? 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300 shadow-xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[14px]">draft</span>
                            <span>Drafts</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                                selectedTag === '📝 Drafts' ? 'bg-slate-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                            }`}>
                                {authorDraftCount}
                            </span>
                        </button>
                    )}
                </div>

                {/* Active Selected Filter Badge */}
                {selectedTag !== 'All' && selectedTag !== '⏰ Scheduled' && selectedTag !== '📝 Drafts' && selectedTag !== '🔥 Hot Posts' && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-xl animate-in fade-in duration-150">
                        <span>Topic: #{selectedTag}</span>
                        <button 
                            onClick={() => setSelectedTag('All')}
                            className="hover:text-blue-800 dark:hover:text-blue-200 ml-1 cursor-pointer"
                            title="Clear topic filter"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Layout with Feed and Right Sidebar Widgets */}
            <div className="flex flex-col xl:flex-row gap-8 items-start w-full min-w-0">
                {/* Feed display */}
                <main className="flex-1 min-w-0 flex flex-col gap-6 w-full">
                    {isLoading ? (
                        <div className="glass bg-white dark:bg-slate-950 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-3">
                            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700 animate-spin">progress_activity</span>
                            <h3 className="font-bold text-slate-700 dark:text-slate-350 text-sm">Loading posts...</h3>
                        </div>
                    ) : filteredPosts.length > 0 ? (
                        <>
                            {selectedTag === '📝 Drafts' ? (
                                filteredPosts.slice(0, visibleCount).map(draft => (
                                    <DraftCard
                                        key={draft.id || draft.postId}
                                        draft={draft}
                                        onEditDraft={(d) => {
                                            setDraftToEdit(d);
                                            setIsCreatePostOpen(true);
                                        }}
                                        onDeleteDraft={async (dId) => {
                                            try {
                                                await deleteDraft(currentUser?.userId || currentUser?.id, dId, postsApi);
                                                addToast("Draft deleted successfully", "success");
                                                loadPosts();
                                            } catch (e) {
                                                console.error("Failed to delete draft:", e);
                                                addToast("Failed to delete draft", "error");
                                            }
                                        }}
                                        onPublishDraft={async (d) => {
                                            const targetPostId = d.id || d.postId;
                                            const isNumeric = /^\d+$/.test(String(targetPostId));
                                            try {
                                                let publishedSuccess = false;
                                                const payload = {
                                                    contentText: d.text || d.content,
                                                    audienceType: d.audience || d.audienceType || 'Everyone',
                                                    status: 'Published',
                                                    scheduledDate: null,
                                                    attachmentUrls: (d.attachments || []).map(a => a.backendUrl || a.url),
                                                    attachmentTypes: (d.attachments || []).map(a => a.type === 'doc' ? 'Document' : a.type === 'image' ? 'Image' : a.type === 'video' ? 'Video' : 'Audio'),
                                                    mentionedUserIds: []
                                                };

                                                if (isNumeric) {
                                                    try {
                                                        await postsApi.update(targetPostId, payload);
                                                        publishedSuccess = true;
                                                    } catch (updateErr) {
                                                        console.warn('Draft update on publish notice, falling back to create:', updateErr);
                                                    }
                                                }
                                                
                                                if (!publishedSuccess) {
                                                    await postsApi.create(payload);
                                                }

                                                clearUserDraft(currentUser?.userId || currentUser?.id);
                                                removeDraftFromLocalPosts(targetPostId);
                                                try {
                                                    const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]');
                                                    const filteredDeleted = deletedIds.filter(id => String(id) !== String(targetPostId));
                                                    localStorage.setItem('knome_deleted_post_ids', JSON.stringify(filteredDeleted));
                                                } catch (e) {}
                                                setSelectedTag('All');
                                                addToast("Draft published successfully! 🚀", "success");
                                                loadPosts();
                                                window.dispatchEvent(new CustomEvent('post-created'));
                                            } catch (e) {
                                                console.error("Failed to publish draft:", e);
                                                addToast(e?.message || "Failed to publish draft", "error");
                                            }
                                        }}
                                    />
                                ))
                            ) : (
                                filteredPosts.slice(0, visibleCount).map(post => (
                                    <PostCard key={post.id} post={post} searchQuery={searchQuery} onPostDeleted={(deletedId) => {
                                        if (deletedId) setPosts(prev => prev.filter(p => p.id !== deletedId && p.postId !== deletedId));
                                        loadPosts();
                                    }} />
                                ))
                            )}

                            {/* Infinite Scroll Progress Indicator */}
                            <ScrollLoadingIndicator isVisible={visibleCount < filteredPosts.length} text="Loading more posts on scroll..." />
                        </>
                    ) : (
                        <div className="glass bg-white dark:bg-slate-950 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-3">
                            <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-700 animate-bounce">
                                {selectedTag === '📝 Drafts' ? 'draft' : (selectedTag === '⏰ Scheduled' ? 'schedule' : 'feed')}
                            </span>
                            <h3 className="font-bold text-slate-700 dark:text-slate-350 text-sm">
                                {selectedTag === '📝 Drafts' ? 'No Draft Posts' : (selectedTag === '⏰ Scheduled' ? 'No Scheduled Posts' : 'No Posts Found')}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {selectedTag === '📝 Drafts'
                                    ? 'You do not have any saved draft posts.'
                                    : (selectedTag === '⏰ Scheduled' 
                                        ? 'You do not have any posts waiting to be published.'
                                        : 'Try adjusting your search criteria or tags filter.')}
                            </p>
                            {currentUser?.role !== 'SYSADM' && (
                                <button
                                    onClick={() => {
                                        setDraftToEdit(null);
                                        setIsCreatePostOpen(true);
                                    }}
                                    className="mt-2 px-5 py-2 font-bold text-xs rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    {selectedTag === '⏰ Scheduled' ? 'Schedule a Post' : 'Create First Post'}
                                </button>
                            )}
                        </div>
                    )}
                </main>

                {/* Right Sidebar Widgets: Hot Posts & Trending Tags */}
                <aside className="w-full xl:w-[340px] shrink-0 flex flex-col gap-5">
                    <HotPostsWidget />
                    <TrendingTagsWidget onTagClick={(tag) => setSelectedTag(tag)} />
                </aside>
            </div>

            {/* Create Post Modal — supports image, video, audio, document upload */}
            <CreatePostModal
                isOpen={isCreatePostOpen}
                onClose={() => {
                    setIsCreatePostOpen(false);
                    setDraftToEdit(null);
                }}
                onPostCreated={() => {
                    setDraftToEdit(null);
                    handlePostCreated();
                }}
                draftToEdit={draftToEdit}
            />
        </div>
    );
}
