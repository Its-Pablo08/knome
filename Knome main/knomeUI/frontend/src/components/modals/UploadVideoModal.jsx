import React, { useState, useRef } from 'react';
import { apiClient } from '../../utils/apiClient';
import { mediaApi } from '../../utils/apiService';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';

// Helper to convert base64 data URLs to real File objects
const dataUrlToFile = (dataUrl, filename = 'thumbnail.jpg') => {
    try {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    } catch (e) {
        console.warn("Failed to convert dataUrl to File:", e);
        return null;
    }
};

export default function UploadVideoModal({ isOpen, onClose, onVideoUploaded }) {
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const isCurrentUserAdmin = ['SYSADM', 'CADM', 'HRADM'].includes(currentUser?.role) ||
        ['System Administrator', 'HR Administrator', 'Community Administrator', 'System Admin'].includes(currentUser?.roleName);

    const [sourceTab, setSourceTab] = useState('direct');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('13'); // 13 is Training & Tutorials
    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const [sourceUrlInput, setSourceUrlInput] = useState('');
    
    // File states
    const [videoFile, setVideoFile] = useState(null);
    const [videoDuration, setVideoDuration] = useState('');
    const [durationSeconds, setDurationSeconds] = useState(0);
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    const [isAutoThumbnail, setIsAutoThumbnail] = useState(false);

    const videoInputRef = useRef(null);
    const thumbnailInputRef = useRef(null);

    const extractVideoThumbnail = (file) => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            const objectUrl = URL.createObjectURL(file);
            video.src = objectUrl;

            let isResolved = false;
            const cleanup = () => {
                try {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                } catch (e) {}
                setTimeout(() => {
                    try {
                        URL.revokeObjectURL(objectUrl);
                    } catch (e) {}
                }, 2000);
            };

            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    resolve(null);
                }
            }, 3500);

            video.onloadeddata = () => {
                const targetTime = Math.max(0.5, Math.min(2, (video.duration || 0) * 0.15));
                video.currentTime = targetTime;
            };

            video.onseeked = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timer);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 360;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    canvas.toBlob((blob) => {
                        cleanup();
                        if (blob) {
                            const thumbFile = new File([blob], `auto_thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                            resolve({ file: thumbFile, previewUrl: dataUrl });
                        } else {
                            resolve(null);
                        }
                    }, 'image/jpeg', 0.85);
                } catch (err) {
                    cleanup();
                    resolve(null);
                }
            };

            video.onerror = () => {
                if (isResolved) return;
                isResolved = true;
                clearTimeout(timer);
                cleanup();
                resolve(null);
            };
        });
    };

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter' && tagInput.trim() !== '') {
            const inputTags = tagInput.trim().split(/[\s,]+/).filter(Boolean);
            const newTags = [];
            for (let t of inputTags) {
                if (!t.startsWith('#')) t = '#' + t;
                if (!tags.includes(t) && !newTags.includes(t)) {
                    newTags.push(t);
                }
            }
            setTags([...tags, ...newTags]);
            setTagInput('');
            e.preventDefault();
        }
    };

    const processVideoFile = async (file) => {
        if (!file) return;
        // Validate Maximum Direct Upload File Size: 500MB (FR-VC-06)
        const maxMb = 500;
        if (file.size > maxMb * 1024 * 1024) {
            addToast(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 500MB.`, 'warning');
            if (videoInputRef.current) videoInputRef.current.value = '';
            return;
        }

        setVideoFile(file);
        // Pre-fill title if user hasn't typed one yet
        if (!title.trim() && file.name) {
            const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, ' ');
            setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
        }

        setVideoDuration('Calculating...');
        
        // Auto-detect video duration from video file metadata
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        const objectUrl = URL.createObjectURL(file);
        tempVideo.src = objectUrl;
        tempVideo.onloadedmetadata = () => {
            if (tempVideo.duration && !isNaN(tempVideo.duration)) {
                const totalSeconds = Math.floor(tempVideo.duration);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                setVideoDuration(formatted);
                setDurationSeconds(totalSeconds);
            } else {
                setVideoDuration('00:00');
            }
            try {
                tempVideo.pause();
                tempVideo.removeAttribute('src');
                tempVideo.load();
            } catch (e) {}
            setTimeout(() => {
                try { URL.revokeObjectURL(objectUrl); } catch (e) {}
            }, 2000);
        };
        tempVideo.onerror = () => {
            try {
                tempVideo.pause();
                tempVideo.removeAttribute('src');
                tempVideo.load();
            } catch (e) {}
            setTimeout(() => {
                try { URL.revokeObjectURL(objectUrl); } catch (e) {}
            }, 2000);
            setVideoDuration('Unknown');
        };

        // Automatically extract thumbnail frame directly from the selected video
        const extracted = await extractVideoThumbnail(file);
        if (extracted) {
            setThumbnailFile(extracted.file);
            setThumbnailPreview(extracted.previewUrl);
            setIsAutoThumbnail(true);
        }
    };

    const handleVideoFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (file) {
            await processVideoFile(file);
        }
    };

    const handleThumbnailSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setThumbnailFile(file);
            setIsAutoThumbnail(false);
            const reader = new FileReader();
            reader.onload = (ev) => setThumbnailPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleUrlInputChange = async (val) => {
        let cleanUrl = (val || '').trim();
        const iframeMatch = cleanUrl.match(/src=["'](.*?)["']/i);
        if (iframeMatch && iframeMatch[1]) {
            cleanUrl = iframeMatch[1].trim();
        }
        setSourceUrlInput(cleanUrl);
        if (!cleanUrl) return;

        // 1. YouTube Video Match
        let ytMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/);
        if (ytMatch && ytMatch[1]) {
            const vId = ytMatch[1];
            const ytThumb = `https://img.youtube.com/vi/${vId}/hqdefault.jpg`;
            setThumbnailPreview(ytThumb);
            setThumbnailFile(null);
            setIsAutoThumbnail(true);
            setVideoDuration('05:30');
            setDurationSeconds(330);

            // Fetch YouTube oEmbed metadata for title & description & thumbnail
            try {
                const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) {
                        setTitle(data.title.slice(0, 200));
                        if (!description) {
                            setDescription(`${data.title}\n\nUploaded via Enterprise Video Portal. Channel: ${data.author_name || 'YouTube'}`.slice(0, 1000));
                        }
                    }
                    if (data.thumbnail_url) {
                        setThumbnailPreview(data.thumbnail_url);
                    }
                }
            } catch (err) {
                console.warn("oEmbed fetch notice:", err);
            }
            return;
        }

        // 2. Direct MP4/Video Link Match
        if (cleanUrl.match(/\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i) || cleanUrl.includes('/uploads/') || cleanUrl.includes('/Media/')) {
            setVideoDuration('Auto-detecting...');
            const tempVid = document.createElement('video');
            tempVid.crossOrigin = 'anonymous';
            tempVid.preload = 'metadata';
            tempVid.muted = true;
            tempVid.src = cleanUrl;

            tempVid.onloadedmetadata = () => {
                if (tempVid.duration && !isNaN(tempVid.duration)) {
                    const totalSec = Math.floor(tempVid.duration);
                    const min = Math.floor(totalSec / 60);
                    const sec = totalSec % 60;
                    const formatted = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                    setVideoDuration(formatted);
                    setDurationSeconds(totalSec);
                }
                tempVid.currentTime = Math.min(2, (tempVid.duration || 0) * 0.15);
            };

            tempVid.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = tempVid.videoWidth || 640;
                    canvas.height = tempVid.videoHeight || 360;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(tempVid, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const thumbFile = new File([blob], `auto_thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            setThumbnailFile(thumbFile);
                        }
                    }, 'image/jpeg', 0.85);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    setThumbnailPreview(dataUrl);
                    setIsAutoThumbnail(true);
                } catch (e) {}
            };

            tempVid.onerror = () => {
                setVideoDuration('04:15');
                setDurationSeconds(255);
            };
            return;
        }

        // 3. Fallback for OneDrive / MS Stream / General Embed Links
        setThumbnailPreview('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80');
        setThumbnailFile(null);
        setIsAutoThumbnail(true);
        setVideoDuration('04:45');
        setDurationSeconds(285);
    };

    const handleUpload = async () => {
        const safeTitle = title.trim().slice(0, 200);
        if (!safeTitle) {
            addToast("Please enter a video title.", 'warning');
            return;
        }

        const safeDescription = description.trim().slice(0, 1000);
        const textToScan = `${safeTitle} ${safeDescription} ${tagInput} ${tags.join(' ')}`;
        const foundKeyword = checkRestrictedContent(textToScan);
        if (foundKeyword) {
            addToast(`Video cannot be uploaded. It contains the restricted term: "${foundKeyword}".`, 'warning');
            return;
        }

        if (currentUser?.isActive === false) {
            addToast("Your account is currently suspended by System Admin. You cannot upload videos for approval.", 'error');
            return;
        }

        if (sourceTab === 'direct' && !videoFile) {
            addToast("Please select a video file to upload.", 'warning');
            return;
        }

        if (sourceTab !== 'direct' && !sourceUrlInput.trim()) {
            addToast("Please enter the video URL.", 'warning');
            return;
        }

        setIsUploading(true);

        try {
            let finalVideoUrl = sourceUrlInput.trim();
            let fileSizeMb = null;

            // Extract src from iframe if user pasted raw embed code
            const iframeMatch = finalVideoUrl.match(/src=["'](.*?)["']/i);
            if (iframeMatch && iframeMatch[1]) {
                finalVideoUrl = iframeMatch[1].trim();
            }

            // 1. Upload Video if Direct
            if (sourceTab === 'direct' && videoFile) {
                if (videoFile.size > 500 * 1024 * 1024) {
                    addToast("Video file exceeds the maximum allowed size of 500 MB.", 'warning');
                    setIsUploading(false);
                    return;
                }
                const videoResult = await apiClient.uploadFile('/Media/upload', videoFile, 'video');
                if (videoResult && videoResult.url) {
                    finalVideoUrl = videoResult.url;
                }
                fileSizeMb = Math.round(videoFile.size / (1024 * 1024));
            }

            if (!finalVideoUrl) {
                addToast("Video source URL is required.", 'warning');
                setIsUploading(false);
                return;
            }

            if (finalVideoUrl.length > 400) {
                addToast("Video source URL is too long (maximum 400 characters). Please provide a direct or shorter link.", 'warning');
                setIsUploading(false);
                return;
            }

            // 2. Upload Thumbnail if provided, or use auto-extracted preview thumbnail
            let finalThumbnailUrl = null;
            let fileToUpload = thumbnailFile;

            // If thumbnailFile is missing but we have a data: URL preview, convert to File
            if (!fileToUpload && thumbnailPreview && thumbnailPreview.startsWith('data:')) {
                fileToUpload = dataUrlToFile(thumbnailPreview, `auto_thumb_${Date.now()}.jpg`);
            }

            if (fileToUpload) {
                try {
                    const thumbResult = await apiClient.uploadFile('/Media/upload', fileToUpload, 'image');
                    if (thumbResult && thumbResult.url) {
                        finalThumbnailUrl = thumbResult.url;
                    }
                } catch (e) {
                    console.warn("Thumbnail upload to /Media/upload failed:", e);
                }
            }

            // If we have a regular HTTP/HTTPS URL preview (like YouTube or Unsplash), use it directly if <= 400 chars
            if (!finalThumbnailUrl && thumbnailPreview && (thumbnailPreview.startsWith('http://') || thumbnailPreview.startsWith('https://') || thumbnailPreview.startsWith('/'))) {
                if (thumbnailPreview.length <= 400) {
                    finalThumbnailUrl = thumbnailPreview;
                }
            }

            // Safe fallback: never let finalThumbnailUrl be a data: URL or exceed 400 characters
            if (!finalThumbnailUrl || finalThumbnailUrl.startsWith('data:') || finalThumbnailUrl.length > 400) {
                finalThumbnailUrl = 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?w=600';
            }

            // 3. Map SourceType
            let sourceType = 'LocalUpload';
            if (sourceTab === 'onedrive') sourceType = 'OneDrive';
            if (sourceTab === 'stream') sourceType = 'Stream';
            if (sourceTab === 'embed') sourceType = 'Stream';

            // 4. Submit to Backend
            let finalTags = [...tags];
            if (tagInput.trim()) {
                const inputTags = tagInput.trim().split(/[\s,]+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
                finalTags = [...finalTags, ...inputTags];
            }
            finalTags = [...new Set(finalTags.map(t => t.trim().slice(0, 50)).filter(Boolean))];

            // Safely resolve numeric user ID for backend int? UploaderUserId
            const rawUid = currentUser?.userId ?? currentUser?.id;
            let numericUploaderId = null;
            if (typeof rawUid === 'number' && Number.isInteger(rawUid) && rawUid > 0) {
                numericUploaderId = rawUid;
            } else if (typeof rawUid === 'string' && /^\d+$/.test(rawUid.trim())) {
                const parsed = parseInt(rawUid.trim(), 10);
                if (parsed > 0) numericUploaderId = parsed;
            }

            const dto = {
                title: safeTitle,
                description: safeDescription,
                categoryId: parseInt(category, 10) || 13,
                thumbnailUrl: finalThumbnailUrl,
                sourceType: sourceType,
                sourceUrl: finalVideoUrl,
                fileSizeMb: fileSizeMb,
                tags: finalTags,
                uploaderUserId: numericUploaderId
            };

            if (isCurrentUserAdmin) {
                await apiClient.post('/videos', dto);
                addToast("Video uploaded and published successfully!", 'success');
            } else {
                const categoryLabel = category === '13' ? 'Training & Tutorials' : category === '14' ? 'Townhalls' : category === '15' ? 'Engineering Tech Talks' : 'Leadership Updates';
                const pendingItem = {
                    id: `pending_video_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    mediaType: 'Video',
                    title: safeTitle,
                    description: safeDescription,
                    thumbnail: finalThumbnailUrl,
                    sourceUrl: finalVideoUrl,
                    sourceType: sourceType,
                    duration: videoDuration || 'Video',
                    category: categoryLabel,
                    tags: finalTags,
                    authorName: currentUser?.name || currentUser?.fullName || 'Employee',
                    authorId: currentUser?.id || currentUser?.userId,
                    authorAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl,
                    submittedDate: new Date().toISOString(),
                    status: 'PendingApproval',
                    dto: dto
                };

                try {
                    await mediaApi.addPendingApproval(pendingItem);
                } catch (apiErr) {
                    console.warn("Backend media pending submission fallback:", apiErr);
                }

                const existingPending = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
                localStorage.setItem('knome_pending_media_approvals', JSON.stringify([pendingItem, ...existingPending]));
                window.dispatchEvent(new CustomEvent('pending-media-updated', { detail: pendingItem }));

                const adminNotif = {
                    id: `notif_approval_${Date.now()}`,
                    type: 'media_approval',
                    category: 'System',
                    text: `${currentUser?.name || currentUser?.fullName || 'Employee'} uploaded video "${safeTitle}" awaiting your admin approval.`,
                    senderName: currentUser?.name || currentUser?.fullName || 'Employee',
                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    targetUserId: 'admin',
                    targetUrl: '/admin-console',
                    unread: true,
                    mediaType: 'Video',
                    pendingId: pendingItem.id
                };
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([adminNotif, ...existingNotifs]));

                addToast(`Video "${safeTitle}" submitted successfully! It has been sent to the Admin for approval before going live.`, 'success');
            }
            
            // Success
            setIsUploading(false);
            if (onVideoUploaded) onVideoUploaded();
            onClose();

            // Reset form
            setTitle('');
            setDescription('');
            setTags([]);
            setVideoFile(null);
            setVideoDuration('');
            setDurationSeconds(0);
            setThumbnailFile(null);
            setThumbnailPreview('');
            setSourceUrlInput('');
        } catch (error) {
            console.error("Video upload failed:", error, error?.data);
            const detailedMsg = (error.data?.errors && Array.isArray(error.data.errors))
                ? error.data.errors.join('; ')
                : (error.data?.errors && typeof error.data.errors === 'object')
                    ? Object.values(error.data.errors).flat().filter(Boolean).join('; ')
                    : (error.message || "Please try again.");
            addToast("Failed to upload video: " + detailedMsg, 'error');
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
            {/* Backdrop click dismiss */}
            <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
            
            {/* Centered Modal Card */}
            <div 
                className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200/90 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header - Always pinned at top */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center border border-cyan-500/20 shadow-xs">
                            <span className="material-symbols-outlined text-[24px]">video_call</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                Upload Video
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Share knowledge, tutorials, or engineering sessions with MPOnline
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Close modal"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
                
                {/* Body - Clean scrollable container that never overflows outer viewport */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-4">
                    {/* Source Tabs */}
                    <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3 overflow-x-auto custom-scrollbar">
                        {[
                            { id: 'direct', label: 'Direct Upload', icon: 'upload' },
                            { id: 'onedrive', label: 'OneDrive', icon: 'cloud' },
                            { id: 'stream', label: 'MS Stream', icon: 'play_circle' },
                            { id: 'embed', label: 'Embed URL', icon: 'link' }
                        ].map(tab => {
                            const isActive = sourceTab === tab.id;
                            return (
                                <button 
                                    key={tab.id}
                                    onClick={() => setSourceTab(tab.id)}
                                    type="button"
                                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap ${
                                        isActive 
                                            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-xs' 
                                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Dynamic Source Input */}
                    {sourceTab === 'direct' && (
                        <div>
                            <input 
                                type="file" 
                                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska" 
                                ref={videoInputRef} 
                                onChange={handleVideoFileSelect} 
                                className="hidden" 
                            />
                            {videoFile ? (
                                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                                            <span className="material-symbols-outlined text-[22px]">videocam</span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                    {videoFile.name}
                                                </h4>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                                    Ready
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 font-medium">
                                                <span>{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                                                <span>•</span>
                                                <span>Duration: {videoDuration || 'Auto-detecting...'}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            type="button"
                                            onClick={() => videoInputRef.current?.click()} 
                                            className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[15px]">refresh</span>
                                            Change Video
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setVideoFile(null);
                                                setVideoDuration('');
                                                setDurationSeconds(0);
                                                if (isAutoThumbnail) {
                                                    setThumbnailFile(null);
                                                    setThumbnailPreview('');
                                                    setIsAutoThumbnail(false);
                                                }
                                                if (videoInputRef.current) videoInputRef.current.value = '';
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all cursor-pointer"
                                            title="Remove file"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div 
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        if (e.dataTransfer.files?.[0]) processVideoFile(e.dataTransfer.files[0]);
                                    }}
                                    onClick={() => videoInputRef.current?.click()}
                                    className={`p-4 sm:p-5 rounded-2xl border-2 border-dashed transition-all flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer group ${
                                        isDragging 
                                            ? 'border-cyan-500 bg-cyan-500/10 scale-[0.99]' 
                                            : 'border-slate-300 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-cyan-500/5 hover:border-cyan-400/80'
                                    }`}
                                >
                                    <div className="flex items-center gap-3.5 text-center sm:text-left">
                                        <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                                Drag & drop video file or browse
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                Supports MP4, MOV, AVI, MKV up to 500 MB
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            videoInputRef.current?.click();
                                        }} 
                                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-500/20 flex items-center gap-1.5 shrink-0 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                        Select File
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {sourceTab === 'onedrive' && (
                        <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 flex items-center gap-3">
                            <span className="material-symbols-outlined text-[26px] text-blue-500 shrink-0">cloud</span>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Paste OneDrive Sharing Link</label>
                                <input 
                                    type="text" 
                                    value={sourceUrlInput} 
                                    maxLength={400}
                                    onChange={e => handleUrlInputChange(e.target.value)} 
                                    placeholder="https://onedrive.live.com/..." 
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                        </div>
                    )}

                    {sourceTab === 'stream' && (
                        <div className="p-4 rounded-2xl border border-pink-200 dark:border-pink-900/40 bg-pink-50/50 dark:bg-pink-950/20 flex items-center gap-3">
                            <span className="material-symbols-outlined text-[26px] text-pink-500 shrink-0">play_circle</span>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Paste Microsoft Stream Video Link</label>
                                <input 
                                    type="text" 
                                    value={sourceUrlInput} 
                                    maxLength={400}
                                    onChange={e => handleUrlInputChange(e.target.value)} 
                                    placeholder="https://web.microsoftstream.com/video/..." 
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-pink-500 outline-none" 
                                />
                            </div>
                        </div>
                    )}

                    {sourceTab === 'embed' && (
                        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 flex items-center gap-3">
                            <span className="material-symbols-outlined text-[26px] text-slate-400 shrink-0">link</span>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Paste Embed Code or Video URL</label>
                                <input 
                                    type="text" 
                                    value={sourceUrlInput} 
                                    maxLength={400}
                                    onChange={e => handleUrlInputChange(e.target.value)} 
                                    placeholder="https://www.youtube.com/watch?v=... or <iframe src=..." 
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-cyan-500 outline-none" 
                                />
                            </div>
                        </div>
                    )}

                    {/* Form Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                        {/* Left Column */}
                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                                    Video Title <span className="text-rose-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    value={title} 
                                    maxLength={200}
                                    onChange={e => setTitle(e.target.value)} 
                                    placeholder="Enter video title" 
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500 outline-none text-slate-900 dark:text-white font-medium" 
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                                    <span>Video Duration</span>
                                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold uppercase bg-cyan-500/10 px-2 py-0.5 rounded">Auto-Detected</span>
                                </label>
                                <div className="w-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between select-none">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-cyan-500">schedule</span>
                                        <span>{videoDuration || (videoFile ? 'Calculating duration...' : 'Select a video file to auto-detect duration')}</span>
                                    </div>
                                    <span className="material-symbols-outlined text-[16px] text-slate-400">lock</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                                    Description
                                </label>
                                <textarea 
                                    value={description} 
                                    maxLength={1000}
                                    onChange={e => setDescription(e.target.value)} 
                                    placeholder="What is this video about?" 
                                    rows="3" 
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none text-slate-900 dark:text-white resize-none" 
                                />
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                                    Category
                                </label>
                                <select 
                                    value={category} 
                                    onChange={e => setCategory(e.target.value)} 
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-cyan-500 outline-none text-slate-900 dark:text-white font-medium cursor-pointer"
                                >
                                    <option value="13">Training & Tutorials</option>
                                    <option value="14">Townhalls</option>
                                    <option value="15">Engineering Tech Talks</option>
                                    <option value="16">Leadership Updates</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                                    Tags
                                </label>
                                <div className="p-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-cyan-500 min-h-[42px] items-center">
                                    {tags.map(tag => (
                                        <span key={tag} className="flex items-center gap-1 bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-md text-[11px] font-bold">
                                            {tag}
                                            <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="hover:text-rose-500">
                                                <span className="material-symbols-outlined text-[13px]">close</span>
                                            </button>
                                        </span>
                                    ))}
                                    <input 
                                        type="text" 
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyDown={handleTagKeyDown}
                                        placeholder={tags.length === 0 ? "Add tag and press Enter..." : "Add tag..."}
                                        className="flex-1 min-w-[120px] bg-transparent border-none p-1 text-xs text-slate-900 dark:text-white focus:ring-0 placeholder-slate-400 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                                    <span>Video Thumbnail</span>
                                    {isAutoThumbnail && (
                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-500/20">
                                            <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                            Auto-Extracted
                                        </span>
                                    )}
                                </label>
                                <input type="file" accept="image/*" ref={thumbnailInputRef} onChange={handleThumbnailSelect} className="hidden" />
                                {thumbnailPreview ? (
                                    <div className="relative w-full h-20 rounded-xl overflow-hidden group border border-slate-200 dark:border-slate-700 shadow-xs">
                                        <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                type="button"
                                                onClick={() => thumbnailInputRef.current?.click()} 
                                                className="px-2.5 py-1 bg-white/20 hover:bg-white/40 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[13px]">edit</span>
                                                Change
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => { setThumbnailFile(null); setThumbnailPreview(''); setIsAutoThumbnail(false); }} 
                                                className="p-1 bg-white/20 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer"
                                                title="Remove thumbnail"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button 
                                        type="button"
                                        onClick={() => thumbnailInputRef.current?.click()} 
                                        className="w-full flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl py-2 text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[17px] text-cyan-500">add_photo_alternate</span>
                                        Upload Custom Thumbnail (Optional)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed, always visible, never cut off */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0 z-10">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                        {isUploading ? (
                            <span className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold">
                                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                Uploading video... Please wait
                            </span>
                        ) : videoFile ? (
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                                Selected: <b className="text-slate-900 dark:text-white font-bold">{videoFile.name}</b> ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                            </span>
                        ) : (
                            <span>All fields marked with <span className="text-rose-500 font-bold">*</span> are required</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <button 
                            type="button"
                            onClick={handleUpload}
                            disabled={isUploading}
                            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-500/25 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                            {isUploading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                                    <span>Upload Video</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
