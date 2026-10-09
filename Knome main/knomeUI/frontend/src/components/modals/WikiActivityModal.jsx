import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { resolveMediaUrl } from '../../utils/apiService';

const ACTION_ICONS = {
    WikiCreated: { icon: 'add_circle', color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/60' },
    WikiUpdated: { icon: 'edit', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/60' },
    WikiDeleted: { icon: 'delete', color: 'text-red-500 bg-red-50 dark:bg-red-950/60' },
    WikiArchived: { icon: 'archive', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
    WikiUnarchived: { icon: 'unarchive', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/60' },
    SectionAdded: { icon: 'post_add', color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/60' },
    SectionUpdated: { icon: 'edit_note', color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/60' },
    SectionDeleted: { icon: 'delete_sweep', color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/60' },
    SectionsReordered: { icon: 'reorder', color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/60' },
    CollaboratorAdded: { icon: 'person_add', color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/60' },
    CollaboratorRemoved: { icon: 'person_remove', color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/60' },
    WikiShared: { icon: 'share', color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-950/60' },
    WikiShareRemoved: { icon: 'link_off', color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/60' },
    VersionRestored: { icon: 'history', color: 'text-violet-500 bg-violet-50 dark:bg-violet-950/60' }
};

export default function WikiActivityModal({ isOpen, onClose, wikiId, wikiTitle = '' }) {
    const [activities, setActivities] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen && wikiId) {
            const loadActivities = async () => {
                setIsLoading(true);
                try {
                    const list = await wikiApi.getActivities(wikiId);
                    setActivities(Array.isArray(list) ? list : []);
                } catch (err) {
                    console.error('Error fetching activities:', err);
                } finally {
                    setIsLoading(false);
                }
            };
            loadActivities();
        }
    }, [isOpen, wikiId]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Activity & Audit Trail: ${wikiTitle || 'Knowledge Space'}`}
            maxWidth="max-w-2xl"
        >
            <div className="space-y-4">
                {isLoading ? (
                    <div className="py-12 flex justify-center">
                        <div className="w-7 h-7 border-3 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : activities.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">history_edu</span>
                        <p className="text-sm">No activity recorded yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[65vh] overflow-y-auto custom-scrollbar p-1">
                        {activities.map((a, idx) => {
                            const conf = ACTION_ICONS[a.action] || { icon: 'info', color: 'text-slate-500 bg-slate-100' };

                            return (
                                <div
                                    key={a.activityId || idx}
                                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${conf.color}`}>
                                        <span className="material-symbols-outlined text-[18px]">{conf.icon}</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                                {a.actorUserName}
                                            </p>
                                            <span className="text-[10px] text-slate-400 shrink-0">
                                                {new Date(a.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                            </span>
                                        </div>

                                        <p className="text-xs text-slate-600 dark:text-slate-300">
                                            {a.details || a.reason || a.action}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </Modal>
    );
}
