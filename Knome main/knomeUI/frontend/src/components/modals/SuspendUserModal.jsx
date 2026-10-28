import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveMediaUrl } from '../../utils/apiService';
import HighlightText from '../ui/HighlightText';

/**
 * Universal Suspend User / Member Modal
 * Provides standardized duration options (1d, 3d, 7d, 14d, 30d, Indefinite, Custom Date)
 * and compliance reasons, with anti-clipping responsive styling.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object} props.user - Target user/member { userId, id, fullName, name, profilePhotoUrl, designation, department, memberType, roleName }
 * @param {Object} [props.report] - Optional linked moderation report { reportId, contentId, contentType, reason, category, reasonSnippet, contentSnippet }
 * @param {Function} props.onConfirm - async ({ duration, customDate, category, note, fullReason, isPermanent, days, reportId, contentId, contentType }) => void
 * @param {string} [props.title] - Optional override title
 * @param {string} [props.subtitle] - Optional override subtitle
 */
export default function SuspendUserModal({
    isOpen,
    onClose,
    user: initialUser = null,
    report = null,
    availableUsers = [],
    onConfirm,
    isHrAdmin = false,
    isSysAdmin = false,
    isModerator = false,
    title,
    subtitle
}) {
    const isCommunityScope = Boolean(title && title.toLowerCase().includes('community'));
    const resolvedTitle = title || (isHrAdmin ? 'Suspend Employee Account' : 'Request Employee Account Suspension');
    const resolvedSubtitle = subtitle || (isHrAdmin ? 'Enterprise account suspension & governance enforcement' : 'Submit suspension request for HR Administrator approval');
    // Explicit suspension window role segregation:
    // Suspension duration options are ONLY displayed in the HR Admin suspension window (and community member suspension scope).
    // Moderator and System Admin suspension windows do not show duration options or have their functionality altered.
    const isHrAdminWindow = Boolean(isHrAdmin && !isSysAdmin && !isModerator && !isCommunityScope);
    const showDurationPicker = isHrAdminWindow || isCommunityScope;
    const isModeratorWindow = !showDurationPicker;
    const [selectedUser, setSelectedUser] = useState(initialUser);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [duration, setDuration] = useState('7d');
    const [customDate, setCustomDate] = useState('');
    const [reasonCategory, setReasonCategory] = useState('Violation of community guidelines');
    const [reasonNote, setReasonNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Sync selectedUser if initialUser or report prop changes
    React.useEffect(() => {
        if (initialUser) {
            setSelectedUser(initialUser);
        } else if (report?.reportedUserId && availableUsers && availableUsers.length > 0) {
            const found = availableUsers.find(u => Number(u.userId || u.id) === Number(report.reportedUserId));
            if (found) setSelectedUser(found);
        } else if (availableUsers && availableUsers.length > 0) {
            setSelectedUser(null);
        }

        if (report) {
            if (report.reason || report.category) {
                setReasonCategory(report.category || report.reason || 'Violation of community guidelines');
            }
            if (report.reasonSnippet || report.contentSnippet || report.reason) {
                setReasonNote(report.reasonSnippet || report.contentSnippet || report.reason || '');
            }
        }
    }, [initialUser, report, isOpen, availableUsers]);

    if (!isOpen) return null;

    const user = selectedUser;
    const displayName = user ? (user.fullName || user.name || user.userName || 'Employee') : '';
    const displayRole = user ? (user.memberType || user.roleName || user.role || 'Member') : '';
    const displaySubtitle = user ? `${user.designation || 'Staff'} • ${user.department || user.departmentName || 'MPOnline'}` : '';
    const avatarUrl = user ? resolveMediaUrl(user.profilePhotoUrl || user.avatar) : null;

    const durationPresets = [
        { id: '1d', label: '1 Day', sub: '24 Hours', days: 1 },
        { id: '3d', label: '3 Days', sub: 'Short break', days: 3 },
        { id: '7d', label: '7 Days', sub: '1 Week (Standard)', days: 7 },
        { id: '14d', label: '14 Days', sub: '2 Weeks', days: 14 },
        { id: '30d', label: '30 Days', sub: '1 Month', days: 30 },
        { id: 'indefinite', label: 'Indefinite', sub: 'Until manual review', days: 365 },
    ];

    const handleConfirm = async () => {
        if (isSubmitting || !user) return;
        setIsSubmitting(true);
        try {
            const isPermanent = isModeratorWindow ? false : duration === 'indefinite';
            const selectedPreset = durationPresets.find(p => p.id === duration);
            const days = isModeratorWindow ? 7 : (selectedPreset ? selectedPreset.days : 7);
            const fullReason = reasonNote.trim()
                ? `${reasonCategory} — ${reasonNote.trim()}`
                : reasonCategory;

            await onConfirm({
                user,
                duration: isModeratorWindow ? '7d' : duration,
                customDate: isModeratorWindow ? null : (duration === 'custom' ? customDate : null),
                category: reasonCategory,
                note: reasonNote,
                fullReason,
                isPermanent,
                days,
                reportId: report?.reportId ? Number(report.reportId) : null,
                contentId: report?.contentId ? Number(report.contentId) : null,
                contentType: report?.contentType || null
            });
            onClose();
        } catch (err) {
            console.error('Error confirming suspension:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isCustomInvalid = !isModeratorWindow && duration === 'custom' && !customDate;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
            <div className="relative bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header (Pinned) */}
                <div className="px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/20 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                            <span className="material-symbols-outlined text-[22px]">person_off</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">{resolvedTitle}</h3>
                            <p className="text-[12px] text-slate-500 leading-tight mt-0.5">{resolvedSubtitle}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Body (Scrollable, never overflows parent) */}
                <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto space-y-4">
                    {/* Governance Policy Notice Banner */}
                    {!isCommunityScope && (!isHrAdmin ? (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[17px]">policy</span>
                            </div>
                            <div className="text-xs">
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>HR Administrator Approval Required</span>
                                    <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded text-[9px] font-black uppercase">Governance</span>
                                </p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                                    Per platform governance policy, account suspensions initiated by {isSysAdmin ? 'System Administrators' : 'Moderators'} are not executed directly. This suspension request will be sent to an <strong>HR Administrator</strong> for review and final approval.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 rounded-xl flex items-center gap-2 text-xs text-indigo-800 dark:text-indigo-200">
                            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px] shrink-0">verified_user</span>
                            <span><strong>HR Admin Action:</strong> You have authority to execute direct employee suspensions.</span>
                        </div>
                    ))}

                    {/* Attached Moderation Report Context Badge if present */}
                    {report && (
                        <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl text-xs space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[15px] text-indigo-600">policy</span>
                                    <span>Attached Moderation Report #{report.reportId}</span>
                                </span>
                                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300">
                                    {report.contentType || 'Post'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-700 dark:text-slate-300">
                                <strong className="text-slate-900 dark:text-white">Violation Reason:</strong> {report.reason || report.category || 'Content violation'}
                            </p>
                            {(report.reasonSnippet || report.contentSnippet) && (
                                <p className="text-[11px] text-slate-500 italic line-clamp-2">
                                    "{report.reasonSnippet || report.contentSnippet}"
                                </p>
                            )}
                        </div>
                    )}

                    {/* Member / User Preview Card OR Searchable Picker */}
                    {user ? (
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                            <div className="flex items-center gap-3 min-w-0">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={displayName}
                                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                                        {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white whitespace-normal break-words">
                                        {displayName}
                                    </h4>
                                    <p className="text-xs text-slate-500 truncate">
                                        {displaySubtitle}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                    {displayRole}
                                </span>
                                {!report && !isModeratorWindow && availableUsers && availableUsers.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                                    >
                                        Change
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                Select Employee to Suspend <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative mb-2">
                                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-[16px]">search</span>
                                <input
                                    type="text"
                                    value={userSearchTerm}
                                    onChange={e => setUserSearchTerm(e.target.value)}
                                    placeholder="Search employee by name, designation, department..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold outline-none focus:border-amber-500 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-50/50 dark:bg-slate-900/50">
                                {availableUsers
                                    .filter(u => {
                                        if (!userSearchTerm) return true;
                                        const term = userSearchTerm.toLowerCase();
                                        return (
                                            (u.fullName || u.name || '').toLowerCase().includes(term) ||
                                            (u.email || '').toLowerCase().includes(term) ||
                                            String(u.employeeId || '').toLowerCase().includes(term) ||
                                            (u.department || u.departmentName || '').toLowerCase().includes(term)
                                        );
                                    })
                                    .slice(0, 15)
                                    .map(u => (
                                        <div
                                            key={u.userId || u.id}
                                            onClick={() => setSelectedUser(u)}
                                            className="p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer flex items-center justify-between transition-colors"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-600 font-bold text-xs flex items-center justify-center shrink-0">
                                                    {(u.fullName || u.name || 'U')[0]}
                                                </div>
                                                 <div className="min-w-0">
                                                     <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                                                         <HighlightText text={u.fullName || u.name} query={userSearchTerm} />
                                                     </p>
                                                     <p className="text-[10px] text-slate-400 truncate">
                                                         <HighlightText text={`${u.designation || u.roleName || 'Employee'} • ${u.department || u.departmentName || 'General'}`} query={userSearchTerm} />
                                                     </p>
                                                 </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${u.isActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                                {u.isActive ? 'Active' : 'Suspended'}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Suspension Duration Picker */}
                    {!isModeratorWindow && (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                Suspension Duration
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {durationPresets.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setDuration(opt.id)}
                                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                                            duration === opt.id
                                                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                                                : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-300'
                                        }`}
                                    >
                                        <div className="font-bold text-xs">{opt.label}</div>
                                        <div className={`text-[10px] mt-0.5 ${duration === opt.id ? 'text-amber-100' : 'text-slate-400'}`}>
                                            {opt.sub}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Custom End Date Option */}
                            <div className="mt-2.5">
                                <button
                                    type="button"
                                    onClick={() => setDuration('custom')}
                                    className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                                        duration === 'custom'
                                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-400'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-300'
                                    }`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                                        Custom End Date
                                    </span>
                                    <span className="text-[11px] font-normal text-slate-400">Specify exact reinstatement date</span>
                                </button>

                                {duration === 'custom' && (
                                    <div className="mt-2 pl-2">
                                        <input
                                            type="date"
                                            min={new Date().toISOString().split('T')[0]}
                                            value={customDate}
                                            onChange={(e) => setCustomDate(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Reason for Suspension */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Reason for Suspension
                        </label>
                        <select
                            value={reasonCategory}
                            onChange={(e) => setReasonCategory(e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 mb-2"
                        >
                            <option value="Violation of community guidelines">Violation of community guidelines</option>
                            <option value="Inappropriate or harmful behavior">Inappropriate or harmful behavior</option>
                            <option value="Spam or unauthorized promotions">Spam or unauthorized promotions</option>
                            <option value="Harassment or misconduct">Harassment or misconduct</option>
                            <option value="Compliance Policy Violation">Compliance Policy Violation</option>
                            <option value="Administrative review">Administrative review</option>
                            <option value="Other">Other reason</option>
                        </select>
                        <textarea
                            value={reasonNote}
                            onChange={(e) => setReasonNote(e.target.value)}
                            placeholder="Optional note or explanation for audit log..."
                            rows={2}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                        />
                    </div>
                </div>

                {/* Footer (Pinned) */}
                <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-2.5 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    {isCommunityScope || isHrAdmin ? (
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!user || isCustomInvalid || isSubmitting}
                            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">person_off</span>
                            <span>{isSubmitting ? 'Suspending...' : 'Confirm Suspension'}</span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!user || isCustomInvalid || isSubmitting}
                            className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">{isSubmitting ? 'hourglass_top' : 'send'}</span>
                            <span>{isSubmitting ? 'Submitting Request...' : 'Submit for HR Approval'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
