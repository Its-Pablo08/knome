import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function DeleteMessageModal({
    isOpen,
    message,
    isMe,
    onClose,
    onDeleteForMe,
    onDeleteForEveryone
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen, onClose]);

    if (!isOpen || !message) return null;

    const messagePreview = (message.text || message.content || '').trim();

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
                onClick={onClose}
            />

            {/* Modal Dialog Card */}
            <div 
                className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Trash Icon Badge */}
                <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3.5 shadow-xs">
                    <span className="material-symbols-outlined text-[24px]">delete</span>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Delete message?
                </h3>

                {/* Subtitle / Description */}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3.5 max-w-xs leading-relaxed">
                    {isMe 
                        ? 'Choose whether to delete this message for everyone in this chat or delete it just for yourself.' 
                        : 'This message will be deleted for you. Other chat participants will still be able to see it.'}
                </p>

                {/* Message Snippet Preview (if available) */}
                {messagePreview && (
                    <div className="w-full mb-4 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 text-left">
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 italic line-clamp-2 break-words">
                            "{messagePreview}"
                        </p>
                    </div>
                )}

                {/* Action Buttons Stack (WhatsApp style) */}
                <div className="w-full flex flex-col gap-2">
                    {/* Delete for everyone (Sender only) */}
                    {isMe && (
                        <button
                            type="button"
                            onClick={onDeleteForEveryone}
                            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm shadow-rose-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                            <span>Delete for everyone</span>
                        </button>
                    )}

                    {/* Delete for me */}
                    <button
                        type="button"
                        onClick={onDeleteForMe}
                        className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            isMe 
                                ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700' 
                                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm shadow-rose-600/30'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                        <span>Delete for me</span>
                    </button>

                    {/* Cancel */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2 px-4 rounded-xl font-semibold text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer mt-0.5"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
