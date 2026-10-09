import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { wikiApi } from '../../utils/wikiService';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';
import { apiClient } from '../../utils/apiClient';
import { resolveMediaUrl } from '../../utils/apiService';

export const PRESET_COVER_BANNERS = [
    {
        id: 'space-cloud',
        name: 'Cloud & System Architecture',
        category: 'Technology',
        description: 'Global infrastructure, network mesh, and high-availability architecture',
        url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'tech-team',
        name: 'Enterprise Strategy & Planning',
        category: 'Business',
        description: 'Cross-functional product planning, agile roadmaps, and delivery',
        url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'collaboration',
        name: 'Cross-Functional Collaboration',
        category: 'Operations',
        description: 'Interactive team workshops, collaborative knowledge, and syncs',
        url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'code-dev',
        name: 'Software Engineering & Codebase',
        category: 'Engineering',
        description: 'Software design patterns, engineering standards, and clean code',
        url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'analytics-desk',
        name: 'Digital Workspace & Analytics',
        category: 'Technology',
        description: 'Executive dashboards, performance metrics, and system analytics',
        url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'books-knowledge',
        name: 'Knowledge Library & Governance',
        category: 'Documentation',
        description: 'Official enterprise policies, standard operating playbooks, and SOPs',
        url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'cyber-defense',
        name: 'Cybersecurity & Compliance Standards',
        category: 'Security',
        description: 'Zero-trust protocols, enterprise encryption, and regulatory audits',
        url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'data-platform',
        name: 'Data Science & Metrics Engine',
        category: 'Data',
        description: 'Data pipelines, distributed processing, and AI/ML metrics',
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200'
    },
    {
        id: 'corporate-labs',
        name: 'Corporate Innovation & Labs',
        category: 'Operations',
        description: 'R&D initiatives, prototyping labs, and future-forward design',
        url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200'
    }
];

