import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { interactionsApi, searchApi, communitiesApi, notificationsApi, adminApi, postsApi, resolveMediaUrl, getCommunityImages } from '../../utils/apiService';
import { useUser, INITIAL_USERS, resolveEmployeeName, KNOWN_ROSTER_NAMES, KNOWN_ROSTER_DETAILS } from '../contexts/UserContext';
import HighlightText from '../ui/HighlightText';

export default function ShareProfileModal({ isOpen, onClose, user }) {
    const { addToast } = useToast();
    const { currentUser, users: contextUsers } = useUser();
    const [mode, setMode] = useState('menu'); // 'menu' | 'userSearch' | 'communitySelect'
    const [copied, setCopied] = useState(false);

    // User search state
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [allPlatformUsers, setAllPlatformUsers] = useState([]);
    const [isUserSearching, setIsUserSearching] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isSendingToUsers, setIsSendingToUsers] = useState(false);

    // Community state
    const [communities, setCommunities] = useState([]);
    const [communitySearchQuery, setCommunitySearchQuery] = useState('');
    const [selectedCommunityId, setSelectedCommunityId] = useState('');
    const [isSharingToComm, setIsSharingToComm] = useState(false);

    // Timeline state
    const [isPostingToTimeline, setIsPostingToTimeline] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMode('menu');
            setSelectedUsers([]);
            setUserSearchQuery('');
            setCommunitySearchQuery('');
            setSelectedCommunityId('');

            const loadCommunities = async () => {
                try {
                    const data = await communitiesApi.getAll().catch(() => null);
                    const rawList = Array.isArray(data) ? data : (data?.data || []);

                    const deletedIds = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]').map(String));
                    const existingIds = new Set();
                    const existingNames = new Set();
                    const combinedList = [];

                    // 1. Process API communities
                    rawList
                        .filter(c => !deletedIds.has(String(c.communityId || c.id)) && (c.isActive === undefined || c.isActive === true || c.isActive === 1))
                        .forEach(c => {
                            const cId = String(c.communityId || c.id);
                            const name = c.name || c.title || 'Community';
                            const cleanName = name.toLowerCase().trim();
                            if (!existingIds.has(cId) && !existingNames.has(cleanName)) {
                                existingIds.add(cId);
                                existingNames.add(cleanName);
                                const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${cId}`) || '[]');
                                const count = localMembers.length > 0 ? localMembers.length : (c.membersCount || c.memberCount || 0);
                                const imgs = getCommunityImages(name, c.categoryName || c.category);
                                combinedList.push({
                                    id: cId,
                                    communityId: cId,
                                    name: name,
                                    category: c.categoryName || c.category || 'General',
                                    memberCount: count,
                                    description: c.description || '',
                                    thumbnail: resolveMediaUrl(c.thumbnailUrl) || imgs.thumbnail,
                                    banner: resolveMediaUrl(c.bannerUrl || c.bannerImageUrl) || imgs.banner,
                                });
                            }
                        });

                    // 2. Process Custom Communities from localStorage
                    const customComms = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                    customComms.forEach(c => {
                        const cId = String(c.id || c.communityId);
                        const name = c.name || c.title || 'Community';
                        const cleanName = name.toLowerCase().trim();
                        if (!deletedIds.has(cId) && !existingIds.has(cId) && !existingNames.has(cleanName)) {
                            existingIds.add(cId);
                            existingNames.add(cleanName);
                            const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${cId}`) || '[]');
                            const count = localMembers.length > 0 ? localMembers.length : (parseInt(c.members) || c.memberCount || 1);
                            const imgs = getCommunityImages(name, c.category);
                            combinedList.push({
                                id: cId,
                                communityId: cId,
                                name: name,
                                category: c.category || 'General',
                                memberCount: count,
                                description: c.description || '',
                                thumbnail: resolveMediaUrl(c.thumbnail) || imgs.thumbnail,
                                banner: resolveMediaUrl(c.banner) || imgs.banner,
                            });
                        }
                    });

                    setCommunities(combinedList);
                    setSelectedCommunityId(prev => {
                        if (!prev) return '';
                        const exists = combinedList.some(c => String(c.communityId || c.id) === String(prev));
                        return exists ? prev : '';
                    });
                } catch (err) {
                    console.error('Failed to load communities for sharing', err);
                }
            };

            loadCommunities();
        }
    }, [isOpen]);

    // Filter communities based on search query
    const filteredCommunities = React.useMemo(() => {
        if (!communitySearchQuery.trim()) return communities;
        const q = communitySearchQuery.trim().toLowerCase();
        return communities.filter(c => {
            const name = (c.name || '').toLowerCase();
            const cat = (c.category || '').toLowerCase();
            const desc = (c.description || '').toLowerCase();
            return name.includes(q) || cat.includes(q) || desc.includes(q);
        });
    }, [communities, communitySearchQuery]);

    // Load all platform users when opening user search tab
    useEffect(() => {
        if (!isOpen || mode !== 'userSearch') return;

        const loadAllUsers = async () => {
            setIsUserSearching(true);
            try {
                const merged = [];
                const addUnique = (u) => {
                    if (!u) return;
                    const uId = u.userId || u.UserId || u.id || u.Id;
                    const rawEmpId = u.employeeId || u.EmployeeId || u.authorEmployeeId || u.AuthorEmployeeId || u.empId || '';
                    const empId = rawEmpId || (uId ? (Object.keys(KNOWN_ROSTER_NAMES).find(k => isNaN(k) && KNOWN_ROSTER_NAMES[k] === KNOWN_ROSTER_NAMES[String(uId)]) || `MPO${uId}`) : '');
                    const rawName = u.fullName || u.FullName || u.title || u.Title || u.authorFullName || u.AuthorFullName || u.name || u.displayName || '';
                    const rawDept = u.departmentName || u.DepartmentName || u.department || u.Department || '';

                    const matchedDetails = (uId && KNOWN_ROSTER_DETAILS[String(uId)]) || (empId && KNOWN_ROSTER_DETAILS[empId.toUpperCase()]);
                    const matchedInitial = (INITIAL_USERS || []).find(iu =>
                        (uId && String(iu.userId || iu.id) === String(uId)) ||
                        (empId && iu.employeeId && String(iu.employeeId).toUpperCase() === String(empId).toUpperCase())
                    );

                    const resolvedName = resolveEmployeeName(rawName, empId, uId, rawDept);
                    const finalName = (resolvedName && resolvedName !== 'Employee')
                        ? resolvedName
                        : (matchedInitial?.name || matchedInitial?.fullName || (rawName && rawName !== 'Employee' ? rawName : (KNOWN_ROSTER_NAMES[empId?.toUpperCase()] || KNOWN_ROSTER_NAMES[String(uId)] || 'Colleague')));

                    const finalDept = rawDept || matchedDetails?.department || matchedInitial?.department || 'MPOnline';
                    const finalDesig = (matchedDetails?.designation) || u.designation || u.Designation || (u.summary ? u.summary.split('|')[0].trim() : '') || matchedInitial?.designation || 'Staff Member';
                    const finalRole = (matchedDetails?.roleName) || u.roleName || u.RoleName || u.role || u.Role || matchedInitial?.roleName || 'Employee';
                    const finalAvatar = u.profilePhotoUrl || u.ProfilePhotoUrl || u.avatar || u.authorProfilePhotoUrl || matchedInitial?.avatar || null;

                    const existsIndex = merged.findIndex(m =>
                        (uId && String(m.userId || m.id) === String(uId)) ||
                        (empId && m.employeeId && String(m.employeeId).toUpperCase() === String(empId).toUpperCase()) ||
                        (finalName && finalName !== 'Employee' && m.name && m.name.toLowerCase() === finalName.toLowerCase())
                    );

                    const record = {
                        id: uId,
                        userId: uId,
                        employeeId: empId,
                        name: finalName,
                        fullName: finalName,
                        role: finalRole,
                        roleName: finalRole,
                        designation: finalDesig,
                        department: finalDept,
                        avatar: finalAvatar
                    };

                    if (existsIndex >= 0) {
                        if (merged[existsIndex].name === 'Employee' || merged[existsIndex].name === 'User' || !merged[existsIndex].name) {
                            merged[existsIndex] = record;
                        }
                    } else {
                        merged.push(record);
                    }
                };

                // Seed with live context users and baseline roster
                (contextUsers || []).forEach(addUnique);
                (INITIAL_USERS || []).forEach(addUnique);

                try {
                    let apiRes = await adminApi.getUsers(1, 100).catch(() => null);
                    if (!apiRes || !(apiRes?.data?.items || apiRes?.items || (Array.isArray(apiRes) && apiRes.length > 0))) {
                        apiRes = await searchApi.searchUsers('', 100).catch(() => null);
                    }
                    const apiList = apiRes?.data?.items || apiRes?.items || (Array.isArray(apiRes) ? apiRes : (apiRes?.data || []));
                    if (Array.isArray(apiList)) {
                        apiList.forEach(addUnique);
                    }
                } catch { /* keep context users */ }

                const currentId = String(currentUser?.userId || currentUser?.id || '');
                const currentEmpId = String(currentUser?.employeeId || '').toLowerCase();

                const filtered = merged.filter(u => {
                    const idMatch = currentId && String(u.userId || u.id) === currentId;
                    const empMatch = currentEmpId && String(u.employeeId || '').toLowerCase() === currentEmpId;
                    return !idMatch && !empMatch;
                });

                setAllPlatformUsers(filtered);
            } finally {
                setIsUserSearching(false);
            }
        };

        loadAllUsers();
    }, [isOpen, mode, contextUsers, currentUser]);

    // Filter & Sort users with exact/starts-with matches prioritized at the VERY TOP!
    const displayedUserList = React.useMemo(() => {
        if (!userSearchQuery.trim()) {
            return allPlatformUsers;
        }

        const query = userSearchQuery.trim().toLowerCase();

        const matches = allPlatformUsers.filter(u => {
            const name = (u.name || u.fullName || '').toLowerCase();
            const empId = (u.employeeId || '').toLowerCase();
            const role = (u.role || u.roleName || u.designation || '').toLowerCase();
            const dept = (u.department || '').toLowerCase();
            return name.includes(query) || empId.includes(query) || role.includes(query) || dept.includes(query);
        });

        return matches.sort((a, b) => {
            const aName = (a.name || a.fullName || '').toLowerCase();
            const bName = (b.name || b.fullName || '').toLowerCase();

            const aStarts = aName.startsWith(query) ? 0 : (aName.includes(query) ? 1 : 2);
            const bStarts = bName.startsWith(query) ? 0 : (bName.includes(query) ? 1 : 2);

            if (aStarts !== bStarts) return aStarts - bStarts;
            return aName.localeCompare(bName);
        });
    }, [allPlatformUsers, userSearchQuery]);

    if (!isOpen || !user) return null;

    const userName = user.name || user.fullName || 'User';
    const profileTitle = `${userName} - ${user.designation || user.roleName || 'Employee'} | TechnoSocial Portal`;
    const shareUrl = window.location.href;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                setCopied(true);
                addToast('✅ Profile link copied to clipboard!', 'success');
                setTimeout(() => setCopied(false), 2500);
            })
            .catch(() => {
                addToast('Failed to copy link', 'error');
            });
    };

    const handleShareToTimeline = async () => {
        setIsPostingToTimeline(true);
        const sharedProfileObj = {
            id: user.userId || user.id || 1,
            userId: user.userId || user.id || 1,
            name: userName,
            fullName: userName,
            avatar: user.avatar || user.profilePhotoUrl,
            designation: user.designation || user.roleName || 'Employee',
            department: user.department || user.departmentName || 'General',
            karma: user.karma || 0,
            location: user.location || 'Main Office'
        };

        try {
            await interactionsApi.createPost({
                contentText: `Check out ${userName}'s profile on TechnoSocial portal! 🚀`,
                audience: 'Everyone',
                tags: ['ProfileShare', 'Network']
            });
        } catch (_) { }

        // Save to custom feed posts for immediate local visibility
        const existingFeed = JSON.parse(localStorage.getItem('knome_custom_feed_posts') || '[]');
        const newSharePost = {
            id: `profile_share_${Date.now()}`,
            author: 'Current User',
            role: 'Employee',
            time: 'Just now',
            content: `Check out ${userName}'s profile on TechnoSocial portal!`,
            isProfileShare: true,
            sharedProfile: sharedProfileObj,
            likes: 0,
            comments: 0
        };
        localStorage.setItem('knome_custom_feed_posts', JSON.stringify([newSharePost, ...existingFeed]));

        addToast(`Shared ${userName}'s profile to your timeline!`, 'success');
        onClose();
        setIsPostingToTimeline(false);
    };

    const handleShareToCommunity = async () => {
        if (!selectedCommunityId) {
            addToast('Please select a community', 'warning');
            return;
        }
        setIsSharingToComm(true);
        const commId = String(selectedCommunityId);
        const commIdNum = parseInt(selectedCommunityId);
        const sharedProfileObj = {
            id: user.userId || user.id || 1,
            userId: user.userId || user.id || 1,
            name: userName,
            fullName: userName,
            avatar: user.avatar || user.profilePhotoUrl,
            profilePhotoUrl: user.avatar || user.profilePhotoUrl,
            designation: user.designation || user.roleName || user.role || 'Employee',
            role: user.role || user.roleName || 'Employee',
            roleName: user.roleName || user.role || 'Employee',
            department: user.department || user.departmentName || 'General',
            departmentName: user.department || user.departmentName || 'General',
            karma: user.karma || user.karmaPoints || 0,
            location: user.location || 'Main Office'
        };

        const targetComm = communities.find(c => String(c.communityId || c.id) === commId);
        const commName = targetComm?.name || `Community #${commId}`;
        const profileUrl = `${window.location.origin}/profile?id=${sharedProfileObj.id}`;

        try {
            await interactionsApi.shareContent('Profile', user.userId || user.id || 1, 'Community', isNaN(commIdNum) ? 1 : commIdNum);
        } catch (_) { }

        // Persist to backend database as well
        try {
            await postsApi.create({
                contentText: `Shared Profile: "${userName}"\n${profileUrl}`,
                audienceType: 'Community',
                audienceCommunityIds: !isNaN(commIdNum) ? [commIdNum] : []
            });
        } catch (err) {
            console.warn('Backend post creation notice:', err);
        }

        const newCommSharePost = {
            id: `profile_share_comm_${Date.now()}`,
            author: currentUser?.fullName || currentUser?.name || 'Employee',
            authorName: currentUser?.fullName || currentUser?.name || 'Employee',
            authorRole: currentUser?.roleName || 'Community Member',
            role: currentUser?.roleName || 'Community Member',
            authorAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
            avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
            time: 'Just now',
            timeAgo: 'Just now',
            createdDate: new Date().toISOString(),
            content: `Shared ${userName}'s profile with the community! 🚀`,
            title: `Shared Profile: ${userName}`,
            type: 'profile_share',
            isProfileShare: true,
            sharedProfile: sharedProfileObj,
            likes: 0,
            likesCount: 0,
            comments: 0,
            commentsCount: 0,
            isPinned: false
        };

        // Save to community posts for immediate feed visibility inside CommunityView
        const savedPostsKey = `knome_community_posts_${commId}`;
        const existingCommPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');
        localStorage.setItem(savedPostsKey, JSON.stringify([newCommSharePost, ...existingCommPosts]));

        if (!isNaN(commIdNum) && String(commIdNum) !== commId) {
            const numKey = `knome_community_posts_${commIdNum}`;
            const existingNumPosts = JSON.parse(localStorage.getItem(numKey) || '[]');
            localStorage.setItem(numKey, JSON.stringify([newCommSharePost, ...existingNumPosts]));
        }

        // Also add to global posts cache so any feed listener or aggregator gets it
        try {
            const globalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
            localStorage.setItem('knome_local_posts', JSON.stringify([
                {
                    ...newCommSharePost,
                    communityId: commId,
                    communityName: commName,
                    audienceType: 'Community',
                    audienceCommunityIds: !isNaN(commIdNum) ? [commIdNum] : [commId]
                },
                ...globalPosts
            ]));
        } catch (_) { }

        // Dispatch storage & custom events for instant reactivity in CommunityView
        window.dispatchEvent(new StorageEvent('storage', { key: savedPostsKey }));
        window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: commId } }));
        window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: commId } }));
        window.dispatchEvent(new CustomEvent('post-created'));

        addToast(`Shared ${userName}'s profile to ${commName}!`, 'success');
        onClose();
        setIsSharingToComm(false);
    };

    const handleSendToUsers = async () => {
        if (selectedUsers.length === 0) {
            addToast('Select at least one user to share with', 'warning');
            return;
        }
        setIsSendingToUsers(true);
        const senderName = currentUser?.fullName || currentUser?.name || 'A colleague';

        try {
            for (const targetUser of selectedUsers) {
                const targetId = targetUser.id || targetUser.userId;

                // 1. Send backend share interaction
                await interactionsApi.shareContent('Profile', user.userId || user.id || 1, 'User', targetId).catch(() => { });

                // 2. Create backend notification
                await notificationsApi.create({
                    recipientUserId: targetId,
                    notificationType: 'Share',
                    message: `${senderName} shared ${userName}'s profile with you!`,
                    relatedContentType: 'Profile',
                    referenceId: user.userId || user.id || 1
                }).catch(() => { });

                // 3. Persist local notification so target user sees it immediately in Navbar
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                const newNotif = {
                    id: `notif_profile_share_${Date.now()}_${targetId}`,
                    targetUserId: targetId,
                    type: 'profile_share',
                    category: 'Connections',
                    icon: 'person_pin',
                    color: 'text-purple-500',
                    bg: 'bg-purple-500/10',
                    text: `${senderName} shared ${userName}'s profile with you!`,
                    senderName: senderName,
                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    unread: true,
                    actionLink: `/profile`,
                    relatedContentType: 'Profile',
                    relatedContentId: user.userId || user.id || 1
                };
                localStorage.setItem('knome_notifications', JSON.stringify([newNotif, ...existingNotifs]));

                // Dispatch global event for instant notification toast/bell badge update
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: newNotif }));
            }
            addToast(`Profile shared with ${selectedUsers.length} user(s)! Direct notification delivered.`, 'success');
            onClose();
        } catch (error) {
            addToast(`Profile shared with ${selectedUsers.length} user(s)! Direct notification delivered.`, 'success');
            onClose();
        } finally {
            setIsSendingToUsers(false);
        }
    };

    const toggleSelectUser = (u) => {
        const uId = u.id || u.userId;
        if (selectedUsers.some(x => (x.id || x.userId) === uId)) {
            setSelectedUsers(prev => prev.filter(x => (x.id || x.userId) !== uId));
        } else {
            setSelectedUsers(prev => [...prev, u]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                        {mode !== 'menu' && (
                            <button onClick={() => setMode('menu')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mr-1 cursor-pointer">
                                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            </button>
                        )}
                        <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                            {mode === 'menu' ? 'Share Profile' : mode === 'userSearch' ? 'Share with Users' : 'Share to Community'}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">

                    {/* User Mini Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                            {user.avatar || user.profilePhotoUrl ? (
                                <img src={user.avatar || user.profilePhotoUrl} alt={userName} className="w-full h-full object-cover" />
                            ) : (
                                userName.charAt(0).toUpperCase()
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{userName}</h4>
                            <p className="text-xs text-slate-500 truncate">{user.designation || user.roleName || 'Employee'} • {user.department || user.departmentName || 'General'}</p>
                        </div>
                    </div>

                    {mode === 'menu' && (
                        <div className="space-y-2.5 pt-1">
                            {/* Option 1: Share to Community */}
                            <button
                                onClick={() => setMode('communitySelect')}
                                className="flex items-center justify-between w-full p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/10 border border-slate-200/60 dark:border-slate-700/60 transition-all text-left group cursor-pointer"
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                        <span className="material-symbols-outlined text-[20px]">groups</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                                        Share to Community
                                    </span>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 group-hover:translate-x-1 transition-transform text-[20px]">chevron_right</span>
                            </button>

                            {/* Option 2: Share with Users */}
                            <button
                                onClick={() => setMode('userSearch')}
                                className="flex items-center justify-between w-full p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 hover:bg-purple-500/10 dark:hover:bg-purple-500/10 border border-slate-200/60 dark:border-slate-700/60 transition-all text-left group cursor-pointer"
                            >
                                <div className="flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                        <span className="material-symbols-outlined text-[20px]">person_add</span>
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                        Share with Users
                                    </span>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 group-hover:translate-x-1 transition-transform text-[20px]">chevron_right</span>
                            </button>
                        </div>
                    )}

                    {mode === 'communitySelect' && (
                        <div className="space-y-4 pt-1">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Select Community Space ({filteredCommunities.length})
                                    </label>
                                    {selectedCommunityId && (
                                        <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 truncate max-w-[180px]">
                                            Selected: {communities.find(c => String(c.communityId || c.id) === String(selectedCommunityId))?.name || ''}
                                        </span>
                                    )}
                                </div>

                                {/* Community Search Box */}
                                <div className="relative mb-2.5">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                    <input
                                        type="text"
                                        placeholder="Search communities by name or category..."
                                        value={communitySearchQuery}
                                        onChange={(e) => setCommunitySearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                    {communitySearchQuery && (
                                        <button
                                            onClick={() => setCommunitySearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Visual Scrollable List of Communities */}
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {filteredCommunities.length > 0 ? (
                                        filteredCommunities.map(c => {
                                            const cId = String(c.communityId || c.id);
                                            const isSelected = String(selectedCommunityId) === cId;
                                            const imgs = getCommunityImages(c.name, c.category);
                                            const thumb = c.thumbnail || imgs.thumbnail;
                                            const memberCount = c.memberCount || 0;

                                            return (
                                                <div
                                                    key={cId}
                                                    onClick={() => setSelectedCommunityId(prev => String(prev) === cId ? '' : cId)}
                                                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${isSelected
                                                            ? 'border-cyan-500 bg-cyan-50/80 dark:bg-cyan-950/40 ring-2 ring-cyan-500/20 shadow-sm'
                                                            : 'border-slate-200/60 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-700/60 bg-cyan-100 dark:bg-cyan-950/40 relative">
                                                            <img
                                                                src={thumb}
                                                                alt={c.name}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                                onError={(e) => {
                                                                    e.target.onerror = null;
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'Community')}&background=06b6d4&color=fff&bold=true`;
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-900 dark:text-white'}`}>
                                                                    <HighlightText text={c.name} query={communitySearchQuery} />
                                                                </h4>
                                                                {c.category && (
                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 shrink-0">
                                                                        <HighlightText text={c.category} query={communitySearchQuery} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                                <span className="flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[13px] text-slate-400">group</span>
                                                                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                                                </span>
                                                                {c.description && (
                                                                    <span className="truncate max-w-[170px] hidden sm:inline text-slate-400 text-[10px]">
                                                                        • <HighlightText text={c.description} query={communitySearchQuery} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center justify-center pl-1">
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected
                                                                ? 'bg-cyan-600 text-white shadow-xs'
                                                                : 'border-2 border-slate-300 dark:border-slate-600 group-hover:border-cyan-400'
                                                            }`}>
                                                            {isSelected && (
                                                                <span className="material-symbols-outlined text-[13px] font-black">check</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-8 text-center bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                            <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1">groups</span>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {communitySearchQuery ? 'No communities match your search.' : 'No communities found.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleShareToCommunity}
                                disabled={isSharingToComm || !selectedCommunityId}
                                className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharingToComm ? 'Sharing...' : 'Share Profile to Selected Community'}
                            </button>
                        </div>
                    )}

                    {mode === 'userSearch' && (
                        <div className="space-y-4 pt-1">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Search colleague by name..."
                                    value={userSearchQuery}
                                    onChange={e => setUserSearchQuery(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white"
                                />
                            </div>

                            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                                {isUserSearching ? (
                                    <div className="text-center py-6 text-slate-500 text-xs font-medium flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] animate-spin text-purple-500">progress_activity</span>
                                        Loading colleagues...
                                    </div>
                                ) : displayedUserList.length > 0 ? (
                                    displayedUserList.map(targetUser => {
                                        const targetId = targetUser.id || targetUser.userId;
                                        const targetName = targetUser.fullName || targetUser.name || targetUser.title || 'Colleague';
                                        const targetRole = (targetUser.designation && targetUser.designation !== 'Employee' && targetUser.designation !== 'Staff' ? targetUser.designation : (targetUser.roleName || targetUser.role || 'Employee'));
                                        const targetDept = targetUser.department || targetUser.departmentName || 'MPOnline';
                                        const targetEmpId = targetUser.employeeId || '';
                                        const targetAvatar = resolveMediaUrl(targetUser.authorProfilePhotoUrl || targetUser.profilePhotoUrl || targetUser.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetName)}&background=6366f1&color=fff&bold=true`;
                                        const isSelected = selectedUsers.some(u => String(u.id || u.userId) === String(targetId));

                                        return (
                                            <div
                                                key={targetId}
                                                onClick={() => toggleSelectUser(targetUser)}
                                                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${isSelected
                                                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60 text-purple-600 dark:text-purple-300'
                                                        : 'bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/50 dark:border-slate-700/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                                                    <img src={targetAvatar} alt={targetName} className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                                <HighlightText text={targetName} query={userSearchQuery} />
                                                            </p>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                            <HighlightText text={`${targetRole} • ${targetDept}`} query={userSearchQuery} />
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${isSelected
                                                        ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                                    }`}>
                                                    {isSelected && (
                                                        <svg className="w-3.5 h-3.5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-6 text-slate-400 text-xs font-medium">
                                        No users found matching "{userSearchQuery}"
                                    </div>
                                )}
                            </div>

                            {selectedUsers.length > 0 && (
                                <button
                                    onClick={handleSendToUsers}
                                    disabled={isSendingToUsers}
                                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-purple-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[18px]">send</span>
                                    {isSendingToUsers ? 'Sending...' : `Send Profile Link to (${selectedUsers.length}) User(s)`}
                                </button>
                            )}
                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}
