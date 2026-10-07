import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { clipsApi, communitiesApi, postsApi, resolveMediaUrl } from '../../utils/apiService';

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

    const clipShareUrl = `${window.location.origin}/clips?id=${clip?.clipId}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(clipShareUrl);
        setHasCopiedLink(true);
        addToast('Clip link copied to clipboard!', 'success');
        setTimeout(() => setHasCopiedLink(false), 3000);
    };

    const handleExecuteShare = async () => {
        if (!clip?.clipId) return;

        setIsSharing(true);
        try {
            if (shareTab === 'Community') {
                if (!selectedCommunityId) {
                    addToast('Please select a target community.', 'warning');
                    setIsSharing(false);
                    return;
                }

                // 1. Backend ClipShare record
                await clipsApi.share(clip.clipId, {
                    sharedToType: 'Community',
                    targetId: Number(selectedCommunityId),
                    note: shareNote.trim() || null
                });

                // 2. Also publish to community feed as a shared post so community members see it
                try {
                    const commName = communities.find(c => String(c.communityId || c.id) === String(selectedCommunityId))?.name || 'Community';
                    await postsApi.createPost({
                        contentText: shareNote.trim() 
                            ? `${shareNote.trim()}\n\nShared Clip: "${clip.title}" 🎬\n${clipShareUrl}`
                            : `🎬 Check out this Clip: "${clip.title}"\n${clipShareUrl}`,
                        audienceType: 'Community',
                        audienceCommunityIds: [Number(selectedCommunityId)],
                        visibility: 'Community',
                        mediaUrls: [clip.videoUrl],
                        thumbnailUrl: clip.thumbnailUrl || null
                    });
                } catch (feedErr) {
                    console.warn('Community feed post sync notice:', feedErr);
                }

                addToast('Clip successfully shared to community feed!', 'success');
            } else if (shareTab === 'User') {
                if (!selectedUserId) {
                    addToast('Please select a colleague to share with.', 'warning');
                    setIsSharing(false);
                    return;
                }

                // Backend Direct ClipShare (generates direct notification for recipient)
                await clipsApi.share(clip.clipId, {
                    sharedToType: 'User',
                    targetId: Number(selectedUserId),
                    note: shareNote.trim() || null
                });

                addToast('Clip sent directly to colleague with notification!', 'success');
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
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                Direct Clip URL
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={clipShareUrl}
                                    className="flex-1 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-mono outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs hover:from-pink-600 hover:to-rose-600 shadow-md shadow-pink-500/25 transition shrink-0 flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-sm">
                                        {hasCopiedLink ? 'done' : 'content_copy'}
                                    </span>
                                    {hasCopiedLink ? 'Copied!' : 'Copy'}
                                </button>
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
