import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { saveArticle, getArticleCategories, createArticleCategory } from '../../utils/articleService';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';
import { formatToDDMMYYYY, mediaApi, resolveMediaUrl } from '../../utils/apiService';
import CustomDateTimePicker from '../widgets/CustomDateTimePicker';

export default function CreateArticleModal({ isOpen, onClose, onArticleCreated }) {
    const { currentUser, awardRuleKarma } = useUser();
    const { addToast } = useToast();
    const isModerator = ['MOD', 'MODERATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
        ['Moderator'].includes(currentUser?.roleName) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['MOD', 'MODERATOR'].includes(String(r?.roleCode || r?.roleName || r || '').toUpperCase())));

    // Moderators and employees cannot directly publish; only System Admin can bypass approval
    const canDirectPublish = !isModerator && (
        ['SYSADM', 'SYSTEM ADMIN', 'SYSTEM ADMINISTRATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
        ['System Administrator', 'System Admin'].includes(currentUser?.roleName) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'SYSTEM ADMIN', 'SYSTEM ADMINISTRATOR'].includes(String(r?.roleCode || r?.roleName || r || '').toUpperCase())))
    );
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('7');
    const [tags, setTags] = useState('');
    
    // Rich text editor state & formatting
    const [content, setContent] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const editorRef = useRef(null);
    const savedRangeRef = useRef(null);

    // Link Dialog State
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('https://');
    const [linkText, setLinkText] = useState('');
    const [linkOpenInNewTab, setLinkOpenInNewTab] = useState(true);

    // Image / Media Dialog State
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [imageTab, setImageTab] = useState('upload'); // 'upload' | 'url'
    const [imageUrl, setImageUrl] = useState('');
    const [imageCaption, setImageCaption] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        list: false,
        numlist: false,
        heading: false,
        quote: false
    });

    const updateActiveFormats = () => {
        try {
            const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
            setActiveFormats({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                list: document.queryCommandState('insertUnorderedList'),
                numlist: document.queryCommandState('insertOrderedList'),
                heading: block === 'h1' || block === 'h2' || block === 'h3',
                quote: block === 'blockquote'
            });
        } catch (e) {}
    };

    const saveEditorSelection = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editorRef.current && editorRef.current.contains(sel.anchorNode)) {
            savedRangeRef.current = sel.getRangeAt(0).cloneRange();
            return sel.toString();
        }
        return '';
    };

    const openLinkDialog = () => {
        const selected = saveEditorSelection();
        setLinkText(selected || '');
        setLinkUrl('https://');
        setLinkOpenInNewTab(true);
        setIsLinkModalOpen(true);
    };

    const openImageDialog = () => {
        saveEditorSelection();
        setImageTab('upload');
        setImageUrl('');
        setImageCaption('');
        setImageFile(null);
        setImagePreviewUrl(null);
        setUploadProgress(0);
        setIsImageModalOpen(true);
    };

    const insertHtmlAtSelection = (html) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        const sel = window.getSelection();
        if (savedRangeRef.current && sel) {
            sel.removeAllRanges();
            sel.addRange(savedRangeRef.current);
        }
        try {
            document.execCommand('insertHTML', false, html);
        } catch {
            editorRef.current.innerHTML += html;
        }
        setContent(editorRef.current.innerText || '');
        updateActiveFormats();
        savedRangeRef.current = null;
    };

    const handleInsertLink = (e) => {
        e?.preventDefault();
        const cleanUrl = (linkUrl || '').trim();
        if (!cleanUrl || cleanUrl === 'https://' || cleanUrl === 'http://') {
            addToast('Please enter a valid website URL', 'error');
            return;
        }
        const validUrl = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
        const displayText = (linkText || '').trim() || validUrl;
        const targetAttr = linkOpenInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
        const linkHtml = `<a href="${validUrl}"${targetAttr} class="text-indigo-600 dark:text-indigo-400 font-semibold underline hover:text-indigo-700">${displayText}</a>&nbsp;`;
        
        insertHtmlAtSelection(linkHtml);
        setIsLinkModalOpen(false);
        addToast('Link inserted into article', 'success');
    };

    const handleInsertImage = async (e) => {
        e?.preventDefault();
        let finalUrl = '';
        if (imageTab === 'upload') {
            if (!imageFile) {
                addToast('Please choose an image file to upload', 'error');
                return;
            }
            setIsUploadingImage(true);
            try {
                const res = await mediaApi.uploadFile(imageFile, 'image', (progress) => {
                    setUploadProgress(progress);
                });
                const uploadedUrl = res.fileUrl || res.url || res.data?.fileUrl || res.data?.url;
                if (!uploadedUrl) {
                    throw new Error('Upload response did not contain a valid URL');
                }
                finalUrl = resolveMediaUrl(uploadedUrl) || uploadedUrl;
            } catch (err) {
                console.error('Image upload failed:', err);
                addToast('Failed to upload image: ' + (err.message || 'Server error'), 'error');
                setIsUploadingImage(false);
                return;
            } finally {
                setIsUploadingImage(false);
            }
        } else {
            const cleanUrl = (imageUrl || '').trim();
            if (!cleanUrl || cleanUrl === 'https://' || cleanUrl === 'http://') {
                addToast('Please enter a valid image URL', 'error');
                return;
            }
            finalUrl = cleanUrl;
        }

        const captionText = (imageCaption || '').trim();
        const imgHtml = `<figure class="my-4 text-center"><img src="${finalUrl}" alt="${captionText || 'Article illustration'}" class="rounded-xl max-w-full h-auto mx-auto shadow-md border border-slate-200 dark:border-slate-800" />${captionText ? `<figcaption class="text-xs text-slate-500 dark:text-slate-400 mt-2 italic text-center">${captionText}</figcaption>` : ''}</figure><p><br></p>`;
        
        insertHtmlAtSelection(imgHtml);
        setIsImageModalOpen(false);
        addToast('Image added to article', 'success');
    };

    const toggleFormat = (format) => {
        editorRef.current?.focus();
        if (!editorRef.current?.innerHTML?.trim() || editorRef.current?.innerHTML === '<br>') {
            editorRef.current.innerHTML = '<p><br></p>';
            const range = document.createRange();
            const sel = window.getSelection();
            if (editorRef.current.firstChild) {
                range.setStart(editorRef.current.firstChild, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        if (format === 'bold') {
            document.execCommand('bold', false, null);
        } else if (format === 'italic') {
            document.execCommand('italic', false, null);
        } else if (format === 'underline') {
            document.execCommand('underline', false, null);
        } else if (format === 'list') {
            document.execCommand('insertUnorderedList', false, null);
        } else if (format === 'numlist') {
            document.execCommand('insertOrderedList', false, null);
        } else if (format === 'quote') {
            const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
            const isQuote = block.includes('blockquote');
            if (isQuote) {
                try { document.execCommand('formatBlock', false, '<p>'); } catch (e) { document.execCommand('formatBlock', false, 'p'); }
            } else {
                try { document.execCommand('formatBlock', false, '<blockquote>'); } catch (e) { document.execCommand('formatBlock', false, 'blockquote'); }
            }
        } else if (format === 'codeblock') {
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : '';
            const codeSnippet = selectedText || '// Enter your code snippet here\nfunction example() {\n  return true;\n}';
            const escapedCode = codeSnippet.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const blockHtml = `<pre class="my-4 p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner"><code>${escapedCode}</code></pre><p><br></p>`;
            document.execCommand('insertHTML', false, blockHtml);
        } else if (format === 'divider') {
            document.execCommand('insertHTML', false, '<hr class="my-6 border-t border-slate-300 dark:border-slate-700" /><p><br></p>');
        } else if (format === 'link') {
            openLinkDialog();
            return;
        } else if (format === 'code') {
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : '';
            if (selectedText && !selectedText.includes('\n')) {
                const isCode = selection.anchorNode?.parentElement?.tagName === 'CODE';
                if (isCode) {
                    document.execCommand('removeFormat', false, null);
                } else {
                    document.execCommand('insertHTML', false, `<code class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-rose-500 font-mono text-xs rounded border border-slate-200 dark:border-slate-700 font-medium">${selectedText}</code>`);
                }
            } else {
                const codeSnippet = selectedText || '// Enter your code snippet here\nfunction example() {\n  return true;\n}';
                const escapedCode = codeSnippet.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const blockHtml = `<pre class="my-4 p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner"><code>${escapedCode}</code></pre><p><br></p>`;
                document.execCommand('insertHTML', false, blockHtml);
            }
        } else if (format === 'image') {
            openImageDialog();
            return;
        }

        updateActiveFormats();
        if (editorRef.current) {
            setContent(editorRef.current.innerText || '');
        }
    };

    // Scheduling states & helpers
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduledTime, setScheduledTime] = useState('');
    const [tempScheduleTime, setTempScheduleTime] = useState('');
    const schedulePopoverRef = useRef(null);

    // Format display string cleanly
    const formatScheduleDisplay = (isoStr) => {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    // Calculate relative schedule text (e.g., "in 1 min", "in 15 mins", "Tomorrow at 09:00 AM")
    const getRelativeScheduleText = (dateInput) => {
        if (!dateInput) return '';
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '';
        const diffMs = d.getTime() - Date.now();
        if (diffMs <= 0) return 'Immediate';
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 60) {
            return `in ${diffMins} ${diffMins === 1 ? 'min' : 'mins'}`;
        }
        const diffHours = Math.round(diffMs / 3600000);
        if (diffHours < 24) {
            return `in ~${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'}`;
        }
        const days = Math.round(diffMs / 86400000);
        return `in ~${days} ${days === 1 ? 'day' : 'days'}`;
    };

    // Format local system time for datetime calculation
    const getLocalDatetimeInputValue = (offsetMinutes = 1) => {
        const d = new Date(Date.now() + offsetMinutes * 60000);
        const pad = (n) => String(n).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const getTomorrowTime = (hour = 9) => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(hour, 0, 0, 0);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
    };

    // Click outside popover to close cleanly without losing state
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (isScheduling && schedulePopoverRef.current && !schedulePopoverRef.current.contains(e.target)) {
                if (e.target.closest('[data-schedule-trigger]')) return;
                setIsScheduling(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isScheduling]);


    const isSysAdmin = currentUser?.role === 'SYSADM' || 
                       currentUser?.roleName === 'System Administrator' || 
                       (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'System Administrator', 'SystemAdmin'].includes(r)));

    const [availableCategories, setAvailableCategories] = useState([
        { categoryId: 1, name: 'Technology' },
        { categoryId: 7, name: 'Engineering' },
        { categoryId: 8, name: 'Design' },
        { categoryId: 9, name: 'Product Management' },
        { categoryId: 10, name: 'Company Culture' }
    ]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isSavingCategory, setIsSavingCategory] = useState(false);

    useEffect(() => {
        if (isOpen) {
            getArticleCategories().then(cats => {
                if (Array.isArray(cats) && cats.length > 0) {
                    setAvailableCategories(cats);
                }
            }).catch(() => {});
        } else {
            setTitle('');
            setCategory('7');
            setTags('');
            setContent('');
            if (editorRef.current) {
                editorRef.current.innerHTML = '';
            }
            setActiveFormats({
                bold: false,
                italic: false,
                underline: false,
                list: false,
                numlist: false
            });
            setIsAddingCategory(false);
            setNewCategoryName('');
            setIsScheduling(false);
            setScheduledTime('');
        }
    }, [isOpen]);

    const handleCreateCategory = async (e) => {
        e?.preventDefault();
        if (!newCategoryName.trim()) {
            addToast('Please enter a category name.', 'warning');
            return;
        }
        setIsSavingCategory(true);
        try {
            const res = await createArticleCategory(newCategoryName.trim());
            const created = res?.data || res;
            if (created && created.categoryId) {
                setAvailableCategories(prev => [...prev, created]);
                setCategory(String(created.categoryId));
                setNewCategoryName('');
                setIsAddingCategory(false);
                addToast(`Category "${created.name}" created successfully! 🎉`, 'success');
            }
        } catch (err) {
            console.error("Failed to add category:", err);
            const msg = err.data?.message || err.message || 'Failed to add category.';
            addToast(msg, 'error');
        } finally {
            setIsSavingCategory(false);
        }
    };

    const handlePublish = async (actionStatus = null) => {
        if (!title.trim()) {
            addToast('Please enter an article title.', 'warning');
            return;
        }

        const editorText = editorRef.current ? (editorRef.current.innerText || '').trim() : content.trim();
        const editorHtml = editorRef.current ? (editorRef.current.innerHTML || '').trim() : '';

        if (!editorText && !editorHtml) {
            addToast('Please enter article content.', 'warning');
            editorRef.current?.focus();
            return;
        }

        const textToScan = `${title} ${tags} ${editorText}`;
        const foundKeyword = checkRestrictedContent(textToScan);
        if (foundKeyword) {
            addToast(`Article cannot be published. It contains the restricted term: "${foundKeyword}".`, 'warning');
            return;
        }

        let finalStatus = actionStatus || (scheduledTime ? 'Scheduled' : 'Published');
        let isoScheduledDate = null;

        if (finalStatus === 'Scheduled') {
            if (!scheduledTime) {
                addToast('Please select a scheduled date and time.', 'error');
                return;
            }
            const parsed = new Date(scheduledTime);
            if (isNaN(parsed.getTime())) {
                addToast('Invalid scheduled date/time selected.', 'error');
                return;
            }
            if (parsed.getTime() <= Date.now() + 20000) {
                addToast('Scheduled time must be at least 1 minute in the future.', 'warning');
                return;
            }
            isoScheduledDate = parsed.toISOString();
        }

        // If submitted by employee or moderator (not sysadmin) and not saving draft, route to approval
        if (finalStatus !== 'Draft' && !canDirectPublish) {
            finalStatus = 'PendingApproval';
        }
        
        setIsPublishing(true);
        try {
            const finalContentHtml = (editorHtml.length > 0 && editorHtml !== '<p><br></p>' && editorHtml !== '<br>')
                ? editorHtml
                : `<p>${editorText.replace(/\n/g, '<br/>')}</p>`;

            const dto = {
                title: title.trim(),
                description: 'No summary provided',
                contentHtml: finalContentHtml,
                categoryId: parseInt(category) || 7,
                status: finalStatus,
                scheduledDate: isoScheduledDate,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                attachmentUrls: []
            };
            
            const savedRes = await saveArticle(dto);
            const savedArticle = savedRes?.data || savedRes;
            const articleId = savedArticle?.articleId || Date.now();

            try {
                sessionStorage.removeItem('knome_cached_articles');
            } catch {}

            window.dispatchEvent(new CustomEvent('article-created'));

            if (finalStatus === 'PendingApproval') {
                const catObj = availableCategories.find(c => String(c.categoryId) === String(category));
                const categoryLabel = catObj?.name || 'General';

                const pendingItem = {
                    id: `pending_article_${articleId}`,
                    articleId: articleId,
                    mediaType: 'Article',
                    title: title.trim(),
                    description: (editorText.length > 200 ? editorText.slice(0, 200) + '...' : editorText) || 'Article submission',
                    category: categoryLabel,
                    tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                    thumbnail: null,
                    authorName: currentUser?.name || currentUser?.fullName || 'Employee',
                    authorId: currentUser?.userId || currentUser?.id,
                    authorAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    submittedDate: new Date().toISOString(),
                    status: 'PendingApproval',
                    contentHtml: finalContentHtml,
                    dto: { ...dto, articleId }
                };

                try {
                    await mediaApi.addPendingApproval(pendingItem);
                } catch (apiErr) {
                    console.warn("Backend media pending submission fallback:", apiErr);
                }

                const existingPending = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
                localStorage.setItem('knome_pending_media_approvals', JSON.stringify([pendingItem, ...existingPending]));
                window.dispatchEvent(new CustomEvent('pending-media-updated', { detail: pendingItem }));

                const modNotif = {
                    id: `notif_approval_${Date.now()}`,
                    type: 'media_approval',
                    category: 'System',
                    text: `${currentUser?.name || 'Employee'} submitted article "${title.trim()}" awaiting moderator approval.`,
                    senderName: currentUser?.name || 'Employee',
                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    targetUserId: 'admin',
                    targetUrl: '/admin-console',
                    unread: true,
                    mediaType: 'Article',
                    pendingId: pendingItem.id
                };
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([modNotif, ...existingNotifs]));

                addToast('Article submitted successfully! It has been sent for approval before going live. 📝', 'success');
            } else if (finalStatus === 'Scheduled') {
                addToast(`Article scheduled for publication on ${formatToDDMMYYYY(scheduledTime)}! ⏰`, 'success');
            } else if (finalStatus === 'Draft') {
                addToast('Article draft saved successfully! 📝', 'success');
            } else {
                if (awardRuleKarma && (currentUser?.userId || currentUser?.id)) {
                    awardRuleKarma(currentUser?.userId || currentUser?.id, 'ARTICLE');
                }
                addToast('Article published successfully! 🎉', 'success');
            }

            if (editorRef.current) {
                editorRef.current.innerHTML = '';
            }

            if (onArticleCreated) onArticleCreated();
            onClose();
        } catch (error) {
            console.error('Failed to process article:', error);
            const errorMsg = error.data?.errors 
                ? Object.values(error.data.errors).flat().join(' ') 
                : (error.data?.message || error.message || 'Failed to process article.');
            addToast('Failed to save article: ' + errorMsg, 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    const modalFooter = (
        <div className="flex flex-wrap justify-between items-center gap-3 w-full">
            <div className="flex items-center gap-2">
                {/* Active Scheduled Pill Chip */}
                {scheduledTime && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-700/60 rounded-xl text-amber-900 dark:text-amber-200 text-xs font-semibold shadow-xs">
                        <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 animate-pulse">schedule</span>
                        <button
                            type="button"
                            onClick={() => setIsScheduling(true)}
                            className="hover:underline flex items-center gap-1.5 cursor-pointer text-left"
                            title="Click to edit schedule"
                        >
                            <span className="font-mono font-bold">{formatToDDMMYYYY(scheduledTime)}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 font-extrabold">
                                {getRelativeScheduleText(scheduledTime)}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setScheduledTime(''); setIsScheduling(false); }}
                            className="ml-0.5 text-amber-600 hover:text-amber-950 dark:hover:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-800/60 p-0.5 rounded-full cursor-pointer transition-colors"
                            title="Remove schedule (publish immediately)"
                        >
                            <span className="material-symbols-outlined text-[15px]">close</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
                {(() => {
                    const textToScan = `${title} ${tags} ${content}`;
                    const restrictedWord = checkRestrictedContent(textToScan);
                    if (restrictedWord) {
                        return (
                            <div className="flex items-center gap-1.5 text-rose-500 text-xs font-semibold px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg">
                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                <span>Restricted word ("{restrictedWord}") detected! Remove it to publish.</span>
                            </div>
                        );
                    }
                    return (
                        <>
                            <button 
                                type="button"
                                onClick={() => handlePublish('Draft')}
                                disabled={isPublishing}
                                className="px-4 py-2 border border-border-subtle text-primary font-label-md hover:bg-surface-container rounded-lg transition-all cursor-pointer disabled:opacity-50"
                            >
                                Save Draft
                            </button>

                            <button 
                                data-schedule-trigger="true"
                                type="button"
                                onClick={() => {
                                    setTempScheduleTime(scheduledTime || '');
                                    setIsScheduling(!isScheduling);
                                }}
                                disabled={isPublishing}
                                className={`px-3 py-2 border rounded-lg font-label-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                    scheduledTime 
                                        ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold' 
                                        : (isScheduling 
                                            ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 text-indigo-600' 
                                            : 'border-border-subtle text-primary hover:bg-surface-container'
                                          )
                                }`}
                                title={scheduledTime ? "Schedule active - click to edit" : (isScheduling ? "Close scheduler" : "Schedule publication")}
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    {scheduledTime ? 'alarm_on' : 'schedule'}
                                </span>
                                <span>{scheduledTime ? 'Scheduled' : 'Schedule'}</span>
                                {scheduledTime && (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping ml-0.5" />
                                )}
                            </button>

                            <button 
                                type="button"
                                onClick={() => handlePublish(scheduledTime ? 'Scheduled' : 'Published')} 
                                disabled={isPublishing}
                                className={`px-5 py-2 font-label-md rounded-lg transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer ${
                                    scheduledTime 
                                        ? 'bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white font-bold shadow-md hover:scale-105' 
                                        : 'bg-electric-blue text-white hover:opacity-90'
                                }`}
                            >
                                {isPublishing ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                        <span>{scheduledTime ? 'Scheduling...' : 'Publishing...'}</span>
                                    </>
                                ) : (
                                    scheduledTime ? (
                                        <>
                                            <span className="material-symbols-outlined text-[17px]">event_available</span>
                                            Schedule Article
                                        </>
                                    ) : (
                                        'Publish Article'
                                    )
                                )}
                            </button>
                        </>
                    );
                })()}
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Article" maxWidth="max-w-4xl" footer={modalFooter}>
            <div className="flex flex-col gap-4 relative">
                
                {/* Meta details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Article Title</label>
                        <input 
                            className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-electric-blue outline-none" 
                            type="text" 
                            placeholder="Enter a descriptive title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <label className="text-label-md font-bold text-slate-gray">Category</label>
                            {isSysAdmin && !isAddingCategory && (
                                <button
                                    type="button"
                                    onClick={() => setIsAddingCategory(true)}
                                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                    <span>+ Add Category</span>
                                </button>
                            )}
                        </div>

                        {isSysAdmin && isAddingCategory && (
                            <div className="mb-2 p-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg flex flex-col gap-2">
                                <input
                                    type="text"
                                    autoFocus
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Category name..."
                                    className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded px-2 py-1 text-xs outline-none"
                                />
                                <div className="flex justify-end gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}
                                        className="px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isSavingCategory || !newCategoryName.trim()}
                                        onClick={handleCreateCategory}
                                        className="px-2.5 py-0.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        )}

                        <select 
                            className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-electric-blue outline-none text-sm"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            {availableCategories.map(cat => (
                                <option key={cat.categoryId} value={String(cat.categoryId)}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Tags (comma separated)</label>
                    <input 
                        className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-electric-blue outline-none" 
                        type="text" 
                        placeholder="e.g. React, Frontend, Best Practices"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                    />
                </div>

                {/* Workable Rich Text Toolbar & Content Area */}
                <div className="border border-border-subtle rounded-lg overflow-hidden flex flex-col mt-2 focus-within:ring-2 focus-within:ring-electric-blue">
                    {/* LinkedIn Article Editor Style Toolbar */}
                    <div className="bg-surface-container flex items-center gap-1 sm:gap-1.5 p-2 border-b border-border-subtle overflow-x-auto select-none">

                        {/* Bold */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('bold')}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${activeFormats.bold ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Bold (Ctrl+B)"
                        >
                            <span className="font-serif font-black text-[13px]">B</span>
                        </button>

                        {/* Italic */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('italic')}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${activeFormats.italic ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Italic (Ctrl+I)"
                        >
                            <span className="font-serif italic font-bold text-[13px]">I</span>
                        </button>

                        <div className="w-px h-4 bg-border-subtle mx-1 shrink-0"></div>

                        {/* Bulleted List */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('list')}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${activeFormats.list ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Bulleted List"
                        >
                            <span className="material-symbols-outlined text-[17px]">format_list_bulleted</span>
                        </button>

                        {/* Numbered List */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('numlist')}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${activeFormats.numlist ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Numbered List"
                        >
                            <span className="material-symbols-outlined text-[17px]">format_list_numbered</span>
                        </button>

                        <div className="w-px h-4 bg-border-subtle mx-1 shrink-0"></div>

                        {/* Quote */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('quote')}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${activeFormats.quote ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Blockquote"
                        >
                            <span className="font-serif text-[18px] font-black leading-none">”</span>
                        </button>



                        {/* Divider */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('divider')}
                            className="w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 text-slate-gray hover:bg-surface-container-high"
                            title="Divider Line"
                        >
                            <span className="font-bold text-[16px] leading-none">—</span>
                        </button>

                        <div className="w-px h-4 bg-border-subtle mx-1 shrink-0"></div>

                        {/* Link */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => {
                                e.preventDefault();
                                saveEditorSelection();
                            }}
                            onClick={openLinkDialog}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${isLinkModalOpen ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Insert Link"
                        >
                            <span className="material-symbols-outlined text-[17px]">link</span>
                        </button>

                        {/* Image / Media */}
                        <button 
                            type="button" 
                            onMouseDown={(e) => {
                                e.preventDefault();
                                saveEditorSelection();
                            }}
                            onClick={openImageDialog}
                            className={`w-7 h-7 rounded transition-colors cursor-pointer flex items-center justify-center shrink-0 ${isImageModalOpen ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs' : 'text-slate-gray hover:bg-surface-container-high'}`}
                            title="Insert Image or Media"
                        >
                            <span className="material-symbols-outlined text-[17px]">add_photo_alternate</span>
                        </button>
                    </div>

                    <div className="relative w-full">
                        <div 
                            ref={editorRef}
                            contentEditable="true"
                            suppressContentEditableWarning={true}
                            className="rich-editor-content w-full min-h-[160px] h-48 sm:h-56 max-h-[320px] overflow-y-auto p-4 bg-surface-container-lowest focus:outline-none font-body-md text-primary"
                            onKeyUp={updateActiveFormats}
                            onMouseUp={updateActiveFormats}
                            onSelect={updateActiveFormats}
                            onInput={(e) => {
                                setContent(e.currentTarget.innerText || '');
                                updateActiveFormats();
                            }}
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
                        ></div>
                        {(!content || content.trim() === '') && (
                            <div 
                                onClick={() => editorRef.current?.focus()}
                                className="absolute top-4 left-4 text-slate-400 dark:text-slate-500 font-body-md pointer-events-none select-none text-sm"
                            >
                                Write your article here... (Markdown supported)
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-surface-container-low text-slate-gray p-2.5 rounded-lg text-xs flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">info</span>
                    <p>Articles are subject to Knome's community guidelines and moderation (FR-SM-06). Scheduled articles remain private until the scheduled date, then publish automatically.</p>
                </div>

                {/* Centered Scheduling Modal with Custom Date & Time Picker */}
                {isScheduling && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                        <div 
                            ref={schedulePopoverRef}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md max-h-[94vh] overflow-y-auto p-4 text-slate-800 dark:text-slate-100 space-y-3.5 custom-scrollbar"
                        >
                            {/* Popover Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                                        <span className="material-symbols-outlined text-[18px]">event_upcoming</span>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                                            Schedule Article Publication
                                        </h4>
                                        <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                            Automated Knome platform delivery
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setIsScheduling(false)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                    title="Close"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            </div>

                            {/* Quick Options */}
                            <div>
                                <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                                    Quick Options:
                                </span>
                                <div className="grid grid-cols-4 gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setTempScheduleTime(getLocalDatetimeInputValue(15))}
                                        className="px-2 py-1.5 bg-slate-100 dark:bg-slate-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 text-slate-700 dark:text-slate-200 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer text-center"
                                    >
                                        +15 Mins
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTempScheduleTime(getLocalDatetimeInputValue(30))}
                                        className="px-2 py-1.5 bg-slate-100 dark:bg-slate-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 text-slate-700 dark:text-slate-200 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer text-center"
                                    >
                                        +30 Mins
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTempScheduleTime(getLocalDatetimeInputValue(60))}
                                        className="px-2 py-1.5 bg-slate-100 dark:bg-slate-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 text-slate-700 dark:text-slate-200 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer text-center"
                                    >
                                        +1 Hour
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTempScheduleTime(getTomorrowTime(9))}
                                        className="px-2 py-1.5 bg-slate-100 dark:bg-slate-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 text-slate-700 dark:text-slate-200 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer text-center"
                                    >
                                        Tomorrow 9 AM
                                    </button>
                                </div>
                            </div>

                            {/* Integrated Interactive Custom Date & Time Picker with OK button */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
                                <CustomDateTimePicker
                                    value={tempScheduleTime}
                                    onChange={(newVal) => setTempScheduleTime(newVal)}
                                    onConfirm={(newVal) => {
                                        const chosenVal = newVal || tempScheduleTime;
                                        if (!chosenVal) {
                                            addToast('Please select a date and time to schedule.', 'error');
                                            return;
                                        }
                                        const chosen = new Date(chosenVal);
                                        if (isNaN(chosen.getTime())) {
                                            addToast('Invalid schedule date/time.', 'error');
                                            return;
                                        }
                                        if (chosen.getTime() <= Date.now()) {
                                            addToast('Scheduled time must be in the future.', 'error');
                                            return;
                                        }
                                        setScheduledTime(chosenVal);
                                        setIsScheduling(false);
                                        addToast(`Article scheduled for ${formatScheduleDisplay(chosenVal)}`, 'success');
                                    }}
                                    onCancel={() => setIsScheduling(false)}
                                    onClear={() => {
                                        setScheduledTime('');
                                        setTempScheduleTime('');
                                        setIsScheduling(false);
                                        addToast('Schedule cleared. Article will publish immediately.', 'info');
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Knome Custom Hyperlink Dialog */}
                {isLinkModalOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                        <div 
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/80">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                                        <span className="material-symbols-outlined text-[18px]">link</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                            Insert Link
                                        </h4>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Add a web reference or document link
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setIsLinkModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                    title="Close"
                                >
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleInsertLink} className="p-5 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                        Link URL <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                                            public
                                        </span>
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="https://example.com"
                                            value={linkUrl}
                                            onChange={(e) => setLinkUrl(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                        Text to Display
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Knome Documentation"
                                        value={linkText}
                                        onChange={(e) => setLinkText(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                    />
                                    <p className="text-[10.5px] text-slate-400 mt-1">
                                        Leave blank to display the URL directly
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        id="openInNewTabCheckbox"
                                        type="checkbox"
                                        checked={linkOpenInNewTab}
                                        onChange={(e) => setLinkOpenInNewTab(e.target.checked)}
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 dark:bg-slate-900 cursor-pointer"
                                    />
                                    <label htmlFor="openInNewTabCheckbox" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                        Open link in a new tab
                                    </label>
                                </div>

                                {/* Footer Buttons */}
                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                                    <button
                                        type="button"
                                        onClick={() => setIsLinkModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!linkUrl.trim() || linkUrl.trim() === 'https://'}
                                        className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add_link</span>
                                        <span>Insert Link</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Knome Custom Media & Image Dialog */}
                {isImageModalOpen && (
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                        <div 
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/80 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                                        <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                            Insert Media & Images
                                        </h4>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Upload an image from your computer or link an online image
                                        </p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => { if (!isUploadingImage) setIsImageModalOpen(false); }}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                    title="Close"
                                >
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>

                            {/* Tab switchers: Upload file vs Image URL */}
                            <div className="px-5 pt-3 shrink-0">
                                <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                                    <button
                                        type="button"
                                        onClick={() => setImageTab('upload')}
                                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            imageTab === 'upload' 
                                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">upload_file</span>
                                        <span>Upload File</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setImageTab('url')}
                                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            imageTab === 'url' 
                                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs' 
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">link</span>
                                        <span>Image Web URL</span>
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <form onSubmit={handleInsertImage} className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
                                {imageTab === 'upload' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Select Image File
                                        </label>
                                        {!imagePreviewUrl ? (
                                            <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 dark:bg-slate-900/40 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all group">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            if (file.size > 25 * 1024 * 1024) {
                                                                addToast('Image size exceeds 25MB limit', 'error');
                                                                return;
                                                            }
                                                            setImageFile(file);
                                                            setImagePreviewUrl(URL.createObjectURL(file));
                                                            if (!imageCaption) {
                                                                setImageCaption(file.name.replace(/\.[^/.]+$/, ''));
                                                            }
                                                        }
                                                    }}
                                                />
                                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined text-[26px]">cloud_upload</span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                    Click to browse or drop image here
                                                </p>
                                                <p className="text-[11px] text-slate-400 mt-1">
                                                    Supports PNG, JPG, JPEG, GIF, WebP (Max 25MB)
                                                </p>
                                            </label>
                                        ) : (
                                            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-2.5">
                                                <div className="max-h-44 overflow-hidden rounded-xl flex items-center justify-center bg-black/5 dark:bg-black/20">
                                                    <img
                                                        src={imagePreviewUrl}
                                                        alt="Preview"
                                                        className="max-h-44 w-auto object-contain rounded-lg shadow-sm"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between pt-2.5 px-1">
                                                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate max-w-[220px]">
                                                        {imageFile?.name} ({(imageFile?.size / 1024 / 1024).toFixed(2)} MB)
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setImageFile(null);
                                                            setImagePreviewUrl(null);
                                                        }}
                                                        className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[15px]">delete</span>
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Image Web URL <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                                                image
                                            </span>
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="https://example.com/photo.jpg"
                                                value={imageUrl}
                                                onChange={(e) => setImageUrl(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                            />
                                        </div>

                                        {imageUrl && imageUrl.trim().length > 10 && (
                                            <div className="mt-2.5 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col items-center">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 self-start">
                                                    Image Preview:
                                                </span>
                                                <img
                                                    src={imageUrl.trim()}
                                                    alt="Live Preview"
                                                    className="max-h-36 rounded-lg object-contain shadow-xs"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                    onLoad={(e) => {
                                                        e.target.style.display = 'block';
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Caption / Alt text */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                        Image Caption / Description (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Figure 1: Architecture diagram"
                                        value={imageCaption}
                                        onChange={(e) => setImageCaption(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                    />
                                </div>

                                {isUploadingImage && (
                                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3">
                                        <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                            Uploading image to Knome media storage... {uploadProgress > 0 ? `${uploadProgress}%` : ''}
                                        </span>
                                    </div>
                                )}

                                {/* Footer Buttons */}
                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700/60 shrink-0">
                                    <button
                                        type="button"
                                        disabled={isUploadingImage}
                                        onClick={() => setIsImageModalOpen(false)}
                                        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUploadingImage || (imageTab === 'upload' ? !imageFile : (!imageUrl || !imageUrl.trim()))}
                                        className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                                    >
                                        {isUploadingImage ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                <span>Uploading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                                                <span>Insert Image</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

