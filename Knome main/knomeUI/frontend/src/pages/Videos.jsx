import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import UploadVideoModal from '../components/modals/UploadVideoModal';
import ReportModal from '../components/modals/ReportModal';
import SaveToCategoryModal from '../components/modals/SaveToCategoryModal';
import CommentsSection from '../components/video/CommentsSection';
import ArticleShareModal from '../components/modals/ArticleShareModal';
import { getVideos, getPlaylists, fetchPlaylists, savePlaylist, deletePlaylist, importYouTubePlaylist, fetchYouTubePlaylistDetails } from '../utils/videoService';
import sharedPlaylistsData from '../data/shared_playlists.json';

import { savedContentApi, getPersonalizedRecommendations, resolveMediaUrl, videosApi, interactionsApi, getInitialsAvatar } from '../utils/apiService';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

const VIDEO_PLACEHOLDER_THUMBNAIL = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">' +
    '<defs><linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#dc2626"/><stop offset="100%" stop-color="#ea580c"/></linearGradient></defs>' +
    '<rect width="100%" height="100%" fill="url(#vg)"/>' +
    '<circle cx="160" cy="80" r="28" fill="white" fill-opacity="0.2"/>' +
    '<polygon points="152,65 174,80 152,95" fill="white"/>' +
    '<text x="160" y="135" fill="white" font-size="12" font-weight="700" letter-spacing="1" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle" fill-opacity="0.95">VIDEO</text>' +
    '</svg>'
)}`;

const ENTERPRISE_COMMUNITIES = [
    { id: 1, name: 'Engineering & Tech', icon: 'developer_board' },
    { id: 2, name: 'HR & People Ops', icon: 'groups' },
    { id: 3, name: 'Product Design & UX', icon: 'palette' },
    { id: 4, name: 'AI & Data Science Lab', icon: 'psychology' },
    { id: 5, name: 'Finance & Accounting', icon: 'account_balance' },
    { id: 6, name: 'Marketing & Brand Strategy', icon: 'campaign' },
    { id: 7, name: 'CTO Leadership Circle', icon: 'military_tech' },
    { id: 8, name: 'General Discussion', icon: 'forum' }
];

function VideoPlayer({ video }) {
    const url = video?.sourceUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo = url.includes('vimeo.com');
    const isSharePoint = url.includes('sharepoint.com') || url.includes('onedrive.live.com');
    const isExternalEmbed = isYouTube || isVimeo || isSharePoint || url.includes('microsoftstream.com');

    const getEmbedUrl = (u) => {
        if (!u) return '';
        // If an individual video ID is present, play that specific video cleanly
        const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/);
        if (ytMatch && ytMatch[1]) {
            return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;
        }
        // Fallback for playlist series links without individual video IDs
        const pureListMatch = u.match(/(?:youtube\.com\/(?:playlist|embed\/videoseries)\?list=)([a-zA-Z0-9_-]+)/);
        if (pureListMatch && pureListMatch[1]) {
            return `https://www.youtube.com/embed/videoseries?list=${pureListMatch[1]}&autoplay=1`;
        }
        const vmMatch = u.match(/vimeo\.com\/(\d+)/);
        if (vmMatch && vmMatch[1]) return `https://player.vimeo.com/video/${vmMatch[1]}?autoplay=1`;
        if (isSharePoint) return u.includes('?') ? `${u}&action=embedview` : `${u}?action=embedview`;
        return u;
    };

    if (isExternalEmbed) {
        return (
            <iframe
                key={url}
                className="w-full aspect-video rounded-xl bg-black border-0"
                src={getEmbedUrl(url)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                title={video?.title || 'Video Stream'}
            />
        );
    }

    return (
        <video
            key={url}
            className="w-full aspect-video rounded-xl bg-black"
            controls
            autoPlay
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            preload="auto"
            poster={video?.thumbnail || 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1600&h=900'}
            onError={(e) => {
                console.warn('Media load fallback:', url);
                if (e.target && !e.target.src.includes('BigBuckBunny.mp4')) {
                    e.target.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                }
            }}
            src={resolveMediaUrl(url) || url}
        >
            Your browser does not support the video tag.
        </video>
    );
}

export default function Videos() {
    const { currentUser, users, awardRuleKarma } = useUser();
    const location = useLocation();
    const navigate = useNavigate();

    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [activeVideo, setActiveVideo] = useState(null);
    const [activeFilter, setActiveFilter] = useState('All');
    const [viewTab, setViewTab] = useState('videos'); // 'videos' | 'playlists'
    const [searchQuery, setSearchQuery] = useState('');
    const [savedMap, setSavedMap] = useState({});
    const [reportingVideo, setReportingVideo] = useState(null);
    const [savingVideoModal, setSavingVideoModal] = useState(null);
    const [videos, setVideos] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [activePlaylist, setActivePlaylist] = useState(null);
    const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
    const [newPlaylist, setNewPlaylist] = useState({
        title: '',
        description: '',
        category: 'Training & Tutorials',
        type: 'Series',
        selectedVideoIds: []
    });
    const [isLoading, setIsLoading] = useState(true);
    // Real-time views map: { [videoId]: count } read from localStorage
    const [viewsMap, setViewsMap] = useState({});

    // Engagement State
    const [liked, setLiked] = useState(false);
    const [disliked, setDisliked] = useState(false);
    const [currentViews, setCurrentViews] = useState(0);
    const [likesCount, setLikesCount] = useState(0);
    const [shareCount, setShareCount] = useState(0);
    const [showSharePanel, setShowSharePanel] = useState(false);
    const [shareTab, setShareTab] = useState('menu');
    const [selectedCommunityId, setSelectedCommunityId] = useState('');
    const [shareMessageNote, setShareMessageNote] = useState('');
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [descExpanded, setDescExpanded] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Load all saved view counts from localStorage into viewsMap
    const loadViewsMap = () => {
        const map = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('knome_video_views_')) {
                    const videoId = key.replace('knome_video_views_', '');
                    const count = parseInt(localStorage.getItem(key) || '0', 10);
                    if (!isNaN(count)) map[videoId] = count;
                }
            }
        } catch (e) {}
        setViewsMap(map);
    };

    // Helper: get display view count for a video (Strictly Knome platform views only)
    const getDisplayViews = (video) => {
        if (!video?.id) return '0';
        const saved = viewsMap[video.id];
        if (saved !== undefined && saved !== null) {
            return saved > 999 ? (saved / 1000).toFixed(1) + 'k' : String(saved);
        }
        if (typeof video.viewCount === 'number') {
            return video.viewCount > 999 ? (video.viewCount / 1000).toFixed(1) + 'k' : String(video.viewCount);
        }
        const str = String(video.views || '0').trim();
        if (str.includes('M') || str.includes('m')) return '0';
        const parsed = parseInt(str, 10);
        return isNaN(parsed) ? '0' : String(parsed);
    };

    // Helper: get display like count for a video (Strictly Knome platform likes only)
    const getDisplayLikes = (video) => {
        if (!video?.id) return 0;
        const savedLikes = localStorage.getItem(`knome_video_likes_${video.id}`);
        if (savedLikes !== null) {
            const p = parseInt(savedLikes, 10);
            if (!isNaN(p)) return p;
        }
        if (typeof video.likes === 'number') {
            if (video.likes > 10000 && video.sourceType === 'YouTube') return 0;
            return video.likes;
        }
        return 0;
    };

    const filters = ['All', 'Training & Tutorials', 'Townhalls', 'Engineering Tech Talks', 'Leadership Updates'];

    const fetchVideos = async () => {
        setIsLoading(true);
        const [data, plData] = await Promise.all([
            getVideos(),
            fetchPlaylists()
        ]);
        setVideos(data || []);
        setPlaylists(plData || []);
        setIsLoading(false);
    };

    const loadAllSavedVideos = useCallback(async () => {
        const map = {};
        try {
            const vMap = JSON.parse(localStorage.getItem('knome_saved_videos') || '{}');
            Object.assign(map, vMap);
        } catch {}
        try {
            const customList = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            customList.forEach(item => {
                const t = (item.contentType || '').toLowerCase();
                if (t === 'video') {
                    if (item.contentId) map[String(item.contentId)] = true;
                    if (item.id) map[String(item.id)] = true;
                }
            });
        } catch {}
        try {
            const bIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
            bIds.forEach(id => {
                map[String(id)] = true;
            });
        } catch {}
        setSavedMap({ ...map });

        // Authoritative sync from backend API if available
        try {
            const res = await savedContentApi.getSavedContent({ contentType: 'Videos', pageSize: 100 });
            const payload = res?.data ?? res;
            const items = payload?.items || (Array.isArray(payload) ? payload : []);
            items.forEach(item => {
                const id = String(item.contentId || item.id);
                if (id) map[id] = true;
            });
            setSavedMap({ ...map });
        } catch {}
    }, []);

    useEffect(() => {
        fetchVideos();
        loadViewsMap();
        loadAllSavedVideos();
    }, [loadAllSavedVideos]);

    // Automatic cross-window & background synchronization for playlists
    useEffect(() => {
        const handleSync = async () => {
            try {
                const refreshed = await fetchPlaylists();
                if (refreshed && Array.isArray(refreshed)) {
                    setPlaylists(refreshed);
                }
            } catch (_) {}
        };

        const onFocus = () => handleSync();
        const onVisibilityChange = () => {
            if (!document.hidden) handleSync();
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        const intervalId = setInterval(handleSync, 5000);

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearInterval(intervalId);
        };
    }, []);

    const [playlistImportMode, setPlaylistImportMode] = useState('yt_link'); // 'yt_link' | 'custom'
    const [ytPlaylistUrl, setYtPlaylistUrl] = useState('');
    const [ytSeriesTitle, setYtSeriesTitle] = useState('');
    const [ytAuthorName, setYtAuthorName] = useState('');
    const [ytEpisodeCount, setYtEpisodeCount] = useState(6);
    const [isFetchingYtMeta, setIsFetchingYtMeta] = useState(false);
    const [autoFetchedMeta, setAutoFetchedMeta] = useState(null);

    const autoFetchYtMetadata = async (url) => {
        if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) return;
        try {
            setIsFetchingYtMeta(true);
            const data = await fetchYouTubePlaylistDetails(url);
            if (data && data.success) {
                if (data.title) setYtSeriesTitle(data.title);
                if (data.author) setYtAuthorName(data.author);
                const epCount = data.episodeCount || (data.episodes ? data.episodes.length : 1);
                setYtEpisodeCount(epCount);
                setAutoFetchedMeta(data);
                showToast(`✨ Auto-fetched: "${data.title}" (${epCount} Episodes Detected)`);
            }
        } catch (e) {
            console.error('Failed to auto-fetch YouTube metadata:', e);
        } finally {
            setIsFetchingYtMeta(false);
        }
    };



    const handleYtUrlChange = (e) => {
        const val = e.target.value;
        setYtPlaylistUrl(val);
        if (val.trim().length > 15 && (val.includes('youtube.com') || val.includes('youtu.be'))) {
            autoFetchYtMetadata(val.trim());
        }
    };

    const isCurrentUserAdmin = currentUser?.roleName === 'HR Administrator' ||
                               currentUser?.roleName === 'System Administrator' ||
                               currentUser?.roleName === 'Community Admin' ||
                               (currentUser?.roleName && currentUser.roleName.toLowerCase().includes('admin')) ||
                               (currentUser?.role && currentUser.role.toLowerCase().includes('admin')) ||
                               currentUser?.isAdmin === true ||
                               currentUser?.name === 'Loveneesh Sharma';

    const canManagePlaylist = (pl) => {
        if (!pl) return false;
        if (isCurrentUserAdmin) return true;
        const currentId = currentUser?.id || currentUser?.userId;
        const currentName = (currentUser?.fullName || currentUser?.name || '').trim().toLowerCase();
        if (currentId && pl.authorId && String(pl.authorId) === String(currentId)) return true;
        if (currentName && pl.author && pl.author.trim().toLowerCase() === currentName) return true;
        return false;
    };

    const [deletingPlaylistModal, setDeletingPlaylistModal] = useState(null);
    const [editingPlaylist, setEditingPlaylist] = useState(null);
    const [editFormData, setEditFormData] = useState({
        title: '',
        description: '',
        category: 'Training & Tutorials',
        type: 'Series',
        selectedVideoIds: []
    });

    const handleDeletePlaylist = (playlist) => {
        setDeletingPlaylistModal(playlist);
    };

    const confirmDeletePlaylist = async () => {
        if (!deletingPlaylistModal) return;
        const targetId = deletingPlaylistModal.id;
        const title = deletingPlaylistModal.title;
        await deletePlaylist(targetId);
        const [updatedVideos, updatedPlaylists] = await Promise.all([
            getVideos(),
            fetchPlaylists()
        ]);
        setVideos(updatedVideos || []);
        setPlaylists(updatedPlaylists || []);

        if (activePlaylist && activePlaylist.id === targetId) {
            setActivePlaylist(null);
            setActiveVideo(null);
        }
        setDeletingPlaylistModal(null);
        showToast(`🗑️ Series "${title}" deleted successfully!`);
    };

    const handleOpenEditPlaylist = (pl) => {
        const existingIds = (pl.videoIds && pl.videoIds.length > 0)
            ? pl.videoIds
            : (pl.episodes ? pl.episodes.map(e => e.id) : []);
        setEditFormData({
            title: pl.title || '',
            description: pl.description || '',
            category: pl.category || 'Training & Tutorials',
            type: pl.type || 'Series',
            selectedVideoIds: existingIds
        });
        setEditingPlaylist(pl);
    };

    const handleUpdatePlaylistSubmit = async (e) => {
        e.preventDefault();
        if (!editingPlaylist || !editFormData.title.trim()) return;

        let updatedEpisodes = editingPlaylist.episodes || [];
        if (editFormData.selectedVideoIds && editFormData.selectedVideoIds.length > 0) {
            updatedEpisodes = editFormData.selectedVideoIds.map(id => {
                const foundInVideos = videos.find(v => String(v.id) === String(id));
                if (foundInVideos) return foundInVideos;
                const foundInOrig = (editingPlaylist.episodes || []).find(ep => String(ep.id) === String(id));
                return foundInOrig;
            }).filter(Boolean);
        }

        const updatedPl = {
            ...editingPlaylist,
            title: editFormData.title.trim(),
            description: editFormData.description.trim(),
            category: editFormData.category,
            type: editFormData.type,
            videoIds: editFormData.selectedVideoIds,
            episodes: updatedEpisodes,
            thumbnail: updatedEpisodes.length > 0 && updatedEpisodes[0]?.thumbnail
                ? updatedEpisodes[0].thumbnail
                : editingPlaylist.thumbnail
        };

        await savePlaylist(updatedPl);
        const updatedPlaylists = await fetchPlaylists();
        setPlaylists(updatedPlaylists || []);
        if (activePlaylist && activePlaylist.id === updatedPl.id) {
            setActivePlaylist({ ...updatedPl, videos: updatedEpisodes });
        }
        setEditingPlaylist(null);
        showToast(`✏️ Series "${updatedPl.title}" updated successfully!`);
    };

    const handleImportYtPlaylistSubmit = async (e) => {
        e.preventDefault();
        if (!ytPlaylistUrl.trim()) return;

        const authorNameToUse = (ytAuthorName || '').trim() || autoFetchedMeta?.author || currentUser?.fullName || currentUser?.name || 'Creator';
        const titleToUse = (ytSeriesTitle || '').trim() || autoFetchedMeta?.title || 'YouTube Playlist Series';

        const res = importYouTubePlaylist({
            playlistUrl: ytPlaylistUrl.trim(),
            title: titleToUse,
            author: authorNameToUse,
            category: newPlaylist.category || 'Training & Tutorials',
            episodeCount: ytEpisodeCount,
            user: currentUser,
            preloadedEpisodes: autoFetchedMeta?.episodes || []
        });

        await savePlaylist(res.playlist);
        try {
            const existingImp = JSON.parse(localStorage.getItem('knome_imported_yt_videos') || '[]');
            localStorage.setItem('knome_imported_yt_videos', JSON.stringify([...res.videos, ...existingImp]));
            await fetch('/api/shared-imported-videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos: res.videos })
            });
        } catch (e) {}

        const [updatedVideos, updatedPlaylists] = await Promise.all([
            getVideos(),
            fetchPlaylists()
        ]);
        setVideos(updatedVideos || []);
        setPlaylists(updatedPlaylists || []);

        setIsCreatePlaylistOpen(false);
        setYtPlaylistUrl('');
        setYtSeriesTitle('');
        setYtAuthorName('');
        setAutoFetchedMeta(null);

        // Immediately switch to Playlists & Series section with active video cleared
        setViewTab('playlists');
        setActiveVideo(null);
        setActivePlaylist(null);

        showToast(`🎉 Series "${res.playlist.title}" (${res.videos.length} Episodes) created successfully!`);
    };

    const handleCreatePlaylistSubmit = async (e) => {
        e.preventDefault();
        if (!newPlaylist.title.trim()) return;

        if (!newPlaylist.selectedVideoIds || newPlaylist.selectedVideoIds.length === 0) {
            showToast('⚠️ Please select at least one video to include in the series/playlist.');
            return;
        }

        const selectedVids = (newPlaylist.selectedVideoIds || []).map(id => videos.find(v => String(v.id) === String(id))).filter(Boolean);

        const playlistObj = {
            title: newPlaylist.title.trim(),
            description: newPlaylist.description.trim(),
            category: newPlaylist.category || 'Training & Tutorials',
            type: newPlaylist.type || 'Series',
            author: currentUser?.fullName || currentUser?.name || 'Meghna Tiwari',
            authorId: currentUser?.id || currentUser?.userId || 5,
            authorDesignation: currentUser?.roleName || 'Product Specialist',
            videoIds: newPlaylist.selectedVideoIds,
            episodes: selectedVids,
            thumbnail: selectedVids.length > 0 && selectedVids[0]?.thumbnail
                ? selectedVids[0].thumbnail
                : 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=90&w=1200'
        };

        const created = await savePlaylist(playlistObj);
        const updatedPlaylists = await fetchPlaylists();
        setPlaylists(updatedPlaylists || []);

        setIsCreatePlaylistOpen(false);
        setNewPlaylist({ title: '', description: '', category: 'Training & Tutorials', type: 'Series', selectedVideoIds: [] });

        // Immediately switch to Playlists & Series section with active video cleared
        setViewTab('playlists');
        setActiveVideo(null);
        setActivePlaylist(null);

        showToast(`🎉 ${created.type || 'Series'} "${created.title}" created successfully!`);
    };


    const handlePlayPlaylist = (playlist, startVideoIndex = 0, currentVideos = videos) => {
        const vList = Array.isArray(currentVideos) && currentVideos.length > 0 ? currentVideos : videos;
        let playlistVids = [];

        // 1. If playlist has its own real episodes array attached, use them directly
        if (Array.isArray(playlist.episodes) && playlist.episodes.length > 0) {
            playlistVids = playlist.episodes;
        } else if (Array.isArray(playlist.videoIds) && playlist.videoIds.length > 0) {
            playlistVids = playlist.videoIds.map((id, idx) => {
                let found = vList.find(v => (v.id || '').toString() === id.toString());
                if (!found) {
                    found = {
                        id: id,
                        title: `#${idx + 1}: Episode ${idx + 1} | ${playlist.title}`,
                        description: `Episode ${idx + 1} of ${playlist.title}.`,
                        thumbnail: playlist.thumbnail || 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&q=90&w=1200',
                        duration: 'Session',
                        views: '0',
                        likes: 0,
                        category: playlist.category || 'Training & Tutorials',
                        date: playlist.createdDate || 'Oct 1, 2026',
                        author: playlist.author || 'MPOnline Creator',
                        authorId: playlist.authorId || 5,
                        authorDesignation: playlist.authorDesignation || 'Product Specialist',
                        tags: ['Playlist', 'Series'],
                        sourceUrl: playlist.playlistUrl || (playlist.videoIds && playlist.videoIds[idx]) || `https://www.youtube.com/embed/videoseries?list=${playlist.id}&index=${idx + 1}`,
                        sourceType: 'YouTube'
                    };
                }
                return found;
            }).filter(Boolean);
        }

        if (playlistVids.length === 0) {
            playlistVids = vList.filter(v => v.category === playlist.category).slice(0, 6);
        }
        const finalVids = playlistVids.length > 0 ? playlistVids : vList.slice(0, 5);

        setActivePlaylist({ ...playlist, videos: finalVids });
        setActiveVideo(finalVids[startVideoIndex] || finalVids[0] || vList[0]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };




    // Auto-open video from notification URL params
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tId = params.get('id') || params.get('videoId') || location.state?.videoId;
        const tTitle = params.get('title') || location.state?.videoTitle;
        const tUrl = params.get('url') || location.state?.videoUrl;

        if (!isLoading && (tId || tTitle)) {
            let found = null;
            if (tId) found = videos.find(v => (v.id || '').toString() === tId.toString());
            if (!found && tTitle) {
                const tl = tTitle.toLowerCase().replace(/^[📹🎥🎬]\s*/, '').trim();
                found = videos.find(v => {
                    const vt = (v.title || '').toLowerCase().replace(/^[📹🎥🎬]\s*/, '').trim();
                    return vt === tl || vt.includes(tl) || tl.includes(vt);
                });
            }
            if (!found && tId && Array.isArray(playlists)) {
                for (const pl of playlists) {
                    if (Array.isArray(pl.episodes)) {
                        const ep = pl.episodes.find(e => String(e.id) === String(tId));
                        if (ep) { found = ep; break; }
                    }
                }
            }
            if (!found && Array.isArray(sharedPlaylistsData)) {
                for (const pl of sharedPlaylistsData) {
                    if (Array.isArray(pl.episodes)) {
                        const ep = pl.episodes.find(e => {
                            if (tId && String(e.id) === String(tId)) return true;
                            if (tTitle) {
                                const et = (e.title || '').toLowerCase().replace(/^[📹🎥🎬]\s*/, '').trim();
                                const targetTl = tTitle.toLowerCase().replace(/^[📹🎥🎬]\s*/, '').trim();
                                return et === targetTl || et.includes(targetTl) || targetTl.includes(et);
                            }
                            return false;
                        });
                        if (ep) { found = ep; break; }
                    }
                }
            }
            if (found) {
                setActiveVideo(found);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (tTitle || tUrl) {
                setActiveVideo({
                    id: tId || `notif_${Date.now()}`,
                    title: tTitle || 'Shared Video',
                    description: 'Video shared with you.',
                    thumbnail: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1600&h=900',
                    duration: 'Video',
                    category: 'Shared',
                    author: location.state?.senderName || 'Teammate',
                    tags: [],
                    sourceUrl: tUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                    sourceType: 'File',
                    views: '0', likes: 0, date: 'Today'
                });
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }, [location.search, location.state, videos, isLoading]);

    // Helper: is video saved / bookmarked
    const isVideoSaved = useCallback((videoOrId) => {
        if (!videoOrId) return false;
        const targetId = String(typeof videoOrId === 'object' ? (videoOrId.contentId || videoOrId.id) : videoOrId);
        if (!targetId) return false;
        if (savedMap[targetId]) return true;
        try {
            const bIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
            if (bIds.map(String).includes(targetId)) return true;
            const custom = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            if (custom.some(c => String(c.id) === targetId || String(c.contentId) === targetId)) return true;
            const vMap = JSON.parse(localStorage.getItem('knome_saved_videos') || '{}');
            if (vMap[targetId]) return true;
        } catch {}
        return false;
    }, [savedMap]);

    // Unsave video handler: cleans from savedMap and all storage keys, syncs with backend & SavedContent
    const handleUnsaveVideo = async (targetVideo) => {
        if (!targetVideo) return;
        const targetId = String(targetVideo.contentId || targetVideo.id);
        if (!targetId) return;

        // 1. Optimistically update savedMap state
        setSavedMap(prev => {
            const next = { ...prev };
            delete next[targetId];
            delete next[String(targetVideo.id)];
            return next;
        });

        // 2. Remove from legacy knome_saved_videos
        try {
            const savedDict = JSON.parse(localStorage.getItem('knome_saved_videos') || '{}');
            delete savedDict[targetId];
            delete savedDict[String(targetVideo.id)];
            localStorage.setItem('knome_saved_videos', JSON.stringify(savedDict));
        } catch {}

        // 3. Remove from knome_saved_items_custom
        try {
            const custom = JSON.parse(localStorage.getItem('knome_saved_items_custom') || '[]');
            const filtered = custom.filter(i => String(i.id) !== targetId && String(i.contentId) !== targetId);
            localStorage.setItem('knome_saved_items_custom', JSON.stringify(filtered));
        } catch {}

        // 4. Remove from knome_bookmarked_ids
        try {
            const bIds = JSON.parse(localStorage.getItem('knome_bookmarked_ids') || '[]');
            const filtered = bIds.filter(id => String(id) !== targetId);
            localStorage.setItem('knome_bookmarked_ids', JSON.stringify(filtered));
        } catch {}

        // 5. Clean up category mapping
        try {
            const catMap = JSON.parse(localStorage.getItem('knome_item_category_map') || '{}');
            delete catMap[`Video_${targetId}`];
            delete catMap[targetId];
            localStorage.setItem('knome_item_category_map', JSON.stringify(catMap));
        } catch {}

        // 6. Broadcast local & cross-tab events
        window.dispatchEvent(new CustomEvent('knome-bookmark-saved', {
            detail: { id: targetId, contentId: targetId, contentType: 'Video', removed: true }
        }));
        window.dispatchEvent(new CustomEvent('knome:bookmark-updated', {
            detail: { contentType: 'Video', contentId: targetId, isBookmarked: false }
        }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_items_custom' }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'knome_saved_videos' }));

        // 7. Toggle on backend API if numeric database ID
        if (/^\d+$/.test(targetId)) {
            try {
                await savedContentApi.toggleBookmark('Video', targetId);
            } catch (apiErr) {
                console.warn('Backend bookmark toggle notice (unsaved locally):', apiErr?.message);
            }
        }

        showToast('Removed from saved videos');
    };

    const handleSaveToggle = () => {
        if (!activeVideo) return;
        if (isVideoSaved(activeVideo)) {
            handleUnsaveVideo(activeVideo);
        } else {
            setSavingVideoModal({
                id: activeVideo.id,
                contentId: activeVideo.id,
                contentType: 'Video',
                title: activeVideo.title,
                text: activeVideo.description || activeVideo.title,
                description: activeVideo.description || activeVideo.title,
                image: activeVideo.thumbnail,
                thumbnail: activeVideo.thumbnail,
                author: activeVideo.author || 'MPOnline Creator',
                tags: activeVideo.tags || ['Video'],
                sourceUrl: activeVideo.sourceUrl,
                category: activeVideo.category || 'Training & Tutorials'
            });
        }
    };

    const handleVideoSaved = (savedItem) => {
        const sid = String(savedItem?.contentId || savedItem?.id || savingVideoModal?.id);
        setSavedMap(prev => {
            const next = { ...prev, [sid]: true };
            if (activeVideo?.id) next[String(activeVideo.id)] = true;
            return next;
        });
        try {
            const vMap = JSON.parse(localStorage.getItem('knome_saved_videos') || '{}');
            vMap[sid] = true;
            if (activeVideo?.id) vMap[String(activeVideo.id)] = true;
            localStorage.setItem('knome_saved_videos', JSON.stringify(vMap));
        } catch {}
        showToast('Bookmark saved successfully!');
    };

    // Sync engagement state when activeVideo changes
    useEffect(() => {
        if (!activeVideo) return;
        const initialLiked = activeVideo.isLiked ?? (localStorage.getItem(`knome_liked_video_${activeVideo.id}`) === 'true');
        setLiked(initialLiked);
        setDisliked(localStorage.getItem(`knome_disliked_video_${activeVideo.id}`) === 'true');

        // Shares
        const savedShares = localStorage.getItem(`knome_video_shares_${activeVideo.id}`);
        const initialShares = savedShares !== null ? parseInt(savedShares, 10) : (typeof activeVideo.shares === 'number' ? activeVideo.shares : 0);
        setShareCount(isNaN(initialShares) ? 0 : initialShares);

        const currentUid = currentUser?.userId || currentUser?.id || 'anon';
        const userViewKey = `knome_user_viewed_video_${currentUid}_${activeVideo.id}`;
        const hasViewedLocally = localStorage.getItem(userViewKey) === 'true';

        // Authoritative unique record in backend
        if (/^\d+$/.test(String(activeVideo.id))) {
            videosApi.recordView(activeVideo.id)
                .then(res => {
                    const authoritative = res?.data ?? res?.viewCount ?? res;
                    if (typeof authoritative === 'number') {
                        setCurrentViews(authoritative);
                        setViewsMap(prev => ({ ...prev, [activeVideo.id]: authoritative }));
                        localStorage.setItem(userViewKey, 'true');
                    }
                })
                .catch(() => {});

            // Load live reaction summary, share count, and liked status from API
            interactionsApi.getSummary('Video', activeVideo.id)
                .then(res => {
                    const summary = res?.data ?? res;
                    if (summary) {
                        if (summary.reactionSummary) {
                            const rSum = summary.reactionSummary;
                            const count = rSum.likeCount ?? rSum.totalCount ?? 0;
                            setLikesCount(count);
                            const isReactionLike = rSum.currentUserReactionType === 'Like';
                            setLiked(isReactionLike);
                            localStorage.setItem(`knome_video_likes_${activeVideo.id}`, count.toString());
                            localStorage.setItem(`knome_liked_video_${activeVideo.id}`, isReactionLike ? 'true' : 'false');
                        }
                        if (typeof summary.sharesCount === 'number') {
                            setShareCount(summary.sharesCount);
                            localStorage.setItem(`knome_video_shares_${activeVideo.id}`, summary.sharesCount.toString());
                        }
                        if (summary.isBookmarkedByCurrentUser) {
                            setSavedMap(prev => ({ ...prev, [String(activeVideo.id)]: true }));
                        }
                    }
                })
                .catch(() => {});
        } else {
            // Local / Series / YouTube video: Track views and likes on Knome platform only
            const viewKey = `knome_video_views_${activeVideo.id}`;
            let currentLocalViews = parseInt(localStorage.getItem(viewKey) || '0', 10);
            if (isNaN(currentLocalViews)) currentLocalViews = 0;

            if (!hasViewedLocally) {
                currentLocalViews += 1;
                localStorage.setItem(viewKey, currentLocalViews.toString());
                localStorage.setItem(userViewKey, 'true');
                setViewsMap(prev => ({ ...prev, [activeVideo.id]: currentLocalViews }));
            }
            setCurrentViews(currentLocalViews);

            const savedLikes = localStorage.getItem(`knome_video_likes_${activeVideo.id}`);
            const initialLikes = savedLikes !== null ? parseInt(savedLikes, 10) : (typeof activeVideo.likes === 'number' && activeVideo.likes < 10000 ? activeVideo.likes : 0);
            setLikesCount(isNaN(initialLikes) ? 0 : initialLikes);
        }

        setDescExpanded(false);
        setShowSharePanel(false);
        setShareTab('menu');
        setSelectedUserIds([]);
    }, [activeVideo, currentUser]);

    // Real-time listener for reaction and share updates broadcast over SignalR and cross-tab
    useEffect(() => {
        const handleReactionUpdated = (e) => {
            const detail = e.detail;
            if (!detail) return;
            if ((detail.contentType || '').toLowerCase() === 'video') {
                const contentIdStr = String(detail.contentId);
                const totalLikes = typeof detail.totalLikes === 'number'
                    ? detail.totalLikes
                    : (detail.reactionsSummary?.totalCount ?? detail.reactionsSummary?.likeCount);
                if (typeof totalLikes === 'number') {
                    if (activeVideo && String(activeVideo.id) === contentIdStr) {
                        setLikesCount(totalLikes);
                    }
                    setVideos(prev => prev.map(v => String(v.id) === contentIdStr ? { ...v, likes: totalLikes } : v));
                }
            }
        };

        const handleShareUpdated = (e) => {
            const detail = e.detail;
            if (!detail) return;
            if ((detail.contentType || '').toLowerCase() === 'video') {
                const contentIdStr = String(detail.contentId);
                const totalShares = typeof detail.sharesCount === 'number' ? detail.sharesCount : undefined;
                if (typeof totalShares === 'number') {
                    if (activeVideo && String(activeVideo.id) === contentIdStr) {
                        setShareCount(totalShares);
                    }
                    setVideos(prev => prev.map(v => String(v.id) === contentIdStr ? { ...v, shares: totalShares } : v));
                }
            }
        };

        const handleStorageChange = (e) => {
            if (!e.key) return;
            if (e.key === 'knome_saved_items_custom' || e.key === 'knome_saved_videos' || e.key === 'knome_bookmarked_ids') {
                loadAllSavedVideos();
            } else if (e.key === 'knome_cross_tab_reaction') {
                try {
                    const data = JSON.parse(e.newValue || '{}');
                    if (data.contentType === 'Video') {
                        if (activeVideo && String(data.contentId) === String(activeVideo.id)) {
                            setLikesCount(data.totalLikes);
                        }
                        setVideos(prev => prev.map(v => String(v.id) === String(data.contentId) ? { ...v, likes: data.totalLikes } : v));
                    }
                } catch {}
            } else if (e.key === 'knome_cross_tab_share') {
                try {
                    const data = JSON.parse(e.newValue || '{}');
                    if (data.contentType === 'Video') {
                        if (activeVideo && String(data.contentId) === String(activeVideo.id)) {
                            setShareCount(data.sharesCount);
                        }
                        setVideos(prev => prev.map(v => String(v.id) === String(data.contentId) ? { ...v, shares: data.sharesCount } : v));
                    }
                } catch {}
            }
        };

        window.addEventListener('knome:reaction-updated', handleReactionUpdated);
        window.addEventListener('knome:share-updated', handleShareUpdated);
        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('knome:reaction-updated', handleReactionUpdated);
            window.removeEventListener('knome:share-updated', handleShareUpdated);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [activeVideo, loadAllSavedVideos]);

    // Real-time listener for bookmarks
    useEffect(() => {
        const handleBookmarkSaved = (e) => {
            const detail = e.detail;
            if (!detail) return;
            const detailId = String(detail.contentId || detail.id || '');
            if (!detailId) return;
            if (detail.removed) {
                setSavedMap(prev => {
                    const next = { ...prev };
                    delete next[detailId];
                    return next;
                });
            } else {
                setSavedMap(prev => ({ ...prev, [detailId]: true }));
            }
        };
        const handleBookmarkUpdated = (e) => {
            const detail = e.detail;
            if (!detail) return;
            if ((detail.contentType || '').toLowerCase() === 'video') {
                const detailId = String(detail.contentId || '');
                if (detailId) {
                    setSavedMap(prev => {
                        const next = { ...prev };
                        if (detail.isBookmarked) {
                            next[detailId] = true;
                        } else {
                            delete next[detailId];
                        }
                        return next;
                    });
                }
            }
        };
        window.addEventListener('knome-bookmark-saved', handleBookmarkSaved);
        window.addEventListener('knome:bookmark-updated', handleBookmarkUpdated);
        return () => {
            window.removeEventListener('knome-bookmark-saved', handleBookmarkSaved);
            window.removeEventListener('knome:bookmark-updated', handleBookmarkUpdated);
        };
    }, []);

    const handleSelectVideo = (v) => {
        setActiveVideo(v);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleLike = async () => {
        if (!activeVideo) return;
        const uploaderAuthorId = activeVideo?.uploaderUserId || activeVideo?.authorId;
        const isSelf = uploaderAuthorId && String(uploaderAuthorId) === String(currentUser?.id || currentUser?.userId);
        const nextLiked = !liked;
        const prevCount = likesCount;
        const newCount = nextLiked ? likesCount + 1 : Math.max(0, likesCount - 1);

        // Optimistic UI update
        setLiked(nextLiked);
        setLikesCount(newCount);
        localStorage.setItem(`knome_liked_video_${activeVideo.id}`, nextLiked ? 'true' : 'false');
        localStorage.setItem(`knome_video_likes_${activeVideo.id}`, newCount.toString());

        // Update in video list state so grids/sidebars update instantly
        setVideos(prev => prev.map(v => String(v.id) === String(activeVideo.id) ? { ...v, likes: newCount, isLiked: nextLiked } : v));

        if (nextLiked) {
            if (disliked) {
                setDisliked(false);
                localStorage.removeItem(`knome_disliked_video_${activeVideo.id}`);
            }
            if (awardRuleKarma && uploaderAuthorId && !isSelf) {
                awardRuleKarma(uploaderAuthorId, 'LIKE_RECEIVED');
            }
            showToast(`Liked video! ${!isSelf ? '+1 Karma awarded to ' + (activeVideo.author || 'creator') : ''}`);
        } else {
            localStorage.removeItem(`knome_liked_video_${activeVideo.id}`);
        }

        // Broadcast real-time reaction update for current and cross tabs
        const reactionPayload = {
            contentType: 'Video',
            contentId: activeVideo.id,
            totalLikes: newCount,
            reactionsSummary: {
                likeCount: newCount,
                totalCount: newCount,
                currentUserReactionType: nextLiked ? 'Like' : null
            }
        };
        window.dispatchEvent(new CustomEvent('knome:reaction-updated', { detail: reactionPayload }));
        localStorage.setItem('knome_cross_tab_reaction', JSON.stringify({
            contentType: 'Video',
            contentId: String(activeVideo.id),
            totalLikes: newCount,
            action: nextLiked ? 'Like' : 'Unlike',
            time: Date.now()
        }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'knome_cross_tab_reaction' }));

        // Call backend API for persistence & global SignalR broadcast if numeric ID
        if (/^\d+$/.test(String(activeVideo.id))) {
            try {
                const res = await interactionsApi.toggleReaction('Video', activeVideo.id, { reactionType: 'Like' });
                const summary = res?.data ?? res;
                if (summary && summary.totalCount !== undefined) {
                    const finalCount = summary.likeCount ?? summary.totalCount;
                    setLikesCount(finalCount);
                    const serverLiked = summary.currentUserReactionType === 'Like';
                    setLiked(serverLiked);
                    localStorage.setItem(`knome_video_likes_${activeVideo.id}`, finalCount.toString());
                    localStorage.setItem(`knome_liked_video_${activeVideo.id}`, serverLiked ? 'true' : 'false');
                    setVideos(prev => prev.map(v => String(v.id) === String(activeVideo.id) ? { ...v, likes: finalCount, isLiked: serverLiked } : v));
                }
            } catch (err) {
                console.error('Failed to toggle video like on server:', err);
                // Revert on failure
                setLiked(!nextLiked);
                setLikesCount(prevCount);
                localStorage.setItem(`knome_liked_video_${activeVideo.id}`, (!nextLiked) ? 'true' : 'false');
                localStorage.setItem(`knome_video_likes_${activeVideo.id}`, prevCount.toString());
                showToast('Failed to update like. Please try again.', 'error');
            }
        }
    };

    const handleDislike = () => {
        if (!activeVideo) return;
        if (!disliked) {
            setDisliked(true);
            localStorage.setItem(`knome_disliked_video_${activeVideo.id}`, 'true');
            if (liked) {
                setLiked(false);
                const newCount = Math.max(0, likesCount - 1);
                setLikesCount(newCount);
                localStorage.removeItem(`knome_liked_video_${activeVideo.id}`);
                localStorage.setItem(`knome_video_likes_${activeVideo.id}`, newCount.toString());
                setVideos(prev => prev.map(v => String(v.id) === String(activeVideo.id) ? { ...v, likes: newCount, isLiked: false } : v));

                const reactionPayload = {
                    contentType: 'Video',
                    contentId: activeVideo.id,
                    totalLikes: newCount,
                    reactionsSummary: { likeCount: newCount, totalCount: newCount, currentUserReactionType: 'Dislike' }
                };
                window.dispatchEvent(new CustomEvent('knome:reaction-updated', { detail: reactionPayload }));
                localStorage.setItem('knome_cross_tab_reaction', JSON.stringify({
                    contentType: 'Video',
                    contentId: String(activeVideo.id),
                    totalLikes: newCount,
                    action: 'Dislike',
                    time: Date.now()
                }));
                window.dispatchEvent(new StorageEvent('storage', { key: 'knome_cross_tab_reaction' }));
            }
            showToast('Feedback recorded (Disliked)');
        } else {
            setDisliked(false);
            localStorage.removeItem(`knome_disliked_video_${activeVideo.id}`);
        }
    };

    const handleVideoShared = (shareType = 'share', count = 1) => {
        if (!activeVideo) return;
        const inc = typeof count === 'number' && count > 0 ? count : 1;
        const newShares = shareCount + inc;
        setShareCount(newShares);
        localStorage.setItem(`knome_video_shares_${activeVideo.id}`, newShares.toString());

        // Update in video list
        setVideos(prev => prev.map(v => String(v.id) === String(activeVideo.id) ? { ...v, shares: newShares } : v));

        // Award karma if applicable
        const uploaderAuthorId = activeVideo?.uploaderUserId || activeVideo?.authorId;
        const isSelf = uploaderAuthorId && String(uploaderAuthorId) === String(currentUser?.id || currentUser?.userId);
        if (awardRuleKarma && uploaderAuthorId && !isSelf) {
            awardRuleKarma(uploaderAuthorId, 'SHARE_RECEIVED');
        }

        // Dispatch local and cross-tab events
        window.dispatchEvent(new CustomEvent('knome:share-updated', {
            detail: {
                contentType: 'Video',
                contentId: activeVideo.id,
                sharesCount: newShares
            }
        }));
        localStorage.setItem('knome_cross_tab_share', JSON.stringify({
            contentType: 'Video',
            contentId: String(activeVideo.id),
            sharesCount: newShares,
            time: Date.now()
        }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'knome_cross_tab_share' }));

        // Record on backend if numeric ID
        if (/^\d+$/.test(String(activeVideo.id))) {
            interactionsApi.shareContent('Video', activeVideo.id, 'Direct', null).catch(() => {});
        }
    };

    const handleCopyLink = () => {
        if (!activeVideo) return;
        const shareUrl = `${window.location.origin}/videos?id=${activeVideo.id}&title=${encodeURIComponent(activeVideo.title)}`;
        navigator.clipboard.writeText(shareUrl);
        showToast('🔗 Video link copied to clipboard!');
        handleVideoShared('link', 1);
        setShowSharePanel(false);
    };


    const rawFiltered = videos.filter(v =>
        (activeFilter === 'All' || v.category === activeFilter) &&
        (!searchQuery || v.title?.toLowerCase().includes(searchQuery.toLowerCase()) || (v.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
    );
    const filteredVideos = rawFiltered;

    const filteredPlaylists = playlists.filter(pl => {
        const matchesFilter = activeFilter === 'All' || pl.category === activeFilter;
        const q = (searchQuery || '').trim().toLowerCase();
        const matchesSearch = !q ||
            (pl.title || '').toLowerCase().includes(q) ||
            (pl.description || '').toLowerCase().includes(q) ||
            (pl.author || '').toLowerCase().includes(q) ||
            (pl.channelName || '').toLowerCase().includes(q) ||
            (pl.category || '').toLowerCase().includes(q);
        return matchesFilter && matchesSearch;
    });

    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(filteredVideos.length, 8, 8);

    useEffect(() => {
        resetScrollLoading();
    }, [activeFilter, viewTab, searchQuery, resetScrollLoading]);

    const sideVideos = activeVideo
        ? videos.filter(v => v.id !== activeVideo.id)
        : filteredVideos;

    const activeUsersList = (users || [
        { id: 2, name: 'Priya Verma', roleName: 'Product Lead', department: 'UI/UX' },
        { id: 3, name: 'Sourabh Sahu', roleName: 'Community Admin', department: 'HR' },
        { id: 4, name: 'Vishendra Sharma', roleName: 'AI Engineer', department: 'AI Lab' },
        { id: 5, name: 'Mayur Verma', roleName: 'UX Researcher', department: 'Product' },
    ]).filter(u => {
        const uId = u.id || u.userId;
        if (String(uId) === String(currentUser?.id)) return false;
        if (!userSearchQuery) return true;
        const q = userSearchQuery.toLowerCase();
        return (u.name || '').toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q);
    });

    return (
        <>
            {/* Upload Video Modal */}
            <UploadVideoModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onVideoUploaded={fetchVideos} />
            <ReportModal 
                isOpen={!!reportingVideo} 
                onClose={() => setReportingVideo(null)} 
                targetType="Video" 
                targetId={reportingVideo?.videoId || reportingVideo?.id || 1} 
                targetName={reportingVideo?.uploaderFullName || reportingVideo?.author || 'Creator'} 
                targetUserId={reportingVideo?.uploaderUserId || reportingVideo?.authorId}
                targetContent={reportingVideo?.title || reportingVideo?.description || ''}
            />
            <SaveToCategoryModal isOpen={!!savingVideoModal} onClose={() => setSavingVideoModal(null)} item={savingVideoModal} onSaved={handleVideoSaved} />

            {/* Create Playlist / Series Modal */}
            {/* Create Playlist / Series Modal */}
            {isCreatePlaylistOpen && (
                <div className="fixed inset-0 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200"
                    onClick={() => setIsCreatePlaylistOpen(false)}>
                    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] my-auto animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}>
                        
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4 sm:p-5 shrink-0 bg-white dark:bg-slate-900 z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/25 shrink-0">
                                    <span className="material-symbols-outlined text-[22px]">playlist_add</span>
                                </div>
                                <div>
                                    <h3 className="font-black text-base text-slate-900 dark:text-white">Create or Import Series</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Import YouTube Playlist or create a custom video series</p>
                                </div>
                            </div>
                            <button onClick={() => setIsCreatePlaylistOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                            {/* Modal Tab Switcher */}
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                                <button type="button" onClick={() => setPlaylistImportMode('yt_link')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${playlistImportMode === 'yt_link' ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                    <span className="material-symbols-outlined text-[16px]">play_circle</span>
                                    Import YouTube Playlist Link
                                </button>
                                <button type="button" onClick={() => setPlaylistImportMode('custom')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${playlistImportMode === 'custom' ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                    <span className="material-symbols-outlined text-[16px]">video_library</span>
                                    Custom Playlist
                                </button>
                            </div>

                            {playlistImportMode === 'yt_link' ? (
                                <form onSubmit={handleImportYtPlaylistSubmit} className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">YouTube Playlist URL or Video Link *</label>
                                            {isFetchingYtMeta && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                                    <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                                                    Auto-fetching playlist details...
                                                </span>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 text-[18px]">link</span>
                                            <input type="url" required
                                                placeholder="e.g. https://www.youtube.com/watch?v=ajDRvxDWH4w&list=PLGjplNEQ1it_oTvuLRNqX"
                                                value={ytPlaylistUrl} onChange={handleYtUrlChange}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                                        </div>
                                        {autoFetchedMeta ? (
                                            <div className="mt-2 space-y-2">
                                                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="material-symbols-outlined text-[18px] text-emerald-500 shrink-0">check_circle</span>
                                                        <span className="truncate">Auto-Fetched: <span className="text-slate-900 dark:text-white font-extrabold">{autoFetchedMeta.title}</span> by <span className="text-emerald-600 dark:text-emerald-300">{autoFetchedMeta.author}</span></span>
                                                    </div>
                                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-[10px] font-extrabold border border-emerald-200 dark:border-emerald-500/30 shrink-0">
                                                        {autoFetchedMeta.episodeCount || autoFetchedMeta.episodes?.length || ytEpisodeCount} Episodes Detected
                                                    </span>
                                                </div>
                                                {Array.isArray(autoFetchedMeta.episodes) && autoFetchedMeta.episodes.length > 0 && (
                                                    <div className="max-h-28 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                                                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Detected Real Episodes ({autoFetchedMeta.episodes.length}):</p>
                                                        {autoFetchedMeta.episodes.slice(0, 6).map((ep, idx) => (
                                                            <div key={idx} className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                                                                <span className="w-4 h-4 rounded bg-indigo-500/20 text-indigo-500 font-bold text-[9px] flex items-center justify-center shrink-0">{idx + 1}</span>
                                                                <span className="truncate">{ep.title}</span>
                                                            </div>
                                                        ))}
                                                        {autoFetchedMeta.episodes.length > 6 && (
                                                            <p className="text-[10px] text-slate-400 font-semibold pl-6">+ {autoFetchedMeta.episodes.length - 6} more episodes</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Paste any YouTube link — title, channel & episode count will be auto-detected!</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Series Title</label>
                                            <input type="text" placeholder="e.g. JavaScript Tutorials for Beginners"
                                                value={ytSeriesTitle} onChange={e => setYtSeriesTitle(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Channel / Creator Name</label>
                                            <input type="text" placeholder="e.g. CodeWithHarry"
                                                value={ytAuthorName} onChange={e => setYtAuthorName(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                                            <select value={newPlaylist.category} onChange={e => setNewPlaylist(p => ({ ...p, category: e.target.value }))}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all">
                                                <option value="Training & Tutorials">Training & Tutorials</option>
                                                <option value="Engineering Tech Talks">Engineering Tech Talks</option>
                                                <option value="Townhalls">Townhalls</option>
                                                <option value="Leadership Updates">Leadership Updates</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Episodes to Import</label>
                                            <input type="number" min="1" max="50" value={ytEpisodeCount} onChange={e => setYtEpisodeCount(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all" />
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition-all">
                                            <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                                            Import & Save Series
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={handleCreatePlaylistSubmit} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Type</label>
                                            <select value={newPlaylist.type} onChange={e => setNewPlaylist(p => ({ ...p, type: e.target.value }))}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all">
                                                <option value="Series">🎓 Masterclass Series</option>
                                                <option value="Playlist">📺 Standard Playlist</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                                            <select value={newPlaylist.category} onChange={e => setNewPlaylist(p => ({ ...p, category: e.target.value }))}
                                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all">
                                                <option value="Training & Tutorials">Training & Tutorials</option>
                                                <option value="Townhalls">Townhalls</option>
                                                <option value="Engineering Tech Talks">Engineering Tech Talks</option>
                                                <option value="Leadership Updates">Leadership Updates</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Title</label>
                                        <input type="text" required placeholder="e.g. Advanced Microservices & Cloud Security Masterclass"
                                            value={newPlaylist.title} onChange={e => setNewPlaylist(p => ({ ...p, title: e.target.value }))}
                                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                        <textarea rows={2} placeholder="Summary of what employees will learn in this playlist series..."
                                            value={newPlaylist.description} onChange={e => setNewPlaylist(p => ({ ...p, description: e.target.value }))}
                                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Select Videos to Include ({newPlaylist.selectedVideoIds.length} selected)</label>
                                        <div className="max-h-44 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-800 p-2 rounded-2xl bg-slate-50 dark:bg-slate-950/50 space-y-1">
                                            {videos.map(v => {
                                                const checked = newPlaylist.selectedVideoIds.includes(v.id);
                                                return (
                                                    <label key={v.id} className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'}`}>
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <img src={v.thumbnail} alt={v.title} onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }} className="w-10 aspect-video rounded-lg object-cover shrink-0" />
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-slate-900 dark:text-slate-200 line-clamp-1">{v.title}</p>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400">{v.author} · {v.category}</p>
                                                            </div>
                                                        </div>
                                                        <input type="checkbox" checked={checked}
                                                            onChange={() => setNewPlaylist(p => ({
                                                                ...p,
                                                                selectedVideoIds: checked ? p.selectedVideoIds.filter(i => i !== v.id) : [...p.selectedVideoIds, v.id]
                                                            }))}
                                                            className="accent-indigo-600 cursor-pointer w-4 h-4 shrink-0" />
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button type="button" onClick={() => setIsCreatePlaylistOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors">Cancel</button>
                                        <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-red-500/25 flex items-center justify-center gap-1.5 transition-all">
                                            <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                                            Create {newPlaylist.type}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}


            <main className="flex-1 w-full min-w-0 flex flex-col gap-6 pb-6">

                {/* ── PAGE TITLE & HERO HEADER ── */}
                <div className="relative rounded-2xl overflow-hidden mb-2 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-7 md:px-8 md:py-8 gap-6">
                    {/* Background effects */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-red-100/60 dark:from-red-950/30 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-red-400/10 dark:bg-red-500/10 blur-[80px] pointer-events-none" />
                    
                    {/* Light Streaks behind text */}
                    <div className="absolute top-[35%] left-0 w-[60%] h-[1px] bg-gradient-to-r from-red-300/40 dark:from-red-400/20 to-transparent" />
                    <div className="absolute top-[50%] left-0 w-[40%] h-[2px] bg-gradient-to-r from-rose-300/40 dark:from-rose-400/20 to-transparent blur-[1px]" />
                    <div className="absolute top-[65%] left-0 w-[50%] h-[1px] bg-gradient-to-r from-orange-300/40 dark:from-orange-400/20 to-transparent" />

                    {/* Content Left */}
                    <div className="relative z-10 flex flex-col items-start max-w-3xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-red-500/30 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[15px]">videocam</span>
                            Enterprise Media Hub
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-2 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 dark:from-red-400 dark:via-rose-400 dark:to-orange-400">
                                Video Streaming & Masterclass Series
                            </span>
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                            Browse technical talks, townhalls, full courses, and employee learning sessions.
                        </p>
                    </div>

                    {/* Action Right */}
                    <div className="relative z-10 shrink-0 flex items-center gap-2.5 w-full md:w-auto mt-2 md:mt-0">
                        <button onClick={() => setIsCreatePlaylistOpen(true)}
                            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-slate-200/80 dark:border-slate-700/80 transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                            Create Series
                        </button>
                        {currentUser?.role !== 'SYSADM' && (
                            <button onClick={() => setIsUploadOpen(true)}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all cursor-pointer active:scale-95">
                                <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                                Upload Video
                            </button>
                        )}
                    </div>
                </div>

                {/* ── TOP CONTROL BAR ── */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-xs">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Tab Switcher: Videos vs Playlists */}
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                            <button onClick={() => { setViewTab('videos'); setActiveVideo(null); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${viewTab === 'videos' ? 'bg-red-600 text-white shadow-md shadow-red-600/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                <span className="material-symbols-outlined text-[16px]">video_library</span>
                                Videos ({filteredVideos.length})
                            </button>
                            <button onClick={() => { setViewTab('playlists'); setActiveVideo(null); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${viewTab === 'playlists' ? 'bg-red-600 text-white shadow-md shadow-red-600/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                <span className="material-symbols-outlined text-[16px]">playlist_play</span>
                                Playlists & Series ({filteredPlaylists.length})
                            </button>
                        </div>

                        <div className="flex overflow-x-auto custom-scrollbar gap-1.5 p-1 rounded-xl">
                            {filters.map(f => (
                                <button key={f} onClick={() => { setActiveFilter(f); setActiveVideo(null); }}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                                        activeFilter === f 
                                            ? 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400 shadow-xs' 
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}>
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative min-w-[220px]">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                        <input type="text" placeholder="Search videos or series..." value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-red-500 outline-none text-slate-900 dark:text-white transition-all" />
                    </div>
                </div>



                {/* ── YOUTUBE-STYLE LAYOUT ── */}
                {activeVideo ? (
                    /* ── VIDEO WATCH PAGE ── */
                    <div className="flex flex-col xl:flex-row gap-6">

                        {/* LEFT: Player + Details + Comments */}
                        <div className="flex-1 min-w-0">

                            {/* Player */}
                            <div className="w-full rounded-2xl overflow-hidden bg-black shadow-2xl shadow-slate-900/40">
                                <VideoPlayer video={activeVideo} />
                            </div>

                            {/* Title & Meta */}
                            <div className="mt-4 space-y-3">
                                <h1 className="text-xl font-black text-slate-900 dark:text-white leading-snug">{activeVideo.title}</h1>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    {/* Views + Date + Category */}
                                    <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 font-semibold">
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[16px] text-cyan-500">visibility</span>
                                            {currentViews > 999 ? (currentViews / 1000).toFixed(1) + 'k' : currentViews} views
                                        </span>
                                        <span>•</span>
                                        <span>{activeVideo.date || 'Today'}</span>
                                        <span>•</span>
                                        <button onClick={() => { setActiveFilter(activeVideo.category || 'All'); setActiveVideo(null); }}
                                            className="bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-400 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer"
                                            title="Filter videos by this category">
                                            {activeVideo.category || 'General'}
                                        </button>
                                    </div>

                                    {/* Action Buttons — YouTube style */}
                                    <div className="flex items-center gap-2">
                                        {/* Like */}
                                        <button onClick={handleLike}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${liked ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>thumb_up</span>
                                            <span>{likesCount}</span>
                                        </button>

                                        {/* Dislike */}
                                        <button onClick={handleDislike}
                                            className={`flex items-center gap-1 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${disliked ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: disliked ? "'FILL' 1" : "'FILL' 0" }}>thumb_down</span>
                                        </button>

                                        {/* Share */}
                                        <button onClick={() => { setShowSharePanel(true); setShareTab('menu'); }}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${showSharePanel ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]">share</span>
                                            <span>Share {shareCount > 0 ? `(${shareCount})` : ''}</span>
                                        </button>

                                        {/* Save */}
                                        <button onClick={handleSaveToggle}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${isVideoSaved(activeVideo) ? 'bg-amber-400 text-slate-900 shadow-md shadow-amber-400/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                            title={isVideoSaved(activeVideo) ? 'Remove bookmark' : 'Save video'}>
                                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: isVideoSaved(activeVideo) ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
                                            <span>{isVideoSaved(activeVideo) ? 'Saved' : 'Save'}</span>
                                        </button>

                                        {/* Report */}
                                        <button onClick={() => setReportingVideo(activeVideo)}
                                            className="flex items-center gap-1 px-3 py-2 rounded-full text-[13px] font-bold bg-slate-100 dark:bg-slate-800 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                                            title="Report video">
                                            <span className="material-symbols-outlined text-[18px]">flag</span>
                                        </button>
                                    </div>
                                </div>


                                {/* ── SHARE MODAL POPUP ── */}
                                <ArticleShareModal 
                                    isOpen={showSharePanel}
                                    onClose={() => setShowSharePanel(false)}
                                    item={activeVideo}
                                    contentType="Video"
                                    onShared={handleVideoShared}
                                />


                                {/* Channel / Author Info (Uploader) */}
                                <div className="flex items-center gap-4 py-4 border-t border-b border-slate-200 dark:border-slate-800">
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md overflow-hidden">
                                            {activeVideo.authorAvatar
                                                ? <img src={resolveMediaUrl(activeVideo.authorAvatar)} alt={activeVideo.author} onError={(e) => { e.target.onerror = null; e.target.src = getInitialsAvatar(activeVideo.author); }} className="w-full h-full object-cover" />
                                                : (activeVideo.author || 'U').charAt(0).toUpperCase()
                                            }
                                        </div>
                                        {/* Uploader badge */}
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-white dark:border-slate-900 flex items-center justify-center shadow-sm" title="Video Uploader">
                                            <span className="material-symbols-outlined text-white text-[11px]">cloud_upload</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-black text-sm text-slate-900 dark:text-white">{activeVideo.author || 'Enterprise Creator'}</p>
                                            <span className="inline-flex items-center gap-1 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800">
                                                <span className="material-symbols-outlined text-[11px]">verified</span>
                                                Uploader
                                            </span>
                                        </div>
                                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                                            {activeVideo.authorDesignation
                                                ? <><span className="font-semibold text-slate-600 dark:text-slate-300">{activeVideo.authorDesignation}</span> · MPOnline</>
                                                : <>MPOnline Enterprise</>
                                            }
                                            {activeVideo.category && <> · <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{activeVideo.category}</span></>}
                                        </p>
                                    </div>
                                </div>


                                {/* Description */}
                                <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                    <div className={`${descExpanded ? '' : 'line-clamp-3'} whitespace-pre-wrap`}>
                                        {activeVideo.description || 'Enterprise Video Stream — MPOnline Knowledge Platform.'}
                                        {'\n\n'}
                                        <span className="text-slate-400 text-xs">
                                            {(activeVideo.tags || []).map(t => `#${t}`).join(' ')}
                                        </span>
                                    </div>
                                    <button onClick={() => setDescExpanded(p => !p)}
                                        className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-cyan-500 transition-colors cursor-pointer">
                                        {descExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                </div>
                            </div>

                            {/* ── COMMENTS SECTION ── */}
                            <CommentsSection
                                videoId={activeVideo.id}
                                currentUser={currentUser}
                                authorId={activeVideo.uploaderUserId || activeVideo.authorId}
                                awardRuleKarma={awardRuleKarma}
                            />
                        </div>

                        {/* RIGHT: Recommended Videos Sidebar */}
                        <div className="xl:w-96 shrink-0">
                            {/* YouTube Playlist Sidebar Widget */}
                            {activePlaylist && (
                                <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 mb-6 shadow-xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                            <span className="material-symbols-outlined text-[13px]">playlist_play</span>
                                            {activePlaylist.type || 'Playlist'}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setActiveVideo(null); setActivePlaylist(null); setViewTab('playlists'); }}
                                                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer">
                                                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                                                All Series
                                            </button>
                                            <span className="text-slate-600">·</span>
                                            <button onClick={() => setActivePlaylist(null)} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-white line-clamp-1">{activePlaylist.title}</h3>
                                        <p className="text-[11px] text-slate-300 mt-0.5 font-medium">
                                            Created by <span className="text-cyan-400 font-bold">{activePlaylist.author || 'Meghna Tiwari'}</span> · Episode { (activePlaylist.videos || []).findIndex(v => String(v.id) === String(activeVideo?.id)) + 1 } of {(activePlaylist.videos || []).length}
                                        </p>

                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5 pt-2 border-t border-slate-800">
                                        {(activePlaylist.videos || []).map((pv, idx) => {
                                            const isPlaying = String(pv.id) === String(activeVideo?.id);
                                            return (
                                                <div key={pv.id} onClick={() => setActiveVideo(pv)}
                                                    className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${isPlaying ? 'bg-indigo-500/20 border border-indigo-500/40 text-white' : 'hover:bg-slate-800/80 text-slate-300'}`}>
                                                    <span className="text-[11px] font-bold text-slate-400 w-4 text-center shrink-0">{idx + 1}</span>
                                                    <img src={pv.thumbnail} alt={pv.title} onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }} className="w-12 aspect-video rounded-lg object-cover shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-xs font-bold line-clamp-1 ${isPlaying ? 'text-indigo-400' : ''}`}>{pv.title}</p>
                                                        <p className="text-[10px] text-slate-400">{pv.duration || 'Video'}</p>
                                                    </div>
                                                    {isPlaying && <span className="material-symbols-outlined text-indigo-400 text-sm shrink-0">equalizer</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-black text-slate-900 dark:text-white">More Videos</h2>
                                <button onClick={() => { setActiveVideo(null); setActivePlaylist(null); }}
                                    className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-cyan-500 transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-[16px]">grid_view</span> All Videos
                                </button>
                            </div>
                            <div className="flex flex-col gap-3">
                                {(sideVideos.length === 0 ? filteredVideos : sideVideos).slice(0, 15).map(v => (
                                    <div key={v.id} onClick={() => handleSelectVideo(v)}
                                        className="flex gap-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl p-2 -mx-2 transition-all">
                                        {/* Thumbnail */}
                                        <div className="relative shrink-0 w-40 aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800">
                                            <img src={v.thumbnail} alt={v.title}
                                                onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <span className="material-symbols-outlined text-white text-[28px]">play_circle</span>
                                            </div>
                                            <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">{v.duration}</span>
                                        </div>
                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 group-hover:text-cyan-500 transition-colors leading-snug mb-1">{v.title}</h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{v.author || 'Creator'}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{getDisplayViews(v)} views · {getDisplayLikes(v)} likes · {v.date}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : viewTab === 'playlists' ? (
                    /* ── PLAYLISTS & SERIES BROWSE VIEW ── */
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">Enterprise Playlists & Masterclass Series</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Curated multi-part training series, technical courses, and townhall playlists</p>
                            </div>
                            <button onClick={() => setIsCreatePlaylistOpen(true)}
                                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                                Create Series / Playlist
                            </button>
                        </div>

                        {filteredPlaylists.length === 0 ? (
                            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4">
                                <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 mx-auto flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl">playlist_play</span>
                                </div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">No Series or Playlists Found</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                                    {searchQuery || activeFilter !== 'All' 
                                        ? 'No results match your active search or category filter. Try clearing filters.' 
                                        : 'Create your first enterprise multi-part series or import a YouTube playlist above!'}
                                </p>
                                <button onClick={() => setIsCreatePlaylistOpen(true)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-500 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-500/20">
                                    <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                                    Create Series / Playlist
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredPlaylists.map(pl => {
                                    const plVids = (Array.isArray(pl.episodes) && pl.episodes.length > 0)
                                        ? pl.episodes
                                        : (pl.videoIds || []).map(id => videos.find(v => String(v.id) === String(id))).filter(Boolean);
                                    const count = (Array.isArray(pl.episodes) && pl.episodes.length > 0)
                                        ? pl.episodes.length
                                        : (plVids.length || (pl.videoIds?.length || 0));
                                    const canManage = canManagePlaylist(pl);
                                    return (
                                        <div key={pl.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 group flex flex-col">
                                            {/* Thumbnail Card */}
                                            <div className="relative aspect-video overflow-hidden bg-slate-900 cursor-pointer" onClick={() => handlePlayPlaylist(pl)}>
                                                <img src={pl.thumbnail || VIDEO_PLACEHOLDER_THUMBNAIL}
                                                    alt={pl.title}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                                                <div className="absolute top-3 left-3 flex gap-2">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-md ${pl.type === 'Series' ? 'bg-indigo-600' : 'bg-cyan-600'}`}>
                                                        {pl.type || 'Series'}
                                                    </span>
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-slate-200 backdrop-blur-md">
                                                        {pl.category}
                                                    </span>
                                                </div>

                                                {canManage && (
                                                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                                                        <button onClick={(e) => { e.stopPropagation(); handleOpenEditPlaylist(pl); }}
                                                            className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-105"
                                                            title="Edit Series">
                                                            <span className="material-symbols-outlined text-[15px]">edit</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl); }}
                                                            className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-105"
                                                            title="Delete Series">
                                                            <span className="material-symbols-outlined text-[15px]">delete</span>
                                                        </button>
                                                    </div>
                                                )}

                                                <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2.5 py-1 rounded-xl font-bold backdrop-blur-md flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">playlist_play</span>
                                                    {count} {pl.type === 'Series' ? 'Episodes' : 'Videos'}
                                                </div>
                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity">
                                                    <button className="px-5 py-2.5 rounded-full bg-cyan-500 text-white font-black text-xs flex items-center gap-2 shadow-xl shadow-cyan-500/40 scale-95 group-hover:scale-100 transition-all">
                                                        <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                                                        Play Series
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                                <div>
                                                    <h3 className="font-black text-base text-slate-900 dark:text-white group-hover:text-cyan-500 transition-colors line-clamp-1 mb-1">
                                                        <HighlightText text={pl.title} query={searchQuery} />
                                                    </h3>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                                        <HighlightText text={pl.description} query={searchQuery} />
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-black shrink-0">
                                                                {(pl.author || 'M').charAt(0)}
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                                                Created by <span className="text-cyan-600 dark:text-cyan-400 font-extrabold">{pl.author || 'Meghna Tiwari'}</span>
                                                            </span>
                                                        </div>
                                                        {pl.channelName && pl.channelName !== pl.author && (
                                                            <span className="text-[10px] text-slate-400 font-medium pl-6 truncate">
                                                                Source: {pl.channelName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {canManage && (
                                                            <>
                                                                <button onClick={() => handleOpenEditPlaylist(pl)}
                                                                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-0.5 cursor-pointer transition-colors"
                                                                    title="Edit Series">
                                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                                    Edit
                                                                </button>
                                                                <button onClick={() => handleDeletePlaylist(pl)}
                                                                    className="text-xs font-bold text-rose-500 hover:text-rose-400 flex items-center gap-0.5 cursor-pointer transition-colors"
                                                                    title="Delete Series">
                                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                                    Delete
                                                                </button>
                                                            </>
                                                        )}
                                                        <button onClick={() => handlePlayPlaylist(pl)} className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer">
                                                            Watch Series <span className="material-symbols-outlined text-sm">chevron_right</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── VIDEO BROWSE PAGE ── */
                    <div>
                        {/* Featured Video */}
                        {activeFilter === 'All' && !searchQuery && videos.length > 0 && (
                            <section onClick={() => setActiveVideo(videos[0])}
                                className="relative rounded-2xl overflow-hidden mb-8 h-[380px] shadow-2xl group cursor-pointer border border-slate-200 dark:border-slate-800">
                                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src={videos[0].thumbnail} alt="Featured" onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }} />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div className="w-20 h-20 rounded-full bg-cyan-500/90 backdrop-blur-md flex items-center justify-center text-white shadow-xl shadow-cyan-500/30 scale-90 group-hover:scale-100 transition-all duration-300">
                                        <span className="material-symbols-outlined text-[40px] ml-1">play_arrow</span>
                                    </div>
                                </div>
                                <div className="absolute bottom-0 left-0 p-8">
                                    <span className="bg-cyan-500 text-white text-[10px] uppercase tracking-widest font-black px-3 py-1 rounded-full mb-3 inline-block">Featured</span>
                                    <h2 className="text-white text-2xl font-black mb-2 line-clamp-2">{videos[0].title}</h2>
                                    <div className="flex items-center gap-4 text-slate-300 text-[12px] font-bold">
                                        <span>{getDisplayViews(videos[0])} views</span>
                                        <span>·</span>
                                        <span>{videos[0].category}</span>
                                        <span>·</span>
                                        <span>{videos[0].duration}</span>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Video Grid */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                {activeFilter === 'All' ? 'All Learning Videos' : activeFilter}
                            </h2>
                            <span className="text-xs font-bold text-slate-400">{filteredVideos.length} Videos</span>
                        </div>

                        {isLoading ? (
                            <div className="p-12 text-center flex flex-col items-center gap-3 text-slate-500">
                                <span className="material-symbols-outlined animate-spin text-[36px] text-cyan-500">progress_activity</span>
                                <span className="font-bold">Loading videos...</span>
                            </div>
                        ) : filteredVideos.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                                No videos found.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {filteredVideos.slice(0, visibleCount).map(video => (
                                    <div key={video.id} onClick={() => handleSelectVideo(video)}
                                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group cursor-pointer flex flex-col">
                                        {/* Thumbnail */}
                                        <div className="relative aspect-video bg-slate-900 overflow-hidden">
                                            <img src={video.thumbnail} alt={video.title}
                                                onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-white text-[36px]">play_circle</span>
                                            </div>
                                            <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md">
                                                {video.duration}
                                            </span>
                                            <button onClick={e => { 
                                                e.stopPropagation(); 
                                                if (isVideoSaved(video)) {
                                                    handleUnsaveVideo(video);
                                                } else {
                                                    setSavingVideoModal({ 
                                                        id: video.id,
                                                        contentId: video.id,
                                                        contentType: 'Video', 
                                                        title: video.title,
                                                        text: video.description || video.title,
                                                        description: video.description || video.title,
                                                        image: video.thumbnail,
                                                        thumbnail: video.thumbnail,
                                                        author: video.author || 'MPOnline Creator',
                                                        tags: video.tags || ['Video'],
                                                        sourceUrl: video.sourceUrl,
                                                        category: video.category || 'Training & Tutorials'
                                                    }); 
                                                }
                                            }}
                                                className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${isVideoSaved(video) ? 'bg-amber-400 text-slate-900 opacity-100' : 'bg-black/60 text-white hover:bg-amber-500 opacity-0 group-hover:opacity-100'}`}
                                                title={isVideoSaved(video) ? 'Remove bookmark' : 'Save video'}>
                                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: isVideoSaved(video) ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
                                            </button>
                                        </div>
                                        {/* Info */}
                                        <div className="p-3">
                                            <h3 className="font-bold text-[13px] text-slate-900 dark:text-white line-clamp-2 group-hover:text-cyan-500 transition-colors leading-snug mb-1.5">
                                                <HighlightText text={video.title} query={searchQuery} />
                                            </h3>
                                            <p className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold">
                                                <HighlightText text={video.author || 'Creator'} query={searchQuery} />
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{getDisplayViews(video)} views · {getDisplayLikes(video)} likes · {video.date}</p>
                                        </div>
                                    </div>
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < filteredVideos.length} text="Loading more videos on scroll..." />
                            </div>
                        )}
                    </div>
                )}

            </main>

            {/* Edit Series / Playlist Modal */}
            {editingPlaylist && (
                <div className="fixed inset-0 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200"
                    onClick={() => setEditingPlaylist(null)}>
                    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] my-auto animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4 sm:p-5 shrink-0 bg-white dark:bg-slate-900 z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-500/25 shrink-0">
                                    <span className="material-symbols-outlined text-[22px]">edit</span>
                                </div>
                                <div>
                                    <h3 className="font-black text-base text-slate-900 dark:text-white">Edit Series / Playlist</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Update series title, category, description, and episodes</p>
                                </div>
                            </div>
                            <button onClick={() => setEditingPlaylist(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleUpdatePlaylistSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Type</label>
                                    <select value={editFormData.type} onChange={e => setEditFormData(p => ({ ...p, type: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all">
                                        <option value="Series">🎓 Masterclass Series</option>
                                        <option value="Playlist">📺 Standard Playlist</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                                    <select value={editFormData.category} onChange={e => setEditFormData(p => ({ ...p, category: e.target.value }))}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-bold transition-all">
                                        <option value="Training & Tutorials">Training & Tutorials</option>
                                        <option value="Engineering Tech Talks">Engineering Tech Talks</option>
                                        <option value="Townhalls">Townhalls</option>
                                        <option value="Leadership Updates">Leadership Updates</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                                <input type="text" required
                                    value={editFormData.title} onChange={e => setEditFormData(p => ({ ...p, title: e.target.value }))}
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea rows={3}
                                    value={editFormData.description} onChange={e => setEditFormData(p => ({ ...p, description: e.target.value }))}
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none placeholder-slate-400 dark:placeholder-slate-500 transition-all" />
                            </div>

                            {/* Videos / Episodes Management */}
                            {Array.isArray(editingPlaylist.episodes) && editingPlaylist.episodes.length > 0 && editingPlaylist.id?.startsWith('pl_yt_') ? (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        Imported Episodes ({editingPlaylist.episodes.length})
                                    </label>
                                    <div className="max-h-40 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 space-y-1.5">
                                        {editingPlaylist.episodes.map((ep, idx) => (
                                            <div key={ep.id || idx} className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
                                                <span className="w-5 h-5 rounded bg-indigo-500/20 text-indigo-500 font-bold text-[10px] flex items-center justify-center shrink-0">{idx + 1}</span>
                                                <img src={ep.thumbnail} alt={ep.title} onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }} className="w-10 aspect-video rounded-lg object-cover shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-bold text-slate-900 dark:text-white truncate">{ep.title}</p>
                                                    <p className="text-[10px] text-slate-400">{ep.duration || 'Session'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        Select Videos to Include ({editFormData.selectedVideoIds.length} selected)
                                    </label>
                                    <div className="max-h-44 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-800 p-2 rounded-2xl bg-slate-50 dark:bg-slate-950/50 space-y-1">
                                        {videos.map(v => {
                                            const checked = editFormData.selectedVideoIds.includes(v.id);
                                            return (
                                                <label key={v.id} className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'}`}>
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <img src={v.thumbnail} alt={v.title} onError={(e) => { e.target.onerror = null; e.target.src = VIDEO_PLACEHOLDER_THUMBNAIL; }} className="w-10 aspect-video rounded-lg object-cover shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-slate-900 dark:text-slate-200 line-clamp-1">{v.title}</p>
                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{v.author} · {v.category}</p>
                                                        </div>
                                                    </div>
                                                    <input type="checkbox" checked={checked}
                                                        onChange={() => setEditFormData(p => ({
                                                            ...p,
                                                            selectedVideoIds: checked ? p.selectedVideoIds.filter(i => i !== v.id) : [...p.selectedVideoIds, v.id]
                                                        }))}
                                                        className="accent-indigo-600 cursor-pointer w-4 h-4 shrink-0" />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setEditingPlaylist(null)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors">
                                    Cancel
                                </button>
                                <button type="submit"
                                    className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition-all">
                                    <span className="material-symbols-outlined text-[18px]">check</span>
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Series Confirmation Modal */}
            {deletingPlaylistModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
                        <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-2xl">delete_forever</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">Delete Series?</h3>
                            <p className="text-xs text-slate-400 mt-1">Are you sure you want to delete <span className="text-white font-bold">"{deletingPlaylistModal.title}"</span>? This action cannot be undone.</p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setDeletingPlaylistModal(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer">
                                Cancel
                            </button>
                            <button onClick={confirmDeletePlaylist}
                                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-600/30">
                                Yes, Delete Series
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification Banner */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-2xl shadow-2xl font-bold text-xs flex items-center gap-2 border border-slate-700 dark:border-slate-200 animate-in fade-in slide-in-from-bottom-3 duration-200">
                    <span className="material-symbols-outlined text-cyan-400 dark:text-cyan-600 text-[18px]">check_circle</span>
                    <span>{toastMessage}</span>
                </div>
            )}
        </>
    );
}
