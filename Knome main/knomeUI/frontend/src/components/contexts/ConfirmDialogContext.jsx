import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ConfirmDialogContext = createContext();

const VARIANTS = {
    danger: {
        icon: 'warning',
        accentGradient: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)',
        iconBgLight: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(249,115,22,0.06))',
        iconBgDark: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(249,115,22,0.1))',
        iconBorderLight: '1px solid rgba(239,68,68,0.15)',
        iconBorderDark: '1px solid rgba(239,68,68,0.2)',
        iconColor: '#ef4444',
        btnGradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
        btnHoverGradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        btnShadow: '0 4px 16px rgba(239,68,68,0.3)',
        btnHoverShadow: '0 6px 24px rgba(239,68,68,0.4)',
    },
    warning: {
        icon: 'error',
        accentGradient: 'linear-gradient(90deg, #f59e0b, #eab308, #f59e0b)',
        iconBgLight: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(234,179,8,0.06))',
        iconBgDark: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,179,8,0.1))',
        iconBorderLight: '1px solid rgba(245,158,11,0.15)',
        iconBorderDark: '1px solid rgba(245,158,11,0.2)',
        iconColor: '#f59e0b',
        btnGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
        btnHoverGradient: 'linear-gradient(135deg, #d97706, #b45309)',
        btnShadow: '0 4px 16px rgba(245,158,11,0.3)',
        btnHoverShadow: '0 6px 24px rgba(245,158,11,0.4)',
    },
    info: {
        icon: 'help',
        accentGradient: 'linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)',
        iconBgLight: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06))',
        iconBgDark: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
        iconBorderLight: '1px solid rgba(99,102,241,0.15)',
        iconBorderDark: '1px solid rgba(99,102,241,0.2)',
        iconColor: '#6366f1',
        btnGradient: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        btnHoverGradient: 'linear-gradient(135deg, #4f46e5, #4338ca)',
        btnShadow: '0 4px 16px rgba(99,102,241,0.3)',
        btnHoverShadow: '0 6px 24px rgba(99,102,241,0.4)',
    },
    success: {
        icon: 'check_circle',
        accentGradient: 'linear-gradient(90deg, #10b981, #059669, #10b981)',
        iconBgLight: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.06))',
        iconBgDark: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))',
        iconBorderLight: '1px solid rgba(16,185,129,0.15)',
        iconBorderDark: '1px solid rgba(16,185,129,0.2)',
        iconColor: '#10b981',
        btnGradient: 'linear-gradient(135deg, #10b981, #059669)',
        btnHoverGradient: 'linear-gradient(135deg, #059669, #047857)',
        btnShadow: '0 4px 16px rgba(16,185,129,0.3)',
        btnHoverShadow: '0 6px 24px rgba(16,185,129,0.4)',
    },
};

export function ConfirmDialogProvider({ children }) {
    const [dialogState, setDialogState] = useState(null);
    const resolveRef = useRef(null);

    const confirm = useCallback(({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' } = {}) => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setDialogState({ title, message, confirmText, cancelText, variant });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        resolveRef.current?.(true);
        resolveRef.current = null;
        setDialogState(null);
    }, []);

    const handleCancel = useCallback(() => {
        resolveRef.current?.(false);
        resolveRef.current = null;
        setDialogState(null);
    }, []);

    // Close on Escape
    useEffect(() => {
        if (!dialogState) return;
        const handler = (e) => { if (e.key === 'Escape') handleCancel(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [dialogState, handleCancel]);

    return (
        <ConfirmDialogContext.Provider value={confirm}>
            {children}
            {dialogState && createPortal(
                <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onCancel={handleCancel} />,
                document.body
            )}
        </ConfirmDialogContext.Provider>
    );
}

function ConfirmDialog({ title, message, confirmText, cancelText, variant, onConfirm, onCancel }) {
    const isDark = document.documentElement.classList.contains('dark');
    const v = VARIANTS[variant] || VARIANTS.danger;
    const confirmBtnRef = useRef(null);

    // Auto-focus confirm button on mount
    useEffect(() => {
        confirmBtnRef.current?.focus();
    }, []);

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ animation: 'knConfirmOverlayIn 0.2s ease-out forwards' }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0" style={{
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
            }} />

            {/* Modal Card */}
            <div
                className="relative w-[400px] max-w-[90vw] rounded-2xl overflow-hidden"
                style={{
                    background: isDark
                        ? 'linear-gradient(165deg, rgba(15,23,42,0.98), rgba(8,15,32,0.99))'
                        : 'linear-gradient(165deg, rgba(255,255,255,0.99), rgba(248,250,252,1))',
                    border: isDark ? '1px solid rgba(148,163,184,0.12)' : '1px solid rgba(203,213,225,0.5)',
                    boxShadow: isDark
                        ? '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(148,163,184,0.08)'
                        : '0 32px 80px rgba(37,99,235,0.1), 0 8px 32px rgba(0,0,0,0.06)',
                    animation: 'knConfirmModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
                }}
            >
                {/* Top accent gradient bar */}
                <div style={{ height: '3px', background: v.accentGradient }} />

                <div className="px-7 pt-7 pb-6 text-center">
                    {/* Icon */}
                    <div
                        className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-full"
                        style={{
                            background: isDark ? v.iconBgDark : v.iconBgLight,
                            border: isDark ? v.iconBorderDark : v.iconBorderLight,
                        }}
                    >
                        <span
                            className="material-symbols-outlined text-[28px]"
                            style={{ color: v.iconColor, fontVariationSettings: "'FILL' 1" }}
                        >
                            {v.icon}
                        </span>
                    </div>

                    {/* Title */}
                    <h3
                        className="text-[17px] font-bold mb-1.5"
                        style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
                    >
                        {title}
                    </h3>

                    {/* Message */}
                    <p
                        className="text-[13.5px] leading-relaxed mb-6"
                        style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                    >
                        {message}
                    </p>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 cursor-pointer"
                            style={{
                                background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(241,245,249,1)',
                                color: isDark ? '#94a3b8' : '#475569',
                                border: isDark ? '1px solid rgba(148,163,184,0.12)' : '1px solid rgba(203,213,225,0.6)',
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(226,232,240,1)';
                                e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(241,245,249,1)';
                                e.target.style.transform = 'translateY(0)';
                            }}
                        >
                            {cancelText}
                        </button>
                        <button
                            ref={confirmBtnRef}
                            onClick={onConfirm}
                            className="flex-1 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 cursor-pointer outline-none"
                            style={{
                                background: v.btnGradient,
                                boxShadow: v.btnShadow,
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = v.btnHoverGradient;
                                e.target.style.boxShadow = v.btnHoverShadow;
                                e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = v.btnGradient;
                                e.target.style.boxShadow = v.btnShadow;
                                e.target.style.transform = 'translateY(0)';
                            }}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyframe animations */}
            <style>{`
                @keyframes knConfirmOverlayIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes knConfirmModalIn {
                    from { opacity: 0; transform: scale(0.92) translateY(8px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmDialogContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmDialogProvider');
    return ctx;
}
