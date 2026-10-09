import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { postsApi, mediaApi, communitiesApi, profileApi, notificationsApi, formatToDDMMYYYY } from '../../utils/apiService';
import { apiClient } from '../../utils/apiClient';
import { checkRestrictedContent, syncRestrictedWordsFromBackend, addRestrictedWord } from '../../utils/restrictedWords';
import { 
    getUserDraft, 
    saveUserDraft, 
    clearUserDraft, 
    deleteDraft, 
    formatDraftTimeAgo,
    getActiveComposerScratchpad,
    saveActiveComposerScratchpad,
    clearActiveComposerScratchpad,
    removeDraftFromLocalPosts
} from '../../utils/draftManager';
import ImageCropModal from './ImageCropModal';
import CustomDateTimePicker from '../widgets/CustomDateTimePicker';
import HighlightText from '../ui/HighlightText';

const PREDEFINED_HASHTAGS = ['Announcement', 'Development', 'Design', 'Marketing', 'Help', 'Kudos', 'Team', 'Project'];

const DEFAULT_COMMUNITIES = [
    { id: 184, name: 'sql first' },
    { id: 183, name: 'All department' },
    { id: 176, name: 'DevOps & AI Innovation Hub' },
    { id: 165, name: 'tech' }
];

const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

// Clean format helper for schedule display without dd/mm/yyyy labels
export const formatScheduleDisplay = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${day} ${month} ${year}, ${pad(hours)}:${minutes} ${ampm}`;
};

export default function CreatePostModal({ isOpen, onClose, onPostCreated, draftToEdit = null }) {
    const { currentUser, users, awardRuleKarma, refreshKarma } = useUser();
    const { addToast } = useToast();
    const currentUserId = currentUser?.userId || currentUser?.id;
    
    // Core post form state
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [audience, setAudience] = useState('Everyone');
    const [selectedCommunity, setSelectedCommunity] = useState(null);
    const [selectedConnections, setSelectedConnections] = useState([]);
    const [isAudienceMenuOpen, setIsAudienceMenuOpen] = useState(false);
    const [audienceSubView, setAudienceSubView] = useState(null); // null | 'communities' | 'connections'
    const [audienceSearch, setAudienceSearch] = useState('');
    const [availableCommunities, setAvailableCommunities] = useState(DEFAULT_COMMUNITIES);
    const [allColleagues, setAllColleagues] = useState(users || []);
    const audienceMenuRef = useRef(null);

    // LinkedIn-Style Draft State
    const [activeDraftId, setActiveDraftId] = useState(null);
    const [isDraftMode, setIsDraftMode] = useState(false);
    const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | 'saving' | 'saved'
    const [lastSavedTime, setLastSavedTime] = useState(null);
    const [isDiscarding, setIsDiscarding] = useState(false);
    const isDirtyRef = useRef(false);
    const autoSaveTimerRef = useRef(null);

    // Debounced Auto-Save
    const triggerAutoSave = (newText, newAttachments, newAudience, newCommunity, newConnections, newSchedTime) => {
        if (!isOpen || isPublishing || !currentUserId) return;
        
        const hasContent = (newText && newText.trim().length > 0) || (newAttachments && newAttachments.length > 0);
        if (!hasContent) {
            setAutoSaveStatus(null);
            clearActiveComposerScratchpad(currentUserId);
            return;
        }

        isDirtyRef.current = true;
        setAutoSaveStatus('saving');
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        autoSaveTimerRef.current = setTimeout(() => {
            if (activeDraftId) {
                // If editing an existing official draft, update that draft
                const saved = saveUserDraft(currentUserId, {
                    id: activeDraftId,
                    text: newText,
                    attachments: newAttachments,
                    audience: newAudience,
                    selectedCommunity: newCommunity,
                    selectedConnections: newConnections,
                    scheduledTime: newSchedTime
                });

                if (saved) {
                    setLastSavedTime(saved.updatedAt || new Date().toISOString());
                    setAutoSaveStatus('saved');
                    isDirtyRef.current = false;
                }
            } else {
                // Composing a new post: save on Create Post ONLY (scratchpad), do NOT save into Drafts!
                const saved = saveActiveComposerScratchpad(currentUserId, {
                    text: newText,
                    attachments: newAttachments,
                    audience: newAudience,
                    selectedCommunity: newCommunity,
                    selectedConnections: newConnections,
                    scheduledTime: newSchedTime
                });

                if (saved) {
                    setLastSavedTime(saved.savedAt || new Date().toISOString());
                    setAutoSaveStatus('saved');
                    isDirtyRef.current = false;
                }
            }
        }, 1500);
    };

    const toggleConnection = (userObj) => {
        setSelectedConnections(prev => {
            const exists = prev.some(c => String(c.id) === String(userObj.id));
            let next;
            let nextAudience = audience;
            if (exists) {
                next = prev.filter(c => String(c.id) !== String(userObj.id));
                if (next.length === 0) nextAudience = 'Everyone';
            } else {
                nextAudience = 'Connections';
                next = [...prev, userObj];
            }
            if (nextAudience !== audience) setAudience(nextAudience);
            if (!exists) setSelectedCommunity(null);
            triggerAutoSave(text, attachments, nextAudience, null, next, scheduledTime);
            return next;
        });
    };

    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduledTime, setScheduledTime] = useState('');
    const [tempScheduleTime, setTempScheduleTime] = useState('');
    const [cropModalTarget, setCropModalTarget] = useState(null);
    const schedulePopoverRef = useRef(null);

    const handleCropSave = (newBlob, newUrl, newFile) => {
        if (!cropModalTarget) return;
        setAttachments(prev => {
            const nextAtts = prev.map(a => {
                if (a.id === cropModalTarget.id) {
                    if (a.url && a.url.startsWith('blob:') && a.url !== newUrl) {
                        try { URL.revokeObjectURL(a.url); } catch (e) {}
                    }
                    return {
                        ...a,
                        url: newUrl,
                        file: newFile,
                        size: newBlob.size,
                        backendUrl: null
                    };
                }
                return a;
            });
            triggerAutoSave(text, nextAtts, audience, selectedCommunity, selectedConnections, scheduledTime);
            return nextAtts;
        });
        setCropModalTarget(null);
        addToast('Image cropped and rotated successfully!', 'success');
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

    // Format local system time for datetime-local input (offset in minutes, defaults to 1 minute ahead)
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
    
    // Mention & Hashtag state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);
    const [showHashtagDropdown, setShowHashtagDropdown] = useState(false);
    const [hashtagFilter, setHashtagFilter] = useState('');
    const [hashtagIndex, setHashtagIndex] = useState(0);
    const textareaRef = useRef(null);

    // Drag & Drop
    const [isDragging, setIsDragging] = useState(false);

    // Security Scan State
    const [isScanning, setIsScanning] = useState(false);
    const [securityWarning, setSecurityWarning] = useState(null);
    const [scanComplete, setScanComplete] = useState(false);
    const [fileError, setFileError] = useState(null);

    // Publish state
    const [isPublishing, setIsPublishing] = useState(false);
    const fileInputRef = useRef(null);
    const [currentUploadType, setCurrentUploadType] = useState(null);

    const MAX_CHARS = 400;

    // Sync users roster into allColleagues
    useEffect(() => {
        if (users && users.length > 0) {
            setAllColleagues(prev => {
                const map = new Map();
                users.forEach(u => map.set(String(u.id || u.userId), u));
                prev.forEach(u => map.set(String(u.id || u.userId), u));
                return Array.from(map.values());
            });
        }
    }, [users]);

    // Load available communities and real DB colleagues
    useEffect(() => {
        const loadAudienceData = async () => {
            try {
                const res = await communitiesApi.getAll();
                if (res && Array.isArray(res) && res.length > 0) {
                    const mapped = res.map(c => ({
                        id: c.communityId || c.id,
                        name: c.name,
                        type: c.communityType || c.type,
                        category: c.categoryName || c.category
                    }));
                    setAvailableCommunities(mapped);
                } else {
                    setAvailableCommunities(DEFAULT_COMMUNITIES);
                }
            } catch (e) {
                setAvailableCommunities(DEFAULT_COMMUNITIES);
            }

            try {
                const uRes = await profileApi.search('');
                const rawList = Array.isArray(uRes) ? uRes : (uRes?.data || uRes?.items || []);
                if (rawList && rawList.length > 0) {
                    setAllColleagues(prev => {
                        const map = new Map();
                        (users || []).forEach(u => map.set(String(u.id || u.userId), u));
                        prev.forEach(u => map.set(String(u.id || u.userId), u));
                        rawList.forEach(u => {
                            const uId = u.userId || u.id;
                            const uName = u.fullName || u.name || u.authorFullName || u.title || 'Colleague';
                            if (uId) {
                                map.set(String(uId), {
                                    id: uId,
                                    userId: uId,
                                    employeeId: u.employeeId || u.authorEmployeeId || `EMP${uId}`,
                                    name: uName,
                                    fullName: uName,
                                    designation: u.designation || u.summary || 'Employee',
                                    roleName: u.roleName || u.role || 'Employee',
                                    avatar: u.profilePhotoUrl || u.thumbnailUrl || null
                                });
                            }
                        });
                        return Array.from(map.values());
                    });
                }
            } catch (e) {}
        };
        if (isOpen) {
            loadAudienceData();
        }
    }, [isOpen, users]);

    // Close audience menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (audienceMenuRef.current && !audienceMenuRef.current.contains(e.target)) {
                setIsAudienceMenuOpen(false);
                setAudienceSubView(null);
                setAudienceSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const resetForm = () => {
        setText('');
        attachments.forEach(a => {
            if (a.url?.startsWith('blob:')) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(a.url); } catch (e) {}
                }, 3000);
            }
        });
        setAttachments([]);
        setAudience('Everyone');
        setSelectedCommunity(null);
        setSelectedConnections([]);
        setIsAudienceMenuOpen(false);
        setAudienceSubView(null);
        setAudienceSearch('');
        setIsScheduling(false);
        setScheduledTime('');
        setShowMentionDropdown(false);
        setShowHashtagDropdown(false);
        setSecurityWarning(null);
        setScanComplete(false);
        setFileError(null);
        setActiveDraftId(null);
        setIsDraftMode(false);
        setAutoSaveStatus(null);
        setLastSavedTime(null);
        isDirtyRef.current = false;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };

    // Load active draft or composer scratchpad on open, or clear state on close
    useEffect(() => {
        if (!isOpen) {
            resetForm();
            return;
        }

        if (draftToEdit) {
            // Explicitly editing a draft selected from the Drafts tab
            setText(draftToEdit.text || draftToEdit.content || draftToEdit.contentText || '');
            setAttachments(draftToEdit.attachments || draftToEdit.postAttachments || []);
            setAudience(draftToEdit.audience || draftToEdit.audienceType || 'Everyone');
            setSelectedCommunity(draftToEdit.selectedCommunity || (draftToEdit.communityId ? { id: draftToEdit.communityId, name: draftToEdit.communityName } : null));
            setSelectedConnections(draftToEdit.selectedConnections || draftToEdit.sharedUsers || []);
            setScheduledTime(draftToEdit.scheduledTime || draftToEdit.scheduledDate || '');
            setActiveDraftId(draftToEdit.id || draftToEdit.postId || null);
            setIsDraftMode(true);
            setLastSavedTime(draftToEdit.updatedAt || draftToEdit.savedAt || draftToEdit.createdDate || new Date().toISOString());
            setAutoSaveStatus('saved');
            isDirtyRef.current = false;
        } else {
            // Opened Create Post normally: restore uncommitted in-progress scratchpad if any
            const scratchpad = currentUserId ? getActiveComposerScratchpad(currentUserId) : null;
            if (scratchpad) {
                setText(scratchpad.text || '');
                setAttachments(scratchpad.attachments || []);
                setAudience(scratchpad.audience || 'Everyone');
                setSelectedCommunity(scratchpad.selectedCommunity || null);
                setSelectedConnections(scratchpad.selectedConnections || []);
                setScheduledTime(scratchpad.scheduledTime || '');
                setActiveDraftId(null);
                setIsDraftMode(false);
                setLastSavedTime(scratchpad.savedAt || new Date().toISOString());
                setAutoSaveStatus('saved');
                isDirtyRef.current = false;
            } else {
                resetForm();
            }
        }

        // Live sync restricted keywords directly from SQL Server database table RestrictedKeywords
        syncRestrictedWordsFromBackend().then(() => {
            if (text) {
                const found = checkRestrictedContent(text);
                if (found) {
                    setSecurityWarning(`Security Alert: Please don't use this word - "${found}". It is restricted and cannot be published.`);
                }
            }
        });
    }, [isOpen, draftToEdit, currentUserId]);

    const handleClose = () => {
        if (isPublishing) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        const hasContent = text.trim().length > 0 || attachments.length > 0;
        if (hasContent && currentUserId) {
            if (activeDraftId) {
                // If editing an existing official draft, update it
                saveUserDraft(currentUserId, {
                    id: activeDraftId,
                    text,
                    attachments,
                    audience,
                    selectedCommunity,
                    selectedConnections,
                    scheduledTime
                });
            } else {
                // Save on Create Post ONLY - do NOT save inside official Drafts!
                saveActiveComposerScratchpad(currentUserId, {
                    text,
                    attachments,
                    audience,
                    selectedCommunity,
                    selectedConnections,
                    scheduledTime
                });
            }
        } else if (!hasContent) {
            if (activeDraftId && currentUserId) {
                deleteDraft(currentUserId, activeDraftId, postsApi);
            }
            clearActiveComposerScratchpad(currentUserId);
        }

        resetForm();
        onClose();
    };

    const handleDiscardDraft = async () => {
        if (!window.confirm('Discard this post? All progress will be removed.')) return;
        setIsDiscarding(true);
        try {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            if (currentUserId) {
                clearActiveComposerScratchpad(currentUserId);
                if (activeDraftId) {
                    await deleteDraft(currentUserId, activeDraftId, postsApi);
                } else {
                    clearUserDraft(currentUserId);
                }
            }
            resetForm();
            addToast('Draft discarded', 'info');
            onClose();
        } finally {
            setIsDiscarding(false);
        }
    };

    // Handle Text Change & Features
    const handleTextChange = (e) => {
        const val = e.target.value;
        if (val.length <= MAX_CHARS) {
            setText(val);
            triggerAutoSave(val, attachments, audience, selectedCommunity, selectedConnections, scheduledTime);
        }

        // Mention & Hashtag Logic Trigger
        const lastWord = val.split(/[\s\n]+/).pop();
        if (lastWord.startsWith('@')) {
            setShowMentionDropdown(true);
            setMentionFilter(lastWord.slice(1).toLowerCase());
            setShowHashtagDropdown(false);
        } else if (lastWord.startsWith('#')) {
            setShowHashtagDropdown(true);
            setHashtagFilter(lastWord.slice(1).toLowerCase());
            setShowMentionDropdown(false);
        } else {
            setShowMentionDropdown(false);
            setShowHashtagDropdown(false);
        }

        // Real-time Immediate Validation for Restricted Keywords (Synchronous + Database synced)
        const immediateRestricted = checkRestrictedContent(val);
        if (immediateRestricted) {
            setSecurityWarning(`Security Alert: Please don't use this word - "${immediateRestricted}". It is restricted and cannot be published.`);
        } else if (val.toLowerCase().includes('malicious.com') || val.toLowerCase().includes('scam-link.net')) {
            setSecurityWarning('Security Alert: This URL is flagged as potentially malicious and cannot be published.');
        } else {
            setSecurityWarning(null);

            // Debounced Live Backend Validation Check against SQL Server Database
            if (val.trim().length >= 3) {
                clearTimeout(window.__knome_security_debounce);
                window.__knome_security_debounce = setTimeout(async () => {
                    try {
                        const secRes = await apiClient.post('/interactions/validate-security', { text: val });
                        const secData = secRes?.data || secRes;
                        if (secData && secData.isValid === false) {
                            const term = (secData.restrictedKeywordsFound && secData.restrictedKeywordsFound[0]) || (secData.blockedUrlsFound && secData.blockedUrlsFound[0]) || 'restricted term';
                            setSecurityWarning(`Security Alert: Please don't use this word - "${term}". It is restricted and cannot be published.`);
                            addRestrictedWord(term);
                        }
                    } catch (e) {
                        // ignore background check network errors
                    }
                }, 300);
            }
        }
    };

    const runSecurityScan = (content) => {
        const foundKeyword = checkRestrictedContent(content);
        if (foundKeyword) {
            setSecurityWarning(`Security Alert: Please don't use this word - "${foundKeyword}". It is restricted and cannot be published.`);
        }
    };

    const insertMention = (user) => {
        const words = text.split(/([\s\n]+)/); // Split keeping whitespace
        const nonWhitespaceWords = words.filter(w => w.trim().length > 0);
        const lastIndex = text.lastIndexOf(nonWhitespaceWords[nonWhitespaceWords.length - 1]);
        const newText = text.substring(0, lastIndex) + `@${user.name} `;
        if (newText.length <= MAX_CHARS) {
            setText(newText);
            triggerAutoSave(newText, attachments, audience, selectedCommunity, selectedConnections, scheduledTime);
        }
        setShowMentionDropdown(false);
        textareaRef.current?.focus();
    };

    const insertHashtag = (tag) => {
        const words = text.split(/([\s\n]+)/);
        const nonWhitespaceWords = words.filter(w => w.trim().length > 0);
        const lastIndex = text.lastIndexOf(nonWhitespaceWords[nonWhitespaceWords.length - 1]);
        const newText = text.substring(0, lastIndex) + `#${tag} `;
        if (newText.length <= MAX_CHARS) {
            setText(newText);
            triggerAutoSave(newText, attachments, audience, selectedCommunity, selectedConnections, scheduledTime);
        }
        setShowHashtagDropdown(false);
        textareaRef.current?.focus();
    };

    const triggerFileInput = (type) => {
        if (attachments.length >= 4) return;
        setCurrentUploadType(type);
        if (fileInputRef.current) {
            const acceptMap = {
                image: 'image/jpeg,image/png,image/gif,image/webp',
                video: 'video/mp4,video/quicktime,video/x-msvideo',
                audio: 'audio/mpeg,audio/wav,audio/aac,audio/ogg',
                doc: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip,application/x-zip-compressed'
            };
            fileInputRef.current.accept = acceptMap[type] || '*/*';
            fileInputRef.current.click();
        }
    };

    const determineFileType = (file) => {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        return 'doc';
    };

