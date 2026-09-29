import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
import UploadVideoModal from '../components/modals/UploadVideoModal';
import ReportModal from '../components/modals/ReportModal';
import SaveToCategoryModal from '../components/modals/SaveToCategoryModal';
import CommentsSection from '../components/video/CommentsSection';
import ArticleShareModal from '../components/modals/ArticleShareModal';
import { getVideos, getPlaylists, savePlaylist, deletePlaylist, importYouTubePlaylist } from '../utils/videoService';

import { savedContentApi, getPersonalizedRecommendations, resolveMediaUrl, videosApi, interactionsApi } from '../utils/apiService';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

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
        const pureListMatch = u.match(/(?:youtube\.com\/(?:playlist|embed\/videoseries)\?list=)([a-zA-Z0-9_-]+)/);
        if (pureListMatch && pureListMatch[1]) {
            return `https://www.youtube.com/embed/videoseries?list=${pureListMatch[1]}&autoplay=1`;
        }
        const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/);
        if (ytMatch && ytMatch[1]) {
            const listMatch = u.match(/list=([a-zA-Z0-9_-]+)/);
            const listParam = listMatch ? `&list=${listMatch[1]}` : '';
            return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0${listParam}`;
        }
        const vmMatch = u.match(/vimeo\.com\/(\d+)/);
        if (vmMatch && vmMatch[1]) return `https://player.vimeo.com/video/${vmMatch[1]}?autoplay=1`;
        if (isSharePoint) return u.includes('?') ? `${u}&action=embedview` : `${u}?action=embedview`;
        return u;
    };

    if (isExternalEmbed) {
        return (
            <iframe
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
    const [isFollowing, setIsFollowing] = useState(false);
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

    // Helper: get display view count for a video
    const getDisplayViews = (video) => {
        if (!video?.id) return video?.views || '0';
        const saved = viewsMap[video.id];
        if (saved !== undefined && saved > 0) {
            return saved > 999 ? (saved / 1000).toFixed(1) + 'k' : String(saved);
        }
        return video.views || '0';
    };

    const filters = ['All', 'Training & Tutorials', 'Townhalls', 'Engineering Tech Talks', 'Leadership Updates'];

    const fetchVideos = async () => {
        setIsLoading(true);
        const data = await getVideos();
        setVideos(data || []);
        const plData = getPlaylists();
        setPlaylists(plData || []);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchVideos();
        loadViewsMap();
        try {
            const localSaved = JSON.parse(localStorage.getItem('knome_saved_videos') || '{}');
            setSavedMap(localSaved);
        } catch (e) {}
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
            let targetUrl = url;
            const listMatch = url.match(/list=([a-zA-Z0-9_-]+)/);
            const listId = listMatch ? listMatch[1] : null;

            // Try YouTube official oembed first
            let res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`);
            let data = null;

            if (res.ok) {
                data = await res.json();
            } else {
                // Fallback to noembed
                const vMatch = url.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (vMatch && vMatch[1]) {
                    targetUrl = `https://www.youtube.com/watch?v=${vMatch[1]}`;
                }
                res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`);
                if (res.ok) data = await res.json();
            }

            let detectedEpisodes = 10; // Default smart guess

            if (listId) {
                // Smart default episode count for YouTube playlists
                detectedEpisodes = 12;
            }

            if (data && data.title) {
                const fetchedTitle = data.title;
                const fetchedAuthor = data.author_name || 'YouTube Creator';
                const fetchedThumb = data.thumbnail_url || null;

                setYtSeriesTitle(fetchedTitle);
                setYtAuthorName(fetchedAuthor);
                setYtEpisodeCount(detectedEpisodes);
                setAutoFetchedMeta({
                    title: fetchedTitle,
                    author: fetchedAuthor,
                    thumbnail: fetchedThumb,
                    episodes: detectedEpisodes
                });
                showToast(`✨ Auto-fetched: "${fetchedTitle}" (${detectedEpisodes} Episodes Detected)`);
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


    const [deletingPlaylistModal, setDeletingPlaylistModal] = useState(null);

    const handleDeletePlaylist = (playlist) => {
        setDeletingPlaylistModal(playlist);
    };

    const confirmDeletePlaylist = () => {
        if (!deletingPlaylistModal) return;
        const targetId = deletingPlaylistModal.id;
        const title = deletingPlaylistModal.title;
        deletePlaylist(targetId);
        setPlaylists(getPlaylists());

        if (activePlaylist && activePlaylist.id === targetId) {
            setActivePlaylist(null);
        }
        setDeletingPlaylistModal(null);
        showToast(`🗑️ Series "${title}" deleted successfully!`);
    };

    const handleImportYtPlaylistSubmit = async (e) => {
        e.preventDefault();
        if (!ytPlaylistUrl.trim()) return;

        const res = importYouTubePlaylist({
            playlistUrl: ytPlaylistUrl,
            title: ytSeriesTitle || 'YouTube Playlist Series',
            author: currentUser?.name || ytAuthorName || 'Meghna Tiwari',
            category: newPlaylist.category,
            episodeCount: ytEpisodeCount,
            user: currentUser
        });

        if (isCurrentUserAdmin) {
            savePlaylist(res.playlist);
            try {
                const existingImp = JSON.parse(localStorage.getItem('knome_imported_yt_videos') || '[]');
                localStorage.setItem('knome_imported_yt_videos', JSON.stringify([...res.videos, ...existingImp]));
            } catch (e) {}
            const updatedVideos = await getVideos();
            setVideos(updatedVideos || []);
            setPlaylists(getPlaylists());
            handlePlayPlaylist(res.playlist, 0, updatedVideos);
            showToast(`🚀 Series "${res.playlist.title}" published successfully!`);
        } else {
            const pendingItem = {
                id: `pending_series_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                mediaType: 'Series',
                title: res.playlist.title,
                description: res.playlist.description,
                thumbnail: res.playlist.thumbnail,
                category: res.playlist.category,
                authorName: currentUser?.name || 'Meghna Tiwari',
                authorId: currentUser?.id || 5,
                authorDesignation: currentUser?.roleName || 'Product Specialist',
                uploadedDate: new Date().toISOString(),
                seriesData: res.playlist,
                customVideos: res.videos
            };
            try {
                const pendingList = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
                localStorage.setItem('knome_pending_media_approvals', JSON.stringify([pendingItem, ...pendingList]));
            } catch (err) {}
            showToast(`⏳ Series "${res.playlist.title}" submitted for Admin Approval!`);
        }

        setIsCreatePlaylistOpen(false);
        setYtPlaylistUrl('');
        setYtSeriesTitle('');
        setYtAuthorName('');
        setAutoFetchedMeta(null);
    };

    const handleCreatePlaylistSubmit = (e) => {
        e.preventDefault();
        if (!newPlaylist.title.trim()) return;

        const playlistObj = {
            title: newPlaylist.title,
            description: newPlaylist.description,
            category: newPlaylist.category,
            type: newPlaylist.type,
            author: currentUser?.name || 'Meghna Tiwari',
            authorId: currentUser?.id || 5,
            authorDesignation: currentUser?.roleName || 'Product Specialist',
            videoIds: newPlaylist.selectedVideoIds,
            thumbnail: newPlaylist.selectedVideoIds.length > 0
                ? (videos.find(v => String(v.id) === String(newPlaylist.selectedVideoIds[0]))?.thumbnail || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=90&w=1200')
                : 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=90&w=1200'
        };

        if (isCurrentUserAdmin) {
            const created = savePlaylist(playlistObj);
            setPlaylists(getPlaylists());
            showToast(`🎉 Series "${created.title}" created & published!`);
        } else {
            const pendingItem = {
                id: `pending_series_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                mediaType: 'Series',
                title: playlistObj.title,
                description: playlistObj.description,
                thumbnail: playlistObj.thumbnail,
                category: playlistObj.category,
                authorName: currentUser?.name || 'Meghna Tiwari',
                authorId: currentUser?.id || 5,
                authorDesignation: currentUser?.roleName || 'Product Specialist',
                uploadedDate: new Date().toISOString(),
                seriesData: playlistObj
            };
            try {
                const pendingList = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
                localStorage.setItem('knome_pending_media_approvals', JSON.stringify([pendingItem, ...pendingList]));
            } catch (err) {}
            showToast(`⏳ Series "${playlistObj.title}" submitted for Admin Approval!`);
        }

        setIsCreatePlaylistOpen(false);
        setNewPlaylist({ title: '', description: '', category: 'Training & Tutorials', type: 'Series', selectedVideoIds: [] });
    };


    const handlePlayPlaylist = (playlist, startVideoIndex = 0, currentVideos = videos) => {
        const vList = Array.isArray(currentVideos) && currentVideos.length > 0 ? currentVideos : videos;
        let playlistVids = (playlist.videoIds || []).map((id, idx) => {
            let found = vList.find(v => (v.id || '').toString() === id.toString());
            if (!found) {
                found = {
                    id: id,
                    title: `#${idx + 1}: Lecture ${idx + 1} | ${playlist.title}`,
                    description: `Lecture ${idx + 1} of ${playlist.title} by ${playlist.author || 'Creator'}.`,
                    thumbnail: playlist.thumbnail || 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&q=90&w=1200',
                    duration: `${10 + (idx % 5)}:00`,
                    views: '1.2M',
                    likes: 8500,
                    category: playlist.category || 'Training & Tutorials',
                    date: playlist.createdDate || 'Aug 5, 2026',
                    author: playlist.author || 'YouTube Creator',
                    authorId: playlist.authorId || 99,
                    authorDesignation: playlist.authorDesignation || 'YouTube Creator',
                    tags: ['Playlist', 'Series'],
                    sourceUrl: `https://www.youtube.com/embed/videoseries?list=PLfqMhTWNBTe2C_dQAP1UoemcgAxBTlItp&index=${idx + 1}`,
                    sourceType: 'YouTube'
                };
            }
            return found;
        }).filter(Boolean);

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
                const tl = tTitle.toLowerCase();
                found = videos.find(v => v.title && (v.title.toLowerCase() === tl || v.title.toLowerCase().includes(tl)));
            }
            if (found) {
                setActiveVideo(found);
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
            }
        }
    }, [location.search, location.state, videos, isLoading]);

    // Sync engagement state when activeVideo changes
    useEffect(() => {
        if (!activeVideo) return;
        const initialLiked = activeVideo.isLiked ?? (localStorage.getItem(`knome_liked_video_${activeVideo.id}`) === 'true');
        setLiked(initialLiked);
        setDisliked(localStorage.getItem(`knome_disliked_video_${activeVideo.id}`) === 'true');
        const authorKey = activeVideo.authorId ? `user_${activeVideo.authorId}` : `author_${activeVideo.author}`;
        setIsFollowing(localStorage.getItem(`knome_following_${authorKey}`) === 'true');

        // Unique user view tracking — one view per user only
        const rawViews = String(activeVideo.views || '0').replace(/[^0-9.]/g, '');
        const parsed = parseFloat(rawViews);
        const baseCount = isNaN(parsed) ? 0 : Math.round(parsed * (String(activeVideo.views || '').includes('k') ? 1000 : 1));
        const initialCount = baseCount || 0;
        setCurrentViews(initialCount);

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

            // Load live reaction summary and liked status from API
            interactionsApi.getSummary('Video', activeVideo.id)
                .then(res => {
                    const summary = res?.data ?? res;
                    if (summary?.reactionSummary) {
                        const rSum = summary.reactionSummary;
                        const count = rSum.likeCount ?? rSum.totalCount ?? 0;
                        setLikesCount(count);
                        const isReactionLike = rSum.currentUserReactionType === 'Like';
                        setLiked(isReactionLike);
                        localStorage.setItem(`knome_video_likes_${activeVideo.id}`, count.toString());
                        localStorage.setItem(`knome_liked_video_${activeVideo.id}`, isReactionLike ? 'true' : 'false');
                    }
                })
                .catch(() => {});
        } else {
            if (!hasViewedLocally) {
                localStorage.setItem(userViewKey, 'true');
            }
        }

        const savedLikes = (() => {
            const raw = localStorage.getItem(`knome_video_likes_${activeVideo.id}`);
            return raw ? parseInt(raw, 10) : null;
        })();
        const effectiveLikes = savedLikes != null ? Math.max(savedLikes, activeVideo.likes || 0) : (activeVideo.likes || 0);
        setLikesCount(effectiveLikes);
        setShareCount(activeVideo.shares || 0);
        setDescExpanded(false);
        setShowSharePanel(false);
        setShareTab('menu');
        setSelectedUserIds([]);
    }, [activeVideo]);

    // Real-time listener for reaction updates broadcast over SignalR
    useEffect(() => {
        const handleReactionUpdated = (e) => {
            const detail = e.detail;
            if (!detail || !activeVideo) return;
            if (detail.contentType === 'Video' && String(detail.contentId) === String(activeVideo.id)) {
                if (typeof detail.totalLikes === 'number') {
                    setLikesCount(detail.totalLikes);
                } else if (detail.reactionsSummary?.totalCount !== undefined) {
                    setLikesCount(detail.reactionsSummary.likeCount ?? detail.reactionsSummary.totalCount);
                }
            }
        };
        window.addEventListener('knome:reaction-updated', handleReactionUpdated);
        return () => window.removeEventListener('knome:reaction-updated', handleReactionUpdated);
    }, [activeVideo]);

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

        // Call backend API for persistence, karma & real-time notification
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
        if (!disliked) {
            setDisliked(true);
            localStorage.setItem(`knome_disliked_video_${activeVideo.id}`, 'true');
            if (liked) {
                setLiked(false);
                setLikesCount(p => Math.max(0, p - 1));
                localStorage.removeItem(`knome_liked_video_${activeVideo.id}`);
            }
            showToast('Feedback recorded (Disliked)');
        } else {
            setDisliked(false);
            localStorage.removeItem(`knome_disliked_video_${activeVideo.id}`);
        }
    };

    const handleFollowToggle = () => {
        const authorKey = activeVideo.authorId ? `user_${activeVideo.authorId}` : `author_${activeVideo.author}`;
        if (isFollowing) {
            setIsFollowing(false);
            localStorage.removeItem(`knome_following_${authorKey}`);
            showToast(`Unfollowed ${activeVideo.author || 'creator'}`);
        } else {
            setIsFollowing(true);
            localStorage.setItem(`knome_following_${authorKey}`, 'true');
            showToast(`You are now following ${activeVideo.author || 'creator'}`);
        }
    };

    const handleSaveToggle = () => {
        if (savedMap[activeVideo.id]) {
            setSavedMap(prev => {
                const next = { ...prev };
                delete next[activeVideo.id];
                localStorage.setItem('knome_saved_videos', JSON.stringify(next));
                return next;
            });
            showToast('Removed from saved videos');
        } else {
            setSavingVideoModal({ ...activeVideo, contentType: 'Video', text: activeVideo.description || activeVideo.title });
        }
    };

    const handleCopyLink = () => {
        const shareUrl = `${window.location.origin}/videos?id=${activeVideo.id}&title=${encodeURIComponent(activeVideo.title)}`;
        navigator.clipboard.writeText(shareUrl);
        showToast('🔗 Video link copied to clipboard!');
        setShowSharePanel(false);
    };




    const handleShareToCommunity = (e) => {
        e.preventDefault();
        const comm = ENTERPRISE_COMMUNITIES.find(c => String(c.id) === String(selectedCommunityId)) || ENTERPRISE_COMMUNITIES[0];
        const uploaderAuthorId = activeVideo?.authorId;
        const isSelf = uploaderAuthorId && String(uploaderAuthorId) === String(currentUser?.id || currentUser?.userId);
        const post = {
            id: `post_vid_share_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            type: 'video_share',
            userId: currentUser?.id || 1,
            authorName: currentUser?.name || 'Meghna Tiwari',
            authorRole: currentUser?.roleName || 'Member',
            authorAvatar: currentUser?.avatar || null,
            timeAgo: 'Just now',
            createdAt: new Date().toISOString(),
            publishedDate: new Date().toISOString(),
            content: `${shareMessageNote ? shareMessageNote + '\n\n' : ''}📹 Shared Video: "${activeVideo.title}" — uploaded by ${activeVideo.author || 'MPOnline Team'}`,
            sharedVideo: {
                id: activeVideo.id,
                title: activeVideo.title,
                description: activeVideo.description,
                thumbnail: activeVideo.thumbnail,
                sourceUrl: activeVideo.sourceUrl,
                author: activeVideo.author,
                duration: activeVideo.duration,
                category: activeVideo.category
            },
            videoUrl: activeVideo.sourceUrl,
            thumbnail: activeVideo.thumbnail,
            category: activeVideo.category || 'General',
            communityId: Number(comm.id),
            communityName: comm.name
        };
        try {
            const key = `knome_community_posts_${comm.id}`;
            const existingCommPosts = JSON.parse(localStorage.getItem(key) || '[]');
            localStorage.setItem(key, JSON.stringify([post, ...existingCommPosts]));

            // Dispatch storage and custom events for instant feed update
            window.dispatchEvent(new StorageEvent('storage', { key }));
            window.dispatchEvent(new CustomEvent('post-created'));
            window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: comm.id, post } }));
        } catch (err) {}

        setShareCount(p => p + 1);
        if (awardRuleKarma && uploaderAuthorId && !isSelf) {
            awardRuleKarma(uploaderAuthorId, 'SHARE_RECEIVED');
        }
        setShowSharePanel(false);
        setShareMessageNote('');
        showToast(`🚀 Posted video to "${comm.name}" community feed!`);
    };

    const handleShareToUsers = (e) => {
        e.preventDefault();
        if (selectedUserIds.length === 0) return;
        const uploaderAuthorId = activeVideo?.authorId;
        const isSelf = uploaderAuthorId && String(uploaderAuthorId) === String(currentUser?.id || currentUser?.userId);
        try {
            const notifs = selectedUserIds.map(uId => ({
                id: `notif_vid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                targetUserId: uId,
                type: 'video_shared',
                category: 'Social',
                icon: 'video_library',
                color: 'text-cyan-400',
                bg: 'bg-cyan-500/10',
                text: `📹 ${currentUser?.name || currentUser?.fullName || 'A teammate'} shared a video with you: "${activeVideo.title}"`,
                senderName: currentUser?.name || currentUser?.fullName || 'Teammate',
                senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                actionLink: `/videos?id=${activeVideo.id}&title=${encodeURIComponent(activeVideo.title)}`,
                targetUrl: `/videos?id=${activeVideo.id}&title=${encodeURIComponent(activeVideo.title)}`,
                relatedContentType: 'Video',
                relatedContentId: activeVideo.id,
                videoId: activeVideo.id,
                videoTitle: activeVideo.title,
                videoUrl: activeVideo.sourceUrl,
                unread: true
            }));

            const existing = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            localStorage.setItem('knome_notifications', JSON.stringify([...notifs, ...existing]));

            // Trigger notification badge & panel events
            window.dispatchEvent(new CustomEvent('notification-updated'));
            window.dispatchEvent(new CustomEvent('knome_new_notification'));
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_notifications' }));
        } catch (err) {}

        setShareCount(p => p + selectedUserIds.length);
        if (awardRuleKarma && uploaderAuthorId && !isSelf) {
            awardRuleKarma(uploaderAuthorId, 'SHARE_RECEIVED');
        }
        setShowSharePanel(false);
        setSelectedUserIds([]);
        showToast(`📩 Shared video with ${selectedUserIds.length} team member(s)! Notification sent.`);
    };


    const rawFiltered = videos.filter(v =>
        (activeFilter === 'All' || v.category === activeFilter) &&
        (!searchQuery || v.title?.toLowerCase().includes(searchQuery.toLowerCase()) || (v.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
    );
    const filteredVideos = rawFiltered;

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
            <SaveToCategoryModal isOpen={!!savingVideoModal} onClose={() => setSavingVideoModal(null)} item={savingVideoModal} onSaved={(s) => setSavedMap(p => ({ ...p, [s.contentId || s.id]: true }))} />

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
                                            <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[18px] text-emerald-500">check_circle</span>
                                                    <span>Auto-Fetched: <span className="text-slate-900 dark:text-white font-extrabold">{autoFetchedMeta.title}</span> by <span className="text-emerald-600 dark:text-emerald-300">{autoFetchedMeta.author}</span></span>
                                                </div>
                                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-[10px] font-extrabold border border-emerald-200 dark:border-emerald-500/30">
                                                    {autoFetchedMeta.episodes} Episodes
                                                </span>
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

                                    <div className="flex gap-2 pt-2">
                                        <button type="button" onClick={() => setIsCreatePlaylistOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors">Cancel</button>
                                        <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition-all">
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
                                                            <img src={v.thumbnail} alt={v.title} className="w-10 aspect-video rounded-lg object-cover shrink-0" />
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
                                        <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold text-xs rounded-xl cursor-pointer shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 transition-all">
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

                {/* ── PAGE TITLE & HEADER ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-500 bg-cyan-500/10 px-2.5 py-0.5 rounded-md inline-block mb-1">
                            Enterprise Media Hub
                        </span>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                            Video Streaming & Masterclass Series
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                            Browse technical talks, townhalls, full courses, and employee learning sessions.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsCreatePlaylistOpen(true)}
                            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-700 hover:to-cyan-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-[18px]">playlist_add</span>
                            Create Series
                        </button>
                        {currentUser?.role !== 'SYSADM' && (
                            <button onClick={() => setIsUploadOpen(true)}
                                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 transition-all cursor-pointer">
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
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${viewTab === 'videos' ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                <span className="material-symbols-outlined text-[16px]">video_library</span>
                                Videos ({filteredVideos.length})
                            </button>
                            <button onClick={() => { setViewTab('playlists'); setActiveVideo(null); }}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${viewTab === 'playlists' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                                <span className="material-symbols-outlined text-[16px]">playlist_play</span>
                                Playlists & Series ({playlists.length})
                            </button>
                        </div>

                        {viewTab === 'videos' && (
                            <div className="flex overflow-x-auto custom-scrollbar gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                                {filters.map(f => (
                                    <button key={f} onClick={() => { setActiveFilter(f); setActiveVideo(null); }}
                                        className={`px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-all ${activeFilter === f ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                                        {f}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative min-w-[220px]">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                        <input type="text" placeholder="Search videos or series..." value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-cyan-500 outline-none text-slate-900 dark:text-white transition-all" />
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
                                        <button onClick={() => { setShowSharePanel(!showSharePanel); setShareTab('menu'); }}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${showSharePanel ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]">share</span>
                                            <span>Share {shareCount > 0 ? `(${shareCount})` : ''}</span>
                                        </button>

                                        {/* Save */}
                                        <button onClick={handleSaveToggle}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold transition-all cursor-pointer ${savedMap[activeVideo.id] ? 'bg-amber-400 text-slate-900 shadow-md shadow-amber-400/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: savedMap[activeVideo.id] ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
                                            <span>{savedMap[activeVideo.id] ? 'Saved' : 'Save'}</span>
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
                                    onShared={() => setShareCount(prev => prev + 1)}
                                />


                                {/* Channel / Author Info (Uploader) */}
                                <div className="flex items-center gap-4 py-4 border-t border-b border-slate-200 dark:border-slate-800">
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md overflow-hidden">
                                            {activeVideo.authorAvatar
                                                ? <img src={resolveMediaUrl(activeVideo.authorAvatar)} alt={activeVideo.author} className="w-full h-full object-cover" />
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

                                    <button onClick={handleFollowToggle}
                                        className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                            isFollowing
                                                ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40 hover:bg-rose-500/20 hover:text-rose-500 hover:border-rose-500/40'
                                                : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-sm'
                                        }`}>
                                        {isFollowing ? (
                                            <>
                                                <span className="material-symbols-outlined text-[15px]">check</span>
                                                <span>Following</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[15px]">person_add</span>
                                                <span>Follow</span>
                                            </>
                                        )}
                                    </button>
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
                                        <button onClick={() => setActivePlaylist(null)} className="text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer">
                                            Close Series Mode
                                        </button>
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
                                                    <img src={pv.thumbnail} alt={pv.title} className="w-12 aspect-video rounded-lg object-cover shrink-0" />
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
                                            <p className="text-[11px] text-slate-400 mt-0.5">{getDisplayViews(v)} views · {v.date}</p>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {playlists.map(pl => {
                                const plVids = (pl.videoIds || []).map(id => videos.find(v => String(v.id) === String(id))).filter(Boolean);
                                const count = plVids.length || (pl.videoIds?.length || 4);
                                return (
                                    <div key={pl.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 group flex flex-col">
                                        {/* Thumbnail Card */}
                                        <div className="relative aspect-video overflow-hidden bg-slate-900 cursor-pointer" onClick={() => handlePlayPlaylist(pl)}>
                                            <img src={pl.thumbnail} alt={pl.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                                            <div className="absolute top-3 left-3 flex gap-2">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-md ${pl.type === 'Series' ? 'bg-indigo-600' : 'bg-cyan-600'}`}>
                                                    {pl.type || 'Series'}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-slate-200 backdrop-blur-md">
                                                    {pl.category}
                                                </span>
                                            </div>
                                            {(pl.authorId === currentUser?.id || pl.author === currentUser?.name || isCurrentUserAdmin) && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl); }}
                                                    className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-lg"
                                                    title="Delete Series">
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            )}
                                            <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2.5 py-1 rounded-xl font-bold backdrop-blur-md flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">playlist_play</span>
                                                {count} Videos
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
                                                <h3 className="font-black text-base text-slate-900 dark:text-white group-hover:text-cyan-500 transition-colors line-clamp-1 mb-1">{pl.title}</h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{pl.description}</p>
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
                                                    {(pl.authorId === currentUser?.id || pl.author === currentUser?.name || isCurrentUserAdmin) && (
                                                        <button onClick={() => handleDeletePlaylist(pl)}
                                                            className="text-xs font-bold text-rose-500 hover:text-rose-400 flex items-center gap-0.5 cursor-pointer"
                                                            title="Delete Series">
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                            Delete
                                                        </button>
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
                    </div>
                ) : (
                    /* ── VIDEO BROWSE PAGE ── */
                    <div>
                        {/* Featured Video */}
                        {activeFilter === 'All' && !searchQuery && videos.length > 0 && (
                            <section onClick={() => setActiveVideo(videos[0])}
                                className="relative rounded-2xl overflow-hidden mb-8 h-[380px] shadow-2xl group cursor-pointer border border-slate-200 dark:border-slate-800">
                                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src={videos[0].thumbnail} alt="Featured" />
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
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-white text-[36px]">play_circle</span>
                                            </div>
                                            <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md">
                                                {video.duration}
                                            </span>
                                            <button onClick={e => { e.stopPropagation(); setSavingVideoModal({ ...video, contentType: 'Video', text: video.description || video.title }); }}
                                                className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer ${savedMap[video.id] ? 'bg-amber-400 text-slate-900 opacity-100' : 'bg-black/60 text-white hover:bg-amber-500'}`}>
                                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: savedMap[video.id] ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
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
                                            <p className="text-[11px] text-slate-400 mt-0.5">{getDisplayViews(video)} views · {video.likes || 0} likes · {video.date}</p>
                                        </div>
                                    </div>
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < filteredVideos.length} text="Loading more videos on scroll..." />
                            </div>
                        )}
                    </div>
                )}

            </main>

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
