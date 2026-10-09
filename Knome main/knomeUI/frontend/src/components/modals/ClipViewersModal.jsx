import React, { useState, useEffect, useMemo } from 'react';
import { useUser, resolveEmployeeName } from '../contexts/UserContext';
import { clipsApi, resolveMediaUrl } from '../../utils/apiService';

/**
 * Format relative viewing timestamp
 */
const formatViewTime = (dateStr) => {
    if (!dateStr) return 'Recently';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit'
    });
};

export default function ClipViewersModal({ isOpen, onClose, clip }) {
    const { currentUser, users: allUsers } = useUser();
    const [viewers, setViewers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const clipId = clip?.clipId || clip?.id;

    // Fetch viewers whenever modal opens or clipId changes
    useEffect(() => {
        if (!isOpen || !clipId) return;

        let isMounted = true;
        setIsLoading(true);

        const fetchViewers = async () => {
            try {
                const res = await clipsApi.getViewers(clipId);
                const data = Array.isArray(res) ? res : (res?.data || []);
                if (isMounted) {
                    setViewers(data);
                }
            } catch (err) {
                console.warn('Failed to load clip viewers:', err);
                if (isMounted) {
                    setViewers([]);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchViewers();

        // Listen for real-time engagement updates to live-append new viewers
        const handleEngagementUpdate = (e) => {
            const detail = e.detail;
            if (detail && String(detail.clipId) === String(clipId) && detail.updateType === 'view') {
                fetchViewers();
            }
        };

        window.addEventListener('knome:clip-engagement-updated', handleEngagementUpdate);
        window.addEventListener('knome:view-updated', handleEngagementUpdate);

        return () => {
            isMounted = false;
            window.removeEventListener('knome:clip-engagement-updated', handleEngagementUpdate);
            window.removeEventListener('knome:view-updated', handleEngagementUpdate);
        };
    }, [isOpen, clipId]);

    // Reset search on close/open
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
        }
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Filter viewers by search query
    const filteredViewers = useMemo(() => {
        if (!searchQuery.trim()) return viewers;
        const q = searchQuery.toLowerCase().trim();
        return viewers.filter(v => {
            const name = (v.fullName || '').toLowerCase();
            const empId = (v.employeeId || '').toLowerCase();
            const desig = (v.designation || '').toLowerCase();
            const dept = (v.department || '').toLowerCase();
            return name.includes(q) || empId.includes(q) || desig.includes(q) || dept.includes(q);
        });
    }, [viewers, searchQuery]);

    if (!isOpen) return null;

    const totalCount = viewers.length;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-scale-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/25">
                            <span className="material-symbols-outlined text-xl">visibility</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                                    Who Viewed
                                </h3>
                                <span className="px-2 py-0.5 rounded-full bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 font-bold text-xs">
                                    {totalCount} {totalCount === 1 ? 'Viewer' : 'Viewers'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-sm mt-0.5">
                                {clip?.title || 'Clip Viewer History'}
                            </p>
                        </div>
                    </div>

                    {/* Top-right close button (only button per UX rule) */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">
                            search
                        </span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search viewers by name, ID, or department..."
                            className="w-full pl-10 pr-9 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500 transition"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <span className="material-symbols-outlined text-base">cancel</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Viewers List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[220px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                            <div className="w-9 h-9 border-3 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
                            <p className="text-xs font-medium">Loading viewer activity...</p>
                        </div>
                    ) : viewers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 px-6">
                            <div className="w-14 h-14 rounded-2xl bg-pink-500/10 text-pink-500 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-3xl">visibility_off</span>
                            </div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No views recorded yet</h4>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs">
                                When colleagues watch this clip, their view details and timestamps will appear here in real time.
                            </p>
                        </div>
                    ) : filteredViewers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 px-6">
                            <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">person_search</span>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                No viewers match "{searchQuery}"
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or ID.</p>
                        </div>
                    ) : (
                        filteredViewers.map((viewer, idx) => {
                            const isMe = Boolean(
                                (currentUser?.userId && Number(viewer.userId) === Number(currentUser.userId)) ||
                                (currentUser?.id && Number(viewer.userId) === Number(currentUser.id)) ||
                                (currentUser?.employeeId && viewer.employeeId &&
                                    String(currentUser.employeeId).toUpperCase() === String(viewer.employeeId).toUpperCase())
                            );

                            const displayName = viewer.fullName || viewer.employeeId || 'Colleague';
                            const avatarSrc = resolveMediaUrl(viewer.profilePhotoUrl) || 
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ec4899&color=fff&bold=true`;

                            return (
                                <div
                                    key={viewer.userId || idx}
                                    className="p-3 rounded-2xl bg-slate-50/70 hover:bg-slate-100/90 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 transition"
                                >
                                    {/* User Avatar + Details */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="relative shrink-0">
                                            <img
                                                src={avatarSrc}
                                                alt={displayName}
                                                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=ec4899&color=fff`;
                                                }}
                                            />
                                            {isMe && (
                                                <div 
                                                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" 
                                                    title="Active"
                                                />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                                    {displayName}
                                                </h4>
                                                {isMe && (
                                                    <span className="px-1.5 py-0.2 rounded-md bg-pink-500/10 text-pink-500 font-extrabold text-[9px] uppercase tracking-wider">
                                                        You
                                                    </span>
                                                )}
                                                {viewer.employeeId && (
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        ({viewer.employeeId})
                                                    </span>
                                                )}
                                            </div>

                                            {(viewer.designation || viewer.department) && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                    {viewer.designation || 'Staff'} {viewer.department ? `• ${viewer.department}` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Viewed Time Stamp */}
                                    <div 
                                        className="flex items-center gap-1 text-slate-400 dark:text-slate-500 shrink-0 text-right"
                                        title={viewer.viewedDate ? new Date(viewer.viewedDate).toLocaleString() : 'Recently'}
                                    >
                                        <span className="material-symbols-outlined text-xs">schedule</span>
                                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                            {formatViewTime(viewer.viewedDate)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Subtle Status Footer (NO bottom cancel button per project rules) */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Live engagement tracking active</span>
                    </div>
                    <span>Unique views recorded</span>
                </div>
            </div>
        </div>
    );
}
