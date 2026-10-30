import React from 'react';

/**
 * SuspendedAlertModal
 * Modal alert popup shown to employees whose accounts have been suspended by Admin.
 * Displays clear suspension messaging and requires user to click "OK",
 * which terminates the session and logs the user out to MPO Employee Hub.
 */
export default function SuspendedAlertModal({ isOpen, user, onOk, reason, suspendedByRole, suspendedByName }) {
    if (!isOpen) return null;

    const displayName = user?.fullName || user?.name || 'Employee';
    const employeeId = user?.employeeId || (user?.userId ? `MPO${user.userId}` : '');

    // Dynamically resolve who initiated/approved the suspension
    const resolveSuspendedBy = () => {
        const uid = String(user?.userId || user?.id || '');
        const empId = String(user?.employeeId || '').toUpperCase();

        // 1. Direct props
        let rawRole = suspendedByRole || user?.suspendedByRole || user?.approvedByRole || user?.reviewedByRole || '';
        let rawName = suspendedByName || user?.suspendedBy || user?.approvedBy || user?.reviewedByName || user?.reviewedBy || '';

        // 2. Check localStorage knome_suspended_accounts
        if (!rawRole) {
            try {
                const map = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                const entry = (uid && map[uid]) || (empId && map[empId]);
                if (entry) {
                    rawRole = entry.suspendedByRole || entry.approvedByRole || entry.role || '';
                    rawName = entry.approvedBy || entry.suspendedBy || '';
                    if (!rawRole && entry.reason) {
                        if (/system\s*admin/i.test(entry.reason)) rawRole = 'System Admin';
                        else if (/hr\s*admin/i.test(entry.reason)) rawRole = 'HR Admin';
                    }
                }
            } catch (e) {}
        }

        // 3. Check localStorage knome_suspension_requests
        if (!rawRole) {
            try {
                const reqs = JSON.parse(localStorage.getItem('knome_suspension_requests') || '[]');
                const found = reqs.find(r => 
                    (uid && Number(r.targetUserId) === Number(uid)) ||
                    (empId && String(r.targetEmployeeId || '').toUpperCase() === empId)
                );
                if (found) {
                    rawRole = found.reviewedByRole || found.reviewedByName || found.requestedByRole || '';
                    rawName = found.reviewedByName || found.reviewedBy || '';
                }
            } catch (e) {}
        }

        // 4. Check reason prop text
        if (!rawRole && reason) {
            if (/system\s*admin/i.test(reason)) rawRole = 'System Admin';
            else if (/hr\s*admin/i.test(reason)) rawRole = 'HR Admin';
        }

        // Normalize role
        const roleLower = String(rawRole || rawName || '').toLowerCase();
        if (roleLower.includes('system') || roleLower.includes('sysadm')) {
            return {
                shortRole: 'System Admin',
                fullRole: 'System Administrator',
                contactRole: 'System Administrator'
            };
        }

        // Default to HR Admin as primary governance authority per Knome specification
        return {
            shortRole: 'HR Admin',
            fullRole: 'HR Administrator',
            contactRole: 'HR Administrator'
        };
    };

    const adminRoleInfo = resolveSuspendedBy();

    return (
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
            {/* Modal Dialog Card */}
            <div 
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="suspend-alert-title"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-rose-500/30 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl shadow-rose-950/30 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden"
            >
                {/* Ambient Top Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-rose-500/15 blur-2xl rounded-full pointer-events-none"></div>

                {/* Animated Icon Badge */}
                <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <span className="material-symbols-outlined text-4xl sm:text-5xl animate-pulse">person_off</span>
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
                    </span>
                </div>

                {/* Status Chip */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[11px] font-black uppercase tracking-wider mb-3">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    <span>Access Denied</span>
                </div>

                {/* Modal Title */}
                <h2 
                    id="suspend-alert-title"
                    className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-snug mb-2"
                >
                    Your account is suspended by {adminRoleInfo.shortRole}
                </h2>

                {/* Subtitle / User Identification */}
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Account: <strong className="text-slate-800 dark:text-slate-200">{displayName}</strong>
                    {employeeId && <span className="ml-1 font-mono text-rose-500 dark:text-rose-400 font-bold">[{employeeId}]</span>}
                </p>

                {/* Details Notice Box */}
                <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 text-left text-xs space-y-2.5 mb-6 shadow-inner">
                    <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                        <span className="material-symbols-outlined text-rose-500 text-[18px] shrink-0 mt-0.5">block</span>
                        <p className="leading-relaxed">
                            Your TechnoSocial platform access has been suspended by the <strong>{adminRoleInfo.fullRole}</strong>. You cannot access posts, articles, videos, podcasts, or enterprise communities.
                        </p>
                    </div>

                    <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 text-[11px]">
                        <span className="material-symbols-outlined text-amber-500 text-[16px] shrink-0 mt-0.5">contact_support</span>
                        <p>
                            For inquiries or reactivation requests, please contact your <strong>{adminRoleInfo.contactRole}</strong>.
                        </p>
                    </div>
                </div>

                {/* Action Button: "OK" */}
                <div className="pt-1">
                    <button
                        onClick={onOk}
                        autoFocus
                        className="w-full py-3.5 px-6 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-sm rounded-xl shadow-lg shadow-rose-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
                    >
                        <span>OK</span>
                        <span className="material-symbols-outlined text-[18px]">logout</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
