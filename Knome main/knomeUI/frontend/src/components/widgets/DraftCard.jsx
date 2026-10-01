import React, { useState } from 'react';
import { formatDraftTimeAgo } from '../../utils/draftManager';

export default function DraftCard({ draft, onEditDraft, onDeleteDraft, onPublishDraft }) {
    const [isPublishing, setIsPublishing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    if (!draft) return null;

    const draftId = draft.id || draft.postId;
    const text = draft.text || draft.content || draft.contentText || '';
    const attachments = draft.attachments || draft.postAttachments || [];
    const savedTime = draft.updatedAt || draft.savedAt || draft.createdDate || draft.publishedDate;
    const audience = draft.audience || draft.audienceType || 'Everyone';
    const communityName = draft.selectedCommunity?.name || draft.communityName || null;

    const images = attachments.filter(a => a.type === 'image' || a.fileType?.toLowerCase() === 'image');
    const docs = attachments.filter(a => a.type === 'doc' || a.fileType?.toLowerCase() === 'doc' || a.fileType?.toLowerCase() === 'document');
    const videos = attachments.filter(a => a.type === 'video' || a.fileType?.toLowerCase() === 'video');
    const audios = attachments.filter(a => a.type === 'audio' || a.fileType?.toLowerCase() === 'audio');

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to permanently delete this draft? This action cannot be undone.')) return;

        setIsDeleting(true);
        try {
            if (onDeleteDraft) {
                await onDeleteDraft(draftId);
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            if (onPublishDraft) {
                await onPublishDraft(draft);
            }
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <article
            className="w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col gap-4 group"
            style={{
                background: 'var(--bg-card, #ffffff)',
                boxShadow: 'var(--shadow-premium, 0 4px 20px -2px rgba(0, 0, 0, 0.05))'
            }}
        >
            {/* Top Bar: DRAFT Badge & Saved Time */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-black tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <span className="material-symbols-outlined text-[13px]">draft</span>
                        DRAFT
                    </span>

                    {/* Audience Indicator */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70">
                        <span className="material-symbols-outlined text-[13px]">
                            {audience === 'Community' ? 'groups' : audience === 'Connections' ? 'person' : 'public'}
                        </span>
                        <span>
                            {audience === 'Community' && communityName ? communityName : audience}
                        </span>
                    </span>
                </div>

                {/* Saved timestamp */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">schedule</span>
                    <span>{formatDraftTimeAgo(savedTime)}</span>
                </div>
            </div>

            {/* Content Preview */}
            <div 
                onClick={() => onEditDraft && onEditDraft(draft)}
                className="cursor-pointer group-hover:text-slate-950 dark:group-hover:text-white transition-colors"
                title="Click to continue editing this draft"
            >
                {text.trim() ? (
                    <p className="text-slate-800 dark:text-slate-200 text-sm sm:text-[15px] leading-relaxed line-clamp-3 font-normal whitespace-pre-wrap">
                        {text}
                    </p>
                ) : (
                    <p className="text-slate-400 dark:text-slate-500 italic text-sm">
                        Untitled draft with attachments...
                    </p>
                )}
            </div>

            {/* Attachments Preview / Indicator */}
            {attachments.length > 0 && (
                <div className="flex flex-col gap-2.5 pt-1">
                    {/* Summary row */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[17px] text-slate-500">attach_file</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                            {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap ml-1">
                            {images.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10.5px] font-semibold border border-indigo-200 dark:border-indigo-800">
                                    <span className="material-symbols-outlined text-[12px]">image</span>
                                    {images.length} {images.length === 1 ? 'Image' : 'Images'}
                                </span>
                            )}
                            {docs.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10.5px] font-semibold border border-emerald-200 dark:border-emerald-800">
                                    <span className="material-symbols-outlined text-[12px]">description</span>
                                    {docs.length} {docs.length === 1 ? 'Doc' : 'Docs'}
                                </span>
                            )}
                            {videos.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 text-[10.5px] font-semibold border border-cyan-200 dark:border-cyan-800">
                                    <span className="material-symbols-outlined text-[12px]">videocam</span>
                                    {videos.length} {videos.length === 1 ? 'Video' : 'Videos'}
                                </span>
                            )}
                            {audios.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 text-[10.5px] font-semibold border border-purple-200 dark:border-purple-800">
                                    <span className="material-symbols-outlined text-[12px]">headphones</span>
                                    {audios.length} {audios.length === 1 ? 'Audio' : 'Audios'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Image thumbnails preview (up to 4 thumbnails) */}
                    {images.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto py-1">
                            {images.slice(0, 4).map((img, idx) => {
                                const imgSrc = img.backendUrl || img.url;
                                return (
                                    <div 
                                        key={idx}
                                        onClick={() => onEditDraft && onEditDraft(draft)}
                                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 cursor-pointer shadow-xs hover:opacity-90 transition-opacity"
                                    >
                                        <img 
                                            src={imgSrc} 
                                            alt={img.name || 'Preview'} 
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                    </div>
                                );
                            })}
                            {images.length > 4 && (
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                    +{images.length - 4}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-1 flex-wrap">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onEditDraft && onEditDraft(draft)}
                        className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[17px]">edit_document</span>
                        <span>Continue Editing</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePublish}
                        disabled={isPublishing || !text.trim()}
                        className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        title={!text.trim() ? "Cannot publish empty post" : "Publish draft immediately"}
                    >
                        {isPublishing ? (
                            <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                        ) : (
                            <span className="material-symbols-outlined text-[16px]">send</span>
                        )}
                        <span>Publish Now</span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ml-auto"
                    title="Delete draft permanently"
                >
                    {isDeleting ? (
                        <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                    ) : (
                        <span className="material-symbols-outlined text-[17px]">delete</span>
                    )}
                    <span>Delete Draft</span>
                </button>
            </div>
        </article>
    );
}
