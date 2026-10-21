import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateEngagementScore } from '../../utils/engagementEngine';
import { dashboardApi } from '../../utils/apiService';
import { useUser } from '../contexts/UserContext';

export default function HotPostsWidget() {
    const navigate = useNavigate();
    const { currentUser } = useUser();
    const isSysAdmin = currentUser?.role === 'SYSADM' || 
                       currentUser?.roleName === 'System Administrator' || 
                       (Array.isArray(currentUser?.roles) && (currentUser.roles.includes('SYSADM') || currentUser.roles.includes('System Administrator') || currentUser.roles.includes('SystemAdmin')));

    const [timeWindow, setTimeWindow] = useState('Daily');
    const [hotPosts, setHotPosts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchHotPosts = async (isSilent = false) => {
        try {
            if (!isSilent && hotPosts.length === 0) {
                setIsLoading(true);
            }
            const data = await dashboardApi.getHotFeed(timeWindow, 5);
            
            if (data && Array.isArray(data)) {
                // Map FeedItemDto to match what the widget expects
                const ranked = data.map((p, index) => ({
                    id: p.contentId,
                    contentType: p.contentType || 'Post',
                    title: p.title || (p.textSummary ? (p.textSummary.length > 55 ? p.textSummary.substring(0, 55) + '...' : p.textSummary) : 'Untitled'),
                    author: p.authorFullName || 'Employee',
                    score: p.hotScore || 0,
                    isRecent: (new Date() - new Date(p.publishedDate)) < 86400000, // < 24h
                }));
                setHotPosts(prev => {
                    if (prev.length === ranked.length && prev.every((p, i) => p.id === ranked[i].id && p.score === ranked[i].score && p.title === ranked[i].title)) {
                        return prev;
                    }
                    return ranked;
                });
            } else {
                setHotPosts([]);
            }
        } catch (error) {
            console.error('Failed to fetch hot posts:', error);
            if (hotPosts.length === 0) setHotPosts([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePostClick = (post) => {
        if (!post || !post.id) return;

        if (post.contentType === 'Article' || post.contentType === 'article') {
            navigate(`/article-view?id=${post.id}`);
            return;
        }

        const targetEl = document.getElementById(`post-${post.id}`);
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('ring-4', 'ring-indigo-500', 'shadow-2xl');
            setTimeout(() => {
                targetEl.classList.remove('ring-4', 'ring-indigo-500', 'shadow-2xl');
            }, 3000);
        } else {
            navigate(`/posts?id=${post.id}`);
        }
    };

    useEffect(() => {
        fetchHotPosts(hotPosts.length > 0);

        // Listen for post creation events to update Hot Posts dynamically!
        const handleRefresh = () => fetchHotPosts(true);
        const handleStorage = (e) => {
            if (e && e.key && !e.key.startsWith('knome_local_posts') && !e.key.startsWith('knome_deleted_post_ids')) {
                return;
            }
            fetchHotPosts(true);
        };
        window.addEventListener('post-created', handleRefresh);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('post-created', handleRefresh);
            window.removeEventListener('storage', handleStorage);
        };
    }, [timeWindow]);

    return (
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden"
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            }}>
            {/* Accent Orb */}
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 pointer-events-none"
                style={{background: 'radial-gradient(circle, #f97316, transparent 70%)'}}></div>
            
            <div className="flex items-center justify-between mb-5 relative">
                <h3 className="text-base font-black flex items-center gap-2" style={{color: 'var(--text-primary)'}}>
                    <span className="material-symbols-outlined text-orange-400 text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>local_fire_department</span>
                    Hot Posts
                </h3>
                
                <div className="flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full"
                    style={{background: 'rgba(2,132,199,0.1)', border: '1px solid rgba(2,132,199,0.2)', color: '#0284C7'}}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7] animate-pulse"></span>
                    Live Updates
                </div>
            </div>

            {/* Time Window Toggle (FR-HP-02) */}
            <div className="flex p-1 rounded-xl mb-5 gap-1"
                style={{background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)'}}>
                {['Daily', 'Weekly', 'Monthly'].map(window => (
                    <button
                        key={window}
                        onClick={() => setTimeWindow(window)}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all`}
                        style={timeWindow === window ? {
                            background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(14,165,233,0.1))',
                            border: '1px solid var(--border-mid)',
                            color: '#2563EB',
                            boxShadow: '0 2px 8px rgba(37,99,235,0.1)'
                        } : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                    >
                        {window}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="flex justify-center p-6">
                    <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {hotPosts.map((post, index) => (
                        <div 
                            key={post.id ? `${post.id}-${index}` : index} 
                            onClick={() => handlePostClick(post)}
                            className="flex gap-3 group cursor-pointer p-2 rounded-xl transition-all hover:bg-blue-500/5 active:scale-[0.98]"
                        >
                            <div className="text-xl font-extrabold w-5 shrink-0 leading-none mt-0.5 text-[#0284C7]">
                                {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    {post.isRecent && (
                                        <span className="px-1.5 py-0.2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded text-[9px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                                            NEW
                                        </span>
                                    )}
                                    <h4 className="text-[13px] font-bold leading-relaxed truncate group-hover:text-[#2563EB] transition-colors" style={{color: 'var(--text-primary)'}}>
                                        {post.title}
                                    </h4>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-[11px] font-bold text-slate-500 truncate pr-2">
                                        {post.author}
                                    </p>
                                    <div className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0"
                                        style={{background: 'rgba(2,132,199,0.1)', color: '#0284C7', border: '1px solid rgba(2,132,199,0.2)'}}>
                                        <span className="material-symbols-outlined text-[12px]">trending_up</span>
                                        {post.score.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isSysAdmin && (
                <button onClick={() => navigate('/karma-history')} className="w-full mt-5 py-2.5 rounded-xl font-bold text-[12px] transition-all hover:-translate-y-0.5"
                    style={{background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#2563EB'}}>
                    View Full Leaderboard
                </button>
            )}
        </div>
    );
}
