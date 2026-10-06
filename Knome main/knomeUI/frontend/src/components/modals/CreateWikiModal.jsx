import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';

const PRESET_COVERS = [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1507842229451-7f01be8610ce?auto=format&fit=crop&q=80&w=1200',
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=1200'
];

export default function CreateWikiModal({ isOpen, onClose, onSaved, initialData = null }) {
    const { currentUser } = useUser();
    const { addToast } = useToast();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState('Published');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState([]);
    const [coverImageUrl, setCoverImageUrl] = useState(PRESET_COVERS[0]);
    const [changeSummary, setChangeSummary] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const editorRef = useRef(null);

    const isEditMode = Boolean(initialData && initialData.wikiId);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title || '');
                setDescription(initialData.description || '');
                setStatus(initialData.status || 'Published');
                setTags(Array.isArray(initialData.tags) ? [...initialData.tags] : []);
                setCoverImageUrl(initialData.coverImageUrl || PRESET_COVERS[0]);
                setChangeSummary('');
                setTimeout(() => {
                    if (editorRef.current) {
                        editorRef.current.innerHTML = initialData.contentHtml || '';
                    }
                }, 50);
            } else {
                setTitle('');
                setDescription('');
                setStatus('Published');
                setTags(['Wiki', 'Knowledge', 'Documentation']);
                setCoverImageUrl(PRESET_COVERS[0]);
                setChangeSummary('');
                setTimeout(() => {
                    if (editorRef.current) {
                        editorRef.current.innerHTML = '';
                    }
                }, 50);
            }
        }
    }, [isOpen, initialData]);

    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        h2: false,
        h3: false,
        normal: false,
        bulletList: false,
        numberList: false,
        quote: false
    });

    const updateActiveFormats = () => {
        try {
            const sel = window.getSelection();
            const anchor = sel?.anchorNode;
            const inUl = !!(anchor?.nodeType === 1 ? anchor.closest('ul') : anchor?.parentElement?.closest('ul'));
            const inOl = !!(anchor?.nodeType === 1 ? anchor.closest('ol') : anchor?.parentElement?.closest('ol'));
            const inBq = !!(anchor?.nodeType === 1 ? anchor.closest('blockquote') : anchor?.parentElement?.closest('blockquote'));
            const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();

            setActiveFormats({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                h2: block.includes('h2') || !!(anchor?.nodeType === 1 ? anchor.closest('h2') : anchor?.parentElement?.closest('h2')),
                h3: block.includes('h3') || !!(anchor?.nodeType === 1 ? anchor.closest('h3') : anchor?.parentElement?.closest('h3')),
                h4: block.includes('h4') || !!(anchor?.nodeType === 1 ? anchor.closest('h4') : anchor?.parentElement?.closest('h4')),
                bulletList: inUl || document.queryCommandState('insertUnorderedList'),
                numberList: inOl || document.queryCommandState('insertOrderedList'),
                quote: inBq || block.includes('blockquote')
            });
        } catch {
            // ignore
        }
    };

    const executeCmd = (command, value = null) => {
        if (!editorRef.current) return;

        // Ensure editor is initialized with at least an empty paragraph
        if (!editorRef.current.innerHTML || editorRef.current.innerHTML.trim() === '') {
            editorRef.current.innerHTML = '<p><br></p>';
        }

        // Only focus if not already focused inside the editor
        if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
            editorRef.current.focus();
        }

        if (command === 'insertUnorderedList') {
            document.execCommand('insertUnorderedList', false, null);
        } else if (command === 'insertOrderedList') {
            document.execCommand('insertOrderedList', false, null);
        } else if (command === 'formatBlock' && value === 'blockquote') {
            const sel = window.getSelection();
            const anchor = sel?.anchorNode;
            const bq = anchor?.nodeType === 1 ? anchor.closest('blockquote') : anchor?.parentElement?.closest('blockquote');

            if (bq) {
                // If inside blockquote, unwrap it back into normal paragraph
                const p = document.createElement('p');
                p.innerHTML = bq.innerHTML || '<br>';
                bq.parentNode?.replaceChild(p, bq);

                // Re-select inside new paragraph
                if (sel) {
                    const newRange = document.createRange();
                    newRange.selectNodeContents(p);
                    newRange.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            } else {
                let res = false;
                try {
                    res = document.execCommand('formatBlock', false, 'blockquote');
                } catch {}
                if (!res) {
                    try {
                        document.execCommand('formatBlock', false, '<blockquote>');
                    } catch {}
                }
            }
        } else if (command === 'formatBlock') {
            const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
            const sel = window.getSelection();
            const anchor = sel?.anchorNode;
            const inH2 = block.includes('h2') || !!(anchor?.nodeType === 1 ? anchor.closest('h2') : anchor?.parentElement?.closest('h2'));
            const inH3 = block.includes('h3') || !!(anchor?.nodeType === 1 ? anchor.closest('h3') : anchor?.parentElement?.closest('h3'));
            const inH4 = block.includes('h4') || !!(anchor?.nodeType === 1 ? anchor.closest('h4') : anchor?.parentElement?.closest('h4'));

            let targetTag = value || 'p';
            if (value === 'h2' && inH2) targetTag = 'p';
            else if (value === 'h3' && inH3) targetTag = 'p';
            else if (value === 'h4' && inH4) targetTag = 'p';

            let res = false;
            try {
                res = document.execCommand('formatBlock', false, targetTag);
            } catch {}
            if (!res) {
                try {
                    document.execCommand('formatBlock', false, `<${targetTag}>`);
                } catch {}
            }
        } else if (command === 'createLink') {
            const sel = window.getSelection();
            let savedRange = null;
            if (sel && sel.rangeCount > 0) {
                savedRange = sel.getRangeAt(0).cloneRange();
            }
            const selectedText = sel ? sel.toString().trim() : '';

            const url = window.prompt('Enter link URL (e.g. https://example.com):', 'https://');
            if (url && url.trim() && url.trim() !== 'https://') {
                if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
                    editorRef.current.focus();
                }
                if (savedRange && sel) {
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                }
                if (selectedText) {
                    document.execCommand('createLink', false, url.trim());
                } else {
                    const linkText = window.prompt('Enter link text to display:', url.trim()) || url.trim();
                    const linkHtml = `<a href="${url.trim()}" target="_blank" rel="noopener noreferrer" class="text-teal-600 dark:text-teal-400 underline font-semibold hover:text-teal-700">${linkText}</a>&nbsp;`;
                    document.execCommand('insertHTML', false, linkHtml);
                }
            }
        } else if (command === 'insertHorizontalRule') {
            document.execCommand('insertHTML', false, '<hr class="my-4 border-t border-slate-300 dark:border-slate-700" /><p><br></p>');
        } else {
            document.execCommand(command, false, value);
        }

        updateActiveFormats();
    };

    const handleAddTag = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = tagInput.trim().replace(/^#/, '');
            if (val && !tags.includes(val)) {
                setTags([...tags, val]);
                setTagInput('');
            }
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        const contentHtml = editorRef.current?.innerHTML?.trim() || '';

        if (!trimmedTitle) {
            addToast('Please enter a Wiki title.', 'error');
            return;
        }

        if (!contentHtml || contentHtml === '<br>' || contentHtml === '<p><br></p>') {
            addToast('Please write some overview content for the Wiki.', 'error');
            return;
        }

        // Check restricted content
        const restrictedWord = checkRestrictedContent(trimmedTitle + ' ' + description + ' ' + contentHtml);
        if (restrictedWord) {
            addToast(`Content contains restricted terms: "${restrictedWord}". Please revise.`, 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (isEditMode) {
                const payload = {
                    title: trimmedTitle,
                    description: description.trim(),
                    contentHtml,
                    status,
                    coverImageUrl,
                    tags,
                    changeSummary: changeSummary.trim() || 'Updated Wiki overview'
                };
                const updated = await wikiApi.updateWiki(initialData.wikiId, payload);
                addToast('Wiki updated successfully!', 'success');
                onSaved && onSaved(updated);
                onClose();
            } else {
                const payload = {
                    title: trimmedTitle,
                    description: description.trim(),
                    contentHtml,
                    status,
                    coverImageUrl,
                    tags
                };
                const created = await wikiApi.createWiki(payload);
                addToast('Wiki created successfully!', 'success');
                onSaved && onSaved(created);
                onClose();
            }
        } catch (err) {
            console.error('Error saving wiki:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to save Wiki.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditMode ? `Edit Wiki: ${initialData.title}` : 'Create New Knowledge Wiki'}
            maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Title */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Wiki Title <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., MPOnline Core System Architecture & Guidelines"
                        maxLength={200}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm font-medium"
                    />
                </div>

                {/* Short Description */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Short Description / Purpose
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief summary explaining what this Wiki covers..."
                        rows={2}
                        maxLength={500}
                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-sm resize-none"
                    />
                </div>

                {/* Status & Cover Banner Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                            Publication Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        >
                            <option value="Published">🌐 Published (Organization Visible)</option>
                            <option value="Draft">🔒 Draft (Authors & Collaborators Only)</option>
                            {isEditMode && <option value="Archived">📦 Archived (Read-Only Archive)</option>}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                            Cover Banner Preset
                        </label>
                        <div className="flex items-center gap-2 overflow-x-auto py-1">
                            {PRESET_COVERS.map((img, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setCoverImageUrl(img)}
                                    className={`w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                                        coverImageUrl === img ? 'border-teal-500 scale-105 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    <img src={img} alt={`Cover ${idx}`} className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Rich Text Editor Toolbar */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Overview & Introduction Content <span className="text-red-500">*</span>
                    </label>

                    <div className="border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                        {/* WYSIWYG Toolbar */}
                        <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs select-none">
                            {/* Bold */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('bold')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.bold
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 font-bold shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Bold (Ctrl+B)"
                            >
                                <span className="font-serif font-black text-[14px] leading-none">B</span>
                            </button>

                            {/* Italic */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('italic')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.italic
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 font-bold shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Italic (Ctrl+I)"
                            >
                                <span className="font-serif italic font-bold text-[14px] leading-none">I</span>
                            </button>

                            {/* Underline */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('underline')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.underline
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 font-bold shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Underline (Ctrl+U)"
                            >
                                <span className="font-serif underline font-bold text-[14px] leading-none">U</span>
                            </button>

                            <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                            {/* Heading 2 */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'h2')}
                                className={`px-2 py-1 rounded flex items-center justify-center transition-colors cursor-pointer font-semibold text-[11px] ${
                                    activeFormats.h2
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Heading 2"
                            >
                                H2
                            </button>

                            {/* Heading 3 */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'h3')}
                                className={`px-2 py-1 rounded flex items-center justify-center transition-colors cursor-pointer font-semibold text-[11px] ${
                                    activeFormats.h3
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Heading 3"
                            >
                                H3
                            </button>


                            <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                            {/* Bulleted List */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertUnorderedList')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.bulletList
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Bulleted List"
                            >
                                <span className="material-symbols-outlined text-[17px]">format_list_bulleted</span>
                            </button>

                            {/* Numbered List */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertOrderedList')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.numberList
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Numbered List"
                            >
                                <span className="material-symbols-outlined text-[17px]">format_list_numbered</span>
                            </button>

                            {/* Quote */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'blockquote')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.quote
                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Quote / Blockquote"
                            >
                                <span className="material-symbols-outlined text-[17px]">format_quote</span>
                            </button>

                            <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                            {/* Link */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('createLink')}
                                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                                title="Insert Link"
                            >
                                <span className="material-symbols-outlined text-[17px]">link</span>
                            </button>

                            {/* Horizontal Rule */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertHorizontalRule')}
                                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                                title="Horizontal Divider Line"
                            >
                                <span className="material-symbols-outlined text-[17px]">horizontal_rule</span>
                            </button>
                        </div>

                        {/* Editable Area */}
                        <div
                            ref={editorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onKeyUp={updateActiveFormats}
                            onMouseUp={updateActiveFormats}
                            onSelect={updateActiveFormats}
                            onKeyDown={(e) => {
                                if (e.key === 'Tab') {
                                    e.preventDefault();
                                    if (e.shiftKey) {
                                        document.execCommand('outdent', false, null);
                                    } else {
                                        document.execCommand('indent', false, null);
                                    }
                                    updateActiveFormats();
                                }
                            }}
                            className="rich-editor-content wiki-editor-content min-h-[160px] max-h-[300px] overflow-y-auto p-4 text-sm text-slate-800 dark:text-slate-100 focus:outline-none max-w-none"
                            style={{ wordBreak: 'break-word' }}
                        />
                    </div>
                </div>

                {/* Tags */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Tags & Keywords (Press Enter or comma to add)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {tags.map((t, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/60">
                                #{t}
                                <button type="button" onClick={() => handleRemoveTag(t)} className="hover:text-red-500">
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                            </span>
                        ))}
                        <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder={tags.length === 0 ? "e.g. Architecture, Security, APIs" : "Add tag..."}
                            className="flex-1 min-w-[120px] bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none py-1"
                        />
                    </div>
                </div>

                {/* Change Summary if editing */}
                {isEditMode && (
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                            Version Change Summary (Audit Log Note)
                        </label>
                        <input
                            type="text"
                            value={changeSummary}
                            onChange={(e) => setChangeSummary(e.target.value)}
                            placeholder="e.g., Added architecture overview diagram and security guidelines"
                            maxLength={300}
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 text-xs"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">
                                    {isEditMode ? 'save' : 'menu_book'}
                                </span>
                                {isEditMode ? 'Save Changes' : 'Create Wiki'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
