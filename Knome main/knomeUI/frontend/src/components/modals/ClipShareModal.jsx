import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { clipsApi, communitiesApi, postsApi, messagesApi, resolveMediaUrl } from '../../utils/apiService';

export default function ClipShareModal({ isOpen, onClose, clip, onClipShared }) {
    const { currentUser, users: allUsers } = useUser();
    const { addToast } = useToast();

    const [shareTab, setShareTab] = useState('Community'); // 'Community', 'User', 'Link'
    const [communities, setCommunities] = useState([]);
    const [selectedCommunityId, setSelectedCommunityId] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [shareNote, setShareNote] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [hasCopiedLink, setHasCopiedLink] = useState(false);

    useEffect(() => {
        if (isOpen) {
            communitiesApi.getAll().then(res => {
                const list = Array.isArray(res) ? res : (res?.data || []);
                setCommunities(list);
                if (list.length > 0 && !selectedCommunityId) {
                    setSelectedCommunityId(String(list[0].communityId || list[0].id));
                }
            }).catch(() => {});
            setShareNote('');
            setHasCopiedLink(false);
        }
    }, [isOpen]);

    const clipId = clip?.clipId || clip?.id;
    const clipShareUrl = `${window.location.origin}/clips?id=${clipId}`;

    const handleCopyLink = () => {
        if (!clipId) return;
        navigator.clipboard.writeText(clipShareUrl);
        setHasCopiedLink(true);
        addToast('Professional clip link copied to clipboard!', 'success');
        setTimeout(() => setHasCopiedLink(false), 3000);
    };

    const handleExecuteShare = async () => {
        if (!clipId) return;

        setIsSharing(true);
        try {
            if (shareTab === 'Community') {
                if (!selectedCommunityId) {
                    addToast('Please select a target community.', 'warning');
                    setIsSharing(false);
                    return;
                }

                const targetCommId = Number(selectedCommunityId);
                const cleanNote = shareNote.trim();
                const postContentText = cleanNote 
                    ? `${cleanNote}\n\n🎬 Shared Clip: "${clip.title}"\n${clipShareUrl}`
                    : `🎬 Shared Clip: "${clip.title}"\n${clipShareUrl}`;

                // 1. Backend ClipShare record
                await clipsApi.share(clipId, {
                    sharedToType: 'Community',
                    targetId: targetCommId,
                    note: cleanNote || null
                });

                // 2. Publish to community feed
                let createdPost = null;
                const postAttachments = [clip.thumbnailUrl || clip.videoUrl, clip.videoUrl].filter(Boolean);
                const postTypes = clip.thumbnailUrl ? ['Image', 'Video'] : ['Video'];

                try {
                    if (typeof communitiesApi.createPost === 'function') {
                        createdPost = await communitiesApi.createPost(targetCommId, {
                            contentText: postContentText,
                            attachmentUrls: postAttachments,
                            attachmentTypes: postTypes
                        });
                    }
                } catch (commErr) {
                    console.warn('Community post sync note:', commErr);
                }

                if (!createdPost) {
                    try {
                        createdPost = await postsApi.create({
                            contentText: postContentText,
                            audienceType: 'Community',
                            audienceCommunityIds: [targetCommId],
                            status: 'Published',
                            attachmentUrls: postAttachments,
                            attachmentTypes: postTypes
                        });
                    } catch (feedErr) {
                        console.warn('Community feed post sync notice:', feedErr);
                    }
                }

                // 3. Instant local cache synchronization for zero-latency UI update
                try {
                    const savedPostsKey = `knome_community_posts_${targetCommId}`;
                    const existingCommPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');
                    const newFeedPost = {
                        id: (createdPost?.data?.postId || createdPost?.postId || Date.now()),
                        author: currentUser?.name || currentUser?.fullName || 'Colleague',
                        role: currentUser?.designation || currentUser?.roleName || 'Member',
                        avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                        time: 'Just now',
                        content: postContentText,
                        attachments: postAttachments,
                        images: clip.thumbnailUrl ? [clip.thumbnailUrl] : [],
                        attachmentUrls: postAttachments,
                        likes: 0,
                        comments: 0,
                        isPinned: false,
                        type: 'clip_share',
                        clipId: clipId,
                        clipTitle: clip.title,
                        clipThumbnail: clip.thumbnailUrl || null,
                        clipVideoUrl: clip.videoUrl,
                        sharedClip: {
                            clipId: clipId,
                            title: clip.title,
                            thumbnailUrl: clip.thumbnailUrl || null,
                            videoUrl: clip.videoUrl,
                            duration: clip.durationSeconds || null,
                            sharerName: currentUser?.name || currentUser?.fullName || 'Colleague',
                            sharerAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                            sharerRole: currentUser?.designation || currentUser?.roleName || 'Member'
                        }
                    };
                    localStorage.setItem(savedPostsKey, JSON.stringify([newFeedPost, ...existingCommPosts]));

                    // Also add to global knome_local_posts
                    const globalLocalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                    localStorage.setItem('knome_local_posts', JSON.stringify([newFeedPost, ...globalLocalPosts]));

                    window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: targetCommId } }));
                    window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: targetCommId } }));
                    window.dispatchEvent(new CustomEvent('post-created'));
                    window.dispatchEvent(new StorageEvent('storage', { key: savedPostsKey }));
                    window.dispatchEvent(new StorageEvent('storage', { key: 'knome_local_posts' }));
                } catch (cacheErr) {
                    console.warn('Local feed cache notice:', cacheErr);
                }

                addToast('Clip successfully shared to community feed!', 'success');
            } else if (shareTab === 'User') {
                if (!selectedUserId) {
                    addToast('Please select a colleague to share with.', 'warning');
                    setIsSharing(false);
                    return;
                }

                // Backend Direct ClipShare (generates direct notification for recipient)
                await clipsApi.share(clipId, {
                    sharedToType: 'User',
                    targetId: Number(selectedUserId),
                    note: shareNote.trim() || null
                });

                // Also send directly into their 1-to-1 conversation with the direct link!
                try {
                    const msgContent = shareNote.trim()
                        ? `${shareNote.trim()}\n\n${clipShareUrl}`
                        : clipShareUrl;
                    await messagesApi.send(Number(selectedUserId), msgContent);
                } catch (dmErr) {
                    console.warn('Direct chat sync notice:', dmErr);
                }

                addToast('Clip sent directly to colleague with notification & message!', 'success');
            }

            if (onClipShared) onClipShared();
            onClose();
        } catch (err) {
            console.error('Failed to share clip:', err);
            addToast('Failed to share clip. Please try again.', 'error');
        } finally {
            setIsSharing(false);
        }
    };

    if (!isOpen || !clip) return null;

    const filteredUsers = (allUsers || [])
        .filter(u => Number(u.id || u.userId) !== Number(currentUser?.id || currentUser?.userId))
        .filter(u => {
            if (!userSearchTerm.trim()) return true;
            const q = userSearchTerm.toLowerCase();
            return (u.name || u.fullName || '').toLowerCase().includes(q) ||
                   (u.designation || '').toLowerCase().includes(q) ||
                   (u.department || '').toLowerCase().includes(q);
        });

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl">share</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">Share Clip</h3>
                            <p className="text-xs text-slate-500 truncate max-w-xs font-medium">"{clip.title}"</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2">
                    {[
                        { id: 'Community', label: 'To Community', icon: 'groups' },
                        { id: 'User', label: 'Direct to Colleague', icon: 'person' },
                        { id: 'Link', label: 'Copy Link', icon: 'link' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setShareTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs border-b-2 transition -mb-px ${
                                shareTab === tab.id
                                    ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-4">
                    
                    {/* Mode 1: Community Share */}
                    {shareTab === 'Community' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                                Choose Community
                            </label>
                            <select
                                value={selectedCommunityId}
                                onChange={(e) => setSelectedCommunityId(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
                            >
                                {communities.map(c => (
                                    <option key={c.communityId || c.id} value={c.communityId || c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                This clip will appear prominently in the selected community feed for all members.
                            </p>
                        </div>
                    )}

                    {/* Mode 2: Direct Colleague Share */}
                    {shareTab === 'User' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                                Choose Colleague
                            </label>
                            <div className="relative mb-2">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                                <input
                                    type="text"
                                    value={userSearchTerm}
                                    onChange={(e) => setUserSearchTerm(e.target.value)}
                                    placeholder="Search by name, designation, or department..."
                                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1 p-1 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                                {filteredUsers.slice(0, 30).map(u => {
                                    const uid = String(u.id || u.userId);
                                    const isSelected = selectedUserId === uid;
                                    const uAvatar = resolveMediaUrl(u.avatar || u.profilePhotoUrl);

                                    return (
                                        <div
                                            key={uid}
                                            onClick={() => setSelectedUserId(uid)}
                                            className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition ${
                                                isSelected
                                                    ? 'bg-pink-500 text-white font-bold'
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            <img
                                                src={uAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.fullName || 'User')}&background=ec4899&color=fff`}
                                                alt=""
                                                className="w-7 h-7 rounded-full object-cover"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs truncate">{u.name || u.fullName}</p>
                                                <p className={`text-[10px] truncate ${isSelected ? 'text-pink-100' : 'text-slate-400'}`}>
                                                    {u.designation || 'Colleague'}
                                                </p>
                                            </div>
                                            {isSelected && (
                                                <span className="material-symbols-outlined text-base">check_circle</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">
                                Recipient will receive an instant notification with a direct link to this Clip.
                            </p>
                        </div>
                    )}

                    {/* Mode 3: Copy Link */}
                    {shareTab === 'Link' && (
                        <div className="space-y-3.5">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Direct Shareable URL
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={clipShareUrl}
                                    onClick={(e) => e.target.select()}
                                    className="flex-1 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-mono outline-none select-all focus:ring-2 focus:ring-pink-500"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs hover:from-pink-600 hover:to-rose-600 shadow-md shadow-pink-500/25 transition shrink-0 flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-sm">
                                        {hasCopiedLink ? 'done' : 'content_copy'}
                                    </span>
                                    {hasCopiedLink ? 'Copied!' : 'Copy Link'}
                                </button>
                            </div>

                            {/* Clean visual preview */}
                            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center gap-3.5 shadow-sm">
                                <div className="w-14 h-20 rounded-xl overflow-hidden bg-slate-900 shrink-0 relative border border-slate-700/60">
                                    {clip.thumbnailUrl ? (
                                        <img 
                                            src={resolveMediaUrl(clip.thumbnailUrl) || clip.thumbnailUrl} 
                                            alt={clip.title} 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-pink-500 bg-slate-900">
                                            <span className="material-symbols-outlined text-xl">movie_filter</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-full bg-pink-500/90 flex items-center justify-center text-white">
                                            <span className="material-symbols-outlined text-xs ml-0.5">play_arrow</span>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[8px] font-bold text-white">
                                        CLIP
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-500 font-extrabold text-[9px] uppercase tracking-wider">
                                            Verified Link
                                        </span>
                                        <span className="text-[10px] text-slate-400">ID: #{clipId}</span>
                                    </div>
                                    <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate mb-0.5">
                                        {clip.title}
                                    </h5>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-2">
                                        Anyone with this link will open and play this exact Clip directly in the viewer.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Optional Note (For Community or User shares) */}
                    {shareTab !== 'Link' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                Add a Note (Optional)
                            </label>
                            <textarea
                                rows={2}
                                value={shareNote}
                                onChange={(e) => setShareNote(e.target.value)}
                                placeholder="Say something about why you're sharing this clip..."
                                className="w-full px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                            />
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition"
                    >
                        Close
                    </button>
                    {shareTab !== 'Link' && (
                        <button
                            type="button"
                            disabled={isSharing || (shareTab === 'Community' && !selectedCommunityId) || (shareTab === 'User' && !selectedUserId)}
                            onClick={handleExecuteShare}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSharing ? 'Sharing...' : 'Share Now'}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
}
