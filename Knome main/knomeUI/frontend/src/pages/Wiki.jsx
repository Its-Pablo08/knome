import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { wikiApi } from '../utils/wikiService';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { resolveMediaUrl } from '../utils/apiService';
import HighlightText from '../components/ui/HighlightText';
import CreateWikiModal from '../components/modals/CreateWikiModal';
import WikiShareModal from '../components/modals/WikiShareModal';

export default function Wiki() {
    const { currentUser } = useUser();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const [searchParams, setSearchParams] = useSearchParams();

    // Query param sync
    const directWikiId = searchParams.get('id');
    const activeTabFromUrl = searchParams.get('tab') || 'all';
    const tagFromUrl = searchParams.get('tag') || '';
    const searchFromUrl = searchParams.get('q') || '';

    useEffect(() => {
        if (directWikiId) {
            navigate(`/wiki/view?id=${directWikiId}`, { replace: true });
        }
    }, [directWikiId, navigate]);

    const [activeTab, setActiveTab] = useState(activeTabFromUrl); // 'all', 'my', 'shared', 'recent'
    const [searchQuery, setSearchQuery] = useState(searchFromUrl);
    const [selectedTag, setSelectedTag] = useState(tagFromUrl);
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

    const [wikis, setWikis] = useState([]);
    const [popularTags, setPopularTags] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize] = useState(24);
    const [isLoading, setIsLoading] = useState(true);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingWiki, setEditingWiki] = useState(null);
    const [sharingWiki, setSharingWiki] = useState(null);

    // Sync URL when tab/tag/search changes
    useEffect(() => {
        const params = new URLSearchParams();
        if (activeTab !== 'all') params.set('tab', activeTab);
        if (selectedTag) params.set('tag', selectedTag);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        setSearchParams(params, { replace: true });
    }, [activeTab, selectedTag, searchQuery]);

    const loadWikis = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'recent') {
                const list = await wikiApi.getRecentlyUpdatedWikis(18);
                const items = Array.isArray(list) ? list : (list?.data || []);
                setWikis(items);
                setTotalCount(items.length);
            } else {
                const res = await wikiApi.getWikis({
                    tab: activeTab,
                    search: searchQuery.trim(),
                    tag: selectedTag,
                    status: selectedStatus,
                    pageNumber,
                    pageSize
                });

                const items = res?.items || res?.data || (Array.isArray(res) ? res : []);
                setWikis(Array.isArray(items) ? items : []);
                setTotalCount(res?.totalCount || (Array.isArray(items) ? items.length : 0));
            }
        } catch (err) {
            console.error('Failed to load wikis:', err);
            addToast('Could not load Wiki list.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const loadPopularTags = async () => {
        try {
            const tags = await wikiApi.getPopularTags(10);
            const list = Array.isArray(tags) ? tags : [];
            setPopularTags(list.slice(0, 10));
        } catch {}
    };

    useEffect(() => {
        setPageNumber(1);
    }, [activeTab, searchQuery, selectedTag, selectedStatus]);

    useEffect(() => {
        loadWikis();
    }, [activeTab, searchQuery, selectedTag, selectedStatus, pageNumber]);

    useEffect(() => {
        loadPopularTags();
    }, []);

    const handleDeleteWiki = async (wiki, e) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'Delete Wiki',
            message: `Are you sure you want to delete "${wiki.title}"? This will archive and remove it from active discovery.`,
            confirmText: 'Delete Wiki',
            confirmButtonClass: 'bg-red-600 hover:bg-red-700 text-white'
        });
        if (!ok) return;

        try {
            await wikiApi.deleteWiki(wiki.wikiId);
            addToast('Wiki deleted successfully.', 'success');
            loadWikis();
        } catch (err) {
            console.error('Error deleting wiki:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to delete Wiki.', 'error');
        }
    };

    const handleToggleArchive = async (wiki, e) => {
        e.stopPropagation();
        const willArchive = !wiki.isArchived;
        try {
            await wikiApi.toggleArchiveWiki(wiki.wikiId, willArchive);
            addToast(willArchive ? 'Wiki archived.' : 'Wiki restored from archive.', 'success');
            loadWikis();
        } catch (err) {
            addToast('Failed to change archive status.', 'error');
        }
    };

    const handleOpenEdit = (wiki, e) => {
        e.stopPropagation();
        setEditingWiki(wiki);
        setIsCreateModalOpen(true);
    };

    const handleOpenShare = (wiki, e) => {
        e.stopPropagation();
        setSharingWiki(wiki);
    };

    const handleCardClick = (wikiId) => {
        navigate(`/wiki/view?id=${wikiId}`);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
            {/* Header Hero Banner */}
            <div className="relative rounded-2xl overflow-hidden mb-6 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                {/* Background effects */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-indigo-100/70 dark:from-indigo-950/40 via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-indigo-500/15 dark:bg-indigo-500/20 blur-[80px] pointer-events-none" />

                {/* Light Streaks behind text */}
                <div className="absolute top-[35%] left-0 w-[60%] h-[1px] bg-gradient-to-r from-indigo-400/40 dark:from-indigo-400/20 to-transparent" />
                <div className="absolute top-[50%] left-0 w-[40%] h-[2px] bg-gradient-to-r from-violet-400/40 dark:from-violet-400/20 to-transparent blur-[1px]" />
                <div className="absolute top-[65%] left-0 w-[50%] h-[1px] bg-gradient-to-r from-purple-400/40 dark:from-purple-400/20 to-transparent" />

                {/* Content Left */}
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[15px]">menu_book</span>
                        Institutional Knowledge & Living Playbooks
                    </div>

                    <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400">
                            Enterprise Wiki Library
                        </span>
                    </h1>

                    <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                        Centralized documentation, architecture blueprints, standard operating procedures, and team knowledge bases with multi-level section collaboration and version control.
                    </p>
                </div>

                {/* Action Right */}
                <div className="relative z-10 shrink-0 flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                    <button
                        type="button"
                        onClick={() => {
                            setEditingWiki(null);
                            setIsCreateModalOpen(true);
                        }}
                        className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        Create Wiki
                    </button>
                </div>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 shadow-xs">
                {/* Search box */}
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                        search
                    </span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPageNumber(1);
                        }}
                        placeholder="Search Wikis by title, overview text, or tags..."
                        className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    )}
                </div>

                {/* Status Selector & Toolbar View Switcher */}
                <div className="flex items-center gap-2 shrink-0">
                    <select
                        value={selectedStatus}
                        onChange={(e) => {
                            setSelectedStatus(e.target.value);
                            setPageNumber(1);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                        <option value="All">All Statuses</option>
                        <option value="Published">Published Only</option>
                        <option value="Draft">Drafts Only</option>
                        <option value="Archived">Archived</option>
                    </select>

                    {selectedTag && (
                        <button
                            type="button"
                            onClick={() => setSelectedTag('')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                        >
                            <span>#{selectedTag}</span>
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    )}

                    {/* Navigation Filter Pills (Uniform Boxed Pills Shifted Below Search Bar) */}
                </div>
            </div>

            {/* Navigation Filter Pills (Uniform Boxed Pills Shifted Below Search Bar) */}
            <div className="flex flex-wrap items-center gap-2 w-full mb-2 overflow-x-auto no-scrollbar">
                {[
                    { id: 'all', label: 'All Wikis', icon: 'public' },
                    { id: 'my', label: 'My Wikis', icon: 'person' },
                    { id: 'shared', label: 'Shared With Me', icon: 'group' },
                    { id: 'recent', label: 'Recently Updated', icon: 'history' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                            setActiveTab(tab.id);
                            setPageNumber(1);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold transition-all border shrink-0 cursor-pointer whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-400 shadow-xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Wiki Grid / List */}
            {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-xs font-semibold text-slate-400">Loading Wikis...</p>
                </div>
            ) : wikis.length === 0 ? (
                <div className="py-20 text-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-850 p-8 space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200/60 dark:border-indigo-800/60">
                        <span className="material-symbols-outlined text-3xl">menu_book</span>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No Wikis Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                            {searchQuery || selectedTag
                                ? 'No documents matched your active filters or search terms. Try clearing filters.'
                                : 'Start building your organizational documentation by creating your first Wiki!'}
                        </p>
                    </div>
                    <div>
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedTag('');
                                setSelectedStatus('All');
                                if (!searchQuery && !selectedTag) {
                                    setIsCreateModalOpen(true);
                                }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                {searchQuery || selectedTag ? 'filter_alt_off' : 'add'}
                            </span>
                            {searchQuery || selectedTag ? 'Clear All Filters' : 'Create First Wiki'}
                        </button>
                    </div>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {wikis.map(wiki => {
                        const statusColors = {
                            Published: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                            Draft: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                            Archived: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        };

                        const permBadges = {
                            Owner: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200',
                            Editor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200',
                            Viewer: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200'
                        };

                        return (
                            <div
                                key={wiki.wikiId}
                                onClick={() => handleCardClick(wiki.wikiId)}
                                className="group flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 overflow-hidden hover:shadow-xl hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all duration-200 cursor-pointer"
                            >
                                {/* Cover Banner */}
                                <div className="relative h-32 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                                    <img
                                        src={resolveMediaUrl(wiki.coverImageUrl) || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'}
                                        alt=""
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />

                                    {/* Top Badges */}
                                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${statusColors[wiki.status] || statusColors.Published}`}>
                                            {wiki.status}
                                        </span>

                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${permBadges[wiki.userPermission] || permBadges.Viewer}`}>
                                            {wiki.userPermission}
                                        </span>
                                    </div>

                                    {/* Bottom Title on Image */}
                                    <div className="absolute bottom-2 left-3 right-3">
                                        <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-indigo-300 transition-colors">
                                            <HighlightText text={wiki.title} highlight={searchQuery} />
                                        </h3>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                    {/* Description */}
                                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                        <HighlightText text={wiki.description || 'Comprehensive organizational documentation and living playbook.'} highlight={searchQuery} />
                                    </p>

                                    {/* Tags */}
                                    {wiki.tags && wiki.tags.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1">
                                            {wiki.tags.slice(0, 3).map((t, idx) => (
                                                <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                    #{t}
                                                </span>
                                            ))}
                                            {wiki.tags.length > 3 && (
                                                <span className="text-[10px] text-slate-400">
                                                    +{wiki.tags.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Metrics & Meta */}
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1" title="Sections">
                                                <span className="material-symbols-outlined text-[14px] text-indigo-500">format_list_bulleted</span>
                                                {wiki.sectionsCount || 0}
                                            </span>
                                            <span className="flex items-center gap-1" title="Collaborators">
                                                <span className="material-symbols-outlined text-[14px] text-indigo-500">group</span>
                                                {wiki.collaboratorsCount || 0}
                                            </span>
                                            <span className="flex items-center gap-1" title="Views">
                                                <span className="material-symbols-outlined text-[14px] text-slate-400">visibility</span>
                                                {wiki.viewCount || 0}
                                            </span>
                                        </div>

                                        <div className="text-[10px] text-slate-400">
                                            {new Date(wiki.updatedDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>

                                    {/* Author & Action buttons */}
                                    <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <img
                                                src={resolveMediaUrl(wiki.createdByUserAvatar) || 'https://ui-avatars.com/api/?name=User'}
                                                alt=""
                                                className="w-5 h-5 rounded-full object-cover shrink-0"
                                            />
                                            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                                                {wiki.createdByUserName}
                                            </span>
                                        </div>

                                        {/* Action icons */}
                                        <div className="flex items-center gap-1">
                                            {wiki.canEdit && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleOpenEdit(wiki, e)}
                                                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    title="Edit Overview"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">edit</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={(e) => handleOpenShare(wiki, e)}
                                                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                title="Share Wiki"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">share</span>
                                            </button>

                                            {wiki.canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteWiki(wiki, e)}
                                                    className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                                    title="Delete Wiki"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Directory List View */
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 overflow-hidden shadow-xs">
                    {/* Directory Header Bar */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <div className="md:col-span-5">Document Title & Overview</div>
                        <div className="md:col-span-3">Status & Permissions</div>
                        <div className="md:col-span-2">Metrics & Activity</div>
                        <div className="md:col-span-2 text-right">Actions</div>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {wikis.map(wiki => {
                            const statusColors = {
                                Published: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                                Draft: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                                Archived: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            };

                            const permBadges = {
                                Owner: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200',
                                Editor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200',
                                Viewer: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200'
                            };

                            return (
                                <div
                                    key={wiki.wikiId}
                                    onClick={() => handleCardClick(wiki.wikiId)}
                                    className="p-4 sm:px-5 flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 items-start md:items-center hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                                >
                                    {/* Column 1: Thumbnail & Title & Description */}
                                    <div className="md:col-span-5 flex items-center gap-3.5 min-w-0 w-full">
                                        <div className="w-12 h-10 sm:w-14 sm:h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 group-hover:scale-105 transition-transform duration-300">
                                            {wiki.coverImageUrl ? (
                                                <img
                                                    src={resolveMediaUrl(wiki.coverImageUrl)}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                                    <span className="material-symbols-outlined text-[20px]">menu_book</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                <HighlightText text={wiki.title} highlight={searchQuery} />
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                {wiki.description || 'Enterprise documentation and living playbook.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Column 2: Status & Permissions & Tags */}
                                    <div className="md:col-span-3 flex flex-wrap items-center gap-1.5 w-full">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[wiki.status] || statusColors.Published}`}>
                                            {wiki.status}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${permBadges[wiki.userPermission] || permBadges.Viewer}`}>
                                            {wiki.userPermission}
                                        </span>
                                        {wiki.tags && wiki.tags.slice(0, 2).map((t, idx) => (
                                            <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                #{t}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Column 3: Metrics & Activity */}
                                    <div className="md:col-span-2 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 w-full">
                                        <span className="flex items-center gap-1" title="Sections">
                                            <span className="material-symbols-outlined text-[15px] text-indigo-500">format_list_bulleted</span>
                                            {wiki.sectionsCount || 0}
                                        </span>
                                        <span className="flex items-center gap-1" title="Collaborators">
                                            <span className="material-symbols-outlined text-[15px] text-indigo-500">group</span>
                                            {wiki.collaboratorsCount || 0}
                                        </span>
                                        <span className="text-[11px] text-slate-400 ml-auto md:ml-0">
                                            {new Date(wiki.updatedDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>

                                    {/* Column 4: Author & Action Buttons */}
                                    <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2 w-full pt-1 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 min-w-0 md:hidden">
                                            <img
                                                src={resolveMediaUrl(wiki.createdByUserAvatar) || 'https://ui-avatars.com/api/?name=User'}
                                                alt=""
                                                className="w-5 h-5 rounded-full object-cover shrink-0"
                                            />
                                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate">
                                                {wiki.createdByUserName}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                                            {wiki.canEdit && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleOpenEdit(wiki, e)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    title="Edit Overview"
                                                >
                                                    <span className="material-symbols-outlined text-[17px]">edit</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => handleOpenShare(wiki, e)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                title="Share"
                                            >
                                                <span className="material-symbols-outlined text-[17px]">share</span>
                                            </button>
                                            {wiki.canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteWiki(wiki, e)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                                    title="Delete Wiki"
                                                >
                                                    <span className="material-symbols-outlined text-[17px]">delete</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Pagination Controls (WIKI-011) */}
            {activeTab !== 'recent' && totalCount > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 px-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(pageNumber - 1) * pageSize + 1}</span> to{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(pageNumber * pageSize, totalCount)}</span> of{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{totalCount}</span> Wikis
                    </p>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={pageNumber <= 1}
                            onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                            Previous
                        </button>

                        {Array.from({ length: Math.ceil(totalCount / pageSize) }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === Math.ceil(totalCount / pageSize) || Math.abs(p - pageNumber) <= 1)
                            .map((p, idx, arr) => {
                                const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                                return (
                                    <React.Fragment key={p}>
                                        {showEllipsis && <span className="px-1 text-xs text-slate-400">...</span>}
                                        <button
                                            type="button"
                                            onClick={() => setPageNumber(p)}
                                            className={`w-7 h-7 text-xs font-semibold rounded-lg flex items-center justify-center transition-colors ${
                                                pageNumber === p
                                                    ? 'bg-indigo-600 text-white shadow-xs'
                                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    </React.Fragment>
                                );
                            })}

                        <button
                            type="button"
                            disabled={pageNumber >= Math.ceil(totalCount / pageSize)}
                            onClick={() => setPageNumber(prev => Math.min(Math.ceil(totalCount / pageSize), prev + 1))}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            <CreateWikiModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    setEditingWiki(null);
                }}
                initialData={editingWiki}
                onSaved={() => loadWikis()}
            />

            {sharingWiki && (
                <WikiShareModal
                    isOpen={Boolean(sharingWiki)}
                    onClose={() => setSharingWiki(null)}
                    wikiId={sharingWiki.wikiId}
                    wikiTitle={sharingWiki.title}
                    canShare={sharingWiki.canEdit ?? true}
                    onSharesUpdated={() => loadWikis()}
                />
            )}
        </div>
    );
}
