import React, { useState, useEffect, useRef } from 'react';
import { mediaApi, podcastsApi } from '../../utils/apiService';
import { apiClient } from '../../utils/apiClient';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import { checkRestrictedContent } from '../../utils/restrictedWords';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (FR-PD-05)
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.webm', '.flac'];

export default function UploadPodcastModal({ isOpen, onClose }) {
    const { currentUser } = useUser();
    const { addToast } = useToast();
    const isCurrentUserAdmin = ['SYSADM'].includes(currentUser?.role) ||
        currentUser?.roleCode === 'SYSADM' ||
        ['System Administrator', 'System Admin'].includes(currentUser?.roleName) ||
        currentUser?.role === 'System Administrator' ||
        currentUser?.role === 'System Admin';

    const [tab, setTab] = useState('upload');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [duration, setDuration] = useState('');
    const [seriesId, setSeriesId] = useState('');
    const [categoryName, setCategoryName] = useState('General');
    
    const [audioFile, setAudioFile] = useState(null);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
    const [coverImageFile, setCoverImageFile] = useState(null);

    const [seriesList, setSeriesList] = useState([]);
    const [isCreatingSeries, setIsCreatingSeries] = useState(false);
    const [newSeriesTitle, setNewSeriesTitle] = useState('');
    const [newSeriesDesc, setNewSeriesDesc] = useState('');

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimeRef = useRef(0);
    const audioInputRef = useRef(null);
    const coverInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchSeries();
            resetForm();
        }
    }, [isOpen]);

    const fetchSeries = async () => {
        try {
            const response = await podcastsApi.getAllSeries();
            if (response) {
                setSeriesList(Array.isArray(response) ? response : []);
            }
        } catch (error) {
            console.error('Failed to fetch series:', error);
        }
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setDuration('');
        setSeriesId('');
        setAudioFile(null);
        if (recordedAudioUrl) {
            try { URL.revokeObjectURL(recordedAudioUrl); } catch (e) {}
        }
        setRecordedAudioUrl(null);
        setCoverImageFile(null);
        setTab('upload');
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        setIsRecording(false);
        setIsCreatingSeries(false);
        setNewSeriesTitle('');
        setNewSeriesDesc('');
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch (e) {}
        }
    };

    // Timer effect during recording
    useEffect(() => {
        let interval;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime(prev => {
                    const next = prev + 1;
                    recordingTimeRef.current = next;
                    return next;
                });
            }, 1000);
        } else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const parseDuration = (str) => {
        if (!str) return null;
        const parts = str.split(':');
        if (parts.length === 2) {
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
        return parseInt(str) || null;
    };

    // In-Browser Recording Toggle (FR-PD-01)
    const handleToggleRecording = async () => {
        if (isRecording) {
            // Stop recording
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                try {
                    mediaRecorderRef.current.stop();
                } catch (e) {
                    console.error("Error stopping mediaRecorder:", e);
                }
            }
            setIsRecording(false);
        } else {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioChunksRef.current = [];
                const mediaRecorder = new MediaRecorder(stream);

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const file = new File([audioBlob], `recorded_podcast_${Date.now()}.webm`, { type: 'audio/webm' });
                    setAudioFile(file);
                    
                    const finalSeconds = Math.max(1, recordingTimeRef.current);
                    setDuration(formatTime(finalSeconds));

                    if (recordedAudioUrl) {
                        try { URL.revokeObjectURL(recordedAudioUrl); } catch (e) {}
                    }
                    const previewUrl = URL.createObjectURL(audioBlob);
                    setRecordedAudioUrl(previewUrl);

                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorderRef.current = mediaRecorder;
                setRecordingTime(0);
                recordingTimeRef.current = 0;
                mediaRecorder.start();
                setIsRecording(true);
            } catch (err) {
                console.error("Microphone access error:", err);
                addToast("Microphone permission denied or unavailable in this browser.", 'error');
            }
        }
    };

    const handleDiscardRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch (e) {}
        }
        if (recordedAudioUrl) {
            try { URL.revokeObjectURL(recordedAudioUrl); } catch (e) {}
        }
        setAudioFile(null);
        setRecordedAudioUrl(null);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        setDuration('');
        setIsRecording(false);
    };

    // File Validation & Handling (FR-PD-05)
    const handleAudioFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            if (file.size > MAX_FILE_SIZE) {
                addToast(`File size exceeds the 100MB limit. Current size: ${(file.size / (1024 * 1024)).toFixed(1)}MB.`, 'warning');
                e.target.value = '';
                return;
            }

            const fileName = file.name.toLowerCase();
            const isValid = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
            if (!isValid) {
                addToast(`Unsupported audio format. Supported formats: ${ALLOWED_EXTENSIONS.join(', ')}.`, 'warning');
                e.target.value = '';
                return;
            }

            setAudioFile(file);
            
            if (recordedAudioUrl) {
                try { URL.revokeObjectURL(recordedAudioUrl); } catch (e) {}
            }
            const previewUrl = URL.createObjectURL(file);
            setRecordedAudioUrl(previewUrl);

            // Auto detect duration
            const audioObj = new Audio(previewUrl);
            audioObj.onloadedmetadata = () => {
                if (audioObj.duration && !isNaN(audioObj.duration)) {
                    const secs = Math.floor(audioObj.duration);
                    recordingTimeRef.current = secs;
                    setDuration(formatTime(secs));
                }
            };
        }
    };

    const handleCoverFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setCoverImageFile(e.target.files[0]);
        }
    };

    // Series Creation Workflow (FR-PD-03)
    const handleCreateSeries = async () => {
        if (!newSeriesTitle.trim()) {
            addToast('Series title is required.', 'warning');
            return;
        }
        try {
            const res = await podcastsApi.createSeries({
                title: newSeriesTitle.trim(),
                description: newSeriesDesc.trim()
            });
            const created = res?.data || res;
            addToast(`Series "${newSeriesTitle}" created successfully!`, 'success');
            await fetchSeries();
            if (created && created.seriesId) {
                setSeriesId(created.seriesId.toString());
            }
            setIsCreatingSeries(false);
            setNewSeriesTitle('');
            setNewSeriesDesc('');
        } catch (err) {
            console.error('Failed to create series:', err);
            addToast('Failed to create series.', 'error');
        }
    };

    const handleUpload = async () => {
        if (currentUser?.isActive === false) {
            addToast("Your account is currently suspended by System Admin. You cannot publish podcasts.", 'error');
            return;
        }

        if (!title.trim()) {
            addToast('Episode title is required.', 'warning');
            return;
        }

        const textToScan = `${title} ${description} ${categoryName}`;
        const foundKeyword = checkRestrictedContent(textToScan);
        if (foundKeyword) {
            addToast(`Podcast episode cannot be uploaded. It contains the restricted term: "${foundKeyword}".`, 'warning');
            return;
        }

        if (!audioFile) {
            addToast('Please upload an audio file or record audio in-browser before publishing.', 'warning');
            return;
        }

        setIsUploading(true);

        try {
            let audioUrl = '';
            let coverImageUrl = '';

            if (audioFile) {
                const audioResponse = await mediaApi.uploadFile(audioFile, 'podcast');
                if (audioResponse && audioResponse.url) {
                    audioUrl = audioResponse.url;
                }
            }

            if (!audioUrl) {
                throw new Error("Failed to upload audio file. Please ensure backend is running.");
            }

            if (coverImageFile) {
                try {
                    const coverResponse = await mediaApi.uploadFile(coverImageFile, 'image');
                    if (coverResponse && coverResponse.url) {
                        coverImageUrl = coverResponse.url;
                    }
                } catch (e) {
                    console.warn("Cover image upload failed:", e);
                }
            }

            if (!coverImageUrl) {
                const defaultCovers = {
                    Tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=90&w=800',
                    Leadership: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=90&w=800',
                    Engineering: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=90&w=800',
                    General: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=90&w=800'
                };
                coverImageUrl = defaultCovers[categoryName] || defaultCovers.General;
            }

            const rawAuthorId = currentUser?.userId ?? currentUser?.id;
            let numericAuthorId = null;
            if (typeof rawAuthorId === 'number' && Number.isInteger(rawAuthorId) && rawAuthorId > 0) {
                numericAuthorId = rawAuthorId;
            } else if (typeof rawAuthorId === 'string' && /^\d+$/.test(rawAuthorId.trim())) {
                const parsed = parseInt(rawAuthorId.trim(), 10);
                if (parsed > 0) numericAuthorId = parsed;
            }

            const currentAuthorId = numericAuthorId || rawAuthorId;
            const durationSecs = parseDuration(duration) || recordingTimeRef.current || 1;
            const calculatedFileSizeMb = Math.max(1, Math.min(100, Math.ceil((audioFile?.size || 1024 * 1024) / (1024 * 1024))));

            const podcastData = {
                title: title.trim(),
                description: description.trim(),
                audioUrl: audioUrl,
                coverImageUrl: coverImageUrl,
                durationSeconds: durationSecs,
                seriesId: seriesId ? parseInt(seriesId) : null,
                categoryName: categoryName || 'General',
                categoryId: null,
                fileSizeMb: calculatedFileSizeMb,
                uploaderUserId: numericAuthorId
            };

            if (isCurrentUserAdmin) {
                const createdRes = await podcastsApi.create(podcastData);
                const createdPodcast = createdRes?.data || createdRes;

                addToast("Podcast episode published successfully!", 'success');
                window.dispatchEvent(new CustomEvent('podcast-published', { detail: { newPodcast: createdPodcast } }));
            } else {
                const authorName = currentUser?.fullName || currentUser?.name || 'Employee';
                const authorAvatar = currentUser?.profilePhotoUrl || currentUser?.avatar || null;
                const formattedDuration = duration || formatTime(durationSecs) || '00:00';

                const pendingItem = {
                    id: `pending_podcast_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    mediaType: 'Podcast',
                    title: title.trim(),
                    description: description.trim(),
                    thumbnail: coverImageUrl,
                    audioUrl: audioUrl,
                    duration: formattedDuration,
                    category: categoryName || 'General',
                    authorName: authorName,
                    authorId: numericAuthorId || currentAuthorId,
                    authorAvatar: authorAvatar,
                    submittedDate: new Date().toISOString(),
                    status: 'PendingApproval',
                    podcastData: {
                        ...podcastData,
                        uploaderUserId: numericAuthorId || currentAuthorId
                    },
                    dto: {
                        ...podcastData,
                        uploaderUserId: numericAuthorId || currentAuthorId
                    }
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
                    text: `${authorName} uploaded podcast "${title.trim()}" awaiting your admin approval.`,
                    senderName: authorName,
                    senderAvatar: authorAvatar,
                    senderUserId: numericAuthorId || currentAuthorId,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    targetUserId: 'admin',
                    targetUrl: '/admin-console',
                    unread: true,
                    mediaType: 'Podcast',
                    pendingId: pendingItem.id
                };
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([adminNotif, ...existingNotifs]));

                addToast(`Podcast "${title.trim()}" submitted successfully! It has been sent to the Admin for approval before going live.`, 'success');
            }
            
            setIsUploading(false);
            onClose();
        } catch (error) {
            console.error('Failed to publish podcast:', error);
            addToast(`Failed to publish podcast: ${error.message || 'Please try again.'}`, 'error');
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto p-3 sm:p-4 md:p-6 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="fixed inset-0" onClick={onClose}></div>
            
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col my-auto border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
                
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 z-10">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-violet-500">podcasts</span>
                        Publish Podcast Episode
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                    {/* Source Tabs */}
                    <div className="flex gap-6 mb-6 border-b border-slate-200 dark:border-slate-800">
                        <button 
                            onClick={() => setTab('upload')}
                            className={`flex items-center gap-2 pb-3 font-bold text-sm transition-colors relative ${tab === 'upload' ? 'text-pink-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                            Upload Audio File (Max 100MB)
                            {tab === 'upload' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-pink-500 rounded-t-full"></div>}
                        </button>
                        <button 
                            onClick={() => setTab('record')}
                            className={`flex items-center gap-2 pb-3 font-bold text-sm transition-colors relative ${tab === 'record' ? 'text-pink-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">mic</span>
                            Record in Browser
                            {tab === 'record' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-pink-500 rounded-t-full"></div>}
                        </button>
                    </div>

                    {/* Input Area */}
                    <div className="mb-8 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center text-center min-h-[220px]">
                        {tab === 'upload' ? (
                            <>
                                <div className="w-16 h-16 bg-pink-100 dark:bg-pink-900/30 rounded-full flex items-center justify-center text-pink-500 mb-3">
                                    <span className="material-symbols-outlined text-[32px]">audio_file</span>
                                </div>
                                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white mb-1">
                                    {audioFile ? audioFile.name : 'Select or drag & drop audio file'}
                                </h3>
                                {audioFile && (
                                    <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                                        ✓ File selected ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB • {duration || 'Detecting duration...'})
                                    </span>
                                )}
                                {!audioFile && (
                                    <p className="text-[12px] text-slate-500 mb-4 max-w-sm">Maximum upload size: 100MB. Supported formats: MP3, WAV, AAC, OGG, M4A, WEBM, FLAC.</p>
                                )}

                                {recordedAudioUrl && (
                                    <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl mb-4 shadow-sm text-left">
                                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5">
                                            <span className="flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px] text-pink-500">volume_up</span>
                                                Audio Preview
                                            </span>
                                            <span className="font-mono text-pink-600">{duration}</span>
                                        </div>
                                        <audio controls src={recordedAudioUrl} className="w-full h-9 rounded" />
                                    </div>
                                )}

                                <input 
                                    type="file" 
                                    accept="audio/*" 
                                    ref={audioInputRef} 
                                    className="hidden" 
                                    onChange={handleAudioFileChange} 
                                />
                                <button 
                                    type="button"
                                    onClick={() => audioInputRef.current?.click()}
                                    className="px-6 py-2 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-600 transition-colors shadow-md shadow-pink-500/20 text-xs"
                                >
                                    {audioFile ? 'Change Audio File' : 'Select Audio File'}
                                </button>
                            </>
                        ) : (
                            <>
                                {audioFile && !isRecording ? (
                                    <div className="flex flex-col items-center w-full max-w-md">
                                        <div className="text-4xl font-black text-slate-800 dark:text-slate-200 mb-2 font-mono">
                                            {duration || formatTime(recordingTime)}
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-3 border border-emerald-200 dark:border-emerald-800">
                                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                            Recording saved! Ready to publish.
                                        </div>

                                        {recordedAudioUrl && (
                                            <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl mb-4 shadow-sm text-left">
                                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-[16px] text-pink-500">volume_up</span>
                                                        Recorded Audio Preview
                                                    </span>
                                                    <span className="font-mono text-pink-600 font-bold">{duration}</span>
                                                </div>
                                                <audio controls src={recordedAudioUrl} className="w-full h-9 rounded" />
                                            </div>
                                        )}

                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={handleDiscardRecording}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                                Discard & Record Again
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-4 flex flex-col items-center">
                                            <div className="text-4xl font-black text-slate-800 dark:text-slate-200 mb-2 font-mono">
                                                {formatTime(recordingTime)}
                                            </div>
                                            {isRecording && (
                                                <div className="flex items-center gap-1 h-8 mb-2">
                                                    {[1,2,3,4,5,4,3,2,1].map((bar, i) => (
                                                        <div key={i} className="w-1.5 bg-pink-500 rounded-full animate-pulse" style={{ height: `${bar * 6}px`, animationDelay: `${i * 0.1}s` }}></div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <button 
                                            type="button"
                                            onClick={handleToggleRecording}
                                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${isRecording ? 'bg-slate-800 text-red-500 animate-pulse ring-4 ring-red-500/30' : 'bg-red-500 text-white hover:scale-105'}`}
                                            title={isRecording ? 'Stop Recording' : 'Start Recording'}
                                        >
                                            <span className="material-symbols-outlined text-[32px]">{isRecording ? 'stop' : 'mic'}</span>
                                        </button>
                                        <p className="text-[12px] font-bold text-slate-500 mt-4">
                                            {isRecording ? 'Recording in progress... Click stop when finished.' : 'Click mic to start browser recording'}
                                        </p>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Episode Title *</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter episode title" 
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-white font-medium" 
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Description</label>
                                <textarea 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="What is this episode about?" 
                                    rows="3" 
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-white resize-none"
                                ></textarea>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Podcast Series Grouping</label>
                                <select 
                                    value={seriesId}
                                    onChange={(e) => setSeriesId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-white font-medium cursor-pointer"
                                >
                                    <option value="">Standalone Episode</option>
                                    {seriesList.map(s => (
                                        <option key={s.seriesId} value={s.seriesId}>{s.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Podcast Category *</label>
                                <select 
                                    value={categoryName}
                                    onChange={(e) => setCategoryName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-white font-medium cursor-pointer"
                                >
                                    <option value="General">General</option>
                                    <option value="Tech">Tech</option>
                                    <option value="Leadership">Leadership</option>
                                    <option value="Engineering">Engineering</option>
                                </select>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider flex items-center justify-between">
                                        <span>Duration</span>
                                        <span className="text-[10px] text-pink-600 font-extrabold uppercase bg-pink-500/10 px-2 py-0.5 rounded">Auto</span>
                                    </label>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between select-none cursor-not-allowed">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-pink-500">schedule</span>
                                            <span>{duration || (audioFile ? 'Calculating...' : 'Auto-detected on upload')}</span>
                                        </div>
                                        <span className="material-symbols-outlined text-[16px] text-slate-400">lock</span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">Cover Art Image</label>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        ref={coverInputRef} 
                                        className="hidden" 
                                        onChange={handleCoverFileChange} 
                                    />
                                    <button 
                                        onClick={() => coverInputRef.current?.click()}
                                        className="w-full flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl py-2.5 text-[12px] font-bold text-slate-600 dark:text-slate-300 transition-colors truncate"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
                                        {coverImageFile ? coverImageFile.name : 'Upload Cover'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl sm:rounded-b-3xl shrink-0 z-10">
                    <button onClick={onClose} className="px-6 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleUpload}
                        disabled={isUploading || isRecording}
                        className="px-8 py-2.5 bg-pink-500 text-white text-[13px] font-bold rounded-xl hover:bg-pink-600 transition-colors shadow-md shadow-pink-500/20 disabled:opacity-50">
                        {isUploading ? 'Publishing...' : 'Publish Episode'}
                    </button>
                </div>
            </div>
        </div>
    );
}
