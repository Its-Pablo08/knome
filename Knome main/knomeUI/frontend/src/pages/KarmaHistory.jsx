import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getKarmaBadge } from '../utils/karmaEngine';
import { karmaApi, resolveMediaUrl } from '../utils/apiService';
import { useUser } from '../components/contexts/UserContext';

export const KARMA_CATEGORIES = [
    {
        id: 'post',
        name: 'Posts',
        rate: '+2 pts',
        unit: 'per published post',
        cap: 'Max 50 pts/day',
        icon: 'dynamic_feed',
        iconColor: 'text-indigo-500 dark:text-indigo-400',
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        border: 'border-indigo-200 dark:border-indigo-800/40',
        chipClass: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
        color: '#6366f1'
    },
    {
        id: 'article',
        name: 'Articles',
        rate: '+10 pts',
        unit: 'per published article',
        cap: 'Max 30 pts/day',
        icon: 'article',
        iconColor: 'text-sky-500 dark:text-sky-400',
        bg: 'bg-sky-50 dark:bg-sky-950/40',
        border: 'border-sky-200 dark:border-sky-800/40',
        chipClass: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
        color: '#0ea5e9'
    },
    {
        id: 'video',
        name: 'Videos',
        rate: '+8 pts',
        unit: 'per approved video',
        cap: 'Max 24 pts/day',
        icon: 'videocam',
        iconColor: 'text-rose-500 dark:text-rose-400',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        border: 'border-rose-200 dark:border-rose-800/40',
        chipClass: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
        color: '#f43f5e'
    },
    {
        id: 'podcast',
        name: 'Podcasts',
        rate: '+8 pts',
        unit: 'per approved podcast',
        cap: 'Max 24 pts/day',
        icon: 'podcasts',
        iconColor: 'text-purple-500 dark:text-purple-400',
        bg: 'bg-purple-50 dark:bg-purple-950/40',
        border: 'border-purple-200 dark:border-purple-800/40',
        chipClass: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60',
        color: '#a855f7'
    },
    {
        id: 'like',
        name: 'Likes',
        rate: '+1 pt',
        unit: 'give or receive like',
        cap: 'No daily cap',
        icon: 'thumb_up',
        iconColor: 'text-amber-500 dark:text-amber-400',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        border: 'border-amber-200 dark:border-amber-800/40',
        chipClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
        color: '#f59e0b'
    },
    {
        id: 'comment',
        name: 'Comments',
        rate: '+2 pts',
        unit: 'give or receive comment',
        cap: 'No daily cap',
        icon: 'chat_bubble',
        iconColor: 'text-emerald-500 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        border: 'border-emerald-200 dark:border-emerald-800/40',
        chipClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
        color: '#10b981'
    },
    {
        id: 'share',
        name: 'Shares',
        rate: '+2–3 pts',
        unit: 'share or receive share',
        cap: 'No daily cap',
        icon: 'share',
        iconColor: 'text-teal-500 dark:text-teal-400',
        bg: 'bg-teal-50 dark:bg-teal-950/40',
        border: 'border-teal-200 dark:border-teal-800/40',
        chipClass: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60',
        color: '#14b8a6'
    },
    {
        id: 'community',
        name: 'Communities',
        rate: '+5 pts',
        unit: 'active daily visit',
        cap: 'Max 5 pts/day',
        icon: 'groups',
        iconColor: 'text-orange-500 dark:text-orange-400',
        bg: 'bg-orange-50 dark:bg-orange-950/40',
        border: 'border-orange-200 dark:border-orange-800/40',
        chipClass: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60',
        color: '#f97316'
    }
];

export const mapTransactionCategory = (tx) => {
    const act = String(tx.activityType || tx.desc || tx.type || '').toLowerCase();
    const rel = String(tx.relatedContentType || tx.source || '').toLowerCase();

    if (act.includes('like') || act.includes('reaction')) return 'like';
    if (act.includes('comment')) return 'comment';
    if (act.includes('share')) return 'share';
    if (act.includes('video') || rel === 'video') return 'video';
    if (act.includes('podcast') || rel === 'podcast') return 'podcast';
    if (act.includes('article') || rel === 'article') return 'article';
    if (act.includes('post') || rel === 'post') return 'post';
    if (act.includes('community') || rel === 'community') return 'community';
    return 'other';
};

