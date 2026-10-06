import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

export default function FloatingMessagesButton() {
    const { currentUser } = useUser();
    const location = useLocation();
    const isMessagesPage = location.pathname.startsWith('/messages') || location.pathname.startsWith('/chat');

    if (isMessagesPage) return null;

    const [unreadCount, setUnreadCount] = useState(() => {
        try {
            const userId = Number(currentUser?.userId || currentUser?.id || 1);
            const userSpecific = localStorage.getItem(`knome_unread_messages_count_${userId}`);
            if (userSpecific !== null) return parseInt(userSpecific, 10) || 0;
            const stored = localStorage.getItem('knome_unread_messages_count');
            if (stored !== null) return parseInt(stored, 10) || 0;
        } catch (e) {}
        return 0;
    });

    useEffect(() => {
        const handleMsgUpdate = (e) => {
            if (e?.detail?.unreadCount !== undefined) {
                setUnreadCount(e.detail.unreadCount);
            } else {
                try {
                    const userId = Number(currentUser?.userId || currentUser?.id || 1);
                    const userSpecific = localStorage.getItem(`knome_unread_messages_count_${userId}`);
                    if (userSpecific !== null) {
                        setUnreadCount(parseInt(userSpecific, 10) || 0);
                        return;
                    }
                    const stored = localStorage.getItem('knome_unread_messages_count');
                    if (stored !== null) setUnreadCount(parseInt(stored, 10) || 0);
                } catch (err) {}
            }
        };

        window.addEventListener('knome_messages_updated', handleMsgUpdate);
        window.addEventListener('storage', handleMsgUpdate);
        return () => {
            window.removeEventListener('knome_messages_updated', handleMsgUpdate);
            window.removeEventListener('storage', handleMsgUpdate);
        };
    }, [currentUser]);

    return (
        <Link
            to="/messages"
            id="floating-messages-btn"
            className={`fixed bottom-5 right-5 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-700 hover:via-indigo-700 hover:to-cyan-600 text-white shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-white/20 select-none group max-md:bottom-20 ${
                isMessagesPage ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900 shadow-cyan-500/50' : ''
            }`}
            title="Messages"
        >
            <div className="relative flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    chat
                </span>
                {unreadCount > 0 && (
                    <span className="absolute -top-2 -right-2 px-1 min-w-[16px] h-4 text-[9.5px] font-black rounded-full bg-rose-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </div>
            <span className="text-xs font-bold tracking-tight">Messages</span>
        </Link>
    );
}
