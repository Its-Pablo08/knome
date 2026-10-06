import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { resolveMediaUrl } from '../../utils/apiService';
import { useToast } from '../contexts/ToastContext';

export default function WikiVersionHistoryModal({
    isOpen,
    onClose,
    wikiId,
    sectionId = null,
    targetName = 'Wiki Overview',
    canRestore = false,
    onVersionRestored
}) {
    const { addToast } = useToast();

    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRestoring, setIsRestoring] = useState(false);

    useEffect(() => {
        if (isOpen && wikiId) {
            const loadVersions = async () => {
                setIsLoading(true);
                try {
                    const list = await wikiApi.getVersions(wikiId, sectionId);
                    const items = Array.isArray(list) ? list : [];
                    setVersions(items);
                    if (items.length > 0) setSelectedVersion(items[0]);
                } catch (err) {
                    console.error('Error fetching versions:', err);
                    addToast('Could not load version history.', 'error');
                } finally {
                    setIsLoading(false);
                }
            };
            loadVersions();
        }
    }, [isOpen, wikiId, sectionId]);

    const handleRestore = async (version) => {
        if (!canRestore) return;
        const confirmMsg = `Are you sure you want to restore Version ${version.versionNumber}? This will revert the current content to this snapshot.`;
        if (!window.confirm(confirmMsg)) return;

        setIsRestoring(true);
        try {
            await wikiApi.restoreVersion(wikiId, version.versionId, `Restored to Version ${version.versionNumber}`);
            addToast(`Successfully restored to Version ${version.versionNumber}!`, 'success');
            onVersionRestored && onVersionRestored();
            onClose();
        } catch (err) {
            console.error('Error restoring version:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to restore version.', 'error');
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Version History: ${targetName}`}
            maxWidth="max-w-4xl"
        >
            <div className="space-y-4">
                {isLoading ? (
                    <div className="py-12 flex justify-center">
                        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                    </div>
                ) : versions.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">history</span>
                        <p className="text-sm">No recorded version history yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* Timeline Sidebar (List of Versions) */}
                        <div className="md:col-span-5 border-r border-slate-200 dark:border-slate-800 pr-2 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 mb-2">
                                Chronological Snapshots ({versions.length})
                            </h4>

                            {versions.map((v, idx) => {
                                const isSelected = selectedVersion?.versionId === v.versionId;
                                const isCurrent = idx === 0;

                                return (
                                    <button
                                        key={v.versionId}
                                        type="button"
                                        onClick={() => setSelectedVersion(v)}
                                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                            isSelected
                                                ? 'bg-teal-50/80 dark:bg-teal-950/50 border-teal-500 shadow-sm'
                                                : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                            isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}>
                                            v{v.versionNumber}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                                    {v.title}
                                                </p>
                                                {isCurrent && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                                        Current
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                {v.changeSummary || 'Content revision'}
                                            </p>

                                            <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                                                <span>{v.createdByUserName}</span>
                                                <span>•</span>
                                                <span>{new Date(v.createdDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Snapshot Preview Area */}
                        <div className="md:col-span-7 flex flex-col max-h-[60vh]">
                            {selectedVersion ? (
                                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800">
                                    {/* Preview Header */}
                                    <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-800">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                                                    Version {selectedVersion.versionNumber}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                    {selectedVersion.title}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                Captured {new Date(selectedVersion.createdDate).toLocaleString()} by {selectedVersion.createdByUserName}
                                            </p>
                                        </div>

                                        {canRestore && (
                                            <button
                                                type="button"
                                                onClick={() => handleRestore(selectedVersion)}
                                                disabled={isRestoring}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">history_toggle_off</span>
                                                Restore This
                                            </button>
                                        )}
                                    </div>

                                    {/* Snapshot HTML Content */}
                                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 text-sm text-slate-800 dark:text-slate-200 prose dark:prose-invert max-w-none">
                                        {selectedVersion.description && (
                                            <p className="text-xs italic text-slate-500 mb-3 border-l-2 border-slate-300 dark:border-slate-700 pl-2">
                                                {selectedVersion.description}
                                            </p>
                                        )}
                                        <div className="rich-editor-content wiki-content" dangerouslySetInnerHTML={{ __html: selectedVersion.contentHtml }} />
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-400">
                                    Select a version to preview
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}
