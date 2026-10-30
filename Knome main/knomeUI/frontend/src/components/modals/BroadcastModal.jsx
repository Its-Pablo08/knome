import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { notificationsApi } from '../../utils/apiService';

export default function BroadcastModal({ isOpen, onClose, initialData = null, broadcasts = [], onSuccess }) {
    const [broadcastsList, setBroadcastsList] = useState([]);
    const [selectedTab, setSelectedTab] = useState('new'); // 'new' | id/number
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [toastMessage, setToastMessage] = useState('');

    const resolveId = (item) => item?.id ?? item?.Id ?? item?.notificationId;

    // Fetch latest broadcasts on open or use provided broadcasts
    const refreshBroadcasts = useCallback(async (preferredSelectId = null) => {
        try {
            const res = await notificationsApi.broadcasts.getAll();
            const list = Array.isArray(res) ? res : (res?.items || res?.data || []);
            // Enforce at most 3 active broadcasts
            const capped = list.slice(0, 3);
            setBroadcastsList(capped);

            if (preferredSelectId !== null) {
                const found = capped.find(b => String(resolveId(b)) === String(preferredSelectId));
                if (found) {
                    setSelectedTab(String(resolveId(found)));
                    setTitle(found.title || '');
                    setMessage(found.content || found.message || '');
                    return;
                }
            }

            if (capped.length >= 3) {
                // If 3 are already active, default to editing the first broadcast
                setSelectedTab(String(resolveId(capped[0])));
                setTitle(capped[0].title || '');
                setMessage(capped[0].content || capped[0].message || '');
            } else if (capped.length > 0 && preferredSelectId === undefined) {
                // Default to new broadcast if slots available
                setSelectedTab('new');
                setTitle('');
                setMessage('');
            }
        } catch (e) {
            console.error('Failed to load active broadcasts for modal:', e);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setError('');
            setToastMessage('');

            if (initialData && resolveId(initialData)) {
                const initId = resolveId(initialData);
                setSelectedTab(String(initId));
                setTitle(initialData.title || '');
                setMessage(initialData.content || initialData.message || '');
                refreshBroadcasts(initId);
            } else {
                setSelectedTab('new');
                setTitle('');
                setMessage('');
                refreshBroadcasts();
            }
        }
    }, [isOpen, initialData, refreshBroadcasts]);

    if (!isOpen) return null;

    const currentBroadcast = selectedTab !== 'new' 
        ? broadcastsList.find(b => String(resolveId(b)) === String(selectedTab))
        : null;
    const isEditMode = Boolean(currentBroadcast && resolveId(currentBroadcast));

    const handleSelectTab = (tabKey) => {
        setSelectedTab(tabKey);
        setError('');
        setToastMessage('');
        if (tabKey === 'new') {
            setTitle('');
            setMessage('');
        } else {
            const item = broadcastsList.find(b => String(resolveId(b)) === String(tabKey));
            if (item) {
                setTitle(item.title || '');
                setMessage(item.content || item.message || '');
            }
        }
    };

    const templates = [
        {
            icon: 'campaign',
            label: 'All-Hands Town Hall',
            title: 'Organization Town Hall Meeting',
            message: 'Join leadership this Friday at 3:00 PM IST for our quarterly updates and open Q&A session.'
        },
        {
            icon: 'celebration',
            label: 'Company Holiday Notice',
            title: 'Upcoming Public Holiday Notice',
            message: 'All MPOnline offices will remain closed on the upcoming official holiday. Regular operations resume the following business day.'
        },
        {
            icon: 'build',
            label: 'System Maintenance',
            title: 'Scheduled Portal Maintenance',
            message: 'TechnoSocial and internal services will undergo scheduled infrastructure maintenance this Saturday between 11:00 PM and 2:00 AM IST.'
        },
        {
            icon: 'policy',
            label: 'HR Policy Update',
            title: 'Annual Employee Benefits Update',
            message: 'The revised employee health insurance and reimbursement guidelines for this fiscal year are now available for review.'
        }
    ];

    const handleApplyTemplate = (tmpl) => {
        setTitle(tmpl.title);
        setMessage(tmpl.message);
        setError('');
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        const trimmedMsg = message.trim();
        if (!trimmedMsg) {
            setError('Please enter an announcement message.');
            return;
        }
        if (trimmedMsg.length > 400) {
            setError('Announcement message cannot exceed 400 characters.');
            return;
        }

        if (!isEditMode && broadcastsList.length >= 3) {
            setError('At most 3 broadcasts can be active at the same time. Please remove or edit an existing broadcast.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            if (isEditMode) {
                const targetId = resolveId(currentBroadcast);
                await notificationsApi.broadcasts.update(targetId, {
                    title: title.trim(),
                    message: trimmedMsg
                });
                setToastMessage('Broadcast announcement updated successfully.');
            } else {
                await notificationsApi.broadcasts.send({
                    title: title.trim(),
                    message: trimmedMsg
                });
                setToastMessage('New broadcast published to all employees.');
            }

            // Dispatch global events for instant cross-tab / cross-component sync
            window.dispatchEvent(new CustomEvent('knome:broadcast-updated', {
                detail: { action: isEditMode ? 'updated' : 'created' }
            }));

            if (onSuccess) {
                try {
                    onSuccess();
                } catch (cbErr) {
                    console.warn('[BroadcastModal] onSuccess callback error (safely caught):', cbErr);
                }
            }

            await refreshBroadcasts();
            setTimeout(() => {
                onClose();
            }, 500);
        } catch (err) {
            console.error('Failed to save broadcast announcement:', err);
            setError(err?.response?.data?.message || err?.message || 'Failed to publish broadcast. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        const targetId = resolveId(currentBroadcast) || resolveId(initialData);
        if (!targetId) {
            setError('Could not identify broadcast to remove.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            await notificationsApi.broadcasts.delete(targetId);

            // Optimistically filter from local list
            const updated = broadcastsList.filter(b => String(resolveId(b)) !== String(targetId));
            setBroadcastsList(updated);

            setToastMessage('Broadcast announcement removed.');

            window.dispatchEvent(new CustomEvent('knome:broadcast-updated', {
                detail: { action: 'deleted', id: targetId }
            }));
            window.dispatchEvent(new CustomEvent('knome:broadcast-deleted', {
                detail: { id: targetId }
            }));

            if (onSuccess) {
                try {
                    onSuccess();
                } catch (cbErr) {
                    console.warn('[BroadcastModal] onSuccess callback error (safely caught):', cbErr);
                }
            }

            // Switch to remaining broadcast or switch to 'new' mode
            if (updated.length > 0) {
                const next = updated[0];
                setSelectedTab(String(resolveId(next)));
                setTitle(next.title || '');
                setMessage(next.content || next.message || '');
            } else {
                setSelectedTab('new');
                setTitle('');
                setMessage('');
            }
        } catch (err) {
            console.error('Failed to delete broadcast:', err);
            setError(err?.response?.data?.message || err?.message || 'Failed to remove broadcast announcement.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Toast Notification */}
                {toastMessage && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold rounded-2xl shadow-xl border border-slate-700/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
                        <span>{toastMessage}</span>
                    </div>
                )}

                {/* Header (Pinned) */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shrink-0">
                            <span className="material-symbols-outlined text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>
                                campaign
                            </span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {isEditMode ? 'Edit Broadcast Announcement' : 'New Organization Broadcast'}
                                </h3>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">
                                    HR Broadcast
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Organization-wide banner alert for all MPOnline employees (Up to 3 active)
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Broadcast Slots Switcher Tabs */}
                <div className="px-6 py-2.5 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
                    <div className="flex items-center gap-2">
                        {broadcastsList.map((b, idx) => {
                            const bId = String(resolveId(b));
                            const isSelected = selectedTab === bId;
                            return (
                                <button
                                    key={bId || idx}
                                    type="button"
                                    onClick={() => handleSelectTab(bId)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                        isSelected 
                                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20' 
                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500/50'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]" style={{fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0"}}>
                                        campaign
                                    </span>
                                    <span>Broadcast #{idx + 1}</span>
                                </button>
                            );
                        })}

                        {broadcastsList.length < 3 && (
                            <button
                                type="button"
                                onClick={() => handleSelectTab('new')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                    selectedTab === 'new'
                                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500/50'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[15px]">add</span>
                                <span>Add Broadcast ({broadcastsList.length}/3)</span>
                            </button>
                        )}
                    </div>

                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {broadcastsList.length === 3 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-black">3/3 Active (Max)</span>
                        ) : (
                            <span>{broadcastsList.length}/3 Active</span>
                        )}
                    </div>
                </div>

                {/* Body (Scrollable) */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
                    {/* Error Banner */}
                    {error && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Target Audience Pill & Broadcast Slot Info */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500 text-[18px]">group</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Audience:</span>
                            <span className="font-bold text-slate-900 dark:text-white">All Active Employees (Org-Wide)</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {isEditMode ? `Editing Slot ${broadcastsList.findIndex(b => String(resolveId(b)) === String(selectedTab)) + 1} of 3` : `New Broadcast (Slot ${broadcastsList.length + 1} of 3)`}
                        </span>
                    </div>

                    {/* Quick Preset Templates */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            Quick Templates
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {templates.map((tmpl, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleApplyTemplate(tmpl)}
                                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all text-left flex items-center gap-2 group cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-slate-400 group-hover:text-amber-500 text-[18px] transition-colors">
                                        {tmpl.icon}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white truncate">
                                        {tmpl.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Headline / Title */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Headline / Subject
                            </label>
                            <span className="text-[11px] text-slate-400 font-medium">
                                Optional ({title.length}/150)
                            </span>
                        </div>
                        <input
                            type="text"
                            value={title}
                            maxLength={150}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Annual MPOnline Town Hall 2026"
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                        />
                    </div>

                    {/* Announcement Message */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Announcement Message <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[11px] font-medium ${
                                message.length > 380 ? 'text-amber-500 font-bold' : 'text-slate-400'
                            }`}>
                                {message.length}/400 chars
                            </span>
                        </div>
                        <textarea
                            rows={3}
                            value={message}
                            maxLength={400}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type the announcement details to broadcast across all employee dashboards and notification channels..."
                            className="w-full p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all resize-none leading-relaxed"
                        />
                    </div>
                </form>

                {/* Footer (Pinned) */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex items-center justify-between gap-3 shrink-0">
                    <div>
                        {isEditMode && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isSubmitting}
                                className="px-3.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                title="Delete this broadcast announcement"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                <span>Remove Broadcast</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !message.trim()}
                            className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    <span>{isEditMode ? 'Saving...' : 'Publishing...'}</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">
                                        {isEditMode ? 'save' : 'send'}
                                    </span>
                                    <span>{isEditMode ? 'Save Changes' : 'Publish Broadcast'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
