import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatNotificationDate } from '../../utils/notificationHelpers';

export default function NotificationToast({ notification, onClose }) {
    const navigate = useNavigate();

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 6000);
        return () => clearTimeout(timer);
    }, [onClose]);

    if (!notification) return null;

    const handleToastClick = () => {
        onClose();
        if (notification.targetUrl) {
            navigate(notification.targetUrl);
        } else if (notification.isWiki || notification.relatedContentType?.toLowerCase() === 'wiki' || notification.type?.includes('wiki') || (notification.message || '').toLowerCase().includes('wiki') || notification.wikiId) {
            const wId = notification.wikiId || notification.relatedContentId || notification.referenceId;
            navigate(wId ? `/wiki/view?id=${wId}` : '/wiki');
        } else if (notification.type === 'message' || notification.eventType === 'Message' || notification.type?.includes('chat')) {
            const uId = notification.senderUserId || notification.senderId;
            navigate(uId ? `/messages?userId=${uId}&name=${encodeURIComponent(notification.senderName || '')}` : '/messages');
        } else if (notification.type?.includes('follow') && notification.senderUserId) {
            navigate(`/profile?id=${notification.senderUserId}`);
        } else {
            navigate('/posts');
        }
    };

    const cleanMessageText = () => {
        let txt = notification.message || notification.text || '';
        if (notification.senderName) {
            txt = txt.replace(new RegExp(`^${notification.senderName}\\s*[:—-]\\s*`, 'i'), '');
        }
        // Trim leading and trailing quotes if present
        txt = txt.replace(/^["']|["']$/g, '');
        return txt;
    };

    const isMessageNotif = notification.type === 'message' || notification.eventType === 'Message' || notification.category === 'Messages';

    return (
        <div className="fixed top-20 right-6 z-[9999] max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-5 duration-300 backdrop-blur-xl border-l-4 border-l-cyan-500">
            {/* Sender Avatar */}
            <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center text-cyan-600 dark:text-cyan-300 font-bold text-sm">
                    {notification.senderAvatar ? (
                        <img src={notification.senderAvatar} alt="Sender" className="w-full h-full object-cover" />
                    ) : (
                        <span>{(notification.senderName || notification.title || 'M').charAt(0)}</span>
                    )}
                </div>
                {isMessageNotif && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-cyan-500 text-white flex items-center justify-center shadow-xs">
                        <span className="material-symbols-outlined text-[10px]">chat</span>
                    </div>
                )}
            </div>

            {/* Notification Details */}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={handleToastClick}>
                <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {notification.title || (isMessageNotif ? 'New Message' : 'Notification')}
                    </h4>
                    <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {formatNotificationDate(notification.createdDate || notification.createdAt || notification.time)}
                    </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug">
                    {notification.senderName && (
                        <span className="font-bold text-slate-900 dark:text-white mr-1">{notification.senderName}:</span>
                    )}
                    <span>{cleanMessageText()}</span>
                </p>
            </div>

            {/* Close Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
                <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
        </div>
    );
}
