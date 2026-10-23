import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl', footer = null }) {
    // Close on escape key
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

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />
            
            {/* Modal Content */}
            <div className={`relative w-full ${maxWidth} bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800`}>
                
                {/* Header */}
                <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                        title="Close"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    {children}
                </div>

                {/* Sticky Footer */}
                {footer && (
                    <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-800/95 shrink-0 z-10">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
