import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { profileApi, resolveMediaUrl } from '../../utils/apiService';
import { useToast } from '../contexts/ToastContext';
import { useUser } from '../contexts/UserContext';
import { useConfirm } from '../contexts/ConfirmDialogContext';

export default function WikiCollaboratorsModal({
    isOpen,
    onClose,
    wikiId,
    sections = [],
    canManage = false,
    onCollaboratorsUpdated
}) {
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();

    const [collaborators, setCollaborators] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // New Collaborator Form
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedRole, setSelectedRole] = useState('Editor');
    const [selectedSectionId, setSelectedSectionId] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const normalizeUser = (u) => ({
        userId: u.userId || u.id,
        fullName: u.fullName || u.title || u.authorFullName || u.name || 'Unknown User',
        employeeId: u.employeeId || u.authorEmployeeId || '',
        designation: u.designation || u.department || u.departmentName || u.summary || 'Employee',
        profilePhotoUrl: u.profilePhotoUrl || u.authorProfilePhotoUrl || u.thumbnailUrl || ''
    });

    const loadCollaborators = async () => {
        setIsLoading(true);
        try {
            const list = await wikiApi.getCollaborators(wikiId);
            setCollaborators(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Error fetching collaborators:', err);
            addToast('Could not load collaborators.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && wikiId) {
            loadCollaborators();
            setSelectedUser(null);
            setSearchQuery('');
            setSearchResults([]);
            setIsSearching(false);
        }
    }, [isOpen, wikiId]);

    // Live search users
    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 1 || selectedUser) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await profileApi.searchUsers(query, 1, 15);
                const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                setSearchResults(items.map(normalizeUser));
            } catch (err) {
                console.error('Error searching users:', err);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [searchQuery, selectedUser]);

    const handleAddCollaborator = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        let userToAdd = selectedUser;

        // Auto-resolve user if typed into the box without explicitly clicking dropdown
        if (!userToAdd && searchQuery.trim()) {
            setIsAdding(true);
            try {
                const res = await profileApi.searchUsers(searchQuery.trim(), 1, 10);
                const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
                if (items.length > 0) {
                    const qLower = searchQuery.trim().toLowerCase();
                    const exact = items.find(u => 
                        (u.fullName || u.title || u.authorFullName || '').toLowerCase() === qLower ||
                        (u.employeeId || u.authorEmployeeId || '').toLowerCase() === qLower
                    );
                    userToAdd = normalizeUser(exact || items[0]);
                    setSelectedUser(userToAdd);
                }
            } catch (err) {
                console.error('Auto lookup error:', err);
            } finally {
                setIsAdding(false);
            }
        }

        if (!userToAdd) {
            addToast('Please type a name and select a colleague from the list.', 'error');
            return;
        }

        const targetUserId = parseInt(userToAdd.userId, 10);
        if (!targetUserId || isNaN(targetUserId)) {
            addToast('Could not find a valid user ID for this person.', 'error');
            return;
        }

        setIsAdding(true);
        try {
            const payload = {
                userId: targetUserId,
                sectionId: selectedSectionId ? parseInt(selectedSectionId, 10) : null,
                role: selectedRole
            };

            await wikiApi.addCollaborator(wikiId, payload);
            addToast(`Added ${userToAdd.fullName} as ${selectedRole}!`, 'success');
            setSelectedUser(null);
            setSearchQuery('');
            setSearchResults([]);
            await loadCollaborators();
            onCollaboratorsUpdated && onCollaboratorsUpdated();
        } catch (err) {
            console.error('Error adding collaborator:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to add collaborator.', 'error');
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemove = async (collabId, userName) => {
        const ok = await confirm({
            title: 'Remove Collaborator',
            message: `Are you sure you want to remove ${userName} from collaborators?`,
            confirmText: 'Remove Collaborator',
            confirmButtonClass: 'bg-red-600 hover:bg-red-700 text-white'
        });
        if (!ok) return;

        try {
            await wikiApi.removeCollaborator(wikiId, collabId);
            addToast('Collaborator removed.', 'success');
            await loadCollaborators();
            onCollaboratorsUpdated && onCollaboratorsUpdated();
        } catch (err) {
            console.error('Error removing collaborator:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to remove collaborator.', 'error');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Wiki & Section Collaborators"
            maxWidth="max-w-2xl"
        >
            <div className="space-y-6">
                {/* Add Collaborator Form (Only visible to Owners/Admins) */}
                {canManage && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Add Collaborator
                        </h3>

                        {/* User search or selected user card */}
                        {selectedUser ? (
                            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-teal-500/50 bg-teal-50/80 dark:bg-teal-950/40 transition-all">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <img
                                        src={resolveMediaUrl(selectedUser.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser.fullName)}&background=0d9488&color=fff`}
                                        alt=""
                                        className="w-7 h-7 rounded-full object-cover shrink-0 border border-teal-200 dark:border-teal-800"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{selectedUser.fullName}</p>
                                        <p className="text-[11px] text-teal-700 dark:text-teal-300 truncate">
                                            {selectedUser.employeeId ? `${selectedUser.employeeId} • ` : ''}{selectedUser.designation}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setSearchQuery('');
                                        setSearchResults([]);
                                    }}
                                    className="px-2 py-1 text-xs text-slate-500 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-slate-200 dark:border-slate-700"
                                    title="Change selected user"
                                >
                                    <span className="material-symbols-outlined text-[15px]">close</span>
                                    <span className="text-[11px] font-semibold">Change</span>
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddCollaborator();
                                        }
                                    }}
                                    placeholder="Search colleague by name or employee code..."
                                    className="w-full pl-3.5 pr-8 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 shadow-xs"
                                />

                                {isSearching ? (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-3.5 h-3.5 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                                    </div>
                                ) : searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                ) : null}

                                {/* Dropdown search results */}
                                {searchResults.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 py-1 divide-y divide-slate-100 dark:divide-slate-800/60 custom-scrollbar">
                                        {searchResults.map(u => (
                                            <button
                                                key={u.userId}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedUser(u);
                                                    setSearchQuery('');
                                                    setSearchResults([]);
                                                }}
                                                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors text-left cursor-pointer"
                                            >
                                                <img
                                                    src={resolveMediaUrl(u.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=0d9488&color=fff`}
                                                    alt=""
                                                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{u.fullName}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                        {u.employeeId ? `${u.employeeId} • ` : ''}{u.designation}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-900/30">
                                                    Select
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1.5 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-50 text-center">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No colleagues found matching "{searchQuery}".</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Scope & Role Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    Collaborator Scope
                                </label>
                                <select
                                    value={selectedSectionId}
                                    onChange={(e) => setSelectedSectionId(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                                >
                                    <option value="">Full Wiki (Global)</option>
                                    {sections.map(s => (
                                        <option key={s.sectionId} value={s.sectionId}>
                                            Section: {s.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    Access Permission
                                </label>
                                <select
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                                >
                                    <option value="Editor">✏️ Editor (Can Edit Content)</option>
                                    <option value="Viewer">👁️ Viewer (Read Only)</option>
                                    <option value="Owner">👑 Co-Owner (Full Admin)</option>
                                </select>
                            </div>

                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={handleAddCollaborator}
                                    disabled={(!selectedUser && !searchQuery.trim()) || isAdding}
                                    className="w-full py-2 px-3 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-teal-600/20"
                                >
                                    {isAdding ? (
                                        <>
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>Adding...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                                            <span>Add Collaborator</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Collaborators List */}
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-3">
                        Active Collaborators ({collaborators.length})
                    </h3>

                    {isLoading ? (
                        <div className="py-8 flex justify-center">
                            <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-600 rounded-full animate-spin" />
                        </div>
                    ) : collaborators.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic py-4 text-center">
                            No additional collaborators added yet.
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {collaborators.map(c => {
                                const roleColors = {
                                    Owner: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60',
                                    Editor: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200/80 dark:border-teal-800/60',
                                    Viewer: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                };

                                return (
                                    <div
                                        key={c.collaboratorId}
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <img
                                                src={resolveMediaUrl(c.avatarUrl) || 'https://ui-avatars.com/api/?name=User'}
                                                alt=""
                                                className="w-8 h-8 rounded-full object-cover shrink-0"
                                            />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{c.userName}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleColors[c.role] || roleColors.Viewer}`}>
                                                        {c.role}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                    {c.sectionTitle ? `Section: ${c.sectionTitle}` : 'Wiki-Level'} • Added by {c.addedByUserName || 'Creator'}
                                                </p>
                                            </div>
                                        </div>

                                        {canManage && c.role !== 'Owner' && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemove(c.collaboratorId, c.userName)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                                title="Remove collaborator"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">person_remove</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </Modal>
    );
}
