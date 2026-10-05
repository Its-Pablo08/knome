import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import CreatePostModal from '../components/modals/CreatePostModal';
import CreateArticleModal from '../components/modals/CreateArticleModal';
import UploadVideoModal from '../components/modals/UploadVideoModal';
import PostCard from '../components/widgets/PostCard';
import HotPostsWidget from '../components/widgets/HotPostsWidget';
import MyCommunitiesWidget from '../components/widgets/MyCommunitiesWidget';
import TrendingTagsWidget from '../components/widgets/TrendingTagsWidget';
import PeopleYouMayKnowWidget from '../components/widgets/PeopleYouMayKnowWidget';
import TextScramble from '../components/ui/TextScramble';
import ScrollExpandMedia from '../components/ui/scroll-expansion-hero';
import { BackgroundPaths } from '../components/ui/background-paths';
import { dashboardApi, profileApi, karmaApi, mapFeedItem, resolveMediaUrl, notificationsApi } from '../utils/apiService';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import BroadcastModal from '../components/modals/BroadcastModal';

export default function Dashboard() {
    const navigate = useNavigate();
    const { currentUser } = useUser();
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [isCreateArticleOpen, setIsCreateArticleOpen] = useState(false);
    const [isUploadVideoOpen, setIsUploadVideoOpen] = useState(false);
    const [posts, setPosts] = useState([]);
    const [greeting, setGreeting] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    const [networkState, setNetworkState] = useState({
        followingIds: new Set(),
        followerIds: new Set(),
        followingCount: 0,
        followersCount: 0,
        isLoaded: false
    });

    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(posts.length, 6, 6);

    const [userKarma, setUserKarma] = useState(currentUser?.karma || 0);
    const [showHero, setShowHero] = useState(false);

    const [activeFilter, setActiveFilter] = useState('All');
    const [announcements, setAnnouncements] = useState([]);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [editingBroadcastData, setEditingBroadcastData] = useState(null);

    const isSysAdmin = currentUser?.role === 'SYSADM' || 
                       currentUser?.roleName === 'System Administrator' || 
                       (Array.isArray(currentUser?.roles) && (currentUser.roles.includes('SYSADM') || currentUser.roles.includes('System Administrator') || currentUser.roles.includes('SystemAdmin')));

    const isHrOrSysAdmin = isSysAdmin || 
                           ['HRADM', 'HR ADMIN', 'HR ADMINISTRATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
                           ['HR ADMINISTRATOR', 'HR ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
                           (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['HRADM', 'HR ADMINISTRATOR', 'HR ADMIN', 'HRADMIN'].includes(String(r || '').toUpperCase())));

    useEffect(() => {
        if (currentUser?.karma !== undefined) {
            setUserKarma(currentUser.karma);
        }
        const loadKarma = async () => {
            try {
                const bal = await karmaApi.getMyBalance();
                if (bal && typeof bal.totalPoints === 'number') {
                    setUserKarma(bal.totalPoints);
                }
            } catch {
                /* fallback */
            }
        };
        loadKarma();

        // Load HR Broadcast Announcements (FR-DB-05)
        const loadAnnouncements = () => {
            dashboardApi.getAnnouncements().then(res => {
                const list = Array.isArray(res) ? res : (res?.items || res?.data || []);
                // Ensure only genuine broadcast announcements are rendered (never comments, personal role updates, or personal notifications)
                const validAnnouncements = list.filter(item => {
                    const evt = String(item.eventType || item.type || '').toUpperCase();
                    const msg = String(item.message || item.content || '').toLowerCase();
                    if (
                        msg.includes('commented on') || 
                        msg.includes('liked your') || 
                        msg.includes('published a new post') || 
                        msg.includes('published a new article') ||
                        msg.includes('roles have been updated') ||
                        msg.includes('role has been updated') ||
                        msg.includes('reviewed by moderation') ||
                        msg.includes('first-time login') ||
                        msg.includes('joined knome with default')
                    ) {
                        return false;
                    }
                    return evt === 'HRANNOUNCEMENT' || evt === 'ADMINBROADCAST' || item.isBroadcast === true || item.sender === 'HR Administration';
                });
                setAnnouncements(validAnnouncements);
            }).catch(() => {
                setAnnouncements([]);
            });
        };
        loadAnnouncements();

        const handleBroadcastUpdate = () => {
            loadAnnouncements();
        };
        window.addEventListener('knome:broadcast-updated', handleBroadcastUpdate);
        return () => {
            window.removeEventListener('knome:broadcast-updated', handleBroadcastUpdate);
        };
    }, [currentUser?.userId, currentUser?.employeeId, currentUser?.karma]);

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 17) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');
    }, []);

    useEffect(() => {
        const uid = currentUser?.userId || currentUser?.id;
        if (!uid) return;

        let isMounted = true;
        const loadNetwork = async () => {
            try {
                const [followingRes, followersRes] = await Promise.all([
                    profileApi.getFollowing(uid).catch(() => []),
                    profileApi.getFollowers(uid).catch(() => [])
                ]);

                if (!isMounted) return;

                const followingList = Array.isArray(followingRes) ? followingRes : (followingRes?.data || []);
                const followersList = Array.isArray(followersRes) ? followersRes : (followersRes?.data || []);

                const fIngIds = new Set(followingList.map(u => String(u.id || u.userId)));
                const fErIds = new Set(followersList.map(u => String(u.id || u.userId)));

                setNetworkState({
                    followingIds: fIngIds,
                    followerIds: fErIds,
                    followingCount: followingList.length,
                    followersCount: followersList.length,
                    isLoaded: true
                });
            } catch (err) {
                console.warn('Failed to load user following/followers for feed', err);
            }
        };

        loadNetwork();
        return () => { isMounted = false; };
    }, [currentUser?.userId, currentUser?.id]);

    const currentUserIdStr = String(currentUser?.userId || currentUser?.id || '');

    const loadPosts = async (filterType = activeFilter) => {
        setIsLoading(true);
        try {
            const data = await dashboardApi.getFeed(filterType);
            let mapped = (data && Array.isArray(data)) ? data.map(mapFeedItem) : [];
            const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]').map(String);

            // Merge local posts so locally created or shared posts survive refresh
            try {
                const localPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                localPosts.forEach(lp => {
                    const lpIdStr = String(lp.id || lp.postId || '');
                    if (!deletedIds.includes(lpIdStr) && !mapped.some(m => String(m.id || m.contentId || m.postId) === lpIdStr)) {
                        mapped.unshift(mapFeedItem(lp));
                    }
                });
            } catch (_) {}

            const postsAndArticlesOnly = mapped.filter(item => {
                const itemIdStr = String(item.id || item.contentId || item.postId || '');
                if (deletedIds.includes(itemIdStr)) return false;
                const type = (item.type || item.contentType || '').toLowerCase();
                if (type === 'video' || type === 'podcast') return false;

                // Scheduled publication privacy: future scheduled posts visible to author only
                if (item.status === 'Scheduled' && item.scheduledDate) {
                    const schedTime = new Date(item.scheduledDate).getTime();
                    if (schedTime > Date.now()) {
                        const authorIdStr = String(item.author?.id || item.authorId || item.userId || '');
                        return authorIdStr === currentUserIdStr;
                    }
                }
                return true;
            });
            setPosts(postsAndArticlesOnly);
        } catch (err) {
            console.error('Failed to load feed:', err);
            setPosts([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFilterChange = (filterId) => {
        setActiveFilter(filterId);
        resetScrollLoading();
        loadPosts(filterId);
    };

    const handlePostCreated = (e) => {
        const newPostData = e?.detail || e;
        if (newPostData && (newPostData.id || newPostData.postId)) {
            const mapped = mapFeedItem(newPostData);
            setPosts(prev => {
                const targetId = mapped.id;
                if (prev.some(p => String(p.id) === String(targetId))) return prev;
                return [mapped, ...prev];
            });
        }
        dashboardApi.getFeed(activeFilter).then(data => {
            if (data && Array.isArray(data)) {
                const mapped = data.map(mapFeedItem);
                const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]').map(String);
                const postsAndArticlesOnly = mapped.filter(item => {
                    const itemIdStr = String(item.id || item.contentId || item.postId || '');
                    if (deletedIds.includes(itemIdStr)) return false;
                    const type = (item.type || item.contentType || '').toLowerCase();
                    if (type === 'video' || type === 'podcast') return false;

                    // Scheduled publication privacy: future scheduled posts visible to author only
                    if (item.status === 'Scheduled' && item.scheduledDate) {
                        const schedTime = new Date(item.scheduledDate).getTime();
                        if (schedTime > Date.now()) {
                            const authorIdStr = String(item.author?.id || item.authorId || item.userId || '');
                            return authorIdStr === currentUserIdStr;
                        }
                    }
                    return true;
                });
                setPosts(postsAndArticlesOnly);
            }
        }).catch(() => {});
    };

    const handlePostDeleted = (e) => {
        const deletedId = e?.detail?.id || e;
        if (deletedId) {
            const delStr = String(deletedId);
            setPosts(prev => prev.filter(p => String(p.id) !== delStr && String(p.contentId) !== delStr && String(p.postId) !== delStr));
        }
    };

    useEffect(() => {
        loadPosts('All');
        window.addEventListener('post-created', handlePostCreated);
        window.addEventListener('post-deleted', handlePostDeleted);
        return () => {
            window.removeEventListener('post-created', handlePostCreated);
            window.removeEventListener('post-deleted', handlePostDeleted);
        };
    }, []);

    return (
        <>
            <div className="flex-1 min-w-0 flex flex-col xl:flex-row gap-6 pb-6">
                {/* Main Feed Column */}
                <main className="flex-1 min-w-0 flex flex-col gap-5">

                    {/* Greeting Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-1.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-slate-900 dark:text-white">
                                {greeting}, <span style={{background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>{(currentUser?.name || currentUser?.fullName || 'Colleague').split(' ')[0]}</span> 👋
                            </h1>
                            <TextScramble 
                                className="text-sm font-semibold tracking-wide text-theme-30-text bg-theme-30/20 dark:bg-theme-30/40 px-2.5 py-0.5 rounded-md"
                                phrases={[
                                    'Discover Your Knowledge Feed',
                                    'See What Your Network Is Up To',
                                    'Collaborate With Your Peers',
                                    'Learn Something New Today'
                                ]} 
                            />
                        </div>
                    </div>

                    {/* HR Organization Announcement Banner (FR-DB-05) */}
                    {announcements && announcements.length > 0 && announcements[0] && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-300">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                                    <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>campaign</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-md">HR Broadcast</span>
                                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">• Organization Announcement</span>
                                    </div>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">{announcements[0].title || announcements[0].message}</h4>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed">{announcements[0].content || announcements[0].details || announcements[0].message}</p>
                                </div>
                            </div>

                            {/* HR Admin & System Admin Actions */}
                            {isHrOrSysAdmin && (
                                <div className="flex items-center gap-1.5 shrink-0 self-start">
                                    <button
                                        onClick={() => {
                                            setEditingBroadcastData(announcements[0]);
                                            setIsBroadcastModalOpen(true);
                                        }}
                                        className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 transition-all flex items-center gap-1 cursor-pointer"
                                        title="Edit this broadcast announcement"
                                    >
                                        <span className="material-symbols-outlined text-[15px]">edit</span>
                                        <span>Edit</span>
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const target = announcements[0];
                                            const targetId = target?.id || target?.Id || target?.notificationId;
                                            if (!targetId) return;

                                            // Optimistically remove from UI immediately
                                            setAnnouncements(prev => prev.filter(a => (a.id || a.Id || a.notificationId) !== targetId));

                                            try {
                                                await notificationsApi.broadcasts.delete(targetId);
                                                window.dispatchEvent(new CustomEvent('knome:broadcast-updated'));
                                            } catch (e) {
                                                console.error('Failed to remove broadcast:', e);
                                                loadAnnouncements();
                                            }
                                        }}
                                        className="p-1 rounded-lg text-amber-700/60 dark:text-amber-300/60 hover:text-rose-600 hover:bg-rose-500/15 transition-all cursor-pointer"
                                        title="Remove announcement"
                                    >
                                        <span className="material-symbols-outlined text-[17px]">delete</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* HR Admin Prompt when No Broadcast is Active */}
                    {(!announcements || announcements.length === 0) && isHrOrSysAdmin && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/5 border border-dashed border-amber-500/30 flex items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>campaign</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md">
                                            HR Admin Broadcast
                                        </span>
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                            No Active Organization Broadcast
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        Publish company-wide announcements, town halls, or urgent notices to all MPOnline employees.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingBroadcastData(null);
                                    setIsBroadcastModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transition-all shadow-xs shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                                <span className="material-symbols-outlined text-[16px]">campaign</span>
                                <span>Create Broadcast</span>
                            </button>
                        </div>
                    )}

                    {/* Interactive Background Paths Hero Showcase */}
                    {showHero && (
                        <div className="flex flex-col gap-4">
                            <BackgroundPaths 
                                title="Discover Excellence" 
                                subtitle="Welcome to Knome — the enterprise knowledge & collaboration hub for MPOnline Limited"
                                buttonText="Create New Post"
                                onButtonClick={() => setIsCreatePostOpen(true)}
                            />
                            <ScrollExpandMedia
                                mediaType="image"
                                mediaSrc="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=1280&auto=format&fit=crop"
                                bgImageSrc="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1920&auto=format&fit=crop"
                                title="Knome Knowledge Hub"
                                date="MPOnline Enterprise Platform"
                                scrollToExpand="Scroll to Expand Interactive View"
                                textBlend={true}
                            >
                                <div className="max-w-4xl mx-auto text-white">
                                    <h3 className="text-2xl font-bold mb-3 text-indigo-200">Enterprise Innovation & Knowledge Exchange</h3>
                                    <p className="text-slate-200 leading-relaxed font-medium text-sm sm:text-base">
                                        Connect with team members, publish technical articles, participate in community discussions, and explore curated media channels.
                                    </p>
                                </div>
                            </ScrollExpandMedia>
                        </div>
                    )}

                    {/* Create Post Composer */}
                    {currentUser?.role !== 'SYSADM' && (
                        <div className="rounded-2xl overflow-hidden transition-all duration-300 hover:border-indigo-500/30"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                boxShadow: 'var(--shadow-premium)'
                            }}>
                            {/* Top row */}
                            <div
                                onClick={() => setIsCreatePostOpen(true)}
                                className="flex items-center gap-3 p-4 cursor-pointer group">
                                <div className="relative shrink-0 p-[1.5px] rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 shadow-xs">
                                    <img 
                                        className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-800" 
                                        alt="Avatar" 
                                        src={resolveMediaUrl(currentUser?.profilePhotoUrl) || currentUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.fullName || 'User')}&background=6366f1&color=fff`} 
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || currentUser?.fullName || 'User')}&background=6366f1&color=fff`;
                                        }}
                                    />
                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900 shadow-xs"></div>
                                </div>
                                <div className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-all group-hover:border-indigo-500/40 group-hover:bg-slate-100/80 dark:group-hover:bg-slate-800/80 group-hover:ring-2 group-hover:ring-indigo-500/15"
                                    style={{
                                        background: 'var(--bg-surface)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--border-subtle)'
                                    }}>
                                    What's on your mind, {(currentUser?.name || currentUser?.fullName || 'User').split(' ')[0]}?
                                </div>
                            </div>
                            {/* Action Buttons */}
                            <div className="flex items-center border-t px-4 py-2.5 gap-2" style={{borderColor: 'var(--border-subtle)'}}>
                                {[
                                    { icon: 'image', label: 'Post', color: '#10b981', action: () => setIsCreatePostOpen(true) },
                                    { icon: 'article', label: 'Article', color: '#8b5cf6', action: () => setIsCreateArticleOpen(true) },
                                    { icon: 'videocam', label: 'Videos', color: '#ef4444', action: () => setIsUploadVideoOpen(true) },
                                ].map(btn => (
                                    <button
                                        key={btn.label}
                                        type="button"
                                        onClick={btn.action}
                                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-bold transition-all hover:bg-slate-100 dark:hover:bg-slate-800/80 active:scale-[0.98] flex-1 justify-center cursor-pointer group select-none"
                                        style={{color: 'var(--text-secondary)'}}>
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                                            style={{background: `${btn.color}15`}}>
                                            <span className="material-symbols-outlined text-[17px]" style={{color: btn.color}}>{btn.icon}</span>
                                        </div>
                                        <span className="font-bold">{btn.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}




                    {/* Post Feed */}
                    <div className="flex flex-col gap-5">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                Loading feed...
                            </div>
                        ) : posts.length > 0 ? (
                            <>
                                {posts.slice(0, visibleCount).map((post, idx) => (
                                    <PostCard 
                                        key={post.id ? `${post.id}-${idx}` : idx} 
                                        post={post} 
                                        isAuthorFollowed={networkState.followingIds.has(String(post.author?.id || post.authorUserId || post.userId || ''))}
                                        isAuthorFollower={networkState.followerIds.has(String(post.author?.id || post.authorUserId || post.userId || ''))}
                                        onPostDeleted={(deletedId) => {
                                            if (deletedId) setPosts(prev => prev.filter(p => p.id !== deletedId && p.postId !== deletedId));
                                            loadPosts(activeFilter);
                                        }} 
                                    />
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < posts.length} text="Loading more feed posts on scroll..." />
                            </>
                        ) : (
                            <div className="p-10 text-center flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in duration-200">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-[32px]">feed</span>
                                </div>
                                <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">No content found</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
                                    There are no posts published on the platform currently. Be the first to share an update with your colleagues!
                                </p>
                                <button
                                    onClick={() => setIsCreatePostOpen(true)}
                                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                    <span>Create a Post</span>
                                </button>
                            </div>
                        )}
                    </div>
                </main>

                {/* Right Sidebar Widgets */}
                <aside className="w-full xl:w-[340px] shrink-0 flex flex-col gap-5">
                    <MyCommunitiesWidget />
                    <HotPostsWidget />

                    {/* Trending Tags Widget */}
                    <TrendingTagsWidget />

                    {/* People You May Know */}
                    <PeopleYouMayKnowWidget />
                </aside>
            </div>

            <CreatePostModal isOpen={isCreatePostOpen} onClose={() => setIsCreatePostOpen(false)} onPostCreated={() => loadPosts(500)} />
            <CreateArticleModal isOpen={isCreateArticleOpen} onClose={() => setIsCreateArticleOpen(false)} onArticleCreated={() => loadPosts(activeFilter)} />
            <UploadVideoModal isOpen={isUploadVideoOpen} onClose={() => setIsUploadVideoOpen(false)} onVideoUploaded={() => loadPosts(activeFilter)} />
            <BroadcastModal
                isOpen={isBroadcastModalOpen}
                onClose={() => {
                    setIsBroadcastModalOpen(false);
                    setEditingBroadcastData(null);
                }}
                initialData={editingBroadcastData}
                onSuccess={() => {}}
            />
        </>
    );
}
