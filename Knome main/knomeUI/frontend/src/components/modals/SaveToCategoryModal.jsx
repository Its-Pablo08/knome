import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { savedContentApi, resolveMediaUrl } from '../../utils/apiService';
import { getDefaultThumbnail } from '../../pages/SavedContent';

// AI & Keyword Analysis Engine for Category Suggestion
export const analyzeContentCategory = (text = '', title = '', tags = []) => {
    const combined = `${title || ''} ${text || ''} ${Array.isArray(tags) ? tags.join(' ') : ''}`.toLowerCase();

    if (/docker|kubernetes|k8s|devops|microservice|ci\/cd|pipeline|aws|cloud|server|deploy|code|react|frontend|sql|c#|\.net|backend|technical|script|database|design|ui|ux|figma|css|palette|mockup|architecture|prototype|layout|theme|graphic/i.test(combined)) {
        return {
            id: 'work',
            category: 'Work & Tech',
            icon: 'computer',
            badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
            confidence: '98%',
            reason: 'Matched Work, Code, DevOps & Technical Engineering'
        };
    }
    if (/hr|policy|gavel|leave|announcement|culture|mponline|employee|onboarding|hiring|workplace|perks|guidelines/i.test(combined)) {
        return {
            id: 'hr',
            category: 'HR & Policies',
            icon: 'gavel',
            badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700',
            confidence: '95%',
            reason: 'Matched HR Guidelines, Policy & Organization'
        };
    }
    if (/favorite|star|important|must read|top|key/i.test(combined)) {
        return {
            id: 'favorites',
            category: 'Favorites',
            icon: 'star',
            badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
            confidence: '92%',
            reason: 'Matched Starred & Favorite Reference Items'
        };
    }

    return {
        id: 'readlater',
        category: 'Read Later',
        icon: 'schedule',
        badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        confidence: '88%',
        reason: 'Matched Read Later & Bookmarks'
    };
};

export const PREDEFINED_CATEGORIES = [
    { id: 'work', name: 'Work & Tech', icon: 'computer', desc: 'Code, DevOps, Technical Guides & Microservices' },
    { id: 'hr', name: 'HR & Policies', icon: 'gavel', desc: 'Company Policies, Employee Guidelines & HR Updates' },
    { id: 'favorites', name: 'Favorites', icon: 'star', desc: 'Starred Posts, Must-Read Specs & Favorite Items' },
    { id: 'readlater', name: 'Read Later', icon: 'schedule', desc: 'Articles, Podcasts & Bookmarks saved for later' }
];

const extractString = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(extractString).filter(Boolean).join(' ');
    if (typeof val === 'object') return val.text || val.content || val.description || val.title || val.subtitle || '';
    return String(val);
};

