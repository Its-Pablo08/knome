import React, { useState, useEffect, useRef } from 'react';
import { useUser, resolveEmployeeName, KNOWN_ROSTER_NAMES, INITIAL_USERS } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { interactionsApi, resolveMediaUrl } from '../../utils/apiService';
import { containsRestrictedWord } from '../../utils/restrictedWords';

const countAllComments = (list) => {
    if (!Array.isArray(list)) return 0;
    return list.reduce((sum, c) => sum + 1 + (Array.isArray(c.replies) ? c.replies.length : (c.repliesCount || 0)), 0);
};

export default function ClipCommentsDrawer({ isOpen, onClose, clip, onCommentAdded, onCommentDeleted, onCommentsCountChange }) {
    const { currentUser, users } = useUser();
    const { addToast } = useToast();

    const [comments, setComments] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [replyingToComment, setReplyingToComment] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const inputRef = useRef(null);
    const listEndRef = useRef(null);

    const totalCommentsCount = countAllComments(comments);

    /**
     * Resolves the actual Full Name of the commenting user.
     * Prioritizes authorFullName, currentUser profile data (if own comment),
     * roster lookups by userId/employeeId, and never falls back to generic "Employee" or "User".
     */
    const getCommentAuthorName = (c) => {
        if (!c) return 'Colleague';

        const isMe = Boolean(
            (currentUser?.userId && Number(c.userId) === Number(currentUser.userId)) ||
            (currentUser?.id && Number(c.userId) === Number(currentUser.id)) ||
            (currentUser?.employeeId && (c.authorEmployeeId || c.employeeId) &&
                String(currentUser.employeeId).toUpperCase() === String(c.authorEmployeeId || c.employeeId).toUpperCase())
        );

        const myName = (currentUser?.fullName || currentUser?.name || '').trim();
        if (isMe && myName && myName.toLowerCase() !== 'employee' && myName.toLowerCase() !== 'user') {
            return myName;
        }

        const candidate = (c.authorFullName || c.fullName || c.userName || c.name || c.authorName || '').trim();
        const isGeneric = !candidate || candidate.toLowerCase() === 'employee' || candidate.toLowerCase() === 'user' || candidate.toLowerCase() === 'colleague';

        // Try resolving by employee ID
        const empId = (c.authorEmployeeId || c.employeeId || c.empId || '').trim();
        if (empId) {
            const resolved = typeof resolveEmployeeName === 'function' ? resolveEmployeeName(candidate, empId) : null;
            if (resolved && resolved.toLowerCase() !== 'employee' && resolved.toLowerCase() !== 'user') {
                return resolved;
            }
            if (KNOWN_ROSTER_NAMES && KNOWN_ROSTER_NAMES[empId.toUpperCase()]) {
                return KNOWN_ROSTER_NAMES[empId.toUpperCase()];
            }
        }

        // Try resolving from users roster
        const cUid = c.userId || c.id;
        const roster = Array.isArray(users) && users.length > 0 ? users : INITIAL_USERS;
        if (Array.isArray(roster)) {
            if (cUid) {
                const found = roster.find(u => Number(u.userId || u.id) === Number(cUid));
                if (found?.fullName || found?.name) {
                    return (found.fullName || found.name).trim();
                }
            }
            if (empId) {
                const found = roster.find(u => String(u.employeeId || '').toUpperCase() === empId.toUpperCase());
                if (found?.fullName || found?.name) {
                    return (found.fullName || found.name).trim();
                }
            }
        }

        if (!isGeneric) {
            return candidate;
        }

        if (isMe && myName) {
            return myName;
        }

        return 'Colleague';
    };

    /**
     * Resolves the author's avatar URL or returns null to use UI-avatars with real initials.
     */
    const getCommentAuthorAvatar = (c) => {
        if (!c) return null;

        const isMe = Boolean(
            (currentUser?.userId && Number(c.userId) === Number(currentUser.userId)) ||
            (currentUser?.id && Number(c.userId) === Number(currentUser.id)) ||
            (currentUser?.employeeId && (c.authorEmployeeId || c.employeeId) &&
                String(currentUser.employeeId).toUpperCase() === String(c.authorEmployeeId || c.employeeId).toUpperCase())
        );

        const direct = c.authorProfilePhotoUrl || c.profilePhotoUrl || c.userAvatar || c.avatar;
        if (direct) return resolveMediaUrl(direct);

        if (isMe && (currentUser?.profilePhotoUrl || currentUser?.avatar)) {
            return resolveMediaUrl(currentUser.profilePhotoUrl || currentUser.avatar);
        }

        const cUid = c.userId || c.id;
        const empId = (c.authorEmployeeId || c.employeeId || c.empId || '').trim();
        const roster = Array.isArray(users) && users.length > 0 ? users : INITIAL_USERS;
        if (Array.isArray(roster)) {
            const found = roster.find(u => 
                (cUid && Number(u.userId || u.id) === Number(cUid)) ||
                (empId && String(u.employeeId || '').toUpperCase() === empId.toUpperCase())
            );
            if (found?.profilePhotoUrl || found?.avatar) {
                return resolveMediaUrl(found.profilePhotoUrl || found.avatar);
            }
        }

        return null;
    };

    useEffect(() => {
        if (isOpen && clip?.clipId) {
            loadComments();
            setTimeout(() => inputRef.current?.focus(), 200);
        } else {
            setComments([]);
            setCommentText('');
            setReplyingToComment(null);
        }
    }, [isOpen, clip?.clipId]);

    const loadComments = async () => {
        if (!clip?.clipId) return;
        setIsLoading(true);
        try {
            const res = await interactionsApi.getComments('Clip', clip.clipId);
            const list = Array.isArray(res) ? res : (res?.data || []);
            setComments(list);
            const total = countAllComments(list);
            if (onCommentsCountChange) onCommentsCountChange(total);
        } catch (err) {
            console.error('Failed to load clip comments:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendComment = async (e) => {
        e?.preventDefault();
        const text = commentText.trim();
        if (!text || isSubmitting || !clip?.clipId) return;

        // Restricted words screening
        if (containsRestrictedWord(text)) {
            addToast('Comment contains restricted keywords or policy violations.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const resComment = await interactionsApi.addComment(
                'Clip',
                clip.clipId,
                text,
                replyingToComment?.commentId || null
            );

            const myFullName = (currentUser?.fullName || currentUser?.name || 'Colleague').trim();
            const myAvatar = currentUser?.profilePhotoUrl || currentUser?.avatar || null;
            const myEmpId = currentUser?.employeeId || null;
            const myUserId = currentUser?.userId || currentUser?.id || null;

            const newComment = {
                ...resComment,
                authorFullName: resComment?.authorFullName || myFullName,
                userName: resComment?.userName || resComment?.authorFullName || myFullName,
                fullName: resComment?.fullName || resComment?.authorFullName || myFullName,
                authorProfilePhotoUrl: resComment?.authorProfilePhotoUrl || resComment?.profilePhotoUrl || myAvatar,
                profilePhotoUrl: resComment?.profilePhotoUrl || resComment?.authorProfilePhotoUrl || myAvatar,
                userAvatar: resComment?.userAvatar || resComment?.authorProfilePhotoUrl || myAvatar,
                authorEmployeeId: resComment?.authorEmployeeId || myEmpId,
                userId: resComment?.userId || myUserId,
                createdDate: resComment?.createdDate || new Date().toISOString(),
                commentText: text,
            };

            // Add optimistically to comments tree
            let updatedList = [];
            if (replyingToComment) {
                updatedList = comments.map(c => {
                    if (c.commentId === replyingToComment.commentId) {
                        return {
                            ...c,
                            replies: [...(c.replies || []), newComment],
                            repliesCount: (c.repliesCount || 0) + 1
                        };
                    }
                    return c;
                });
            } else {
                updatedList = [newComment, ...comments];
            }
            setComments(updatedList);

            setCommentText('');
            setReplyingToComment(null);
            addToast('Comment posted!', 'success');

            const total = countAllComments(updatedList);
            if (onCommentsCountChange) onCommentsCountChange(total);
            if (onCommentAdded) onCommentAdded(total);
        } catch (err) {
            console.error('Failed to post comment:', err);
            addToast('Failed to post comment. Please try again.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        try {
            await interactionsApi.deleteComment(commentId);
            const updatedList = comments
                .filter(c => c.commentId !== commentId)
                .map(c => {
                    if (c.replies && c.replies.some(r => r.commentId === commentId)) {
                        const newReplies = c.replies.filter(r => r.commentId !== commentId);
                        return { ...c, replies: newReplies, repliesCount: Math.max(0, (c.repliesCount || 1) - 1) };
                    }
                    return c;
                });
            setComments(updatedList);
            const total = countAllComments(updatedList);
            if (onCommentsCountChange) onCommentsCountChange(total);
            if (onCommentDeleted) onCommentDeleted(total);
            addToast('Comment deleted.', 'info');
        } catch (err) {
            addToast('Could not delete comment.', 'error');
        }
    };

    const handleLikeComment = async (commentId) => {
        try {
            await interactionsApi.toggleReaction('Comment', commentId, 'Like');
            setComments(prev => prev.map(c => {
                if (c.commentId === commentId) {
                    const isLiked = !c.isLiked;
                    return {
                        ...c,
                        isLiked,
                        likesCount: isLiked ? (c.likesCount || 0) + 1 : Math.max(0, (c.likesCount || 1) - 1)
                    };
                }
                return c;
            }));
        } catch {}
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Click-away backdrop */}
            <div className="flex-1" onClick={onClose} />

            {/* Slide-over panel */}
            <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-pink-500">mode_comment</span>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">
                            Comments <span className="text-xs text-slate-400 font-normal">({totalCommentsCount})</span>
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Comments List */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                            <div className="w-8 h-8 border-3 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
                            <p className="text-xs">Loading conversation...</p>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 px-6">
                            <div className="w-14 h-14 rounded-2xl bg-pink-500/10 text-pink-500 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-3xl">chat_bubble_outline</span>
                            </div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">No comments yet</h4>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs">Be the first to share your thoughts, feedback, or appreciation on this clip!</p>
                        </div>
                    ) : (
                        comments.map((comment) => {
                            const authorName = getCommentAuthorName(comment);
                            const authorAvatar = getCommentAuthorAvatar(comment);
                            const isMyComment = Boolean(
                                (currentUser?.userId && Number(comment.userId) === Number(currentUser.userId)) ||
                                (currentUser?.id && Number(comment.userId) === Number(currentUser.id)) ||
                                (currentUser?.employeeId && (comment.authorEmployeeId || comment.employeeId) &&
                                    String(currentUser.employeeId).toUpperCase() === String(comment.authorEmployeeId || comment.employeeId).toUpperCase())
                            );

                            return (
                                <div key={comment.commentId} className="flex gap-3 group">
                                    <img
                                        src={authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=ec4899&color=fff`}
                                        alt={authorName}
                                        className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5 border border-slate-200 dark:border-slate-700"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                                    {authorName}
                                                </span>
                                                <span className="text-[10px] text-slate-400">
                                                    {comment.createdDate ? new Date(comment.createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                                {comment.commentText}
                                            </p>
                                        </div>

                                        {/* Action Bar */}
                                        <div className="flex items-center gap-4 mt-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                                            <button
                                                type="button"
                                                onClick={() => handleLikeComment(comment.commentId)}
                                                className={`flex items-center gap-1 font-semibold transition ${
                                                    comment.isLiked ? 'text-pink-500' : 'hover:text-pink-500'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">
                                                    {comment.isLiked ? 'favorite' : 'favorite_border'}
                                                </span>
                                                <span>{comment.likesCount || 0}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setReplyingToComment(comment);
                                                    inputRef.current?.focus();
                                                }}
                                                className="hover:text-slate-800 dark:hover:text-slate-200 font-semibold transition"
                                            >
                                                Reply
                                            </button>

                                            {isMyComment && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteComment(comment.commentId)}
                                                    className="hover:text-rose-500 transition opacity-0 group-hover:opacity-100 ml-auto"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>

                                        {/* Nested Replies */}
                                        {Array.isArray(comment.replies) && comment.replies.length > 0 && (
                                            <div className="mt-2.5 space-y-2 pl-4 border-l-2 border-slate-200 dark:border-slate-800">
                                                {comment.replies.map(reply => {
                                                    const replyAuthorName = getCommentAuthorName(reply);
                                                    const replyAvatar = getCommentAuthorAvatar(reply);
                                                    const isMyReply = Boolean(
                                                        (currentUser?.userId && Number(reply.userId) === Number(currentUser.userId)) ||
                                                        (currentUser?.id && Number(reply.userId) === Number(currentUser.id)) ||
                                                        (currentUser?.employeeId && (reply.authorEmployeeId || reply.employeeId) &&
                                                            String(currentUser.employeeId).toUpperCase() === String(reply.authorEmployeeId || reply.employeeId).toUpperCase())
                                                    );
                                                    return (
                                                        <div key={reply.commentId} className="flex gap-2 group/reply">
                                                            <img
                                                                src={replyAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(replyAuthorName)}&background=ec4899&color=fff`}
                                                                alt={replyAuthorName}
                                                                className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
                                                            />
                                                            <div className="flex-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200">{replyAuthorName}</div>
                                                                    {isMyReply && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteComment(reply.commentId)}
                                                                            className="text-[10px] text-rose-500 hover:underline opacity-0 group-hover/reply:opacity-100 transition"
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{reply.commentText}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={listEndRef} />
                </div>

                {/* Reply badge if active */}
                {replyingToComment && (
                    <div className="px-5 py-1.5 bg-pink-500/10 border-t border-pink-500/20 flex items-center justify-between text-xs text-pink-600 dark:text-pink-400">
                        <span>Replying to <strong>{getCommentAuthorName(replyingToComment)}</strong></span>
                        <button
                            type="button"
                            onClick={() => setReplyingToComment(null)}
                            className="text-pink-500 hover:text-pink-700 text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Comment Input */}
                <form onSubmit={handleSendComment} className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder={replyingToComment ? `Reply to ${getCommentAuthorName(replyingToComment)}...` : 'Add a thoughtful comment...'}
                            className="flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500 outline-none transition"
                        />
                        <button
                            type="submit"
                            disabled={!commentText.trim() || isSubmitting}
                            className="p-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 shadow-md shadow-pink-500/25 transition disabled:opacity-50 shrink-0"
                        >
                            <span className="material-symbols-outlined text-lg">send</span>
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}
