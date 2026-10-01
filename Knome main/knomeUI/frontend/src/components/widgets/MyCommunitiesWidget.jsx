import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { communitiesApi, getCommunityImages, resolveMediaUrl } from '../../utils/apiService';

const FALLBACK_COMM_BANNER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%234338ca"/><stop offset="100%" stop-color="%231e1b4b"/></linearGradient></defs><rect width="400" height="200" fill="url(%23g)"/><text x="200" y="105" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="%23e0e7ff" text-anchor="middle">Enterprise Community</text></svg>`;

export default function MyCommunitiesWidget() {
    const { currentUser } = useUser();
    const navigate = useNavigate();
    const [communities, setCommunities] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    const loadCommunities = async () => {
        setIsLoading(true);
        try {
            const res = await communitiesApi.getAll(500).catch(() => null);
            const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
            const userJoinedList = JSON.parse(localStorage.getItem(userKey) || '[]');
            const deletedIds = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]').map(String));

            let list = [];
            if (res && Array.isArray(res) && res.length > 0) {
                list = res.filter(c => !deletedIds.has(String(c.communityId)) && (c.isActive === undefined || c.isActive === true || c.isActive === 1));
            } else {
                const custom = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                list = custom.filter(c => !deletedIds.has(String(c.id)));
            }

            const currentUid = currentUser?.id || currentUser?.userId;
            const currentName = (currentUser?.name || currentUser?.fullName || '').toLowerCase().trim();

            const mapped = list.map(c => {
                const cId = c.communityId || c.id;
                const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${cId}`) || '[]');
                const count = localMembers.length > 0 ? localMembers.length : (c.membersCount || parseInt(c.members) || 1);
                const imgs = getCommunityImages(c.name, c.categoryName || c.category);
                
                const cType = (c.communityType || c.type || '').toLowerCase();
                const isOrgDefault = cType.includes('default') || cType.includes('org');
                const isBackendComm = Boolean(c.communityId);

                let isJoined = false;
                if (isBackendComm) {
                    const status = (c.currentUserMembershipStatus || '').toLowerCase();
                    isJoined = Boolean(
                        status === 'approved' ||
                        status === 'joined' ||
                        c.isCurrentUserAdmin ||
                        isOrgDefault ||
                        ((c.createdByUserId || c.creatorUserId) && String(c.createdByUserId || c.creatorUserId) === String(currentUid))
                    );
                } else {
                    const removedList = JSON.parse(localStorage.getItem(`knome_community_removed_${cId}`) || '[]');
                    const isRemoved = removedList.some(r => {
                        const s = String(r).toLowerCase();
                        return (currentUid && s === String(currentUid).toLowerCase()) || (currentName && s === currentName);
                    });
                    if (!isRemoved) {
                        isJoined = Boolean(
                            isOrgDefault ||
                            userJoinedList.some(j => String(j.id) === String(cId) && (j.status === 'joined' || !j.status)) ||
                            (currentUser && localMembers.some(m => 
                                (currentUid && String(m.userId || m.id) === String(currentUid)) ||
                                (currentName && (m.fullName || m.name || '').toLowerCase().trim() === currentName)
                            )) ||
                            ((c.createdByUserId || c.creatorUserId) && String(c.createdByUserId || c.creatorUserId) === String(currentUid))
                        );
                    }
                }

                const userPhoto = c.avatar || c.thumbnail || c.thumbnailUrl || c.banner || c.bannerUrl || c.bannerImageUrl;
                return {
                    id: cId,
                    name: c.name,
                    type: c.communityType || c.type || 'Public',
                    category: c.categoryName || c.category || 'Technology',
                    membersCount: count,
                    avatar: resolveMediaUrl(userPhoto) || userPhoto || imgs.thumbnail,
                    banner: resolveMediaUrl(c.bannerUrl || c.bannerImageUrl || c.banner) || c.banner || imgs.banner,
                    isJoined
                };
            });

            // Only display communities the current user has joined
            const joinedOnly = mapped.filter(c => c.isJoined);
            setCommunities(joinedOnly);
        } catch (err) {
            console.error('Failed to load communities widget:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCommunities();

        const handleJoinedChange = () => loadCommunities();
        window.addEventListener('community-joined-change', handleJoinedChange);
        window.addEventListener('storage', handleJoinedChange);
        return () => {
            window.removeEventListener('community-joined-change', handleJoinedChange);
            window.removeEventListener('storage', handleJoinedChange);
        };
    }, [currentUser?.id]);

    const visibleCommunities = isExpanded ? communities : communities.slice(0, 3);

    return (
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-[14px] font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-indigo-500" style={{fontVariationSettings:"'FILL' 1"}}>groups</span>
                        Enterprise Communities
                        {communities.length > 0 && (
                            <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 px-1.5 py-0.2 rounded-full">
                                {communities.length}
                            </span>
                        )}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">MPOnline official groups</p>
                </div>
                <Link to="/communities" className="text-[11px] font-bold text-indigo-500 hover:underline">
                    View All
                </Link>
            </div>

            <div className="flex flex-col gap-2.5">
                {isLoading ? (
                    <div className="py-6 text-center text-xs text-slate-400">Loading communities...</div>
                ) : communities.length === 0 ? (
                    <div className="py-5 px-3 text-center rounded-xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <span className="material-symbols-outlined text-[26px] text-slate-400 mb-1">group_off</span>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No Joined Communities</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 mb-2.5">Join official MPOnline groups to see them here.</p>
                        <Link to="/communities" className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-xs font-bold transition-colors">
                            <span>Explore</span>
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </Link>
                    </div>
                ) : (
                    <>
                        {visibleCommunities.map((community, idx) => (
                            <div 
                                key={community.id ? `${community.id}-${idx}` : `${community.name}-${idx}`}
                                onClick={() => navigate(`/community/view?id=${community.id || 177}`)}
                                className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group"
                            >
                                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 relative shadow-xs">
                                    <img 
                                        src={community.avatar || community.banner || FALLBACK_COMM_BANNER} 
                                        alt={community.name} 
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 bg-slate-200" 
                                        onError={(e) => { 
                                            e.target.onerror = null; 
                                            e.target.src = FALLBACK_COMM_BANNER; 
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-slate-900/10"></div>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <h4 className="text-[13px] font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-500 transition-colors">
                                            {community.name}
                                        </h4>
                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                                            (community.type || '').toLowerCase() === 'private'
                                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                        }`}>
                                            {community.type}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                        <span className="material-symbols-outlined text-[12px]">group</span>
                                        {community.membersCount} {community.membersCount === 1 ? 'member' : 'members'}
                                        <span className="text-emerald-500 font-bold"> · Joined</span>
                                    </p>
                                </div>

                                <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all">
                                    chevron_right
                                </span>
                            </div>
                        ))}

                        {communities.length > 3 && (
                            <button
                                onClick={() => setIsExpanded(prev => !prev)}
                                className="w-full py-2 px-3 mt-0.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors flex items-center justify-center gap-1 cursor-pointer border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/40"
                            >
                                <span>{isExpanded ? 'Show Less' : `Show More (${communities.length - 3})`}</span>
                                <span className="material-symbols-outlined text-[18px]">
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