export const PRESET_COVERS = PRESET_COVER_BANNERS.map(p => p.url);

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

    // Cover banner attachment states
    const [isPresetGalleryOpen, setIsPresetGalleryOpen] = useState(false);
    const [selectedPresetCategory, setSelectedPresetCategory] = useState('All');
    const [presetSearch, setPresetSearch] = useState('');
    const [isUploadingCover, setIsUploadingCover] = useState(false);

    const coverFileInputRef = useRef(null);
    const editorImageInputRef = useRef(null);
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
                const savedDraftStr = localStorage.getItem('wiki_draft_create');
                let restored = false;
                if (savedDraftStr) {
                    try {
                        const d = JSON.parse(savedDraftStr);
                        if (d && (d.title || d.contentHtml)) {
                            setTitle(d.title || '');
                            setDescription(d.description || '');
                            setStatus(d.status || 'Published');
                            setTags(Array.isArray(d.tags) ? d.tags : ['Wiki', 'Knowledge', 'Documentation']);
                            setCoverImageUrl(d.coverImageUrl || PRESET_COVERS[0]);
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
        }
    }, [isOpen, initialData]);

    // Autosave draft (WIKI-024)
    useEffect(() => {
        if (!isOpen || isEditMode) return;
        const timer = setInterval(() => {
            const currentHtml = editorRef.current?.innerHTML || '';
            if (title.trim() || currentHtml.trim()) {
                const draft = {
                    title,
                    description,
                    status,
                    tags,
                    coverImageUrl,
                    contentHtml: currentHtml,
                    savedAt: new Date().toISOString()
                };
                localStorage.setItem('wiki_draft_create', JSON.stringify(draft));
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [isOpen, isEditMode, title, description, status, tags, coverImageUrl]);

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
        } else if (command === 'insertImage') {
            const url = window.prompt('Enter image URL to insert into document (or leave empty to pick a file):', 'https://');
            if (url && url.trim() && url.trim() !== 'https://') {
                if (document.activeElement !== editorRef.current && !editorRef.current.contains(document.activeElement)) {
                    editorRef.current.focus();
                }
                const imgHtml = `<figure class="my-4"><img src="${url.trim()}" alt="Wiki diagram" class="rounded-xl max-w-full h-auto shadow-md border border-slate-200 dark:border-slate-800" /><figcaption class="text-xs text-slate-400 mt-1.5 text-center italic">Document Illustration</figcaption></figure><p><br></p>`;
                document.execCommand('insertHTML', false, imgHtml);
            } else if (url !== null) {
                editorImageInputRef.current?.click();
            }
        } else {
            document.execCommand(command, false, value);
        }

        updateActiveFormats();
    };

    const handleSelectPreset = (url, name) => {
        setCoverImageUrl(url);
        setIsPresetGalleryOpen(false);
        addToast(`Cover banner preset "${name || 'Selected'}" attached!`, 'success');
    };

    const handleCoverFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            addToast('Please select a valid image file (JPG, PNG, WebP).', 'warning');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            addToast('Cover banner image size must not exceed 10MB.', 'warning');
            return;
        }

        setIsUploadingCover(true);
        try {
            const res = await apiClient.uploadFile('/Media/upload', file, 'image');
            const resolved = res?.url || res?.data?.url;
            if (resolved) {
                setCoverImageUrl(resolved);
                addToast('Custom cover banner uploaded and attached successfully!', 'success');
            } else {
                throw new Error('Upload endpoint did not return URL');
            }
        } catch (uploadErr) {
            console.warn('Backend cover upload failed, using local FileReader fallback:', uploadErr);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    setCoverImageUrl(ev.target.result);
                    addToast('Cover banner attached from local image!', 'success');
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setIsUploadingCover(false);
            if (coverFileInputRef.current) coverFileInputRef.current.value = '';
        }
    };

    const handleRemoveCover = () => {
        setCoverImageUrl('');
        addToast('Cover banner removed.', 'info');
    };

    const handleEditorImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        editorRef.current?.focus();
        try {
            const res = await apiClient.uploadFile('/Media/upload', file, 'image');
            const resolved = resolveMediaUrl(res?.url || res?.data?.url);
            const imgHtml = `<figure class="my-4"><img src="${resolved}" alt="${file.name}" class="rounded-xl max-w-full h-auto shadow-md border border-slate-200 dark:border-slate-800" /><figcaption class="text-xs text-slate-400 mt-1.5 text-center italic">${file.name}</figcaption></figure><p><br></p>`;
            document.execCommand('insertHTML', false, imgHtml);
        } catch {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const imgHtml = `<figure class="my-4"><img src="${ev.target.result}" alt="${file.name}" class="rounded-xl max-w-full h-auto shadow-md border border-slate-200 dark:border-slate-800" /><figcaption class="text-xs text-slate-400 mt-1.5 text-center italic">${file.name}</figcaption></figure><p><br></p>`;
                document.execCommand('insertHTML', false, imgHtml);
            };
            reader.readAsDataURL(file);
        } finally {
            if (editorImageInputRef.current) editorImageInputRef.current.value = '';
        }
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
                    changeSummary: changeSummary.trim() || 'Updated Wiki overview',
                    expectedUpdatedDate: initialData.updatedDate
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
                localStorage.removeItem('wiki_draft_create');
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
        <>
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
                        className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm resize-none"
                    />
                </div>

                {/* Hidden File Inputs for Cover Banner & Inline Editor Images */}
                <input
                    type="file"
                    ref={coverFileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleCoverFileUpload}
                    className="hidden"
                />
                <input
                    type="file"
                    ref={editorImageInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleEditorImageUpload}
                    className="hidden"
                />

                {/* Status & Cover Banner Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    {/* Publication Status */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            Publication Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-2xs"
                        >
                            <option value="Published">🌐 Published (Organization Visible)</option>
                            <option value="Draft">🔒 Draft (Authors & Collaborators Only)</option>
                            {isEditMode && <option value="Archived">📦 Archived (Read-Only Archive)</option>}
                        </select>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                            {status === 'Published'
                                ? 'Published wikis are visible to all employees across the organization.'
                                : status === 'Draft'
                                    ? 'Draft wikis are restricted to authors and designated collaborators.'
                                    : 'Archived wikis are preserved in read-only mode.'}
                        </p>
                    </div>

                    {/* Cover Banner Preset & Attachments Card */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[15px] text-indigo-600 dark:text-indigo-400">image</span>
                                <span>Cover Banner</span>
                            </label>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                Preset or Custom
                            </span>
                        </div>

                        <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-700/60 space-y-2.5">
                            {/* Toolbar: Quick Presets Label & Action Buttons */}
                            <div className="flex items-center justify-between gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Quick Presets
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsPresetGalleryOpen(true)}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                                        title="Browse full preset gallery"
                                    >
                                        <span className="material-symbols-outlined text-[14px] text-indigo-600 dark:text-indigo-400">photo_library</span>
                                        <span>Presets</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => coverFileInputRef.current?.click()}
                                        disabled={isUploadingCover}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 cursor-pointer"
                                        title="Upload custom banner image from device (JPG, PNG, WebP)"
                                    >
                                        {isUploadingCover ? (
                                            <span className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                                        ) : (
                                            <span className="material-symbols-outlined text-[14px] text-indigo-600 dark:text-indigo-400">cloud_upload</span>
                                        )}
                                        <span>Upload</span>
                                    </button>
                                </div>
                            </div>

                            {/* Quick Presets Strip */}
                            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
                                {PRESET_COVER_BANNERS.slice(0, 6).map((preset) => {
                                    const isSel = coverImageUrl === preset.url;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => handleSelectPreset(preset.url, preset.name)}
                                            className={`w-10 h-10 rounded-xl overflow-hidden shrink-0 border-2 transition-all relative group cursor-pointer ${
                                                isSel
                                                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-105 shadow-sm'
                                                    : 'border-transparent opacity-80 hover:opacity-100 hover:scale-105'
                                            }`}
                                            title={`${preset.name} (${preset.category})`}
                                        >
                                            <img
                                                src={preset.url}
                                                alt={preset.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.display = 'none';
                                                    if (e.target.parentElement) {
                                                        e.target.parentElement.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #1e3a8a 100%)';
                                                    }
                                                }}
                                            />
                                            {isSel && (
                                                <div className="absolute inset-0 bg-indigo-950/50 backdrop-blur-[0.5px] flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-[14px] text-white font-bold drop-shadow">check</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => setIsPresetGalleryOpen(true)}
                                    className="w-10 h-10 rounded-xl shrink-0 border border-dashed border-indigo-500/50 hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 hover:bg-indigo-50 text-indigo-600 dark:text-indigo-400 flex flex-col items-center justify-center transition-all cursor-pointer group"
                                    title="Browse all 12 Cover Banner Presets"
                                >
                                    <span className="material-symbols-outlined text-[16px] group-hover:scale-110 transition-transform">add_photo_alternate</span>
                                </button>
                            </div>

                            {/* Active Attached Banner Badge / Preview */}
                            {coverImageUrl ? (
                                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-[11px]">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <img
                                            src={resolveMediaUrl(coverImageUrl)}
                                            alt="Active Cover"
                                            className="w-8 h-6 rounded-md object-cover shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                                                {PRESET_COVER_BANNERS.find(p => p.url === coverImageUrl)?.name ||
                                                    (coverImageUrl.startsWith('data:')
                                                        ? 'Custom Local Image'
                                                        : coverImageUrl.includes('/Media/') || coverImageUrl.includes('/uploads/')
                                                            ? 'Uploaded Custom Image'
                                                            : 'External Image URL')}
                                            </p>
                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                <span>Attached Banner</span>
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsPresetGalleryOpen(true)}
                                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-semibold cursor-pointer px-1.5 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
                                        >
                                            Change
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRemoveCover}
                                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                                            title="Remove cover banner"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                        <span>No cover banner attached</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setIsPresetGalleryOpen(true)}
                                        className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                                    >
                                        Pick Preset
                                    </button>
                                </div>
                            )}
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

                            {/* Heading 2 */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('formatBlock', 'h2')}
                                className={`px-2 py-1 rounded flex items-center justify-center transition-colors cursor-pointer font-semibold text-[11px] ${
                                    activeFormats.h2
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
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
                                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 shadow-xs'
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

                            {/* Insert Image */}
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => executeCmd('insertImage')}
                                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                                title="Attach / Insert Image (Upload file or enter URL)"
                            >
                                <span className="material-symbols-outlined text-[17px]">image</span>
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
                            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60">
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
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs"
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
                                    {isEditMode ? 'save' : 'menu_book'}
                                </span>
                                {isEditMode ? 'Save Changes' : 'Create Wiki'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>

        {/* Cover Banner Preset Attachment Modal */}
        <Modal
            isOpen={isPresetGalleryOpen}
            onClose={() => setIsPresetGalleryOpen(false)}
            title="Cover Banner Preset Attachment"
            maxWidth="max-w-4xl"
        >
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Select and attach a curated high-resolution enterprise cover banner to your Knowledge Wiki.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                setIsPresetGalleryOpen(false);
                                coverFileInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200/80 dark:border-indigo-800/60"
                            title="Upload custom cover from local device"
                        >
                            <span className="material-symbols-outlined text-[15px]">cloud_upload</span>
                            <span>Upload Custom Image</span>
                        </button>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {['All', 'Technology', 'Engineering', 'Operations', 'Documentation', 'Security', 'Business', 'Data'].map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedPresetCategory(cat)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    selectedPresetCategory === cat
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    <div className="relative min-w-[180px]">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                        <input
                            type="text"
                            value={presetSearch}
                            onChange={(e) => setPresetSearch(e.target.value)}
                            placeholder="Search presets..."
                            className="w-full pl-8 pr-3 py-1 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Presets Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[55vh] overflow-y-auto p-1 custom-scrollbar">
                    {PRESET_COVER_BANNERS.filter((p) => {
                        const matchCat = selectedPresetCategory === 'All' || p.category === selectedPresetCategory;
                        const matchQuery = !presetSearch.trim() || p.name.toLowerCase().includes(presetSearch.toLowerCase()) || p.category.toLowerCase().includes(presetSearch.toLowerCase());
                        return matchCat && matchQuery;
                    }).map((preset) => {
                        const isAttached = coverImageUrl === preset.url;
                        return (
                            <div
                                key={preset.id}
                                onClick={() => handleSelectPreset(preset.url, preset.name)}
                                className={`group rounded-2xl border overflow-hidden bg-white dark:bg-slate-850 transition-all cursor-pointer flex flex-col justify-between ${
                                    isAttached
                                        ? 'border-indigo-500 ring-2 ring-indigo-500/40 shadow-md'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 hover:shadow-md'
                                }`}
                            >
                                <div className="relative h-28 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                                    <img
                                        src={preset.url}
                                        alt={preset.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            if (e.target.parentElement) {
                                                e.target.parentElement.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #1e293b 100%)';
                                            }
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                                    <div className="absolute top-2 left-2">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-950/60 text-white backdrop-blur-md">
                                            {preset.category}
                                        </span>
                                    </div>
                                    {isAttached && (
                                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white flex items-center gap-1 shadow-sm">
                                            <span className="material-symbols-outlined text-[13px]">check</span>
                                            Attached
                                        </div>
                                    )}
                                </div>

                                <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {preset.name}
                                        </h4>
                                        {preset.description && (
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                                {preset.description}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelectPreset(preset.url, preset.name);
                                        }}
                                        className={`w-full py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-2 cursor-pointer ${
                                            isAttached
                                                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-indigo-600 group-hover:text-white'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">
                                            {isAttached ? 'check_circle' : 'attach_file'}
                                        </span>
                                        <span>{isAttached ? 'Attached Preset' : 'Attach Preset'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400">
                        {PRESET_COVER_BANNERS.length} curated enterprise presets available for instant attachment.
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsPresetGalleryOpen(false)}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                        Done
                    </button>
                </div>
            </div>
        </Modal>
        </>
    );
}
