import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { interactionsApi, searchApi, communitiesApi, adminApi, postsApi, notificationsApi, resolveMediaUrl, getCommunityImages } from '../../utils/apiService';
import { useUser, INITIAL_USERS, resolveEmployeeName, KNOWN_ROSTER_NAMES, KNOWN_ROSTER_DETAILS } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import HighlightText from '../ui/HighlightText';

export default function ArticleShareModal({ isOpen, onClose, article, post, item: propItem, contentType: propContentType, onShared }) {
    const { currentUser, users: contextUsers } = useUser();
    const { addToast } = useToast();
    const [shareTab, setShareTab] = useState('menu'); // 'menu' | 'community' | 'users'
    const [searchQuery, setSearchQuery] = useState('');
    const [allPlatformUsers, setAllPlatformUsers] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Communities list for community share
    const [communities, setCommunities] = useState([]);
    const [communitySearchQuery, setCommunitySearchQuery] = useState('');
    const [selectedCommunityId, setSelectedCommunityId] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [copied, setCopied] = useState(false);

    const backdropRef = useRef(null);

    const item = article || post || propItem;

    // Detect Content Type
    const contentTypeStr = propContentType || (
        item?.audioUrl || item?.series || item?.podcastId || item?.type === 'Podcast' || item?.type === 'podcast' || item?.type === 'podcast_share' ? 'Podcast' :
        item?.videoUrl || item?.sourceUrl || item?.type === 'video_share' || item?.type === 'Video' || item?.type === 'video' ? 'Video' :
        item?.type === 'Community' || item?.type === 'community' || (item?.memberCount !== undefined && item?.rules) ? 'Community' :
        item?.articleId || item?.type === 'article' || item?.type === 'Article' || item?.type === 'article_share' || item?.contentType === 'Article' || item?.sharedArticle ? 'Article' :
        item?.content && !item?.body ? 'Post' :
        'Article'
    );

    const contentId = (
        item?.articleId || item?.videoId || item?.podcastId || item?.sharedPostId || 
        item?.sharedArticle?.id || item?.sharedVideo?.id || item?.sharedPodcast?.id || item?.sharedContent?.id ||
        item?.contentId || item?.postId || item?.id || item?.communityId || 1
    );
    const itemTitle = item?.title || item?.name || (item?.content ? (item.content.length > 50 ? item.content.substring(0, 50) + '...' : item.content) : contentTypeStr);
    const itemThumbnail = (
        item?.thumbnail || item?.thumbnailUrl || item?.coverImage || item?.coverUrl || item?.banner ||
        item?.bannerUrl || item?.bannerImageUrl || (item?.attachments && item.attachments[0]?.url) ||
        item?.imageUrl || item?.image || null
    );
    const itemAuthor = (
        item?.authorName || item?.authorFullName || item?.author?.name || (typeof item?.author === 'string' ? item.author : '') ||
        item?.host || item?.speaker || item?.createdBy || item?.createdByUserName || 'MPOnline Team'
    );

    useEffect(() => {
        if (isOpen) {
            setShareTab('menu');
            setSelectedUsers([]);
            setSearchQuery('');
            setCommunitySearchQuery('');
            setSelectedCommunityId('');

            const loadCommunities = async () => {
                try {
                    const data = await communitiesApi.getAll().catch(() => null);
                    const rawList = Array.isArray(data) ? data : (data?.data || []);

                    const deletedIds = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]').map(String));
                    const deletedNames = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_names') || '[]').map(n => String(n).toLowerCase().trim()));
                    const existingIds = new Set();
                    const existingNames = new Set();
                    const combinedList = [];

                    // 1. Process API communities
                    rawList
                        .filter(c => !deletedIds.has(String(c.communityId || c.id)) && !deletedNames.has((c.name || c.title || '').toLowerCase().trim()) && (c.isActive === undefined || c.isActive === true || c.isActive === 1))
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
        if (!communitySearchQuery.trim()) {
            return communities;
        }
        const q = communitySearchQuery.trim().toLowerCase();
        return communities.filter(c => {
            const name = (c.name || '').toLowerCase();
            const cat = (c.category || '').toLowerCase();
            const desc = (c.description || '').toLowerCase();
            return name.includes(q) || cat.includes(q) || desc.includes(q);
        });
    }, [communities, communitySearchQuery]);

    // Load all platform users (context + API) when opening share with users tab
    useEffect(() => {
        if (!isOpen || shareTab !== 'users') return;

        const loadAllUsers = async () => {
            setIsSearching(true);
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
                } catch { /* keep baseline users */ }

                const currentId = String(currentUser?.userId || currentUser?.id || '');
                const currentEmpId = String(currentUser?.employeeId || '').toLowerCase();

                const filtered = merged.filter(u => {
                    const idMatch = currentId && String(u.userId || u.id) === currentId;
                    const empMatch = currentEmpId && String(u.employeeId || '').toLowerCase() === currentEmpId;
                    return !idMatch && !empMatch;
                });

                setAllPlatformUsers(filtered);
            } finally {
                setIsSearching(false);
            }
        };

        loadAllUsers();
    }, [isOpen, shareTab, contextUsers, currentUser]);

    // Filter & Sort users with exact/starts-with matches prioritized at the VERY TOP!
    const displayedUserList = React.useMemo(() => {
        if (!searchQuery.trim()) {
            return allPlatformUsers;
        }

        const query = searchQuery.trim().toLowerCase();

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
    }, [allPlatformUsers, searchQuery]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !item) return null;

    // Generate Share URL based on content type
    const shareUrl = (
        contentTypeStr === 'Podcast' ? `${window.location.origin}/podcasts?id=${contentId}` :
        contentTypeStr === 'Video' ? `${window.location.origin}/videos?id=${contentId}` :
        contentTypeStr === 'Post' ? `${window.location.origin}/posts?id=${contentId}` :
        contentTypeStr === 'Community' ? `${window.location.origin}/community/view?id=${contentId}` :
        `${window.location.origin}/article-view?id=${contentId}`
    );

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        if (/^\d+$/.test(String(contentId))) {
            interactionsApi.shareContent(contentTypeStr, Number(contentId), 'Direct', null).catch(() => {});
        }
        if (onShared) onShared('link', 1);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: itemTitle,
                    text: item.subtitle || item.description || item.content || itemTitle,
                    url: shareUrl
                });
                if (onShared) onShared('native', 1);
                onClose();
            } catch (err) {
                console.warn('Native share cancelled or failed', err);
            }
        } else {
            handleCopyLink();
        }
    };

    const handleShareToCommunity = async () => {
        if (!selectedCommunityId) return;
        setIsSharing(true);
        const targetComm = communities.find(c => String(c.communityId || c.id) === String(selectedCommunityId));
        const commName = targetComm?.name || targetComm?.title || 'Community';
        const targetCommIdNum = parseInt(selectedCommunityId);

        try {
            // 1. Record backend share interaction
            await interactionsApi.shareContent(contentTypeStr, contentId, 'Community', targetCommIdNum).catch(() => {});
            
            // 2. Persist post to SQL Server database Posts & CommunityPosts tables
            try {
                await postsApi.create({
                    contentText: `Shared ${contentTypeStr}: "${itemTitle}"\n${shareUrl}`,
                    audienceType: 'Community',
                    audienceCommunityIds: [targetCommIdNum]
                });
            } catch (postErr) {
                console.warn('Backend community post creation notice:', postErr);
            }

            // 3. Build rich community feed post item for immediate local visibility
            const newFeedItem = {
                id: `shared_${contentTypeStr.toLowerCase()}_${Date.now()}`,
                userId: currentUser?.userId || currentUser?.id || 1,
                author: currentUser?.fullName || currentUser?.name || 'Employee',
                authorName: currentUser?.fullName || currentUser?.name || 'Employee',
                authorRole: currentUser?.roleName || 'Employee',
                authorAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                avatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                time: 'Just now',
                timeAgo: 'Just now',
                publishedDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                title: itemTitle,
                content: `Shared ${contentTypeStr}: "${itemTitle}"\n${shareUrl}`,
                communityId: targetCommIdNum,
                communityName: commName,
                type: `${contentTypeStr.toLowerCase()}_share`,
                // Specific typed metadata so CommunityView can render beautiful preview cards:
                sharedContent: {
                    type: contentTypeStr,
                    id: contentId,
                    title: itemTitle,
                    url: shareUrl,
                    thumbnail: itemThumbnail,
                    author: itemAuthor
                },
                ...(contentTypeStr === 'Video' ? {
                    sharedVideo: {
                        id: contentId,
                        videoId: contentId,
                        title: itemTitle,
                        sourceUrl: item?.videoUrl || item?.url || item?.sourceUrl || shareUrl,
                        thumbnail: itemThumbnail,
                        author: itemAuthor,
                        authorAvatar: item?.authorAvatar || item?.avatar || null,
                        authorRole: item?.authorRole || item?.authorDesignation || item?.role || 'Enterprise Contributor',
                        description: item?.description || item?.content || '',
                        duration: item?.duration || item?.durationSeconds || 'Video Session',
                        category: item?.category || item?.categoryName || 'Training & Tutorials'
                    },
                    videoUrl: item?.videoUrl || item?.url || item?.sourceUrl || shareUrl,
                    thumbnail: itemThumbnail
                } : {}),
                ...(contentTypeStr === 'Article' ? {
                    sharedArticle: {
                        id: contentId,
                        title: itemTitle,
                        url: shareUrl,
                        thumbnail: itemThumbnail,
                        author: itemAuthor
                    },
                    thumbnail: itemThumbnail
                } : {}),
                ...(contentTypeStr === 'Podcast' ? {
                    sharedPodcast: {
                        id: contentId,
                        title: itemTitle,
                        url: shareUrl,
                        thumbnail: itemThumbnail,
                        author: itemAuthor
                    },
                    thumbnail: itemThumbnail
                } : {}),
                ...(contentTypeStr === 'Post' ? {
                    sharedPostId: contentId,
                    title: `Shared Post: "${itemTitle}"`
                } : {}),
                attachments: itemThumbnail ? [{ type: 'image', url: itemThumbnail }] : [],
                likes: 0,
                comments: 0,
                shares: 0,
                isPinned: false
            };

            // Save to community-specific posts list
            const savedKey = `knome_community_posts_${selectedCommunityId}`;
            const existingCommFeed = JSON.parse(localStorage.getItem(savedKey) || '[]');
            localStorage.setItem(savedKey, JSON.stringify([newFeedItem, ...existingCommFeed]));


            // 4. Dispatch events for instantaneous UI updates across all open views
            window.dispatchEvent(new StorageEvent('storage', { key: savedKey }));
            window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: selectedCommunityId, post: newFeedItem } }));
            window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: selectedCommunityId, post: newFeedItem } }));
            window.dispatchEvent(new CustomEvent('post-created'));

            if (onShared) onShared('community', 1);
            addToast(`🎉 ${contentTypeStr} successfully shared to "${commName}" community feed!`, 'success');
            onClose();
        } catch (err) {
            console.error(`Failed to share ${contentTypeStr.toLowerCase()} to community`, err);
            addToast(`Failed to share ${contentTypeStr.toLowerCase()} to community. Please try again.`, 'error');
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareToUsers = async () => {
        if (selectedUsers.length === 0) return;
        setIsSharing(true);
        try {
            const senderName = currentUser?.fullName || currentUser?.name || 'Someone';
            const icon = (
                contentTypeStr === 'Podcast' ? 'podcasts' : 
                contentTypeStr === 'Video' ? 'videocam' : 
                contentTypeStr === 'Community' ? 'groups' :
                contentTypeStr === 'Post' ? 'chat' : 'article'
            );
            const color = (
                contentTypeStr === 'Podcast' ? 'text-pink-500' : 
                contentTypeStr === 'Video' ? 'text-rose-500' : 
                contentTypeStr === 'Community' ? 'text-indigo-400' :
                contentTypeStr === 'Post' ? 'text-blue-500' : 'text-emerald-500'
            );
            const bg = (
                contentTypeStr === 'Podcast' ? 'bg-pink-500/10' : 
                contentTypeStr === 'Video' ? 'bg-rose-500/10' : 
                contentTypeStr === 'Community' ? 'bg-indigo-500/10' :
                contentTypeStr === 'Post' ? 'bg-blue-500/10' : 'bg-emerald-500/10'
            );
            const textMsg = `${senderName} shared a ${contentTypeStr.toLowerCase()} with you: "${itemTitle}"`;

            // 1. Send backend share interaction for each user
            await Promise.all(selectedUsers.map(u => 
                interactionsApi.shareContent(contentTypeStr, contentId, 'User', u.id || u.userId).catch(() => {})
            ));

            // 2. Persist backend notifications in SQL Server database
            await Promise.all(selectedUsers.map(u => 
                notificationsApi.create({
                    recipientUserId: u.id || u.userId,
                    notificationType: 'Share',
                    message: textMsg,
                    relatedContentType: contentTypeStr,
                    referenceId: contentId
                }).catch(() => {})
            ));

            // 3. Construct rich local notification objects for instant recipient isolation
            const notifsToStore = selectedUsers.map(u => ({
                id: `local_share_${contentTypeStr.toLowerCase()}_${contentId}_${u.id || u.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'share',
                category: contentTypeStr === 'Community' ? 'Community' : 'Shares',
                icon,
                color,
                bg,
                text: textMsg,
                message: textMsg,
                senderName,
                senderAvatar: currentUser?.profilePhotoUrl || currentUser?.avatar || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                targetUserId: u.id || u.userId,
                targetEmployeeId: u.employeeId,
                recipientUserId: u.id || u.userId,
                employeeId: u.employeeId,
                unread: true,
                targetUrl: shareUrl,
                actionLink: shareUrl,
                linkUrl: shareUrl,
                relatedContentType: contentTypeStr,
                relatedContentId: contentId,
                thumbnail: itemThumbnail,
                title: itemTitle
            }));

            // Save to localStorage
            const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            localStorage.setItem('knome_notifications', JSON.stringify([...notifsToStore, ...existingNotifs]));

            // 4. Dispatch events for real-time notification bell & dropdown update
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_notifications' }));
            window.dispatchEvent(new CustomEvent('notification-updated'));
            window.dispatchEvent(new CustomEvent('knome_new_notification'));
            notifsToStore.forEach(n => {
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: n }));
            });

            if (onShared) onShared('users', 1);
            addToast(`🚀 ${contentTypeStr} successfully shared with ${selectedUsers.length} team member(s)!`, 'success');
            onClose();
        } catch (err) {
            console.error(`Failed to share ${contentTypeStr.toLowerCase()} with users`, err);
            addToast(`Failed to share ${contentTypeStr.toLowerCase()} with some users.`, 'error');
        } finally {
            setIsSharing(false);
        }
    };

    const toggleSelectUser = (user) => {
        const uId = user.id || user.userId;
        if (selectedUsers.some(u => (u.id || u.userId) === uId)) {
            setSelectedUsers(prev => prev.filter(u => (u.id || u.userId) !== uId));
        } else {
            setSelectedUsers(prev => [...prev, user]);
        }
    };

    return createPortal(
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-left">
                
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        {shareTab !== 'menu' && (
                            <button
                                onClick={() => setShareTab('menu')}
                                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors cursor-pointer shrink-0"
                            >
                                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            </button>
                        )}
                        <div className="min-w-0">
                            <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 text-base truncate">
                                <span className="material-symbols-outlined text-blue-500">share</span>
                                {shareTab === 'community' ? 'Share to Community' : shareTab === 'users' ? 'Share with Users' : `Share ${contentTypeStr}`}
                            </h3>
                            <p className="text-[11px] text-slate-500 truncate font-medium">{itemTitle}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-4">
                    {shareTab === 'menu' && (
                        <div className="space-y-3">
                            
                            {/* Option 1: Share to Community */}
                            <div
                                onClick={() => setShareTab('community')}
                                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700/50 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/20 transition-all flex items-center gap-4 cursor-pointer group"
                            >
                                <div className="w-12 h-12 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-[24px]">groups</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-cyan-600 transition-colors">
                                        Share to Community
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Post this {contentTypeStr.toLowerCase()} directly into a specialized community feed
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                            </div>

                            {/* Option 2: Share with Users */}
                            <div
                                onClick={() => setShareTab('users')}
                                className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700/50 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-all flex items-center gap-4 cursor-pointer group"
                            >
                                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined text-[24px]">person_add</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-purple-600 transition-colors">
                                        Share with Users
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Send direct notifications to specific MPOnline team members
                                    </p>
                                </div>
                                <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                            </div>
                        </div>
                    )}

                    {/* Tab: Share to Community */}
                    {shareTab === 'community' && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Select Target Community ({filteredCommunities.length})
                                    </label>
                                    {selectedCommunityId && (
                                        <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 truncate max-w-[180px]">
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
                                        className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
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
                                                    className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                                                        isSelected 
                                                            ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-sm' 
                                                            : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:border-slate-200 dark:hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200/60 dark:border-slate-700/60 bg-blue-100 dark:bg-blue-950/40 relative">
                                                            <img
                                                                src={thumb}
                                                                alt={c.name}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                                onError={(e) => {
                                                                    e.target.onerror = null;
                                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'Community')}&background=3b82f6&color=fff&bold=true`;
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>
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
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                            isSelected 
                                                                ? 'bg-blue-600 text-white shadow-xs' 
                                                                : 'border-2 border-slate-300 dark:border-slate-600 group-hover:border-blue-400'
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
                                disabled={isSharing || !selectedCommunityId}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharing ? 'Sharing to Community...' : `Share ${contentTypeStr} to Community`}
                            </button>
                        </div>
                    )}

                    {/* Tab: Share with Users */}
                    {shareTab === 'users' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Search colleague by name or employee ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Selected Users Chips */}
                            {selectedUsers.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl max-h-24 overflow-y-auto">
                                    {selectedUsers.map(u => (
                                        <span key={u.id || u.userId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-xs font-bold shadow-sm">
                                            {u.name || u.fullName}
                                            <button onClick={() => toggleSelectUser(u)} className="hover:text-red-200 cursor-pointer">
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Search Results List */}
                            <div className="max-h-72 overflow-y-auto space-y-1.5 border border-slate-100 dark:border-slate-800/80 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-800/30 custom-scrollbar">
                                {isSearching ? (
                                    <div className="py-6 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] animate-spin text-indigo-500">progress_activity</span>
                                        Loading teammates...
                                    </div>
                                ) : displayedUserList.length > 0 ? (
                                    displayedUserList.map(u => {
                                        const uId = u.id || u.userId;
                                        const isSelected = selectedUsers.some(sel => String(sel.id || sel.userId) === String(uId));
                                        return (
                                            <div
                                                key={uId}
                                                onClick={() => toggleSelectUser(u)}
                                                className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${
                                                    isSelected 
                                                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-300' 
                                                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border-transparent text-slate-700 dark:text-slate-300'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                                    <img
                                                        src={resolveMediaUrl(u.avatar || u.profilePhotoUrl)}
                                                        onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.fullName || 'Colleague')}&background=6366f1&color=fff&bold=true`; }}
                                                        className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs"
                                                        alt={u.name || u.fullName}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-xs font-bold leading-tight text-slate-900 dark:text-white truncate">
                                                                <HighlightText text={u.name || u.fullName} query={searchQuery} />
                                                            </p>
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                            <HighlightText text={`${u.designation && u.designation !== 'Employee' && u.designation !== 'Staff' ? u.designation : (u.roleName || u.role || 'Employee')} • ${u.department || 'MPOnline'}`} query={searchQuery} />
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                                                    isSelected 
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
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
                                    <div className="py-6 text-center text-xs text-slate-400 font-bold">
                                        No users found matching "{searchQuery}"
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleShareToUsers}
                                disabled={isSharing || selectedUsers.length === 0}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                {isSharing ? 'Sharing...' : `Share with ${selectedUsers.length} Selected Member(s)`}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
