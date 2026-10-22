import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { wikiApi } from '../utils/wikiService';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { resolveMediaUrl } from '../utils/apiService';
import CreateWikiModal from '../components/modals/CreateWikiModal';
import WikiSectionModal from '../components/modals/WikiSectionModal';
import WikiCollaboratorsModal from '../components/modals/WikiCollaboratorsModal';
import WikiShareModal from '../components/modals/WikiShareModal';
import WikiVersionHistoryModal from '../components/modals/WikiVersionHistoryModal';
import WikiActivityModal from '../components/modals/WikiActivityModal';
import { sanitizeHtml } from '../utils/sanitizeHtml';

function OutlineSectionItem({
    section,
    numberPrefix,
    level,
    activeSectionId,
    onSelect,
    wiki,
    onMove,
    isFirst = false,
    isLast = false,
    onAddSub,
    onEdit,
    onDelete,
    onAlignSubsections
}) {
    const isActive = String(activeSectionId) === String(section.sectionId);
    const hasSubsections = section.subsections && section.subsections.length > 0;

    return (
        <div className="space-y-1">
            <div
                onClick={() => onSelect(section.sectionId)}
                className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                    level > 0 ? 'ml-3 pl-2.5 border-l-2' : ''
                } ${
                    isActive
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400 font-medium'
                }`}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-slate-400 shrink-0 font-bold">
                        {numberPrefix}
                    </span>
                    <span className="truncate">{section.title}</span>
                </div>

                {/* Action buttons on hover */}
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    {wiki.canEdit && (
                        <>
                            {/* Universal Move Up / Down */}
                            <button
                                type="button"
                                disabled={isFirst}
                                onClick={(e) => onMove(section, 'up', e)}
                                className={`p-1 rounded transition-colors ${
                                    isFirst
                                        ? 'opacity-25 cursor-not-allowed text-slate-300 dark:text-slate-600'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer'
                                }`}
                                title={isFirst ? "Already at top of list" : "Move Up"}
                            >
                                <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
                            </button>
                            <button
                                type="button"
                                disabled={isLast}
                                onClick={(e) => onMove(section, 'down', e)}
                                className={`p-1 rounded transition-colors ${
                                    isLast
                                        ? 'opacity-25 cursor-not-allowed text-slate-300 dark:text-slate-600'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer'
                                }`}
                                title={isLast ? "Already at bottom of list" : "Move Down"}
                            >
                                <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                            </button>

                            {/* Quick Align as 1.1, 1.2 if it has children */}
                            {hasSubsections && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAlignSubsections(section);
                                    }}
                                    className="p-1 rounded text-slate-400 hover:text-indigo-600"
                                    title={`Align all subsections under "${section.title}" as ${numberPrefix}.1, ${numberPrefix}.2...`}
                                >
                                    <span className="material-symbols-outlined text-[13px]">format_list_numbered</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={(e) => onAddSub(section, e)}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600"
                                title="Add Subsection"
                            >
                                <span className="material-symbols-outlined text-[13px]">add_circle</span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => onEdit(section, e)}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600"
                                title="Edit Section"
                            >
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                            </button>
                        </>
                    )}
                    {section.canDelete && (
                        <button
                            type="button"
                            onClick={(e) => onDelete(section, e)}
                            className="p-1 rounded text-slate-400 hover:text-red-500"
                            title="Delete Section"
                        >
                            <span className="material-symbols-outlined text-[13px]">delete</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Recursively render subsections */}
            {hasSubsections && (
                <div className="space-y-1">
                    {section.subsections.map((sub, sIdx) => (
                        <OutlineSectionItem
                            key={sub.sectionId}
                            section={sub}
                            numberPrefix={`${numberPrefix}.${sIdx + 1}`}
                            level={level + 1}
                            activeSectionId={activeSectionId}
                            onSelect={onSelect}
                            wiki={wiki}
                            onMove={onMove}
                            isFirst={sIdx === 0}
                            isLast={sIdx === section.subsections.length - 1}
                            onAddSub={onAddSub}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onAlignSubsections={onAlignSubsections}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function WikiView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();

    const wikiIdParam = routeId || searchParams.get('id');
    const wikiId = wikiIdParam ? parseInt(wikiIdParam, 10) : null;
    const initialSectionIdParam = searchParams.get('section');

    const parsedInitialSectionId = (initialSectionIdParam && initialSectionIdParam !== 'overview' && !isNaN(parseInt(initialSectionIdParam, 10)))
        ? parseInt(initialSectionIdParam, 10)
        : 'overview';

    const [wiki, setWiki] = useState(null);
    const [activeSectionId, setActiveSectionId] = useState(parsedInitialSectionId);
    const [isLoading, setIsLoading] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    // Modals
    const [isEditWikiModalOpen, setIsEditWikiModalOpen] = useState(false);
    const [sectionModalState, setSectionModalState] = useState({ isOpen: false, data: null, defaultParentId: null });
    const [isCollaboratorsModalOpen, setIsCollaboratorsModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
    const isModerator = ['MOD', 'MODERATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
        ['Moderator'].includes(currentUser?.roleName) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['MOD', 'MODERATOR'].includes(String(r?.roleCode || r?.roleName || r || '').toUpperCase())));

    const isSysAdmin = ['SYSADM', 'SYSTEM ADMIN', 'SYSTEM ADMINISTRATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
        ['System Administrator', 'System Admin'].includes(currentUser?.roleName) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'SYSTEM ADMIN', 'SYSTEM ADMINISTRATOR'].includes(String(r?.roleCode || r?.roleName || r || '').toUpperCase())));

    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

    const loadWikiData = async (forceFresh = false) => {
        if (!wikiId) return null;
        setIsLoading(true);
        try {
            const data = await wikiApi.getWiki(wikiId);
            if (data?.status === 'PendingApproval' && !isModerator && !isSysAdmin) {
                addToast('This wiki documentation is currently awaiting approval.', 'warning');
                navigate('/wiki');
                return null;
            }
            setWiki(data);
            // Record view count once and update state with authoritative unique count
            if (!forceFresh) {
                wikiApi.recordWikiView(wikiId).then(res => {
                    const authoritative = res?.data ?? res?.viewCount ?? res;
                    if (typeof authoritative === 'number') {
                        setWiki(prev => prev ? { ...prev, viewCount: authoritative } : prev);
                    }
                }).catch(() => {});
            }
            return data;
        } catch (err) {
            console.error('Failed to load wiki:', err);
            const msg = err?.response?.data?.message || err?.message || 'Could not load Wiki document.';
            addToast(msg, 'error');
            navigate('/wiki');
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadWikiData();
    }, [wikiId]);

    // Real-time SignalR view updates
    useEffect(() => {
        const handleViewUpdated = (e) => {
            const detail = e.detail;
            if (!detail) return;
            const normType = (detail.contentType || '').toLowerCase();
            if (normType && normType !== 'wiki') return;
            const targetId = String(detail.contentId || detail.wikiId || detail.id);
            if (String(wikiId) === targetId && detail.viewCount !== undefined) {
                setWiki(prev => prev ? { ...prev, viewCount: Number(detail.viewCount) } : prev);
            }
        };

        window.addEventListener('knome:view-updated', handleViewUpdated);
        return () => window.removeEventListener('knome:view-updated', handleViewUpdated);
    }, [wikiId]);

    const handleSectionSaved = async (savedSec) => {
        if (!savedSec) {
            await loadWikiData(true);
            return;
        }

        // 1. Immediately update local hierarchy & sections state without requiring a refresh
        setWiki(prev => {
            if (!prev) return prev;
            const updatedSections = JSON.parse(JSON.stringify(prev.sections || []));

            const targetSecId = savedSec.sectionId;
            const parentId = (savedSec.parentSectionId && Number(savedSec.parentSectionId) > 0)
                ? Number(savedSec.parentSectionId)
                : null;

            const updateInTree = (list) => {
                for (let i = 0; i < list.length; i++) {
                    if (String(list[i].sectionId) === String(targetSecId)) {
                        list[i] = { ...list[i], ...savedSec };
                        return true;
                    }
                    if (list[i].subsections && list[i].subsections.length > 0) {
                        if (updateInTree(list[i].subsections)) return true;
                    }
                }
                return false;
            };

            const updatedExisting = updateInTree(updatedSections);
            if (!updatedExisting) {
                const newSectionItem = {
                    ...savedSec,
                    subsections: savedSec.subsections || []
                };

                if (parentId) {
                    const addToParent = (list) => {
                        for (const item of list) {
                            if (String(item.sectionId) === String(parentId)) {
                                item.subsections = item.subsections || [];
                                if (!item.subsections.some(s => String(s.sectionId) === String(newSectionItem.sectionId))) {
                                    item.subsections.push(newSectionItem);
                                }
                                return true;
                            }
                            if (item.subsections && item.subsections.length > 0) {
                                if (addToParent(item.subsections)) return true;
                            }
                        }
                        return false;
                    };

                    const added = addToParent(updatedSections);
                    if (!added) {
                        if (!updatedSections.some(s => String(s.sectionId) === String(newSectionItem.sectionId))) {
                            updatedSections.push(newSectionItem);
                        }
                    }
                } else {
                    if (!updatedSections.some(s => String(s.sectionId) === String(newSectionItem.sectionId))) {
                        updatedSections.push(newSectionItem);
                    }
                }
            }

            return {
                ...prev,
                sections: updatedSections,
                sectionsCount: (prev.sectionsCount || 0) + (updatedExisting ? 0 : 1)
            };
        });

        // 2. Immediately select the new/updated section so title and content display without delay
        if (savedSec.sectionId) {
            handleSelectSection(savedSec.sectionId);
        }

        // 3. Re-sync from database to guarantee persistence and authoritative state
        try {
            const freshData = await loadWikiData(true);
            if (savedSec.sectionId) {
                handleSelectSection(savedSec.sectionId);
            }
        } catch (err) {
            console.error('Error re-syncing wiki data:', err);
        }
    };

    // Flat list of all sections with hierarchy paths and numbering for lookup & modal
    const allSectionsFlat = useMemo(() => {
        if (!wiki?.sections) return [];
        const flat = [];
        const recurse = (list, prefix = '', depth = 0) => {
            list.forEach((s, idx) => {
                const currentPrefix = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
                flat.push({
                    ...s,
                    numberPrefix: currentPrefix,
                    depth
                });
                if (s.subsections && s.subsections.length > 0) {
                    recurse(s.subsections, currentPrefix, depth + 1);
                }
            });
        };
        recurse(wiki.sections, '', 0);
        return flat;
    }, [wiki?.sections]);

    // Check if any section tree has deep chain nesting (e.g. 1.1.1.1.1)
    const deepLadderSection = useMemo(() => {
        if (!wiki?.sections) return null;
        for (const root of wiki.sections) {
            let maxDepth = 0;
            const checkDepth = (item, currentDepth) => {
                if (currentDepth > maxDepth) maxDepth = currentDepth;
                if (item.subsections && item.subsections.length > 0) {
                    for (const sub of item.subsections) {
                        checkDepth(sub, currentDepth + 1);
                    }
                }
            };
            checkDepth(root, 0);
            if (maxDepth >= 2) {
                return root;
            }
        }
        return null;
    }, [wiki?.sections]);

    // Determine current active content
    const currentActiveSection = useMemo(() => {
        if (activeSectionId === 'overview' || !activeSectionId) return null;
        return allSectionsFlat.find(s => String(s.sectionId) === String(activeSectionId)) || null;
    }, [activeSectionId, allSectionsFlat]);

    // Update URL when active section changes
    const handleSelectSection = (secId) => {
        setActiveSectionId(secId);
        setIsMobileSidebarOpen(false);
        const params = new URLSearchParams(searchParams);
        if (secId === 'overview') {
            params.delete('section');
        } else {
            params.set('section', secId);
        }
        setSearchParams(params, { replace: true });
    };

    // Calculate reading time
    const readingTimeMinutes = useMemo(() => {
        const text = currentActiveSection ? currentActiveSection.contentHtml : (wiki?.contentHtml || '');
        const wordCount = (text || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(wordCount / 200));
    }, [currentActiveSection, wiki]);

    // Delete section
    const handleDeleteSection = async (section, e) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'Delete Section',
            message: `Are you sure you want to delete "${section.title}"? This will also remove any subsections under it.`,
            confirmText: 'Delete Section',
            confirmButtonClass: 'bg-red-600 hover:bg-red-700 text-white'
        });
        if (!ok) return;

        try {
            await wikiApi.deleteSection(wikiId, section.sectionId);
            addToast('Section deleted successfully.', 'success');
            if (activeSectionId === section.sectionId) {
                handleSelectSection('overview');
            }
            loadWikiData(true);
        } catch (err) {
            console.error('Error deleting section:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to delete section.', 'error');
        }
    };

    // Move section up/down (works at any level with 0ms optimistic UI update)
    const handleMoveSection = async (section, direction, e) => {
        if (e) e.stopPropagation();
        if (!wiki?.sections || !section) return;

        const previousWiki = wiki;
        let payloadItems = [];

        // Perform swap directly in cloned sections tree
        const clonedSections = JSON.parse(JSON.stringify(wiki.sections));

        const trySwapInArray = (arr, parent = null) => {
            const idx = arr.findIndex(s => String(s.sectionId) === String(section.sectionId));
            if (idx !== -1) {
                const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
                if (targetIdx < 0 || targetIdx >= arr.length) {
                    return { swapped: false, reason: 'boundary' };
                }

                // Swap elements in place
                const temp = arr[idx];
                arr[idx] = arr[targetIdx];
                arr[targetIdx] = temp;

                // Re-sequence sort orders cleanly for all siblings: 10, 20, 30...
                arr.forEach((item, i) => {
                    item.sortOrder = (i + 1) * 10;
                    if (parent) {
                        item.parentSectionId = parent.sectionId;
                    }
                });

                payloadItems = arr.map((item, i) => ({
                    sectionId: item.sectionId,
                    parentSectionId: parent
                        ? Number(parent.sectionId)
                        : (item.parentSectionId && Number(item.parentSectionId) > 0 ? Number(item.parentSectionId) : null),
                    sortOrder: (i + 1) * 10
                }));

                return { swapped: true };
            }

            for (const item of arr) {
                if (item.subsections && item.subsections.length > 0) {
                    const res = trySwapInArray(item.subsections, item);
                    if (res.swapped) return res;
                }
            }

            return { swapped: false, reason: 'not_found' };
        };

        const res = trySwapInArray(clonedSections);
        if (!res.swapped) {
            if (res.reason === 'boundary') {
                addToast(direction === 'up' ? 'Already at the top of the list.' : 'Already at the bottom of the list.', 'info');
            }
            return;
        }

        // 1. Optimistic UI update (immediate visual feedback, no screen flash)
        setWiki(prev => ({
            ...prev,
            sections: clonedSections
        }));

        // 2. Persist new ordering to the database
        try {
            await wikiApi.reorderSections(wikiId, payloadItems);
            addToast(`Moved "${section.title}" ${direction}.`, 'success');
        } catch (err) {
            console.error('Failed to save section order:', err);
            // Revert on error
            setWiki(previousWiki);
            addToast(err?.response?.data?.message || err?.message || 'Failed to reorder sections in database.', 'error');
        }
    };

    // Re-align all nested descendants directly under parentSection as 1.1, 1.2, 1.3...
    const handleAlignSubsections = async (parentSection) => {
        if (!parentSection || !wikiId) return;

        const descendants = [];
        const collectDescendants = (item) => {
            if (item.subsections && item.subsections.length > 0) {
                for (const sub of item.subsections) {
                    descendants.push(sub);
                    collectDescendants(sub);
                }
            }
        };
        collectDescendants(parentSection);

        if (descendants.length === 0) {
            addToast('No subsections to align.', 'info');
            return;
        }

        setIsLoading(true);
        try {
            for (let i = 0; i < descendants.length; i++) {
                const sec = descendants[i];
                await wikiApi.updateSection(wikiId, sec.sectionId, {
                    title: sec.title,
                    parentSectionId: parentSection.sectionId,
                    sortOrder: (i + 1) * 10,
                    contentHtml: sec.contentHtml,
                    changeSummary: `Aligned as sibling subsection 1.${i + 1}`
                });
            }

            addToast(`Aligned ${descendants.length} subsections as 1.1, 1.2, 1.3...!`, 'success');
            await loadWikiData(true);
            if (descendants[0]?.sectionId) {
                handleSelectSection(descendants[0].sectionId);
            }
        } catch (err) {
            console.error('Error aligning subsections:', err);
            addToast('Failed to align subsections.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && !wiki) {
        return (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-slate-400">Loading Wiki Document...</p>
            </div>
        );
    }

    if (!wiki) return null;

    const isCurrentOverview = activeSectionId === 'overview' || !activeSectionId;
    const canEditCurrent = isCurrentOverview ? wiki.canEdit : currentActiveSection?.canEdit;
    const canManageWiki = wiki.canManageCollaborators || wiki.userPermission === 'Owner';

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-16">
            {/* Top Navigation & Breadcrumbs Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={() => navigate('/wiki')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        All Wikis
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">/</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px] sm:max-w-xs">
                        {wiki.title}
                    </span>
                    {!isCurrentOverview && currentActiveSection && (
                        <>
                            <span className="text-slate-300 dark:text-slate-700">/</span>
                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[150px]">
                                {currentActiveSection.title}
                            </span>
                        </>
                    )}
                </div>

                {/* Top Action Toolbar */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Version History Button */}
                    <button
                        type="button"
                        onClick={() => setIsVersionModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Version History & Restore"
                    >
                        <span className="material-symbols-outlined text-[16px] text-indigo-500">history</span>
                        <span className="hidden sm:inline">Versions</span>
                    </button>

                    {/* Collaborators Button */}
                    <button
                        type="button"
                        onClick={() => setIsCollaboratorsModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Collaborators & Permissions"
                    >
                        <span className="material-symbols-outlined text-[16px] text-indigo-500">group</span>
                        <span className="hidden sm:inline">Collaborators</span>
                        {wiki.collaborators && wiki.collaborators.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                {wiki.collaborators.length}
                            </span>
                        )}
                    </button>

                    {/* Share Button */}
                    <button
                        type="button"
                        onClick={() => setIsShareModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title="Share with Communities, Users, Groups"
                    >
                        <span className="material-symbols-outlined text-[16px] text-cyan-500">share</span>
                        <span className="hidden sm:inline">Share</span>
                    </button>

                    {/* Activity Trail Button */}
                    <button
                        type="button"
                        onClick={() => setIsActivityModalOpen(true)}
                        className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Audit & Activity Trail"
                    >
                        <span className="material-symbols-outlined text-[18px]">history_edu</span>
                    </button>

                    {/* Mobile outline drawer toggle */}
                    <button
                        type="button"
                        onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                        className="md:hidden p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Toggle Outline"
                    >
                        <span className="material-symbols-outlined text-[20px]">menu_open</span>
                    </button>
                </div>
            </div>

            {/* Main Workspace: Left Outline Sidebar + Right Article Reader */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Left Sidebar: Outline Navigation Tree */}
                <div className={`md:col-span-4 lg:col-span-3 space-y-3 ${
                    isMobileSidebarOpen ? 'block' : 'hidden md:block'
                }`}>
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                        {/* Wiki Summary Header Card */}
                        <div className="space-y-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between gap-1">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                    {wiki.status}
                                </span>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300" title="Total Unique Views">
                                        <span className="material-symbols-outlined text-[13px] text-indigo-500">visibility</span>
                                        {wiki.viewCount || 0}
                                    </span>
                                    <span>•</span>
                                    <span>v{wiki.versionsCount || 1}</span>
                                </div>
                            </div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                                {wiki.title}
                            </h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                {wiki.description}
                            </p>
                        </div>

                        {/* Outline Header & Add Section CTA */}
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Document Outline
                            </h3>
                            {wiki.canEdit && (
                                <button
                                    type="button"
                                    onClick={() => setSectionModalState({ isOpen: true, data: null, defaultParentId: null })}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 transition-colors"
                                    title="Add Top-Level Section"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    Section
                                </button>
                            )}
                        </div>

                        {/* Banner: Deep Nesting Detected -> 1-Click Align as 1.1, 1.2 and 1.3 */}
                        {deepLadderSection && wiki.canEdit && (
                            <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/70 dark:to-blue-950/60 border border-indigo-200 dark:border-indigo-800 text-xs flex flex-col gap-2 shadow-xs">
                                <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px] text-indigo-600">low_priority</span>
                                        Deep ladder nesting (1.1.1.1.1)
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                                    Align all sections under <strong>{deepLadderSection.title}</strong> as sibling subsections.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => handleAlignSubsections(deepLadderSection)}
                                    className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                                    title="Click to instantly re-align all subsections as 1.1, 1.2, 1.3..."
                                >
                                    <span className="material-symbols-outlined text-[15px]">format_list_numbered</span>
                                    Align as 1.1, 1.2 and 1.3
                                </button>
                            </div>
                        )}

                        {/* Outline Tree */}
                        <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                            {/* Overview item */}
                            <button
                                type="button"
                                onClick={() => handleSelectSection('overview')}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                                    isCurrentOverview
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <span className="flex items-center gap-2 truncate">
                                    <span className="material-symbols-outlined text-[16px]">home</span>
                                    Overview & Introduction
                                </span>
                            </button>

                            {/* Sections Tree (Recursive N-Tier WIKI-004) */}
                            {(!wiki.sections || wiki.sections.length === 0) && (
                                <div className="p-3 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 my-2">
                                    <p className="text-[11px] text-slate-400 mb-1.5 font-medium">No sections added yet.</p>
                                    {wiki.canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => setSectionModalState({ isOpen: true, data: null, defaultParentId: null })}
                                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">add</span>
                                            Add First Section
                                        </button>
                                    )}
                                </div>
                            )}
                            {wiki.sections && wiki.sections.map((section, idx) => (
                                <OutlineSectionItem
                                    key={section.sectionId}
                                    section={section}
                                    numberPrefix={`${idx + 1}`}
                                    level={0}
                                    activeSectionId={activeSectionId}
                                    onSelect={handleSelectSection}
                                    wiki={wiki}
                                    onMove={handleMoveSection}
                                    isFirst={idx === 0}
                                    isLast={idx === wiki.sections.length - 1}
                                    onAddSub={(sec, e) => {
                                        e.stopPropagation();
                                        setSectionModalState({ isOpen: true, data: null, defaultParentId: sec.sectionId });
                                    }}
                                    onEdit={(sec, e) => {
                                        e.stopPropagation();
                                        setSectionModalState({ isOpen: true, data: sec, defaultParentId: sec.parentSectionId });
                                    }}
                                    onDelete={handleDeleteSection}
                                    onAlignSubsections={handleAlignSubsections}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Area: Main Article / Section Reader */}
                <div className="md:col-span-8 lg:col-span-9 space-y-4">
                    <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                        {/* Attached Cover Banner for Wiki Overview */}
                        {isCurrentOverview && wiki.coverImageUrl && (
                            <div className="relative h-44 sm:h-56 w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 group">
                                <img
                                    src={resolveMediaUrl(wiki.coverImageUrl)}
                                    alt={wiki.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />
                                <div className="absolute bottom-3.5 left-4 right-4 flex items-end justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-md mb-1 inline-block shadow-xs">
                                            Cover Banner
                                        </span>
                                        <h2 className="text-base sm:text-lg font-black text-white line-clamp-1 drop-shadow-md">
                                            {wiki.title}
                                        </h2>
                                    </div>
                                    {wiki.canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditWikiModalOpen(true)}
                                            className="px-2.5 py-1 rounded-xl text-xs font-bold text-white bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/25 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                                            title="Change Attached Cover Banner"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">edit</span>
                                            <span>Cover</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Section Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                                        {isCurrentOverview ? 'Wiki Overview' : 'Section Document'}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                        ~{readingTimeMinutes} min read
                                    </span>
                                </div>

                                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                    {isCurrentOverview ? wiki.title : currentActiveSection?.title}
                                </h1>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
                                    <span>Authored by <strong>{isCurrentOverview ? wiki.createdByUserName : (currentActiveSection?.createdByUserName || wiki.createdByUserName)}</strong></span>
                                    <span>•</span>
                                    <span>Updated {new Date(isCurrentOverview ? wiki.updatedDate : (currentActiveSection?.updatedDate || wiki.updatedDate)).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200" title="Total Unique Views">
                                        <span className="material-symbols-outlined text-[15px] text-indigo-500">visibility</span>
                                        {wiki.viewCount || 0} {wiki.viewCount === 1 ? 'view' : 'views'}
                                    </span>
                                </div>
                            </div>

                            {/* Section Level Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                                {!isCurrentOverview && currentActiveSection && wiki.canEdit && (
                                    <>
                                        {/* Sibling section: Add next section at same level (e.g. 1.2 after 1.1) */}
                                        {currentActiveSection.parentSectionId && (
                                            <button
                                                type="button"
                                                onClick={() => setSectionModalState({ isOpen: true, data: null, defaultParentId: currentActiveSection.parentSectionId })}
                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                                                title="Add next section at the same level (e.g. 1.2 after 1.1)"
                                            >
                                                <span className="material-symbols-outlined text-[16px] text-indigo-600">post_add</span>
                                                <span className="hidden sm:inline">Add Section (1.x)</span>
                                            </button>
                                        )}

                                        {/* Child subsection: Nested under this section (e.g. 1.1.1 under 1.1) */}
                                        <button
                                            type="button"
                                            onClick={() => setSectionModalState({ isOpen: true, data: null, defaultParentId: currentActiveSection.sectionId })}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer"
                                            title="Add a nested child subsection directly under this section"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                            <span className="hidden sm:inline">Add Child Subsection</span>
                                        </button>
                                    </>
                                )}
                                {canEditCurrent && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isCurrentOverview) {
                                                setIsEditWikiModalOpen(true);
                                            } else {
                                                setSectionModalState({ isOpen: true, data: currentActiveSection, defaultParentId: currentActiveSection.parentSectionId });
                                            }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer shadow-xs"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                        {isCurrentOverview ? 'Edit Overview' : 'Edit Section'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Rich Document HTML Content */}
                        <div
                            className="rich-editor-content wiki-content prose dark:prose-invert max-w-none text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-relaxed font-normal custom-scrollbar"
                            style={{ wordBreak: 'break-word' }}
                            dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(isCurrentOverview ? wiki.contentHtml : (currentActiveSection?.contentHtml || '<p>No content provided for this section yet.</p>'))
                            }}
                        />

                        {/* Section Footer & Navigation Links */}
                        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isCurrentOverview) return;
                                    const currIdx = allSectionsFlat.findIndex(s => s.sectionId === activeSectionId);
                                    if (currIdx <= 0) {
                                        handleSelectSection('overview');
                                    } else {
                                        handleSelectSection(allSectionsFlat[currIdx - 1].sectionId);
                                    }
                                }}
                                disabled={isCurrentOverview}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                Previous Section
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (isCurrentOverview) {
                                        if (allSectionsFlat.length > 0) handleSelectSection(allSectionsFlat[0].sectionId);
                                    } else {
                                        const currIdx = allSectionsFlat.findIndex(s => s.sectionId === activeSectionId);
                                        if (currIdx >= 0 && currIdx < allSectionsFlat.length - 1) {
                                            handleSelectSection(allSectionsFlat[currIdx + 1].sectionId);
                                        }
                                    }
                                }}
                                disabled={!isCurrentOverview && allSectionsFlat.findIndex(s => s.sectionId === activeSectionId) === allSectionsFlat.length - 1}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                                Next Section
                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <CreateWikiModal
                isOpen={isEditWikiModalOpen}
                onClose={() => setIsEditWikiModalOpen(false)}
                initialData={wiki}
                onSaved={() => loadWikiData(true)}
            />

            <WikiSectionModal
                isOpen={sectionModalState.isOpen}
                onClose={() => setSectionModalState({ isOpen: false, data: null, defaultParentId: null })}
                wikiId={wiki?.wikiId || wiki?.id || wikiId}
                availableSections={allSectionsFlat}
                initialData={sectionModalState.data}
                defaultParentId={sectionModalState.defaultParentId}
                onSaved={handleSectionSaved}
            />

            <WikiCollaboratorsModal
                isOpen={isCollaboratorsModalOpen}
                onClose={() => setIsCollaboratorsModalOpen(false)}
                wikiId={wikiId}
                sections={allSectionsFlat}
                canManage={canManageWiki}
                onCollaboratorsUpdated={() => loadWikiData(true)}
            />

            <WikiShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                wikiId={wikiId}
                wikiTitle={wiki.title}
                canShare={wiki.canEdit ?? true}
                onSharesUpdated={() => loadWikiData(true)}
            />

            <WikiVersionHistoryModal
                isOpen={isVersionModalOpen}
                onClose={() => setIsVersionModalOpen(false)}
                wikiId={wikiId}
                sectionId={isCurrentOverview ? null : currentActiveSection?.sectionId}
                targetName={isCurrentOverview ? 'Wiki Overview' : currentActiveSection?.title}
                canRestore={canEditCurrent}
                onVersionRestored={() => loadWikiData(true)}
            />

            <WikiActivityModal
                isOpen={isActivityModalOpen}
                onClose={() => setIsActivityModalOpen(false)}
                wikiId={wikiId}
                wikiTitle={wiki.title}
            />
        </div>
    );
}
