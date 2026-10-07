import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useUser, users, getUserStatusConfig } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { getKarmaBadge, getKarmaLevelInfo } from '../utils/karmaEngine';
import { 
    profileApi, 
    userApi, 
    postsApi, 
    articlesApi, 
    videosApi, 
    podcastsApi, 
    communitiesApi, 
    karmaApi,
    messagesApi,
    getCommunityImages, 
    mapPost,
    mapArticle,
    resolveMediaUrl 
} from '../utils/apiService';
import { playMessageChime } from '../utils/realtimeMessenger';
import ShareProfileModal from '../components/modals/ShareProfileModal';
import PostCard from '../components/widgets/PostCard';
import useScrollLoading from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import KarmaBadge, { KarmaLevelMedal } from '../components/ui/KarmaBadge';
import { useSystemConfig } from '../utils/systemConfig';

const PRESET_BANNERS = [
    {
        id: 'trupeer-violet',
        name: 'Trupeer Violet',
        style: 'linear-gradient(135deg, #4338ca 0%, #6366f1 35%, #8b5cf6 70%, #a855f7 100%)',
        subtitle: 'AI & Creative Studio',
        previewClass: 'from-indigo-600 via-purple-600 to-fuchsia-600'
    },
    {
        id: 'linkedin-blue',
        name: 'LinkedIn Corporate Blue',
        style: 'linear-gradient(135deg, #0a66c2 0%, #004182 60%, #082f49 100%)',
        subtitle: 'Enterprise Corporate',
        previewClass: 'from-sky-600 via-blue-700 to-indigo-950'
    },
    {
        id: 'cyber-dark',
        name: 'Dark Titanium',
        style: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        subtitle: 'Deep Minimal Dark',
        previewClass: 'from-slate-900 via-slate-800 to-slate-700'
    },
    {
        id: 'emerald-growth',
        name: 'Emerald Enterprise',
        style: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)',
        subtitle: 'Innovation & Growth',
        previewClass: 'from-emerald-900 via-emerald-700 to-teal-600'
    },
    {
        id: 'sunset-amber',
        name: 'Sunset Horizon',
        style: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #f97316 100%)',
        subtitle: 'Vibrant Energy',
        previewClass: 'from-amber-950 via-orange-600 to-amber-500'
    },
    {
        id: 'aurora-teal',
        name: 'Aurora Borealis',
        style: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 40%, #0d9488 75%, #10b981 100%)',
        subtitle: 'Modern Gradient Flow',
        previewClass: 'from-sky-900 via-cyan-600 to-emerald-500'
    }
];

