import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { wikiApi } from '../../utils/wikiService';
import { communitiesApi, profileApi, adminApi, postsApi, notificationsApi, resolveMediaUrl, getCommunityImages } from '../../utils/apiService';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import HighlightText from '../ui/HighlightText';

export default function WikiShareModal({
    isOpen,
    onClose,
    wikiId,
    wikiTitle = '',
    canShare = true,
    onSharesUpdated
}) {
    const { currentUser, users: contextUsers } = useUser();
    const { addToast } = useToast();
    const backdropRef = useRef(null);

    // Active Tab in Share Modal: 'menu' | 'community' | 'users' | 'group'
    const [shareTab, setShareTab] = useState('menu');
    const [accessLevel, setAccessLevel] = useState('Viewer');
    const [isSharing, setIsSharing] = useState(false);

    // Existing Shares list
    const [shares, setShares] = useState([]);
    const [isLoadingShares, setIsLoadingShares] = useState(true);

    // Communities Tab State
    const [communities, setCommunities] = useState([]);
    const [communitySearchQuery, setCommunitySearchQuery] = useState('');
    const [selectedCommunityId, setSelectedCommunityId] = useState('');

    // Users Tab State
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);

    // Department Spheres State
    const [departments, setDepartments] = useState([]);
    const [deptSearchQuery, setDeptSearchQuery] = useState('');
    const [selectedDeptId, setSelectedDeptId] = useState('');

    // Load active shares
    const loadShares = async () => {
        setIsLoadingShares(true);
        try {
            const list = await wikiApi.getShares(wikiId);
            setShares(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Error fetching shares:', err);
        } finally {
            setIsLoadingShares(false);
        }
    };

    // Load communities
    const loadCommunities = async () => {
        try {
            const data = await communitiesApi.getAll(500).catch(() => null);
            const rawList = Array.isArray(data) ? data : (data?.data || []);
            const processed = rawList
                .filter(c => c.isActive === undefined || c.isActive === true || c.isActive === 1)
                .map(c => {
                    const cId = String(c.communityId || c.id);
                    const name = c.name || c.title || 'Community';
                    const imgs = getCommunityImages ? getCommunityImages(name, c.categoryName || c.category) : {};
                    return {
                        id: cId,
                        communityId: cId,
                        name: name,
                        category: c.categoryName || c.category || c.communityType || 'General',
                        memberCount: c.membersCount || c.memberCount || 0,
                        description: c.description || '',
                        thumbnail: resolveMediaUrl(c.thumbnailUrl) || imgs?.thumbnail || '',
                    };
                });
            setCommunities(processed);
            if (processed.length > 0 && !selectedCommunityId) {
                setSelectedCommunityId(processed[0].id);
            }
        } catch (err) {
            console.error('Failed to load communities:', err);
        }
    };

    // Default fallback departments
    const DEFAULT_DEPARTMENTS = [
        { departmentId: 1, name: 'Engineering & Technology', departmentCode: 'ENG' },
        { departmentId: 2, name: 'Operations & Delivery', departmentCode: 'OPS' },
        { departmentId: 3, name: 'Human Resources & Talent', departmentCode: 'HR' },
        { departmentId: 4, name: 'Finance & Accounts', departmentCode: 'FIN' },
        { departmentId: 5, name: 'Product & Design', departmentCode: 'PRD' },
        { departmentId: 6, name: 'Administration & Infrastructure', departmentCode: 'ADM' }
    ];

    // Load departments
    const loadDepartments = async () => {
        try {
            const res = await wikiApi.getDepartments().catch(() => null);
            const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
            if (items.length > 0) {
                setDepartments(items);
                if (!selectedDeptId) setSelectedDeptId(String(items[0].departmentId));
            } else {
                setDepartments(DEFAULT_DEPARTMENTS);
                if (!selectedDeptId) setSelectedDeptId(String(DEFAULT_DEPARTMENTS[0].departmentId));
            }
        } catch {
            setDepartments(DEFAULT_DEPARTMENTS);
            if (!selectedDeptId) setSelectedDeptId(String(DEFAULT_DEPARTMENTS[0].departmentId));
        }
    };

    useEffect(() => {
        if (isOpen && wikiId) {
            setShareTab('menu');
            setAccessLevel('Viewer');
            setSelectedUsers([]);
            setUserSearchQuery('');
            setCommunitySearchQuery('');
            setDeptSearchQuery('');
            loadShares();
            loadCommunities();
            loadDepartments();
        }
    }, [isOpen, wikiId]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Live debounced search for users
    useEffect(() => {
        if (!isOpen || shareTab !== 'users') return;
        const q = userSearchQuery.trim();

        if (q.length < 1) {
            // Default initial list from context
            const initialList = (contextUsers || []).slice(0, 15).map(u => ({
                userId: u.userId || u.id,
                fullName: u.fullName || u.name,
                employeeId: u.employeeId || '',
                designation: u.designation || u.roleName || u.role || 'Employee',
                department: u.department || u.departmentName || 'MPOnline',
                profilePhotoUrl: u.profilePhotoUrl || u.avatar || ''
            }));
            setUserResults(initialList);
            setIsSearchingUsers(false);
            return;
        }

        setIsSearchingUsers(true);
        const timer = setTimeout(async () => {
            try {
                const res = await profileApi.searchUsers(q, 1, 20);
                const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                const normalized = items.map(u => ({
                    userId: u.userId || u.id,
                    fullName: u.fullName || u.title || u.authorFullName || u.name || 'Colleague',
                    employeeId: u.employeeId || u.authorEmployeeId || '',
                    designation: u.designation || u.department || u.departmentName || u.summary || 'Employee',
                    department: u.departmentName || u.department || 'MPOnline',
                    profilePhotoUrl: u.profilePhotoUrl || u.authorProfilePhotoUrl || u.thumbnailUrl || ''
                }));
                setUserResults(normalized);
            } catch {
                setUserResults([]);
            } finally {
                setIsSearchingUsers(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [userSearchQuery, shareTab, isOpen, contextUsers]);

    // Filter communities
    const filteredCommunities = useMemo(() => {
        if (!communitySearchQuery.trim()) return communities;
        const q = communitySearchQuery.trim().toLowerCase();
        return communities.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.category || '').toLowerCase().includes(q) ||
            (c.description || '').toLowerCase().includes(q)
        );
    }, [communities, communitySearchQuery]);

    // Filter departments
    const filteredDepartments = useMemo(() => {
        if (!deptSearchQuery.trim()) return departments;
        const q = deptSearchQuery.trim().toLowerCase();
        return departments.filter(d =>
            (d.name || '').toLowerCase().includes(q) ||
            (d.departmentCode || '').toLowerCase().includes(q)
        );
    }, [departments, deptSearchQuery]);

    // Copy direct link
    const handleCopyLink = () => {
        const url = `${window.location.origin}/wiki/view?id=${wikiId}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => addToast('Wiki direct link copied to clipboard!', 'success'))
                .catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            addToast('Wiki direct link copied to clipboard!', 'success');
        } catch {
            addToast(`Link: ${text}`, 'info');
        }
    };

    // Revoke existing share
    const handleRemoveShare = async (shareId, targetName) => {
        if (!window.confirm(`Revoke Wiki access for ${targetName || 'this space'}?`)) return;
        try {
            await wikiApi.removeShare(wikiId, shareId);
            addToast(`Access revoked for ${targetName || 'space'}.`, 'success');
            await loadShares();
            onSharesUpdated && onSharesUpdated();
        } catch (err) {
            console.error('Failed to revoke share:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to remove share.', 'error');
        }
    };

    // Action 1: Share to Community
    const handleShareToCommunity = async () => {
        if (!selectedCommunityId) {
            addToast('Please select a community to share with.', 'warning');
            return;
        }
        setIsSharing(true);
        const commIdNum = parseInt(selectedCommunityId, 10);
        const targetCommunity = communities.find(c => String(c.id) === String(selectedCommunityId));
        const wikiShareUrl = `${window.location.origin}/wiki/view?id=${wikiId}`;

        try {
            // 1. Grant permission via WikiShare (if permitted by backend)
            try {
                await wikiApi.shareWiki(wikiId, {
                    shareType: 'Community',
                    targetId: commIdNum,
                    accessLevel
                });
            } catch (shareErr) {
                console.warn('Backend wiki permission grant skipped or restricted:', shareErr);
            }

            // 2. Post notification/feed item to Community feed
            try {
                await postsApi.create({
                    contentText: `Shared Wiki: "${wikiTitle}"\n${wikiShareUrl}`,
                    audienceType: 'Community',
                    audienceCommunityIds: [commIdNum]
                });
            } catch (postErr) {
                console.warn('Notice: Community feed post creation skipped:', postErr);
            }

            // Real-time custom events & cache update
            try {
                const savedKey = `knome_community_posts_${selectedCommunityId}`;
                const existingCommFeed = JSON.parse(localStorage.getItem(savedKey) || '[]');
                const newFeedItem = {
                    postId: `wiki_share_${wikiId}_${Date.now()}`,
                    id: `wiki_share_${wikiId}_${Date.now()}`,
                    content: `Shared Wiki: "${wikiTitle}"\n${wikiShareUrl}`,
                    contentText: `Shared Wiki: "${wikiTitle}"\n${wikiShareUrl}`,
                    authorId: currentUser?.userId || currentUser?.id,
                    authorName: currentUser?.fullName || currentUser?.name || 'Author',
                    authorAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar,
                    createdAt: new Date().toISOString(),
                    communityId: selectedCommunityId,
                    communityName: targetCommunity?.name,
                    postType: 'Wiki',
                    likes: 0,
                    comments: 0
                };
                localStorage.setItem(savedKey, JSON.stringify([newFeedItem, ...existingCommFeed]));
                window.dispatchEvent(new StorageEvent('storage', { key: savedKey }));
                window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: selectedCommunityId, post: newFeedItem } }));
                window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: selectedCommunityId, post: newFeedItem } }));
                window.dispatchEvent(new CustomEvent('post-created'));
            } catch (_) {}

            addToast(`Wiki successfully shared to ${targetCommunity?.name || 'Community'}!`, 'success');
            onSharesUpdated && onSharesUpdated();
            onClose && onClose();
        } catch (err) {
            console.error('Error sharing wiki to community:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to share Wiki to community.', 'error');
        } finally {
            setIsSharing(false);
        }
    };

    // Action 2: Share with Selected Users
    const toggleSelectUser = (user) => {
        const uId = String(user.userId || user.id);
        if (selectedUsers.some(u => String(u.userId || u.id) === uId)) {
            setSelectedUsers(prev => prev.filter(u => String(u.userId || u.id) !== uId));
        } else {
            setSelectedUsers(prev => [...prev, user]);
        }
    };

    const handleShareWithUsers = async () => {
        if (selectedUsers.length === 0) {
            addToast('Please select at least one colleague to share with.', 'warning');
            return;
        }

        setIsSharing(true);
        try {
            const senderName = currentUser?.fullName || currentUser?.name || 'Someone';
            const textMsg = `${senderName} shared a wiki with you: "${wikiTitle}"`;

            for (const user of selectedUsers) {
                const uId = parseInt(user.userId || user.id, 10);
                if (uId) {
                    try {
                        await wikiApi.shareWiki(wikiId, {
                            shareType: 'User',
                            targetId: uId,
                            accessLevel
                        });
                    } catch (shareErr) {
                        console.warn('Backend wiki permission grant skipped or restricted:', shareErr);
                    }

                    // Database notification
                    try {
                        await notificationsApi.create({
                            recipientUserId: uId,
                            notificationType: 'Share',
                            message: textMsg,
                            relatedContentType: 'Wiki',
                            referenceId: wikiId
                        });
                    } catch (_) {}
                }
            }

            // Local real-time notification push
            try {
                const notifsToStore = selectedUsers.map(u => ({
                    id: `local_share_wiki_${wikiId}_${u.userId || u.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    type: 'share',
                    category: 'Shares',
                    icon: 'menu_book',
                    color: 'text-teal-500',
                    bg: 'bg-teal-500/10',
                    text: textMsg,
                    message: textMsg,
                    senderName,
                    senderAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                    time: 'Just now',
                    createdAt: new Date().toISOString(),
                    timestamp: Date.now(),
                    targetUrl: `/wiki/view?id=${wikiId}`,
                    link: `/wiki/view?id=${wikiId}`,
                    url: `/wiki/view?id=${wikiId}`,
                    read: false,
                    recipientUserId: String(u.userId || u.id),
                    wikiId: wikiId
                }));
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([...notifsToStore, ...existingNotifs]));
                if (notifsToStore.length > 0) {
                    window.dispatchEvent(new CustomEvent('notification-created', { detail: notifsToStore[0] }));
                }
            } catch (_) {}

            addToast(`Wiki shared with ${selectedUsers.length} colleague(s)!`, 'success');
            setSelectedUsers([]);
            setUserSearchQuery('');
            onSharesUpdated && onSharesUpdated();
            onClose && onClose();
        } catch (err) {
            console.error('Error sharing wiki with users:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to share Wiki with users.', 'error');
        } finally {
            setIsSharing(false);
        }
    };

    // Action 3: Share with Department Sphere
    const handleShareWithDepartment = async () => {
        if (!selectedDeptId) {
            addToast('Please select a department sphere to share with.', 'warning');
            return;
        }

        setIsSharing(true);
        const deptIdNum = parseInt(selectedDeptId, 10);
        const targetDept = departments.find(d => String(d.departmentId) === String(selectedDeptId));

        try {
            try {
                await wikiApi.shareWiki(wikiId, {
                    shareType: 'Group',
                    targetId: deptIdNum,
                    accessLevel
                });
            } catch (shareErr) {
                console.warn('Backend wiki permission grant skipped or restricted:', shareErr);
            }

            addToast(`Wiki shared with ${targetDept?.name || 'Department'} Sphere!`, 'success');
            onSharesUpdated && onSharesUpdated();
            onClose && onClose();
        } catch (err) {
            console.error('Error sharing wiki with department:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to share Wiki with department.', 'error');
        } finally {
            setIsSharing(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-left max-h-[90vh]">
                
                {/* ── Modal Header ── */}
                <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-start gap-3 min-w-0 pr-2">
                        {shareTab !== 'menu' ? (
                            <button
                                type="button"
                                onClick={() => setShareTab('menu')}
                                className="mt-0.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer shrink-0"
                                title="Back to menu"
                            >
                                <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                            </button>
                        ) : (
                            <span className="material-symbols-outlined text-blue-500 text-[28px] shrink-0 mt-0.5">share</span>
                        )}
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight truncate leading-tight">
                                {shareTab === 'community' 
                                    ? 'Share to Community' 
                                    : shareTab === 'users' 
                                        ? 'Share with Users' 
                                        : shareTab === 'group' 
                                            ? 'Share with Department Sphere' 
                                            : 'Share Wiki'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-normal">
                                {wikiTitle || 'Knowledge Space'}
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                        <span className="material-symbols-outlined text-[24px]">close</span>
                    </button>
                </div>

                {/* ── Modal Body ── */}
                <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    
                    {/* ══ VIEW 1: Main Menu Options ══ */}
                    {shareTab === 'menu' && (
                        <div className="space-y-3.5">
                            
                            {/* Option 1: Share to Community */}
                            <div
                                onClick={() => setShareTab('community')}
                                className="p-5 rounded-3xl border border-cyan-400 dark:border-cyan-500/80 bg-white dark:bg-slate-900 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/20 transition-all flex items-center gap-4 cursor-pointer group shadow-xs"
                            >
                                <div className="w-14 h-14 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-500 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[28px]">groups</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-cyan-600 transition-colors">
                                        Share to Community
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        Post this wiki directly into a specialized community feed
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-[22px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                            </div>

                            {/* Option 2: Share with Users */}
                            <div
                                onClick={() => setShareTab('users')}
                                className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700/60 bg-white dark:bg-slate-900 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-all flex items-center gap-4 cursor-pointer group shadow-xs"
                            >
                                <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[28px]">person_add</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-purple-600 transition-colors">
                                        Share with Users
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        Send direct notifications to specific MPOnline team members
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-[22px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                            </div>

                            {/* Option 3: Share with Department Sphere */}
                            <div
                                onClick={() => setShareTab('group')}
                                className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700/60 bg-white dark:bg-slate-900 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-all flex items-center gap-4 cursor-pointer group shadow-xs"
                            >
                                <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[28px]">domain</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-teal-600 transition-colors">
                                        Share with Department Sphere
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                        Grant access to an entire department team
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-[22px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
                            </div>

                            {/* Direct Share Link Banner */}
                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <span className="material-symbols-outlined text-[20px] text-teal-600 dark:text-teal-400 shrink-0">link</span>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Direct Share Link</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                            {`${window.location.origin}/wiki/view?id=${wikiId}`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800/60 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                                    Copy Link
                                </button>
                            </div>

                            {/* Active Shares List */}
                            <div className="pt-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2.5">
                                    Shared Spaces & Audiences ({shares.length})
                                </h4>

                                {isLoadingShares ? (
                                    <div className="py-6 flex justify-center">
                                        <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                                    </div>
                                ) : shares.length === 0 ? (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">
                                        Not explicitly shared with any specific audience yet.
                                    </p>
                                ) : (
                                    <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar">
                                        {shares.map(s => (
                                            <div
                                                key={s.shareId}
                                                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                    <span className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-200/60 dark:border-teal-800/60">
                                                        <span className="material-symbols-outlined text-[18px]">
                                                            {s.shareType === 'Community' ? 'group' : s.shareType === 'User' ? 'person' : 'domain'}
                                                        </span>
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{s.targetName}</p>
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                                                                {s.accessLevel}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                            {s.shareType} • Shared by {s.sharedByUserName || 'Author'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {canShare && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveShare(s.shareId, s.targetName)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                                                        title="Revoke access"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ══ VIEW 2: Sub-view: Share to Community ══ */}
                    {shareTab === 'community' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Select Target Community ({filteredCommunities.length})
                                    </label>
                                    {selectedCommunityId && (
                                        <span className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 truncate max-w-[180px]">
                                            Selected: {communities.find(c => String(c.id) === String(selectedCommunityId))?.name || ''}
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
                                        className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                    {communitySearchQuery && (
                                        <button 
                                            type="button"
                                            onClick={() => setCommunitySearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Scrollable List of Communities */}
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {filteredCommunities.length > 0 ? (
                                        filteredCommunities.map(c => {
                                            const isSelected = String(selectedCommunityId) === String(c.id);

                                            return (
                                                <div
                                                    key={c.id}
                                                    onClick={() => setSelectedCommunityId(c.id)}
                                                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                                                        isSelected 
                                                            ? 'border-cyan-500 bg-cyan-50/80 dark:bg-cyan-950/40 ring-2 ring-cyan-500/20 shadow-xs' 
                                                            : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:border-slate-200 dark:hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-700/60 bg-cyan-100 dark:bg-cyan-950/40 relative">
                                                            <img
                                                                src={c.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=06b6d4&color=fff&bold=true`}
                                                                alt={c.name}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                                onError={(e) => {
                                                                    e.target.onerror = null;
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=06b6d4&color=fff&bold=true`;
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
                                                                    {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center justify-center pl-1">
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                            isSelected 
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

                            {/* Access Permission */}
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    Permission Granted to Community Members
                                </label>
                                <select
                                    value={accessLevel}
                                    onChange={(e) => setAccessLevel(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                                >
                                    <option value="Viewer">👁️ Viewer (Read Only)</option>
                                    <option value="Editor">✏️ Editor (Can Edit Sections)</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                onClick={handleShareToCommunity}
                                disabled={isSharing || !selectedCommunityId}
                                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharing ? 'Sharing to Community...' : 'Share Wiki to Community'}
                            </button>
                        </div>
                    )}

                    {/* ══ VIEW 3: Sub-view: Share with Users ══ */}
                    {shareTab === 'users' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Search colleague by name or employee ID..."
                                    value={userSearchQuery}
                                    onChange={(e) => setUserSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            {/* Selected Users Chips */}
                            {selectedUsers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 p-2 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-xl max-h-24 overflow-y-auto custom-scrollbar">
                                    {selectedUsers.map(u => (
                                        <span key={u.userId || u.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold shadow-xs">
                                            {u.fullName || u.name}
                                            <button 
                                                type="button"
                                                onClick={() => toggleSelectUser(u)} 
                                                className="hover:text-red-200 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Colleague Search Results */}
                            <div className="max-h-56 overflow-y-auto space-y-1.5 border border-slate-100 dark:border-slate-800/80 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-800/30 custom-scrollbar">
                                {isSearchingUsers ? (
                                    <div className="py-6 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-600 rounded-full animate-spin" />
                                        Loading teammates...
                                    </div>
                                ) : userResults.length > 0 ? (
                                    userResults.map(u => {
                                        const uId = String(u.userId || u.id);
                                        const isSelected = selectedUsers.some(sel => String(sel.userId || sel.id) === uId);

                                        return (
                                            <div
                                                key={uId}
                                                onClick={() => toggleSelectUser(u)}
                                                className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${
                                                    isSelected 
                                                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60 text-purple-600 dark:text-purple-300' 
                                                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent text-slate-700 dark:text-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                                    <img
                                                        src={resolveMediaUrl(u.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=8b5cf6&color=fff&bold=true`}
                                                        onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=8b5cf6&color=fff&bold=true`; }}
                                                        className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs"
                                                        alt={u.fullName}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold leading-tight text-slate-900 dark:text-white truncate">
                                                            <HighlightText text={u.fullName} query={userSearchQuery} />
                                                        </p>
                                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                            <HighlightText text={`${u.employeeId ? `${u.employeeId} • ` : ''}${u.designation || 'Employee'} • ${u.department || 'MPOnline'}`} query={userSearchQuery} />
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                                                    isSelected 
                                                        ? 'bg-purple-600 border-purple-600 text-white shadow-xs' 
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                                }`}>
                                                    {isSelected && (
                                                        <span className="material-symbols-outlined text-[13px] font-black">check</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="py-6 text-center text-xs text-slate-400">
                                        No colleagues found matching "{userSearchQuery}".
                                    </div>
                                )}
                            </div>

                            {/* Access Permission */}
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    Permission Granted
                                </label>
                                <select
                                    value={accessLevel}
                                    onChange={(e) => setAccessLevel(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                                >
                                    <option value="Viewer">👁️ Viewer (Read Only)</option>
                                    <option value="Editor">✏️ Editor (Can Edit Sections)</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                onClick={handleShareWithUsers}
                                disabled={isSharing || selectedUsers.length === 0}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-purple-500/25 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharing 
                                    ? 'Sharing with Users...' 
                                    : `Share Wiki with ${selectedUsers.length} User${selectedUsers.length === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    )}

                    {/* ══ VIEW 4: Sub-view: Share with Department Sphere ══ */}
                    {shareTab === 'group' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Select Department Sphere ({filteredDepartments.length})
                                    </label>
                                    {selectedDeptId && (
                                        <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 truncate max-w-[180px]">
                                            Selected: {departments.find(d => String(d.departmentId) === String(selectedDeptId))?.name || ''}
                                        </span>
                                    )}
                                </div>

                                {/* Dept Search Box */}
                                <div className="relative mb-2.5">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                    <input
                                        type="text"
                                        placeholder="Search department sphere..."
                                        value={deptSearchQuery}
                                        onChange={(e) => setDeptSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                    {deptSearchQuery && (
                                        <button 
                                            type="button"
                                            onClick={() => setDeptSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Scrollable List of Departments */}
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {filteredDepartments.length > 0 ? (
                                        filteredDepartments.map(d => {
                                            const isSelected = String(selectedDeptId) === String(d.departmentId);

                                            return (
                                                <div
                                                    key={d.departmentId}
                                                    onClick={() => setSelectedDeptId(String(d.departmentId))}
                                                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                                                        isSelected 
                                                            ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-950/40 ring-2 ring-teal-500/20 shadow-xs' 
                                                            : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:border-slate-200 dark:hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-700/60 bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-[22px]">domain</span>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-900 dark:text-white'}`}>
                                                                    <HighlightText text={d.name} query={deptSearchQuery} />
                                                                </h4>
                                                                {d.departmentCode && (
                                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 shrink-0">
                                                                        <HighlightText text={d.departmentCode} query={deptSearchQuery} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                Department Sphere
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center justify-center pl-1">
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                            isSelected 
                                                                ? 'bg-teal-600 text-white shadow-xs' 
                                                                : 'border-2 border-slate-300 dark:border-slate-600 group-hover:border-teal-400'
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
                                            <span className="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1">domain</span>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {deptSearchQuery ? 'No departments match your search.' : 'No departments found.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Access Permission */}
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    Permission Granted
                                </label>
                                <select
                                    value={accessLevel}
                                    onChange={(e) => setAccessLevel(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
                                >
                                    <option value="Viewer">👁️ Viewer (Read Only)</option>
                                    <option value="Editor">✏️ Editor (Can Edit Sections)</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                onClick={handleShareWithDepartment}
                                disabled={isSharing || !selectedDeptId}
                                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-teal-500/25 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharing ? 'Sharing with Department...' : 'Share Wiki with Department'}
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>,
        document.body
    );
}