const FILE_LIMITS = {
    image: { maxBytes: 100 * 1024 * 1024, maxDisplay: '100 MB', label: 'Image' },
    doc: { maxBytes: 400 * 1024 * 1024, maxDisplay: '400 MB', label: 'Document' },
    video: { maxBytes: 500 * 1024 * 1024, maxDisplay: '500 MB', label: 'Video' },
    audio: { maxBytes: 100 * 1024 * 1024, maxDisplay: '100 MB', label: 'Audio' }
};

    const processFiles = (files, overrideType) => {
        if (!files || files.length === 0) return;
        setFileError(null);
        const newAttachments = [];
        let remainingSlots = 4 - attachments.length;

        if (remainingSlots <= 0) {
            const limitMsg = 'You can attach a maximum of 4 files per post.';
            setFileError(limitMsg);
            addToast(limitMsg, 'warning');
            return;
        }

        Array.from(files).slice(0, remainingSlots).forEach(file => {
            const type = overrideType || determineFileType(file);
            const limitConfig = FILE_LIMITS[type] || FILE_LIMITS.doc;

            if (file.size > limitConfig.maxBytes) {
                const formattedActual = formatSize(file.size);
                const errorMsg = `File "${file.name}" (${formattedActual}) exceeds the ${limitConfig.maxDisplay} maximum size limit for ${limitConfig.label} files.`;
                setFileError(errorMsg);
                addToast(errorMsg, 'error');
                return;
            }

            const localPreviewUrl = URL.createObjectURL(file);
            newAttachments.push({
                id: Date.now() + Math.random(),
                type,
                name: file.name,
                url: localPreviewUrl,
                file: file,
                size: file.size,
                backendUrl: null,
                isUploading: false,
                progress: 0
            });
        });
        
        if (newAttachments.length > 0) {
            setAttachments(prev => {
                const combined = [...prev, ...newAttachments];
                triggerAutoSave(text, combined, audience, selectedCommunity, selectedConnections, scheduledTime);
                return combined;
            });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileChange = (e) => {
        processFiles(e.target.files, currentUploadType);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFiles(e.dataTransfer.files, null);
    };

    const removeAttachment = (id) => {
        setAttachments(prev => {
            const att = prev.find(a => a.id === id);
            if (att?.url?.startsWith('blob:')) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(att.url); } catch (e) {}
                }, 3000);
            }
            const remaining = prev.filter(a => a.id !== id);
            triggerAutoSave(text, remaining, audience, selectedCommunity, selectedConnections, scheduledTime);
            return remaining;
        });
    };

    const handleSubmit = async (status = 'Published') => {
        // Fast path for explicit Save as Draft
        if (status === 'Draft') {
            if (securityWarning || isPublishing) return;
            const hasContent = text.trim().length > 0 || attachments.length > 0;
            if (!hasContent) {
                addToast('Cannot save an empty draft.', 'warning');
                return;
            }

            setIsPublishing(true);
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

            try {
                let savedId = activeDraftId;
                const isNumericId = /^\d+$/.test(String(activeDraftId));
                
                const payload = {
                    contentText: text,
                    audienceType: selectedCommunity ? 'Community' : (selectedConnections.length > 0 ? 'Connections' : 'Everyone'),
                    status: 'Draft',
                    scheduledDate: null,
                    attachmentUrls: attachments.map(a => a.backendUrl || a.url),
                    attachmentTypes: attachments.map(a => a.type === 'doc' ? 'Document' : a.type === 'image' ? 'Image' : a.type === 'video' ? 'Video' : 'Audio'),
                    mentionedUserIds: [],
                    audienceUserIds: selectedConnections.map(c => c.id),
                    audienceCommunityIds: selectedCommunity ? [selectedCommunity.id] : []
                };

                if (isNumericId) {
                    try {
                        await postsApi.update(activeDraftId, payload);
                    } catch (e) {
                        console.warn('Backend draft update notice:', e);
                    }
                } else {
                    try {
                        const apiRes = await postsApi.create(payload);
                        const created = apiRes?.data || apiRes;
                        if (created?.postId || created?.id) {
                            savedId = created.postId || created.id;
                        }
                    } catch (e) {
                        console.warn('Backend draft create notice, saved locally:', e);
                    }
                }

                clearActiveComposerScratchpad(currentUserId);
                saveUserDraft(currentUserId, {
                    id: savedId,
                    postId: typeof savedId === 'number' ? savedId : null,
                    text,
                    attachments,
                    audience,
                    selectedCommunity,
                    selectedConnections,
                    scheduledTime
                });

                addToast('Draft saved successfully. 📝', 'success');
                window.dispatchEvent(new CustomEvent('knome_drafts_updated'));
                window.dispatchEvent(new CustomEvent('post-created'));
                resetForm();
                if (onPostCreated) onPostCreated();
                onClose();
            } catch (err) {
                console.error('Failed to save draft:', err);
                addToast(err?.message || 'Failed to save draft', 'error');
            } finally {
                setIsPublishing(false);
            }
            return;
        }

        // 1. Check synchronous restricted words
        const foundKeyword = checkRestrictedContent(text);
        if (foundKeyword) {
            setSecurityWarning(`Security Alert: Please don't use this word - "${foundKeyword}". It is restricted and cannot be published.`);
            addToast(`Security Alert: Content contains restricted word "${foundKeyword}". Post cannot be published.`, 'warning');
            return;
        }

        // 2. Perform live security check against SQL Server database before starting upload/publish
        try {
            const secRes = await apiClient.post('/interactions/validate-security', { text: text });
            const secData = secRes?.data || secRes;
            if (secData && secData.isValid === false) {
                const badTerm = (secData.restrictedKeywordsFound && secData.restrictedKeywordsFound[0]) || (secData.blockedUrlsFound && secData.blockedUrlsFound[0]) || 'restricted term';
                setSecurityWarning(`Security Alert: Please don't use this word - "${badTerm}". It is restricted and cannot be published.`);
                addToast(`Security Alert: Content contains restricted word "${badTerm}". Post cannot be published.`, 'warning');
                addRestrictedWord(badTerm);
                return;
            }
        } catch (secErr) {
            console.warn('Pre-publish security scan warning:', secErr);
        }

        if (securityWarning || isPublishing) return;
        setIsPublishing(true);

        try {
            // Upload pending files first
            const updatedAttachments = [...attachments];
            for (let i = 0; i < updatedAttachments.length; i++) {
                let att = updatedAttachments[i];
                if (!att.backendUrl && att.file) {
                    setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, isUploading: true, progress: 0 } : a));
                    
                    try {
                        const result = await mediaApi.uploadFile(att.file, att.type, (percent) => {
                            setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, progress: percent } : a));
                        });
                        att.backendUrl = result.fileUrl || result.url;
                        
                        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, backendUrl: att.backendUrl, isUploading: false, progress: 100 } : a));
                    } catch (err) {
                        console.error('File upload failed', err);
                        addToast(`Failed to upload ${att.name}`, 'error');
                        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, isUploading: false, error: true } : a));
                        throw new Error('Upload aborted due to file error');
                    }
                }
            }

            let isoScheduledDate = null;
            if (status === 'Scheduled') {
                if (!scheduledTime) {
                    addToast('Please select a scheduled date and time.', 'error');
                    setIsPublishing(false);
                    return;
                }
                const parsed = new Date(scheduledTime);
                if (isNaN(parsed.getTime())) {
                    addToast('Invalid scheduled date/time selected.', 'error');
                    setIsPublishing(false);
                    return;
                }
                if (parsed.getTime() <= Date.now() + 20000) {
                    addToast('Scheduled time must be at least 1 minute in the future.', 'error');
                    setIsPublishing(false);
                    return;
                }
                isoScheduledDate = parsed.toISOString();
            }

            const payload = {
                contentText: text,
                audienceType: selectedCommunity ? 'Community' : (selectedConnections.length > 0 ? 'Connections' : 'Everyone'),
                status: status,
                scheduledDate: isoScheduledDate,
                attachmentUrls: updatedAttachments.map(a => a.backendUrl || a.url),
                attachmentTypes: updatedAttachments.map(a => a.type === 'doc' ? 'Document' : a.type === 'image' ? 'Image' : a.type === 'video' ? 'Video' : 'Audio'),
                mentionedUserIds: [], // Extension point
                audienceUserIds: selectedConnections.map(c => c.id),
                audienceCommunityIds: selectedCommunity ? [selectedCommunity.id] : [],
                sharedCommunity: selectedCommunity,
                sharedCommunityName: selectedCommunity?.name,
                sharedUsers: selectedConnections,
                sharedWithNames: selectedConnections.map(c => c.name),
                sharedWithName: selectedConnections.length === 1 
                    ? selectedConnections[0].name 
                    : (selectedConnections.length === 2 
                    ? `${selectedConnections[0].name}, ${selectedConnections[1].name}` 
                    : (selectedConnections.length > 2 ? `${selectedConnections[0].name} +${selectedConnections.length - 1} others` : null))
            };

            let createdPostId = activeDraftId;
            const isNumericActiveDraft = /^\d+$/.test(String(activeDraftId));
            let publishSucceededOnBackend = false;

            if (isNumericActiveDraft) {
                try {
                    const apiRes = await postsApi.update(activeDraftId, payload);
                    const updatedPost = apiRes?.data || apiRes;
                    createdPostId = updatedPost?.postId || updatedPost?.id || activeDraftId;
                    publishSucceededOnBackend = true;
                } catch (err) {
                    const errMsg = err?.response?.data?.message || err?.message || '';
                    if (errMsg.toLowerCase().includes('restricted') || errMsg.toLowerCase().includes('blocked') || (err?.response?.status === 400 && errMsg)) {
                        setSecurityWarning(`Security Alert: ${errMsg}`);
                        addToast(`Security Alert: ${errMsg}`, 'error');
                        setIsPublishing(false);
                        return;
                    }
                    console.warn('API post update failed, falling back to create:', err);
                }
            }

            if (!publishSucceededOnBackend) {
                try {
                    const apiRes = await postsApi.create(payload);
                    const createdPost = apiRes?.data || apiRes;
                    createdPostId = createdPost?.postId || createdPost?.id;
                } catch (err) {
                    const errMsg = err?.response?.data?.message || err?.message || '';
                    if (errMsg.toLowerCase().includes('restricted') || errMsg.toLowerCase().includes('blocked') || (err?.response?.status === 400 && errMsg)) {
                        setSecurityWarning(`Security Alert: ${errMsg}`);
                        addToast(`Security Alert: ${errMsg}`, 'error');
                        setIsPublishing(false);
                        return;
                    }
                    console.warn('API post creation notice, using local post fallback:', err);
                    createdPostId = `post_local_${Date.now()}`;
                    const realAuthorName = currentUser?.fullName || currentUser?.name || 'Employee';
                    const localPost = {
                        id: createdPostId,
                        userId: currentUser?.userId || currentUser?.id || 1,
                        authorUserId: currentUser?.userId || currentUser?.id || 1,
                        authorEmployeeId: currentUser?.employeeId || '',
                        authorName: realAuthorName,
                        authorFullName: realAuthorName,
                        authorAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                        authorRole: currentUser?.roleName || currentUser?.designation || 'Contributor',
                        content: text,
                        status: status,
                        scheduledDate: isoScheduledDate,
                        publishedDate: status === 'Published' ? new Date().toISOString() : null,
                        createdDate: new Date().toISOString(),
                        likesCount: 0,
                        commentsCount: 0,
                        attachments: attachments,
                        audienceType: payload.audienceType,
                        communityId: selectedCommunity?.id || null,
                        communityName: selectedCommunity?.name || null,
                        sharedCommunity: selectedCommunity,
                        sharedCommunityName: selectedCommunity?.name,
                        sharedUsers: selectedConnections,
                        sharedWithNames: selectedConnections.map(c => c.name || c.fullName),
                        sharedWithName: payload.sharedWithName
                    };
                    try {
                        const existing = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                        localStorage.setItem('knome_local_posts', JSON.stringify([localPost, ...existing]));
                    } catch (e) {}
                }
            }

            // Post published or scheduled: clean up user draft and composer scratchpad
            clearActiveComposerScratchpad(currentUserId);
            clearUserDraft(currentUserId);
            if (activeDraftId) {
                removeDraftFromLocalPosts(activeDraftId);
            }
            try {
                const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_post_ids') || '[]');
                const filteredDeleted = deletedIds.filter(id => String(id) !== String(createdPostId) && String(id) !== String(activeDraftId));
                localStorage.setItem('knome_deleted_post_ids', JSON.stringify(filteredDeleted));
            } catch (e) {}
            window.dispatchEvent(new CustomEvent('knome_drafts_updated'));

            // Also persist directly to community feed so it is immediately visible and stays visible on refresh (only if not a draft)
            if (selectedCommunity?.id && status !== 'Draft') {
                try {
                    const commPostKey = `knome_community_posts_${selectedCommunity.id}`;
                    const existingCommPosts = JSON.parse(localStorage.getItem(commPostKey) || '[]');
                    const commPostItem = {
                        id: createdPostId || Date.now(),
                        author: currentUser?.name || currentUser?.fullName || 'Employee',
                        role: currentUser?.roleName || 'Member',
                        avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                        time: 'Just now',
                        content: text,
                        attachments: attachments || [],
                        images: (attachments || []).filter(a => a.type === 'image' || a.attachmentType === 'image'),
                        likes: 0,
                        comments: 0,
                        isPinned: false
                    };
                    localStorage.setItem(commPostKey, JSON.stringify([commPostItem, ...existingCommPosts]));
                } catch (e) {}
            }

            // Generate real-time & persistent notifications for Everyone, Specific Community, and Specific Connections (only if not draft)
            if (status !== 'Draft') {
                const authorName = currentUser?.name || currentUser?.fullName || 'Employee';
                const authorId = currentUser?.userId || currentUser?.id;
                const snippet = text.length > 60 ? text.substring(0, 57) + '...' : text;
                const nowIso = new Date().toISOString();
                const newNotifs = [];

                if (selectedCommunity) {
                    // Scenario 2: Specific Community
                    const notifMsg = `${authorName} posted in ${selectedCommunity.name}: "${snippet}"`;
                    try {
                        const commMembers = await communitiesApi.getMembers(selectedCommunity.id).catch(() => ({ data: [] }));
                        const membersList = Array.isArray(commMembers) ? commMembers : (commMembers?.data || commMembers?.items || []);
                        membersList.forEach(m => {
                            const mId = m.userId || m.id;
                            if (String(mId) !== String(authorId)) {
                                newNotifs.push({
                                    id: `comm_post_${Date.now()}_${mId}`,
                                    type: 'community_post',
                                    category: 'Community',
                                    senderName: authorName,
                                    senderUserId: authorId,
                                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl,
                                    targetUserId: mId,
                                    communityId: selectedCommunity.id,
                                    communityName: selectedCommunity.name,
                                    text: notifMsg,
                                    message: notifMsg,
                                    createdDate: nowIso,
                                    unread: true,
                                    isLocalNotif: true,
                                    targetUrl: `/community/view?id=${selectedCommunity.id}`,
                                    relatedContentType: 'Community',
                                    relatedContentId: selectedCommunity.id
                                });
                            }
                        });
                    } catch (e) {}

                    // Fallback ensure active colleagues get it if no members returned from API
                    if (newNotifs.length === 0) {
                        allColleagues.filter(u => String(u.id || u.userId) !== String(authorId)).slice(0, 5).forEach(u => {
                            const uId = u.id || u.userId;
                            newNotifs.push({
                                id: `comm_post_${Date.now()}_${uId}`,
                                type: 'community_post',
                                category: 'Community',
                                senderName: authorName,
                                senderUserId: authorId,
                                senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl,
                                targetUserId: uId,
                                communityId: selectedCommunity.id,
                                communityName: selectedCommunity.name,
                                text: notifMsg,
                                message: notifMsg,
                                createdDate: nowIso,
                                unread: true,
                                isLocalNotif: true,
                                targetUrl: `/community/view?id=${selectedCommunity.id}`,
                                relatedContentType: 'Community',
                                relatedContentId: selectedCommunity.id
                            });
                        });
                    }
                } else if (selectedConnections.length > 0) {
                    // Scenario 3: Specific Connections / Specific Person
                    const notifMsg = `${authorName} shared a post with you: "${snippet}"`;
                    selectedConnections.forEach(c => {
                        const cId = c.id || c.userId;
                        newNotifs.push({
                            id: `share_post_${Date.now()}_${cId}`,
                            type: 'post_shared',
                            category: 'Shares',
                            senderName: authorName,
                            senderUserId: authorId,
                            senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl,
                            targetUserId: cId,
                            employeeId: c.employeeId,
                            text: notifMsg,
                            message: notifMsg,
                            createdDate: nowIso,
                            unread: true,
                            isLocalNotif: true,
                            targetUrl: createdPostId ? `/posts?id=${createdPostId}` : '/posts',
                            relatedContentType: 'Post',
                            relatedContentId: createdPostId
                        });
                    });
                } else {
                    // Scenario 1: Everyone
                    const notifMsg = `${authorName} published a new post: "${snippet}"`;
                    allColleagues.filter(u => String(u.id || u.userId) !== String(authorId)).forEach(u => {
                        const uId = u.id || u.userId;
                        newNotifs.push({
                            id: `post_everyone_${Date.now()}_${uId}`,
                            type: 'post_everyone',
                            category: 'System',
                            senderName: authorName,
                            senderUserId: authorId,
                            senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl,
                            targetUserId: uId,
                            employeeId: u.employeeId,
                            text: notifMsg,
                            message: notifMsg,
                            createdDate: nowIso,
                            unread: true,
                            isLocalNotif: true,
                            targetUrl: createdPostId ? `/posts?id=${createdPostId}` : '/posts',
                            relatedContentType: 'Post',
                            relatedContentId: createdPostId
                        });
                    });
                }

                if (newNotifs.length > 0) {
                    try {
                        const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                        localStorage.setItem('knome_notifications', JSON.stringify([...newNotifs, ...existingNotifs]));
                    } catch (e) {}

                    // Trigger local notification listeners across all open tabs/components
                    window.dispatchEvent(new CustomEvent('notification-updated'));
                    window.dispatchEvent(new CustomEvent('knome_new_notification'));
                    newNotifs.forEach(n => {
                        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: n }));
                    });
                }
            }

            if (status !== 'Scheduled' && status !== 'Draft') {
                if (awardRuleKarma && (currentUser?.userId || currentUser?.id)) {
                    const targetUid = currentUser?.userId || currentUser?.id;
                    const pts = awardRuleKarma(targetUid, 'POST') || 2;
                    addToast(`⚡ +${pts} Karma Points earned for publishing a Post!`, 'info');
                    if (refreshKarma) {
                        setTimeout(() => refreshKarma(targetUid), 400);
                    }
                }
            }
            
            // Success
            const savedScheduleTime = scheduledTime;
            resetForm();
            if (status === 'Draft') {
                addToast('Post saved as draft successfully! 📝', 'success');
            } else if (status === 'Scheduled' && savedScheduleTime) {
                const formattedTimeStr = formatScheduleDisplay(savedScheduleTime) || (typeof formatToDDMMYYYY === 'function' ? formatToDDMMYYYY(savedScheduleTime) : savedScheduleTime);
                addToast(`Post scheduled for publication on ${formattedTimeStr}!`, 'success');
            } else {
                addToast('Post published successfully!', 'success');
            }
            window.dispatchEvent(new CustomEvent('post-created'));
            if (onPostCreated) onPostCreated();
            onClose();
        } catch (error) {
            console.error('Failed to publish post', error);
            addToast(error.message || 'Failed to publish post', 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isOpen) return null;

    const charsLeft = MAX_CHARS - text.length;
    const isNearLimit = charsLeft <= 20;

    const filteredUsers = (users || []).filter(u => (u.name || u.fullName || '').toLowerCase().includes(mentionFilter) && (u.id || u.userId) !== (currentUser?.userId || currentUser?.id));
    const filteredHashtags = PREDEFINED_HASHTAGS.filter(h => h.toLowerCase().includes(hashtagFilter));

    return (
        <div 
            onClick={handleClose}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
        >
            <div 
                onClick={(e) => e.stopPropagation()}
                className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] my-auto animate-in fade-in zoom-in-95 duration-150"
            >
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 z-10">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500">edit_square</span>
                            <span>Create Post</span>
                        </h2>
                        {isDraftMode && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                <span>Editing Draft</span>
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Auto-save status indicator */}
                        {autoSaveStatus && (
                            <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1 mr-1 select-none">
                                {autoSaveStatus === 'saving' ? (
                                    <>
                                        <span className="material-symbols-outlined text-[14px] animate-spin text-indigo-500">sync</span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Auto-saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[14px] text-emerald-500">cloud_done</span>
                                        <span>{formatDraftTimeAgo(lastSavedTime)}</span>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Discard Button (shown when editing a draft or when content is present) */}
                        {(isDraftMode || text.trim().length > 0 || attachments.length > 0) && (
                            <button
                                type="button"
                                onClick={handleDiscardDraft}
                                disabled={isPublishing || isDiscarding}
                                className="text-xs font-semibold text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                title="Discard this post and start fresh"
                            >
                                <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
                                <span className="hidden sm:inline">Discard</span>
                            </button>
                        )}

                        <button 
                            type="button"
                            onClick={handleClose} 
                            disabled={isPublishing} 
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                            title="Close"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                <div className="p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div className="flex items-center gap-3">
                        {currentUser?.avatar ? (
                            <img src={currentUser.avatar} alt={currentUser.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-md shrink-0" />
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-md shrink-0">
                                {currentUser?.name?.charAt(0) || 'U'}
                            </div>
                        )}
                        <div>
                            <p className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight">{currentUser.name}</p>
                            <div className="mt-1 relative" ref={audienceMenuRef}>
                                <div className="inline-flex items-center gap-1">
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            if (isPublishing) return;
                                            setIsAudienceMenuOpen(!isAudienceMenuOpen);
                                            setAudienceSubView(null);
                                            setAudienceSearch('');
                                        }}
                                        disabled={isPublishing}
                                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold py-1 px-2.5 rounded-lg border transition-all cursor-pointer shadow-xs active:scale-95 ${
                                            selectedCommunity 
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                                                : selectedConnections.length > 0
                                                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' 
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}>
                                        {selectedCommunity ? (
                                            <>
                                                <span className="material-symbols-outlined text-[14px] text-blue-500">groups</span>
                                                <span className="max-w-[160px] truncate">{selectedCommunity.name}</span>
                                            </>
                                        ) : selectedConnections.length > 0 ? (
                                            <>
                                                <span className="material-symbols-outlined text-[14px] text-purple-500">group</span>
                                                <span className="max-w-[180px] truncate">
                                                    {selectedConnections.length === 1 
                                                        ? `To: ${selectedConnections[0].name}`
                                                        : selectedConnections.length === 2
                                                        ? `To: ${selectedConnections[0].name}, ${selectedConnections[1].name}`
                                                        : `To: ${selectedConnections[0].name} +${selectedConnections.length - 1} others`}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[14px] text-slate-500">public</span>
                                                <span>Everyone</span>
                                            </>
                                        )}
                                        <span className="material-symbols-outlined text-[14px] transition-transform" style={{ transform: isAudienceMenuOpen ? 'rotate(180deg)' : 'none' }}>
                                            expand_more
                                        </span>
                                    </button>

                                    {(selectedCommunity || selectedConnections.length > 0) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAudience('Everyone');
                                                setSelectedCommunity(null);
                                                setSelectedConnections([]);
                                            }}
                                            className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-rose-500 hover:text-white text-slate-500 dark:text-slate-300 flex items-center justify-center transition-colors text-[10px]"
                                            title="Reset back to Everyone"
                                        >
                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Audience Selection Popover */}
                                {isAudienceMenuOpen && (
                                    <div className="absolute left-0 top-full mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                        {/* Main Options View */}
                                        {!audienceSubView && (
                                            <div className="py-1">
                                                <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                                    Who can see this post?
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAudience('Everyone');
                                                        setSelectedCommunity(null);
                                                        setSelectedConnections([]);
                                                        setIsAudienceMenuOpen(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                                                        !selectedCommunity && selectedConnections.length === 0 ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-base text-slate-500">public</span>
                                                        <div>
                                                            <p className="font-bold">Everyone</p>
                                                            <p className="text-[10px] text-slate-400 font-normal">All employees in the organization</p>
                                                        </div>
                                                    </div>
                                                    {!selectedCommunity && selectedConnections.length === 0 && (
                                                        <span className="material-symbols-outlined text-sm text-blue-500">check</span>
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAudienceSubView('communities');
                                                        setAudienceSearch('');
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                                                        selectedCommunity ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="material-symbols-outlined text-base text-blue-500">groups</span>
                                                        <div className="min-w-0">
                                                            <p className="font-bold truncate">
                                                                {selectedCommunity ? selectedCommunity.name : 'Specific Communities...'}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 font-normal">Share to a specific community</p>
                                                        </div>
                                                    </div>
                                                    <span className="material-symbols-outlined text-sm text-slate-400">chevron_right</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAudienceSubView('connections');
                                                        setAudienceSearch('');
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                                                        selectedConnections.length > 0 ? 'bg-purple-50/50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="material-symbols-outlined text-base text-purple-500">person</span>
                                                        <div className="min-w-0">
                                                            <p className="font-bold truncate">
                                                                {selectedConnections.length > 0 
                                                                    ? (selectedConnections.length === 1 ? `To: ${selectedConnections[0].name}` : `To: ${selectedConnections.length} People Selected`)
                                                                    : 'Specific Connections...'}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 font-normal">Share with specific people</p>
                                                        </div>
                                                    </div>
                                                    <span className="material-symbols-outlined text-sm text-slate-400">chevron_right</span>
                                                </button>
                                            </div>
                                        )}

                                        {/* Specific Communities List Sub-View */}
                                        {audienceSubView === 'communities' && (
                                            <div>
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAudienceSubView(null)}
                                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                                                    </button>
                                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Select Community</span>
                                                </div>
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                                    <input
                                                        type="text"
                                                        value={audienceSearch}
                                                        onChange={(e) => setAudienceSearch(e.target.value)}
                                                        placeholder="Search communities..."
                                                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-none text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
                                                    {availableCommunities
                                                        .filter(c => !audienceSearch || (c.name || '').toLowerCase().includes(audienceSearch.toLowerCase()))
                                                        .map((comm) => (
                                                            <button
                                                                key={comm.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedCommunity(comm);
                                                                    setSelectedConnections([]);
                                                                    setAudience('Community');
                                                                    setIsAudienceMenuOpen(false);
                                                                    setAudienceSubView(null);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                                                                    selectedCommunity?.id === comm.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 truncate">
                                                                    <div className="w-6 h-6 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs shrink-0">
                                                                        <span className="material-symbols-outlined text-[14px]">groups</span>
                                                                    </div>
                                                                    <span className="truncate font-semibold"><HighlightText text={comm.name} query={audienceSearch} /></span>
                                                                </div>
                                                                {selectedCommunity?.id === comm.id && (
                                                                    <span className="material-symbols-outlined text-sm text-blue-500 shrink-0">check</span>
                                                                )}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Specific Connections / Users List Sub-View (MULTI-SELECT) */}
                                        {audienceSubView === 'connections' && (
                                            <div>
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setAudienceSubView(null)}
                                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                                                        </button>
                                                        <div>
                                                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Select People</span>
                                                            <span className="ml-1 text-[10px] text-purple-600 dark:text-purple-400 font-bold bg-purple-100 dark:bg-purple-950/50 px-1.5 py-0.5 rounded-full">
                                                                {selectedConnections.length} selected
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {selectedConnections.length > 0 && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setSelectedConnections([])} 
                                                            className="text-[10px] text-rose-500 hover:underline font-bold"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                                    <input
                                                        type="text"
                                                        value={audienceSearch}
                                                        onChange={(e) => setAudienceSearch(e.target.value)}
                                                        placeholder="Search colleagues..."
                                                        className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-none text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-purple-500 placeholder-slate-400"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
                                                    {(allColleagues || users || [])
                                                        .filter(u => String(u.id || u.userId) !== String(currentUser?.userId || currentUser?.id))
                                                        .filter(u => !audienceSearch || (u.name || u.fullName || '').toLowerCase().includes(audienceSearch.toLowerCase()))
                                                        .map((u) => {
                                                            const uName = u.name || u.fullName || 'Colleague';
                                                            const isSel = selectedConnections.some(c => String(c.id) === String(u.id || u.userId));
                                                            return (
                                                                <div
                                                                    key={u.id || u.userId}
                                                                    onClick={() => toggleConnection({ id: u.id || u.userId, name: uName, avatar: u.avatar || u.profilePhotoUrl, employeeId: u.employeeId })}
                                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                                                                        isSel ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2 truncate">
                                                                        {u.avatar || u.profilePhotoUrl ? (
                                                                            <img src={u.avatar || u.profilePhotoUrl} alt={uName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                                                        ) : (
                                                                            <div className="w-7 h-7 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center text-xs font-bold shrink-0">
                                                                                {uName.charAt(0)}
                                                                            </div>
                                                                        )}
                                                                        <div className="truncate">
                                                                            <p className="font-semibold truncate leading-none"><HighlightText text={uName} query={audienceSearch} /></p>
                                                                            <p className="text-[10px] text-slate-400 truncate mt-0.5"><HighlightText text={u.roleName || u.designation || 'Employee'} query={audienceSearch} /></p>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                                                                        isSel ? 'bg-purple-600 border-purple-600 text-white shadow-sm' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                                                    }`}>
                                                                        {isSel && <span className="material-symbols-outlined text-[14px]">check</span>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                                <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                                                    <span className="text-[11px] text-slate-500">
                                                        {selectedConnections.length === 0 ? 'No person selected' : `${selectedConnections.length} selected`}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (selectedConnections.length > 0) {
                                                                setAudience('Connections');
                                                                setSelectedCommunity(null);
                                                            } else {
                                                                setAudience('Everyone');
                                                                setSelectedConnections([]);
                                                            }
                                                            setIsAudienceMenuOpen(false);
                                                            setAudienceSubView(null);
                                                        }}
                                                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
                                                    >
                                                        Done
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Text Area relative container for Mentions & Hashtags */}
                    <div className="relative mt-2">
                        <textarea
                            ref={textareaRef}
                            value={text}
                            onChange={handleTextChange}
                            disabled={isPublishing}
                            placeholder="What's on your mind? (Use @ to mention, # for tags)"
                            className="w-full min-h-[120px] bg-transparent border-none text-[15px] text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:ring-0 p-0 leading-relaxed custom-scrollbar disabled:opacity-70"
                        ></textarea>

                        {/* Mention Dropdown */}
                        {showMentionDropdown && filteredUsers.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                    Mention People
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {filteredUsers.map((u, i) => (
                                        <div 
                                            key={u.id} 
                                            onClick={() => insertMention(u)}
                                            className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${i === mentionIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                                        >
                                            <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 text-[10px] font-bold">{u.name.charAt(0)}</div>
                                            <div>
                                                <p className="text-[12px] font-bold text-slate-900 dark:text-white leading-none">{u.name}</p>
                                                <p className="text-[10px] text-slate-500">{u.designation || u.roleName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Hashtag Dropdown */}
                        {showHashtagDropdown && filteredHashtags.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                    Trending Tags
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {filteredHashtags.map((h, i) => (
                                        <div 
                                            key={h} 
                                            onClick={() => insertHashtag(h)}
                                            className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${i === hashtagIndex ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                                        >
                                            <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 text-[12px] font-bold">#</div>
                                            <p className="text-[12px] font-bold text-slate-900 dark:text-white leading-none">{h}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Character Limit & Security Warnings */}
                    <div className="flex items-center justify-between">
                        {/* Security Warnings */}
                        {securityWarning && (
                            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                                <span className="material-symbols-outlined text-red-500 text-[18px]">gpp_bad</span>
                                <p className="text-[12px] font-bold text-red-600 dark:text-red-400">{securityWarning}</p>
                            </div>
                        )}
                        <span className={`text-[12px] font-bold transition-colors ${isNearLimit ? 'text-red-500' : 'text-slate-400'} ml-auto`}>
                            {charsLeft}
                        </span>
                    </div>

                    {/* Attachments Display */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                            {attachments.map(att => {
                                const sizeStr = formatSize(att.size);
                                
                                if (att.type === 'image') {
                                    return (
                                        <div key={att.id} className="relative group w-32 h-32 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-slate-50 dark:bg-slate-800">
                                            <img src={att.url} alt={att.name} className={`w-full h-full object-cover transition-opacity ${att.isUploading ? 'opacity-40' : 'opacity-100'}`} />
                                            
                                            {/* Info Overlay (bottom) */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                                                <p className="text-white text-[9px] font-medium truncate">{att.name}</p>
                                                <p className="text-white/70 text-[8px]">{sizeStr}</p>
                                            </div>

                                            {/* Crop & Rotate Button Overlay */}
                                            {!att.isUploading && !isPublishing && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCropModalTarget(att)}
                                                    className="absolute bottom-2 right-2 bg-slate-900/85 hover:bg-indigo-600 text-white rounded-lg px-2 py-1 text-[10px] font-bold flex items-center gap-1 shadow-md transition-all z-10 cursor-pointer backdrop-blur-xs hover:scale-105 border border-white/20"
                                                    title="Crop & Rotate Image"
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">crop_rotate</span>
                                                    <span>Crop</span>
                                                </button>
                                            )}

                                            {att.isUploading && (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
                                                    <span className="text-white text-[10px] font-bold mb-1">{att.progress || 0}%</span>
                                                    <div className="w-16 h-1 bg-white/30 rounded-full overflow-hidden">
                                                        <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${att.progress || 0}%` }}></div>
                                                    </div>
                                                </div>
                                            )}
                                            {!att.isUploading && !isPublishing && (
                                                <button onClick={() => removeAttachment(att.id)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 shadow-sm z-20 cursor-pointer">
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            )}
                                        </div>
                                    );
                                }
                                if (att.type === 'video') {
                                    return (
                                        <div key={att.id} className="relative group w-48 h-32 rounded-xl overflow-hidden bg-black border border-slate-200 dark:border-slate-700 shadow-sm">
                                            <video src={att.url} className={`w-full h-full object-cover transition-opacity ${att.isUploading ? 'opacity-30' : 'opacity-80'}`} />
                                            
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 z-10">
                                                <p className="text-white text-[9px] font-medium truncate">{att.name}</p>
                                                <p className="text-white/70 text-[8px]">{sizeStr}</p>
                                            </div>

                                            {!att.isUploading && !isPublishing && (
                                                <button onClick={() => removeAttachment(att.id)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-20">
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            )}
                                            
                                            {att.isUploading ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                                                    <span className="text-white text-[10px] font-bold mb-1">{att.progress || 0}%</span>
                                                    <div className="w-16 h-1 bg-white/30 rounded-full overflow-hidden">
                                                        <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${att.progress || 0}%` }}></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                                    <span className="material-symbols-outlined text-white text-3xl drop-shadow-md">play_circle</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={att.id} className="relative flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-32 h-32 rounded-xl border border-slate-200 dark:border-slate-700 group shadow-sm overflow-hidden">
                                        <span className={`material-symbols-outlined text-3xl ${att.type === 'doc' ? 'text-emerald-500' : 'text-purple-500'} ${att.isUploading ? 'opacity-50' : 'opacity-100'}`}>
                                            {att.type === 'doc' 
                                                ? (att.name?.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' 
                                                    : (att.name?.toLowerCase().endsWith('.xls') || att.name?.toLowerCase().endsWith('.xlsx') ? 'table_chart'
                                                    : (att.name?.toLowerCase().endsWith('.ppt') || att.name?.toLowerCase().endsWith('.pptx') ? 'slideshow'
                                                    : (att.name?.toLowerCase().endsWith('.zip') ? 'folder_zip' : 'description')))) 
                                                : 'headphones'}
                                        </span>
                                        <span className={`text-[10px] font-semibold max-w-[100px] truncate px-2 text-center ${att.isUploading ? 'opacity-50' : 'opacity-100'}`}>{att.name}</span>
                                        <span className="text-[9px] text-slate-500">{sizeStr}</span>
                                        
                                        {att.isUploading && (
                                            <div className="absolute bottom-2 left-2 right-2">
                                                <div className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${att.progress || 0}%` }}></div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {!att.isUploading && !isPublishing && (
                                            <button onClick={() => removeAttachment(att.id)} className="absolute top-1 right-1 text-slate-400 hover:text-red-500 bg-white/80 dark:bg-slate-900/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Active Scheduled Notification Bar */}
                {scheduledTime && (
                    <div className="px-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-t border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 animate-pulse shrink-0">schedule</span>
                            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
                                Scheduled for <span className="font-mono font-bold">{formatScheduleDisplay(scheduledTime)}</span>
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 font-extrabold shrink-0">
                                {getRelativeScheduleText(scheduledTime)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setTempScheduleTime(scheduledTime);
                                    setIsScheduling(true);
                                }}
                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-1 rounded cursor-pointer transition-colors"
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                onClick={() => { setScheduledTime(''); setIsScheduling(false); }}
                                className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 p-1 rounded-full cursor-pointer transition-colors flex items-center justify-center"
                                title="Remove schedule (publish immediately)"
                            >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* File Size Exceeded Error Banner */}
                {fileError && (
                    <div className="mx-4 sm:mx-5 mb-2.5 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between gap-2.5 text-rose-600 dark:text-rose-400 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-[18px] text-rose-500 shrink-0">error</span>
                            <span className="break-words">{fileError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setFileError(null)}
                            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer shrink-0 transition-colors"
                            title="Dismiss error"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                )}

                {/* Footer Tools & Actions */}
                <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-1 shrink-0">
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                        <button onClick={() => triggerFileInput('image')} disabled={isPublishing} className="p-2 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors group relative disabled:opacity-50 cursor-pointer" title="Add Image">
                            <span className="material-symbols-outlined text-[22px]">image</span>
                            <span className="absolute -top-8 left-0 bg-slate-900 text-white text-[10.5px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-md z-30 transition-opacity">Image</span>
                        </button>
                        <button onClick={() => triggerFileInput('doc')} disabled={isPublishing} className="p-2 text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors group relative disabled:opacity-50 cursor-pointer" title="Add Document">
                            <span className="material-symbols-outlined text-[22px]">description</span>
                            <span className="absolute -top-8 left-0 bg-slate-900 text-white text-[10.5px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-md z-30 transition-opacity">Document</span>
                        </button>
                        <button onClick={() => triggerFileInput('video')} disabled={isPublishing} className="p-2 text-cyan-500 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded-lg transition-colors group relative disabled:opacity-50 cursor-pointer" title="Add Video">
                            <span className="material-symbols-outlined text-[22px]">videocam</span>
                            <span className="absolute -top-8 left-0 bg-slate-900 text-white text-[10.5px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-md z-30 transition-opacity">Video</span>
                        </button>
                        <button onClick={() => triggerFileInput('audio')} disabled={isPublishing} className="p-2 text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors group relative disabled:opacity-50 cursor-pointer" title="Add Audio">
                            <span className="material-symbols-outlined text-[22px]">headphones</span>
                            <span className="absolute -top-8 left-0 bg-slate-900 text-white text-[10.5px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap shadow-md z-30 transition-opacity">Audio</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 ml-auto shrink-0">
                        {(() => {
                            const restrictedInPost = checkRestrictedContent(text);
                            if (restrictedInPost) {
                                return (
                                    <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-xl text-xs font-bold">
                                        <span className="material-symbols-outlined text-[16px]">warning</span>
                                        <span>Restricted word ("{restrictedInPost}")</span>
                                    </div>
                                );
                            }
                            return (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSubmit('Draft')}
                                        disabled={(!text.trim() && attachments.length === 0) || securityWarning || isPublishing}
                                        className="px-3.5 py-2 rounded-xl text-[13px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap active:scale-95"
                                        title={isDraftMode ? "Update draft" : "Save as private draft"}
                                    >
                                        <span className="material-symbols-outlined text-[17px] text-slate-500">draft</span>
                                        <span>{isDraftMode ? 'Update Draft' : 'Save as Draft'}</span>
                                    </button>
                                    <button 
                                        data-schedule-trigger="true"
                                        type="button"
                                        onClick={() => {
                                            if (!isScheduling) {
                                                setTempScheduleTime(scheduledTime || getLocalDatetimeInputValue(15));
                                                setIsScheduling(true);
                                            } else {
                                                setIsScheduling(false);
                                            }
                                        }}
                                        disabled={isPublishing}
                                        className={`p-2 rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer relative shrink-0 ${
                                            scheduledTime 
                                                ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold' 
                                                : (isScheduling 
                                                    ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 text-indigo-600' 
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                  )
                                        }`}
                                        title={scheduledTime ? "Schedule active - click to edit" : (isScheduling ? "Close scheduler" : "Schedule publication")}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">
                                            {scheduledTime ? 'alarm_on' : 'schedule'}
                                        </span>
                                        {scheduledTime && (
                                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white dark:border-slate-800" />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSubmit(scheduledTime ? 'Scheduled' : 'Published')}
                                        disabled={!text.trim() || securityWarning || isPublishing}
                                        className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap active:scale-95
                                            ${(!text.trim() || securityWarning || isPublishing)
                                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500' 
                                                : (scheduledTime 
                                                    ? 'bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white shadow-md hover:scale-105' 
                                                    : 'bg-indigo-500 text-white hover:bg-indigo-600 hover:shadow-md hover:scale-105'
                                                  )
                                            }
                                        `}
                                    >
                                        {isPublishing ? (
                                            <>
                                                <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                                                <span>{scheduledTime ? 'Scheduling...' : 'Publishing...'}</span>
                                            </>
                                        ) : (
                                            scheduledTime ? (
                                                <>
                                                    <span className="material-symbols-outlined text-[17px]">event_available</span>
                                                    <span>{isDraftMode ? 'Schedule Draft' : 'Schedule Post'}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-[16px]">send</span>
                                                    <span>Publish Now</span>
                                                </>
                                            )
                                        )}
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Bottom Info Bar: Max File Sizes */}
                <div className="px-4 py-2 bg-slate-100/90 dark:bg-slate-800/90 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 rounded-b-2xl sm:rounded-b-3xl shrink-0 select-none">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="material-symbols-outlined text-[15px] text-slate-400 shrink-0">info</span>
                        <span className="font-bold text-slate-600 dark:text-slate-300">Max file size:</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            <span>Images: 100 MB</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Documents: 400 MB</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                            <span>Videos: 500 MB</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            <span>Audio: 100 MB</span>
                        </span>
                    </div>
                </div>

                {/* Scheduling Modal Overlay - Centered & Never Cut Off */}
                {isScheduling && (
                    <div 
                        className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150"
                        onClick={() => setIsScheduling(false)}
                    >
                        <div 
                            ref={schedulePopoverRef}
                            onClick={(e) => e.stopPropagation()}
                            className="p-4 sm:p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[94vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-700/60">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                                        <span className="material-symbols-outlined text-[18px]">event_upcoming</span>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                                            Schedule Publication
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
                            <div className="mb-3">
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
                                        addToast(`Post scheduled for ${formatScheduleDisplay(chosenVal)}`, 'success');
                                    }}
                                    onCancel={() => setIsScheduling(false)}
                                    onClear={() => {
                                        setScheduledTime('');
                                        setTempScheduleTime('');
                                        setIsScheduling(false);
                                        addToast('Schedule cleared. Post will publish immediately.', 'info');
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Image Cropper & Rotator Modal */}
                {cropModalTarget && (
                    <ImageCropModal
                        isOpen={Boolean(cropModalTarget)}
                        onClose={() => setCropModalTarget(null)}
                        imageSrc={cropModalTarget.url}
                        fileName={cropModalTarget.name}
                        onSave={handleCropSave}
                    />
                )}
            </div>
        </div>
    );
}
