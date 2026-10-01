import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, INITIAL_USERS, deduplicateMembers } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import CreateCommunityModal from '../components/modals/CreateCommunityModal';
import { communitiesApi, getCommunityImages, resolveMediaUrl, DEFAULT_ENTERPRISE_COMMUNITIES } from '../utils/apiService';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

const defaultSeeds = [];

const getInitialCommunities = () => [];

export const formatCommunityType = (type) => {
    const t = String(type || '').trim().toLowerCase();
    if (t.includes('default') || t.includes('org')) return 'Org';
    if (t.includes('private')) return 'Private';
    return 'Public';
};

export default function Communities() {
    const { currentUser, users } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('Discover');

    const [communities, setCommunities] = useState(() => getInitialCommunities(currentUser?.id));
    const [pendingApprovals, setPendingApprovals] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const EXCLUDED_CATEGORIES = React.useMemo(() => new Set([
        'company culture',
        'culture & hr',
        'culture & hr hub',
        'culture',
        'hobbies',
        'leadership',
        'marketing',
        'operations',
        'product management'
    ]), []);

    const [availableCategories, setAvailableCategories] = useState([
        { id: 8, name: 'Design' },
        { id: 7, name: 'Engineering' },
        { id: 1019, name: 'Finance' },
        { id: 1014, name: 'General' },
        { id: 1016, name: 'Product & Design' },
        { id: 1, name: 'Technology' }
    ]);
    const [approvalSuccessMsg, setApprovalSuccessMsg] = useState('');
    const [successPopup, setSuccessPopup] = useState(null);

    React.useEffect(() => {
        communitiesApi.getCategories()
            .then(res => {
                const list = res?.data !== undefined ? res.data : res;
                if (Array.isArray(list) && list.length > 0) {
                    const filtered = list.filter(c => !EXCLUDED_CATEGORIES.has((c.name || '').toLowerCase().trim()));
                    setAvailableCategories(filtered);
                }
            })
            .catch(() => {});
    }, [EXCLUDED_CATEGORIES]);

    const isHRorAdmin = ['SYSADM', 'HRADM', 'CADM', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'HR MANAGER', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'HR MANAGER', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => 
            ['SYSADM', 'HRADM', 'CADM', 'ADMIN', 'SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(r || '').toUpperCase())
        ));

    const loadPendingApprovals = async () => {
        try {
            const res = await communitiesApi.getPending({ noCache: true });
            const apiPending = Array.isArray(res) 
                ? res 
                : (Array.isArray(res?.data) 
                    ? res.data 
                    : (Array.isArray(res?.data?.data) 
                        ? res.data.data 
                        : []));
            if (Array.isArray(apiPending)) {
                const mapped = apiPending.map(c => ({
                    id: c.communityId || c.id,
                    name: c.name,
                    category: c.category || c.categoryName || 'General',
                    type: formatCommunityType(c.communityType || c.type || (c.isPrivate ? 'Private' : 'Public')),
                    description: c.description || 'No description provided.',
                    creatorUserId: c.createdByUserId || c.createdById || c.creatorUserId,
                    creatorName: c.createdByUserName || c.createdBy || c.creatorName || 'Employee',
                    creatorEmployeeId: c.creatorEmployeeId || (c.createdByUserId || c.createdById ? `EMP${c.createdByUserId || c.createdById}` : 'MPO'),
                    creatorDesignation: c.creatorDesignation || 'Community Creator',
                    creatorDepartment: c.creatorDepartment || 'MPOnline',
                    creatorAvatar: c.creatorAvatar || c.avatar,
                    createdDate: c.createdDate || c.createdAt,
                    status: c.approvalStatus || 'Pending'
                }));

                // Server DB is authoritative: prune decided communities (approved or rejected) from local pending storage
                try {
                    const localList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                    const activeApiIds = new Set(mapped.map(m => String(m.id)));
                    const activeApiNames = new Set(mapped.map(m => (m.name || '').toLowerCase().trim()));

                    const prunedLocal = localList.filter(l => {
                        const numId = Number(l.id);
                        // Any numeric DB ID not returned by backend is no longer pending (approved or rejected)
                        if (!isNaN(numId) && numId > 0 && numId < 1000000000) {
                            return false;
                        }
                        return !activeApiIds.has(String(l.id)) && !activeApiNames.has((l.name || '').toLowerCase().trim());
                    });
                    localStorage.setItem('knome_pending_community_approvals', JSON.stringify(prunedLocal));
                } catch (_) {}

                setPendingApprovals(mapped);
                return;
            }
        } catch (e) {
            console.warn('Backend pending communities fetch note:', e);
        }
        try {
            const list = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
            setPendingApprovals(list);
        } catch (e) {
            setPendingApprovals([]);
        }
    };

    const loadCommunities = async () => {
        loadPendingApprovals();
        try {
            const data = await communitiesApi.getAll().catch(() => null);
            const currentUid = currentUser?.userId || currentUser?.id;
            const currentEmpId = (currentUser?.employeeId || '').toUpperCase();
            const currentEmail = (currentUser?.email || '').toLowerCase();
            const userJoinedList = JSON.parse(localStorage.getItem(`knome_joined_communities_${currentUid || 'guest'}`) || '[]');
            const getStatus = (id, apiStatus, type, createdByUserId, isCurrentUserAdmin) => {
                // Check if user is suspended in this community
                try {
                    const commSusp = JSON.parse(localStorage.getItem(`knome_community_suspended_${id}`) || '[]');
                    const isSusp = commSusp.some(s => {
                        const sUid = s.userId || s.id;
                        const sEmpId = (s.employeeId || '').toUpperCase();
                        const sEmail = (s.email || '').toLowerCase();
                        return (currentUid && String(sUid) === String(currentUid)) ||
                               (currentEmpId && sEmpId && sEmpId === currentEmpId) ||
                               (currentEmail && sEmail && sEmail === currentEmail);
                    });
                    if (isSusp) return 'Banned';
                } catch (_) {}

                // Check if user was removed from this community
                try {
                    const commRemoved = JSON.parse(localStorage.getItem(`knome_community_removed_${id}`) || '[]');
                    const isRemoved = commRemoved.some(r => {
                        const strR = String(r).toLowerCase();
                        return (currentUid && String(currentUid).toLowerCase() === strR) ||
                               (currentEmpId && currentEmpId.toLowerCase() === strR) ||
                               (currentEmail && currentEmail === strR) ||
                               (currentUser?.name && currentUser.name.toLowerCase() === strR);
                    });
                    if (isRemoved) return 'none';
                } catch (_) {}

                // If user is creator or admin of this community, they are Approved!
                if (isCurrentUserAdmin) return 'Approved';
                if (currentUid && createdByUserId && String(currentUid) === String(createdByUserId)) return 'Approved';

                const isOrgDefault = type?.toLowerCase().includes('default') || type?.toLowerCase().includes('org');
                if (isOrgDefault) return 'Approved';

                const s = (apiStatus || '').toLowerCase();
                if (s === 'approved' || s === 'joined') return 'Approved';
                if (s === 'pending') return 'Pending';

                // For backend database communities (where apiStatus is evaluated):
                // If the server confirms not approved/joined/pending, server is the single source of truth!
                if (apiStatus !== undefined && apiStatus !== null) {
                    const entry = userJoinedList.find(c => String(c.id) === String(id));
                    if (entry && entry.status === 'subscribed') return 'Subscribed';
                    return 'none';
                }

                // Fallback for purely local mock/offline communities
                const entry = userJoinedList.find(c => String(c.id) === String(id));
                if (entry) {
                    if (entry.status === 'joined' || entry.status === 'approved' || entry.status === 'Approved') return 'Approved';
                    if (entry.status === 'pending_approval' || entry.status === 'pending') return 'Pending';
                    if (entry.status === 'subscribed') return 'Subscribed';
                }
                const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${id}`) || '[]');
                if (currentUser && localMembers.some(m => (currentUid && String(m.userId || m.id) === String(currentUid)) || (currentUser.name && (m.fullName || m.name || '').toLowerCase() === currentUser.name.toLowerCase()))) return 'Approved';
                return 'none';
            };

            let combinedList = [];
            const existingNames = new Set();
            const existingIds = new Set();
            const deletedIds = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]').map(String));

            if (data && Array.isArray(data) && data.length > 0) {
                // Remove any active database community IDs from stale local deletion tombstone
                const activeDbIds = new Set(data.filter(c => c.isActive === undefined || c.isActive === true || c.isActive === 1).map(c => String(c.communityId)));
                const activeDbNames = new Set(data.filter(c => c.isActive === undefined || c.isActive === true || c.isActive === 1).map(c => (c.name || '').toLowerCase().trim()));
                const remainingDeleted = Array.from(deletedIds).filter(id => !activeDbIds.has(id));
                if (remainingDeleted.length !== deletedIds.size) {
                    localStorage.setItem('knome_deleted_community_ids', JSON.stringify(remainingDeleted));
                    deletedIds.clear();
                    remainingDeleted.forEach(id => deletedIds.add(id));
                }

                // Prune active approved communities from pending approvals & promote in joined communities
                try {
                    const pending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                    const cleanedPending = pending.filter(p => !activeDbIds.has(String(p.id)) && !activeDbNames.has((p.name || '').toLowerCase().trim()));
                    if (cleanedPending.length !== pending.length) {
                        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(cleanedPending));
                        setPendingApprovals(prev => prev.filter(p => !activeDbIds.has(String(p.id)) && !activeDbNames.has((p.name || '').toLowerCase().trim())));
                    }

                    const userKey = `knome_joined_communities_${currentUid || 'guest'}`;
                    const userJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
                    let userJoinedUpdated = false;
                    const activeDbMap = new Map(data.map(c => [String(c.communityId || c.id), c]));

                    const syncedUserJoined = userJoined.map(uj => {
                        if ((uj.status === 'pending_approval' || uj.status === 'pending') && (activeDbIds.has(String(uj.id)) || activeDbNames.has((uj.name || '').toLowerCase().trim()))) {
                            userJoinedUpdated = true;
                            return { ...uj, status: 'joined' };
                        }
                        return uj;
                    }).filter(uj => {
                        const dbComm = activeDbMap.get(String(uj.id));
                        if (!dbComm) return true;
                        const isOrgDefault = (dbComm.communityType || '').toLowerCase().includes('default') || (dbComm.communityType || '').toLowerCase().includes('org');
                        const isCreator = currentUid && String(dbComm.createdByUserId) === String(currentUid);
                        const isDbAdmin = Boolean(dbComm.isCurrentUserAdmin);
                        const dbStatus = (dbComm.currentUserMembershipStatus || '').toLowerCase();
                        const isDbMember = dbStatus === 'approved' || dbStatus === 'joined';
                        if (uj.status === 'joined' || uj.status === 'approved') {
                            if (!isOrgDefault && !isCreator && !isDbAdmin && !isDbMember) {
                                userJoinedUpdated = true;
                                return false; // Prune stale joined community where user was removed in DB!
                            }
                        }
                        return true;
                    });
                    if (userJoinedUpdated) {
                        localStorage.setItem(userKey, JSON.stringify(syncedUserJoined));
                    }
                } catch (syncErr) {
                    console.warn('Community pending approval sync error:', syncErr);
                }

                const apiMapped = data
                    .filter(c => c.isActive === undefined || c.isActive === true || c.isActive === 1)
                    .map(c => {
                        const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${c.communityId}`) || '[]');
                        const count = localMembers.length > 0 ? deduplicateMembers(localMembers).length : (c.membersCount || 1);
                        const imgs = getCommunityImages(c.name, c.categoryName);
                        const bannerResolved = resolveMediaUrl(c.bannerUrl || c.bannerImageUrl) || imgs.banner;
                        const thumbResolved = resolveMediaUrl(c.thumbnailUrl) || imgs.thumbnail;
                        existingNames.add((c.name || '').toLowerCase().trim());
                        existingIds.add(String(c.communityId));
                        return {
                            id: c.communityId,
                            name: c.name,
                            type: formatCommunityType(c.communityType),
                            category: c.categoryName || 'General',
                            members: `${count} ${count === 1 ? 'member' : 'members'}`,
                            activity: `${c.postsCount || 0} posts`,
                            description: c.description || 'No description provided.',
                            banner: bannerResolved,
                            thumbnail: thumbResolved,
                            createdByUserId: c.createdByUserId,
                            isCurrentUserAdmin: c.isCurrentUserAdmin,
                            membershipStatus: getStatus(c.communityId, c.currentUserMembershipStatus, c.communityType, c.createdByUserId, c.isCurrentUserAdmin)
                        };
                    });
                combinedList.push(...apiMapped);
            }

            // Auto-promote any community created by Loveneesh or HR/Admin that might be in pending approvals
            try {
                const pending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                if (pending.length > 0) {
                    const toAutoApprove = pending.filter(p => 
                        (isHRorAdmin && (String(p.creatorUserId) === String(currentUser?.id) || (p.createdBy || '').toLowerCase().includes('loveneesh'))) ||
                        p.status === 'Approved'
                    );
                    if (toAutoApprove.length > 0) {
                        const remainingPending = pending.filter(p => !toAutoApprove.some(a => String(a.id) === String(p.id)));
                        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(remainingPending));
                        const currentCustom = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                        const updatedCustom = [
                            ...toAutoApprove.map(c => ({ ...c, status: 'Approved', isApproved: true })),
                            ...currentCustom.filter(c => !toAutoApprove.some(a => String(a.id) === String(c.id)))
                        ];
                        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));
                    }
                }
            } catch (e) {
                console.warn('Pending community migration note:', e);
            }

            // Merge Custom Created Communities
            const custom = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            custom.forEach(c => {
                const cleanName = (c.name || '').toLowerCase().trim();
                if (!deletedIds.has(String(c.id)) && !existingIds.has(String(c.id)) && !existingNames.has(cleanName)) {
                    const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${c.id}`) || '[]');
                    const count = localMembers.length > 0 ? deduplicateMembers(localMembers).length : (parseInt(c.members) || 1);
                    const imgs = getCommunityImages(c.name, c.category);
                    existingNames.add(cleanName);
                    existingIds.add(String(c.id));
                    const userBanner = c.banner || c.bannerUrl || c.avatar || c.thumbnail;
                    const userThumb = c.thumbnail || c.avatar || c.thumbnailUrl || c.banner;
                    combinedList.unshift({
                        id: c.id,
                        name: c.name,
                        type: formatCommunityType(c.type),
                        category: c.category || 'General',
                        members: `${count} ${count === 1 ? 'member' : 'members'}`,
                        activity: 'New',
                        description: c.description || 'A new community created for MPOnline teams.',
                        banner: resolveMediaUrl(userBanner) || userBanner || imgs.banner,
                        thumbnail: resolveMediaUrl(userThumb) || userThumb || imgs.thumbnail,
                        avatar: resolveMediaUrl(userThumb) || userThumb || imgs.thumbnail,
                        membershipStatus: getStatus(c.id, null, c.type)
                    });
                }
            });


            // Display all communities without restrictive whitelist
            setCommunities(combinedList);
        } catch (err) {
            console.error('Failed to load communities:', err);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        loadCommunities();

        // Check if navigated with ?tab=Approvals
        const params = new URLSearchParams(window.location.search);
        if (params.get('tab') === 'Approvals' && isHRorAdmin) {
            setActiveTab('Pending Approvals');
        }

        const handleApprovalRequested = () => {
            loadPendingApprovals();
            loadCommunities();
        };

        const handleCommunityUpdate = () => {
            loadCommunities();
            loadPendingApprovals();
        };

        const handleWindowFocus = () => {
            loadCommunities();
            loadPendingApprovals();
        };

        // Real-time polling every 6 seconds to synchronize cross-window admin approvals automatically
        const pollInterval = setInterval(() => {
            loadCommunities();
        }, 6000);

        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('community-created', handleCommunityUpdate);
        window.addEventListener('community-joined-change', handleCommunityUpdate);
        window.addEventListener('community-suspended-change', handleCommunityUpdate);
        window.addEventListener('community-approval-requested', handleApprovalRequested);
        window.addEventListener('storage', handleApprovalRequested);
        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('community-created', handleCommunityUpdate);
            window.removeEventListener('community-joined-change', handleCommunityUpdate);
            window.removeEventListener('community-suspended-change', handleCommunityUpdate);
            window.removeEventListener('community-approval-requested', handleApprovalRequested);
            window.removeEventListener('storage', handleApprovalRequested);
        };
    }, [isHRorAdmin]);

    React.useEffect(() => {
        if (activeTab === 'Pending Approvals') {
            loadPendingApprovals();
        }
    }, [activeTab]);

    React.useEffect(() => {
        if (currentUser?.id) {
            loadPendingApprovals();
            loadCommunities();
        }
    }, [currentUser?.id, currentUser?.role]);

    const isSysAdmin = ['SYSADM', 'CADM', 'HRADM', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => 
            ['SYSADM', 'CADM', 'HRADM', 'ADMIN', 'SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(r || '').toUpperCase())
        ));

    const handleDeleteCommunityCard = async (e, community) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'Delete Community',
            message: `Are you sure you want to delete/remove "${community.name}"? This action cannot be undone.`,
            confirmText: 'Delete Community',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;

        // 1. Immediately track as deleted in localStorage so refresh never restores it
        const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]');
        if (!deletedIds.includes(String(community.id))) {
            deletedIds.push(String(community.id));
            localStorage.setItem('knome_deleted_community_ids', JSON.stringify(deletedIds));
        }

        // 2. Remove from custom list and pending approvals list
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = customList.filter(c => 
            String(c.id) !== String(community.id) && 
            (c.name || '').toLowerCase().trim() !== (community.name || '').toLowerCase().trim()
        );
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        const pendingList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = pendingList.filter(c => 
            String(c.id) !== String(community.id) && 
            (c.name || '').toLowerCase().trim() !== (community.name || '').toLowerCase().trim()
        );
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));

        // 3. Immediately remove from frontend UI state
        setCommunities(prev => prev.filter(c => c.id !== community.id && String(c.id) !== String(community.id)));
        addToast(`Community "${community.name}" has been removed.`, 'info');

        // 4. Send delete to backend to set IsActive = 0 in database
        try {
            await communitiesApi.delete(community.id);
        } catch (err) {
            console.warn('Backend delete notification error:', err);
        }
    };

    const handleCancelPendingCommunity = async (e, community) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const commName = community?.name || community?.communityName || 'this community';
        const commId = community?.id || community?.communityId;

        const ok = await confirm({
            title: 'Cancel Community Request',
            message: `Are you sure you want to cancel and revert your request for "${commName}"? This community creation proposal will be withdrawn and removed.`,
            confirmText: 'Yes, Cancel Request',
            cancelText: 'Keep Request',
            variant: 'danger'
        });
        if (!ok) return;

        // 1. Immediately track as deleted in localStorage so it never resurrects
        const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]');
        if (commId && !deletedIds.includes(String(commId))) {
            deletedIds.push(String(commId));
            localStorage.setItem('knome_deleted_community_ids', JSON.stringify(deletedIds));
        }

        // 2. Remove from pending approvals storage
        const pendingList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = pendingList.filter(c => 
            String(c.id) !== String(commId) && 
            (c.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        );
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));

        // 3. Remove from custom communities
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = customList.filter(c => 
            String(c.id) !== String(commId) && 
            (c.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        );
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        // 4. Update component state immediately
        setPendingApprovals(prev => prev.filter(p => 
            String(p.id) !== String(commId) && 
            (p.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        ));
        setCommunities(prev => prev.filter(c => 
            String(c.id) !== String(commId) && 
            (c.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        ));

        // Close successPopup if it matches
        setSuccessPopup(prev => (prev && (String(prev.id) === String(commId) || prev.communityName === commName) ? null : prev));

        addToast(`Community request for "${commName}" has been cancelled.`, 'info');

        // 5. Notify backend to deactivate / mark as deleted in database
        if (commId) {
            try {
                await communitiesApi.delete(commId);
            } catch (err) {
                console.warn('Backend cancel community request error:', err);
            }
        }

        // 6. Broadcast event across tabs/windows
        window.dispatchEvent(new CustomEvent('community-created'));
        window.dispatchEvent(new CustomEvent('community-approval-requested'));
    };

    const compressImage = (file, maxWidth = 1200, maxHeight = 600, quality = 0.85) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = () => resolve(e.target.result);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    };

    const handleQuickPhotoChange = async (e, communityId) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const compressed = await compressImage(file, 1200, 500, 0.85);
        if (!compressed) return;

        // 1. Update localStorage
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updated = customList.map(c => {
            if (String(c.id) === String(communityId)) {
                return { ...c, banner: compressed, bannerUrl: compressed, thumbnail: compressed, avatar: compressed };
            }
            return c;
        });
        localStorage.setItem('knome_custom_communities', JSON.stringify(updated));

        // 2. Update local state
        setCommunities(prev => prev.map(c => {
            if (String(c.id) === String(communityId)) {
                return { ...c, banner: compressed, thumbnail: compressed, avatar: compressed };
            }
            return c;
        }));

        window.dispatchEvent(new CustomEvent('community-joined-change'));
        if (addToast) addToast('Community photo updated successfully!', 'success');
    };

    // ── HR APPROVAL HANDLERS ────────────────────────────────────
    const handleApproveCommunity = async (e, comm) => {
        e.stopPropagation();

        try {
            await communitiesApi.approve(comm.id);
            if (Array.isArray(comm.invitedUserIds) && comm.invitedUserIds.length > 0) {
                await communitiesApi.addMembers(comm.id, comm.invitedUserIds).catch(() => {});
            }
        } catch (apiErr) {
            console.warn('Backend community approve failed, continuing with fallback:', apiErr);
        }

        // 1. Remove from pending approvals
        const currentPending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = currentPending.filter(p => String(p.id) !== String(comm.id));
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
        setPendingApprovals(prev => prev.filter(p => String(p.id) !== String(comm.id)));

        // 2. Auto-join creator as admin
        const creatorKey = `knome_joined_communities_${comm.creatorUserId || 'guest'}`;
        const creatorJoined = JSON.parse(localStorage.getItem(creatorKey) || '[]');
        localStorage.setItem(creatorKey, JSON.stringify([
            { id: comm.id, name: comm.name, status: 'joined', joinedAt: new Date().toISOString() },
            ...creatorJoined.filter(c => String(c.id) !== String(comm.id))
        ]));

        // 3. Create community members list with creator as Admin + selected invited users ONLY
        const creatorMember = {
            userId: comm.creatorUserId || 1,
            fullName: comm.creatorName || comm.createdBy || 'Employee',
            employeeId: comm.creatorEmployeeId || 'MPO100',
            designation: 'Community Creator / Admin',
            memberType: 'Admin',
            status: 'Approved',
            profilePhotoUrl: comm.creatorAvatar || null
        };
        const memberList = [creatorMember];

        const allUsersPool = [...(users || []), ...(INITIAL_USERS || [])];
        try {
            const customUsers = JSON.parse(localStorage.getItem('knome_custom_users') || '[]');
            if (Array.isArray(customUsers)) allUsersPool.push(...customUsers);
        } catch (err) {}

        if (Array.isArray(comm.invitedUserIds) && comm.invitedUserIds.length > 0) {
            comm.invitedUserIds.forEach(tId => {
                const targetUserObj = allUsersPool.find(u => String(u.id || u.userId) === String(tId));
                if (targetUserObj) {
                    memberList.push({
                        userId: targetUserObj.id || targetUserObj.userId,
                        fullName: targetUserObj.name || targetUserObj.fullName,
                        employeeId: targetUserObj.employeeId || `MPO${tId}`,
                        designation: targetUserObj.designation || 'Member',
                        memberType: 'Member',
                        status: 'Approved',
                        profilePhotoUrl: targetUserObj.avatar || null
                    });

                    // Auto-join to target user's joined community list
                    try {
                        const targetUserKey = `knome_joined_communities_${targetUserObj.id || targetUserObj.userId}`;
                        const targetUserJoined = JSON.parse(localStorage.getItem(targetUserKey) || '[]');
                        localStorage.setItem(targetUserKey, JSON.stringify([
                            { id: comm.id, name: comm.name, status: 'joined', joinedAt: new Date().toISOString() },
                            ...targetUserJoined.filter(c => String(c.id) !== String(comm.id))
                        ]));
                    } catch (err) {}
                }
            });
        }

        const dedupedMemberList = deduplicateMembers(memberList);
        localStorage.setItem(`knome_community_members_${comm.id}`, JSON.stringify(dedupedMemberList));

        const approvedComm = {
            ...comm,
            status: 'Approved',
            isApproved: true,
            approvedBy: currentUser?.name || 'HR Admin',
            approvedAt: new Date().toISOString(),
            members: `${dedupedMemberList.length} ${dedupedMemberList.length === 1 ? 'member' : 'members'}`
        };

        // 4. Add to active custom communities
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = [approvedComm, ...customList.filter(c => String(c.id) !== String(comm.id))];
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        // 5. Send approval celebration notification to the employee creator
        const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
        const approvalNotif = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            targetUserId: comm.creatorUserId,
            category: 'Community',
            type: 'community_approved',
            icon: 'verified',
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
            text: `🎉 Great news! Your community "${comm.name}" has been approved by HR Admin (${currentUser?.name || 'HR Admin'}) and is now live!`,
            message: `🎉 Great news! Your community "${comm.name}" has been approved by HR Admin (${currentUser?.name || 'HR Admin'}) and is now live!`,
            senderName: currentUser?.name || 'HR Admin',
            senderAvatar: currentUser?.avatar || null,
            senderUserId: currentUser?.userId || currentUser?.id,
            createdDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            unread: true,
            communityName: comm.name,
            communityId: comm.id,
            actionLink: `/community/view?id=${comm.id}`
        };

        // Also invite any pre-selected users
        const inviteNotifs = (comm.invitedUserIds || []).map(tId => ({
            id: Date.now() + Math.floor(Math.random() * 10000),
            targetUserId: tId,
            category: 'Community',
            type: 'invite',
            icon: 'group_add',
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/10',
            text: `${comm.creatorName || comm.createdBy || 'An employee'} invited you to join the approved community "${comm.name}".`,
            senderName: comm.creatorName || comm.createdBy || 'An employee',
            senderAvatar: comm.creatorAvatar || null,
            senderUserId: comm.creatorUserId,
            createdDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            unread: true,
            communityName: comm.name,
            communityId: comm.id,
            actionLink: `/community/view?id=${comm.id}`
        }));

        localStorage.setItem('knome_notifications', JSON.stringify([approvalNotif, ...inviteNotifs, ...existingNotifs]));
        localStorage.setItem(`knome_community_members_${comm.id}`, JSON.stringify(dedupedMemberList));

        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: approvalNotif }));
        window.dispatchEvent(new CustomEvent('community-joined-change'));

        setApprovalSuccessMsg(`✨ "${comm.name}" has been approved & published live!`);
        setTimeout(() => setApprovalSuccessMsg(''), 4000);
        loadCommunities();
    };

    const handleRejectCommunity = async (e, comm) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'Reject Request',
            message: `Are you sure you want to reject the community creation request for "${comm.name}"?`,
            confirmText: 'Reject',
            cancelText: 'Cancel',
            variant: 'warning'
        });
        if (!ok) {
            return;
        }

        try {
            await communitiesApi.reject(comm.id, 'Request rejected by Administrator');
        } catch (apiErr) {
            console.warn('Backend community reject failed, continuing with fallback:', apiErr);
        }

        // 1. Remove from pending
        const currentPending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = currentPending.filter(p => String(p.id) !== String(comm.id));
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
        setPendingApprovals(prev => prev.filter(p => String(p.id) !== String(comm.id)));

        // 2. Remove from creator's pending list
        const creatorKey = `knome_joined_communities_${comm.creatorUserId || 'guest'}`;
        const creatorJoined = JSON.parse(localStorage.getItem(creatorKey) || '[]');
        localStorage.setItem(creatorKey, JSON.stringify(creatorJoined.filter(c => String(c.id) !== String(comm.id))));

        // 3. Notify creator
        const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
        const rejectNotif = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            targetUserId: comm.creatorUserId,
            category: 'Community',
            type: 'community_rejected',
            icon: 'cancel',
            color: 'text-red-500',
            bg: 'bg-red-500/10',
            text: `❌ Your community creation request for "${comm.name}" was not approved by Administration (${currentUser?.name || 'Admin'}).`,
            message: `❌ Your community creation request for "${comm.name}" was not approved by Administration (${currentUser?.name || 'Admin'}).`,
            senderName: currentUser?.name || 'Administration',
            senderAvatar: currentUser?.avatar || null,
            senderUserId: currentUser?.userId || currentUser?.id,
            createdDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            unread: true,
            communityName: comm.name,
            communityId: comm.id
        };
        localStorage.setItem('knome_notifications', JSON.stringify([rejectNotif, ...existingNotifs]));
        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: rejectNotif }));

        setApprovalSuccessMsg(`Community request for "${comm.name}" was rejected.`);
        setTimeout(() => setApprovalSuccessMsg(''), 4000);
    };

    const saveJoinedCommunity = async (community) => {
        try {
            await communitiesApi.join(community.id).catch(() => null);
        } catch (err) {
            console.error('Failed to join community via API:', err);
        }
        // FR-CM-09: Persist join to localStorage regardless of API success
        const newStatus = community.type === 'Private' ? 'Pending' : 'Approved';
        const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
        const existingJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
        if (!existingJoined.some(c => String(c.id) === String(community.id))) {
            existingJoined.push({
                id: community.id,
                name: community.name,
                status: newStatus === 'Approved' ? 'joined' : 'pending',
                joinedAt: new Date().toISOString()
            });
            localStorage.setItem(userKey, JSON.stringify(existingJoined));
        }
        setCommunities(prev => prev.map(c => c.id === community.id ? { 
            ...c, 
            membershipStatus: newStatus 
        } : c));
    };

    const handleCommunityCreated = (result) => {
        loadCommunities();
        loadPendingApprovals();
        if (result && result.type) {
            setSuccessPopup(result);
            if (result.type === 'created') {
                addToast('Community successfully created!', 'success');
            } else if (result.type === 'approval') {
                addToast('Community request sent for approval!', 'info');
            }
        }
    };

    // Filter communities based on activeTab + search + type + category (FR-CM-09)
    const filteredCommunities = communities.filter(c => {
        // Tab filter
        if (activeTab === 'My Communities') {
            // FR-CM-06: Include joined (Approved), subscribed, and pending request communities
            const s = (c.membershipStatus || '').toLowerCase();
            if (!(s === 'approved' || s === 'joined' || s === 'subscribed' || s === 'pending')) return false;
        }
        // Type filter
        if (filterType !== 'All') {
            const normalizedFilter = formatCommunityType(filterType);
            if (formatCommunityType(c.type) !== normalizedFilter) return false;
        }
        // Category filter
        if (filterCategory !== 'All') {
            const commCat = (c.category || c.categoryName || '').toLowerCase().trim();
            const targetCat = filterCategory.toLowerCase().trim();
            const matches = commCat === targetCat || 
                (targetCat.includes('design') && commCat.includes('design')) ||
                (targetCat.includes('product') && commCat.includes('product')) ||
                (targetCat.includes('finance') && commCat.includes('finance')) ||
                (targetCat.includes('general') && commCat.includes('general')) ||
                (targetCat.includes('engineering') && commCat.includes('engineering')) ||
                (targetCat.includes('tech') && commCat.includes('tech'));
            if (!matches) return false;
        }
        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const nameMatch = c.name?.toLowerCase().includes(q);
            const descMatch = c.description?.toLowerCase().includes(q);
            const catMatch = c.category?.toLowerCase().includes(q);
            const typeMatch = c.type?.toLowerCase().includes(q);
            if (!nameMatch && !descMatch && !catMatch && !typeMatch) return false;
        }
        return true;
    });

    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(filteredCommunities.length, 8, 8);

    useEffect(() => {
        resetScrollLoading();
    }, [activeTab, filterType, filterCategory, searchQuery, resetScrollLoading]);

    // Employee's own pending communities for "My Communities" tab (exclude any that are already active/approved)
    const myPendingCommunities = pendingApprovals.filter(p => 
        String(p.creatorUserId) === String(currentUser?.id) &&
        !communities.some(c => String(c.id) === String(p.id) || (c.name || '').toLowerCase().trim() === (p.name || '').toLowerCase().trim())
    );

    return (
        <>
            <main className="flex-1 flex flex-col gap-8 pb-6">
                
                {/* Hero Header */}
                <div className="relative rounded-2xl overflow-hidden mb-4 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-indigo-100/50 dark:from-indigo-900/20 via-transparent to-transparent pointer-events-none"></div>
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-indigo-400/10 dark:bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col items-start max-w-3xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                            ✨ Empowering MPOnline Teams
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 dark:from-indigo-400 dark:via-blue-400 dark:to-cyan-400">
                                Build & Grow Communities
                            </span>
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                            Connect, share, and grow with specialized interest groups across the organization.
                        </p>
                    </div>
                    <div className="relative z-10 shrink-0 flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                        {['SYSADM', 'HRADM', 'EMP'].includes(currentUser?.role || 'EMP') && (
                            <button 
                                onClick={() => setIsCreateOpen(true)}
                                className="w-full sm:w-auto px-6 py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">add</span>
                                Create Community
                            </button>
                        )}
                    </div>
                </div>

                {/* Toast / Alert for approvals */}
                {approvalSuccessMsg && (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-sm flex items-center gap-2 animate-in fade-in">
                        <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                        <span>{approvalSuccessMsg}</span>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1">
                    {['Discover', 'My Communities'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-4 font-bold text-[14px] transition-colors relative flex items-center gap-2 cursor-pointer ${activeTab === tab ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            <span>{tab}</span>
                            {tab === 'My Communities' && myPendingCommunities.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                                    {myPendingCommunities.length} Pending
                                </span>
                            )}
                            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full"></div>}
                        </button>
                    ))}

                    {/* HR Administrator Approval Tab */}
                    {isHRorAdmin && (
                        <button 
                            onClick={() => setActiveTab('Pending Approvals')}
                            className={`px-6 py-4 font-bold text-[14px] transition-colors relative flex items-center gap-2 cursor-pointer ${activeTab === 'Pending Approvals' ? 'text-amber-500' : 'text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">approval</span>
                            <span>Community Approvals</span>
                            {pendingApprovals.length > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-white shadow-sm animate-pulse">
                                    {pendingApprovals.length}
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                                    0
                                </span>
                            )}
                            {activeTab === 'Pending Approvals' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-500 rounded-t-full"></div>}
                        </button>
                    )}
                </div>

                {/* ─── TAB 1: HR PENDING APPROVALS VIEW ─── */}
                {activeTab === 'Pending Approvals' && isHRorAdmin ? (
                    <div className="space-y-6">
                        <div className="p-4 bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                                    <span className="material-symbols-outlined text-[24px]">gavel</span>
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-300">
                                        Community Governance &amp; Approval Review
                                    </h4>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                        Communities submitted by MPOnline employees require Community Admin, HR Admin, or System Admin clearance before public launch.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <button
                                    onClick={() => loadPendingApprovals()}
                                    className="p-1.5 px-3 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                                    title="Refresh Pending Approvals"
                                >
                                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                                    <span>Refresh</span>
                                </button>
                                <span className="text-xs font-black text-amber-600 bg-amber-100 dark:bg-amber-900/60 px-3 py-1.5 rounded-xl">
                                    {pendingApprovals.length} Pending
                                </span>
                            </div>
                        </div>

                        {pendingApprovals.length === 0 ? (
                            <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-[32px]">task_alt</span>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white">All Caught Up!</h3>
                                <p className="text-sm text-slate-500 max-w-md mt-1">
                                    There are currently no employee-created community requests awaiting administrator approval.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pendingApprovals.map(comm => (
                                    <div key={comm.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col hover:border-amber-300 dark:hover:border-amber-700 transition-all">
                                        <div className="h-28 relative overflow-hidden bg-slate-200 dark:bg-slate-800">
                                            <img 
                                                src={comm.banner || getCommunityImages(comm.name, comm.category).banner} 
                                                alt={comm.name} 
                                                onError={(e) => {
                                                    e.currentTarget.onerror = null;
                                                    e.currentTarget.src = getCommunityImages(comm.name, comm.category).banner;
                                                }}
                                                className="w-full h-full object-cover" 
                                            />
                                            <div className="absolute inset-0 bg-slate-900/20"></div>
                                            <div className="absolute top-3 left-3">
                                                <span className="px-2.5 py-1 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-sm">
                                                    ⏳ Pending Review
                                                </span>
                                            </div>
                                            <div className="absolute top-3 right-3">
                                                <span className="px-2.5 py-1 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider bg-white/90 text-slate-800 shadow-sm">
                                                    {formatCommunityType(comm.type)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-5 flex flex-col flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
                                                    {comm.category || 'General'}
                                                </span>
                                                <span className="text-[11px] text-slate-400 ml-auto">
                                                    {comm.createdDate ? new Date(comm.createdDate).toLocaleDateString() : 'Just now'}
                                                </span>
                                            </div>

                                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white mt-1">
                                                {comm.name}
                                            </h3>

                                            {/* Creator Info Box */}
                                            <div className="my-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
                                                {comm.creatorAvatar ? (
                                                    <img src={comm.creatorAvatar} alt={comm.creatorName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center text-xs shrink-0">
                                                        {(comm.creatorName || 'E').charAt(0)}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                                        {comm.creatorName}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 truncate">
                                                        {comm.creatorDesignation || 'Community Creator'} • {comm.creatorDepartment || 'MPOnline'}
                                                    </p>
                                                </div>
                                            </div>

                                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed mb-4 flex-1">
                                                {comm.description}
                                            </p>

                                            {/* Action Buttons */}
                                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                                <button
                                                    onClick={(e) => handleApproveCommunity(e, comm)}
                                                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">verified</span>
                                                    Approve &amp; Launch
                                                </button>
                                                <button
                                                    onClick={(e) => handleRejectCommunity(e, comm)}
                                                    className="py-2.5 px-4 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Search + Type + Category Filter Bar (FR-CM-09) */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-4">
                            {/* Search */}
                            <div className="relative flex-1 min-w-0">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search communities by name or description..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                )}
                            </div>

                            {/* Type Pills */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {['All', 'Public', 'Private', 'Org'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setFilterType(t)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            filterType === t
                                                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                                        }`}
                                    >
                                        {t === 'Org' ? '🏢 Org' : t === 'Public' ? '🌐 Public' : t === 'Private' ? '🔒 Private' : '✨ All'}
                                    </button>
                                ))}
                            </div>

                            {/* Category Dropdown */}
                            <select
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                                className="shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm outline-none text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
                            >
                                <option value="All">All Categories</option>
                                {availableCategories.map(cat => (
                                    <option key={cat.categoryId || cat.id || cat.name} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>

                            {/* Result count */}
                            {(searchQuery || filterType !== 'All' || filterCategory !== 'All') && (
                                <span className="text-[12px] text-slate-500 font-bold shrink-0">
                                    {filteredCommunities.length} result{filteredCommunities.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Employee's Own Pending Communities Banner (in My Communities tab) */}
                        {activeTab === 'My Communities' && myPendingCommunities.length > 0 && (
                            <div className="space-y-4 mb-4">
                                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                                        <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                                    </div>
                                    <div>
                                        <h4 className="font-extrabold text-xs text-amber-800 dark:text-amber-300">
                                            Communities Submitted for Administration Approval ({myPendingCommunities.length})
                                        </h4>
                                        <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5">
                                            The communities below are currently being reviewed by the Administration. You will receive an instant notification once approved.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {myPendingCommunities.map(c => (
                                        <div key={c.id} className="bg-white dark:bg-slate-900 border-2 border-dashed border-amber-300 dark:border-amber-700/60 rounded-xl overflow-hidden shadow-xs flex flex-col opacity-90 min-h-[230px]">
                                            <div className="h-24 sm:h-26 relative overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                                                <img 
                                                    src={c.banner || getCommunityImages(c.name, c.category).banner} 
                                                    alt={c.name} 
                                                    onError={(e) => {
                                                        e.currentTarget.onerror = null;
                                                        e.currentTarget.src = getCommunityImages(c.name, c.category).banner;
                                                    }}
                                                    className="w-full h-full object-cover" 
                                                />
                                                <div className="absolute inset-0 bg-slate-900/40"></div>
                                                <div className="absolute top-2 left-2">
                                                    <span className="px-2 py-0.5 backdrop-blur-md rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs">
                                                        Under Administration Review
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-3 sm:p-3.5 flex flex-col flex-1">
                                                <h3 className="font-extrabold text-[13px] sm:text-[14px] text-slate-900 dark:text-white mb-1 line-clamp-1" title={c.name}>
                                                    <HighlightText text={c.name} query={searchQuery} />
                                                </h3>
                                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-2 flex-1">
                                                    <HighlightText text={c.description} query={searchQuery} />
                                                </p>
                                                <div className="pt-2 mt-auto border-t border-slate-100 dark:border-slate-800 text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center justify-between gap-1 whitespace-nowrap">
                                                    <div className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[13px]">schedule</span>
                                                        <span>Awaiting clearance</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => handleCancelPendingCommunity(e, c)}
                                                        className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                                                        title="Cancel & revert this community request"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">close</span>
                                                        <span>Cancel</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Communities Grid — Compact, Modern Enterprise Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {(activeTab === 'Discover' ? filteredCommunities : filteredCommunities.slice(0, visibleCount)).map(community => (
                                <div key={community.id} onClick={() => navigate(`/community/view?id=${community.id}`)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group flex flex-col h-full min-h-[230px]">
                                    {/* Compact Header Banner */}
                                    <div className="h-24 sm:h-26 relative overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                                        <img 
                                            src={community.banner || community.thumbnail || community.avatar || getCommunityImages(community.name, community.category).banner} 
                                            alt={community.name} 
                                            onError={(e) => {
                                                e.currentTarget.onerror = null;
                                                e.currentTarget.src = getCommunityImages(community.name, community.category).banner;
                                            }}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent"></div>
                                        {(community.thumbnail || community.avatar) && (
                                            <div className="absolute bottom-2 left-2.5 w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border-2 border-white dark:border-slate-900 shadow-xs bg-white shrink-0 z-10">
                                                <img 
                                                    src={community.thumbnail || community.avatar} 
                                                    alt={community.name} 
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    className="w-full h-full object-cover" 
                                                />
                                            </div>
                                        )}
                                        {/* Quick Photo Upload Button (clean on banner) */}
                                        {isSysAdmin && (
                                            <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                                                <label 
                                                    className="w-6 h-6 rounded-md bg-slate-900/70 hover:bg-indigo-600 text-white flex items-center justify-center shadow-xs backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
                                                    title="Change Photo / Banner"
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">photo_camera</span>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="hidden" 
                                                        onChange={(e) => handleQuickPhotoChange(e, community.id)} 
                                                    />
                                                </label>
                                            </div>
                                        )}
                                        {/* Type Pill */}
                                        <div className="absolute top-2 right-2">
                                            <span className={`px-2 py-0.5 backdrop-blur-md rounded-md text-[9px] font-black uppercase tracking-wider border shadow-xs ${
                                                formatCommunityType(community.type) === 'Private' ? 'bg-amber-500/90 text-white border-amber-400' :
                                                formatCommunityType(community.type) === 'Public' ? 'bg-white/95 text-indigo-600 border-white/60 dark:bg-slate-900/90 dark:text-indigo-400' :
                                                'bg-purple-500/90 text-white border-purple-400'
                                            }`}>
                                                {formatCommunityType(community.type)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Compact Body Content */}
                                    <div className="p-3 sm:p-3.5 flex flex-col flex-1">
                                        <div className="flex justify-between items-start gap-1.5 mb-1.5">
                                            <h3 className="font-bold text-[13px] sm:text-[14px] text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors leading-snug line-clamp-1 flex-1" title={community.name}>
                                                <HighlightText text={community.name} query={searchQuery} />
                                            </h3>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {/* FR-CM-01/FR-CM-09: Card action buttons */}
                                                {(() => {
                                                    const currentUid = currentUser?.userId || currentUser?.id;
                                                    const currentEmpId = (currentUser?.employeeId || '').toUpperCase();
                                                    const currentEmail = (currentUser?.email || '').toLowerCase();
                                                    let isSuspendedInThisComm = false;
                                                    try {
                                                        const commSusp = JSON.parse(localStorage.getItem(`knome_community_suspended_${community.id}`) || '[]');
                                                        isSuspendedInThisComm = commSusp.some(s => {
                                                            const sUid = s.userId || s.id;
                                                            const sEmpId = (s.employeeId || '').toUpperCase();
                                                            const sEmail = (s.email || '').toLowerCase();
                                                            return (currentUid && String(sUid) === String(currentUid)) ||
                                                                   (currentEmpId && sEmpId && sEmpId === currentEmpId) ||
                                                                   (currentEmail && sEmail && sEmail === currentEmail);
                                                        }) || community.membershipStatus === 'Banned';
                                                    } catch (_) {}

                                                    if (isSuspendedInThisComm) {
                                                        return (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-md font-bold text-[10px] flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[11px]">person_off</span>
                                                                Suspended
                                                            </span>
                                                        );
                                                    }

                                                    if (community.type?.toLowerCase().includes('default') || community.type?.toLowerCase().includes('org')) {
                                                        return community.membershipStatus === 'Approved' ? (
                                                            <button onClick={(e) => e.stopPropagation()} className="px-2 py-0.5 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-md font-bold text-[10px] cursor-default">Joined</button>
                                                        ) : (
                                                            <button onClick={(e) => e.stopPropagation()} className="px-2 py-0.5 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded-md font-bold text-[10px] cursor-default flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[11px]">corporate_fare</span>
                                                                Subscribed
                                                            </button>
                                                        );
                                                    }

                                                    if (community.type === 'Public') {
                                                        return (
                                                            <button onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (community.membershipStatus !== 'Approved') {
                                                                    saveJoinedCommunity(community);
                                                                }
                                                            }} className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] transition-colors ${community.membershipStatus === 'Approved' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 cursor-default' : community.membershipStatus === 'Subscribed' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-indigo-100 cursor-pointer' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer'}`}>
                                                                {community.membershipStatus === 'Approved' ? 'Joined' : community.membershipStatus === 'Subscribed' ? 'Upgrade →' : 'Join'}
                                                            </button>
                                                        );
                                                    }

                                                    if (community.type === 'Private') {
                                                        return (
                                                            <button onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (community.membershipStatus !== 'Pending' && community.membershipStatus !== 'Approved') {
                                                                    saveJoinedCommunity(community);
                                                                }
                                                            }} className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] transition-colors ${community.membershipStatus === 'Pending' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 cursor-default' : community.membershipStatus === 'Approved' ? 'bg-emerald-100 text-emerald-600 cursor-default' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'}`}>
                                                                {community.membershipStatus === 'Pending' ? 'Requested' : community.membershipStatus === 'Approved' ? 'Joined' : 'Request'}
                                                            </button>
                                                        );
                                                    }

                                                    return (
                                                        <button onClick={(e) => { e.stopPropagation(); }} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-md font-bold text-[10px] cursor-default">Subscribed</button>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2 flex-1">
                                            <HighlightText text={community.description || 'No description provided.'} query={searchQuery} />
                                        </p>

                                        {/* Footer Metadata & DELETE BUTTON IN BOTTOM RIGHT OF BOX */}
                                        <div className="flex items-center justify-between gap-1.5 pt-2 mt-auto border-t border-slate-100 dark:border-slate-800/80 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                            <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                                                <span className="material-symbols-outlined text-[13px] text-indigo-500">group</span>
                                                <span>{community.members}</span>
                                            </div>
                                            {community.category && (
                                                <span className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-full truncate max-w-[80px]" title={community.category}>
                                                    <HighlightText text={community.category} query={searchQuery} />
                                                </span>
                                            )}
                                            <div className="flex items-center gap-1.5 ml-auto shrink-0">
                                                <div className={`flex items-center gap-0.5 whitespace-nowrap ${community.type === 'Public' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    <span className="material-symbols-outlined text-[13px]">{community.type === 'Public' ? 'trending_up' : 'forum'}</span>
                                                    <span>{community.activity}</span>
                                                </div>
                                                {/* Delete Button located in bottom right of box */}
                                                {isSysAdmin && (
                                                    <button 
                                                        onClick={(e) => handleDeleteCommunityCard(e, community)}
                                                        className="w-5.5 h-5.5 rounded-md bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500 dark:hover:text-white flex items-center justify-center transition-all hover:scale-105 cursor-pointer ml-1"
                                                        title="Remove Community"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <ScrollLoadingIndicator isVisible={activeTab !== 'Discover' && visibleCount < filteredCommunities.length} text="Loading more communities on scroll..." />
                        </div>
                    </>
                )}

            </main>

            <CreateCommunityModal 
                isOpen={isCreateOpen} 
                onClose={() => setIsCreateOpen(false)} 
                onCommunityCreated={handleCommunityCreated}
                existingCommunities={communities}
            />

            {/* Pop-up modal after community creation or approval submission */}
            {successPopup && (
                <div className="fixed inset-0 z-[120] p-4 sm:p-6 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="fixed inset-0" onClick={() => setSuccessPopup(null)}></div>
                    
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto custom-scrollbar p-6 sm:p-7 border border-slate-200 dark:border-slate-800 text-center z-10 animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setSuccessPopup(null)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>

                        {successPopup.type === 'created' ? (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10 ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                                    <span className="material-symbols-outlined text-[36px]">check_circle</span>
                                </div>

                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-black uppercase tracking-wider mb-2">
                                    ✨ Live & Active
                                </div>

                                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                                    Community Successfully Created!
                                </h3>

                                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mb-5 leading-relaxed">
                                    <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">"{successPopup.communityName}"</strong> has been created and is now live across MPOnline Knome.
                                </p>

                                {successPopup.link && (
                                    <div className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 mb-5 text-left">
                                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                            🔗 Shareable Community Link
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                readOnly 
                                                value={successPopup.link} 
                                                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none select-all"
                                            />
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(successPopup.link);
                                                    addToast('Invite link copied to clipboard!', 'success');
                                                }}
                                                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center gap-1 shrink-0 transition-colors shadow-sm cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">content_copy</span>
                                                <span>Copy</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 w-full">
                                    {successPopup.communityId && (
                                        <button
                                            onClick={() => {
                                                const targetId = successPopup.communityId;
                                                setSuccessPopup(null);
                                                navigate(`/community/view?id=${targetId}`);
                                            }}
                                            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                                        >
                                            Visit Community
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => setSuccessPopup(null)}
                                        className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-indigo-500/20 cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/10 ring-8 ring-amber-50 dark:ring-amber-950/30">
                                    <span className="material-symbols-outlined text-[36px] animate-pulse">hourglass_top</span>
                                </div>

                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                                    ⏳ Awaiting Administration Approval
                                </div>

                                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                                    Community Request Sent for Approval!
                                </h3>

                                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mb-5 leading-relaxed">
                                    Your request to create <strong className="text-amber-600 dark:text-amber-400 font-extrabold">"{successPopup.communityName}"</strong> has been successfully sent to the <strong>Administration</strong> for review.
                                </p>

                                <div className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 mb-5 text-left space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Community Name:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{successPopup.communityName}</span>
                                    </div>
                                    {successPopup.category && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Category:</span>
                                            <span className="font-bold text-indigo-500">{successPopup.category}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Status:</span>
                                        <span className="font-bold text-amber-500">Pending Administration Approval</span>
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-5">
                                    🔔 You will receive a notification as soon as the Administration approves your request.
                                </p>

                                <div className="flex items-center gap-3 w-full">
                                    <button
                                        onClick={() => {
                                            setSuccessPopup(null);
                                            setActiveTab('My Communities');
                                        }}
                                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                                    >
                                        View My Communities
                                    </button>
                                    <button 
                                        onClick={() => setSuccessPopup(null)}
                                        className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md shadow-amber-600/20 cursor-pointer"
                                    >
                                        Done
                                    </button>
                                </div>
                                <button
                                    onClick={(e) => handleCancelPendingCommunity(e, { id: successPopup.id, name: successPopup.communityName })}
                                    className="w-full mt-2.5 py-1.5 text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                    <span>Cancel / Revert this request</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