export const formatTransactionDesc = (tx) => {
    const act = String(tx.activityType || '').trim();
    const rel = String(tx.relatedContentType || '').trim();

    switch (act) {
        case 'CreatePost':
            return 'Published a Post';
        case 'CreateArticle':
            return 'Published an Article';
        case 'CreateVideo':
            return 'Uploaded a Video';
        case 'CreatePodcast':
            return 'Uploaded a Podcast';
        case 'AddLike':
            return `Liked a ${rel || 'Post'}`;
        case 'ReceiveLike':
            return `Received a Like on ${rel || 'Content'}`;
        case 'AddComment':
            return `Commented on a ${rel || 'Post'}`;
        case 'ReceiveComment':
            return `Received a Comment on ${rel || 'Content'}`;
        case 'AddShare':
            return `Shared a ${rel || 'Post'}`;
        case 'ReceiveShare':
            return `Received a Share on ${rel || 'Content'}`;
        case 'CommunityParticipation':
            return 'Community Participation';
        case 'ManualAward':
            return 'Special Admin Recognition';
        default:
            return tx.desc || act.replace(/([A-Z])/g, ' $1').trim() || 'Platform Contribution';
    }
};

export const formatCategoryBadge = (catId, rawSource) => {
    const cat = KARMA_CATEGORIES.find(c => c.id === catId);
    if (cat) {
        return { label: cat.name.replace(/ & Reactions/, ''), chipClass: cat.chipClass, icon: cat.icon };
    }
    return { label: rawSource || 'System', chipClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700', icon: 'stars' };
};

export default function KarmaHistory() {
    const { currentUser } = useUser();
    const navigate = useNavigate();

    const [balance, setBalance] = useState({ 
        totalPoints: currentUser?.karmaPoints ?? currentUser?.karma ?? 0, 
        badgeLevel: 'Bronze', 
        recentTransactions: [] 
    });
    const [leaderboard, setLeaderboard] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
    const [visibleCount, setVisibleCount] = useState(10);

    useEffect(() => {
        setVisibleCount(10);
    }, [selectedCategoryFilter]);

    const isSysAdmin = Boolean(
        ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
        ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) || 
        ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN'].includes(String(currentUser?.designation || '').toUpperCase()) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => 
            ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(r || '').toUpperCase())
        ))
    );

    useEffect(() => {
        let isMounted = true;
        async function fetchKarmaData() {
            try {
                const [balData, lbData] = await Promise.all([
                    karmaApi.getMyBalance().catch(() => null),
                    karmaApi.getLeaderboard(10).catch(() => null),
                    new Promise(resolve => setTimeout(resolve, 350))
                ]);

                if (isMounted) {
                    if (balData) {
                        setBalance(balData);
                    }
                    if (lbData && Array.isArray(lbData) && lbData.length > 0) {
                        const mappedLb = lbData.map((item, idx) => ({
                            rank: item.rank || idx + 1,
                            userId: item.userId,
                            name: item.fullName || item.userName || 'Employee',
                            role: item.designation || 'Contributor',
                            points: item.totalPoints || 0,
                            avatar: resolveMediaUrl(item.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.fullName || item.userName || 'Employee')}&background=6366f1&color=fff`
                        }));
                        setLeaderboard(mappedLb);
                    }
                }
            } catch (err) {
                console.error("Failed to load karma data", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        }
        fetchKarmaData();
        return () => { isMounted = false; };
    }, []);

    const realKarmaPoints = isSysAdmin ? 0 : Number(balance.totalPoints ?? currentUser?.karmaPoints ?? currentUser?.karma ?? 0);
    const karmaBadge = getKarmaBadge(realKarmaPoints);
    const currentLevel = Math.max(1, Math.floor(realKarmaPoints / 100) + 1);
    const nextLevelTarget = currentLevel * 100;
    const progressPercent = realKarmaPoints % 100;

    const apiTx = useMemo(() => {
        if (!balance.recentTransactions || balance.recentTransactions.length === 0) return [];
        return balance.recentTransactions.map((tx, idx) => {
            const catId = mapTransactionCategory(tx);
            const badgeInfo = formatCategoryBadge(catId, tx.relatedContentType);
            return {
                id: tx.transactionId || idx,
                date: new Date(tx.createdDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                desc: formatTransactionDesc(tx),
                rawDesc: tx.activityType,
                categoryId: catId,
                type: catId,
                points: `+${tx.pointsAwarded}`,
                pointsNum: Number(tx.pointsAwarded || 0),
                source: badgeInfo.label,
                sourceChipClass: badgeInfo.chipClass,
                sourceIcon: badgeInfo.icon,
                icon: badgeInfo.icon,
                color: 'text-[#6366f1]',
                bg: 'bg-[#6366f1]/10'
            };
        });
    }, [balance.recentTransactions]);

    const defaultMockActivities = [
        { id: 1, date: 'Recent', desc: 'Published an Article', categoryId: 'article', type: 'article', points: '+10', pointsNum: 10, source: 'Articles', sourceChipClass: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60', icon: 'article', color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/30' },
        { id: 2, date: 'Recent', desc: 'Community Participation', categoryId: 'community', type: 'community', points: '+5', pointsNum: 5, source: 'Communities', sourceChipClass: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60', icon: 'groups', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30' },
        { id: 3, date: 'Recent', desc: 'Published a Post', categoryId: 'post', type: 'post', points: '+2', pointsNum: 2, source: 'Posts', sourceChipClass: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60', icon: 'dynamic_feed', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/30' }
    ];

    const activities = apiTx.length > 0 ? apiTx : (isSysAdmin ? [] : defaultMockActivities);


    const filteredActivities = useMemo(() => {
        if (selectedCategoryFilter === 'all') return activities;
        return activities.filter(a => a.categoryId === selectedCategoryFilter);
    }, [activities, selectedCategoryFilter]);

    const displayedActivities = useMemo(() => {
        return filteredActivities.slice(0, visibleCount);
    }, [filteredActivities, visibleCount]);

    const filteredPointsTotal = useMemo(() => {
        return filteredActivities.reduce((sum, act) => sum + (act.pointsNum || 0), 0);
    }, [filteredActivities]);

    const rules = [
        { activity: 'Create and publish a Post', points: '2 pts', cap: 'Max 50 pts/day from posts', icon: 'dynamic_feed' },
        { activity: 'Publish an Article', points: '10 pts', cap: 'Max 30 pts/day from articles', icon: 'article' },
        { activity: 'Upload a Video', points: '8 pts', cap: 'Max 24 pts/day from videos', icon: 'videocam' },
        { activity: 'Upload a Podcast', points: '8 pts', cap: 'Max 24 pts/day from podcasts', icon: 'podcasts' },
        { activity: 'Receive or Give a Like', points: '1 pt', cap: 'No cap', icon: 'thumb_up' },
        { activity: 'Receive or Write a Comment', points: '2 pts', cap: 'No cap', icon: 'chat_bubble' },
        { activity: 'Share or Receive Share', points: '2–3 pts', cap: 'No cap', icon: 'share' },
        { activity: 'Active Community Participation', points: '5 pts/day', cap: 'Once per community per day', icon: 'groups' },
    ];

    const karmaTierLevels = [
        {
            name: 'Platinum',
            title: 'Enterprise Legend',
            points: '5,000+ pts',
            icon: 'workspace_premium',
            iconColor: 'text-cyan-500 dark:text-cyan-400',
            badgeClass: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-300 border-cyan-300/40 dark:border-cyan-700/50'
        },
        {
            name: 'Gold',
            title: 'Domain Expert',
            points: '1,000 – 4,999 pts',
            icon: 'stars',
            iconColor: 'text-amber-500',
            badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-300/40 dark:border-amber-700/50'
        },
        {
            name: 'Silver',
            title: 'Active Contributor',
            points: '500 – 999 pts',
            icon: 'military_tech',
            iconColor: 'text-slate-400 dark:text-slate-300',
            badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300/50 dark:border-slate-700'
        },
        {
            name: 'Bronze',
            title: 'Community Explorer',
            points: '100 – 499 pts',
            icon: 'military_tech',
            iconColor: 'text-amber-700 dark:text-amber-500',
            badgeClass: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-300/40 dark:border-orange-700/50'
        },
        {
            name: 'Starter',
            title: 'New Member',
            points: '0 – 99 pts',
            icon: 'flag',
            iconColor: 'text-indigo-500',
            badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50'
        },
    ];

    const displayLeaderboard = leaderboard;

    if (isLoading) {
        return (
            <main className="flex-1 min-w-0 flex flex-col items-center justify-center min-h-[60vh] py-16">
                <div className="flex flex-col items-center justify-center gap-4 p-8 glass bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm max-w-sm w-full mx-auto text-center">
                    <div className="relative flex items-center justify-center">
                        <div className="w-14 h-14 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                        <span className="material-symbols-outlined text-amber-500 text-[26px] absolute" style={{ fontVariationSettings: "'FILL' 1" }}>
                            military_tech
                        </span>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5">
                            Loading Karma Points
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Fetching contribution rewards, level status, and leaderboard...
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 min-w-0 flex flex-col gap-6 pb-6">
            
            {/* ─── SYSTEM ADMIN GOVERNANCE EXEMPTION BANNER ─── */}
            {isSysAdmin && (
                <div className="rounded-3xl border border-indigo-500/30 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-7 sm:p-8 shadow-md relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 shadow-inner">
                                <span className="material-symbols-outlined text-indigo-300 text-[32px]">admin_panel_settings</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-500/30 text-indigo-300 px-2.5 py-0.5 rounded-md border border-indigo-400/30">
                                        System Governance Scope
                                    </span>
                                    <span className="text-xs text-slate-400 font-semibold">• Exemption Active</span>
                                </div>
                                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                    System Administrator — Karma Points Exemption
                                </h2>
                                <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed font-normal">
                                    System Administrators possess full platform governance, security control, and content moderation rights. System Admin accounts do not accrue personal Karma points and are exempt from employee gamification ranking. Below you can monitor category point rules and inspect the organizational leaderboard.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <Link to="/admin-console" className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">tune</span>
                                Admin Console
                            </Link>
                            <Link to="/" className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px]">home</span>
                                Home Feed
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── REGULAR USER SCORE OVERVIEW ─── */}
            {!isSysAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Score Card */}
                    <div className="lg:col-span-2 glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <span className="material-symbols-outlined text-[160px]" style={{fontVariationSettings: "'FILL' 1"}}>military_tech</span>
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 text-indigo-500 mb-2">
                                <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>stars</span>
                                <span className="text-[11px] font-black tracking-widest uppercase">Karma Overview</span>
                            </div>
                            <div className="flex items-baseline gap-4 mb-2">
                                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-amber-600">
                                    {realKarmaPoints.toLocaleString()}
                                </h1>
                                <span className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg text-[12px] font-bold border border-amber-200 dark:border-amber-500/20">
                                    {karmaBadge.name} Tier
                                </span>
                            </div>
                            <p className="text-[13px] font-medium text-slate-500 max-w-md leading-relaxed mb-8">
                                Karma is awarded automatically for sharing knowledge and engaging with the community. Your points unlock recognition badges and leadership visibility.
                            </p>
                            
                            <div className="grid grid-cols-3 gap-6">
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Platform Level</span>
                                    <span className="text-xl font-black text-indigo-500">Level {currentLevel}</span>
                                </div>
                                <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-6">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Badge Status</span>
                                    <span className="text-xl font-black text-slate-900 dark:text-white truncate">{karmaBadge.name}</span>
                                </div>
                                <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-6">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Goal for Level {currentLevel + 1}</span>
                                    <span className="text-xl font-black text-slate-900 dark:text-white">{nextLevelTarget.toLocaleString()} pts</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Level Progress */}
                    <div className="glass card-lift rounded-3xl border border-indigo-200 dark:border-indigo-800 p-8 shadow-sm relative overflow-hidden flex flex-col justify-between"
                        style={{background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(168,85,247,0.9))'}}>
                        
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4"></div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-black text-indigo-100 tracking-widest uppercase">Current Rank</span>
                                <span className="material-symbols-outlined text-yellow-300" style={{fontVariationSettings: "'FILL' 1"}}>workspace_premium</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight mb-2">{karmaBadge.name} Contributor</h2>
                            <p className="text-[13px] font-medium text-indigo-100 leading-relaxed">
                                Keep publishing posts, articles, videos, and engaging with peers to level up!
                            </p>
                        </div>

                        <div className="relative z-10 mt-8">
                            <div className="flex justify-between mb-2 text-[12px] font-bold text-white">
                                <span>Progress to Level {currentLevel + 1}</span>
                                <span>{progressPercent}%</span>
                            </div>
                            <div className="w-full bg-black/20 h-2.5 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
                                <div 
                                    className="bg-gradient-to-r from-yellow-300 to-amber-500 h-full rounded-full shadow-[0_0_10px_rgba(252,211,77,0.8)] relative overflow-hidden transition-all duration-500" 
                                    style={{ width: `${progressPercent}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{transform: 'skewX(-20deg)'}}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}


            {/* ─── GLOBAL LEADERBOARD ─── */}
            <div className="glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-indigo-500/10 to-transparent flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500" style={{fontVariationSettings:"'FILL' 1"}}>trophy</span>
                            Global Top Contributors Leaderboard
                        </h3>
                        <p className="text-[12px] font-medium text-slate-500 mt-1">
                            The most active and helpful contributors on the platform based on real Karma points.
                        </p>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                                <th className="px-6 py-4 w-20 text-center">Rank</th>
                                <th className="px-6 py-4">Contributor</th>
                                <th className="px-6 py-4 text-center">Badge Tier</th>
                                <th className="px-6 py-4 text-right">Karma Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {displayLeaderboard.map((user) => {
                                const badge = getKarmaBadge(user.points);
                                const isCurrentUser = (currentUser?.userId && user.userId === currentUser.userId) || 
                                                      (currentUser?.id && user.userId === currentUser.id) ||
                                                      user.name === (currentUser?.fullName || currentUser?.name);
                                return (
                                    <tr key={user.rank} className={`transition-colors group ${isCurrentUser ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'}`}>
                                        <td className="px-6 py-4">
                                            <div className={`w-8 h-8 rounded-xl mx-auto flex items-center justify-center font-black text-[14px] ${user.rank <= 3 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
                                                #{user.rank}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                             <div className="flex items-center gap-3">
                                                 <img 
                                                     src={resolveMediaUrl(user.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff`} 
                                                     onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff`; }}
                                                     className="w-10 h-10 rounded-xl object-cover shadow-sm shrink-0 border border-slate-200 dark:border-slate-700" 
                                                     alt={user.name} 
                                                 />
                                                <div>
                                                    <div className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                                                        {user.name}
                                                        {isCurrentUser && <span className="bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">You</span>}
                                                    </div>
                                                    <div className="text-[11px] font-medium text-slate-500">{user.role}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${badge.bg} ${badge.color} ${badge.border}`}>
                                                <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings:"'FILL' 1"}}>workspace_premium</span>
                                                <span className="text-[11px] font-bold uppercase tracking-wider">{badge.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-indigo-500 text-[16px]">
                                            {user.points.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── RECENT KARMA LEDGER & HOW TO EARN ─── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                
                {/* Left Column: Activity Feed */}
                <div className="xl:col-span-7 glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500">history</span>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                Recent Karma Ledger
                            </h3>
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                {filteredActivities.length} {filteredActivities.length === 1 ? 'entry' : 'entries'}
                            </span>
                            {filteredPointsTotal > 0 && (
                                <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200/50 dark:border-amber-800/40">
                                    +{filteredPointsTotal} pts
                                </span>
                            )}
                        </div>

                        {/* Category Filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 max-w-full">
                            <button
                                onClick={() => setSelectedCategoryFilter('all')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                                    selectedCategoryFilter === 'all'
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                                }`}
                            >
                                All
                            </button>
                            {KARMA_CATEGORIES.map(c => {
                                const isSelected = selectedCategoryFilter === c.id;
                                const count = activities.filter(a => a.categoryId === c.id).length;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => setSelectedCategoryFilter(c.id)}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            isSelected
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>{c.name}</span>
                                        {count > 0 && (
                                            <span className={`text-[9px] px-1 py-0.2 rounded font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                                    <th className="px-6 py-4 w-[140px]">Date</th>
                                    <th className="px-6 py-4">Activity Description</th>
                                    <th className="px-6 py-4">Category</th>
                                    <th className="px-6 py-4 text-right">Points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                {displayedActivities.length > 0 ? (
                                    displayedActivities.map((act) => (
                                        <tr key={act.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                            <td className="px-6 py-4 text-[12px] font-medium text-slate-400 whitespace-nowrap">
                                                {act.date}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${act.bg} ${act.color}`}>
                                                        <span className="material-symbols-outlined text-[16px]" style={{fontVariationSettings:"'FILL' 1"}}>{act.icon}</span>
                                                    </div>
                                                    <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                                                        {act.desc}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-[12px] font-medium">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold border ${act.sourceChipClass}`}>
                                                    <span className="material-symbols-outlined text-[12px]">{act.sourceIcon}</span>
                                                    {act.source}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-amber-500 text-[14px]">
                                                {act.points}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                            <span className="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600 mb-2">inbox</span>
                                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                                No activities found {selectedCategoryFilter !== 'all' ? `for ${KARMA_CATEGORIES.find(c => c.id === selectedCategoryFilter)?.name}` : ''}.
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                {selectedCategoryFilter !== 'all' 
                                                    ? `Earn ${KARMA_CATEGORIES.find(c => c.id === selectedCategoryFilter)?.rate} points per ${KARMA_CATEGORIES.find(c => c.id === selectedCategoryFilter)?.unit}!`
                                                    : 'Engage with posts, articles, videos, and comments to earn points!'}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Show More / Show Less Pagination Controls (Max 10 visible initially) */}
                    {filteredActivities.length > 10 && (
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Showing <strong className="text-slate-800 dark:text-slate-200">{displayedActivities.length}</strong> of <strong className="text-slate-800 dark:text-slate-200">{filteredActivities.length}</strong> transactions
                            </span>
                            <div className="flex items-center gap-2">
                                {visibleCount < filteredActivities.length && (
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 10)}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                                    >
                                        <span>Show More</span>
                                        <span className="material-symbols-outlined text-[16px]">expand_more</span>
                                    </button>
                                )}
                                {visibleCount > 10 && (
                                    <button
                                        onClick={() => setVisibleCount(10)}
                                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                        <span>Show Less</span>
                                        <span className="material-symbols-outlined text-[16px]">expand_less</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: How to Earn Points & Karma Level Table */}
                <div className="xl:col-span-5 flex flex-col gap-6">
                    {/* How to Earn Karma */}
                    <div className="glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 to-transparent">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500" style={{fontVariationSettings:"'FILL' 1"}}>help_center</span>
                                How to Earn Karma
                            </h3>
                            <p className="text-[12px] font-medium text-slate-500 mt-1">
                                Gamify your enterprise knowledge contribution.
                            </p>
                        </div>
                        
                        <div className="p-6">
                            <div className="flex flex-col gap-3.5">
                                {rules.map((rule, idx) => (
                                    <div key={idx} className="flex flex-col gap-1 pb-3.5 border-b border-slate-100 dark:border-slate-800/50 last:border-0 last:pb-0">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-amber-500 text-[16px]">{rule.icon}</span>
                                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                                                    {rule.activity}
                                                </span>
                                            </div>
                                            <span className="text-[12px] font-black text-amber-600 dark:text-amber-400 shrink-0 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                                                {rule.points}
                                            </span>
                                        </div>
                                        <span className="text-[11px] font-medium text-slate-400 pl-6">
                                            {rule.cap}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Karma Points Level Table (Directly beneath How to Earn Karma) */}
                    <div className="glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-amber-500 text-[20px] shrink-0" style={{fontVariationSettings:"'FILL' 1"}}>military_tech</span>
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight truncate">
                                        Karma Points Level Table
                                    </h3>
                                    <p className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 truncate">
                                        Points thresholds & recognition badges
                                    </p>
                                </div>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40 shrink-0 ml-2">
                                5 Levels
                            </span>
                        </div>
                        
                        <div className="w-full overflow-hidden">
                            <table className="w-full text-left border-collapse table-fixed">
                                <colgroup>
                                    <col style={{ width: '38%' }} />
                                    <col style={{ width: '32%' }} />
                                    <col style={{ width: '30%' }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                                        <th className="py-2.5 pl-3.5 pr-1">Tier</th>
                                        <th className="py-2.5 px-1 text-center">Points</th>
                                        <th className="py-2.5 pl-1 pr-3.5 text-right">Badge</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {karmaTierLevels.map((lvl) => {
                                        const isCurrentTier = !isSysAdmin && karmaBadge.name.toLowerCase() === lvl.name.toLowerCase();
                                        return (
                                            <tr 
                                                key={lvl.name} 
                                                className={`transition-colors ${
                                                    isCurrentTier 
                                                        ? 'bg-amber-50/80 dark:bg-amber-950/30 font-bold' 
                                                        : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                                                }`}
                                            >
                                                <td className="py-2.5 pl-3.5 pr-1">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className={`material-symbols-outlined text-[17px] shrink-0 ${lvl.iconColor}`} style={{fontVariationSettings: "'FILL' 1"}}>
                                                            {lvl.icon}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1 leading-tight">
                                                                <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate">
                                                                    {lvl.name}
                                                                </span>
                                                                {isCurrentTier && (
                                                                    <span className="text-[8px] font-black uppercase text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-300/60 shrink-0">
                                                                        You
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] font-medium text-slate-400 truncate leading-tight mt-0.5">
                                                                {lvl.title}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-1 text-center">
                                                    <span className="text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                                        {lvl.points}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pl-1 pr-3.5 text-right">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold border shrink-0 ${lvl.badgeClass}`}>
                                                        <span className="material-symbols-outlined text-[11px]" style={{fontVariationSettings: "'FILL' 1"}}>
                                                            {lvl.icon}
                                                        </span>
                                                        <span>{lvl.name}</span>
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>

        </main>
    );
}