export default function Profile() {
    const { isMessagingEnabled, isEmailEnabled } = useSystemConfig();
    const { currentUser, refreshCurrentUser } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();
    
    const searchParams = new URLSearchParams(location.search);
    const queryId = params.id || searchParams.get('id');

    const targetUserObj = location.state?.user;
    // Extract actual profile user ID if targetUserObj has an embedded profile link
    const embeddedProfMatch = (targetUserObj?.content || targetUserObj?.contentText || '').match(/(?:https?:\/\/[^\s]+)?\/profile\?id=([a-zA-Z0-9_-]+)/i);
    const targetUserId = embeddedProfMatch ? embeddedProfMatch[1] : (queryId || targetUserObj?.userId || targetUserObj?.id);
    
    const isOwnProfile = !targetUserId ? true : (
        (currentUser?.userId && String(targetUserId) === String(currentUser.userId)) ||
        (currentUser?.id && String(targetUserId) === String(currentUser.id)) ||
        (targetUserObj?.employeeId && currentUser?.employeeId && targetUserObj.employeeId === currentUser.employeeId) ||
        (targetUserObj?.name && currentUser?.name && targetUserObj.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim()) ||
        (targetUserObj?.fullName && currentUser?.fullName && targetUserObj.fullName.toLowerCase().trim() === currentUser.fullName.toLowerCase().trim()) ||
        (targetUserObj?.fullName && currentUser?.name && targetUserObj.fullName.toLowerCase().trim() === currentUser.name.toLowerCase().trim())
    );

    const [fetchedUser, setFetchedUser] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [isFollowLoading, setIsFollowLoading] = useState(false);

    const activeUserId = isOwnProfile ? (currentUser?.userId || currentUser?.id) : (targetUserId || targetUserObj?.userId || targetUserObj?.id);

    useEffect(() => {
        let isMounted = true;
        if (activeUserId) {
            const fetchFn = isOwnProfile ? profileApi.getMe() : profileApi.getById(activeUserId);
            fetchFn
                .then(data => {
                    if (isMounted && data) {
                        setFetchedUser(data);
                        setFollowersCount(data.followersCount || 0);
                        setIsFollowing(data.isFollowing || false);
                    }
                })
                .catch(err => {
                    if (isMounted) {
                        const isNotFound = err?.status === 404 || err?.message?.includes('not found') || String(err).includes('404');
                        if (!isNotFound) {
                            console.error("Failed to load user profile:", err);
                        } else {
                            console.warn(`[Profile] User with ID ${activeUserId} was not found.`);
                        }
                    }
                });
        } else {
            setFetchedUser(null);
        }
        return () => { isMounted = false; };
    }, [activeUserId, isOwnProfile]);

    // Resolved user object merging backend profile data
    const rawUserSource = isOwnProfile 
        ? { ...currentUser, ...(fetchedUser || {}) }
        : { ...(targetUserObj || {}), ...(fetchedUser || {}) };

    const resolvedName = rawUserSource.fullName || rawUserSource.name || 'User';
    const resolvedAvatar = rawUserSource.profilePhotoUrl || rawUserSource.avatar || null;
    const resolvedRole = rawUserSource.designation || (Array.isArray(rawUserSource.roles) && rawUserSource.roles[0]) || rawUserSource.roleName || rawUserSource.role || 'Contributor';
    const resolvedDept = rawUserSource.departmentName || rawUserSource.department || 'General';

    const displayUser = {
        ...rawUserSource,
        userId: targetUserId || rawUserSource.userId || rawUserSource.id || activeUserId,
        id: targetUserId || rawUserSource.userId || rawUserSource.id || activeUserId,
        name: resolvedName,
        fullName: resolvedName,
        avatar: resolvedAvatar,
        profilePhotoUrl: resolvedAvatar,
        role: resolvedRole,
        roleName: resolvedRole,
        designation: resolvedRole,
        department: resolvedDept,
        departmentName: resolvedDept,
        location: rawUserSource.location || 'Bhopal HQ',
        bio: (rawUserSource.bio && rawUserSource.bio !== 'Professional team member at Knome.') ? rawUserSource.bio : '',
        skills: rawUserSource.skills || ['Collaboration', 'Problem Solving'],
        interests: rawUserSource.interests || ['Technology', 'Productivity'],
        postsCount: Number(rawUserSource.postsCount ?? 0),
        followersCount: Number(rawUserSource.followersCount ?? 0),
        followingCount: Number(rawUserSource.followingCount ?? 0),
        mutualConnectionsCount: Number(rawUserSource.mutualConnectionsCount ?? 0),
        commonCommunitiesCount: Number(rawUserSource.commonCommunitiesCount ?? 0),
        karmaPoints: Number(rawUserSource.karmaPoints ?? rawUserSource.karma ?? 0),
        karma: Number(rawUserSource.karmaPoints ?? rawUserSource.karma ?? 0)
    };

    // Prefetch user communities for header stats and instant display
    useEffect(() => {
        if (activeUserId) {
            const fetchInitialComms = async () => {
                try {
                    const commsRes = isOwnProfile
                        ? await communitiesApi.getMyCommunities()
                        : await profileApi.getUserCommunities(activeUserId);
                    let comms = Array.isArray(commsRes) ? commsRes : (commsRes?.data || commsRes?.items || []);
                    if (comms && comms.length > 0) {
                        setTabData(prev => ({ ...prev, communities: comms }));
                    }
                } catch (_) {}
            };
            fetchInitialComms();
        }
    }, [activeUserId, isOwnProfile]);

    useEffect(() => {
        if (fetchedUser) {
            setFollowersCount(fetchedUser.followersCount || 0);
            setIsFollowing(fetchedUser.isFollowing || false);
        } else if (displayUser) {
            setFollowersCount(displayUser.followersCount || 0);
            setIsFollowing(displayUser.isFollowing || false);
        }
    }, [fetchedUser?.followersCount, fetchedUser?.isFollowing, displayUser?.followersCount, displayUser?.isFollowing]);

    const handleToggleFollow = async () => {
        const targetId = activeUserId || displayUser?.userId || displayUser?.id;
        if (!targetId || isOwnProfile || isFollowLoading) return;

        setIsFollowLoading(true);
        const nextFollowingState = !isFollowing;
        setIsFollowing(nextFollowingState);
        setFollowersCount(prev => nextFollowingState ? prev + 1 : Math.max(0, prev - 1));

        try {
            if (nextFollowingState) {
                await profileApi.follow(targetId);
                addToast(`You are now following ${displayUser?.fullName || displayUser?.name || 'user'}! 🎉`, 'success');
            } else {
                await profileApi.unfollow(targetId);
                addToast(`Unfollowed ${displayUser?.fullName || displayUser?.name || 'user'}`, 'info');
            }

            // Sync with backend database
            const updated = await profileApi.getById(targetId);
            if (updated) {
                setFetchedUser(updated);
                setFollowersCount(updated.followersCount);
                setIsFollowing(updated.isFollowing);
            }
            if (refreshCurrentUser) {
                await refreshCurrentUser();
            }
        } catch (err) {
            console.error("Failed to update follow status", err);
            // Revert optimistic update
            setIsFollowing(!nextFollowingState);
            setFollowersCount(prev => nextFollowingState ? Math.max(0, prev - 1) : prev + 1);
            addToast('Failed to update follow status. Please try again.', 'error');
        } finally {
            setIsFollowLoading(false);
        }
    };

    const currentProfileUserId = displayUser?.userId || displayUser?.id || activeUserId;

    const [activeTab, setActiveTab] = useState('About');
    const [networkFilter, setNetworkFilter] = useState('All');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const fileInputRef = useRef(null);
    const bannerFileInputRef = useRef(null);

    // Connections modal & quick message states
    const [connectionsList, setConnectionsList] = useState([]);
    const [isConnectionsLoading, setIsConnectionsLoading] = useState(false);
    const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
    const [connectionSearchQuery, setConnectionSearchQuery] = useState('');
    const [quickMessageTarget, setQuickMessageTarget] = useState(null);
    const [quickMessageText, setQuickMessageText] = useState('');
    const [isSendingQuickMessage, setIsSendingQuickMessage] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchConnections = async () => {
            if (!currentProfileUserId) return;
            setIsConnectionsLoading(true);
            try {
                const res = await userApi.getConnections(currentProfileUserId);
                const list = Array.isArray(res) ? res : (res?.data || []);
                if (isMounted) {
                    setConnectionsList(list);
                }
            } catch (err) {
                console.error("Failed to load connections:", err);
            } finally {
                if (isMounted) setIsConnectionsLoading(false);
            }
        };
        fetchConnections();
        return () => { isMounted = false; };
    }, [currentProfileUserId]);

    // Banner & Contact Customization states
    const [bannerImage, setBannerImage] = useState(() => {
        const key = `knome_user_banner_${currentProfileUserId || 'me'}`;
        return localStorage.getItem(key) || null;
    });
    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);

    // Bio editing states
    const [isBioModalOpen, setIsBioModalOpen] = useState(false);
    const [bioInput, setBioInput] = useState('');
    const [isSavingBio, setIsSavingBio] = useState(false);

    const handleOpenBioModal = () => {
        const currentBio = displayUser?.bio;
        setBioInput((currentBio && currentBio !== 'Professional team member at Knome.') ? currentBio : '');
        setIsBioModalOpen(true);
    };

    const handleSaveBio = async () => {
        setIsSavingBio(true);
        try {
            const currentSkills = Array.isArray(displayUser?.skills)
                ? displayUser.skills
                : typeof displayUser?.skills === 'string' && displayUser.skills.trim() !== ''
                    ? displayUser.skills.split(',').map(s => s.trim()).filter(Boolean)
                    : [];
            const currentInterests = Array.isArray(displayUser?.interests)
                ? displayUser.interests
                : typeof displayUser?.interests === 'string' && displayUser.interests.trim() !== ''
                    ? displayUser.interests.split(',').map(i => i.trim()).filter(Boolean)
                    : [];
            const updated = await profileApi.update({
                bio: bioInput.trim(),
                skills: currentSkills,
                interests: currentInterests,
                location: displayUser?.location || '',
                mobileNo: displayUser?.mobileNo || '',
                bioVisibility: displayUser?.bioVisibility || 'Public',
                networkVisibility: displayUser?.networkVisibility || 'Public',
                photosVisibility: 'Public',
                interestsVisibility: displayUser?.interestsVisibility || 'Public'
            });
            if (updated) {
                setFetchedUser(updated);
            }
            await refreshCurrentUser();
            setIsBioModalOpen(false);
            addToast('Bio updated successfully! ✨', 'success');
        } catch (err) {
            console.error('Failed to update bio:', err);
            addToast('Failed to update bio. Please try again.', 'error');
        } finally {
            setIsSavingBio(false);
        }
    };

    // Core Skills & Interests editing states
    const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);
    const [isInterestsModalOpen, setIsInterestsModalOpen] = useState(false);
    const [skillsList, setSkillsList] = useState([]);
    const [interestsList, setInterestsList] = useState([]);
    const [skillInput, setSkillInput] = useState('');
    const [interestInput, setInterestInput] = useState('');
    const [isSavingSkills, setIsSavingSkills] = useState(false);
    const [isSavingInterests, setIsSavingInterests] = useState(false);

    const handleOpenSkillsEditor = () => {
        const current = Array.isArray(displayUser?.skills) && displayUser.skills.length > 0
            ? displayUser.skills
            : typeof displayUser?.skills === 'string' && displayUser.skills.trim() !== ''
                ? displayUser.skills.split(',').map(s => s.trim()).filter(Boolean)
                : ['Collaboration', 'Problem Solving', 'Innovation'];
        setSkillsList([...current]);
        setSkillInput('');
        setIsSkillsModalOpen(true);
    };

    const handleAddSkill = (e) => {
        if (e) e.preventDefault();
        const trimmed = skillInput.trim();
        if (!trimmed) return;
        const newItems = trimmed.split(',').map(s => s.trim()).filter(Boolean);
        const unique = Array.from(new Set([...skillsList, ...newItems]));
        setSkillsList(unique);
        setSkillInput('');
    };

    const handleRemoveSkill = (skillToRemove) => {
        setSkillsList(prev => prev.filter(s => s !== skillToRemove));
    };

    const handleSaveSkills = async () => {
        setIsSavingSkills(true);
        try {
            const currentInterests = Array.isArray(displayUser?.interests) 
                ? displayUser.interests 
                : typeof displayUser?.interests === 'string' && displayUser.interests.trim() !== ''
                    ? displayUser.interests.split(',').map(i => i.trim()).filter(Boolean)
                    : [];
            const updated = await profileApi.update({
                bio: displayUser?.bio || '',
                skills: skillsList,
                interests: currentInterests,
                location: displayUser?.location || '',
                mobileNo: displayUser?.mobileNo || '',
                bioVisibility: displayUser?.bioVisibility || 'Public',
                networkVisibility: displayUser?.networkVisibility || 'Public',
                photosVisibility: 'Public',
                interestsVisibility: displayUser?.interestsVisibility || 'Public'
            });
            if (updated) {
                setFetchedUser(updated);
            }
            await refreshCurrentUser();
            setIsSkillsModalOpen(false);
            addToast('Core skills updated successfully!', 'success');
        } catch (err) {
            console.error('Failed to update skills:', err);
            addToast('Failed to update skills. Please try again.', 'error');
        } finally {
            setIsSavingSkills(false);
        }
    };

    const handleOpenInterestsEditor = () => {
        const current = Array.isArray(displayUser?.interests) && displayUser.interests.length > 0
            ? displayUser.interests
            : typeof displayUser?.interests === 'string' && displayUser.interests.trim() !== ''
                ? displayUser.interests.split(',').map(i => i.trim()).filter(Boolean)
                : ['Technology', 'Learning', 'Productivity'];
        setInterestsList([...current]);
        setInterestInput('');
        setIsInterestsModalOpen(true);
    };

    const handleAddInterest = (e) => {
        if (e) e.preventDefault();
        const trimmed = interestInput.trim();
        if (!trimmed) return;
        const newItems = trimmed.split(',').map(i => i.trim()).filter(Boolean);
        const unique = Array.from(new Set([...interestsList, ...newItems]));
        setInterestsList(unique);
        setInterestInput('');
    };

    const handleRemoveInterest = (interestToRemove) => {
        setInterestsList(prev => prev.filter(i => i !== interestToRemove));
    };

    const handleSaveInterests = async () => {
        setIsSavingInterests(true);
        try {
            const currentSkills = Array.isArray(displayUser?.skills)
                ? displayUser.skills
                : typeof displayUser?.skills === 'string' && displayUser.skills.trim() !== ''
                    ? displayUser.skills.split(',').map(s => s.trim()).filter(Boolean)
                    : [];
            const updated = await profileApi.update({
                bio: displayUser?.bio || '',
                skills: currentSkills,
                interests: interestsList,
                location: displayUser?.location || '',
                mobileNo: displayUser?.mobileNo || '',
                bioVisibility: displayUser?.bioVisibility || 'Public',
                networkVisibility: displayUser?.networkVisibility || 'Public',
                photosVisibility: 'Public',
                interestsVisibility: displayUser?.interestsVisibility || 'Public'
            });
            if (updated) {
                setFetchedUser(updated);
            }
            await refreshCurrentUser();
            setIsInterestsModalOpen(false);
            addToast('Interests updated successfully!', 'success');
        } catch (err) {
            console.error('Failed to update interests:', err);
            addToast('Failed to update interests. Please try again.', 'error');
        } finally {
            setIsSavingInterests(false);
        }
    };

    useEffect(() => {
        if (currentProfileUserId) {
            const saved = localStorage.getItem(`knome_user_banner_${currentProfileUserId}`);
            setBannerImage(saved || null);
        }
    }, [currentProfileUserId]);

    const handleBannerUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            addToast('Banner image must be under 10MB', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            const dataUrl = evt.target.result;
            setBannerImage(dataUrl);
            const key = `knome_user_banner_${currentProfileUserId || 'me'}`;
            localStorage.setItem(key, dataUrl);
            addToast('Profile banner updated successfully! ✨', 'success');
            setIsBannerModalOpen(false);
        };
        reader.readAsDataURL(file);
        if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    };

    const handleSelectPresetBanner = (gradientStr) => {
        setBannerImage(gradientStr);
        const key = `knome_user_banner_${currentProfileUserId || 'me'}`;
        localStorage.setItem(key, gradientStr);
        addToast('Profile banner updated! ✨', 'success');
        setIsBannerModalOpen(false);
    };

    const handleRemoveBanner = () => {
        setBannerImage(null);
        const key = `knome_user_banner_${currentProfileUserId || 'me'}`;
        localStorage.removeItem(key);
        addToast('Profile banner reset to default', 'info');
        setIsBannerModalOpen(false);
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploadingPhoto(true);
        try {
            const updatedProfile = await profileApi.uploadImage(file);
            if (updatedProfile) {
                setFetchedUser(updatedProfile);
            }
            await refreshCurrentUser();
            addToast('Profile photo updated successfully!', 'success');
        } catch (error) {
            console.error('Failed to upload photo:', error);
            addToast('Failed to upload photo. Please try again.', 'error');
        } finally {
            setIsUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const [editForm, setEditForm] = useState({
        bio: '',
        skills: '',
        interests: '',
        location: '',
        mobileNo: '',
        bioVisibility: 'Public',
        networkVisibility: 'Public',
        interestsVisibility: 'Public'
    });

    const handleOpenEdit = () => {
        setEditForm({
            bio: (displayUser?.bio && displayUser.bio !== 'Professional team member at Knome.') ? displayUser.bio : '',
            skills: Array.isArray(displayUser?.skills) ? displayUser.skills.join(', ') : (displayUser?.skills || ''),
            interests: Array.isArray(displayUser?.interests) ? displayUser.interests.join(', ') : (displayUser?.interests || ''),
            location: displayUser?.location || '',
            mobileNo: displayUser?.mobileNo || '',
            bioVisibility: displayUser?.bioVisibility || 'Public',
            networkVisibility: displayUser?.networkVisibility || 'Public',
            interestsVisibility: displayUser?.interestsVisibility || 'Public'
        });
        setIsEditModalOpen(true);
    };

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            const updated = await profileApi.update({
                bio: editForm.bio,
                skills: editForm.skills.split(',').map(s => s.trim()).filter(Boolean),
                interests: editForm.interests.split(',').map(i => i.trim()).filter(Boolean),
                location: editForm.location,
                mobileNo: editForm.mobileNo,
                bioVisibility: editForm.bioVisibility,
                networkVisibility: editForm.networkVisibility,
                photosVisibility: 'Public',
                interestsVisibility: editForm.interestsVisibility
            });
            if (updated) {
                setFetchedUser(updated);
            }
            await refreshCurrentUser();
            setIsEditModalOpen(false);
            addToast('Profile updated successfully!', 'success');
        } catch (err) {
            console.error('Failed to update profile:', err);
            addToast('Failed to update profile. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const [tabData, setTabData] = useState({
        posts: [],
        articles: [],
        videos: [],
        podcasts: [],
        communities: [],
        followers: [],
        following: [],
        karmaBalance: null
    });
    const [isTabLoading, setIsTabLoading] = useState(false);

    useEffect(() => {
        let isCancelled = false;
        const fetchTabData = async () => {
            if (!currentProfileUserId) return;
            setIsTabLoading(true);
            try {
                switch (activeTab) {
                    case 'Posts': {
                        const postsRes = isOwnProfile
                            ? await postsApi.getMyPosts(1, 50)
                            : await profileApi.getUserPosts(currentProfileUserId, 1, 50);
                        const rawPosts = Array.isArray(postsRes) ? postsRes : (postsRes?.data || postsRes?.items || []);
                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, posts: rawPosts.map(mapPost) }));
                        }
                        break;
                    }
                    case 'Articles': {
                        const articlesRes = isOwnProfile
                            ? await articlesApi.getMyArticles(1, 50)
                            : await profileApi.getUserArticles(currentProfileUserId, 1, 50);
                        const rawArticles = Array.isArray(articlesRes) ? articlesRes : (articlesRes?.data || articlesRes?.items || []);
                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, articles: rawArticles.map(mapArticle) }));
                        }
                        break;
                    }
                    case 'Videos': {
                        const videosRes = isOwnProfile
                            ? await videosApi.getMyVideos(1, 50)
                            : await profileApi.getUserVideos(currentProfileUserId, 1, 50);
                        const rawVideos = Array.isArray(videosRes) ? videosRes : (videosRes?.data || videosRes?.items || []);
                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, videos: rawVideos }));
                        }
                        break;
                    }
                    case 'Audio':
                    case 'Podcasts': {
                        const podcastsRes = isOwnProfile
                            ? await podcastsApi.getMyPodcasts(1, 50)
                            : await profileApi.getUserPodcasts(currentProfileUserId, 1, 50);
                        const rawPodcasts = Array.isArray(podcastsRes) ? podcastsRes : (podcastsRes?.data || podcastsRes?.items || []);
                        const activePodcasts = rawPodcasts.filter(p => p.isActive === undefined || p.isActive === null || p.isActive === true || p.isActive === 1 || p.isActive === 'true');
                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, podcasts: activePodcasts }));
                        }
                        break;
                    }
                    case 'Communities': {
                        const commsRes = isOwnProfile
                            ? await communitiesApi.getMyCommunities()
                            : await profileApi.getUserCommunities(currentProfileUserId);
                        let rawComms = Array.isArray(commsRes) ? commsRes : (commsRes?.data || commsRes?.items || []);

                        try {
                            const localJoined = JSON.parse(localStorage.getItem(`knome_joined_communities_${currentProfileUserId}`) || '[]');
                            const allCommsRes = await communitiesApi.getAll().catch(() => null);
                            const allComms = Array.isArray(allCommsRes) ? allCommsRes : (allCommsRes?.data || []);

                            const existingIds = new Set(rawComms.map(c => String(c.communityId || c.id)));
                            allComms.forEach(c => {
                                const cid = String(c.communityId || c.id);
                                const isDefault = c.communityType?.toLowerCase()?.includes('default') || c.communityType?.toLowerCase()?.includes('org');
                                const isCreator = String(c.createdByUserId) === String(currentProfileUserId);
                                const isBackend = Boolean(c.communityId);
                                const dbStatus = (c.currentUserMembershipStatus || '').toLowerCase();
                                const isDbApproved = dbStatus === 'approved' || dbStatus === 'joined';
                                const isJoined = isBackend ? isDbApproved : localJoined.some(lj => String(lj.id) === cid);
                                if ((isDefault || isJoined || isCreator) && !existingIds.has(cid)) {
                                    rawComms.push(c);
                                    existingIds.add(cid);
                                }
                            });
                        } catch (e) {
                            console.warn("Communities fallback merge error:", e);
                        }

                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, communities: rawComms }));
                        }
                        break;
                    }
                    case 'Network': {
                        const [followers, following] = await Promise.all([
                            profileApi.getFollowers(currentProfileUserId).catch(() => []),
                            profileApi.getFollowing(currentProfileUserId).catch(() => [])
                        ]);
                        const rawFollowers = Array.isArray(followers) ? followers : (followers?.data || []);
                        const rawFollowing = Array.isArray(following) ? following : (following?.data || []);
                        if (!isCancelled) {
                            setTabData(prev => ({ ...prev, followers: rawFollowers, following: rawFollowing }));
                        }
                        break;
                    }
                    case 'Karma': {
                        const kBal = isOwnProfile
                            ? await karmaApi.getMyBalance().catch(() => null)
                            : await karmaApi.getUserBalance(currentProfileUserId).catch(() => null);
                        if (!isCancelled && kBal) {
                            setTabData(prev => ({ ...prev, karmaBalance: kBal }));
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error(`Failed to load data for ${activeTab}:`, err);
            } finally {
                if (!isCancelled) setIsTabLoading(false);
            }
        };

        if (activeTab !== 'About') {
            fetchTabData();
        }
        return () => { isCancelled = true; };
    }, [activeTab, currentProfileUserId, isOwnProfile]);

    const realKarmaPoints = Number(displayUser.karmaPoints ?? displayUser.karma ?? 0);
    const karmaBadge = getKarmaBadge(realKarmaPoints);
    const karmaLevel = getKarmaLevelInfo(realKarmaPoints);

    // Filtered network connections
    const activeNetworkList = networkFilter === 'Followers' 
        ? tabData.followers 
        : networkFilter === 'Following' 
        ? tabData.following 
        : [...tabData.followers, ...tabData.following].filter((v, i, a) => a.findIndex(t => (t.id || t.userId) === (v.id || v.userId)) === i);

    const activeTabCount = 
        activeTab === 'Posts' ? tabData.posts.length :
        activeTab === 'Articles' ? tabData.articles.length :
        activeTab === 'Videos' ? tabData.videos.length :
        (activeTab === 'Podcasts' || activeTab === 'Audio') ? tabData.podcasts.length :
        activeTab === 'Communities' ? tabData.communities.length :
        activeTab === 'Network' ? activeNetworkList.length : 0;

    const { visibleCount, resetVisibleCount } = useScrollLoading(activeTabCount, 6, 6);

    useEffect(() => {
        resetVisibleCount();
    }, [activeTab, networkFilter]);

    const stats = {
        posts: Number(tabData.posts.length > 0 ? tabData.posts.length : (displayUser.postsCount ?? 0)),
        followers: followersCount,
        following: Number(displayUser.followingCount ?? 0),
        mutuals: Number(displayUser.mutualConnectionsCount ?? 0),
        commonCommunities: Number(tabData.communities.length > 0 ? tabData.communities.length : (displayUser.commonCommunitiesCount ?? 0)),
        karma: realKarmaPoints
    };

    const resolveImageUrl = (url, fallbackName = '') => {
        if (!url) {
            const found = users.find(u => u.name === fallbackName || u.fullName === fallbackName);
            return found?.avatar || null;
        }
        return resolveMediaUrl(url);
    };

    // Connections count & filtered connections list for modal
    const displayedConnectionsCount = connectionsList.length > 0
        ? connectionsList.length
        : (displayUser?.connectionsCount ?? (stats.mutuals > 0 ? stats.mutuals : (tabData.followers.length > 0 ? tabData.followers.length : 1)));

    const displayedConnectionsList = useMemo(() => {
        const pool = connectionsList.length > 0 
            ? connectionsList 
            : (tabData.followers.length > 0 
                ? tabData.followers 
                : (users || []).filter(u => String(u.id || u.userId) !== String(currentProfileUserId)).slice(0, 1));
        
        if (!connectionSearchQuery.trim()) return pool;
        const q = connectionSearchQuery.toLowerCase().trim();
        return pool.filter(c => {
            const n = (c.name || c.fullName || '').toLowerCase();
            const r = (c.designation || c.role || c.roleName || c.department || '').toLowerCase();
            return n.includes(q) || r.includes(q);
        });
    }, [connectionsList, tabData.followers, users, currentProfileUserId, connectionSearchQuery]);

    // Send instant quick message directly from connections modal via encrypted real API
    const handleSendQuickMessage = async (targetColleague) => {
        const text = quickMessageText.trim();
        if (!text || !targetColleague) return;

        setIsSendingQuickMessage(true);
        const targetId = Number(targetColleague.id || targetColleague.userId);
        const targetName = targetColleague.name || targetColleague.fullName || 'Colleague';

        try {
            await messagesApi.send(targetId, text);
            playMessageChime();
            addToast(`Message sent to ${targetName}! 💬`, 'success');
            setQuickMessageText('');
            setQuickMessageTarget(null);
        } catch (err) {
            console.error('Failed to send message:', err);
            addToast(`Failed to send message: ${err?.message || 'Network error'}`, 'error');
        } finally {
            setIsSendingQuickMessage(false);
        }
    };

    const isSysAdmin = Boolean(
        (['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(displayUser?.role || '').toUpperCase()) || 
         ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(displayUser?.roleName || '').toUpperCase()) || 
         ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN'].includes(String(displayUser?.designation || '').toUpperCase()) ||
         (Array.isArray(displayUser?.roles) && displayUser.roles.some(r => ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'SYSTEMADMIN'].includes(String(r || '').toUpperCase())))) &&
        !['HR Administrator', 'HR Admin', 'Community Administrator', 'Community Admin', 'Employee'].includes(displayUser?.roleName)
    );

    const tabs = isSysAdmin 
        ? ['About', 'Communities', 'Network'] 
        : ['About', 'Posts', 'Articles', 'Videos', 'Audio', 'Communities', 'Network', 'Karma'];

    const avatarSource = resolveImageUrl(displayUser?.avatar || displayUser?.profilePhotoUrl, displayUser?.name || displayUser?.fullName);

    return (
        <main className="flex-1 min-w-0">
            {/* Profile Header Card (LinkedIn Design) */}
            <div className="relative rounded-3xl overflow-hidden mb-6 shadow-sm border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                {/* Banner Background */}
                <div className="h-52 sm:h-60 md:h-64 w-full relative overflow-hidden group">
                    {bannerImage ? (
                        bannerImage.startsWith('data:') || bannerImage.startsWith('http') ? (
                            <img 
                                src={bannerImage} 
                                alt="Cover Banner" 
                                className="w-full h-full object-cover" 
                            />
                        ) : (
                            <div 
                                className="w-full h-full relative" 
                                style={{ background: bannerImage }}
                            >
                                <div className="absolute inset-0 bg-black/10" />
                            </div>
                        )
                    ) : (
                        // Default Trupeer-inspired Violet Banner with Knome branding
                        <div 
                            className="w-full h-full relative"
                            style={{
                                background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 35%, #8b5cf6 70%, #a855f7 100%)'
                            }}
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-black/25 pointer-events-none" />
                            {/* Watermark in right side of banner */}
                            <div className="absolute right-6 sm:right-10 top-1/2 -translate-y-1/2 hidden sm:flex flex-col items-start select-none pointer-events-none opacity-90 pr-4">
                                <div className="flex items-center gap-2 text-white font-black text-xl tracking-wide drop-shadow-md">
                                    <span className="material-symbols-outlined text-[26px]">hub</span>
                                    <span>MPOnline Knome</span>
                                </div>
                                <p className="text-white/85 text-xs font-semibold mt-1 drop-shadow-sm">
                                    Enterprise Knowledge & Collaboration Platform
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Hidden Banner File Input */}
                    <input 
                        type="file" 
                        ref={bannerFileInputRef} 
                        accept="image/*" 
                        onChange={handleBannerUpload} 
                        className="hidden" 
                    />

                    {/* Edit Banner Button (Top Right of Banner) */}
                    {isOwnProfile && (
                        <button
                            type="button"
                            onClick={() => setIsBannerModalOpen(true)}
                            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 shadow-lg backdrop-blur-md flex items-center justify-center transition-all hover:scale-110 cursor-pointer border border-white/40 dark:border-slate-700"
                            title="Edit background banner"
                        >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                    )}
                </div>

                {/* Top Row below banner: Avatar & Right Edit Pencil */}
                <div className="flex justify-between items-end -mt-20 md:-mt-24 px-6 md:px-8 mb-3">
                    {/* Avatar */}
                    <div className="w-36 h-36 md:w-40 md:h-40 rounded-full border-4 border-white dark:border-slate-900 shadow-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-5xl font-black relative overflow-hidden group ring-4 ring-black/5 dark:ring-white/5">
                        {avatarSource ? (
                            <img 
                                src={avatarSource} 
                                alt={displayUser?.name || 'Avatar'} 
                                className="w-full h-full object-cover rounded-full" 
                                onError={(e) => {
                                    const fallback = users.find(u => u.name === (displayUser?.name || displayUser?.fullName) || u.employeeId === displayUser?.employeeId)?.avatar;
                                    if (fallback && e.currentTarget.src !== fallback) {
                                        e.currentTarget.src = fallback;
                                    } else {
                                        e.currentTarget.style.display = 'none';
                                        if (e.currentTarget.nextElementSibling) {
                                            e.currentTarget.nextElementSibling.style.display = 'flex';
                                        }
                                    }
                                }}
                            />
                        ) : null}
                        <div 
                            className="w-full h-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-5xl font-black rounded-full"
                            style={{ display: avatarSource ? 'none' : 'flex' }}
                        >
                            {(displayUser?.name || displayUser?.fullName || currentUser?.fullName || 'User').charAt(0).toUpperCase()}
                        </div>
                    </div>
                </div>

                {/* Profile Information & Details */}
                <div className="px-6 md:px-8 pb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        {/* Left Side: Name, headline, bio, contact info, connections */}
                        <div className="flex-1 max-w-2xl">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    {displayUser?.fullName || displayUser?.name || currentUser?.fullName || 'User'}
                                </h1>
                                {/* Verified Badge */}
                                <span 
                                    className="material-symbols-outlined text-[20px] text-blue-500 font-bold" 
                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                    title="Verified MPOnline Employee"
                                >
                                    verified
                                </span>
                                {/* Pronouns */}
                                <span className="text-slate-500 dark:text-slate-400 text-sm font-normal">
                                    ({displayUser?.pronouns || 'He/Him'})
                                </span>
                                {/* Role / Designation tag */}
                                {(displayUser?.roleName || displayUser?.role || displayUser?.designation) && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                        {displayUser?.roleName || displayUser?.role || displayUser?.designation || 'Member'}
                                    </span>
                                )}
                                {/* Status Badge */}
                                {(() => {
                                    const statusCfg = getUserStatusConfig(displayUser || currentUser);
                                    return (
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors ${statusCfg.badgeClass}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`}></span>
                                            {statusCfg.label}
                                        </span>
                                    );
                                })()}
                            </div>

                            {/* Contact info and Connections Link */}
                            <div className="flex items-center gap-1.5 mt-2 text-xs md:text-sm">
                                <button 
                                    type="button"
                                    onClick={() => setIsContactModalOpen(true)}
                                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                                >
                                    Contact info
                                </button>
                                <span className="text-slate-400 font-normal">·</span>
                                <button 
                                    type="button"
                                    onClick={() => setIsConnectionsModalOpen(true)}
                                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                                    title="View connections"
                                >
                                    <span>
                                        {displayedConnectionsCount} {displayedConnectionsCount === 1 ? 'connection' : 'connections'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Right-most side of name: Share profile button */}
                        <div className="flex items-center shrink-0 self-start md:self-auto mt-1 md:mt-0">
                            <button 
                                type="button"
                                onClick={() => setIsShareModalOpen(true)}
                                className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-full transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                                title="Share profile"
                            >
                                <span className="material-symbols-outlined text-[17px]">share</span>
                                <span>Share profile</span>
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons Row (For Other Users' Profiles) */}
                    {!isOwnProfile && (
                        <div className="flex flex-wrap items-center gap-2 mt-4">
                                {displayUser.connectionStatus === 'PendingReceived' ? (
                                    <>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    if (displayUser.requestId) {
                                                        await userApi.acceptConnection(displayUser.requestId);
                                                    } else {
                                                        await userApi.connect(displayUser.userId);
                                                    }
                                                    window.location.reload();
                                                } catch (e) {
                                                    console.error(e);
                                                }
                                            }}
                                            className="px-5 py-1.5 bg-blue-600 text-white font-bold text-sm rounded-full hover:bg-blue-700 transition-all shadow-xs"
                                        >
                                            Accept Request
                                        </button>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    if (displayUser.requestId) {
                                                        await userApi.rejectConnection(displayUser.requestId);
                                                    }
                                                    window.location.reload();
                                                } catch (e) {
                                                    console.error(e);
                                                }
                                            }}
                                            className="px-4 py-1.5 border border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-full transition-all"
                                        >
                                            Ignore
                                        </button>
                                    </>
                                ) : displayUser.connectionStatus === 'PendingSent' || displayUser.connectionStatus === 'Pending' ? (
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await userApi.cancelConnection(displayUser.userId);
                                                window.location.reload();
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-bold text-sm rounded-full hover:bg-amber-100 transition-all border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 cursor-pointer"
                                        title="Click to cancel connection request"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                                        Pending • Cancel
                                    </button>
                                ) : displayUser.connectionStatus === 'Connected' ? (
                                    <button 
                                        onClick={async () => {
                                            const ok = await confirm({
                                                title: 'Remove Connection',
                                                message: `Are you sure you want to remove your connection with ${displayUser.name || 'this user'}?`,
                                                confirmText: 'Remove Connection',
                                                cancelText: 'Cancel',
                                                variant: 'warning'
                                            });
                                            if (!ok) return;
                                            try {
                                                await userApi.removeConnection(displayUser.userId);
                                                addToast && addToast('Connection removed.', 'info');
                                                window.location.reload();
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-bold text-sm rounded-full hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                                        Connected
                                    </button>
                                ) : (
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await userApi.connect(displayUser.userId);
                                                window.location.reload();
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="px-5 py-1.5 bg-blue-600 text-white font-bold text-sm rounded-full hover:bg-blue-700 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                                        Connect
                                    </button>
                                )}

                                {/* Follow / Following Toggle Button */}
                                <button
                                    onClick={handleToggleFollow}
                                    disabled={isFollowLoading}
                                    className={`px-4 py-1.5 font-bold text-sm rounded-full transition-all border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                        isFollowing 
                                            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 shadow-xs' 
                                            : 'border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">
                                        {isFollowing ? 'check_circle' : 'person_add'}
                                    </span>
                                    {isFollowing ? 'Following ✔' : 'Follow'}
                                </button>

                                {/* Direct Message Button */}
                                {isMessagingEnabled && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const targetId = displayUser.userId || displayUser.id;
                                            const targetName = displayUser.name || displayUser.fullName || '';
                                            navigate(`/messages?userId=${targetId}&name=${encodeURIComponent(targetName)}`);
                                        }}
                                        className="px-4 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-sm rounded-full transition-all shadow-xs flex items-center gap-1.5 cursor-pointer hover:shadow-md active:scale-95"
                                        title={`Message ${displayUser.name || 'this user'}`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                                        <span>Message</span>
                                    </button>
                                )}
                        </div>
                    )}
                    {/* Interactive Stats Row */}
                    <div className={`grid ${isSysAdmin ? 'grid-cols-2 md:grid-cols-4' : (isOwnProfile ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-3 md:grid-cols-6')} gap-4 py-6 border-t border-slate-100 dark:border-slate-800/50 mt-5`}>
                        {!isSysAdmin && (
                            <button onClick={() => setActiveTab('Posts')} className="text-center group cursor-pointer transition-transform hover:scale-105">
                                <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-500 to-purple-500">{stats.posts}</p>
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-indigo-500 transition-colors">Posts</p>
                            </button>
                        )}
                        <button onClick={() => { setActiveTab('Network'); setNetworkFilter('Followers'); }} className="text-center border-l border-slate-100 dark:border-slate-800/50 group cursor-pointer transition-transform hover:scale-105">
                            <p className="text-2xl font-black text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">{stats.followers}</p>
                            <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-indigo-500 transition-colors">Followers</p>
                        </button>
                        <button onClick={() => { setActiveTab('Network'); setNetworkFilter('Following'); }} className="text-center border-l border-slate-100 dark:border-slate-800/50 group cursor-pointer transition-transform hover:scale-105">
                            <p className="text-2xl font-black text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">{stats.following}</p>
                            <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-indigo-500 transition-colors">Following</p>
                        </button>
                        {!isOwnProfile && (
                            <button onClick={() => { setActiveTab('Network'); setNetworkFilter('All'); }} className="text-center md:border-l border-slate-100 dark:border-slate-800/50 group cursor-pointer transition-transform hover:scale-105">
                                <p className="text-2xl font-black text-teal-500 dark:text-teal-400">{stats.mutuals}</p>
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-teal-500 transition-colors">Mutuals</p>
                            </button>
                        )}
                        <button onClick={() => setActiveTab('Communities')} className="text-center border-l border-slate-100 dark:border-slate-800/50 group cursor-pointer transition-transform hover:scale-105">
                            <p className="text-2xl font-black text-pink-500 dark:text-pink-400">{stats.commonCommunities}</p>
                            <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-pink-500 transition-colors">Groups</p>
                        </button>
                        {!isSysAdmin && (
                            <button onClick={() => setActiveTab('Karma')} className="text-center border-l border-slate-100 dark:border-slate-800/50 group cursor-pointer transition-transform hover:scale-105">
                                <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-500 to-amber-600">{stats.karma}</p>
                                <p className="text-slate-500 dark:text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1 group-hover:text-amber-500 transition-colors">Karma</p>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center gap-8 mb-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar whitespace-nowrap px-4">
                {tabs.map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative pb-4 font-bold text-sm transition-colors cursor-pointer ${activeTab === tab ? 'text-indigo-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-500 rounded-t-full"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
                {activeTab === 'About' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {/* Bio / About Me */}
                            <div className="rounded-2xl border shadow-sm p-6 glass card-lift">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-500">person</span>
                                        <span>About Me</span>
                                    </h3>
                                    {isOwnProfile && (
                                        <button
                                            type="button"
                                            onClick={handleOpenBioModal}
                                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-indigo-200/60 dark:border-indigo-800/40"
                                            title="Edit About Me"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">edit</span>
                                            <span>Edit</span>
                                        </button>
                                    )}
                                </div>
                                {displayUser?.bio && displayUser.bio.trim() !== '' && displayUser.bio !== 'Professional team member at Knome.' ? (
                                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm whitespace-pre-line">
                                        {displayUser.bio}
                                    </p>
                                ) : (
                                    <div className="py-2">
                                        {isOwnProfile ? (
                                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                                                No summary added yet.{' '}
                                                <button
                                                    type="button"
                                                    onClick={handleOpenBioModal}
                                                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer ml-1"
                                                >
                                                    <span>Add summary</span>
                                                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                                </button>
                                            </p>
                                        ) : (
                                            <p className="text-slate-400 dark:text-slate-500 text-sm italic">
                                                No summary provided yet.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Skills & Interests */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="rounded-2xl border shadow-sm p-6 glass card-lift">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-500">psychology</span>
                                            Core Skills
                                        </h3>
                                        {isOwnProfile && (
                                            <button
                                                type="button"
                                                onClick={handleOpenSkillsEditor}
                                                className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-indigo-200/60 dark:border-indigo-800/40"
                                                title="Edit Core Skills"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                <span>Edit</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(Array.isArray(displayUser?.skills) && displayUser.skills.length > 0
                                            ? displayUser.skills
                                            : typeof displayUser?.skills === 'string' && displayUser.skills.trim() !== ''
                                                ? displayUser.skills.split(',').map(s => s.trim())
                                                : ['Collaboration', 'Problem Solving', 'Innovation']
                                        ).map((skill, i) => {
                                            const label = typeof skill === 'object' && skill !== null ? (skill.skill || skill.name || JSON.stringify(skill)) : String(skill);
                                            return (
                                                <span key={i} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 text-[12px] font-bold rounded-lg">{label}</span>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="rounded-2xl border shadow-sm p-6 glass card-lift">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-pink-500">interests</span>
                                            Interests
                                        </h3>
                                        {isOwnProfile && (
                                            <button
                                                type="button"
                                                onClick={handleOpenInterestsEditor}
                                                className="flex items-center gap-1 text-xs font-bold text-pink-600 dark:text-pink-400 hover:text-pink-700 hover:bg-pink-50 dark:hover:bg-pink-950/50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-pink-200/60 dark:border-pink-800/40"
                                                title="Edit Interests"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                <span>Edit</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(Array.isArray(displayUser?.interests) && displayUser.interests.length > 0
                                            ? displayUser.interests
                                            : typeof displayUser?.interests === 'string' && displayUser.interests.trim() !== ''
                                                ? displayUser.interests.split(',').map(i => i.trim())
                                                : ['Technology', 'Learning', 'Productivity']
                                        ).map((interest, i) => {
                                            const label = typeof interest === 'object' && interest !== null ? (interest.interest || interest.name || JSON.stringify(interest)) : String(interest);
                                            return (
                                                <span key={i} className="px-3 py-1.5 bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-800/50 text-[12px] font-bold rounded-lg">{label}</span>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Rail: Expertise & Badges / Governance */}
                        <div className="flex flex-col gap-6">
                            {isSysAdmin ? (
                                <div className="rounded-2xl border border-indigo-500/30 shadow-sm p-6 glass card-lift overflow-hidden relative group">
                                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
                                    <h3 className="text-[12px] font-black uppercase tracking-widest text-indigo-500 mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                                        System Admin
                                    </h3>
                                    <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed mb-4 font-medium">
                                        Full platform governance access, user management, audit logs, and security controls active across Knome.
                                    </p>
                                    <div className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800/50">
                                        <span className="material-symbols-outlined text-[18px] text-indigo-500">verified_user</span>
                                        Governance Privileges Active
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border shadow-sm p-6 glass card-lift overflow-hidden relative group">
                                    <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
                                    <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-400 mb-6">Platform Level</h3>
                                    <div className="flex items-center gap-4 mb-6">
                                        <KarmaLevelMedal level={karmaLevel.level} size={64} className="shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white text-lg">{karmaLevel.name} Contributor</p>
                                            <p className="text-slate-500 text-xs font-semibold mt-0.5">Level {karmaLevel.level} • {stats.karma.toLocaleString()} Karma Points</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[11px] font-bold text-slate-500">
                                            <span>
                                                {karmaLevel.nextLevel 
                                                    ? `Progress to Level ${karmaLevel.nextLevel} (${karmaLevel.nextName} Contributor)` 
                                                    : 'Maximum Platform Contributor Rank'}
                                            </span>
                                            <span className={karmaLevel.circleText}>{karmaLevel.progressPercent}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${karmaLevel.progressBar} rounded-full transition-all duration-500`} style={{ width: `${karmaLevel.progressPercent}%` }}></div>
                                        </div>
                                        {karmaLevel.nextTarget && (
                                            <p className="text-[10px] font-semibold text-slate-400 text-right mt-1">
                                                {karmaLevel.pointsRemaining.toLocaleString()} pts to {karmaLevel.nextName}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'Karma' && (
                    <div className="flex flex-col gap-6">
                        {/* Summary / Badge Card */}
                        <div className="rounded-2xl border shadow-sm p-8 glass card-lift bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
                            <div className="flex flex-col md:flex-row items-center gap-8 justify-between">
                                <div className="flex items-center gap-6">
                                    <KarmaLevelMedal level={karmaLevel.level} size={84} className="shrink-0" />
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{karmaBadge.name} Contributor</h3>
                                        <p className="text-[13px] font-bold text-slate-500 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[16px] text-amber-500">stars</span>
                                            {stats.karma.toLocaleString()} Lifetime Karma Points
                                        </p>
                                    </div>
                                </div>
                                <div className="text-center bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 min-w-[200px]">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Platform Level</div>
                                    <div className={`text-3xl font-black ${karmaLevel.circleText}`}>Level {karmaLevel.level}</div>
                                    <div className="text-[11px] font-bold text-slate-500 mt-0.5">{karmaLevel.name} Contributor</div>
                                </div>
                            </div>
                        </div>

                        {/* Recent History Table */}
                        <div className="rounded-2xl border shadow-sm glass card-lift overflow-hidden bg-white dark:bg-slate-900">
                            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500">history</span>
                                    Recent Karma Ledger
                                </h3>
                                <button onClick={() => navigate('/karma-history')} className="text-xs font-bold text-indigo-500 hover:underline cursor-pointer">
                                    Full History →
                                </button>
                            </div>
                            {isTabLoading ? (
                                <p className="p-6 text-center text-slate-500 text-sm">Loading karma ledger...</p>
                            ) : (!tabData.karmaBalance?.recentTransactions || tabData.karmaBalance.recentTransactions.length === 0) ? (
                                <div className="p-8 text-center text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">stars</span>
                                    <p className="text-sm font-medium">No karma transactions recorded yet.</p>
                                    <p className="text-xs text-slate-500 mt-1">Publish posts, articles, or participate in communities to earn karma.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {tabData.karmaBalance.recentTransactions.map((tx, idx) => (
                                            <tr key={tx.transactionId || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 text-[12px] font-medium text-slate-400">
                                                    {new Date(tx.createdDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td className="px-6 py-4 text-[13px] font-bold text-slate-700 dark:text-slate-300">
                                                    {tx.activityType}
                                                    {tx.relatedContentType ? ` (${tx.relatedContentType})` : ''}
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-amber-500">
                                                    +{tx.pointsAwarded}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 text-center border-t border-slate-200 dark:border-slate-800">
                                <button onClick={() => navigate('/karma-history')} className="text-[12px] font-bold text-indigo-500 hover:underline cursor-pointer">
                                    View Full Leaderboard & Rules
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'Posts' && (
                    <div className="space-y-6 w-full">
                        {isTabLoading ? (
                            <p className="text-center text-slate-500 font-medium py-8">Loading posts...</p>
                        ) : tabData.posts.length === 0 ? (
                            <div className="text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">article</span>
                                <p className="text-slate-600 dark:text-slate-400 font-bold">No posts published yet</p>
                                <p className="text-xs text-slate-400 mt-1">Updates and posts by this user will appear here.</p>
                            </div>
                        ) : (
                            <>
                                {tabData.posts.slice(0, visibleCount).map(post => (
                                    <PostCard
                                        key={post.id || post.postId}
                                        post={post}
                                        onPostDeleted={(deletedId) => {
                                            setTabData(prev => ({
                                                ...prev,
                                                posts: prev.posts.filter(p => (p.id || p.postId) !== deletedId)
                                            }));
                                        }}
                                    />
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < tabData.posts.length} text="Loading more posts on scroll..." />
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Articles' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isTabLoading ? (
                            <p className="text-slate-500 font-medium col-span-3 text-center py-8">Loading articles...</p>
                        ) : tabData.articles.length === 0 ? (
                            <div className="col-span-3 text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">menu_book</span>
                                <p className="text-slate-600 dark:text-slate-400 font-bold">No articles published yet</p>
                                <p className="text-xs text-slate-400 mt-1">Deep-dive articles and publications by this user will appear here.</p>
                            </div>
                        ) : (
                            <>
                                {tabData.articles.slice(0, visibleCount).map(article => {
                                    const artId = article.articleId || article.id;
                                    const isScheduled = article.status === 'Scheduled';
                                    const coverImg = article.image || article.coverImageUrl;
                                    return (
                                        <div 
                                            key={artId} 
                                            onClick={() => navigate(`/article-view?id=${artId}`)}
                                            className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden glass card-lift flex flex-col cursor-pointer group hover:border-indigo-500 transition-all bg-white dark:bg-slate-900"
                                        >
                                            <div className="h-44 w-full relative overflow-hidden bg-slate-100 dark:bg-slate-950">
                                                <img 
                                                    src={coverImg} 
                                                    alt={article.title} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                                />
                                                <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                    {article.categoryName || article.category || 'General'}
                                                </div>
                                                {isScheduled && (
                                                    <div className="absolute top-3 right-3 bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded-full text-[10px] flex items-center gap-1 shadow-md">
                                                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                        Scheduled
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-5 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-500 mb-2">
                                                        <span>{article.readTime || `${article.readTimeMinutes || 5} min read`}</span>
                                                        <span className="text-slate-400">{article.time || (article.createdDate ? new Date(article.createdDate).toLocaleDateString() : 'Recent')}</span>
                                                    </div>
                                                    <h4 className="font-bold text-slate-900 dark:text-white text-base mb-2 leading-snug group-hover:text-indigo-500 transition-colors line-clamp-2">
                                                        {article.title}
                                                    </h4>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4 line-clamp-2">
                                                        {article.subtitle || article.description || article.summary || 'Read this article on Knome.'}
                                                    </p>
                                                </div>
                                                <div>
                                                    {article.tags && article.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mb-3">
                                                            {article.tags.slice(0, 3).map((tag, idx) => (
                                                                <span key={idx} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                                                                    #{tag.replace('#', '')}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[16px]">visibility</span> 
                                                                {article.views || article.viewCount || 0}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[16px] text-rose-500">favorite</span> 
                                                                {article.likes || article.likesCount || 0}
                                                            </span>
                                                        </div>
                                                        <span className="text-indigo-500 font-bold hover:underline">Read Article →</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <ScrollLoadingIndicator isVisible={visibleCount < tabData.articles.length} text="Loading more articles on scroll..." />
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Videos' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isTabLoading ? (
                            <p className="text-slate-500 font-medium col-span-3 text-center py-8">Loading videos...</p>
                        ) : tabData.videos.length === 0 ? (
                            <div className="col-span-3 text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">smart_display</span>
                                <p className="text-slate-600 dark:text-slate-400 font-bold">No videos uploaded yet</p>
                            </div>
                        ) : (
                            <>
                                {tabData.videos.slice(0, visibleCount).map(video => (
                                    <div 
                                        key={video.videoId || video.id} 
                                        onClick={() => navigate('/videos')}
                                        className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden glass card-lift cursor-pointer group hover:border-indigo-500 transition-all"
                                    >
                                        <div className="relative h-44 group cursor-pointer">
                                            <img src={resolveMediaUrl(video.thumbnailUrl) || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                                <div className="w-12 h-12 rounded-full bg-white/90 text-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined text-[28px] pl-1" style={{fontVariationSettings:"'FILL' 1"}}>play_arrow</span>
                                                </div>
                                            </div>
                                            <span className="absolute bottom-3 right-3 bg-black/80 text-white text-[10px] font-black px-2 py-1 rounded-md">
                                                {video.durationSeconds ? Math.floor(video.durationSeconds / 60) + ':' + (video.durationSeconds % 60).toString().padStart(2, '0') : '0:00'}
                                            </span>
                                        </div>
                                        <div className="p-4">
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1 line-clamp-1 group-hover:text-indigo-500 transition-colors">{video.title}</h4>
                                            <p className="text-xs text-slate-400 font-medium">{video.viewCount || 0} views • {new Date(video.uploadedDate || video.createdDate || Date.now()).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < tabData.videos.length} text="Loading more videos on scroll..." />
                            </>
                        )}
                    </div>
                )}

                {(activeTab === 'Podcasts' || activeTab === 'Audio') && (
                    <div className="flex flex-col gap-4">
                        {isTabLoading ? (
                            <p className="text-slate-500 font-medium text-center py-8">Loading audio...</p>
                        ) : tabData.podcasts.length === 0 ? (
                            <div className="text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">audiotrack</span>
                                <p className="text-slate-600 dark:text-slate-400 font-bold">No audio uploaded yet</p>
                            </div>
                        ) : (
                            <>
                                {tabData.podcasts.slice(0, visibleCount).map(podcast => (
                                    <div 
                                        key={podcast.podcastId || podcast.id} 
                                        onClick={() => navigate('/podcasts')}
                                        className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 glass card-lift flex items-center gap-5 cursor-pointer group hover:border-indigo-500 transition-all"
                                    >
                                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                                            <span className="material-symbols-outlined text-[32px]">podcasts</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate group-hover:text-indigo-500 transition-colors">{podcast.title}</h4>
                                            <p className="text-xs text-slate-400 font-medium mt-1">{podcast.hostName || displayUser.name} • {podcast.durationSeconds ? Math.floor(podcast.durationSeconds / 60) + ' min' : '0 min'}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{new Date(podcast.publishedDate || podcast.createdDate || Date.now()).toLocaleDateString()}</p>
                                        </div>
                                        <button className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-md hover:bg-indigo-600 transition-colors shrink-0 cursor-pointer">
                                            <span className="material-symbols-outlined text-[20px] pl-0.5" style={{fontVariationSettings:"'FILL' 1"}}>play_arrow</span>
                                        </button>
                                    </div>
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < tabData.podcasts.length} text="Loading more podcasts on scroll..." />
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Communities' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {isTabLoading ? (
                            <p className="text-slate-500 font-medium col-span-3 text-center py-8">Loading communities...</p>
                        ) : tabData.communities.length === 0 ? (
                            <div className="col-span-3 text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">groups</span>
                                <p className="text-slate-600 dark:text-slate-400 font-bold">No communities joined yet</p>
                            </div>
                        ) : (
                            <>
                                {tabData.communities.slice(0, visibleCount).map(comm => {
                                    const targetCommId = comm.communityId || comm.id;
                                    const imgs = getCommunityImages(comm.name, comm.categoryName || comm.category);
                                    const bannerUrl = resolveMediaUrl(comm.bannerUrl || comm.bannerImageUrl) || comm.banner || imgs.banner;
                                    const memberCount = comm.membersCount || comm.memberCount || 1;
                                    const isDefault = comm.communityType?.toLowerCase()?.includes('default') || comm.communityType?.toLowerCase()?.includes('org');
                                    const roleBadge = comm.isCurrentUserAdmin ? 'Admin' : (comm.currentUserRole || (isDefault ? 'Official Member' : 'Member'));

                                    return (
                                        <div 
                                            key={targetCommId} 
                                            onClick={() => navigate(`/community/view?id=${targetCommId}`)}
                                            className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden glass card-lift cursor-pointer hover:border-indigo-500 transition-all group bg-white dark:bg-slate-900"
                                        >
                                            <div className="h-32 relative overflow-hidden bg-slate-200 dark:bg-slate-800">
                                                <img src={bannerUrl} alt={comm.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                                                <span className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/20">
                                                    {roleBadge}
                                                </span>
                                                {isDefault && (
                                                    <span className="absolute top-3 left-3 bg-indigo-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md flex items-center gap-1 shadow-xs">
                                                        <span className="material-symbols-outlined text-[12px]">verified</span>
                                                        Org
                                                    </span>
                                                )}
                                            </div>
                                            <div className="p-4 flex items-center justify-between">
                                                <div className="min-w-0 flex-1 pr-3">
                                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-indigo-500 transition-colors truncate">{comm.name}</h4>
                                                    <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">groups</span>
                                                        {memberCount} {memberCount === 1 ? 'member' : 'members'}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/community/view?id=${targetCommId}`);
                                                    }}
                                                    className="px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-lg hover:bg-indigo-500 hover:text-white transition-all shadow-xs cursor-pointer shrink-0"
                                                >
                                                    View
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                <ScrollLoadingIndicator isVisible={visibleCount < tabData.communities.length} text="Loading more communities on scroll..." />
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'Network' && (
                    <div className="flex flex-col gap-6">
                        {/* Sub Filter Tabs */}
                        <div className="flex gap-2">
                            {['All', 'Followers', 'Following'].map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setNetworkFilter(filter)}
                                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        networkFilter === filter
                                            ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {isTabLoading ? (
                                <p className="text-slate-500 font-medium col-span-3 text-center py-8">Loading network...</p>
                            ) : (() => {
                                const activeNetworkList = networkFilter === 'Followers' 
                                    ? tabData.followers 
                                    : networkFilter === 'Following' 
                                    ? tabData.following 
                                    : [...tabData.followers, ...tabData.following].filter((v, i, a) => a.findIndex(t => (t.id || t.userId) === (v.id || v.userId)) === i);
                                
                                return activeNetworkList.length === 0 ? (
                                    <div className="col-span-3 text-center py-12 glass rounded-2xl border border-slate-200 dark:border-slate-800">
                                        <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">group</span>
                                        <p className="text-slate-600 dark:text-slate-400 font-bold">No {networkFilter.toLowerCase()} found</p>
                                    </div>
                                ) : (
                                    <>
                                        {activeNetworkList.slice(0, visibleCount).map(person => {
                                            const personId = person.userId || person.id;
                                            const personAvatar = resolveMediaUrl(person.avatar || person.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name || person.fullName || 'User')}&background=6366f1&color=fff`;
                                            const personName = person.name || person.fullName || 'User';

                                            return (
                                                <div key={personId} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 glass card-lift flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <img 
                                                            src={personAvatar} 
                                                            alt={personName} 
                                                            className="w-12 h-12 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" 
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(personName)}&background=6366f1&color=fff`;
                                                            }}
                                                        />
                                                        <div className="min-w-0">
                                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm whitespace-normal break-words">{personName}</h4>
                                                            <p className="text-xs text-slate-400 truncate">{person.designation || 'MPOnline Colleague'}</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{person.department || 'Department'}</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => navigate(`/profile?id=${personId}`)}
                                                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-indigo-500 hover:text-white transition-colors shrink-0 cursor-pointer"
                                                    >
                                                        View Profile
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <ScrollLoadingIndicator isVisible={visibleCount < activeNetworkList.length} text="Loading more connections on scroll..." />
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 transform transition-all">
                        
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Profile</h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                            {/* Photo Upload */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Profile Photo</label>
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-2xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 text-2xl font-black overflow-hidden border border-slate-200 dark:border-slate-700">
                                        {avatarSource ? (
                                            <img src={avatarSource} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            (displayUser?.name || 'U').charAt(0)
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                onChange={handlePhotoUpload} 
                                                accept="image/jpeg, image/png, image/gif" 
                                                className="hidden" 
                                            />
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploadingPhoto}
                                                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-bold rounded-lg border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 cursor-pointer">
                                                {isUploadingPhoto ? 'Uploading...' : 'Upload New Photo'}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500">JPG, GIF or PNG. Max size of 5MB.</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Bio */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">About Me (Bio)</label>
                                <textarea 
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    rows="4"
                                    value={editForm.bio}
                                    onChange={e => setEditForm(prev => ({...prev, bio: e.target.value}))}
                                    placeholder="Write a short summary about yourself and your role..."
                                ></textarea>
                            </div>

                            {/* Location & Mobile */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Location</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                                        value={editForm.location}
                                        onChange={e => setEditForm(prev => ({...prev, location: e.target.value}))}
                                        placeholder="e.g. Bhopal, MP"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Mobile Number</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                                        value={editForm.mobileNo}
                                        onChange={e => setEditForm(prev => ({...prev, mobileNo: e.target.value}))}
                                        placeholder="e.g. +91 9876543210"
                                    />
                                </div>
                            </div>
                            
                            {/* Skills & Interests */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Skills (Comma separated)</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                                        value={editForm.skills}
                                        onChange={e => setEditForm(prev => ({...prev, skills: e.target.value}))}
                                        placeholder="e.g. C#, ASP.NET, React, SQL"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Interests (Comma separated)</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                                        value={editForm.interests}
                                        onChange={e => setEditForm(prev => ({...prev, interests: e.target.value}))}
                                        placeholder="e.g. Cloud Architecture, UI/UX, AI"
                                    />
                                </div>
                            </div>
                            
                            {/* Visibility Settings */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white mb-4">Privacy & Visibility Settings</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Profile Bio</span>
                                        <select 
                                            value={editForm.bioVisibility} 
                                            onChange={e => setEditForm(prev => ({...prev, bioVisibility: e.target.value}))}
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                            <option>Public</option>
                                            <option>Connections Only</option>
                                            <option>Private</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Network Connections</span>
                                        <select 
                                            value={editForm.networkVisibility} 
                                            onChange={e => setEditForm(prev => ({...prev, networkVisibility: e.target.value}))}
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                            <option>Public</option>
                                            <option>Connections Only</option>
                                            <option>Private</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Interests</span>
                                        <select 
                                            value={editForm.interestsVisibility} 
                                            onChange={e => setEditForm(prev => ({...prev, interestsVisibility: e.target.value}))}
                                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                            <option>Public</option>
                                            <option>Connections Only</option>
                                            <option>Private</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
                            <button onClick={() => setIsEditModalOpen(false)} disabled={isSaving} className="px-6 py-2.5 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50 cursor-pointer">
                                Cancel
                            </button>
                            <button onClick={handleSaveProfile} disabled={isSaving} className="px-6 py-2.5 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Profile Modal */}
            <ShareProfileModal 
                isOpen={isShareModalOpen} 
                onClose={() => setIsShareModalOpen(false)} 
                user={displayUser} 
            />

            {/* Edit Bio Modal */}
            {isBioModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsBioModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[20px]">edit_note</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit About Me & Bio</h2>
                                    <p className="text-xs text-slate-500">Update your headline and professional summary</p>
                                </div>
                            </div>
                            <button onClick={() => setIsBioModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            <div>
                                <label className="block text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    Your Bio / Headline
                                </label>
                                <textarea
                                    rows={5}
                                    value={bioInput}
                                    onChange={(e) => setBioInput(e.target.value)}
                                    placeholder="Write a short summary about yourself, your role, experience, or what you're working on..."
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none custom-scrollbar resize-none"
                                />
                            </div>
                            <p className="text-[11px] text-slate-400">
                                This will update your profile headline and the "About Me" section on your profile.
                            </p>
                        </div>

                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50 dark:bg-slate-800/50">
                            <button 
                                onClick={() => setIsBioModalOpen(false)} 
                                disabled={isSavingBio} 
                                className="px-5 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveBio} 
                                disabled={isSavingBio} 
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                                {isSavingBio ? (
                                    <>
                                        <span className="material-symbols-outlined text-[15px] animate-spin">refresh</span>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[15px]">check</span>
                                        <span>Save Bio</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Core Skills Modal */}
            {isSkillsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSkillsModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[20px]">psychology</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit Core Skills</h2>
                                    <p className="text-xs text-slate-500">Showcase your technical and domain expertise</p>
                                </div>
                            </div>
                            <button onClick={() => setIsSkillsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {/* Current Skills as Interactive Badges */}
                            <div>
                                <label className="block text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    Current Skills ({skillsList.length})
                                </label>
                                {skillsList.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic py-2">No skills added yet. Type below to add skills.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 max-h-48 overflow-y-auto custom-scrollbar">
                                        {skillsList.map((skill, idx) => (
                                            <span 
                                                key={idx} 
                                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-bold rounded-lg shadow-2xs group"
                                            >
                                                <span>{skill}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSkill(skill)}
                                                    className="w-4 h-4 rounded-full flex items-center justify-center text-indigo-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                                    title={`Remove ${skill}`}
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">close</span>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add Skill Input Form */}
                            <form onSubmit={handleAddSkill} className="flex gap-2">
                                <input
                                    type="text"
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    placeholder="Add skill (e.g. C#, React, Azure) - press Enter"
                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={!skillInput.trim()}
                                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    <span>Add</span>
                                </button>
                            </form>
                            <p className="text-[11px] text-slate-400">Tip: You can separate multiple skills with commas and add them together.</p>
                        </div>

                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50 dark:bg-slate-800/50">
                            <button 
                                onClick={() => setIsSkillsModalOpen(false)} 
                                disabled={isSavingSkills} 
                                className="px-5 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveSkills} 
                                disabled={isSavingSkills} 
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                                {isSavingSkills ? (
                                    <>
                                        <span className="material-symbols-outlined text-[15px] animate-spin">refresh</span>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[15px]">check</span>
                                        <span>Save Skills</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Interests Modal */}
            {isInterestsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInterestsModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[20px]">interests</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit Interests</h2>
                                    <p className="text-xs text-slate-500">Add personal topics, technologies, or hobbies you follow</p>
                                </div>
                            </div>
                            <button onClick={() => setIsInterestsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {/* Current Interests as Interactive Badges */}
                            <div>
                                <label className="block text-[12px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                    Current Interests ({interestsList.length})
                                </label>
                                {interestsList.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic py-2">No interests added yet. Type below to add interests.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 max-h-48 overflow-y-auto custom-scrollbar">
                                        {interestsList.map((interest, idx) => (
                                            <span 
                                                key={idx} 
                                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-pink-50 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60 text-xs font-bold rounded-lg shadow-2xs group"
                                            >
                                                <span>{interest}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveInterest(interest)}
                                                    className="w-4 h-4 rounded-full flex items-center justify-center text-pink-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                                    title={`Remove ${interest}`}
                                                >
                                                    <span className="material-symbols-outlined text-[13px]">close</span>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add Interest Input Form */}
                            <form onSubmit={handleAddInterest} className="flex gap-2">
                                <input
                                    type="text"
                                    value={interestInput}
                                    onChange={(e) => setInterestInput(e.target.value)}
                                    placeholder="Add interest (e.g. AI, UI/UX, Cloud) - press Enter"
                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={!interestInput.trim()}
                                    className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    <span>Add</span>
                                </button>
                            </form>
                            <p className="text-[11px] text-slate-400">Tip: You can separate multiple interests with commas and add them together.</p>
                        </div>

                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50 dark:bg-slate-800/50">
                            <button 
                                onClick={() => setIsInterestsModalOpen(false)} 
                                disabled={isSavingInterests} 
                                className="px-5 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveInterests} 
                                disabled={isSavingInterests} 
                                className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-pink-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                            >
                                {isSavingInterests ? (
                                    <>
                                        <span className="material-symbols-outlined text-[15px] animate-spin">refresh</span>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[15px]">check</span>
                                        <span>Save Interests</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Background Banner Customization Modal */}
            {isBannerModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsBannerModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Background Photo</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Customize your profile header banner</p>
                            </div>
                            <button 
                                onClick={() => setIsBannerModalOpen(false)} 
                                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                            {/* Current Banner Preview */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                                    Current Preview
                                </label>
                                <div className="h-36 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative shadow-inner">
                                    {bannerImage ? (
                                        bannerImage.startsWith('data:') || bannerImage.startsWith('http') ? (
                                            <img src={bannerImage} alt="Banner Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full" style={{ background: bannerImage }} />
                                        )
                                    ) : (
                                        <div 
                                            className="w-full h-full relative flex items-center justify-center"
                                            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 35%, #8b5cf6 70%, #a855f7 100%)' }}
                                        >
                                            <span className="text-white/90 font-bold text-sm">Default Trupeer Violet</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Direct File Upload Button */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                                    Upload Custom Image
                                </label>
                                <div className="flex items-center gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => bannerFileInputRef.current?.click()}
                                        className="flex-1 py-3 px-4 rounded-xl border-2 border-dashed border-blue-500/50 hover:border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
                                        Upload Photo from Device (JPG, PNG, WebP)
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1.5">Recommended dimensions: 1584 × 396 px (up to 10MB)</p>
                            </div>

                            {/* Preset Gradients Palette */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                                    Or Choose an Enterprise Preset
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {PRESET_BANNERS.map(preset => {
                                        const isSelected = bannerImage === preset.style;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => handleSelectPresetBanner(preset.style)}
                                                className={`group relative h-20 rounded-xl overflow-hidden border-2 transition-all text-left p-2.5 flex flex-col justify-end cursor-pointer shadow-xs ${
                                                    isSelected 
                                                        ? 'border-blue-600 ring-2 ring-blue-500/30 scale-[1.02]' 
                                                        : 'border-slate-200 dark:border-slate-700 hover:scale-[1.02]'
                                                }`}
                                                style={{ background: preset.style }}
                                            >
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-md">
                                                        <span className="material-symbols-outlined text-[14px] font-black">check</span>
                                                    </div>
                                                )}
                                                <span className="relative text-white font-bold text-xs drop-shadow-md leading-tight">
                                                    {preset.name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                            {bannerImage ? (
                                <button
                                    type="button"
                                    onClick={handleRemoveBanner}
                                    className="text-xs font-bold text-red-500 hover:text-red-600 hover:underline cursor-pointer flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                    Reset to Default
                                </button>
                            ) : <div />}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBannerModalOpen(false)}
                                    className="px-5 py-2 text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs"
                                >
                                    Done
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* LinkedIn-Style Contact Info Modal */}
            {isContactModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsContactModalOpen(false)}></div>
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                {displayUser?.fullName || displayUser?.name || 'User'}
                            </h2>
                            <button 
                                onClick={() => setIsContactModalOpen(false)} 
                                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Contact Information
                            </h3>

                            {/* Knome Profile Link */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-[20px]">link</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Your Knome Profile</p>
                                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate mt-0.5">
                                        {window.location.origin}/profile{displayUser?.id ? `?id=${displayUser.id}` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(`${window.location.origin}/profile${displayUser?.id ? `?id=${displayUser.id}` : ''}`);
                                        addToast('Profile link copied to clipboard!', 'success');
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                    title="Copy Link"
                                >
                                    <span className="material-symbols-outlined text-[18px]">content_copy</span>
                                </button>
                            </div>

                            {/* Email */}
                            {isEmailEnabled && (
                                <div className="flex items-start gap-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-[20px]">mail</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Official Email</p>
                                        <a 
                                            href={`mailto:${displayUser?.email || `${(displayUser?.fullName || displayUser?.name || 'employee').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`}`}
                                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline block mt-0.5"
                                        >
                                            {displayUser?.email || `${(displayUser?.fullName || displayUser?.name || 'employee').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Phone / Mobile */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-[20px]">phone</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Contact Number</p>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {displayUser?.mobileNo || displayUser?.phone || '+91 755 401 9400'}
                                    </p>
                                </div>
                            </div>

                            {/* Department & Location */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-[20px]">domain</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Department & Location</p>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {displayUser?.departmentName || displayUser?.department || 'General'}, {displayUser?.location || 'Bhopal, MP'}
                                    </p>
                                </div>
                            </div>

                            {/* Designation & Role */}
                            <div className="flex items-start gap-3.5">
                                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-[20px]">badge</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Designation & Role</p>
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                        {displayUser?.designation || 'Staff Member'} • {displayUser?.roleName || displayUser?.role || 'Employee'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/50">
                            <button
                                type="button"
                                onClick={() => setIsContactModalOpen(false)}
                                className="px-5 py-2 text-sm font-bold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {/* Connections & Direct Message Pop-up Modal */}
            {isConnectionsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
                        onClick={() => {
                            setIsConnectionsModalOpen(false);
                            setQuickMessageTarget(null);
                        }} 
                    />
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 overflow-hidden">
                        
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                                    <span className="material-symbols-outlined text-[22px]">diversity_3</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            Connections
                                        </h2>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                            {displayedConnectionsCount}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Connected colleagues with {displayUser?.fullName || displayUser?.name || 'this user'}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsConnectionsModalOpen(false);
                                    setQuickMessageTarget(null);
                                }} 
                                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                title="Close"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                    search
                                </span>
                                <input
                                    type="text"
                                    value={connectionSearchQuery}
                                    onChange={(e) => setConnectionSearchQuery(e.target.value)}
                                    placeholder="Search by name, role, or department..."
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                                {connectionSearchQuery && (
                                    <button 
                                        onClick={() => setConnectionSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Connections List */}
                        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                            {isConnectionsLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                                    <span className="material-symbols-outlined text-4xl animate-spin text-blue-500">progress_activity</span>
                                    <p className="text-xs font-semibold">Loading connections...</p>
                                </div>
                            ) : displayedConnectionsList.length === 0 ? (
                                <div className="py-12 text-center flex flex-col items-center justify-center">
                                    <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                                        <span className="material-symbols-outlined text-3xl">group_off</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                        {connectionSearchQuery ? 'No matching connections found' : 'No connections to display'}
                                    </p>
                                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                                        {connectionSearchQuery ? 'Try searching with a different name or title.' : 'Grow your network by connecting with colleagues on Knome.'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsConnectionsModalOpen(false);
                                            navigate('/network');
                                        }}
                                        className="mt-4 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                    >
                                        Discover Colleagues in Network
                                    </button>
                                </div>
                            ) : (
                                displayedConnectionsList.map(conn => {
                                    const connId = conn.id || conn.userId;
                                    const connName = conn.name || conn.fullName || 'Colleague';
                                    const connRole = conn.designation || conn.role || conn.roleName || 'Employee';
                                    const connDept = conn.department || conn.departmentName || 'MPOnline';
                                    const connAvatar = resolveImageUrl(conn.avatar || conn.profilePhotoUrl, connName);
                                    const isQuickActive = quickMessageTarget?.id === connId || quickMessageTarget?.userId === connId;

                                    return (
                                        <div 
                                            key={connId || connName}
                                            className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-200 dark:hover:border-blue-900/50 hover:shadow-xs transition-all space-y-3"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                {/* Left: Avatar + Details */}
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400">
                                                        {connAvatar ? (
                                                            <img 
                                                                src={connAvatar} 
                                                                alt={connName} 
                                                                className="w-full h-full object-cover" 
                                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                            />
                                                        ) : (
                                                            <span>{connName.charAt(0).toUpperCase()}</span>
                                                        )}
                                                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" title="Online" />
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsConnectionsModalOpen(false);
                                                                navigate(`/profile?id=${connId}`);
                                                            }}
                                                            className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block text-left cursor-pointer"
                                                        >
                                                            {connName}
                                                        </button>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                            {connRole} {connDept && connDept !== connRole ? `· ${connDept}` : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right: Message & Quick Message Actions */}
                                                {isMessagingEnabled && (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsConnectionsModalOpen(false);
                                                                navigate(`/messages?userId=${connId}&name=${encodeURIComponent(connName)}`);
                                                            }}
                                                            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-xs rounded-full transition-all shadow-xs flex items-center gap-1.5 cursor-pointer hover:shadow-md active:scale-95"
                                                            title={`Open chat with ${connName}`}
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                                                            <span>Message</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (isQuickActive) {
                                                                    setQuickMessageTarget(null);
                                                                } else {
                                                                    setQuickMessageTarget(conn);
                                                                    setQuickMessageText('');
                                                                }
                                                            }}
                                                            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                                                                isQuickActive 
                                                                    ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400' 
                                                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                            }`}
                                                            title="Quick message pop up"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">edit_note</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Expandable Quick Message Box */}
                                            {isQuickActive && (
                                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-150">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={quickMessageText}
                                                            onChange={(e) => setQuickMessageText(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                    e.preventDefault();
                                                                    handleSendQuickMessage(conn);
                                                                }
                                                            }}
                                                            placeholder={`Send quick message to ${connName}...`}
                                                            className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                            autoFocus
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={!quickMessageText.trim() || isSendingQuickMessage}
                                                            onClick={() => handleSendQuickMessage(conn)}
                                                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                                        >
                                                            {isSendingQuickMessage ? (
                                                                <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-[14px]">send</span>
                                                            )}
                                                            <span>Send</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Click <strong>Message</strong> to start real-time conversation
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsConnectionsModalOpen(false);
                                    setQuickMessageTarget(null);
                                }}
                                className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </main>
    );
}