export default function SaveToCategoryModal({ isOpen, onClose, item, onSaved }) {
    const safeItem = item || {};
    const contentText = extractString(safeItem.content || safeItem.text || safeItem.description || safeItem.subtitle || '');
    const contentTitle = extractString(safeItem.title || safeItem.name || '');
    const contentTags = safeItem.tags || [];
    const contentImage = safeItem.image || 
                         safeItem.thumbnail || 
                         safeItem.thumbnailUrl || 
                         safeItem.coverImage || 
                         safeItem.mediaUrl || 
                         (Array.isArray(safeItem.mediaUrls) ? safeItem.mediaUrls[0] : null) || 
                         (Array.isArray(safeItem.attachmentUrls) ? safeItem.attachmentUrls[0] : null) || 
                         null;

    const aiAnalysis = analyzeContentCategory(contentText, contentTitle, contentTags);

    const availableCategories = PREDEFINED_CATEGORIES;
    const [selectedCategory, setSelectedCategory] = useState(aiAnalysis.category);
    const [isSaving, setIsSaving] = useState(false);
    const backdropRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !item) return;
        const analysis = analyzeContentCategory(contentText, contentTitle, contentTags);
        setSelectedCategory(analysis.category);

        // Remove custom folders (e.g. ghgffd) from localStorage
        try {
            const stored = JSON.parse(localStorage.getItem('knome_saved_categories') || '[]');
            const valid = stored.filter(c => ['work', 'hr', 'favorites', 'readlater', 'all'].includes(c.id));
            localStorage.setItem('knome_saved_categories', JSON.stringify(valid));

            const map = JSON.parse(localStorage.getItem('knome_item_category_map') || '{}');
            let mapChanged = false;
            Object.keys(map).forEach(k => {
                if (!['work', 'hr', 'favorites', 'readlater', 'all'].includes(map[k])) {
                    map[k] = 'work';
                    mapChanged = true;
                }
            });
            if (mapChanged) {
                localStorage.setItem('knome_item_category_map', JSON.stringify(map));
            }
        } catch (e) {}
    }, [item, isOpen]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    const handleConfirmSave = async () => {
        if (!item) return;
        setIsSaving(true);
        const finalCategory = selectedCategory;

        const matchedCatObj = PREDEFINED_CATEGORIES.find(c => c.name === finalCategory);
        const categoryId = matchedCatObj ? matchedCatObj.id : 'work';

        const savedItem = {
            id: item.id || `saved_${Date.now()}`,
            contentId: item.id,
            contentType: item.contentType || 'Post',
            title: contentTitle || (contentText ? contentText.slice(0, 60) + '...' : 'Saved Content'),
            content: contentText,
            image: contentImage,
            thumbnailUrl: contentImage,
            author: extractString(item.author?.name || item.author || 'Employee'),
            category: finalCategory,
            categoryId: categoryId,
            savedAt: new Date().toISOString(),
            tags: contentTags
        };

        try {
            // Backend API Bookmark Sync
            try {
                if (savedItem.contentType && savedItem.contentId) {
                    await savedContentApi.toggleBookmark(savedItem.contentType, savedItem.contentId);
                }
            } catch (apiErr) {
                console.warn('Backend bookmark toggle skipped (saving locally):', apiErr?.message);
            }

            // Save into localStorage
            const existingSaved = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const updatedList = [savedItem, ...existingSaved.filter(i => String(i.id) !== String(savedItem.id))];
            localStorage.setItem('knome_saved_items_custom', JSON.stringify(updatedList));

            // Map item to category ID for SavedContent filters
            const existingMap = JSON.parse(localStorage.getItem('knome_item_category_map') || '{}');
            existingMap[`${savedItem.contentType}_${savedItem.id}`] = categoryId;
            existingMap[`${savedItem.contentType}_${savedItem.contentId}`] = categoryId;
            existingMap[`Article_${savedItem.id}`] = categoryId;
            existingMap[`Video_${savedItem.id}`] = categoryId;
            existingMap[`Post_${savedItem.id}`] = categoryId;
            existingMap[savedItem.id] = categoryId;
            localStorage.setItem('knome_item_category_map', JSON.stringify(existingMap));

            // Track bookmarked IDs for persistence
            const bookmarkedIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
            if (!bookmarkedIds.includes(String(savedItem.id))) {
                localStorage.setItem('knome_bookmarked_ids', JSON.stringify([...bookmarkedIds, String(savedItem.id)]));
            }

            // Track category history
            const existingCategories = JSON.parse(localStorage.getItem('knome_saved_categories_list') || '[]');
            if (!existingCategories.includes(finalCategory)) {
                localStorage.setItem('knome_saved_categories_list', JSON.stringify([...existingCategories, finalCategory]));
            }

            // Dispatch global events for live updates across components & windows
            window.dispatchEvent(new CustomEvent('knome-bookmark-saved', { detail: savedItem }));
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_items_custom' }));

            if (onSaved) onSaved(savedItem);
        } catch (err) {
            console.error('Failed to save category bookmark:', err);
        } finally {
            setIsSaving(false);
            onClose();
        }
    };

    if (!isOpen || !item) return null;

    return createPortal(
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-left">
                
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                            <span className="material-symbols-outlined text-[20px]">bookmark_add</span>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight">Save & Categorize</h3>
                            <p className="text-xs text-slate-500">Choose a category folder to organize your saved post</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                    
                    {/* Item Preview Card */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs flex gap-3 items-center">
                        <img
                            src={resolveMediaUrl(contentImage || getDefaultThumbnail(item.contentType, selectedCategory))}
                            alt={contentTitle || 'Thumbnail'}
                            className="w-16 h-16 object-cover rounded-xl shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-slate-400 font-bold text-[11px] mb-1">
                                <span>{item.author?.name || item.author || 'Author'}</span>
                                <span>{item.time || 'Content'}</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 font-medium line-clamp-2 leading-relaxed">
                                {contentTitle || contentText || 'Saved Item'}
                            </p>
                        </div>
                    </div>

                    {/* Category Selection List */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            Select Destination Folder / Category *
                        </label>
                        <div className="space-y-2">
                            {availableCategories.map(cat => {
                                const isSelected = selectedCategory === cat.name;
                                return (
                                    <div
                                        key={cat.name}
                                        onClick={() => setSelectedCategory(cat.name)}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                            isSelected 
                                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-sm ring-1 ring-indigo-500/30' 
                                                : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-indigo-300 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                                                isSelected 
                                                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                            }`}>
                                                <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
                                            </div>
                                            <div>
                                                <div className="font-bold text-xs flex items-center gap-2">
                                                    {cat.name}
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-0.5">{cat.desc}</div>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                            {isSelected && <span className="material-symbols-outlined text-[14px]">check</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirmSave}
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[16px]">bookmark</span>
                        Save to {selectedCategory}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
