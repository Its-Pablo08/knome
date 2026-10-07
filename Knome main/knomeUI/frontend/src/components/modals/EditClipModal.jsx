import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { clipsApi, communitiesApi } from '../../utils/apiService';

export default function EditClipModal({ isOpen, onClose, clip, onClipUpdated }) {
    const { addToast } = useToast();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [hashtags, setHashtags] = useState('');
    const [visibility, setVisibility] = useState('Public');
    const [communityId, setCommunityId] = useState('');
    const [status, setStatus] = useState('Published');
    const [communities, setCommunities] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && clip) {
            setTitle(clip.title || '');
            setDescription(clip.description || '');
            setHashtags(clip.hashtags || '');
            setVisibility(clip.visibility || 'Public');
            setCommunityId(clip.communityId ? String(clip.communityId) : '');
            setStatus(clip.status || 'Published');

            communitiesApi.getAll().then(res => {
                const list = Array.isArray(res) ? res : (res?.data || []);
                setCommunities(list);
            }).catch(() => {});
        }
    }, [isOpen, clip]);

    if (!isOpen || !clip) return null;

    const handleSave = async (e) => {
        e?.preventDefault();
        if (!title.trim()) {
            addToast('Clip title/caption is required.', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const updated = await clipsApi.update(clip.clipId, {
                title: title.trim(),
                description: description.trim() || null,
                hashtags: hashtags.trim() || null,
                visibility,
                communityId: visibility === 'Community' && communityId ? Number(communityId) : null,
                status
            });

            addToast('Clip updated successfully!', 'success');
            if (onClipUpdated) onClipUpdated(updated);
            onClose();
        } catch (err) {
            console.error('Failed to update clip:', err);
            addToast('Failed to update clip.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl">edit</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">Edit Clip</h3>
                            <p className="text-xs text-slate-500">Update caption, tags, and audience visibility</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                            Caption / Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                            Description
                        </label>
                        <textarea
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                            Hashtags
                        </label>
                        <input
                            type="text"
                            value={hashtags}
                            onChange={(e) => setHashtags(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                Visibility
                            </label>
                            <select
                                value={visibility}
                                onChange={(e) => setVisibility(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
                            >
                                <option value="Public">Everyone (Public)</option>
                                <option value="Community">Community Space</option>
                                <option value="Specific">Specific Colleagues</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                Status
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
                            >
                                <option value="Published">Published</option>
                                <option value="Draft">Draft</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    {visibility === 'Community' && (
                        <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Target Community:</label>
                            <select
                                value={communityId}
                                onChange={(e) => setCommunityId(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
                            >
                                <option value="">-- Choose Community --</option>
                                {communities.map(c => (
                                    <option key={c.communityId || c.id} value={c.communityId || c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-xs font-bold shadow-lg shadow-pink-500/25 transition disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}
