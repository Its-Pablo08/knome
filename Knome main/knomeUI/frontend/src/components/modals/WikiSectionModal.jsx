import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { apiClient } from '../../utils/apiService';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';

export default function WikiSectionModal({
    isOpen,
    onClose,
    wikiId,
    availableSections = [],
    initialData = null,
    defaultParentId = null,
    onSaved
}) {
    const { addToast } = useToast();

    const [title, setTitle] = useState('');
    const [parentSectionId, setParentSectionId] = useState('');
    const [sortOrder, setSortOrder] = useState(0);
    const [changeSummary, setChangeSummary] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const editorRef = useRef(null);
    const editorImageInputRef = useRef(null);
    const isEditMode = Boolean(initialData && initialData.sectionId);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title || '');
                setParentSectionId(initialData.parentSectionId ? String(initialData.parentSectionId) : '');
                setSortOrder(initialData.sortOrder || 0);
                setChangeSummary('');
                setTimeout(() => {
                    if (editorRef.current) {
                        editorRef.current.innerHTML = initialData.contentHtml || '';
                    }
                }, 50);
            } else {
                const draftKey = `wiki_section_draft_${wikiId}`;
                const savedDraftStr = localStorage.getItem(draftKey);
                let restored = false;
                if (savedDraftStr) {
                    try {
                        const d = JSON.parse(savedDraftStr);
                        if (d && (d.title || d.contentHtml)) {
                            setTitle(d.title || '');
                            setParentSectionId(d.parentSectionId !== undefined ? String(d.parentSectionId) : (defaultParentId ? String(defaultParentId) : ''));
                            setSortOrder(d.sortOrder || (availableSections.length * 10));
                            setChangeSummary('');
                            setTimeout(() => {
                                if (editorRef.current) {
                                    editorRef.current.innerHTML = d.contentHtml || '';
                                }
                            }, 50);
                            restored = true;
                        }
                    } catch {}
                }

                if (!restored) {
                    setTitle('');
                    setParentSectionId(defaultParentId ? String(defaultParentId) : '');
                    setSortOrder(availableSections.length * 10);
                    setChangeSummary('');
                    setTimeout(() => {
                        if (editorRef.current) {
                            editorRef.current.innerHTML = '';
                        }
                    }, 50);
                }
            }
        }
    }, [isOpen, initialData, defaultParentId, availableSections, wikiId]);

    // Autosave draft for new sections (WIKI-024)
    useEffect(() => {
        if (!isOpen || isEditMode || !wikiId) return;
        const timer = setInterval(() => {
            const currentHtml = editorRef.current?.innerHTML || '';
            if (title.trim() || currentHtml.trim()) {
                const draft = {
                    title,
                    parentSectionId,
                    sortOrder,
                    contentHtml: currentHtml,
                    savedAt: new Date().toISOString()
                };
                localStorage.setItem(`wiki_section_draft_${wikiId}`, JSON.stringify(draft));
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [isOpen, isEditMode, wikiId, title, parentSectionId, sortOrder]);

    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        h3: false,
        h4: false,
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
            const inH3 = block.includes('h3') || !!(anchor?.nodeType === 1 ? anchor.closest('h3') : anchor?.parentElement?.closest('h3'));
            const inH4 = block.includes('h4') || !!(anchor?.nodeType === 1 ? anchor.closest('h4') : anchor?.parentElement?.closest('h4'));

            let targetTag = value || 'p';
            if (value === 'h3' && inH3) targetTag = 'p';
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
                editorRef.current.focus();
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
        } else if (command === 'insertImage') {
            const url = window.prompt('Enter image URL to insert into document (or leave empty to pick a file):', 'https://');
            if (url && url.trim() && url.trim() !== 'https://') {
                if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
                    editorRef.current.focus();
                }
                const imgHtml = `<figure class="my-4"><img src="${url.trim()}" alt="Section diagram" class="rounded-xl max-w-full h-auto shadow-md border border-slate-200 dark:border-slate-800" /><figcaption class="text-xs text-slate-400 mt-1.5 text-center italic">Document Illustration</figcaption></figure><p><br></p>`;
                document.execCommand('insertHTML', false, imgHtml);
            } else if (url !== null) {
                editorImageInputRef.current?.click();
            }
        } else {
            document.execCommand(command, false, value);
        }

        updateActiveFormats();
    };

    const handleEditorImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            addToast('Please select a valid image file (JPG, PNG, WebP).', 'warning');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            addToast('Image size must not exceed 10MB.', 'warning');
            return;
        }

        setIsUploadingImage(true);
        try {
            let imgUrl = '';
            try {
                const res = await apiClient.uploadFile('/Media/upload', file, 'image');
                imgUrl = res?.url || res?.data?.url;
            } catch (upErr) {
                console.warn('Backend upload failed, fallback to local FileReader:', upErr);
            }

            if (!imgUrl) {
                imgUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target?.result);
                    reader.readAsDataURL(file);
                });
            }

            if (editorRef.current) {
                if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
                    editorRef.current.focus();
                }
                const figureHtml = `<figure class="my-4"><img src="${imgUrl}" alt="${file.name}" class="rounded-xl max-w-full h-auto shadow-md border border-slate-200 dark:border-slate-800" /><figcaption class="text-xs text-slate-400 mt-1.5 text-center italic">${file.name}</figcaption></figure><p><br></p>`;
                document.execCommand('insertHTML', false, figureHtml);
                addToast('Image attached and inserted into section!', 'success');
            }
        } catch (err) {
            console.error('Error attaching image:', err);
            addToast('Failed to attach image.', 'error');
        } finally {
            setIsUploadingImage(false);
            if (editorImageInputRef.current) editorImageInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        const contentHtml = editorRef.current?.innerHTML?.trim() || '';

        if (!trimmedTitle) {
            addToast('Section title is required.', 'error');
            return;
        }

        if (!contentHtml || contentHtml === '<br>' || contentHtml === '<p><br></p>') {
            addToast('Section content is required.', 'error');
            return;
        }

        const restrictedWord = checkRestrictedContent(trimmedTitle + ' ' + contentHtml);
        if (restrictedWord) {
            addToast(`Content contains restricted terms: "${restrictedWord}". Please revise.`, 'error');
            return;
        }

        setIsSaving(true);
        try {
            const parsedParentId = parentSectionId ? parseInt(parentSectionId, 10) : null;
            const payload = {
                title: trimmedTitle,
                parentSectionId: parsedParentId,
                sortOrder: parseInt(sortOrder, 10) || 0,
                contentHtml,
                changeSummary: changeSummary.trim() || (isEditMode ? 'Updated section content' : 'Created section')
            };

            if (isEditMode) {
                payload.expectedUpdatedDate = initialData.updatedDate;
                const updated = await wikiApi.updateSection(wikiId, initialData.sectionId, payload);
                addToast('Section updated successfully!', 'success');
                onSaved && onSaved(updated);
            } else {
                const created = await wikiApi.createSection(wikiId, payload);
                localStorage.removeItem(`wiki_section_draft_${wikiId}`);
                addToast('Section created successfully!', 'success');
                onSaved && onSaved(created);
            }
            onClose();
        } catch (err) {
            console.error('Error saving section:', err);
            addToast(err?.response?.data?.message || err?.message || 'Failed to save section.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Filter out self and circular options when in edit mode
    const selectableParents = availableSections.filter(s => {
        if (!isEditMode) return true;
        return s.sectionId !== initialData?.sectionId;
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditMode ? `Edit Section: ${initialData.title}` : 'Add New Section / Subsection'}
            maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Section Title <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Database Schema & Entity Relationships"
                        maxLength={200}
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-medium"
                    />
                </div>

                {/* Parent Section Hierarchy */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Hierarchy (Parent Section)
                    </label>
                    <select
                        value={parentSectionId}
                        onChange={(e) => setParentSectionId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                    >
                        <option value="">📁 Top-Level Root Section</option>
                        {selectableParents.map(s => (
                            <option key={s.sectionId} value={s.sectionId}>
                                ↳ Subsection under: {s.title}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Rich Content Editor */}
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                        Section Content <span className="text-red-500">*</span>
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-bold shadow-xs'
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-bold shadow-xs'
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-bold shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Underline (Ctrl+U)"
                            >
                                <span className="font-serif underline font-bold text-[14px] leading-none">U</span>
                            </button>

                            <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                            {/* Heading 3 */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'h3')}
                                className={`px-2 py-1 rounded flex items-center justify-center transition-colors cursor-pointer font-semibold text-[11px] ${
                                    activeFormats.h3
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Heading 3"
                            >
                                H3
                            </button>

                            {/* Subheading 4 */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'h4')}
                                className={`px-2 py-1 rounded flex items-center justify-center transition-colors cursor-pointer font-semibold text-[11px] ${
                                    activeFormats.h4
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
                                        : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                                title="Subheading 4"
                            >
                                H4
                            </button>


                            <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

                            {/* Bulleted List */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertUnorderedList')}
                                className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    activeFormats.bulletList
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
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

                            {/* Image Attachment */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertImage')}
                                disabled={isUploadingImage}
                                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-700 dark:text-slate-300 disabled:opacity-50"
                                title="Attach / Insert Image or Diagram"
                            >
                                {isUploadingImage ? (
                                    <span className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                                ) : (
                                    <span className="material-symbols-outlined text-[17px]">image</span>
                                )}
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

                        {/* Hidden Editor Image Attachment Input */}
                        <input
                            type="file"
                            ref={editorImageInputRef}
                            onChange={handleEditorImageUpload}
                            accept="image/*"
                            className="hidden"
                        />

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
                            className="rich-editor-content wiki-editor-content min-h-[180px] max-h-[340px] overflow-y-auto p-4 text-sm text-slate-800 dark:text-slate-100 focus:outline-none max-w-none"
                            style={{ wordBreak: 'break-word' }}
                        />
                    </div>
                </div>

                {/* Change Summary (only shown when editing existing section) */}
                {isEditMode && (
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                            Change Summary (Audit / Version Note)
                        </label>
                        <input
                            type="text"
                            value={changeSummary}
                            onChange={(e) => setChangeSummary(e.target.value)}
                            placeholder="e.g., Added detailed workflow steps and error handling notes"
                            maxLength={300}
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-md shadow-indigo-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">
                                    {isEditMode ? 'save' : 'post_add'}
                                </span>
                                {isEditMode ? 'Save Section' : 'Add Section'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
