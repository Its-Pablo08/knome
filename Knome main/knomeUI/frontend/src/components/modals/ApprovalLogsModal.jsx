import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';

export default function ApprovalLogsModal({
    isOpen,
    onClose,
    initialSection = 'all',
    logs = [],
    onRefresh = null,
    showToast = () => {}
}) {
    // ── Local Filter State ──
    const [sectionFilter, setSectionFilter] = useState(initialSection || 'all');
    const [mediaSubFilter, setMediaSubFilter] = useState('All');
    const [outcomeFilter, setOutcomeFilter] = useState('All');
    const [dateRangeFilter, setDateRangeFilter] = useState('all'); // 'all' | 'today' | '7days' | '30days'
    const [reviewerFilter, setReviewerFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');

    // ── Sorting & Pagination State ──
    const [sortColumn, setSortColumn] = useState('timestamp'); // 'timestamp' | 'title' | 'moderator' | 'outcome'
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // ── View Mode & Detail Inspector State ──
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [selectedAuditLog, setSelectedAuditLog] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isJsonViewExpanded, setIsJsonViewExpanded] = useState(false);

    // Synchronize initial section when modal opens
    useEffect(() => {
        if (isOpen) {
            setSectionFilter(initialSection || 'all');
            setMediaSubFilter('All');
            setOutcomeFilter('All');
            setDateRangeFilter('all');
            setReviewerFilter('All');
            setSearchTerm('');
            setCurrentPage(1);
            setSelectedAuditLog(null);
        }
    }, [isOpen, initialSection]);

    // Reset pagination to page 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [sectionFilter, mediaSubFilter, outcomeFilter, dateRangeFilter, reviewerFilter, searchTerm, pageSize]);

    // Extract unique reviewers from logs for dropdown filter
    const uniqueReviewers = useMemo(() => {
        const set = new Set();
        logs.forEach(l => {
            if (l.moderator && l.moderator.trim()) {
                set.add(l.moderator.trim());
            }
        });
        return Array.from(set).sort();
    }, [logs]);

    // Handle Manual Refresh
    const handleTriggerRefresh = async () => {
        if (onRefresh) {
            setIsRefreshing(true);
            try {
                await onRefresh();
                showToast('Audit records refreshed successfully.');
            } catch (err) {
                console.error('Failed to refresh audit records:', err);
                showToast('Refreshed audit log state.');
            } finally {
                setTimeout(() => setIsRefreshing(false), 500);
            }
        }
    };

    // ── KPI Summary Metrics Computation ──
    const summaryMetrics = useMemo(() => {
        const total = logs.length;
        let approved = 0;
        let rejected = 0;
        let mediaCount = 0;
        let commCount = 0;
        let modCount = 0;
        let roleCount = 0;

        logs.forEach(l => {
            const out = (l.outcome || '').toLowerCase();
            if (out.includes('approve') || out.includes('activate')) approved++;
            else if (out.includes('reject') || out.includes('dismiss') || out.includes('action') || out.includes('remove') || out.includes('suspend')) rejected++;

            if (l.section === 'media') mediaCount++;
            else if (l.section === 'community') commCount++;
            else if (l.section === 'moderation') modCount++;
            else if (l.section === 'roles') roleCount++;
        });

        const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

        return {
            total,
            approved,
            rejected,
            approvalRate,
            mediaCount,
            governanceCount: commCount + roleCount,
            modCount
        };
    }, [logs]);

    // ── Filtered Logs Computation ──
    const filteredLogs = useMemo(() => {
        let list = [...logs];

        // 1. Section Filter
        if (sectionFilter && sectionFilter !== 'all') {
            list = list.filter(l => l.section === sectionFilter);
        }

        // 2. Media Sub-filter
        if (mediaSubFilter !== 'All') {
            list = list.filter(l => (l.mediaType || '').toLowerCase() === mediaSubFilter.toLowerCase());
        }

        // 3. Outcome Filter
        if (outcomeFilter === 'Approved') {
            list = list.filter(l => (l.outcome || '').toLowerCase().includes('approve') || (l.outcome || '').toLowerCase().includes('activate'));
        } else if (outcomeFilter === 'Rejected') {
            list = list.filter(l => (l.outcome || '').toLowerCase().includes('reject'));
        } else if (outcomeFilter === 'Dismissed') {
            list = list.filter(l => (l.outcome || '').toLowerCase().includes('dismiss') || (l.outcome || '').toLowerCase().includes('action') || (l.outcome || '').toLowerCase().includes('remove'));
        }

        // 4. Reviewer Filter
        if (reviewerFilter !== 'All') {
            list = list.filter(l => (l.moderator || '').trim() === reviewerFilter);
        }

        // 5. Date Range Filter
        if (dateRangeFilter !== 'all') {
            const now = Date.now();
            list = list.filter(l => {
                const itemTime = new Date(l.timestamp || l.time || 0).getTime();
                if (isNaN(itemTime) || itemTime === 0) return true;
                const diffDays = (now - itemTime) / (1000 * 60 * 60 * 24);
                if (dateRangeFilter === 'today') return diffDays <= 1;
                if (dateRangeFilter === '7days') return diffDays <= 7;
                if (dateRangeFilter === '30days') return diffDays <= 30;
                return true;
            });
        }

        // 6. Free-Text Search Filter
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            list = list.filter(l => {
                return (
                    String(l.id || '').toLowerCase().includes(q) ||
                    String(l.target || '').toLowerCase().includes(q) ||
                    String(l.title || '').toLowerCase().includes(q) ||
                    String(l.moderator || '').toLowerCase().includes(q) ||
                    String(l.moderatorRole || '').toLowerCase().includes(q) ||
                    String(l.authorName || '').toLowerCase().includes(q) ||
                    String(l.action || '').toLowerCase().includes(q) ||
                    String(l.outcome || '').toLowerCase().includes(q) ||
                    String(l.mediaType || '').toLowerCase().includes(q) ||
                    String(l.section || '').toLowerCase().includes(q)
                );
            });
        }

        // ── Sorting ──
        list.sort((a, b) => {
            let valA, valB;
            if (sortColumn === 'timestamp') {
                valA = new Date(a.timestamp || a.time || 0).getTime();
                valB = new Date(b.timestamp || b.time || 0).getTime();
            } else if (sortColumn === 'title') {
                valA = String(a.title || a.target || '').toLowerCase();
                valB = String(b.title || b.target || '').toLowerCase();
            } else if (sortColumn === 'moderator') {
                valA = String(a.moderator || '').toLowerCase();
                valB = String(b.moderator || '').toLowerCase();
            } else if (sortColumn === 'outcome') {
                valA = String(a.outcome || '').toLowerCase();
                valB = String(b.outcome || '').toLowerCase();
            } else {
                valA = 0;
                valB = 0;
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return list;
    }, [logs, sectionFilter, mediaSubFilter, outcomeFilter, reviewerFilter, dateRangeFilter, searchTerm, sortColumn, sortDirection]);

    // ── Pagination Calculation ──
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredLogs.slice(startIndex, startIndex + pageSize);
    }, [filteredLogs, currentPage, pageSize]);

    // Handle column sorting toggle
    const handleSort = (col) => {
        if (sortColumn === col) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(col);
            setSortDirection('desc');
        }
    };

    // Reset all filters
    const handleResetFilters = () => {
        setSectionFilter('all');
        setMediaSubFilter('All');
        setOutcomeFilter('All');
        setDateRangeFilter('all');
        setReviewerFilter('All');
        setSearchTerm('');
        setCurrentPage(1);
    };

    const hasActiveFilters = sectionFilter !== 'all' || mediaSubFilter !== 'All' || outcomeFilter !== 'All' || dateRangeFilter !== 'all' || reviewerFilter !== 'All' || searchTerm.trim() !== '';

    // ── CSV Export Functionality ──
    const handleExportCSV = () => {
        const BOM = '\uFEFF';
        const headers = ['Log ID', 'Timestamp', 'Section', 'Media Type', 'Outcome', 'Reviewer', 'Reviewer Role', 'Subject', 'Full Audit Target Description'];
        const rows = filteredLogs.map(l => [
            l.id || '',
            l.time || l.timestamp || '',
            l.section || '',
            l.mediaType || 'N/A',
            l.outcome || '',
            l.moderator || '',
            l.moderatorRole || '',
            l.title || '',
            l.target || ''
        ]);

        const csvContent = BOM + [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Enterprise_Approval_Logs_${sectionFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported ${filteredLogs.length} audit records to CSV.`);
    };

    // ── Excel (.xlsx) Export Functionality ──
    const handleExportExcel = () => {
        try {
            const exportData = filteredLogs.map(l => ({
                'Log ID': l.id || '',
                'Date & Time': l.time || l.timestamp || '',
                'Section': (l.section || '').toUpperCase(),
                'Media Type': l.mediaType || 'N/A',
                'Decision Outcome': l.outcome || '',
                'Reviewer': l.moderator || '',
                'Reviewer Role': l.moderatorRole || '',
                'Subject': l.title || '',
                'Full Audit Description': l.target || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            // Auto-size column widths
            worksheet['!cols'] = [
                { wch: 18 },
                { wch: 22 },
                { wch: 15 },
                { wch: 14 },
                { wch: 16 },
                { wch: 20 },
                { wch: 18 },
                { wch: 30 },
                { wch: 55 }
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Approval Logs');
            XLSX.writeFile(workbook, `Approval_Logs_${sectionFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            showToast(`Exported ${filteredLogs.length} audit records to Excel (.xlsx).`);
        } catch (err) {
            console.error('Excel export error:', err);
            handleExportCSV();
        }
    };

    if (!isOpen) return null;

    // Helper to get styling for outcome badge
    const getOutcomeBadge = (outcome) => {
        const out = (outcome || '').toLowerCase();
        if (out.includes('approve') || out.includes('activate')) {
            return {
                bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80',
                icon: 'check_circle',
                label: outcome || 'Approved'
            };
        }
        if (out.includes('reject')) {
            return {
                bg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/80',
                icon: 'cancel',
                label: outcome || 'Rejected'
            };
        }
        if (out.includes('dismiss')) {
            return {
                bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
                icon: 'close',
                label: outcome || 'Dismissed'
            };
        }
        return {
            bg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80',
            icon: 'gavel',
            label: outcome || 'Action Taken'
        };
    };

    // Helper to get section styling
    const getSectionConfig = (section, mediaType) => {
        if (section === 'community') {
            return { icon: 'groups', label: 'Community', color: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800' };
        }
        if (section === 'moderation') {
            return { icon: 'shield', label: 'Moderation', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
        }
        if (section === 'roles') {
            return { icon: 'badge', label: 'Role Request', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
        }
        // Media section
        const mt = (mediaType || '').toLowerCase();
        if (mt === 'wiki') return { icon: 'menu_book', label: 'Wiki', color: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800' };
        if (mt === 'video') return { icon: 'videocam', label: 'Video', color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
        if (mt === 'podcast') return { icon: 'podcasts', label: 'Podcast', color: 'bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800' };
        if (mt === 'clip') return { icon: 'movie', label: 'Clip', color: 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800' };
        return { icon: 'article', label: mediaType || 'Article', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 font-sans"
            onClick={onClose}
        >
            <div 
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 animate-in zoom-in-95 ${
                    isFullscreen ? 'w-full h-full max-w-none max-h-none rounded-none' : 'w-full max-w-7xl max-h-[92vh]'
                }`}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Modal Header: Enterprise Dashboard Title & Controls ── */}
                <div className="px-5 py-4 sm:px-6 sm:py-5 bg-gradient-to-r from-slate-50 via-indigo-50/25 to-slate-50 dark:from-slate-900 dark:via-indigo-950/20 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25 shrink-0 ring-4 ring-indigo-500/10">
                            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                                    Governance Approval Logs
                                </h2>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Live Audit Trail
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                Permanent compliance ledger of employee content reviews, community approvals, and moderation decisions.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Refresh Button */}
                        {onRefresh && (
                            <button
                                type="button"
                                onClick={handleTriggerRefresh}
                                disabled={isRefreshing}
                                className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                title="Refresh live audit logs"
                            >
                                <span className={`material-symbols-outlined text-[19px] ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`}>
                                    sync
                                </span>
                            </button>
                        )}

                        {/* Fullscreen Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(prev => !prev)}
                            className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
                        >
                            <span className="material-symbols-outlined text-[19px]">
                                {isFullscreen ? 'close_fullscreen' : 'open_in_full'}
                            </span>
                        </button>

                        {/* Close Modal Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                            title="Close Modal"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* ── Summary Cards: KPI Enterprise Metrics Hub ── */}
                <div className="px-5 py-3 sm:px-6 bg-slate-50/70 dark:bg-slate-850/60 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        {/* Total Decisions */}
                        <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Audits</span>
                                <span className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1 block">
                                    {summaryMetrics.total}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">Logged decisions</span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">analytics</span>
                            </div>
                        </div>

                        {/* Approved Decisions */}
                        <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Approved</span>
                                <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                                        {summaryMetrics.approved}
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1 rounded">
                                        {summaryMetrics.approvalRate}%
                                    </span>
                                </div>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">Approval rate</span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">verified</span>
                            </div>
                        </div>

                        {/* Rejections & Actions */}
                        <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Rejections/Actions</span>
                                <span className="text-xl font-black text-rose-600 dark:text-rose-400 leading-none mt-1 block">
                                    {summaryMetrics.rejected}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">Policy interventions</span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">gavel</span>
                            </div>
                        </div>

                        {/* Media Reviews */}
                        <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Media Reviews</span>
                                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1 block">
                                    {summaryMetrics.mediaCount}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">Articles, wikis, videos</span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">perm_media</span>
                            </div>
                        </div>

                        {/* Community & Governance */}
                        <div className="bg-white dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs col-span-2 sm:col-span-1 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Governance</span>
                                <span className="text-xl font-black text-purple-600 dark:text-purple-400 leading-none mt-1 block">
                                    {summaryMetrics.governanceCount}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">Communities & roles</span>
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[20px]">shield_person</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Filters & Search Control Hub ── */}
                <div className="px-5 py-3 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
                    {/* Row 1: Section Navigation Tabs with Badges */}
                    <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2">
                            {[
                                { id: 'all', label: 'All Sections', icon: 'hub' },
                                { id: 'media', label: 'Media Approvals', icon: 'perm_media' },
                                { id: 'community', label: 'Community Approvals', icon: 'groups' },
                                { id: 'moderation', label: 'Content Moderation', icon: 'shield' },
                                { id: 'roles', label: 'Role Approvals', icon: 'badge' }
                            ].map(tab => {
                                const tabCount = tab.id === 'all' ? logs.length : logs.filter(l => l.section === tab.id).length;
                                const isSelected = sectionFilter === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => {
                                            setSectionFilter(tab.id);
                                            setMediaSubFilter('All');
                                        }}
                                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer shadow-2xs ${
                                            isSelected
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                                        <span>{tab.label}</span>
                                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                            isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}>
                                            {tabCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Export Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleExportCSV}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                title="Export current view to CSV"
                            >
                                <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">download</span>
                                <span>CSV</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                title="Export current view to Microsoft Excel (.xlsx)"
                            >
                                <span className="material-symbols-outlined text-[16px]">table_view</span>
                                <span>Excel (.xlsx)</span>
                            </button>
                        </div>
                    </div>

                    {/* Row 2: Secondary Filters & Search Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                        <div className="flex flex-wrap items-center gap-2 grow">
                            {/* Media Sub-Filter (visible for 'all' or 'media') */}
                            {(sectionFilter === 'media' || sectionFilter === 'all') && (
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                    {['All', 'Article', 'Wiki', 'Video', 'Podcast'].map(sub => (
                                        <button
                                            key={sub}
                                            type="button"
                                            onClick={() => setMediaSubFilter(sub)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                mediaSubFilter === sub
                                                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            {sub === 'All' ? 'All Media' : sub + 's'}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Outcome Filter Pills */}
                            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                {[
                                    { id: 'All', label: 'All Outcomes' },
                                    { id: 'Approved', label: 'Approved' },
                                    { id: 'Rejected', label: 'Rejected' },
                                    { id: 'Dismissed', label: 'Dismissed/Action' }
                                ].map(out => (
                                    <button
                                        key={out.id}
                                        type="button"
                                        onClick={() => setOutcomeFilter(out.id)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                            outcomeFilter === out.id
                                                ? out.id === 'Approved'
                                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                                    : out.id === 'Rejected'
                                                        ? 'bg-rose-600 text-white shadow-2xs'
                                                        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-2xs'
                                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        {out.label}
                                    </button>
                                ))}
                            </div>

                            {/* Reviewer Filter Dropdown */}
                            {uniqueReviewers.length > 0 && (
                                <div className="relative">
                                    <select
                                        value={reviewerFilter}
                                        onChange={e => setReviewerFilter(e.target.value)}
                                        className="h-8 pl-2.5 pr-7 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer appearance-none"
                                    >
                                        <option value="All">All Reviewers ({uniqueReviewers.length})</option>
                                        {uniqueReviewers.map(rev => (
                                            <option key={rev} value={rev}>{rev}</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none">
                                        arrow_drop_down
                                    </span>
                                </div>
                            )}

                            {/* Date Period Filter Dropdown */}
                            <div className="relative">
                                <select
                                    value={dateRangeFilter}
                                    onChange={e => setDateRangeFilter(e.target.value)}
                                    className="h-8 pl-2.5 pr-7 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer appearance-none"
                                >
                                    <option value="all">All Dates</option>
                                    <option value="today">Today</option>
                                    <option value="7days">Last 7 Days</option>
                                    <option value="30days">Last 30 Days</option>
                                </select>
                                <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400 pointer-events-none">
                                    arrow_drop_down
                                </span>
                            </div>

                            {/* Reset Filters Button */}
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[13px]">restart_alt</span>
                                    <span>Reset Filters</span>
                                </button>
                            )}
                        </div>

                        {/* Search Input Box */}
                        <div className="relative min-w-[220px] sm:w-64">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">search</span>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search title, moderator, ID..."
                                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Main View Area: Sortable Enterprise Table & Detail Inspector ── */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0 relative">
                    {/* Sortable Table Container */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredLogs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 shadow-sm mb-3">
                                    <span className="material-symbols-outlined text-[32px]">manage_search</span>
                                </div>
                                <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">No Matching Approval Records</h4>
                                <p className="text-xs text-slate-400 max-w-md mt-1 mb-4">
                                    We couldn't find any audit logs matching your current filters. Try selecting a different section, adjusting the date range, or resetting filters.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                    <span>Reset All Filters</span>
                                </button>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-850/80 sticky top-0 z-10 backdrop-blur-xs text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        <th 
                                            onClick={() => handleSort('timestamp')}
                                            className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>Timestamp</span>
                                                <span className="material-symbols-outlined text-[14px]">
                                                    {sortColumn === 'timestamp' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                </span>
                                            </div>
                                        </th>
                                        <th className="px-4 py-3">Domain / Type</th>
                                        <th 
                                            onClick={() => handleSort('title')}
                                            className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>Subject & Action Summary</span>
                                                <span className="material-symbols-outlined text-[14px]">
                                                    {sortColumn === 'title' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                </span>
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSort('moderator')}
                                            className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>Reviewer / Moderator</span>
                                                <span className="material-symbols-outlined text-[14px]">
                                                    {sortColumn === 'moderator' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                </span>
                                            </div>
                                        </th>
                                        <th 
                                            onClick={() => handleSort('outcome')}
                                            className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none text-center"
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Decision</span>
                                                <span className="material-symbols-outlined text-[14px]">
                                                    {sortColumn === 'outcome' ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                                                </span>
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                    {paginatedLogs.map((log) => {
                                        const outcomeBadge = getOutcomeBadge(log.outcome);
                                        const sectionCfg = getSectionConfig(log.section, log.mediaType);
                                        const isSelected = selectedAuditLog && selectedAuditLog.id === log.id;

                                        return (
                                            <tr 
                                                key={log.id}
                                                onClick={() => setSelectedAuditLog(log)}
                                                className={`group transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-l-4 border-l-indigo-600'
                                                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                                }`}
                                            >
                                                {/* Timestamp Column */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                                        {log.time}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono">
                                                        ID: #{String(log.id).slice(-8)}
                                                    </div>
                                                </td>

                                                {/* Domain / Type Column */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-2xs ${sectionCfg.color}`}>
                                                        <span className="material-symbols-outlined text-[14px]">{sectionCfg.icon}</span>
                                                        <span>{sectionCfg.label}</span>
                                                    </span>
                                                </td>

                                                {/* Subject & Summary Description */}
                                                <td className="px-4 py-3 min-w-[260px] max-w-md">
                                                    {log.title && (
                                                        <div className="font-extrabold text-slate-900 dark:text-white truncate text-xs">
                                                            {log.title}
                                                        </div>
                                                    )}
                                                    <div className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed line-clamp-2 mt-0.5">
                                                        {log.target}
                                                    </div>
                                                    {log.authorName && (
                                                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                            Submitted by: <span className="font-semibold text-slate-600 dark:text-slate-300">{log.authorName}</span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Reviewer / Moderator Column */}
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white text-[10px] font-black flex items-center justify-center shrink-0 uppercase shadow-2xs">
                                                            {log.moderator?.charAt(0) || 'M'}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                                                {log.moderator}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-medium">
                                                                {log.moderatorRole || 'Moderator'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Decision Outcome Status Badge */}
                                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${outcomeBadge.bg}`}>
                                                        <span className="material-symbols-outlined text-[13px]">{outcomeBadge.icon}</span>
                                                        <span>{outcomeBadge.label}</span>
                                                    </span>
                                                </td>

                                                {/* Actions Column */}
                                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAuditLog(log);
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <span>Inspect</span>
                                                        <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* ── Detailed Audit Inspector (Slide-Over Panel on Right) ── */}
                    {selectedAuditLog && (
                        <div className="w-full md:w-96 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-850/95 flex flex-col shrink-0 overflow-y-auto animate-in slide-in-from-right duration-200">
                            {/* Panel Header */}
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px]">verified_user</span>
                                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                        Audit Detail Inspector
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedAuditLog(null)}
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            </div>

                            {/* Panel Body */}
                            <div className="p-4 space-y-4 text-xs">
                                {/* Decision Outcome Hero Card */}
                                {(() => {
                                    const b = getOutcomeBadge(selectedAuditLog.outcome);
                                    return (
                                        <div className={`p-3.5 rounded-2xl border ${b.bg} flex items-center justify-between`}>
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Recorded Decision</span>
                                                <span className="text-base font-black mt-0.5 block flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[18px]">{b.icon}</span>
                                                    {b.label}
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-mono opacity-80">
                                                {selectedAuditLog.time}
                                            </span>
                                        </div>
                                    );
                                })()}

                                {/* Action & Target Breakdown */}
                                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Audit Subject</span>
                                    {selectedAuditLog.title && (
                                        <div className="text-xs font-black text-slate-900 dark:text-white">
                                            {selectedAuditLog.title}
                                        </div>
                                    )}
                                    <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                        {selectedAuditLog.target}
                                    </div>
                                </div>

                                {/* Metadata Grid */}
                                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Governance Metadata</span>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Section</span>
                                            <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase">
                                                {selectedAuditLog.section}
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Media Type</span>
                                            <span className="font-extrabold text-slate-800 dark:text-slate-200">
                                                {selectedAuditLog.mediaType || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Reviewer</span>
                                            <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate block">
                                                {selectedAuditLog.moderator}
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                                            <span className="text-[9px] text-slate-400 block uppercase font-bold">Reviewer Role</span>
                                            <span className="font-extrabold text-slate-800 dark:text-slate-200">
                                                {selectedAuditLog.moderatorRole || 'Staff'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Record Identifier & Copy */}
                                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Log ID</span>
                                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 truncate block">
                                            {selectedAuditLog.id}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(String(selectedAuditLog.id));
                                            showToast('Audit Log ID copied to clipboard');
                                        }}
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 shrink-0 cursor-pointer"
                                    >
                                        Copy ID
                                    </button>
                                </div>

                                {/* Raw Audit JSON Inspector */}
                                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setIsJsonViewExpanded(prev => !prev)}
                                        className="w-full px-3.5 py-2.5 flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[15px] text-slate-400">data_object</span>
                                            <span>Raw Compliance Payload</span>
                                        </div>
                                        <span className="material-symbols-outlined text-[15px]">
                                            {isJsonViewExpanded ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                    {isJsonViewExpanded && (
                                        <div className="p-3 bg-slate-950 border-t border-slate-800">
                                            <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto p-2 bg-slate-900 rounded-lg">
                                                {JSON.stringify(selectedAuditLog, null, 2)}
                                            </pre>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(JSON.stringify(selectedAuditLog, null, 2));
                                                    showToast('Audit payload JSON copied');
                                                }}
                                                className="mt-2 w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] transition-colors"
                                            >
                                                Copy JSON
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer: Pagination & Record Count ── */}
                <div className="px-5 py-3.5 sm:px-6 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Showing <strong className="text-slate-800 dark:text-slate-200">{filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to <strong className="text-slate-800 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> of <strong className="text-slate-800 dark:text-slate-200">{filteredLogs.length}</strong> records
                            {hasActiveFilters && ` (filtered from ${logs.length})`}
                        </span>

                        {/* Page Size Selector */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>Rows:</span>
                            <select
                                value={pageSize}
                                onChange={e => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="h-7 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="First Page"
                        >
                            <span className="material-symbols-outlined text-[16px]">first_page</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="Previous Page"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                        </button>

                        {/* Page Numbers */}
                        <div className="flex items-center gap-1 px-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }

                                return (
                                    <button
                                        key={pageNum}
                                        type="button"
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                            currentPage === pageNum
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="Next Page"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            title="Last Page"
                        >
                            <span className="material-symbols-outlined text-[16px]">last_page</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="ml-3 px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs transition cursor-pointer shadow-xs"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
