import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser, resolveEmployeeName, deduplicateMembers, KNOWN_ROSTER_NAMES, INITIAL_USERS } from '../components/contexts/UserContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { apiClient } from '../utils/apiClient';
import { communitiesApi, mediaApi, postsApi, notificationsApi, interactionsApi, adminApi, resolveMediaUrl, getVideoThumbnail, getCommunityImages, formatRelativeTime, resolveSharedTarget } from '../utils/apiService';
import { checkRestrictedContent } from '../utils/restrictedWords';
import ArticleShareModal from '../components/modals/ArticleShareModal';
import SuspendUserModal from '../components/modals/SuspendUserModal';
import { ImageGrid, ImageLightbox } from '../components/widgets/PostCard';
import useScrollLoading from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';
import { useSystemConfig } from '../utils/systemConfig';

const ENTERPRISE_CHANNELS_SEED = {
    '1': {
        name: 'Engineering & Tech',
        type: 'Public',
        category: 'Technology & Architecture',
        adminContact: 'Loveneesh Sharma (Lead Admin)',
        description: 'Core engineering discussions, architecture standards, technical roadmaps, and code design patterns for MPOnline software systems.',
        rules: ['1. Keep discussions technical and constructive.', '2. Follow code review & architecture guidelines.', '3. Respect all engineers and peers.'],
        faq: [
            { q: 'Who can participate?', a: 'All developers, architects, and technical staff across MPOnline.' },
            { q: 'Can I share code snippets?', a: 'Yes, formatted code and architecture diagrams are highly encouraged.' }
        ]
    },
    '2': {
        name: 'HR & People Ops',
        type: 'Org',
        category: 'Human Resources & Governance',
        adminContact: 'Sourabh Sahu (HR Lead)',
        description: 'Official human resources updates, employee engagement, workplace policies, internal training, and talent development programs.',
        rules: ['1. Follow official HR communications protocol.', '2. Confidential employee queries should be routed via HR portal.', '3. Maintain constructive, professional dialogue.'],
        faq: [
            { q: 'Who is a member?', a: 'All MPOnline employees are auto-enrolled in HR & People Ops.' },
            { q: 'Where are policy documents stored?', a: 'Check the Files & Media tab for official policy handbooks.' }
        ]
    },
    '3': {
        name: 'Product Design & UX',
        type: 'Public',
        category: 'UI/UX & Design Systems',
        adminContact: 'Mayur Verma (Design Lead)',
        description: 'Design system specifications, user research findings, interactive prototypes, and UI/UX design reviews across enterprise portals.',
        rules: ['1. Share constructive design critique.', '2. Adhere to the Knome & MPOnline design system tokens.', '3. Credit design resources appropriately.'],
        faq: [
            { q: 'Can non-designers join?', a: 'Yes! Product managers, frontend engineers, and stakeholders are welcome.' }
        ]
    },
    '4': {
        name: 'AI & Data Science Lab',
        type: 'Private',
        category: 'AI Research & Data Science',
        adminContact: 'Vishendra Sharma (AI Lead)',
        description: 'Exploration of machine learning, NLP, computer vision models, agentic workflows, and predictive analytics for public services.',
        rules: ['1. Respect data privacy and security benchmarks.', '2. No production customer PII in experiment posts.', '3. Share reproducible notebook links.'],
        faq: [
            { q: 'How do I request access?', a: 'Click Request to Join; the community admin will review your request.' }
        ]
    },
    '5': {
        name: 'Finance & Accounting',
        type: 'Org',
        category: 'Finance, Audit & Payroll',
        adminContact: 'Sourabh Sahu (Finance Admin)',
        description: 'Finance announcements, reimbursement policies, payroll schedules, and compliance audit notices for MPOnline teams.',
        rules: ['1. Official financial guidelines only.', '2. For personal payroll disputes, contact Finance directly.', '3. Comply with government audit standards.'],
        faq: [
            { q: 'When are payroll guidelines posted?', a: 'Monthly before each payment cycle.' }
        ]
    },
    '6': {
        name: 'Marketing & Brand Strategy',
        type: 'Public',
        category: 'Marketing, PR & Events',
        adminContact: 'Meghna Tiwari (Brand Lead)',
        description: 'Brand identity assets, public relations updates, social campaigns, event coverage, and outreach roadmaps.',
        rules: ['1. Align with MPOnline corporate branding guidelines.', '2. Coordinate external PR with the communications cell.'],
        faq: [
            { q: 'Where are brand logos and guidelines?', a: 'Check the Files & Media tab.' }
        ]
    },
    '7': {
        name: 'CTO Leadership Circle',
        type: 'Private',
        category: 'Executive Leadership & Strategy',
        adminContact: 'Loveneesh Sharma (Lead Admin)',
        description: 'Strategic technology direction, executive briefings, technology modernization, and enterprise architecture decisions.',
        rules: ['1. Executive confidentiality applies.', '2. Strategic alignment only.'],
        faq: [
            { q: 'Who is eligible?', a: 'Department heads, team leads, and executive architects.' }
        ]
    },
    '8': {
        name: 'General Discussion',
        type: 'Public',
        category: 'Company Open Lounge',
        adminContact: 'System Admin',
        description: 'The open lounge for cross-department networking, achievements, celebrations, and general office chatter.',
        rules: ['1. Keep it friendly, positive, and inclusive.', '2. Avoid unverified rumors.'],
        faq: [
            { q: 'What can I post here?', a: 'Team shoutouts, hackathons, book recommendations, celebrations, and informal discussions.' }
        ]
    }
};

/**
 * Resolves a member object to clean, standardized, non-clipping display tokens.
 * Handles employee ID resolution (e.g. EMP004 -> Neha Gupta), title-casing,
 * full designations (e.g. software -> Software Developer), and official department names.
 */
const normalizeMemberData = (m, contextUsers = []) => {
    if (!m) return m;
    const empId = String(m.employeeId || m.empId || '').trim();
    const rawName = String(m.fullName || m.name || '').trim();

    // Match against live contextUsers or INITIAL_USERS roster
    const matched = (contextUsers || []).find(u => 
        (empId && String(u.employeeId || '').toUpperCase() === empId.toUpperCase()) ||
        (m.userId && String(u.id || u.userId) === String(m.userId)) ||
        (m.id && String(u.id || u.userId) === String(m.id)) ||
        (rawName && String(u.name || u.fullName || '').toLowerCase() === rawName.toLowerCase())
    ) || (INITIAL_USERS || []).find(u => 
        (empId && String(u.employeeId || '').toUpperCase() === empId.toUpperCase()) ||
        (m.userId && String(u.id || u.userId) === String(m.userId)) ||
        (m.id && String(u.id || u.userId) === String(m.id)) ||
        (rawName && String(u.name || u.fullName || '').toLowerCase() === rawName.toLowerCase())
    );

    let resolvedName = resolveEmployeeName(rawName, empId || matched?.employeeId);
    if ((!resolvedName || resolvedName === 'Employee' || /^(EMP|MPO|MP)\d+$/i.test(resolvedName)) && (matched?.fullName || matched?.name)) {
        resolvedName = matched.fullName || matched.name;
    }

    // Capitalize each word properly (e.g., 'kabir singh' -> 'Kabir Singh', 'aishwary' -> 'Aishwary')
    resolvedName = (resolvedName || 'Employee')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const resolvedEmpId = empId || matched?.employeeId || (m.userId ? `MPO${String(m.userId).padStart(3, '0')}` : '');

    let candidateDesig = String(m.designation || '').trim();
    const genericDesigs = ['employee', 'member', 'user'];
    if ((!candidateDesig || genericDesigs.includes(candidateDesig.toLowerCase())) && matched?.designation && !genericDesigs.includes(matched.designation.toLowerCase())) {
        candidateDesig = matched.designation;
    }
    let rawDesig = (candidateDesig || matched?.designation || 'Software Developer').trim();
    if (rawDesig.toLowerCase() === 'software') rawDesig = 'Software Developer';
    else if (rawDesig.toLowerCase() === 'hr') rawDesig = 'HR Specialist';
    const resolvedDesig = rawDesig
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const resolvedDept = String(m.department || matched?.department || 'MPOnline').trim();

    const isCommAdmin = m.memberType === 'Admin' || 
                        m.memberType === 'Moderator' || 
                        m.memberType === 'Community Administrator' || 
                        m.memberType === 'Community Admin';

    const roleName = isCommAdmin ? 'Admin' : 'Member';

    const avatar = resolveMediaUrl(m.profilePhotoUrl || matched?.avatar) || 
        `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName)}&background=6366f1&color=fff`;

    return {
        ...m,
        displayName: resolvedName,
        displayEmpId: resolvedEmpId,
        displayDesignation: resolvedDesig,
        displayDepartment: resolvedDept,
        isCommAdmin,
        roleName,
        resolvedAvatar: avatar
    };
};

export default function CommunityView() {
    const { isMessagingEnabled } = useSystemConfig();
    const { currentUser, users: contextUsers, awardRuleKarma, refreshKarma } = useUser();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const location = useLocation();

    // Read community details from URL query or state
    const queryParams = new URLSearchParams(location.search);
    const communityId = queryParams.get('id');

    // Award +5 Karma Points for active community participation (Once per community per day)
    useEffect(() => {
        if (currentUser && awardRuleKarma && communityId) {
            const userId = currentUser.userId || currentUser.id;
            awardRuleKarma(userId, 'COMMUNITY_PARTICIPATION', { communityId: communityId });
        }
    }, [communityId, currentUser, awardRuleKarma]);

    const [community, setCommunity] = useState(null);
    const [activeTab, setActiveTab] = useState('feed'); // 'feed', 'members', 'admin'
    const [membershipStatus, setMembershipStatus] = useState('none');
    const [postText, setPostText] = useState('');
    const [posts, setPosts] = useState([]);
    // Real-time Like, Comment & Share States for Community Feed Posts
    const [likedPostsMap, setLikedPostsMap] = useState(() => {
        try {
            const key = `knome_community_likes_${currentUser?.id || 'guest'}`;
            return JSON.parse(localStorage.getItem(key) || '{}');
        } catch { return {}; }
    });
    const [activeCommentPostId, setActiveCommentPostId] = useState(null);
    const [communityCommentsMap, setCommunityCommentsMap] = useState({});
    const [commentInputMap, setCommentInputMap] = useState({});
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [sharingPost, setSharingPost] = useState(null);
    const [isPostShareModalOpen, setIsPostShareModalOpen] = useState(false);
    const [lightboxImages, setLightboxImages] = useState(null);
    const [lightboxStartIndex, setLightboxStartIndex] = useState(0);
    const [joinRequests, setJoinRequests] = useState([]);
    const [membersList, setMembersList] = useState([]);
    const [subscribersList, setSubscribersList] = useState([]);
    const [suspendedMembers, setSuspendedMembers] = useState([]);
    const [communitySuspensionInfo, setCommunitySuspensionInfo] = useState(null);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null); // { message, type }

    // Admin Approval & Add Members State
    const [isApprovingCommunity, setIsApprovingCommunity] = useState(false);
    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
    const [addMemberSearch, setAddMemberSearch] = useState('');
    const [selectedUserIdsToAdd, setSelectedUserIdsToAdd] = useState([]);
    const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('Member');
    const [isSavingMembers, setIsSavingMembers] = useState(false);
    const [allOrgUsers, setAllOrgUsers] = useState([]);
    const [isLoadingOrgUsers, setIsLoadingOrgUsers] = useState(false);

    // Admin Protection & Member Management Modals
    const [adminProtectionWarning, setAdminProtectionWarning] = useState(null); // { title, message }
    const [suspendModalMember, setSuspendModalMember] = useState(null);
    const [suspendDuration, setSuspendDuration] = useState('7d');
    const [suspendCustomDate, setSuspendCustomDate] = useState('');
    const [suspendReasonCategory, setSuspendReasonCategory] = useState('Violation of community guidelines');
    const [suspendReasonNote, setSuspendReasonNote] = useState('');
    const [removeModalMember, setRemoveModalMember] = useState(null);

    // Rules & FAQ Management State
    const [editRules, setEditRules] = useState([]);
    const [editFaq, setEditFaq] = useState([]);
    const [newRuleInput, setNewRuleInput] = useState('');
    const [newFaqQ, setNewFaqQ] = useState('');
    const [newFaqA, setNewFaqA] = useState('');
    const [isSavingRulesFaq, setIsSavingRulesFaq] = useState(false);

    // Community Category & Metadata Settings State
    const [selectedCategory, setSelectedCategory] = useState('Technology');
    const [isSavingCategory, setIsSavingCategory] = useState(false);
    const [availableCategories, setAvailableCategories] = useState([
        { id: 8, name: 'Design' },
        { id: 7, name: 'Engineering' },
        { id: 1019, name: 'Finance' },
        { id: 1014, name: 'General' },
        { id: 1016, name: 'Product & Design' },
        { id: 1, name: 'Technology' }
    ]);

    useEffect(() => {
        const excludedCategories = new Set([
            'company culture',
            'culture & hr',
            'culture & hr hub',
            'culture',
            'hobbies',
            'leadership',
            'marketing',
            'operations',
            'product management'
        ]);
        communitiesApi.getCategories()
            .then(res => {
                const list = res?.data !== undefined ? res.data : res;
                if (Array.isArray(list) && list.length > 0) {
                    const filtered = list.filter(c => !excludedCategories.has((c.name || '').toLowerCase().trim()));
                    setAvailableCategories(filtered);
                }
            })
            .catch(() => {});
    }, []);

    // Files & Media State
    const [filesList, setFilesList] = useState([]);
    const [fileCategoryFilter, setFileCategoryFilter] = useState('All');
    const [fileSearchQuery, setFileSearchQuery] = useState('');
    const [fileViewMode, setFileViewMode] = useState('table'); // 'table' | 'grid'
    const [fileSortBy, setFileSortBy] = useState('newest'); // 'newest' | 'oldest' | 'name' | 'size'
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedUploadFile, setSelectedUploadFile] = useState(null);
    const [uploadFileName, setUploadFileName] = useState('');
    const [uploadFileCategory, setUploadFileCategory] = useState('Document');
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const [previewModalFile, setPreviewModalFile] = useState(null);
    const [activePdfBlobUrl, setActivePdfBlobUrl] = useState(null);
    const [activeFilePreviewUrl, setActiveFilePreviewUrl] = useState(null);
    const [previewZoom, setPreviewZoom] = useState(1);
    const [previewTab, setPreviewTab] = useState('viewer'); // 'viewer' | 'summary'
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareTab, setShareTab] = useState('menu'); // 'menu', 'community', 'users'
    const [shareTargetCommunity, setShareTargetCommunity] = useState('');
    const [shareSelectedUsers, setShareSelectedUsers] = useState([]);
    const [shareMessageNote, setShareMessageNote] = useState('');
    const [shareUserSearchQuery, setShareUserSearchQuery] = useState('');
    const [isSharingProcess, setIsSharingProcess] = useState(false);
    const [allCommunities, setAllCommunities] = useState([]);

    // Helper to identify true image attachments (case-insensitive & robust)
    const isImageAttachment = (a) => {
        if (!a) return false;
        const u = (a.url || a.fileUrl || a.backendUrl || (typeof a === 'string' ? a : '')).split('?')[0].toLowerCase();
        const t = (a.type || a.fileType || a.attachmentType || '').toLowerCase();
        if (u.match(/\.(mp4|webm|ogg|mov|mkv|avi|mp3|wav|aac|m4a|flac|pdf|doc|docx|txt|xls|xlsx|ppt|pptx|csv)$/i)) {
            return false;
        }
        if (t === 'image' || t === 'img' || t === 'photo') return true;
        return Boolean(u.match(/\.(jpeg|jpg|png|gif|webp|svg|bmp|ico)$/i)) || u.startsWith('data:image/');
    };

    // Helper to normalize attachments from all backend DTO shapes & local storage formats
    const normalizePostAttachments = (p) => {
        if (!p) return { attachments: [], images: [], attachmentUrls: [] };

        const rawList = [];
        if (Array.isArray(p.attachments) && p.attachments.length > 0) {
            rawList.push(...p.attachments);
        }
        if (Array.isArray(p.postAttachments) && p.postAttachments.length > 0) {
            rawList.push(...p.postAttachments);
        }
        if (Array.isArray(p.attachmentUrls) && p.attachmentUrls.length > 0) {
            p.attachmentUrls.forEach((u, i) => {
                if (u && !rawList.some(r => (r.url === u || r.fileUrl === u || r === u))) {
                    rawList.push({ id: `att_url_${i}`, url: u, fileUrl: u, type: 'image' });
                }
            });
        }
        if (Array.isArray(p.mediaUrls) && p.mediaUrls.length > 0) {
            p.mediaUrls.forEach((u, i) => {
                if (u && !rawList.some(r => (r.url === u || r.fileUrl === u || r === u))) {
                    rawList.push({ id: `media_url_${i}`, url: u, fileUrl: u, type: 'image' });
                }
            });
        }
        if (Array.isArray(p.images) && p.images.length > 0) {
            p.images.forEach((img, i) => {
                const u = img?.url || img?.fileUrl || (typeof img === 'string' ? img : '');
                if (u && !rawList.some(r => (r.url === u || r.fileUrl === u || r === u))) {
                    rawList.push(typeof img === 'object' ? img : { id: `img_${i}`, url: u, fileUrl: u, type: 'image' });
                }
            });
        }
        if (p.attachmentUrl && !rawList.some(r => (r.url === p.attachmentUrl || r.fileUrl === p.attachmentUrl || r === p.attachmentUrl))) {
            rawList.push({ id: 'att_url_single', url: p.attachmentUrl, fileUrl: p.attachmentUrl, type: 'image' });
        }
        if (p.imageUrl && !rawList.some(r => (r.url === p.imageUrl || r.fileUrl === p.imageUrl || r === p.imageUrl))) {
            rawList.push({ id: 'img_url_single', url: p.imageUrl, fileUrl: p.imageUrl, type: 'image' });
        }
        if (p.image && typeof p.image === 'string' && !rawList.some(r => (r.url === p.image || r.fileUrl === p.image || r === p.image))) {
            rawList.push({ id: 'image_single', url: p.image, fileUrl: p.image, type: 'image' });
        }

        const normalized = rawList.map((a, idx) => {
            const rawUrl = a.url || a.fileUrl || a.backendUrl || (typeof a === 'string' ? a : '');
            const isImg = isImageAttachment(a) || isImageAttachment(rawUrl);
            const rawType = (a.type || a.fileType || a.attachmentType || '').toLowerCase();
            return {
                id: a.id || a.attachmentId || idx + 1,
                url: rawUrl,
                fileUrl: rawUrl,
                type: isImg ? 'image' : (rawType || 'doc'),
                attachmentType: isImg ? 'image' : (rawType || 'doc'),
                name: a.name || rawUrl?.split('/').pop()?.split('?')[0] || 'attachment'
            };
        }).filter(a => a.url && typeof a.url === 'string' && a.url.trim().length > 0);

        const imageAttachments = normalized.filter(isImageAttachment);
        const attachmentUrls = normalized.map(a => a.url);

        return {
            attachments: normalized,
            images: imageAttachments,
            attachmentUrls: attachmentUrls
        };
    };

    const getPdfBlobUrl = (urlOrBase64) => {
        if (!urlOrBase64 || urlOrBase64 === '#') {
            urlOrBase64 = SAMPLE_PDF_DATA_URL;
        }
        if (typeof urlOrBase64 === 'string' && urlOrBase64.startsWith('data:application/pdf;base64,')) {
            try {
                const base64Data = urlOrBase64.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                return URL.createObjectURL(blob);
            } catch (err) {
                console.warn('Failed to parse Base64 PDF to blob URL:', err);
            }
        }
        return urlOrBase64;
    };


    // Real-time live count updates (Reactions, Comments, Shares)
    useEffect(() => {
        const handleReactionUpdated = (e) => {
            const data = e.detail;
            if (data && data.contentId) {
                setPosts(prev => prev.map(p => {
                    if (String(p.id) === String(data.contentId) || String(p.postId) === String(data.contentId)) {
                        const likes = typeof data.totalLikes === 'number' ? data.totalLikes : (p.likes || 0);
                        return { ...p, likes, likesCount: likes };
                    }
                    return p;
                }));
            }
        };

        const handleCommentUpdated = (e) => {
            const data = e.detail;
            if (data && data.contentId) {
                setPosts(prev => prev.map(p => {
                    if (String(p.id) === String(data.contentId) || String(p.postId) === String(data.contentId)) {
                        const comments = typeof data.commentsCount === 'number' ? data.commentsCount : (p.comments || 0);
                        return { ...p, comments, commentsCount: comments };
                    }
                    return p;
                }));
            }
        };

        const handleShareUpdated = (e) => {
            const data = e.detail;
            if (data && data.contentId) {
                setPosts(prev => prev.map(p => {
                    if (String(p.id) === String(data.contentId) || String(p.postId) === String(data.contentId)) {
                        const shares = typeof data.sharesCount === 'number' ? data.sharesCount : (p.shares || 0);
                        return { ...p, shares, sharesCount: shares };
                    }
                    return p;
                }));
            }
        };

        window.addEventListener('knome:reaction-updated', handleReactionUpdated);
        window.addEventListener('knome:comment-updated', handleCommentUpdated);
        window.addEventListener('knome:share-updated', handleShareUpdated);

        return () => {
            window.removeEventListener('knome:reaction-updated', handleReactionUpdated);
            window.removeEventListener('knome:comment-updated', handleCommentUpdated);
            window.removeEventListener('knome:share-updated', handleShareUpdated);
        };
    }, []);

    // Sync rules and FAQs into edit state whenever community loads
    useEffect(() => {
        if (community?.rules && Array.isArray(community.rules)) {
            setEditRules(community.rules);
        }
        if (community?.faq && Array.isArray(community.faq)) {
            setEditFaq(community.faq);
        }
    }, [community?.rules, community?.faq]);

    // Load all available communities for share dropdown
    const loadAllCommunities = async () => {
        try {
            const seedCommunities = [
                { id: '1', name: 'Tech Innovation Hub', emoji: '🚀' },
                { id: '2', name: 'DevOps & AI Innovation Hub', emoji: '💻' },
                { id: '3', name: 'Frontend Developers Guild', emoji: '⚛️' },
                { id: '4', name: 'Database Architects', emoji: '🗄️' },
                { id: '5', name: 'HR & General Announcements', emoji: '📢' },
                { id: '6', name: 'Culture & HR Hub', emoji: '🌟' },
            ];
            // Merge with any user-created communities from localStorage
            const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            const customMapped = customList.map(c => ({
                id: String(c.id),
                name: c.name,
                emoji: c.emoji || '🏘️'
            }));
            // Try to also load from API
            try {
                const apiRes = await communitiesApi.getAll();
                const apiData = apiRes?.data || apiRes || [];
                const apiComms = (Array.isArray(apiData) ? apiData : []).map(c => ({
                    id: String(c.communityId || c.id),
                    name: c.communityName || c.name,
                    emoji: '🏘️'
                }));
                const merged = [...apiComms];
                [...seedCommunities, ...customMapped].forEach(s => {
                    if (!merged.some(a => a.id === s.id)) merged.push(s);
                });
                setAllCommunities(merged.filter(c => String(c.id) !== String(communityId)));
                return;
            } catch (_) { /* ignore API error, fall back to local */ }

            const merged = [...seedCommunities, ...customMapped];
            const deduped = Array.from(new Map(merged.map(c => [c.id, c])).values());
            setAllCommunities(deduped.filter(c => String(c.id) !== String(communityId)));
        } catch (err) {
            console.error('Failed to load communities for share:', err);
        }
    };

    // Open Share Modal
    const handleShareCommunity = () => {
        setShareTab('menu');
        setShareTargetCommunity('');
        setShareSelectedUsers([]);
        setShareMessageNote('');
        setShareUserSearchQuery('');
        loadAllCommunities();
        setIsShareModalOpen(true);
    };

    // Handler 1: Share to Community Feed
    const handleShareToCommunitySubmit = async (e) => {
        if (e) e.preventDefault();
        if (!shareTargetCommunity) {
            showToast('Please select a target community.', 'error');
            return;
        }
        setIsSharingProcess(true);
        try {
            const targetCommId = shareTargetCommunity;
            const targetCommIdNum = parseInt(targetCommId);
            const savedPostsKey = `knome_community_posts_${targetCommId}`;
            const existingTargetPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');
            
            // Find target community name for better UX
            const targetComm = allCommunities.find(c => String(c.id) === String(targetCommId));
            const targetCommName = targetComm?.name || `Community #${targetCommId}`;
            const originUrl = `${window.location.origin}/community/view?id=${communityId || 101}`;

            // 1. Record backend share interaction
            try {
                await interactionsApi.shareContent('Community', communityId || 101, 'Community', targetCommIdNum);
            } catch (_) {}

            // 2. Persist post to SQL Server database
            try {
                await postsApi.create({
                    contentText: `Shared Community: "${community?.name}"\n${originUrl}`,
                    audienceType: 'Community',
                    audienceCommunityIds: [targetCommIdNum]
                });
            } catch (err) {
                console.warn('Backend post creation notice:', err);
            }

            const crosspost = {
                id: `share_comm_${Date.now()}`,
                type: 'community_share',
                author: currentUser?.name || currentUser?.fullName || 'Employee',
                authorName: currentUser?.name || currentUser?.fullName || 'Employee',
                authorRole: currentUser?.roleName || 'Member',
                authorAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                time: 'Just now',
                timeAgo: 'Just now',
                sharedAt: new Date().toISOString(),
                publishedDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                title: `Community Recommendation: ${community?.name}`,
                content: shareMessageNote ? `${shareMessageNote}\n\nShared Community: "${community?.name}"\n${originUrl}` : `Check out the "${community?.name}" community!\n${originUrl}`,
                // Shared community metadata for the preview card
                sharedCommunity: {
                    id: communityId || 101,
                    name: community?.name,
                    description: community?.description,
                    banner: community?.banner,
                    thumbnail: community?.thumbnail,
                    membersCount: community?.membersCount || membersList.length,
                    category: community?.category || 'Technology',
                    type: community?.type || 'Public',
                    url: originUrl
                },
                communityId: targetCommIdNum,
                communityName: targetCommName,
                likes: 0,
                comments: 0,
                shares: 0,
                isPinned: false
            };

            // Save to target community feed
            localStorage.setItem(savedPostsKey, JSON.stringify([crosspost, ...existingTargetPosts]));
            
            // Also add to global posts cache
            try {
                const globalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                localStorage.setItem('knome_local_posts', JSON.stringify([crosspost, ...globalPosts]));
            } catch (_) {}

            // Dispatch storage and custom events for instant feed update across views
            window.dispatchEvent(new StorageEvent('storage', { key: savedPostsKey }));
            window.dispatchEvent(new CustomEvent('community-posts-updated', { detail: { communityId: targetCommId, post: crosspost } }));
            window.dispatchEvent(new CustomEvent('community-post-created', { detail: { communityId: targetCommId, post: crosspost } }));
            window.dispatchEvent(new CustomEvent('post-created'));

            setIsSharingProcess(false);
            setIsShareModalOpen(false);
            setShareTab('menu');
            setShareMessageNote('');
            showToast(`✅ Successfully shared "${community?.name}" to ${targetCommName}'s feed!`, 'success');
        } catch (err) {
            console.error('Failed to share to community:', err);
            setIsSharingProcess(false);
            showToast('Failed to share to community feed.', 'error');
        }
    };

    // Handler 2: Share with Users (Send Notification)
    const handleShareToUsersSubmit = async (e) => {
        if (e) e.preventDefault();
        if (shareSelectedUsers.length === 0) {
            showToast('Please select at least one team member.', 'error');
            return;
        }
        setIsSharingProcess(true);
        try {
            const targetCommId = community?.id || communityId || 101;
            const targetCommName = community?.name || 'Community';
            const targetLink = `/community/view?id=${targetCommId}`;
            const notifMsg = `📢 ${currentUser?.name || currentUser?.fullName || 'A team member'} shared community "${targetCommName}" with you: "${shareMessageNote || 'Check out this community!'}"`;

            // 1. Backend interactions and notifications
            await Promise.all(shareSelectedUsers.map(async (uId) => {
                try {
                    await interactionsApi.shareContent('Community', targetCommId, 'User', uId);
                } catch (_) {}
                try {
                    await notificationsApi.create({
                        recipientUserId: uId,
                        notificationType: 'Share',
                        message: notifMsg,
                        relatedContentType: 'Community',
                        referenceId: targetCommId
                    });
                } catch (_) {}
            }));

            // 2. Build local notifications for immediate bell/dropdown update with recipient isolation
            const savedNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const newNotifs = shareSelectedUsers.map(uId => {
                const uObj = (contextUsers || []).find(u => String(u.id || u.userId) === String(uId));
                return {
                    id: `notif_comm_share_${Date.now()}_${uId}_${Math.random().toString(36).slice(2, 6)}`,
                    targetUserId: uId,
                    targetEmployeeId: uObj?.employeeId,
                    recipientUserId: uId,
                    employeeId: uObj?.employeeId,
                    type: 'community_shared',
                    category: 'Community',
                    communityId: targetCommId,
                    communityName: targetCommName,
                    actionLink: targetLink,
                    linkUrl: targetLink,
                    targetUrl: targetLink,
                    text: notifMsg,
                    message: notifMsg,
                    senderName: currentUser?.name || currentUser?.fullName || 'Team Member',
                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    unread: true,
                    icon: 'groups',
                    color: 'text-indigo-400',
                    bg: 'bg-indigo-500/10'
                };
            });

            localStorage.setItem('knome_notifications', JSON.stringify([...newNotifs, ...savedNotifs]));
            
            // 3. Dispatch notification events
            window.dispatchEvent(new StorageEvent('storage', { key: 'knome_notifications' }));
            window.dispatchEvent(new CustomEvent('notification-updated'));
            window.dispatchEvent(new CustomEvent('knome_new_notification'));
            newNotifs.forEach(n => {
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: n }));
            });

            setIsSharingProcess(false);
            setIsShareModalOpen(false);
            setShareTab('menu');
            setShareSelectedUsers([]);
            setShareUserSearchQuery('');
            setShareMessageNote('');
            showToast(`✅ Notification sent to ${newNotifs.length} selected team member(s)!`, 'success');
        } catch (err) {
            console.error('Failed to share with users:', err);
            setIsSharingProcess(false);
            showToast('Failed to send notification to users.', 'error');
        }
    };

    const SAMPLE_PDF_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwKICAvVHlwZSAvUGFnZQogIC9QYXJlbnQgMiAwIFIKICAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQogIC9Db250ZW50cyA0IDAgUgogIC9SZXNvdXJjZXMgPDwKICAgIC9Gb250IDw8CiAgICAgIC9GMSA8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EtQm9sZCA+PgogICAgICAvRjIgPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CiAgICA+PgogID4+Cj4+CmVuZG9iago0IDAgb2JqCjw8IC9MZW5ndGggNjkyID4+CnN0cmVhbQpCVAovRjEgMjAgVGYKNTAgNzIwIFRkCihNUE9ubGluZSBMaW1pdGVkIC0gS25vbWUgRW50ZXJwcmlzZSkgVGoKMCAtMzAgVGQKL0YxIDE1IFRmCihTeXN0ZW0gQXJjaGl0ZWN0dXJlICYgSW50ZWdyYXRpb24gT3ZlcnZpZXcpIFRqCjAgLTQwIFRkCi9GMiAxMiBUZgooRG9jdW1lbnQ6IFN5c3RlbV9BcmNoaXRlY3R1cmVfT3ZlcnZpZXcucGRmKSBUagowIC0yMiBUZAooU3RhdHVzOiBBcHByb3ZlZCAmIFZlcmlmaWVkKSBUagowIC0yMiBUZAooQ2xhc3NpZmljYXRpb246IEludGVybmFsIEVudGVycHJpc2UgRG9jdW1lbnRhdGlvbikgVGoKMCAtNDAgVGQKL0YxIDEzIFRmCigxLiBBcmNoaXRlY3R1cmUgU3VtbWFyeSkgVGoKMCAtMjAgVGQKL0YyIDExIFRmCihLbm9tZSBpcyB0aGUgdW5pZmllZCBpbnRlcm5hbCBrbm93bGVkZ2UgYW5kIGNvbGxhYm9yYXRpb24gcGxhdGZvcm0gZm9yIE1QT25saW5lLikgVGoKMCAtMjAgVGQKKEJ1aWx0IHdpdGggQVNQLk5FVCBDb3JlIDEwLCBTUUwgU2VydmVyLCBhbmQgbW9kZXJuIFJlYWN0IHdpdGggVml0ZS4pIFRqCjAgLTM1IFRkCi9GMSAxMyBUZgooMi4gU2VjdXJpdHkgJiBDb21wbGlhbmNlKSBUagowIC0yMiBUZAovRjIgMTEgVGYKKEFsbCBkb2N1bWVudHMgYW5kIG1lZGlhIGZpbGVzIGFyZSBnb3Zlcm5lZCBpbiBjb21wbGlhbmNlIHdpdGggRFBEUCBzdGFuZGFyZHMuKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiANCjAwMDAwMDAwMDkgMDAwMDAgbiANCjAwMDAwMDAwNTggMDAwMDAgbiANCjAwMDAwMDAxMTUgMDAwMDAgbiANCjAwMDAwMDAzODYgMDAwMDAgbiANCnRyYWlsZXIKPDwKICAvU2l6ZSA1CiAgL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjExMjkKJSVFT0YK';

    const readFileAsDataUrl = (file) => {
        return new Promise((resolve) => {
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    };

    const safeSetStorage = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            console.warn(`LocalStorage quota reached for key: ${key}. Cleaning up and sanitizing payload...`, err);
            try {
                // Free up space by removing non-essential notifications
                localStorage.removeItem('knome_notifications');

                if (Array.isArray(value)) {
                    // Sanitize heavy Base64 URLs to prevent quota crashes
                    const sanitized = value.map(item => {
                        if (item && item.url && typeof item.url === 'string' && item.url.length > 50000 && item.url.startsWith('data:')) {
                            return {
                                ...item,
                                url: item.extension === 'pdf'
                                    ? SAMPLE_PDF_DATA_URL
                                    : 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600&h=400'
                            };
                        }
                        return item;
                    });
                    localStorage.setItem(key, JSON.stringify(sanitized.slice(0, 20)));
                } else {
                    localStorage.setItem(key, JSON.stringify(value));
                }
            } catch (fallbackErr) {
                console.error('LocalStorage safe save fallback failed:', fallbackErr);
            }
        }
    };

    // IndexedDB helper for storing large user uploaded files cleanly without LocalStorage limits
    const saveFileBlobToIndexedDb = (fileId, fileDataUrl) => {
        return new Promise((resolve) => {
            if (!fileId || !fileDataUrl) return resolve(false);
            try {
                const request = indexedDB.open('KnomeCommunityFilesDB', 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files');
                    }
                };
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('files', 'readwrite');
                    tx.objectStore('files').put(fileDataUrl, String(fileId));
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                };
                request.onerror = () => resolve(false);
            } catch (err) {
                console.warn('IndexedDB file save warning:', err);
                resolve(false);
            }
        });
    };

    const getFileBlobFromIndexedDb = (fileId) => {
        return new Promise((resolve) => {
            if (!fileId) return resolve(null);
            try {
                const request = indexedDB.open('KnomeCommunityFilesDB', 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files');
                    }
                };
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('files', 'readonly');
                    const getReq = tx.objectStore('files').get(String(fileId));
                    getReq.onsuccess = () => resolve(getReq.result || null);
                    getReq.onerror = () => resolve(null);
                };
                request.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    };

    const deleteFileBlobFromIndexedDb = (fileId) => {
        return new Promise((resolve) => {
            if (!fileId) return resolve(false);
            try {
                const request = indexedDB.open('KnomeCommunityFilesDB', 1);
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files')) return resolve(false);
                    const tx = db.transaction('files', 'readwrite');
                    tx.objectStore('files').delete(String(fileId));
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                };
                request.onerror = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    };

    useEffect(() => {
        let isMounted = true;
        let createdBlobUrl = null;

        if (previewModalFile) {
            setPreviewZoom(1);
            setPreviewTab('viewer');
        }

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setPreviewModalFile(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        const loadPreviewUrl = async () => {
            if (!previewModalFile) {
                setActivePdfBlobUrl(null);
                setActiveFilePreviewUrl(null);
                return;
            }
            
            let rawUrl = previewModalFile.url || previewModalFile.Url || previewModalFile.fileUrl;

            // Try to load exact uploaded file from IndexedDB first
            if (previewModalFile.id) {
                try {
                    const idbUrl = await getFileBlobFromIndexedDb(previewModalFile.id);
                    if (idbUrl) {
                        rawUrl = idbUrl;
                    }
                } catch (_) {}
            }

            if (isMounted) {
                const ext = (previewModalFile.extension || previewModalFile.name?.split('.').pop() || '').toLowerCase().trim();
                const isPdf = ext === 'pdf' || previewModalFile.name?.toLowerCase().endsWith('.pdf');
                
                let resolvedUrl = rawUrl;
                if (isPdf) {
                    const blobUrl = getPdfBlobUrl(rawUrl || SAMPLE_PDF_DATA_URL);
                    createdBlobUrl = blobUrl;
                    setActivePdfBlobUrl(blobUrl);
                    resolvedUrl = blobUrl;
                } else if (rawUrl && rawUrl !== '#') {
                    resolvedUrl = resolveMediaUrl(rawUrl);
                }

                setActiveFilePreviewUrl(resolvedUrl);
            }
        };

        loadPreviewUrl();

        return () => {
            isMounted = false;
            window.removeEventListener('keydown', handleKeyDown);
            if (createdBlobUrl && typeof createdBlobUrl === 'string' && createdBlobUrl.startsWith('blob:')) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(createdBlobUrl); } catch (e) {}
                }, 3000);
            }
        };
    }, [previewModalFile]);

    // Smart AI File Type & Category Auto-Detector
    const detectFileTypeAndCategory = (file) => {
        if (!file) return { category: 'Document', ext: 'pdf' };
        
        const fileName = typeof file === 'string' ? file : (file.name || '');
        const nameParts = fileName.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop().toLowerCase().trim() : '';
        const mimeType = ((typeof file === 'object' && file.type) || '').toLowerCase();

        // 1. Image
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'avif'].includes(ext) || mimeType.startsWith('image/')) {
            return { category: 'Image', ext: ext || 'png' };
        }

        // 2. Audio (Automatic detection for MP3, WAV, AAC, FLAC, OGG, M4A, etc.)
        if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus', 'weba', 'm4p'].includes(ext) || mimeType.startsWith('audio/')) {
            return { category: 'Audio', ext: ext || 'mp3' };
        }

        // 3. Video
        if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'wmv', 'flv'].includes(ext) || mimeType.startsWith('video/')) {
            return { category: 'Video', ext: ext || 'mp4' };
        }

        // 4. Document (PDF, Word, Excel, PowerPoint, Text, Archives, Code, etc.)
        return { category: 'Document', ext: ext || 'pdf' };
    };

    const getFileFormatConfig = (file) => {
        const ext = (file?.extension || (file?.name ? file.name.split('.').pop() : '') || '').toLowerCase().trim();
        const cat = file?.category || 'Document';

        if (cat === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus', 'weba', 'm4p'].includes(ext)) {
            return {
                badge: (ext || 'MP3').toUpperCase(),
                label: 'Digital Audio Track',
                icon: 'audiotrack',
                color: 'text-violet-600 dark:text-violet-400',
                border: 'border-violet-200 dark:border-violet-800/60',
                bg: 'bg-violet-50 dark:bg-violet-950/40',
                badgeBg: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800'
            };
        }
        if (['pdf'].includes(ext)) {
            return {
                badge: 'PDF',
                label: 'Adobe PDF Document',
                icon: 'picture_as_pdf',
                color: 'text-rose-600 dark:text-rose-400',
                border: 'border-rose-200 dark:border-rose-800/60',
                bg: 'bg-rose-50 dark:bg-rose-950/40',
                badgeBg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            };
        }
        if (['doc', 'docx'].includes(ext)) {
            return {
                badge: 'DOCX',
                label: 'Microsoft Word Document',
                icon: 'description',
                color: 'text-blue-600 dark:text-blue-400',
                border: 'border-blue-200 dark:border-blue-800/60',
                bg: 'bg-blue-50 dark:bg-blue-950/40',
                badgeBg: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
            };
        }
        if (['xls', 'xlsx', 'csv'].includes(ext)) {
            return {
                badge: ext.toUpperCase(),
                label: 'Excel Spreadsheet',
                icon: 'table_chart',
                color: 'text-emerald-600 dark:text-emerald-400',
                border: 'border-emerald-200 dark:border-emerald-800/60',
                bg: 'bg-emerald-50 dark:bg-emerald-950/40',
                badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            };
        }
        if (['ppt', 'pptx'].includes(ext)) {
            return {
                badge: 'PPTX',
                label: 'PowerPoint Presentation',
                icon: 'slideshow',
                color: 'text-amber-600 dark:text-amber-400',
                border: 'border-amber-200 dark:border-amber-800/60',
                bg: 'bg-amber-50 dark:bg-amber-950/40',
                badgeBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            };
        }
        if (cat === 'Image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
            return {
                badge: (ext || 'IMG').toUpperCase(),
                label: 'Graphic Asset',
                icon: 'image',
                color: 'text-purple-600 dark:text-purple-400',
                border: 'border-purple-200 dark:border-purple-800/60',
                bg: 'bg-purple-50 dark:bg-purple-950/40',
                badgeBg: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
            };
        }
        if (cat === 'Video' || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) {
            return {
                badge: (ext || 'MP4').toUpperCase(),
                label: 'Digital Video',
                icon: 'movie',
                color: 'text-indigo-600 dark:text-indigo-400',
                border: 'border-indigo-200 dark:border-indigo-800/60',
                bg: 'bg-indigo-50 dark:bg-indigo-950/40',
                badgeBg: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
            };
        }
        if (cat === 'Archive' || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            return {
                badge: (ext || 'ZIP').toUpperCase(),
                label: 'Archive Package',
                icon: 'folder_zip',
                color: 'text-amber-600 dark:text-amber-400',
                border: 'border-amber-200 dark:border-amber-800/60',
                bg: 'bg-amber-50 dark:bg-amber-950/40',
                badgeBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            };
        }
        if (cat === 'Code' || ['js', 'jsx', 'ts', 'tsx', 'cs', 'py', 'java', 'sql', 'json', 'html', 'css'].includes(ext)) {
            return {
                badge: (ext || 'SRC').toUpperCase(),
                label: 'Code / Script',
                icon: 'terminal',
                color: 'text-cyan-600 dark:text-cyan-400',
                border: 'border-cyan-200 dark:border-cyan-800/60',
                bg: 'bg-cyan-50 dark:bg-cyan-950/40',
                badgeBg: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
            };
        }
        return {
            badge: (ext || 'DOC').toUpperCase(),
            label: 'Institutional Document',
            icon: 'article',
            color: 'text-slate-600 dark:text-slate-400',
            border: 'border-slate-200 dark:border-slate-700',
            bg: 'bg-slate-50 dark:bg-slate-800/60',
            badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
        };
    };

    const formatFileDate = (dateVal) => {
        if (!dateVal) return 'Recently';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return 'Recently';
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return 'Recently';
        }
    };

    const handleFileUploadSubmit = async (e) => {
        e.preventDefault();
        const rawName = uploadFileName.trim() || selectedUploadFile?.name || 'Shared Document';
        if (!rawName) {
            showToast('Please enter a valid file name.', 'warning');
            return;
        }

        setIsUploadingFile(true);
        try {
            const detected = detectFileTypeAndCategory(selectedUploadFile);
            const isAudioExt = detected.category === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus', 'weba', 'm4p'].includes(detected.ext);
            const fileCategory = isAudioExt ? 'Audio' : (uploadFileCategory || detected.category);
            const fileExt = detected.ext || (isAudioExt ? 'mp3' : 'doc');

            const rawSizeBytes = selectedUploadFile?.size || 45000;
            const formattedSize = rawSizeBytes > 1048576 
                ? `${(rawSizeBytes / 1048576).toFixed(1)} MB` 
                : `${Math.round(rawSizeBytes / 1024)} KB`;

            const fileId = Date.now();
            let backendFileUrl = null;

            if (selectedUploadFile instanceof File) {
                const uploadMediaType = fileCategory === 'Image' ? 'image' : (fileCategory === 'Audio' ? 'audio' : (fileCategory === 'Video' ? 'video' : 'doc'));
                try {
                    const uploadResult = await apiClient.uploadFile('/media/upload', selectedUploadFile, uploadMediaType);
                    backendFileUrl = uploadResult?.url || uploadResult?.fileUrl || uploadResult?.data?.url;
                } catch (upErr) {
                    console.warn('apiClient.uploadFile failed, trying mediaApi fallback:', upErr);
                    try {
                        const uploadResult = await mediaApi.uploadFile(selectedUploadFile, uploadMediaType);
                        backendFileUrl = uploadResult?.url || uploadResult?.fileUrl || uploadResult?.data?.url;
                    } catch (fbErr) {
                        console.warn('Backend file upload fallback to local:', fbErr);
                    }
                }
            }

            let fileDataUrl = null;
            if (selectedUploadFile && !backendFileUrl) {
                // Only create dataUrl for offline/fallback small files
                if (selectedUploadFile.size < 4 * 1024 * 1024) {
                    fileDataUrl = await readFileAsDataUrl(selectedUploadFile);
                }
            }

            const finalUrl = backendFileUrl ? resolveMediaUrl(backendFileUrl) : (fileDataUrl || '#');

            // Save blob to IndexedDB only if local dataUrl fallback was needed
            if (fileDataUrl) {
                await saveFileBlobToIndexedDb(fileId, fileDataUrl);
            }

            const storedUrlForLocalStorage = backendFileUrl || (fileDataUrl && fileDataUrl.length < 50000 ? fileDataUrl : '#');

            const newFileItem = {
                id: String(fileId),
                name: rawName,
                category: fileCategory,
                extension: fileExt,
                size: formattedSize,
                uploadedBy: currentUser?.fullName || currentUser?.name || 'Member',
                uploadedByUserId: currentUser?.id || currentUser?.userId || null,
                uploadedAt: new Date().toISOString(),
                url: backendFileUrl || finalUrl, // Keep exact URL in memory state
                hasIndexedDb: !!fileDataUrl,
                downloadCount: 0
            };

            const targetId = community?.id || communityId || 101;
            const savedFilesKey = `knome_community_files_${targetId}`;

            // Persist to backend server so all community members can see it
            try {
                await communitiesApi.uploadFile(targetId, newFileItem);
            } catch (backendSaveErr) {
                console.warn('Failed saving community file to backend API, using local storage fallback:', backendSaveErr);
            }

            // Save sanitized payload for LocalStorage metadata list
            const localStorageItem = { ...newFileItem, url: storedUrlForLocalStorage };
            const updatedFilesMemory = [newFileItem, ...filesList.filter(f => String(f.id).trim() !== String(fileId).trim())];
            const updatedFilesStorage = [localStorageItem, ...filesList.filter(f => String(f.id).trim() !== String(fileId).trim()).map(f => ({ ...f, url: (f.url && f.url.length > 50000 && f.url.startsWith('data:')) ? '#' : f.url }))];
            
            setFilesList(updatedFilesMemory);
            safeSetStorage(savedFilesKey, updatedFilesStorage);

            // Dispatch community files updated event
            window.dispatchEvent(new CustomEvent('community-files-updated', { detail: { communityId: targetId } }));

            setIsUploadingFile(false);
            setIsUploadModalOpen(false);
            setUploadFileName('');
            setSelectedUploadFile(null);
            showToast(`✨ File detected as ${fileCategory} (${fileExt.toUpperCase()}) and published successfully!`, 'success');
        } catch (err) {
            console.error('Failed to upload file:', err);
            setIsUploadingFile(false);
            showToast('Failed to upload file.', 'error');
        }
    };

    const canDeleteFile = (file) => {
        if (isAdmin || isCreator) return true;
        if (!currentUser || !file) return false;
        const currentId = String(currentUser.id ?? currentUser.userId ?? '');
        const currentName = String(currentUser.fullName || currentUser.name || '').toLowerCase().trim();
        const uploaderId = String(file.uploadedByUserId ?? file.UploadedByUserId ?? file.uploaderId ?? '');
        const uploaderName = String(file.uploadedBy || file.UploadedBy || '').toLowerCase().trim();
        if (currentId && uploaderId && currentId === uploaderId) return true;
        if (currentName && uploaderName && (currentName === uploaderName || currentName.includes(uploaderName) || uploaderName.includes(currentName))) return true;
        return false;
    };

    const handleDeleteFile = async (fileId, fileName) => {
        const ok = await confirm({
            title: 'Delete Community File',
            message: `Are you sure you want to delete "${fileName || 'this file'}" from the community?`,
            confirmText: 'Delete File',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;

        const targetId = community?.id || communityId || 101;
        const savedFilesKey = `knome_community_files_${targetId}`;
        try {
            await communitiesApi.deleteFile(targetId, fileId);
        } catch (delErr) {
            console.warn('Backend file deletion fallback:', delErr);
        }
        try {
            await deleteFileBlobFromIndexedDb(fileId);
        } catch (_) {}

        const updated = filesList.filter(f => String(f.id).trim() !== String(fileId).trim() && (!fileName || f.name !== fileName));
        setFilesList(updated);
        safeSetStorage(savedFilesKey, updated);
        if (previewModalFile && (String(previewModalFile.id) === String(fileId) || previewModalFile.name === fileName)) {
            setPreviewModalFile(null);
        }
        window.dispatchEvent(new CustomEvent('community-files-updated', { detail: { communityId: targetId } }));
        showToast(`Deleted ${fileName || 'file'} successfully`, 'info');
    };

    // Community Creator check
    const isCreator = (community?.creatorUserId && String(community.creatorUserId) === String(currentUser?.id || currentUser?.userId)) ||
                      (community?.createdByUserId && String(community.createdByUserId) === String(currentUser?.id || currentUser?.userId)) ||
                      (community?.createdBy && currentUser?.name && community.createdBy.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                      (community?.adminContact && currentUser?.name && community.adminContact.toLowerCase().includes(currentUser.name.toLowerCase()));

    // Treat SYSADM, CADM, HRADM, Creator, and assigned Admins/Moderators as Community Admins
    const isAdmin = ['SYSADM', 'CADM', 'HRADM', 'ADMIN', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
                    ['System Administrator', 'HR Administrator', 'Community Administrator', 'System Admin', 'HR Admin', 'Community Admin', 'Admin'].includes(currentUser?.roleName) ||
                    (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['System Administrator', 'HR Administrator', 'Community Administrator', 'System Admin', 'HR Admin', 'Community Admin', 'SYSADM', 'HRADM', 'CADM', 'Admin'].includes(r))) ||
                    isCreator ||
                    Boolean(community?.isCurrentUserAdmin) ||
                    membersList.some(m => {
                        const mUid = String(m.userId || m.id || '');
                        const mEmp = String(m.employeeId || m.empId || '').toUpperCase();
                        const isMatch = (currentUser?.id && mUid === String(currentUser.id)) ||
                                        (currentUser?.userId && mUid === String(currentUser.userId)) ||
                                        (currentUser?.employeeId && mEmp && mEmp === String(currentUser.employeeId).toUpperCase());
                        return isMatch && (m.memberType === 'Admin' || m.memberType === 'Moderator' || m.roleName === 'Admin' || m.role === 'Admin');
                    });

    const isSysAdmin = ['SYSADM', 'HRADM', 'ADMIN', 'SYSTEM ADMIN', 'HR ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) || 
                       ['System Administrator', 'HR Administrator', 'System Admin', 'HR Admin', 'Admin'].includes(currentUser?.roleName) ||
                       (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'HRADM', 'System Administrator', 'HR Administrator', 'System Admin', 'HR Admin', 'Admin'].includes(r)));

    // Load organization directory for admin member addition modal
    useEffect(() => {
        if (isAddMemberModalOpen) {
            setIsLoadingOrgUsers(true);
            adminApi.getUsers(1, 500, '').then(res => {
                const list = res?.data?.items || res?.data || res?.items || res || [];
                if (Array.isArray(list) && list.length > 0) {
                    setAllOrgUsers(list);
                } else if (Array.isArray(contextUsers) && contextUsers.length > 0) {
                    setAllOrgUsers(contextUsers);
                }
            }).catch(() => {
                if (Array.isArray(contextUsers) && contextUsers.length > 0) {
                    setAllOrgUsers(contextUsers);
                }
            }).finally(() => {
                setIsLoadingOrgUsers(false);
            });
        }
    }, [isAddMemberModalOpen]);

    const filteredEmployeesToAdd = useMemo(() => {
        const pool = (allOrgUsers && allOrgUsers.length > 0) ? allOrgUsers : (contextUsers || []);
        if (!addMemberSearch || !addMemberSearch.trim()) return pool;
        const q = addMemberSearch.toLowerCase().trim();
        return pool.filter(u => 
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.fullName && u.fullName.toLowerCase().includes(q)) ||
            (u.employeeId && u.employeeId.toLowerCase().includes(q)) ||
            (u.department && u.department.toLowerCase().includes(q)) ||
            (u.departmentName && u.departmentName.toLowerCase().includes(q)) ||
            (u.designation && u.designation.toLowerCase().includes(q))
        );
    }, [allOrgUsers, contextUsers, addMemberSearch]);

    const handleAddSelectedMembers = async () => {
        if (!selectedUserIdsToAdd || selectedUserIdsToAdd.length === 0) {
            showToast('Please select at least one employee to add.', 'error');
            return;
        }

        setIsSavingMembers(true);
        try {
            const targetId = community?.id || communityId;
            const pool = (allOrgUsers && allOrgUsers.length > 0) ? allOrgUsers : (contextUsers || []);
            
            // Resolve full user records for selected IDs
            const selectedUsers = pool.filter(u => {
                const uid = u.id || u.userId || u.UserId;
                const emp = u.employeeId || u.empId;
                return selectedUserIdsToAdd.some(id => String(id) === String(uid) || (emp && String(id).toUpperCase() === String(emp).toUpperCase()));
            });

            // 1. Wipe out any previous removal tombstones for these users in this community
            try {
                const removedKey = `knome_community_removed_${targetId}`;
                const removedList = JSON.parse(localStorage.getItem(removedKey) || '[]');
                const toRemoveFromTombstones = new Set();
                selectedUsers.forEach(u => {
                    if (u.id) toRemoveFromTombstones.add(String(u.id).toLowerCase());
                    if (u.userId) toRemoveFromTombstones.add(String(u.userId).toLowerCase());
                    if (u.employeeId) toRemoveFromTombstones.add(String(u.employeeId).toLowerCase());
                    if (u.empId) toRemoveFromTombstones.add(String(u.empId).toLowerCase());
                    if (u.name) toRemoveFromTombstones.add(String(u.name).toLowerCase());
                    if (u.fullName) toRemoveFromTombstones.add(String(u.fullName).toLowerCase());
                    if (u.email) toRemoveFromTombstones.add(String(u.email).toLowerCase());
                });
                selectedUserIdsToAdd.forEach(id => toRemoveFromTombstones.add(String(id).toLowerCase()));

                const updatedRemoved = removedList.filter(x => !toRemoveFromTombstones.has(String(x).toLowerCase()));
                localStorage.setItem(removedKey, JSON.stringify(updatedRemoved));
            } catch (_) {}

            // 2. Remove from suspended list if previously suspended in this community
            try {
                const suspendedKey = `knome_community_suspended_${targetId}`;
                const currentSuspended = JSON.parse(localStorage.getItem(suspendedKey) || '[]');
                const updatedSuspended = currentSuspended.filter(s => {
                    const sUid = String(s.userId || s.id || '');
                    const sEmp = String(s.employeeId || '').toUpperCase();
                    const sName = String(s.fullName || s.name || '').toLowerCase();
                    return !selectedUsers.some(u => 
                        (sUid && String(u.id || u.userId) === sUid) ||
                        (sEmp && String(u.employeeId || u.empId || '').toUpperCase() === sEmp) ||
                        (sName && String(u.fullName || u.name).toLowerCase() === sName)
                    );
                });
                localStorage.setItem(suspendedKey, JSON.stringify(updatedSuspended));
                setSuspendedMembers(updatedSuspended);
            } catch (_) {}

            // 3. Remove from pending join requests for all selected users
            const toPurgeUserIds = new Set();
            const toPurgeEmpIds = new Set();
            const toPurgeNames = new Set();

            selectedUserIdsToAdd.forEach(id => {
                if (id) toPurgeUserIds.add(String(id).toLowerCase());
            });
            selectedUsers.forEach(u => {
                if (u.id) toPurgeUserIds.add(String(u.id).toLowerCase());
                if (u.userId) toPurgeUserIds.add(String(u.userId).toLowerCase());
                if (u.employeeId) toPurgeEmpIds.add(String(u.employeeId).toUpperCase());
                if (u.empId) toPurgeEmpIds.add(String(u.empId).toUpperCase());
                if (u.name) toPurgeNames.add(String(u.name).toLowerCase());
                if (u.fullName) toPurgeNames.add(String(u.fullName).toLowerCase());
            });

            // Target community keys
            const commKeys = Array.from(new Set([
                `knome_join_requests_${targetId}`,
                community?.id ? `knome_join_requests_${community.id}` : null,
                communityId ? `knome_join_requests_${communityId}` : null
            ].filter(Boolean)));

            commKeys.forEach(reqKey => {
                try {
                    const currentRequests = JSON.parse(localStorage.getItem(reqKey) || '[]');
                    const filtered = currentRequests.filter(r => {
                        const rUid = String(r.userId || r.id || '').toLowerCase();
                        const rEmp = String(r.employeeId || '').toUpperCase();
                        const rName = String(r.name || r.fullName || '').toLowerCase();
                        return !(toPurgeUserIds.has(rUid) || (rEmp && toPurgeEmpIds.has(rEmp)) || (rName && toPurgeNames.has(rName)));
                    });
                    localStorage.setItem(reqKey, JSON.stringify(filtered));
                } catch (_) {}
            });

            // Purge immediately from React state
            setJoinRequests(prev => prev.filter(r => {
                const rUid = String(r.userId || r.id || '').toLowerCase();
                const rEmp = String(r.employeeId || '').toUpperCase();
                const rName = String(r.name || r.fullName || '').toLowerCase();
                return !(toPurgeUserIds.has(rUid) || (rEmp && toPurgeEmpIds.has(rEmp)) || (rName && toPurgeNames.has(rName)));
            }));

            // Dismiss pending join request notifications for these users
            try {
                const notifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                const cleanedNotifs = notifs.filter(n => {
                    const isJoinNotif = n.type === 'join_request' || n.type === 'community_join';
                    const matchesComm = String(n.communityId) === String(targetId) || String(n.communityId) === String(community?.id);
                    const senderUid = String(n.senderUserId || n.userId || '').toLowerCase();
                    const senderName = String(n.senderName || '').toLowerCase();
                    return !(isJoinNotif && matchesComm && (toPurgeUserIds.has(senderUid) || (senderName && toPurgeNames.has(senderName))));
                });
                localStorage.setItem('knome_notifications', JSON.stringify(cleanedNotifs));
            } catch (_) {}

            // 4. Construct rich member objects for local cache
            const newMemberObjects = selectedUsers.map(u => ({
                userId: u.userId || u.id,
                id: u.id || u.userId,
                fullName: u.fullName || u.name,
                name: u.name || u.fullName,
                employeeId: u.employeeId || u.empId || 'MPO100',
                designation: u.designation || 'Software Engineer',
                department: u.department || u.departmentName || 'Technology',
                departmentName: u.departmentName || u.department || 'Technology',
                profilePhotoUrl: u.profilePhotoUrl || u.avatar || null,
                avatar: u.avatar || u.profilePhotoUrl || null,
                memberType: selectedRoleToAdd,
                status: 'Approved',
                joinedDate: new Date().toISOString()
            }));

            // 5. Update local community members storage
            const savedMembersKey = `knome_community_members_${targetId}`;
            let localMembers = JSON.parse(localStorage.getItem(savedMembersKey) || '[]');
            newMemberObjects.forEach(newM => {
                const idx = localMembers.findIndex(m => 
                    String(m.userId || m.id) === String(newM.userId) || 
                    (newM.employeeId && String(m.employeeId || m.empId).toUpperCase() === String(newM.employeeId).toUpperCase())
                );
                if (idx >= 0) {
                    localMembers[idx] = { ...localMembers[idx], ...newM, status: 'Approved' };
                } else {
                    localMembers.push(newM);
                }
            });
            localStorage.setItem(savedMembersKey, JSON.stringify(localMembers));

            // 6. Update user's joined list for all added users (removing pending state, setting joined)
            const targetUserJoinedKeys = new Set();
            toPurgeUserIds.forEach(uid => targetUserJoinedKeys.add(`knome_joined_communities_${uid}`));
            toPurgeEmpIds.forEach(eid => targetUserJoinedKeys.add(`knome_joined_communities_${eid}`));
            if (currentUser?.id) targetUserJoinedKeys.add(`knome_joined_communities_${currentUser.id}`);
            if (currentUser?.userId) targetUserJoinedKeys.add(`knome_joined_communities_${currentUser.userId}`);
            if (currentUser?.employeeId) targetUserJoinedKeys.add(`knome_joined_communities_${currentUser.employeeId}`);

            targetUserJoinedKeys.forEach(k => {
                try {
                    const joinedList = JSON.parse(localStorage.getItem(k) || '[]');
                    const filtered = joinedList.filter(c => String(c.id) !== String(targetId) && String(c.id) !== String(community?.id));
                    filtered.push({
                        id: targetId,
                        name: community?.name || 'Community',
                        category: community?.category || 'General',
                        type: community?.type || 'Private',
                        role: selectedRoleToAdd || 'Member',
                        status: 'joined',
                        joinedDate: new Date().toISOString()
                    });
                    localStorage.setItem(k, JSON.stringify(filtered));
                } catch (_) {}
            });

            const currentUid = String(currentUser?.userId || currentUser?.id || '').toLowerCase();
            const currentEmp = String(currentUser?.employeeId || '').toUpperCase();
            const currentName = String(currentUser?.fullName || currentUser?.name || '').toLowerCase();
            if (toPurgeUserIds.has(currentUid) || (currentEmp && toPurgeEmpIds.has(currentEmp)) || (currentName && toPurgeNames.has(currentName))) {
                setMembershipStatus('joined');
            }

            // 7. Call backend API with rich payload and decide membership on any pending requests
            const isValidInt32 = targetId && !isNaN(targetId) && Number(targetId) > 0 && Number(targetId) <= 2147483647;
            if (isValidInt32) {
                // Ensure any pending join requests for these user IDs are marked Approved on backend
                toPurgeUserIds.forEach(uid => {
                    const num = Number(uid);
                    if (!isNaN(num) && num > 0 && num < 1000000000) {
                        communitiesApi.decideMembership(targetId, num, 'Approved').catch(() => null);
                    }
                });

                try {
                    await communitiesApi.addMembers(targetId, {
                        userIds: selectedUserIdsToAdd.map(Number).filter(n => !isNaN(n) && n > 0),
                        employeeIds: selectedUsers.map(u => u.employeeId || u.empId).filter(Boolean),
                        memberType: selectedRoleToAdd,
                        members: selectedUsers.map(u => ({
                            userId: Number(u.userId || u.id) || null,
                            employeeId: u.employeeId || u.empId || null,
                            fullName: u.fullName || u.name || null,
                            email: u.email || null,
                            designation: u.designation || null,
                            departmentName: u.departmentName || u.department || null,
                            profilePhotoUrl: u.profilePhotoUrl || u.avatar || null
                        }))
                    });
                } catch (apiErr) {
                    console.warn('Backend communitiesApi.addMembers warning (falling back to authoritative local sync):', apiErr);
                }
            }

            // 8. Update React State immediately
            setMembersList(prev => {
                const updated = [...prev];
                newMemberObjects.forEach(newM => {
                    const idx = updated.findIndex(m => 
                        String(m.userId || m.id) === String(newM.userId) || 
                        (newM.employeeId && String(m.employeeId || m.empId).toUpperCase() === String(newM.employeeId).toUpperCase())
                    );
                    if (idx >= 0) {
                        updated[idx] = { ...updated[idx], ...newM, status: 'Approved' };
                    } else {
                        updated.push(newM);
                    }
                });
                return deduplicateMembers(updated, contextUsers);
            });

            setCommunity(prev => prev ? ({
                ...prev,
                membersCount: Math.max((prev.membersCount || 0) + selectedUserIdsToAdd.length, localMembers.length)
            }) : prev);

            // 9. Synchronize with fresh loadData
            await loadData().catch(() => {});

            const addedCount = selectedUserIdsToAdd.length;
            showToast(`✅ Successfully added ${addedCount} member${addedCount > 1 ? 's' : ''} to "${community?.name || 'community'}"!`, 'success');
            setSelectedUserIdsToAdd([]);
            setIsAddMemberModalOpen(false);
            window.dispatchEvent(new CustomEvent('community-joined-change'));
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('community-join-requests-updated', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('knome_notification_received'));
            window.dispatchEvent(new Event('storage'));
            window.dispatchEvent(new Event('storage'));
        } catch (err) {
            console.error('Failed to add members:', err);
            const msg = err?.data?.message || err?.message || 'Failed to add members to community.';
            showToast(msg, 'error');
        } finally {
            setIsSavingMembers(false);
        }
    };

    const handleApproveThisCommunity = async () => {
        setIsApprovingCommunity(true);
        try {
            const commIdNum = Number(community?.id || communityId);
            if (!isNaN(commIdNum) && commIdNum > 0) {
                await communitiesApi.approve(commIdNum);
                if (Array.isArray(community?.invitedUserIds) && community.invitedUserIds.length > 0) {
                    await communitiesApi.addMembers(commIdNum, community.invitedUserIds).catch(() => {});
                }
            }

            try {
                const pending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                const updatedPending = pending.filter(p => String(p.id) !== String(commIdNum));
                localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
            } catch (_) {}

            setCommunity(prev => ({
                ...prev,
                isActive: true,
                approvalStatus: 'Approved'
            }));
            showToast(`🎉 Community "${community?.name}" approved successfully and is now live!`, 'success');
            window.dispatchEvent(new CustomEvent('community-created'));
            window.dispatchEvent(new CustomEvent('community-approval-requested'));
        } catch (err) {
            console.error('Failed to approve community:', err);
            showToast('Failed to approve community.', 'error');
        } finally {
            setIsApprovingCommunity(false);
        }
    };

    const handleRejectThisCommunity = async () => {
        const ok = await confirm({
            title: 'Reject Community Request',
            message: `Are you sure you want to reject the community creation request for "${community?.name}"?`,
            confirmText: 'Reject Community',
            cancelText: 'Cancel',
            variant: 'warning'
        });
        if (!ok) return;

        setIsApprovingCommunity(true);
        try {
            const commIdNum = Number(community?.id || communityId);
            if (!isNaN(commIdNum) && commIdNum > 0) {
                await communitiesApi.reject(commIdNum, 'Rejected by administrator');
            }

            try {
                const pending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                const updatedPending = pending.filter(p => String(p.id) !== String(commIdNum));
                localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
            } catch (_) {}

            showToast(`Community request for "${community?.name}" was rejected.`, 'info');
            navigate('/communities');
        } catch (err) {
            console.error('Failed to reject community:', err);
            showToast('Failed to reject community.', 'error');
        } finally {
            setIsApprovingCommunity(false);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const parseRulesList = (raw) => {
        if (!raw) return ['1. Be respectful.', '2. Share knowledge.', '3. Follow company policy.'];
        if (Array.isArray(raw)) return raw.map(r => String(r).trim()).filter(Boolean);
        if (typeof raw === 'string') {
            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            return lines.length > 0 ? lines : [raw.trim()];
        }
        return ['1. Be respectful.', '2. Share knowledge.', '3. Follow company policy.'];
    };

    const parseFaqList = (raw) => {
        if (!raw) return [{ q: 'Who can join?', a: 'All MPOnline employees may join or request access.' }];
        if (Array.isArray(raw)) return raw.filter(item => item && (item.q || item.a));
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) return parsed.filter(item => item && (item.q || item.a));
                } catch (e) {}
            }
            const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const items = [];
            let q = '', a = '';
            lines.forEach(l => {
                if (/^q:/i.test(l)) {
                    if (q) items.push({ q, a: a || 'Yes' });
                    q = l.replace(/^q:\s*/i, '');
                    a = '';
                } else if (/^a:/i.test(l)) {
                    a = l.replace(/^a:\s*/i, '');
                } else if (q) {
                    a += (a ? ' ' : '') + l;
                }
            });
            if (q) items.push({ q, a: a || 'Yes' });
            return items.length > 0 ? items : [{ q: 'Who can join?', a: trimmed }];
        }
        return [{ q: 'Who can join?', a: 'All MPOnline employees may join or request access.' }];
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            const isPureMockId = communityId && (isNaN(communityId) || Number(communityId) > 1000000000);
            const isValidInt32 = communityId && !isNaN(communityId) && Number(communityId) > 0 && Number(communityId) <= 2147483647 && !isPureMockId;

            let commData = null;
            let postsData = [];
            let rawMembers = [];
            let apiFiles = null;
            let apiPendingMembers = [];

            if (isValidInt32) {
                commData = await communitiesApi.getById(communityId, { noCache: true }).catch(() => null);
                if (commData) {
                    [postsData, rawMembers, apiFiles, apiPendingMembers] = await Promise.all([
                        communitiesApi.getPosts(communityId).catch(() => []),
                        communitiesApi.getMembers(communityId, null, 1, 200, { noCache: true }).catch(() => []),
                        communitiesApi.getFiles(communityId).catch(() => null),
                        communitiesApi.getMembers(communityId, 'Pending', 1, 100, { noCache: true }).catch(() => [])
                    ]);
                }
            }
            
            if (commData) {
                const imgs = getCommunityImages(commData.name, commData.categoryName);
                const customComms = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                const localMatch = customComms.find(c => String(c.id) === String(commData.communityId) || (c.name && c.name.toLowerCase() === commData.name?.toLowerCase()));
                const localRulesFaq = JSON.parse(localStorage.getItem(`knome_community_rules_faq_${commData.communityId}`) || 'null');

                const resolvedRules = localRulesFaq?.rules 
                    ? parseRulesList(localRulesFaq.rules) 
                    : (commData.rules ? parseRulesList(commData.rules) : (localMatch?.rules ? parseRulesList(localMatch.rules) : parseRulesList(null)));
                const resolvedFaq = localRulesFaq?.faq 
                    ? parseFaqList(localRulesFaq.faq) 
                    : (commData.faq ? parseFaqList(commData.faq) : (localMatch?.faq ? parseFaqList(localMatch.faq) : parseFaqList(null)));

                // Resolve Persistent Members for this Community (FR-CM-06)
                const savedMembersKey = `knome_community_members_${commData.communityId}`;
                const localMembersApi = JSON.parse(localStorage.getItem(savedMembersKey) || '[]');
                const removedMembersList = JSON.parse(localStorage.getItem(`knome_community_removed_${commData.communityId}`) || '[]');
                const removedSet = new Set(removedMembersList.map(x => String(x).toLowerCase()));

                const defaultCreator = {
                    userId: commData.creatorUserId || commData.createdByUserId || 1,
                    fullName: commData.createdBy || commData.createdByUserName || 'Community Creator',
                    employeeId: commData.creatorEmployeeId || 'MPO100',
                    designation: 'Community Admin',
                    memberType: 'Admin',
                    status: 'Approved',
                    profilePhotoUrl: commData.creatorAvatar || null
                };

                // 1. Authoritative members from backend database
                const memberMap = new Map();
                (Array.isArray(rawMembers) ? rawMembers : []).forEach(m => {
                    const key = String(m?.userId || m?.id || '');
                    if (key) memberMap.set(key, m);
                });

                // 2. Only preserve purely mock/local offline invites that haven't synced to DB
                (Array.isArray(localMembersApi) ? localMembersApi : []).forEach(m => {
                    const key = String(m?.userId || m?.id || '');
                    const isMockOrLocalInvite = Boolean(m?.isLocalInvite || m?.isMockInvite || m?.isPendingInvite || (Number(key) > 1000000000));
                    if (key && !memberMap.has(key) && isMockOrLocalInvite) {
                        memberMap.set(key, m);
                    }
                });

                if (memberMap.size === 0) {
                    memberMap.set(String(defaultCreator.userId), defaultCreator);
                }

                // 3. Filter out any member recorded in removedSet tombstones
                let rawList = Array.from(memberMap.values())
                    .filter(m => {
                        const uid = String(m?.userId || m?.id || '').toLowerCase();
                        const empId = String(m?.employeeId || m?.empId || '').toLowerCase();
                        const name = String(m?.fullName || m?.name || '').toLowerCase();
                        return !(removedSet.has(uid) || (empId && removedSet.has(empId)) || (name && removedSet.has(name)));
                    })
                    .map(m => (m.memberType === 'Moderator' ? { ...m, memberType: 'Admin' } : m));

                const resolvedCategory = commData.categoryName || localMatch?.category || 'Technology';
                setSelectedCategory(resolvedCategory);

                setCommunity({
                    id: commData.communityId,
                    name: commData.name,
                    type: commData.communityType || 'Public',
                    category: resolvedCategory,
                    membersCount: rawList.length > 0 ? rawList.length : (commData.membersCount || 1),
                    adminContact: commData.createdByUserName || 'Admin',
                    banner: localMatch?.banner || localMatch?.bannerUrl || resolveMediaUrl(commData.bannerUrl || commData.bannerImageUrl) || imgs.banner,
                    thumbnail: localMatch?.thumbnail || localMatch?.avatar || localMatch?.thumbnailUrl || resolveMediaUrl(commData.thumbnailUrl) || imgs.thumbnail,
                    description: commData.description || 'Community for MPOnline team members.',
                    rules: resolvedRules,
                    faq: resolvedFaq,
                    isActive: commData.isActive,
                    approvalStatus: commData.approvalStatus || (commData.isActive ? 'Approved' : 'Pending'),
                    createdByUserId: commData.createdByUserId,
                    createdDate: commData.createdDate,
                    invitedUserIds: localMatch?.invitedUserIds || commData.invitedUserIds || []
                });

                const isDefaultOrg = (commData.communityType || '').toLowerCase().includes('default') || (commData.communityType || '').toLowerCase().includes('org');
                
                const currentUid = String(currentUser?.userId || currentUser?.id || '');
                const currentEmpId = String(currentUser?.employeeId || '').toUpperCase();
                const currentName = String(currentUser?.fullName || currentUser?.name || '').toLowerCase();
                const currentEmail = String(currentUser?.email || '').toLowerCase();

                const isCreator = Boolean(
                    (commData.createdByUserId && String(commData.createdByUserId) === currentUid) ||
                    (commData.creatorUserId && String(commData.creatorUserId) === currentUid) ||
                    (commData.createdByUserName && currentName && commData.createdByUserName.toLowerCase().includes(currentName))
                );

                const isMemberAdmin = rawList.some(m => {
                    const mUid = String(m?.userId || m?.id || '');
                    const mEmp = String(m?.employeeId || m?.empId || '').toUpperCase();
                    return ((currentUid && mUid === currentUid) || (currentEmpId && mEmp === currentEmpId)) && 
                           (m.memberType === 'Admin' || m.memberType === 'Moderator');
                });
                const isCommAdmin = Boolean(commData.isCurrentUserAdmin) || isMemberAdmin;

                const isCurrentRemoved = removedSet.has(currentUid.toLowerCase()) || 
                                         (currentEmpId && removedSet.has(currentEmpId.toLowerCase())) || 
                                         (currentName && removedSet.has(currentName)) ||
                                         (currentEmail && removedSet.has(currentEmail));

                const apiStatus = (commData.currentUserMembershipStatus || '').toLowerCase();
                const isApiApproved = apiStatus === 'approved' || apiStatus === 'joined';

                const userJoinedList = JSON.parse(localStorage.getItem(`knome_joined_communities_${currentUser?.id || 'guest'}`) || '[]');
                const isLocalJoined = userJoinedList.some(c => String(c.id) === String(commData.communityId) && (c.status === 'joined' || !c.status));
                const isLocalPending = userJoinedList.some(c => String(c.id) === String(commData.communityId) && (c.status === 'pending' || c.status === 'requested'));

                const isMemberInRawList = rawList.some(m => {
                    const mUid = String(m?.userId || m?.id || '');
                    const mEmp = String(m?.employeeId || m?.empId || '').toUpperCase();
                    const mName = String(m?.fullName || m?.name || '').toLowerCase();
                    return (currentUid && mUid === currentUid) || 
                           (currentEmpId && mEmp === currentEmpId) || 
                           (currentName && mName === currentName);
                });

                // Load persistent subscribers and suspended members
                const savedSubs = JSON.parse(localStorage.getItem(`knome_community_subscribers_${commData.communityId}`) || '[]');
                setSubscribersList(savedSubs);

                const commSuspended1 = JSON.parse(localStorage.getItem(`knome_community_suspended_${commData.communityId}`) || '[]');
                const commSuspended2 = communityId ? JSON.parse(localStorage.getItem(`knome_community_suspended_${communityId}`) || '[]') : [];
                const savedSuspendedMap = new Map();
                [...commSuspended1, ...commSuspended2].forEach(item => {
                    const key = String(item.userId || item.id || item.employeeId || item.empId || item.fullName || item.name || '');
                    if (key && !savedSuspendedMap.has(key)) {
                        savedSuspendedMap.set(key, item);
                    }
                });
                const savedSuspended = Array.from(savedSuspendedMap.values());
                setSuspendedMembers(savedSuspended);

                // FR-CM-07: Check if current user is suspended from this community
                const userSuspensionRecord = savedSuspended.find(s => {
                    const sUid = String(s.userId || s.id || '').toLowerCase();
                    const sEmpId = String(s.employeeId || s.empId || '').toUpperCase();
                    const sEmail = String(s.email || '').toLowerCase();
                    const sName = String(s.fullName || s.name || '').toLowerCase();
                    return (currentUid && sUid === currentUid.toLowerCase()) || 
                           (currentEmpId && sEmpId === currentEmpId) || 
                           (currentEmail && sEmail === currentEmail) ||
                           (currentName && sName && (sName === currentName || sName.includes(currentName) || currentName.includes(sName)));
                });
                const isUserSuspendedInComm = Boolean(userSuspensionRecord) || apiStatus === 'banned' || apiStatus === 'suspended';
                const isCurrentUserSysAdmin = ['SYSADM'].includes(currentUser?.role) || ['System Administrator', 'System Admin'].includes(currentUser?.roleName);

                // Authoritative joined check:
                // User is a member IF NOT suspended AND NOT removed locally AND:
                // - Default/Org community, OR
                // - Community Admin, OR
                // - Community Creator, OR
                // - Backend DB confirms approved/joined, OR
                // - User joined locally or present in member list
                const isUserJoined = !isUserSuspendedInComm && !isCurrentRemoved && (isDefaultOrg || isCommAdmin || isCreator || isApiApproved || isLocalJoined || isMemberInRawList);

                // If backend DB reports user is NOT a member and no local join exists, clean cache
                if (!isUserJoined && !isDefaultOrg && !isCommAdmin && !isCreator && !isLocalPending) {
                    // Purge current user from member list
                    rawList = rawList.filter(m => {
                        const mUid = String(m?.userId || m?.id || '');
                        const mEmp = String(m?.employeeId || m?.empId || '').toUpperCase();
                        const mName = String(m?.fullName || m?.name || '').toLowerCase();
                        return !((currentUid && mUid === currentUid) || 
                                 (currentEmpId && mEmp === currentEmpId) || 
                                 (currentName && mName === currentName));
                    });

                    // Purge from user's joined communities in localStorage
                    const userKeys = [
                        `knome_joined_communities_${currentUser?.id || 'guest'}`,
                        currentUser?.userId ? `knome_joined_communities_${currentUser.userId}` : null,
                        currentUser?.employeeId ? `knome_joined_communities_${currentUser.employeeId}` : null
                    ].filter(Boolean);

                    userKeys.forEach(k => {
                        try {
                            const list = JSON.parse(localStorage.getItem(k) || '[]');
                            const cleaned = list.filter(c => String(c.id) !== String(commData.communityId));
                            if (cleaned.length !== list.length) {
                                localStorage.setItem(k, JSON.stringify(cleaned));
                            }
                        } catch (_) {}
                    });
                }

                let resolvedMembers = deduplicateMembers(rawList, contextUsers);

                if (isUserJoined && currentUser) {
                    const isMemberInList = resolvedMembers.some(m => {
                        const mUid = String(m.userId || m.id || '');
                        const mEmpId = String(m.employeeId || m.empId || m.displayEmpId || '').toUpperCase();
                        const mName = String(m.fullName || m.name || m.displayName || '').toLowerCase();
                        return (currentUid && mUid === currentUid) || 
                               (currentEmpId && mEmpId === currentEmpId) || 
                               (currentName && mName === currentName);
                    });
                    if (!isMemberInList) {
                        resolvedMembers.push({
                            userId: currentUser.userId || currentUser.id,
                            fullName: currentUser.fullName || currentUser.name,
                            employeeId: currentUser.employeeId || 'MPO100',
                            designation: currentUser.designation || currentUser.roleName || 'Software Developer',
                            memberType: (isCommAdmin || isCreator) ? 'Admin' : 'Member',
                            status: 'Approved',
                            profilePhotoUrl: currentUser.avatar
                        });
                        resolvedMembers = deduplicateMembers(resolvedMembers, contextUsers);
                    }
                }

                setMembersList(resolvedMembers);
                localStorage.setItem(savedMembersKey, JSON.stringify(resolvedMembers));

                const localEntry = userJoinedList.find(c => String(c.id) === String(commData.communityId));
                const isUserSubscribed = !isUserJoined && (!!(localEntry && localEntry.status === 'subscribed') || apiStatus === 'subscribed');

                // Approved members lookup to ensure no approved member is shown as pending
                const approvedUserIds = new Set(
                    resolvedMembers
                        .filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status)
                        .map(m => String(m.userId || m.id).toLowerCase())
                );
                const approvedEmpIds = new Set(
                    resolvedMembers
                        .filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status)
                        .map(m => String(m.employeeId || m.empId || '').toUpperCase())
                        .filter(Boolean)
                );

                const rawSavedRequestsA = JSON.parse(localStorage.getItem(`knome_join_requests_${commData.communityId}`) || '[]');
                const rawSavedRequestsB = JSON.parse(localStorage.getItem(`knome_join_requests_${communityId}`) || '[]');
                const combinedSavedRequests = [...rawSavedRequestsA];
                rawSavedRequestsB.forEach(rb => {
                    const rbUid = String(rb.userId || rb.id || '').toLowerCase();
                    if (rbUid && !combinedSavedRequests.some(ra => String(ra.userId || ra.id || '').toLowerCase() === rbUid)) {
                        combinedSavedRequests.push(rb);
                    }
                });

                const savedRequests = combinedSavedRequests.filter(r => {
                    const rUid = String(r.userId || r.id || '').toLowerCase();
                    const rEmp = String(r.employeeId || '').toUpperCase();
                    return !(approvedUserIds.has(rUid) || (rEmp && approvedEmpIds.has(rEmp)));
                });

                // Merge API pending requests from backend database
                const pendingList = Array.isArray(apiPendingMembers) 
                    ? apiPendingMembers 
                    : (Array.isArray(apiPendingMembers?.data) ? apiPendingMembers.data : []);

                const mergedRequests = [...savedRequests];
                pendingList.forEach(pm => {
                    const pmUid = String(pm.userId || pm.id || '').toLowerCase();
                    const pmEmp = String(pm.employeeId || pm.empId || '').toUpperCase();
                    if (!approvedUserIds.has(pmUid) && !(pmEmp && approvedEmpIds.has(pmEmp))) {
                        const existingIdx = mergedRequests.findIndex(r => String(r.userId || r.id || '').toLowerCase() === pmUid);
                        const transformed = {
                            id: pm.userId || pm.id,
                            userId: pm.userId || pm.id,
                            name: pm.fullName || pm.name || 'Employee',
                            fullName: pm.fullName || pm.name || 'Employee',
                            employeeId: pm.employeeId || 'MPO100',
                            role: pm.designation || 'Member',
                            designation: pm.designation || 'Member',
                            department: pm.departmentName || pm.department || 'MPOnline',
                            avatar: pm.profilePhotoUrl || null,
                            requestedAt: pm.requestedDate || new Date().toISOString(),
                            status: 'Pending'
                        };
                        if (existingIdx >= 0) {
                            mergedRequests[existingIdx] = { ...mergedRequests[existingIdx], ...transformed };
                        } else {
                            mergedRequests.push(transformed);
                        }
                    }
                });

                // Sync back to local storage so other components stay synchronized
                localStorage.setItem(`knome_join_requests_${commData.communityId}`, JSON.stringify(mergedRequests));
                if (String(communityId) !== String(commData.communityId)) {
                    localStorage.setItem(`knome_join_requests_${communityId}`, JSON.stringify(mergedRequests));
                }

                const myRequest = isUserJoined ? null : mergedRequests.find(r => {
                    const rUid = String(r.userId || r.id || '').toLowerCase();
                    const rEmp = String(r.employeeId || '').toUpperCase();
                    return (currentUid && rUid === currentUid.toLowerCase()) || (currentEmpId && rEmp && rEmp === currentEmpId);
                });

                let resolvedStatus;
                if (isUserSuspendedInComm) {
                    resolvedStatus = 'banned';
                    setCommunitySuspensionInfo(userSuspensionRecord || {
                        suspensionReason: 'Violation of community guidelines',
                        suspensionDuration: 'Indefinite'
                    });
                } else if (isUserJoined) {
                    resolvedStatus = 'joined';
                } else if (isUserSubscribed) {
                    resolvedStatus = 'subscribed';
                } else if (!isCurrentRemoved && (apiStatus === 'pending' || Boolean(myRequest) || isLocalPending)) {
                    resolvedStatus = 'requested';
                } else {
                    resolvedStatus = 'none';
                }
                setMembershipStatus(resolvedStatus);

                setJoinRequests(mergedRequests);
            } else {
                // Fallback check custom created communities or seeds
                const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                const found = customList.find(c => String(c.id) === String(communityId));
                
                const targetId = communityId || 101;
                const savedMembersKey = `knome_community_members_${targetId}`;
                const localMembers = JSON.parse(localStorage.getItem(savedMembersKey) || '[]');
                const removedMembersList = JSON.parse(localStorage.getItem(`knome_community_removed_${targetId}`) || '[]');
                const removedSet = new Set(removedMembersList.map(x => String(x).toLowerCase()));

                const creatorName = found?.createdBy || 'Community Creator';
                const defaultCreator = {
                    userId: found?.creatorUserId || 1,
                    fullName: creatorName,
                    employeeId: found?.creatorEmployeeId || 'MPO100',
                    designation: 'Community Admin',
                    memberType: 'Admin',
                    status: 'Approved',
                    profilePhotoUrl: found?.creatorAvatar || found?.avatar || null
                };
                const rawFallbackList = (localMembers.length > 0 ? localMembers : [defaultCreator])
                    .filter(m => {
                        const uid = String(m?.userId || m?.id || '').toLowerCase();
                        const empId = String(m?.employeeId || m?.empId || '').toLowerCase();
                        const name = String(m?.fullName || m?.name || '').toLowerCase();
                        return !(removedSet.has(uid) || (empId && removedSet.has(empId)) || (name && removedSet.has(name)));
                    })
                    .map(m => (m.memberType === 'Moderator' ? { ...m, memberType: 'Admin' } : m));
                let resolvedMembers = deduplicateMembers(rawFallbackList, contextUsers);

                // Check if current user explicitly joined, created the community, or is in resolved members
                const userJoinedList = JSON.parse(localStorage.getItem(`knome_joined_communities_${currentUser?.id || 'guest'}`) || '[]');
                
                const currentUidFallback = String(currentUser?.userId || currentUser?.id || '');
                const currentEmpIdFallback = String(currentUser?.employeeId || '').toUpperCase();
                const currentNameFallback = String(currentUser?.fullName || currentUser?.name || '').toLowerCase();
                const currentEmailFallback = String(currentUser?.email || '').toLowerCase();

                const isUserRemovedFallback = removedSet.has(currentUidFallback.toLowerCase()) || 
                                             (currentEmpIdFallback && removedSet.has(currentEmpIdFallback.toLowerCase())) || 
                                             (currentNameFallback && removedSet.has(currentNameFallback)) ||
                                             (currentEmailFallback && removedSet.has(currentEmailFallback));

                const isMemberInList = Boolean(currentUser && !isUserRemovedFallback && resolvedMembers.some(m => {
                    const mUid = String(m.userId || m.id || '');
                    const mEmpId = String(m.employeeId || m.empId || m.displayEmpId || '').toUpperCase();
                    const mName = String(m.fullName || m.name || m.displayName || '').toLowerCase();
                    return (currentUidFallback && mUid === currentUidFallback) || 
                           (currentEmpIdFallback && mEmpId === currentEmpIdFallback) || 
                           (currentNameFallback && mName === currentNameFallback);
                }));

                const isUserJoined = !isUserRemovedFallback && (
                    userJoinedList.some(c => String(c.id) === String(targetId) && (c.status === 'joined' || !c.status)) || 
                    (found?.createdBy && currentUser?.name && found.createdBy.toLowerCase().includes(currentUser.name.toLowerCase())) ||
                    isMemberInList
                );

                if (isUserRemovedFallback) {
                    const cleaned = userJoinedList.filter(c => String(c.id) !== String(targetId));
                    localStorage.setItem(`knome_joined_communities_${currentUser?.id || 'guest'}`, JSON.stringify(cleaned));
                }

                if (isUserJoined && currentUser && !isMemberInList) {
                    resolvedMembers.push({
                        userId: currentUser.userId || currentUser.id,
                        fullName: currentUser.fullName || currentUser.name,
                        employeeId: currentUser.employeeId || 'MPO100',
                        designation: currentUser.designation || currentUser.roleName || 'Software Developer',
                        memberType: 'Member',
                        status: 'Approved',
                        profilePhotoUrl: currentUser.avatar
                    });
                }

                resolvedMembers = deduplicateMembers(resolvedMembers, contextUsers);
                setMembersList(resolvedMembers);
                localStorage.setItem(savedMembersKey, JSON.stringify(resolvedMembers));

                // Load persisted join requests for the fallback/offline path excluding approved members
                const fallbackApprovedIds = new Set(resolvedMembers.filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status).map(m => String(m.userId || m.id).toLowerCase()));
                const fallbackApprovedEmps = new Set(resolvedMembers.filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status).map(m => String(m.employeeId || m.empId || '').toUpperCase()).filter(Boolean));
                const savedRequests = (JSON.parse(localStorage.getItem(`knome_join_requests_${targetId}`) || '[]')).filter(r => {
                    const rUid = String(r.userId || r.id || '').toLowerCase();
                    const rEmp = String(r.employeeId || '').toUpperCase();
                    return !(fallbackApprovedIds.has(rUid) || (rEmp && fallbackApprovedEmps.has(rEmp)));
                });
                setJoinRequests(savedRequests);

                // Load persistent subscribers and suspended members
                const savedSubs = JSON.parse(localStorage.getItem(`knome_community_subscribers_${targetId}`) || '[]');
                setSubscribersList(savedSubs);
                const savedSuspended1 = JSON.parse(localStorage.getItem(`knome_community_suspended_${targetId}`) || '[]');
                const savedSuspended2 = communityId ? JSON.parse(localStorage.getItem(`knome_community_suspended_${communityId}`) || '[]') : [];
                const savedSuspendedMapFallback = new Map();
                [...savedSuspended1, ...savedSuspended2].forEach(item => {
                    const key = String(item.userId || item.id || item.employeeId || item.empId || item.fullName || item.name || '');
                    if (key && !savedSuspendedMapFallback.has(key)) {
                        savedSuspendedMapFallback.set(key, item);
                    }
                });
                const savedSuspended = Array.from(savedSuspendedMapFallback.values());
                setSuspendedMembers(savedSuspended);

                const userSuspensionRecord = savedSuspended.find(s => {
                    const sUid = String(s.userId || s.id || '').toLowerCase();
                    const sEmpId = String(s.employeeId || s.empId || '').toUpperCase();
                    const sEmail = String(s.email || '').toLowerCase();
                    const sName = String(s.fullName || s.name || '').toLowerCase();
                    return (currentUidFallback && sUid === currentUidFallback.toLowerCase()) || 
                           (currentEmpIdFallback && sEmpId === currentEmpIdFallback) || 
                           (currentEmailFallback && sEmail === currentEmailFallback) ||
                           (currentNameFallback && sName && (sName === currentNameFallback || sName.includes(currentNameFallback) || currentNameFallback.includes(sName)));
                });
                const isUserSuspendedInComm = Boolean(userSuspensionRecord);
                const isCurrentUserSysAdmin = ['SYSADM'].includes(currentUser?.role) || ['System Administrator', 'System Admin'].includes(currentUser?.roleName);

                const myRequest = savedRequests.find(r => {
                    const rUid = String(r.userId || r.id || '');
                    const rEmp = String(r.employeeId || '').toUpperCase();
                    return (currentUidFallback && rUid === currentUidFallback) || (currentEmpIdFallback && rEmp && rEmp === currentEmpIdFallback);
                });
                const isLocalPendingFallback = userJoinedList.some(c => String(c.id) === String(targetId) && (c.status === 'pending' || c.status === 'requested'));
                const isDefaultOrgFallback = found ? ((found.type || '').toLowerCase().includes('default') || (found.type || '').toLowerCase().includes('org')) : false;

                let calcStatus;
                if (isUserSuspendedInComm) {
                    calcStatus = 'banned';
                    setCommunitySuspensionInfo(userSuspensionRecord || {
                        suspensionReason: 'Violation of community guidelines',
                        suspensionDuration: 'Indefinite'
                    });
                } else if (isUserJoined || isDefaultOrgFallback) {
                    calcStatus = 'joined';
                } else if (!isUserRemovedFallback && (Boolean(myRequest) || isLocalPendingFallback)) {
                    calcStatus = 'requested';
                } else {
                    calcStatus = 'none';
                }

                if (found) {
                    const localRulesFaq = JSON.parse(localStorage.getItem(`knome_community_rules_faq_${targetId}`) || 'null');
                    const resolvedRules = localRulesFaq?.rules 
                        ? parseRulesList(localRulesFaq.rules) 
                        : (found.rules ? parseRulesList(found.rules) : parseRulesList(null));
                    const resolvedFaq = localRulesFaq?.faq 
                        ? parseFaqList(localRulesFaq.faq) 
                        : (found.faq ? parseFaqList(found.faq) : parseFaqList(null));

                    setCommunity({
                        id: found.id,
                        name: found.name,
                        type: found.type || 'Public',
                        category: found.category || 'Technology',
                        membersCount: resolvedMembers.length,
                        adminContact: creatorName,
                        banner: found.banner || found.bannerUrl || found.thumbnail || found.avatar || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200&h=400',
                        thumbnail: found.thumbnail || found.avatar || found.thumbnailUrl || found.banner || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=200&h=200',
                        description: found.description || 'A community for collaboration.',
                        rules: resolvedRules,
                        faq: resolvedFaq
                    });
                    setMembershipStatus(calcStatus);
                } else {
                    const enterpriseChannel = ENTERPRISE_CHANNELS_SEED[String(targetId)];
                    const localRulesFaq = JSON.parse(localStorage.getItem(`knome_community_rules_faq_${targetId}`) || 'null');
                    if (enterpriseChannel) {
                        const imgs = getCommunityImages(enterpriseChannel.name, enterpriseChannel.category);
                        setCommunity({
                            id: targetId,
                            name: enterpriseChannel.name,
                            type: enterpriseChannel.type || 'Public',
                            category: enterpriseChannel.category,
                            membersCount: resolvedMembers.length,
                            adminContact: enterpriseChannel.adminContact,
                            banner: imgs.banner,
                            thumbnail: imgs.thumbnail,
                            description: enterpriseChannel.description,
                            rules: localRulesFaq?.rules ? parseRulesList(localRulesFaq.rules) : enterpriseChannel.rules,
                            faq: localRulesFaq?.faq ? parseFaqList(localRulesFaq.faq) : enterpriseChannel.faq
                        });
                        setMembershipStatus(calcStatus);
                    } else {
                        // Default seed community view
                        setCommunity({
                            id: targetId,
                            name: 'DotNet Developers Community',
                            type: 'Public',
                            category: 'Technology',
                            membersCount: resolvedMembers.length,
                            adminContact: 'Loveneesh Sharma (System Admin)',
                            banner: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200&h=400',
                            thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=200&h=200',
                            description: 'The DotNet Developers Community is a place for developers, students, and technology enthusiasts to collaborate.',
                            rules: localRulesFaq?.rules ? parseRulesList(localRulesFaq.rules) : ['1. Keep discussions technical and constructive.', '2. No unverified code snippets.', '3. Respect all members.'],
                            faq: localRulesFaq?.faq ? parseFaqList(localRulesFaq.faq) : [
                                { q: 'Who can post?', a: 'Any approved Community Member can share code and technical updates.' },
                                { q: 'How are posts moderated?', a: 'Community Admins review reports and pin top discussions.' }
                            ]
                        });
                        setMembershipStatus(calcStatus);
                    }
                }
            }

            const resolvedTargetId = communityId || community?.id || 101;

            // ─────────────────────────────────────────
            // Unified Persistent Files & Media Loading (All Communities)
            // ─────────────────────────────────────────
            const savedFilesKey = `knome_community_files_${resolvedTargetId}`;
            const localFiles = JSON.parse(localStorage.getItem(savedFilesKey) || '[]');

            // Prioritize backend files from server if available so all users see uploaded files!
            const hasServerFiles = apiFiles !== null && apiFiles !== undefined;
            const rawApiFiles = Array.isArray(apiFiles) ? apiFiles : (Array.isArray(apiFiles?.data) ? apiFiles.data : null);
            let combinedSource = localFiles;
            if (hasServerFiles && rawApiFiles !== null) {
                combinedSource = rawApiFiles.map(f => {
                    const ext = (f.extension || f.Extension || (f.name || f.Name || '').split('.').pop() || '').toLowerCase();
                    let cat = f.category || f.Category || 'Document';
                    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) cat = 'Audio';
                    return {
                        id: String(f.id || f.Id || Date.now()),
                        name: f.name || f.Name || 'Document',
                        category: cat,
                        extension: ext,
                        size: f.size || f.Size || '1 MB',
                        uploadedBy: f.uploadedBy || f.UploadedBy || 'Member',
                        uploadedByUserId: f.uploadedByUserId || f.UploadedByUserId || null,
                        uploadedAt: f.uploadedAt || f.UploadedAt || new Date().toISOString(),
                        url: f.url || f.Url || '#',
                        downloadCount: f.downloadCount || f.DownloadCount || 0
                    };
                });
            }

            // Rehydrate files: if IndexedDB has the blob, restore it; otherwise ensure valid PDF URL
            const hydratedFiles = await Promise.all(combinedSource.map(async (f) => {
                let currentUrl = f.url;
                if (f.hasIndexedDb) {
                    try {
                        const idbBlob = await getFileBlobFromIndexedDb(f.id);
                        if (idbBlob) currentUrl = idbBlob;
                    } catch (_) {}
                }
                if (currentUrl) {
                    currentUrl = resolveMediaUrl(currentUrl);
                }
                if (f.extension === 'pdf' && (!currentUrl || currentUrl === '#' || currentUrl.includes('w3.org') || currentUrl.includes('cOkw7zDtsOf') || f.name === 'System_Architecture_Overview.pdf')) {
                    currentUrl = SAMPLE_PDF_DATA_URL;
                }
                return { ...f, url: currentUrl };
            }));

            const isInitialDemoComm = String(resolvedTargetId) === '101' || String(resolvedTargetId) === '1';

            if (!isInitialDemoComm) {
                // User-created community (any ID other than 101/1): mock demo seed files must NEVER appear!
                const MOCK_SEED_NAMES = new Set([
                    'Project_Walkthrough_Demo.mp4',
                    'Database_Schema_Architecture.png',
                    'API_Integration_Guild_v2.docx',
                    'System_Architecture_Overview.pdf'
                ]);
                const cleanedFiles = hydratedFiles.filter(f => !MOCK_SEED_NAMES.has(f.name));
                setFilesList(cleanedFiles);
                if (cleanedFiles.length > 0) {
                    safeSetStorage(savedFilesKey, cleanedFiles);
                } else {
                    try { localStorage.removeItem(savedFilesKey); } catch (_) {}
                }
            } else {
                // ONLY root demo space (101/1) gets sample seed files if empty
                if (hydratedFiles.length > 0) {
                    setFilesList(hydratedFiles);
                    safeSetStorage(savedFilesKey, hydratedFiles);
                } else {
                    const seedFiles = [
                        { id: 1, name: 'System_Architecture_Overview.pdf', category: 'Document', extension: 'pdf', size: '3.4 MB', uploadedBy: 'Loveneesh Sharma', uploadedAt: '2026-07-25T10:30:00.000Z', url: SAMPLE_PDF_DATA_URL, downloadCount: 14 },
                        { id: 2, name: 'API_Integration_Guild_v2.docx', category: 'Document', extension: 'docx', size: '1.2 MB', uploadedBy: 'Vishendra Sharma', uploadedAt: '2026-07-26T14:15:00.000Z', url: 'https://filesamples.com/samples/document/docx/sample3.docx', downloadCount: 9 },
                        { id: 3, name: 'Database_Schema_Architecture.png', category: 'Image', extension: 'png', size: '850 KB', uploadedBy: 'Sourabh Sahu', uploadedAt: '2026-07-27T09:45:00.000Z', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200&h=800', downloadCount: 22 },
                        { id: 4, name: 'Project_Walkthrough_Demo.mp4', category: 'Video', extension: 'mp4', size: '14.8 MB', uploadedBy: 'Rishikesh Ugle', uploadedAt: '2026-07-28T08:00:00.000Z', url: '#', downloadCount: 7 }
                    ];
                    setFilesList(seedFiles);
                    safeSetStorage(savedFilesKey, seedFiles);
                }
            }

            // ─────────────────────────────────────────
            // Unified Persistent Community Feed Posts Loading
            // ─────────────────────────────────────────
            const savedPostsKey = `knome_community_posts_${resolvedTargetId}`;
            const localCommunityPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');

            let mergedPosts = [];
            if (postsData && Array.isArray(postsData) && postsData.length > 0) {
                mergedPosts = postsData.map(p => {
                    const cached = (() => {
                        try {
                            const raw = localStorage.getItem(`knome_post_interaction_${p.postId || p.id}`);
                            return raw ? JSON.parse(raw) : null;
                        } catch { return null; }
                    })();

                    const sLikes = Number(
                        p.engagementSummary?.reactionSummary?.totalCount ??
                        p.engagementSummary?.reactionSummary?.likeCount ??
                        p.reactionCount ??
                        p.likesCount ??
                        p.likes ??
                        0
                    );
                    const sComments = Number(
                        p.engagementSummary?.commentsCount ??
                        p.engagementSummary?.commentCount ??
                        p.commentsCount ??
                        p.comments ??
                        0
                    );

                    const finalLikes = cached && typeof cached.likeCount === 'number' ? Math.max(cached.likeCount, sLikes) : sLikes;
                    const finalComments = cached && typeof cached.commentCount === 'number' ? Math.max(cached.commentCount, sComments) : sComments;

                    // Detect sharedProfile from backend post if contentText has format
                    const profileMatch = (p.contentText || p.content || '').match(/Shared Profile:\s*"([^"]+)"/i);
                    const profileUrlMatch = (p.contentText || p.content || '').match(/(?:https?:\/\/[^\s]+)?\/profile\?id=([a-zA-Z0-9_-]+)/i);
                    const backendSharedProfile = (profileMatch || profileUrlMatch) ? {
                        id: profileUrlMatch ? profileUrlMatch[1] : null,
                        userId: profileUrlMatch ? profileUrlMatch[1] : null,
                        name: profileMatch ? profileMatch[1] : 'Colleague',
                        fullName: profileMatch ? profileMatch[1] : 'Colleague',
                        avatar: null,
                        designation: 'MPOnline Colleague',
                        department: 'MPOnline'
                    } : null;

                    const postMedia = normalizePostAttachments(p);

                    return {
                        id: p.postId,
                        postId: p.postId,
                        author: p.authorFullName || 'Employee',
                        role: p.authorDesignation || 'Member',
                        avatar: resolveMediaUrl(p.authorProfilePhotoUrl) || null,
                        time: new Date(p.createdDate || p.publishedDate || Date.now()).toLocaleString(),
                        content: p.contentText,
                        title: p.title,
                        attachments: postMedia.attachments,
                        images: postMedia.images,
                        attachmentUrls: postMedia.attachmentUrls,
                        sharedProfile: backendSharedProfile,
                        isProfileShare: !!backendSharedProfile,
                        likes: finalLikes,
                        likesCount: finalLikes,
                        comments: finalComments,
                        commentsCount: finalComments,
                        isPinned: p.isPinned
                    };
                });
            } else {
                mergedPosts = [];
            }

            if (localCommunityPosts.length > 0) {
                const existingIds = new Set(mergedPosts.map(p => String(p.id)));
                const formattedLocal = localCommunityPosts.map(p => {
                    const postMedia = normalizePostAttachments(p);
                    return {
                        id: p.id,
                        author: p.authorName || p.author || 'Member',
                        role: p.authorRole || p.role || 'Member',
                        avatar: p.authorAvatar || p.avatar || null,
                        time: p.timeAgo || p.time || 'Just now',
                        title: p.title,
                        content: p.content,
                        attachments: postMedia.attachments,
                        images: postMedia.images,
                        attachmentUrls: postMedia.attachmentUrls,
                        sharedCommunity: p.sharedCommunity || null,
                        sharedContent: p.sharedContent || null,
                        sharedArticle: p.sharedArticle || null,
                        sharedPodcast: p.sharedPodcast || null,
                        sharedVideo: p.sharedVideo || null,
                        sharedProfile: p.sharedProfile || null,
                        isProfileShare: Boolean(p.isProfileShare || p.type === 'profile_share' || p.sharedProfile),
                        sharedPostId: p.sharedPostId || null,
                        type: p.type || null,
                        likes: p.likes || 0,
                        comments: p.comments || 0,
                        isPinned: !!p.isPinned
                    };
                });
                const freshLocal = formattedLocal.filter(p => !existingIds.has(String(p.id)));
                mergedPosts = [...freshLocal, ...mergedPosts];
            }

            // Also merge any posts from knome_local_posts matching this community
            try {
                const globalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                const commSpecificGlobal = globalPosts.filter(p => 
                    String(p.sharedCommunity?.id) === String(resolvedTargetId) ||
                    String(p.communityId) === String(resolvedTargetId) ||
                    (Array.isArray(p.audienceCommunityIds) && p.audienceCommunityIds.map(String).includes(String(resolvedTargetId)))
                );
                if (commSpecificGlobal.length > 0) {
                    const existingIds = new Set(mergedPosts.map(p => String(p.id)));
                    const mappedGlobal = commSpecificGlobal
                        .filter(p => !existingIds.has(String(p.id)) && !existingIds.has(String(p.id).replace('comm_post_', '')))
                        .map(p => {
                            const postMedia = normalizePostAttachments(p);
                            return {
                                id: p.id,
                                author: p.authorName || p.author || 'Member',
                                role: p.authorRole || p.role || 'Member',
                                avatar: p.authorAvatar || p.avatar || null,
                                time: p.createdDate ? new Date(p.createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (p.timeAgo || 'Recently'),
                                title: p.title,
                                content: p.content,
                                attachments: postMedia.attachments,
                                images: postMedia.images,
                                attachmentUrls: postMedia.attachmentUrls,
                                sharedCommunity: p.sharedCommunity || null,
                                sharedContent: p.sharedContent || null,
                                sharedArticle: p.sharedArticle || null,
                                sharedPodcast: p.sharedPodcast || null,
                                sharedVideo: p.sharedVideo || null,
                                sharedProfile: p.sharedProfile || null,
                                isProfileShare: Boolean(p.isProfileShare || p.type === 'profile_share' || p.sharedProfile),
                                sharedPostId: p.sharedPostId || null,
                                type: p.type || null,
                                likes: p.likesCount || p.likes || 0,
                                comments: p.commentsCount || p.comments || 0,
                                isPinned: false
                            };
                        });
                    mergedPosts = [...mappedGlobal, ...mergedPosts];
                }
            } catch (_) {}

            // Clean dynamic community welcome post in the name of the active community
            const activeCommName = commData?.name || community?.name || (customList.find(c => String(c.id) === String(resolvedTargetId))?.name) || 'Company Community';
            const activeCommAvatar = commData?.thumbnailUrl || commData?.bannerUrl || community?.thumbnail || community?.banner || (customList.find(c => String(c.id) === String(resolvedTargetId))?.thumbnail) || null;

            // 1. Sanitize any old post that was hardcoded with "Loveneesh Sharma" as a dummy welcome
            mergedPosts = mergedPosts.map(p => {
                if (p.author === 'Loveneesh Sharma' && (p.id === 1 || String(p.id).startsWith('welcome_') || (p.content || '').includes('Welcome to the community'))) {
                    return {
                        ...p,
                        isWelcome: true,
                        author: activeCommName,
                        role: 'Official Community Space',
                        avatar: activeCommAvatar,
                        content: `Welcome to ${activeCommName}! Please feel free to introduce yourself, collaborate with fellow members, and share any technical questions, discussions, or resources here.`,
                        isPinned: true
                    };
                }
                if (String(p.id).startsWith('welcome_') || p.role === 'Official Community Space') {
                    return {
                        ...p,
                        isWelcome: true
                    };
                }
                return p;
            });

            // 2. If no posts exist at all, seed with the official welcome post under the community's own name!
            if (mergedPosts.length === 0) {
                const commWelcomePost = {
                    id: `welcome_${resolvedTargetId}`,
                    postId: `welcome_${resolvedTargetId}`,
                    isWelcome: true,
                    author: activeCommName,
                    role: 'Official Community Space',
                    avatar: activeCommAvatar,
                    time: 'Just now',
                    content: `Welcome to ${activeCommName}! Please feel free to introduce yourself, collaborate with fellow members, and share any technical questions, discussions, or resources here.`,
                    likes: 0,
                    likesCount: 0,
                    comments: 0,
                    commentsCount: 0,
                    shares: 0,
                    sharesCount: 0,
                    isPinned: true
                };
                mergedPosts = [commWelcomePost];
            }

            // Sync sanitized posts into community storage so stale Loveneesh post is wiped
            safeSetStorage(savedPostsKey, mergedPosts);

            setPosts(mergedPosts);
        } catch (error) {
            console.error('Failed to load community details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        const handleMembersUpdated = (e) => {
            const targetId = e?.detail?.communityId || communityId || community?.id || 101;
            if (e?.detail?.communityId && communityId && String(e.detail.communityId) !== String(communityId)) {
                return;
            }

            // Immediately check if current user was removed
            const removedList = JSON.parse(localStorage.getItem(`knome_community_removed_${targetId}`) || '[]');
            const myUid = String(currentUser?.userId || currentUser?.id || '').toLowerCase();
            const myEmpId = String(currentUser?.employeeId || '').toUpperCase();
            const myName = String(currentUser?.fullName || currentUser?.name || '').toLowerCase();
            const isRemoved = removedList.some(r => {
                const s = String(r).toLowerCase();
                return (myUid && s === myUid) || (myEmpId && s === myEmpId.toLowerCase()) || (myName && s === myName);
            });
            if (isRemoved) {
                setMembershipStatus('none');
            }

            const localMembers = JSON.parse(localStorage.getItem(`knome_community_members_${targetId}`) || '[]');
            if (localMembers && localMembers.length > 0) {
                const deduped = deduplicateMembers(localMembers, contextUsers);
                setMembersList(deduped);
                setCommunity(prev => prev ? { ...prev, membersCount: deduped.length } : prev);
            }
            const savedSubs = JSON.parse(localStorage.getItem(`knome_community_subscribers_${targetId}`) || '[]');
            setSubscribersList(savedSubs);
            const savedSuspended = JSON.parse(localStorage.getItem(`knome_community_suspended_${targetId}`) || '[]');
            setSuspendedMembers(savedSuspended);

            const userSuspRecord = (savedSuspended || []).find(s => {
                const sUid = String(s.userId || s.id || '').toLowerCase();
                const sEmpId = String(s.employeeId || s.empId || '').toUpperCase();
                const sEmail = String(s.email || '').toLowerCase();
                const sName = String(s.fullName || s.name || '').toLowerCase();
                return (myUid && sUid === myUid) || 
                       (myEmpId && sEmpId === myEmpId) || 
                       (currentUser?.email && sEmail === currentUser.email.toLowerCase()) ||
                       (myName && sName && (sName === myName || sName.includes(myName) || myName.includes(sName)));
            });
            if (userSuspRecord) {
                setMembershipStatus('banned');
                setCommunitySuspensionInfo(userSuspRecord);
            } else if (membershipStatus === 'banned') {
                loadData();
            }
            // Also refresh join requests (excluding approved members) and files
            const currentApprovedIds = new Set((localMembers || []).filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status).map(m => String(m.userId || m.id).toLowerCase()));
            const currentApprovedEmps = new Set((localMembers || []).filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status).map(m => String(m.employeeId || m.empId || '').toUpperCase()).filter(Boolean));
            const rawA = JSON.parse(localStorage.getItem(`knome_join_requests_${targetId}`) || '[]');
            const rawB = communityId ? JSON.parse(localStorage.getItem(`knome_join_requests_${communityId}`) || '[]') : [];
            const combinedReqs = [...rawA];
            rawB.forEach(rb => {
                const rbUid = String(rb.userId || rb.id || '').toLowerCase();
                if (rbUid && !combinedReqs.some(ra => String(ra.userId || ra.id || '').toLowerCase() === rbUid)) {
                    combinedReqs.push(rb);
                }
            });
            const savedRequests = combinedReqs.filter(r => {
                const rUid = String(r.userId || r.id || '').toLowerCase();
                const rEmp = String(r.employeeId || '').toUpperCase();
                return !(currentApprovedIds.has(rUid) || (rEmp && currentApprovedEmps.has(rEmp)));
            });
            setJoinRequests(savedRequests);

            if (targetId && !isNaN(targetId) && Number(targetId) > 0 && Number(targetId) < 1000000000) {
                communitiesApi.getMembers(targetId, 'Pending', 1, 100, { noCache: true }).then(res => {
                    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
                    if (list.length > 0) {
                        setJoinRequests(prev => {
                            const updated = [...prev];
                            list.forEach(pm => {
                                const pmUid = String(pm.userId || pm.id || '').toLowerCase();
                                const pmEmp = String(pm.employeeId || pm.empId || '').toUpperCase();
                                if (!currentApprovedIds.has(pmUid) && !(pmEmp && currentApprovedEmps.has(pmEmp))) {
                                    const idx = updated.findIndex(r => String(r.userId || r.id || '').toLowerCase() === pmUid);
                                    const obj = {
                                        id: pm.userId || pm.id,
                                        userId: pm.userId || pm.id,
                                        name: pm.fullName || pm.name || 'Employee',
                                        fullName: pm.fullName || pm.name || 'Employee',
                                        employeeId: pm.employeeId || 'MPO100',
                                        role: pm.designation || 'Member',
                                        designation: pm.designation || 'Member',
                                        department: pm.departmentName || pm.department || 'MPOnline',
                                        avatar: pm.profilePhotoUrl || null,
                                        requestedAt: pm.requestedDate || new Date().toISOString(),
                                        status: 'Pending'
                                    };
                                    if (idx >= 0) updated[idx] = { ...updated[idx], ...obj };
                                    else updated.push(obj);
                                }
                            });
                            localStorage.setItem(`knome_join_requests_${targetId}`, JSON.stringify(updated));
                            return updated;
                        });
                    }
                }).catch(() => {});
            }

            const savedFiles = JSON.parse(localStorage.getItem(`knome_community_files_${targetId}`) || '[]');
            const isInitialDemoCommTarget = String(targetId) === '101' || String(targetId) === '1';
            if (!isInitialDemoCommTarget) {
                const MOCK_SEED_NAMES = new Set([
                    'Project_Walkthrough_Demo.mp4',
                    'Database_Schema_Architecture.png',
                    'API_Integration_Guild_v2.docx',
                    'System_Architecture_Overview.pdf'
                ]);
                const cleaned = savedFiles.filter(f => !MOCK_SEED_NAMES.has(f.name));
                setFilesList(cleaned);
            } else if (savedFiles.length > 0) {
                setFilesList(savedFiles);
            }
        };

        const handleFeedOrPostsUpdated = (e) => {
            const targetId = communityId || community?.id || 101;
            if (e?.key && e.key !== `knome_community_posts_${targetId}` && !e.key.includes('community_posts')) {
                return;
            }
            if (e?.detail?.communityId && String(e.detail.communityId) !== String(targetId)) {
                return;
            }
            // Re-read feed posts for targetId
            const savedPostsKey = `knome_community_posts_${targetId}`;
            const localCommunityPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');
            if (localCommunityPosts.length > 0) {
                setPosts(prev => {
                    const existingIds = new Set(prev.map(p => String(p.id)));
                    const formattedLocal = localCommunityPosts.map(p => {
                        const postMedia = normalizePostAttachments(p);
                        return {
                            id: p.id,
                            author: p.authorName || p.author || 'Member',
                            role: p.authorRole || p.role || 'Member',
                            avatar: p.authorAvatar || p.avatar || null,
                            time: p.timeAgo || p.time || 'Just now',
                            title: p.title,
                            content: p.content,
                            attachments: postMedia.attachments,
                            images: postMedia.images,
                            attachmentUrls: postMedia.attachmentUrls,
                            sharedCommunity: p.sharedCommunity || null,
                            sharedContent: p.sharedContent || null,
                            sharedArticle: p.sharedArticle || null,
                            sharedPodcast: p.sharedPodcast || null,
                            sharedVideo: p.sharedVideo || null,
                            sharedProfile: p.sharedProfile || null,
                            isProfileShare: Boolean(p.isProfileShare || p.type === 'profile_share' || p.sharedProfile),
                            sharedPostId: p.sharedPostId || null,
                            type: p.type || null,
                            likes: p.likes || 0,
                            comments: p.comments || 0,
                            isPinned: !!p.isPinned
                        };
                    });
                    const freshLocal = formattedLocal.filter(p => !existingIds.has(String(p.id)));
                    return [...freshLocal, ...prev];
                });
            }
        };

        window.addEventListener('community-members-updated', handleMembersUpdated);
        window.addEventListener('community-joined-change', handleMembersUpdated);
        window.addEventListener('community-suspended-change', handleMembersUpdated);
        window.addEventListener('community-join-requests-updated', handleMembersUpdated);
        window.addEventListener('community-posts-updated', handleFeedOrPostsUpdated);
        window.addEventListener('community-post-created', handleFeedOrPostsUpdated);
        window.addEventListener('post-created', handleFeedOrPostsUpdated);
        window.addEventListener('community-files-updated', handleMembersUpdated);
        window.addEventListener('storage', handleMembersUpdated);
        window.addEventListener('storage', handleFeedOrPostsUpdated);

        return () => {
            window.removeEventListener('community-members-updated', handleMembersUpdated);
            window.removeEventListener('community-joined-change', handleMembersUpdated);
            window.removeEventListener('community-suspended-change', handleMembersUpdated);
            window.removeEventListener('community-join-requests-updated', handleMembersUpdated);
            window.removeEventListener('community-posts-updated', handleFeedOrPostsUpdated);
            window.removeEventListener('community-post-created', handleFeedOrPostsUpdated);
            window.removeEventListener('post-created', handleFeedOrPostsUpdated);
            window.removeEventListener('community-files-updated', handleMembersUpdated);
            window.removeEventListener('storage', handleMembersUpdated);
            window.removeEventListener('storage', handleFeedOrPostsUpdated);
        };
    }, [communityId, currentUser?.id, currentUser?.userId]);

    // Create New Post inside Community (Only for Members - FR-CM-06)
    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!postText.trim()) return;
        
        const foundKeyword = checkRestrictedContent(postText.trim());
        if (foundKeyword) {
            showToast(`Security Alert: Please don't use this word - "${foundKeyword}". It is restricted and your post cannot be published.`, 'warning');
            return;
        }

        const targetId = communityId || community?.id || 101;
        const newPostItem = {
            id: Date.now(),
            author: currentUser?.name || currentUser?.fullName || 'Member',
            role: currentUser?.roleName || 'Member',
            avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
            time: 'Just now',
            content: postText.trim(),
            attachments: [],
            likes: 0,
            comments: 0,
            isPinned: false
        };

        const numId = Number(targetId);
        if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
            try {
                const res = await communitiesApi.createPost(targetId, { 
                    contentText: postText.trim(), 
                    attachmentUrls: [], 
                    attachmentTypes: [] 
                });
                const p = res?.data || res;
                if (p && (p.postId || p.id)) {
                    newPostItem.id = p.postId || p.id;
                    if (p.authorFullName) newPostItem.author = p.authorFullName;
                    if (p.authorDesignation) newPostItem.role = p.authorDesignation;
                }
            } catch (error) {
                console.warn('Backend createPost warning, saving to local persistent feed:', error);
            }
        }

        // Save to persistent storage for this community
        const savedPostsKey = `knome_community_posts_${targetId}`;
        const existingPosts = JSON.parse(localStorage.getItem(savedPostsKey) || '[]');
        safeSetStorage(savedPostsKey, [newPostItem, ...existingPosts]);

        // Also save to global feed knome_local_posts
        try {
            const globalLocalPosts = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
            const feedItem = {
                id: `comm_post_${newPostItem.id}`,
                userId: currentUser?.userId || currentUser?.id || 1,
                authorName: newPostItem.author,
                authorAvatar: newPostItem.avatar,
                authorRole: newPostItem.role,
                content: newPostItem.content,
                status: 'Published',
                createdDate: new Date().toISOString(),
                likesCount: 0,
                commentsCount: 0,
                attachments: [],
                sharedCommunity: { id: targetId, name: community?.name || 'Community' },
                sharedCommunityName: community?.name || 'Community'
            };
            safeSetStorage('knome_local_posts', [feedItem, ...globalLocalPosts]);
        } catch (_) {}

        setPosts(prev => [newPostItem, ...prev]);
        setPostText('');
        showToast('Post shared to community discussions!', 'success');

        if (awardRuleKarma && (currentUser?.userId || currentUser?.id)) {
            const targetUid = currentUser?.userId || currentUser?.id;
            const pts = awardRuleKarma(targetUid, 'POST', { customTitle: `Posted in ${community?.name || 'Community'}` }) || 2;
            showToast(`⚡ +${pts} Karma Points earned for publishing a Post!`, 'info');
            if (refreshKarma) {
                setTimeout(() => refreshKarma(targetUid), 400);
            }
        }

        window.dispatchEvent(new CustomEvent('post-created'));
    };

    // ─────────────────────────────────────────
    // Real-Time Interaction Handlers (Like, Comment, Share)
    // ─────────────────────────────────────────
    const handleToggleLike = async (postId) => {
        const pid = String(postId);
        const isCurrentlyLiked = !!likedPostsMap[pid];
        const nextLiked = !isCurrentlyLiked;

        setLikedPostsMap(prev => {
            const updated = { ...prev, [pid]: nextLiked };
            safeSetStorage(`knome_community_likes_${currentUser?.id || 'guest'}`, updated);
            return updated;
        });

        let newLikesCount = 0;
        setPosts(prev => prev.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                const cur = Number(p.likes || p.likesCount || 0);
                const next = nextLiked ? cur + 1 : Math.max(0, cur - 1);
                newLikesCount = next;
                return { ...p, likes: next, likesCount: next };
            }
            return p;
        }));

        safeSetStorage(`knome_post_interaction_${pid}`, { liked: nextLiked, likeCount: newLikesCount });

        const targetId = communityId || community?.id || 101;
        const savedKey = `knome_community_posts_${targetId}`;
        const localPosts = JSON.parse(localStorage.getItem(savedKey) || '[]');
        const updatedLocal = localPosts.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                return { ...p, likes: newLikesCount, likesCount: newLikesCount };
            }
            return p;
        });
        safeSetStorage(savedKey, updatedLocal);

        const numId = Number(pid);
        if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
            try {
                await interactionsApi.toggleReaction('Post', numId, 'like');
            } catch (e) {
                console.warn('Backend like API note:', e);
            }
        }

        window.dispatchEvent(new CustomEvent('knome:reaction-updated', {
            detail: { contentId: pid, contentType: 'Post', totalLikes: newLikesCount }
        }));
        window.dispatchEvent(new CustomEvent('post-interaction-updated', {
            detail: { postId: pid, likes: newLikesCount }
        }));
    };

    const handleToggleComments = async (postId) => {
        const pid = String(postId);
        if (activeCommentPostId === pid) {
            setActiveCommentPostId(null);
            return;
        }
        setActiveCommentPostId(pid);

        if (!communityCommentsMap[pid]) {
            setIsLoadingComments(true);
            try {
                const localSaved = JSON.parse(localStorage.getItem(`knome_community_comments_${pid}`) || '[]');
                let apiComments = [];
                const numId = Number(pid);
                if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
                    try {
                        const res = await interactionsApi.getComments('Post', numId);
                        const rawList = res?.data || res || [];
                        if (Array.isArray(rawList)) {
                            apiComments = rawList.map(c => ({
                                id: c.commentId || c.id,
                                author: c.authorFullName || c.author || 'Member',
                                role: c.authorDesignation || 'Member',
                                avatar: resolveMediaUrl(c.authorProfilePhotoUrl) || null,
                                text: c.commentText || c.text,
                                time: c.createdDate ? formatRelativeTime(c.createdDate) : 'Recently',
                                createdDate: c.createdDate || new Date().toISOString()
                            }));
                        }
                    } catch (_) {}
                }
                const combined = [...localSaved, ...apiComments.filter(a => !localSaved.some(l => String(l.id) === String(a.id)))];
                setCommunityCommentsMap(prev => ({ ...prev, [pid]: combined }));
            } catch (_) {
                setCommunityCommentsMap(prev => ({ ...prev, [pid]: [] }));
            } finally {
                setIsLoadingComments(false);
            }
        }
    };

    const handleAddCommunityComment = async (postId) => {
        const pid = String(postId);
        const text = (commentInputMap[pid] || '').trim();
        if (!text) return;

        const restricted = checkRestrictedContent(text);
        if (restricted) {
            showToast(`Security Alert: "${restricted}" is restricted. Remove it to comment.`, 'warning');
            return;
        }

        const newComment = {
            id: Date.now(),
            author: currentUser?.name || currentUser?.fullName || 'Member',
            role: currentUser?.roleName || 'Member',
            avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
            text: text,
            time: 'Just now',
            createdDate: new Date().toISOString()
        };

        const updatedComments = [...(communityCommentsMap[pid] || []), newComment];
        setCommunityCommentsMap(prev => ({ ...prev, [pid]: updatedComments }));
        setCommentInputMap(prev => ({ ...prev, [pid]: '' }));

        let newCommentsCount = updatedComments.length;
        setPosts(prev => prev.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                const cur = Number(p.comments || p.commentsCount || 0);
                const next = cur + 1;
                newCommentsCount = next;
                return { ...p, comments: next, commentsCount: next };
            }
            return p;
        }));

        safeSetStorage(`knome_community_comments_${pid}`, updatedComments);

        const targetId = communityId || community?.id || 101;
        const savedKey = `knome_community_posts_${targetId}`;
        const localPosts = JSON.parse(localStorage.getItem(savedKey) || '[]');
        const updatedLocal = localPosts.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                return { ...p, comments: newCommentsCount, commentsCount: newCommentsCount };
            }
            return p;
        });
        safeSetStorage(savedKey, updatedLocal);

        const numId = Number(pid);
        if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
            try {
                await interactionsApi.addComment('Post', numId, text);
            } catch (e) {
                console.warn('Backend comment API note:', e);
            }
        }

        window.dispatchEvent(new CustomEvent('knome:comment-updated', {
            detail: { contentId: pid, contentType: 'Post', commentsCount: newCommentsCount }
        }));

        showToast('Comment added successfully!', 'success');
    };

    const handleSharePost = (post) => {
        const pid = String(post.id || post.postId);
        const targetId = communityId || community?.id || 101;

        let newSharesCount = 0;
        setPosts(prev => prev.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                const cur = Number(p.shares || p.sharesCount || 0);
                const next = cur + 1;
                newSharesCount = next;
                return { ...p, shares: next, sharesCount: next };
            }
            return p;
        }));

        const savedKey = `knome_community_posts_${targetId}`;
        const localPosts = JSON.parse(localStorage.getItem(savedKey) || '[]');
        const updatedLocal = localPosts.map(p => {
            if (String(p.id) === pid || String(p.postId) === pid) {
                return { ...p, shares: newSharesCount, sharesCount: newSharesCount };
            }
            return p;
        });
        safeSetStorage(savedKey, updatedLocal);

        const shareUrl = `${window.location.origin}/community/view?id=${targetId}&postId=${pid}`;
        try {
            navigator.clipboard.writeText(shareUrl);
            showToast('🔗 Community post link copied to clipboard! Share it with your team.', 'success');
        } catch (_) {
            showToast('Post link: ' + shareUrl, 'info');
        }

        setSharingPost(post);
        setIsPostShareModalOpen(true);

        const numId = Number(pid);
        if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
            interactionsApi.shareContent('Post', numId, 'Community', targetId).catch(() => {});
        }

        window.dispatchEvent(new CustomEvent('knome:share-updated', {
            detail: { contentId: pid, contentType: 'Post', sharesCount: newSharesCount }
        }));
    };

    const handleOpenPost = (post) => {
        const target = resolveSharedTarget(post);
        if (target && target.url) {
            navigate(target.url);
            return;
        }
        const postUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/posts\?id=(\d+)/i);
        const targetId = postUrlMatch ? postUrlMatch[1] : (post.sharedPostId || post.postId || post.id);
        const numId = Number(targetId);
        if (!isNaN(numId) && numId > 0 && numId < 2147483647) {
            navigate(`/posts?id=${targetId}`);
        } else {
            handleToggleComments(post.id);
            showToast('Viewing community post discussion & interactions below!', 'info');
        }
    };



    const handleToggleRole = async (memberId, currentRole) => {
        const targetId = communityId || community?.id || 101;
        const targetMember = membersList.find(m => String(m.userId || m.id) === String(memberId));
        const memberName = targetMember?.fullName || targetMember?.name || 'Member';
        const isCurrentlyAdmin = currentRole === 'Admin' || currentRole === 'Moderator' || currentRole === 'Community Administrator';

        if (isCurrentlyAdmin) {
            try {
                await communitiesApi.removeAdmin(targetId, memberId);
            } catch (err) {
                const msg = err?.response?.data?.message || err?.message || 'Cannot remove sole Community Admin.';
                showToast(msg, 'warning');
                return;
            }
        } else {
            try {
                await communitiesApi.addAdmin(targetId, memberId);
            } catch (err) { /* best effort */ }
        }

        const newRole = isCurrentlyAdmin ? 'Member' : 'Admin';
        setMembersList(prev => {
            const updated = prev.map(m => {
                if (String(m.userId || m.id) === String(memberId)) {
                    return { ...m, memberType: newRole };
                }
                return m;
            });
            localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
            localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            return updated;
        });

        if (newRole === 'Admin') {
            setCommunity(prev => ({
                ...prev,
                adminContact: memberName
            }));
        }

        showToast(`Member role updated to ${newRole === 'Admin' ? 'Community Admin' : 'Community Member'} for ${memberName}.`, 'success');
    };

    const getAdminCount = () => {
        return membersList.filter(m => 
            m.memberType === 'Admin' || 
            m.memberType === 'Moderator' || 
            m.memberType === 'Community Administrator' ||
            m.memberType === 'Community Admin'
        ).length;
    };

    const handleInitiateRemoveMember = (member) => {
        const isCommAdmin = member.memberType === 'Admin' || member.memberType === 'Moderator' || member.memberType === 'Community Administrator' || member.memberType === 'Community Admin';
        const adminsCount = getAdminCount();

        if (isCommAdmin && adminsCount <= 1) {
            setAdminProtectionWarning({
                title: 'Cannot Remove Community Admin',
                message: `"${member.fullName || member.name || 'This user'}" is currently the only Community Admin for this community. A community must always have at least one active Community Admin.\n\nPlease assign another member as Community Admin using "Make Admin" before removing this admin.`
            });
            return;
        }

        setRemoveModalMember(member);
    };

    const handleConfirmRemoveMember = async () => {
        if (!removeModalMember) return;
        const member = removeModalMember;
        const memberId = member.userId || member.id;
        const memberName = member.fullName || member.name || 'Member';
        const isTargetAdmin = member.memberType === 'Admin' || member.memberType === 'Moderator' || member.memberType === 'Community Administrator' || member.memberType === 'Community Admin';
        const targetId = communityId || community?.id || 101;

        // 1. Call Backend API to remove member from SQL database
        const numId = Number(targetId);
        const numMemberId = Number(memberId);
        if (!isNaN(numId) && numId > 0 && numId < 1000000000 && !isNaN(numMemberId) && numMemberId > 0) {
            try {
                await communitiesApi.removeMember(numId, numMemberId);
            } catch (apiErr) {
                console.warn('Backend remove member API warning:', apiErr);
                if (isTargetAdmin) {
                    try {
                        await communitiesApi.removeAdmin(numId, numMemberId).catch(() => null);
                    } catch (e) {}
                }
            }
        } else if (isTargetAdmin) {
            try {
                await communitiesApi.removeAdmin(targetId, memberId).catch(() => null);
            } catch (err) {
                console.warn('Remove admin API warning:', err);
            }
        }

        // 2. Track tombstone in localStorage so refresh never restores removed member
        const removedKey = `knome_community_removed_${targetId}`;
        const currentRemoved = JSON.parse(localStorage.getItem(removedKey) || '[]');
        const memberEmpId = (member.employeeId || member.empId || '').toUpperCase();
        const memberEmail = (member.email || '').toLowerCase();
        const memberFullName = (member.fullName || member.name || '').toLowerCase();
        const updatedRemoved = Array.from(new Set([
            ...currentRemoved,
            String(memberId),
            ...(member.userId ? [String(member.userId)] : []),
            ...(memberEmpId ? [memberEmpId] : []),
            ...(memberEmail ? [memberEmail] : []),
            ...(memberFullName ? [memberFullName] : [])
        ]));
        localStorage.setItem(removedKey, JSON.stringify(updatedRemoved));

        // 3. Invalidate joined communities in localStorage for the removed member
        const keysToClean = [
            `knome_joined_communities_${memberId}`,
            member.userId ? `knome_joined_communities_${member.userId}` : null,
            memberEmpId ? `knome_joined_communities_${memberEmpId}` : null
        ].filter(Boolean);
        keysToClean.forEach(k => {
            try {
                const list = JSON.parse(localStorage.getItem(k) || '[]');
                const cleaned = list.filter(c => String(c.id) !== String(targetId));
                localStorage.setItem(k, JSON.stringify(cleaned));
            } catch (_) {}
        });

        // 4. Remove from community members local state & cache
        setMembersList(prev => {
            const updated = prev.filter(m => {
                const mUid = String(m.userId || m.id || '');
                const mEmp = String(m.employeeId || m.empId || '').toUpperCase();
                const mName = String(m.fullName || m.name || '').toLowerCase();
                return !(mUid === String(memberId) || (memberEmpId && mEmp === memberEmpId) || (memberFullName && mName === memberFullName));
            });
            localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
            localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
            return updated;
        });

        // 5. If the removed member is the currently logged in user on this client:
        const isCurrentRemovingSelf = (String(currentUser?.id || currentUser?.userId) === String(memberId)) ||
                                      (memberEmpId && String(currentUser?.employeeId || '').toUpperCase() === memberEmpId);
        if (isCurrentRemovingSelf) {
            setMembershipStatus('none');
            const selfUserKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
            const selfJoined = JSON.parse(localStorage.getItem(selfUserKey) || '[]');
            localStorage.setItem(selfUserKey, JSON.stringify(selfJoined.filter(c => String(c.id) !== String(targetId))));
        }

        // 6. Update community object members count & dispatch events
        setCommunity(prev => ({ ...prev, membersCount: Math.max(1, (prev.membersCount || 1) - 1) }));
        window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
        window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId, removedMemberId: memberId } }));
        window.dispatchEvent(new Event('storage'));

        showToast(`${memberName} has been removed from this community.`, 'info');
        setRemoveModalMember(null);
    };

    const handleRemoveMemberByAdmin = async (memberId, memberName) => {
        const member = membersList.find(m => String(m.userId || m.id) === String(memberId)) || { userId: memberId, fullName: memberName };
        handleInitiateRemoveMember(member);
    };

    const handleJoinAction = async () => {
        const isPrivate = (community?.type || '').toLowerCase() === 'private';
        const newStatus = isPrivate ? 'requested' : 'joined';
        const targetId = Number(community?.id || commData?.communityId || communityId || 101);

        // Clear any previous removed tombstone for current user
        try {
            const removedKey = `knome_community_removed_${targetId}`;
            const currentRemoved = JSON.parse(localStorage.getItem(removedKey) || '[]');
            const uidStr = String(currentUser?.userId || currentUser?.id || '').toLowerCase();
            const empIdStr = String(currentUser?.employeeId || '').toUpperCase();
            const nameStr = String(currentUser?.fullName || currentUser?.name || '').toLowerCase();
            const cleanedRemoved = currentRemoved.filter(x => {
                const s = String(x).toLowerCase();
                return !(s === uidStr || (empIdStr && s === empIdStr.toLowerCase()) || (nameStr && s === nameStr));
            });
            localStorage.setItem(removedKey, JSON.stringify(cleanedRemoved));
        } catch (_) {}

        try {
            await communitiesApi.join(targetId).catch(() => null);
        } catch (err) {
            console.warn('Backend join API warning:', err);
        }

        if (newStatus === 'joined') {
            setMembershipStatus('joined');

            // FR-CM-09: Persist join to localStorage so it survives page refresh
            const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
            const existingJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
            if (!existingJoined.some(c => String(c.id) === String(targetId))) {
                existingJoined.push({ id: targetId, name: community?.name, status: 'joined', joinedAt: new Date().toISOString() });
                localStorage.setItem(userKey, JSON.stringify(existingJoined));
            }

            setMembersList(prev => {
                const exists = prev.some(m => String(m.userId || m.id) === String(currentUser?.id));
                const updated = exists ? prev : [
                    ...prev,
                    {
                        userId: currentUser?.id || 99,
                        fullName: currentUser?.name || 'Current Employee',
                        employeeId: currentUser?.employeeId || 'MPO100',
                        designation: currentUser?.roleName || 'Member',
                        memberType: 'Member',
                        status: 'Approved',
                        profilePhotoUrl: currentUser?.avatar
                    }
                ];
                localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
                localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
                window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
                window.dispatchEvent(new CustomEvent('community-joined-change'));
                return updated;
            });
            setCommunity(prev => ({ ...prev, membersCount: (prev.membersCount || 0) + 1 }));
            showToast(`🎉 You have successfully joined "${community?.name}" as a Member!`);
        } else {
            // Private community — save request to localStorage so Admin can see it
            setMembershipStatus('requested');
            const newRequest = {
                id: currentUser?.userId || currentUser?.id || Date.now(),
                userId: currentUser?.userId || currentUser?.id || Date.now(),
                name: currentUser?.fullName || currentUser?.name || 'Current Employee',
                fullName: currentUser?.fullName || currentUser?.name || 'Current Employee',
                employeeId: currentUser?.employeeId || 'MPO100',
                role: currentUser?.roleName || 'Employee',
                designation: currentUser?.designation || currentUser?.roleName || 'Employee',
                department: currentUser?.departmentName || currentUser?.department || 'Engineering',
                avatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                requestedAt: new Date().toISOString(),
                status: 'Pending'
            };

            setJoinRequests(prev => {
                const updated = [newRequest, ...prev.filter(r => String(r.userId || r.id) !== String(newRequest.userId))];
                localStorage.setItem(`knome_join_requests_${targetId}`, JSON.stringify(updated));
                if (String(communityId) !== String(targetId)) {
                    localStorage.setItem(`knome_join_requests_${communityId}`, JSON.stringify(updated));
                }
                return updated;
            });

            // Also track in user's joined list as pending so Communities card & refresh shows "Requested"
            const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
            const existingJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
            const updatedJoined = existingJoined.filter(c => String(c.id) !== String(targetId));
            updatedJoined.push({
                id: targetId,
                name: community?.name,
                category: community?.category,
                type: 'Private',
                role: 'Member',
                status: 'pending',
                requestedAt: new Date().toISOString()
            });
            localStorage.setItem(userKey, JSON.stringify(updatedJoined));
            window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('community-join-requests-updated', { detail: { communityId: targetId } }));

            // Store a notification for community creator and admins
            try {
                const creatorId = community?.creatorUserId || community?.creatorId || 1;
                const adminNotif = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    targetUserId: creatorId, // targets creator's user ID directly
                    targetCreatorId: creatorId,
                    communityId: targetId,
                    type: 'join_request',
                    category: 'Community',
                    text: `🔔 ${currentUser?.name || currentUser?.fullName || 'An employee'} requested to join your private community "${community?.name}". Pending your approval.`,
                    senderName: currentUser?.name || currentUser?.fullName || 'Employee',
                    senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    unread: true,
                    icon: 'person_add',
                    color: 'text-indigo-400',
                    bg: 'bg-indigo-500/10',
                    communityName: community?.name,
                    actionLink: `/community/view?id=${targetId}`,
                };
                const existing = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([adminNotif, ...existing]));
                window.dispatchEvent(new CustomEvent('community-invite-sent', {
                    detail: { invitedUserIds: [creatorId], communityName: community?.name, senderName: currentUser?.name, senderUserId: currentUser?.userId || currentUser?.id }
                }));
            } catch (e) { /* ignore */ }

            showToast(`📨 Join request sent to "${community?.name}" creator & admin. You'll be notified once approved.`, 'info');
        }
    };

    const handleLeaveAction = async () => {
        const isDefaultOrg = community?.type?.toLowerCase().includes('default') || community?.type?.toLowerCase().includes('org');
        if (isDefaultOrg) {
            showToast('Employees cannot leave an Org community (FR-CM-04).', 'warning');
            return;
        }

        // Sole Admin check: protect communities from being abandoned without an administrator
        const isCommAdmin = isAdmin || membersList.some(m => {
            const mUid = String(m.userId || m.id || '');
            const mEmp = String(m.employeeId || m.empId || '').toUpperCase();
            const isMatch = (currentUser?.id && mUid === String(currentUser.id)) ||
                            (currentUser?.userId && mUid === String(currentUser.userId)) ||
                            (currentUser?.employeeId && mEmp && mEmp === String(currentUser.employeeId).toUpperCase());
            return isMatch && (m.memberType === 'Admin' || m.memberType === 'Moderator');
        });
        const adminsCount = getAdminCount();
        if (isCommAdmin && adminsCount <= 1 && membersList.length > 1) {
            setAdminProtectionWarning({
                title: 'Cannot Leave as Sole Community Admin',
                message: `You are currently the only Community Admin for "${community?.name}". A community with multiple members must always have at least one active Community Admin.\n\nPlease assign another member as Community Admin using "Make Admin" before leaving.`
            });
            return;
        }

        const isPrivate = community?.type === 'Private';
        const ok = await confirm({
            title: `Leave ${community?.name || 'Community'}`,
            message: isPrivate
                ? `Are you sure you want to leave "${community?.name || 'this private community'}"? Your access to discussions, files, and members will be revoked, and you will need admin approval to rejoin.`
                : `Are you sure you want to leave "${community?.name || 'this community'}"?`,
            confirmText: 'Leave Community',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) return;

        try {
            await communitiesApi.leave(community.id);
        } catch (err) {
            console.warn('Backend leave API warning:', err);
            if (err?.response?.data?.message) {
                showToast(err.response.data.message, 'error');
                return;
            }
        }

        setMembershipStatus('none');
        const targetId = community?.id || communityId || 101;

        // Persist tombstone in localStorage so refresh doesn't bring back membership from cached seeds
        const removedKey = `knome_community_removed_${targetId}`;
        const currentRemoved = JSON.parse(localStorage.getItem(removedKey) || '[]');
        const uidStr = String(currentUser?.userId || currentUser?.id || '');
        const empIdStr = (currentUser?.employeeId || '').toUpperCase();
        const nameStr = (currentUser?.fullName || currentUser?.name || '').toLowerCase();
        const updatedRemoved = Array.from(new Set([
            ...currentRemoved,
            ...(uidStr ? [uidStr] : []),
            ...(empIdStr ? [empIdStr] : []),
            ...(nameStr ? [nameStr] : [])
        ]));
        localStorage.setItem(removedKey, JSON.stringify(updatedRemoved));

        // FR-CM-09: Remove from joined localStorage so leave persists on refresh
        const userKeys = [
            `knome_joined_communities_${currentUser?.id || 'guest'}`,
            currentUser?.userId ? `knome_joined_communities_${currentUser.userId}` : null,
            currentUser?.employeeId ? `knome_joined_communities_${currentUser.employeeId}` : null
        ].filter(Boolean);

        userKeys.forEach(k => {
            try {
                const existingJoined = JSON.parse(localStorage.getItem(k) || '[]');
                localStorage.setItem(k, JSON.stringify(existingJoined.filter(c => String(c.id) !== String(targetId))));
            } catch (_) {}
        });

        // Filter out current user from members list
        setMembersList(prev => {
            const updated = prev.filter(m => {
                const mUid = String(m.userId || m.id || '');
                const mEmp = String(m.employeeId || m.empId || '').toUpperCase();
                const mName = String(m.fullName || m.name || '').toLowerCase();
                return !(mUid === uidStr || (empIdStr && mEmp === empIdStr) || (nameStr && mName === nameStr));
            });
            localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
            localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('community-joined-change'));
            return updated;
        });
        setCommunity(prev => ({ ...prev, membersCount: Math.max(1, (prev.membersCount || 1) - 1) }));
        showToast(`You have left "${community?.name}".`, 'info');
    };

    const handleSaveRulesFaq = async () => {
        const validRules = editRules.filter(r => String(r).trim());
        const validFaq = editFaq.filter(f => f && (String(f.q || '').trim() || String(f.a || '').trim()));
        if (validRules.length === 0) {
            showToast('Please specify at least one community rule.', 'warning');
            return;
        }
        setIsSavingRulesFaq(true);
        try {
            const rulesText = validRules.join('\n');
            const faqJson = JSON.stringify(validFaq);
            const targetId = community?.id || communityId;

            // 1. If live integer ID, update in SQL Server database via API!
            if (targetId && !isNaN(targetId) && Number(targetId) > 0 && Number(targetId) < 1000000000) {
                try {
                    await communitiesApi.update(targetId, {
                        name: community.name,
                        description: community.description,
                        bannerUrl: community.banner,
                        thumbnailUrl: community.thumbnail,
                        categoryId: community.categoryId || 1,
                        rules: rulesText,
                        faq: faqJson
                    });
                } catch (apiErr) {
                    console.warn('Backend API update warning (fallback to local):', apiErr);
                }
            }

            // 2. Persist to dedicated local storage key
            localStorage.setItem(`knome_community_rules_faq_${targetId}`, JSON.stringify({
                rules: validRules,
                faq: validFaq
            }));

            // 3. Update knome_custom_communities if present
            try {
                const customComms = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                const updatedComms = customComms.map(c => {
                    if (String(c.id) === String(targetId)) {
                        return { ...c, rules: validRules, faq: validFaq };
                    }
                    return c;
                });
                localStorage.setItem('knome_custom_communities', JSON.stringify(updatedComms));
            } catch (_) {}

            setCommunity(prev => ({
                ...prev,
                rules: validRules,
                faq: validFaq
            }));
            setEditRules(validRules);
            setEditFaq(validFaq);

            window.dispatchEvent(new CustomEvent('community-rules-updated', { detail: { communityId: targetId, rules: validRules, faq: validFaq } }));
            showToast('Community Rules & FAQ updated successfully!', 'success');
        } catch (err) {
            console.error('Failed to update community rules and FAQ:', err);
            showToast('Failed to save rules and FAQ.', 'error');
        } finally {
            setIsSavingRulesFaq(false);
        }
    };

    const handleSaveCategory = async () => {
        setIsSavingCategory(true);
        try {
            const commIdNum = Number(community?.id || communityId);
            const matchedCat = availableCategories.find(c => (c.name || '').toLowerCase() === selectedCategory.toLowerCase());
            const catId = matchedCat?.categoryId || matchedCat?.id || 1;

            if (!isNaN(commIdNum) && commIdNum > 0 && commIdNum < 1000000000) {
                await communitiesApi.update(commIdNum, {
                    name: community?.name,
                    description: community?.description,
                    bannerUrl: community?.banner,
                    thumbnailUrl: community?.thumbnail,
                    categoryId: catId,
                    categoryName: selectedCategory,
                    rules: Array.isArray(community?.rules) ? community.rules.join('\n') : (community?.rules || ''),
                    faq: typeof community?.faq === 'string' ? community.faq : JSON.stringify(community?.faq || [])
                });
            }

            // Update in local storage
            const customComms = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            const updatedCustom = customComms.map(c => {
                if (String(c.id) === String(commIdNum)) {
                    return { ...c, category: selectedCategory, categoryId: catId };
                }
                return c;
            });
            localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

            setCommunity(prev => ({
                ...prev,
                category: selectedCategory,
                categoryId: catId
            }));

            showToast(`✅ Community category updated to "${selectedCategory}"!`, 'success');
            window.dispatchEvent(new CustomEvent('community-created'));
        } catch (err) {
            console.error('Failed to update community category:', err);
            showToast('Failed to update category.', 'error');
        } finally {
            setIsSavingCategory(false);
        }
    };

    const handleAddRule = () => {
        if (!newRuleInput.trim()) return;
        setEditRules(prev => [...prev, newRuleInput.trim()]);
        setNewRuleInput('');
    };

    const handleRemoveRule = (index) => {
        setEditRules(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateRule = (index, value) => {
        setEditRules(prev => prev.map((r, i) => i === index ? value : r));
    };

    const handleAddFaq = () => {
        if (!newFaqQ.trim() || !newFaqA.trim()) return;
        setEditFaq(prev => [...prev, { q: newFaqQ.trim(), a: newFaqA.trim() }]);
        setNewFaqQ('');
        setNewFaqA('');
    };

    const handleRemoveFaq = (index) => {
        setEditFaq(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateFaq = (index, field, value) => {
        setEditFaq(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
    };

    const handlePin = async (postId) => {
        const targetPost = posts.find(p => p.id === postId);
        if (!targetPost) return;
        const currentPinnedCount = posts.filter(p => p.isPinned).length;
        if (!targetPost.isPinned && currentPinnedCount >= 3) {
            showToast('Maximum 3 pinned posts allowed per community (FR-CM-06).', 'warning');
            return;
        }
        try {
            const targetCommId = community?.id || communityId;
            const newPinState = !targetPost.isPinned;
            await communitiesApi.pinPost(targetCommId, postId, newPinState);
            setPosts(prev => prev.map(p => {
                if (p.id === postId) return { ...p, isPinned: newPinState };
                return p;
            }));
            showToast(newPinState ? "📌 Post pinned to top of community feed (FR-CM-06)." : "Post unpinned from top.", "success");
        } catch (err) {
            const errMsg = err?.response?.data?.message || err?.message || 'Failed to pin post. Maximum 3 pinned posts allowed.';
            showToast(errMsg, 'error');
        }
    };

    const handleDelete = async (postId) => {
        const ok = await confirm({
            title: 'Delete Post',
            message: 'Are you sure you want to delete this post? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (ok) {
            setPosts(prev => prev.filter(p => p.id !== postId));
            showToast('Post deleted successfully.', 'info');
        }
    };

    const handleInitiateSuspendMember = (member) => {
        const isSelf = String(member.userId || member.id) === String(currentUser?.userId || currentUser?.id) || 
                       (currentUser?.employeeId && String(member.employeeId || '').toUpperCase() === String(currentUser.employeeId).toUpperCase());
        if (isSelf) {
            showToast('You cannot suspend your own account from the community.', 'error');
            return;
        }

        const isTargetSysAdmin = ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN'].includes(String(member.role || member.roleName || '').toUpperCase());
        if (isTargetSysAdmin) {
            showToast('System Admins cannot be suspended from communities.', 'error');
            return;
        }

        const isCommAdmin = member.memberType === 'Admin' || member.memberType === 'Moderator' || member.memberType === 'Community Administrator' || member.memberType === 'Community Admin';
        const adminsCount = getAdminCount();

        if (isCommAdmin && adminsCount <= 1) {
            setAdminProtectionWarning({
                title: 'Cannot Suspend Community Admin',
                message: `"${member.fullName || member.name || 'This user'}" is currently the only Community Admin for this community. Suspending them would leave the community without an admin.\n\nPlease assign another member as Community Admin using "Make Admin" before suspending this admin.`
            });
            return;
        }

        setSuspendModalMember(member);
    };

    const handleConfirmSuspendMember = async ({ user: member, duration, customDate, fullReason, isPermanent, days }) => {
        const memberId = member.userId || member.id;
        const memberName = member.fullName || member.name || 'Member';
        const targetId = community?.id || communityId || 101;

        let durationLabel = `${days} Days`;
        let suspendedUntil = null;
        const now = new Date();

        if (duration === '1d') {
            durationLabel = '24 Hours (1 Day)';
            suspendedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === '3d') {
            durationLabel = '3 Days';
            suspendedUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === '7d') {
            durationLabel = '7 Days (1 Week)';
            suspendedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === '14d') {
            durationLabel = '14 Days (2 Weeks)';
            suspendedUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === '30d') {
            durationLabel = '30 Days (1 Month)';
            suspendedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === 'indefinite' || isPermanent) {
            durationLabel = 'Indefinite / Permanent';
            suspendedUntil = null;
        } else if (duration === 'custom' && customDate) {
            const customDateObj = new Date(customDate);
            durationLabel = `Until ${customDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            suspendedUntil = customDateObj.toISOString();
        }

        try {
            // Suspend community membership only (FR-CM-07) - does not disable global Knome platform account
            await communitiesApi.decideMembership(targetId, memberId, 'Banned').catch(() => null);
        } catch (err) {
            console.warn('Backend suspend API warning:', err);
        }

        const suspendedRecord = {
            ...member,
            suspendedAt: new Date().toISOString(),
            suspendedUntil,
            suspensionDuration: durationLabel,
            suspensionReason: fullReason,
            suspendedBy: currentUser?.fullName || currentUser?.name || 'Community Admin'
        };

        setSuspendedMembers(prev => {
            const updated = [...prev, suspendedRecord];
            localStorage.setItem(`knome_community_suspended_${targetId}`, JSON.stringify(updated));
            return updated;
        });

        setMembersList(prev => {
            const updated = prev.filter(m => String(m.userId || m.id) !== String(memberId));
            localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
            localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('community-joined-change'));
            window.dispatchEvent(new CustomEvent('community-suspended-change', { detail: { communityId: targetId } }));
            return updated;
        });

        setCommunity(prev => ({ ...prev, membersCount: Math.max(1, (prev.membersCount || 1) - 1) }));
        showToast(`${memberName} suspended from this community for ${durationLabel}.`, 'warning');
        setSuspendModalMember(null);
    };

    const handleSuspend = async (memberId, memberName) => {
        const member = membersList.find(m => String(m.userId || m.id) === String(memberId)) || { userId: memberId, fullName: memberName };
        handleInitiateSuspendMember(member);
    };

    const handleReinstate = (targetMemberOrId, memberNameOrNorm) => {
        const targetId = community?.id || communityId || 101;

        // Support both handleReinstate(m, norm) and legacy handleReinstate(memberId, memberName)
        const isObj = typeof targetMemberOrId === 'object' && targetMemberOrId !== null;
        const targetNorm = typeof memberNameOrNorm === 'object' && memberNameOrNorm !== null ? memberNameOrNorm : null;
        const rawName = isObj
            ? (targetNorm?.displayName || targetMemberOrId.fullName || targetMemberOrId.name || 'Member')
            : (typeof memberNameOrNorm === 'string' ? memberNameOrNorm : 'Member');

        // Locate member record to reinstate
        const memberToReinstate = isObj
            ? targetMemberOrId
            : suspendedMembers.find(m => {
                const uid = String(m.userId || m.id || '');
                const targetUid = String(targetMemberOrId || '');
                const empId = String(m.employeeId || m.empId || '').toUpperCase();
                const targetEmp = String(targetMemberOrId || '').toUpperCase();
                return (targetUid && uid === targetUid) || (targetEmp && empId === targetEmp);
            });

        // Resolve userId for backend DB update
        let resolvedUserId = memberToReinstate?.userId || memberToReinstate?.id || targetNorm?.userId || targetNorm?.id;
        if (!resolvedUserId && typeof targetMemberOrId === 'number') {
            resolvedUserId = targetMemberOrId;
        } else if (!resolvedUserId && typeof targetMemberOrId === 'string' && /^\d+$/.test(targetMemberOrId)) {
            resolvedUserId = Number(targetMemberOrId);
        }
        if (!resolvedUserId) {
            const empToMatch = String(memberToReinstate?.employeeId || memberToReinstate?.empId || targetNorm?.displayEmpId || '').toUpperCase();
            const foundUser = (contextUsers || []).find(u => 
                (empToMatch && String(u.employeeId || '').toUpperCase() === empToMatch) ||
                (rawName && String(u.fullName || u.name || '').toLowerCase() === rawName.toLowerCase())
            );
            if (foundUser) {
                resolvedUserId = foundUser.id || foundUser.userId;
            }
        }

        // Re-approve membership in backend DB
        if (resolvedUserId) {
            communitiesApi.decideMembership(targetId, resolvedUserId, 'Approved').catch(err => {
                console.warn('Backend decideMembership warning:', err);
            });
        }

        // Immediate removal from suspendedMembers list & update localStorage
        const filterPredicate = (m) => {
            if (memberToReinstate && m === memberToReinstate) return false;
            const mUid = String(m.userId || m.id || '');
            if (resolvedUserId && mUid && String(mUid) === String(resolvedUserId)) return false;
            if (memberToReinstate?.userId && mUid && String(mUid) === String(memberToReinstate.userId)) return false;
            if (memberToReinstate?.id && mUid && String(mUid) === String(memberToReinstate.id)) return false;

            const mEmpId = String(m.employeeId || m.empId || '').trim().toUpperCase();
            const targetEmpId = String(memberToReinstate?.employeeId || memberToReinstate?.empId || targetNorm?.displayEmpId || '').trim().toUpperCase();
            if (mEmpId && targetEmpId && mEmpId === targetEmpId) return false;

            const mName = String(m.fullName || m.name || '').trim().toLowerCase();
            const targetName = String(rawName || '').trim().toLowerCase();
            if (mName && targetName && mName === targetName) return false;

            return true;
        };

        const updatedSuspended = suspendedMembers.filter(filterPredicate);
        localStorage.setItem(`knome_community_suspended_${targetId}`, JSON.stringify(updatedSuspended));
        setSuspendedMembers(updatedSuspended);

        // Build restored member record and restore to membersList
        const { suspendedAt, suspendedBy, suspensionDuration, suspensionReason, suspendedUntil, ...restMember } = memberToReinstate || {};
        const cleanMember = {
            ...restMember,
            userId: resolvedUserId || restMember.userId || restMember.id || 1,
            fullName: rawName,
            employeeId: targetNorm?.displayEmpId || memberToReinstate?.employeeId || 'MPO100',
            designation: targetNorm?.displayDesignation || memberToReinstate?.designation || 'Member',
            department: targetNorm?.displayDepartment || memberToReinstate?.department || 'MPOnline',
            memberType: 'Member',
            status: 'Approved'
        };

        const updatedMembers = deduplicateMembers([...membersList, cleanMember], contextUsers);
        localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updatedMembers));
        setMembersList(updatedMembers);

        // Update community members count
        setCommunity(prev => prev ? { ...prev, membersCount: updatedMembers.length } : prev);

        // If the reinstated member is current user, restore active status
        const isCurrentReinstated = currentUser && (
            (resolvedUserId && String(currentUser.id || currentUser.userId) === String(resolvedUserId)) ||
            (cleanMember.employeeId && String(currentUser.employeeId || '').toUpperCase() === String(cleanMember.employeeId).toUpperCase())
        );
        if (isCurrentReinstated) {
            setMembershipStatus('joined');
            setCommunitySuspensionInfo(null);
        }

        // Dispatch events cleanly outside state callbacks
        window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
        window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId } }));
        window.dispatchEvent(new CustomEvent('community-suspended-change', { detail: { communityId: targetId } }));

        showToast(`${rawName} has been reinstated as a Community Member.`, 'success');
    };

    const handleSubscribeAction = () => {
        const targetId = community?.id || communityId || 101;
        setMembershipStatus('subscribed');

        // FR-CM-06: Persist subscription to localStorage
        const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
        const existingJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
        if (!existingJoined.some(c => String(c.id) === String(targetId))) {
            existingJoined.push({ id: targetId, name: community?.name, status: 'subscribed', subscribedAt: new Date().toISOString() });
            localStorage.setItem(userKey, JSON.stringify(existingJoined));
        } else {
            const updated = existingJoined.map(c => String(c.id) === String(targetId) ? { ...c, status: 'subscribed' } : c);
            localStorage.setItem(userKey, JSON.stringify(updated));
        }

        setSubscribersList(prev => {
            const exists = prev.some(s => String(s.userId) === String(currentUser?.id));
            if (exists) return prev;
            const updated = [...prev, { userId: currentUser?.id, fullName: currentUser?.name, subscribedAt: new Date().toISOString() }];
            localStorage.setItem(`knome_community_subscribers_${targetId}`, JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            return updated;
        });
        showToast(`You are now subscribed to "${community?.name}" (View-Only mode).`);
    };

    const handleUnsubscribeAction = () => {
        const targetId = community?.id || communityId || 101;
        setMembershipStatus('none');

        // Remove from joined localStorage
        const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
        const existingJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
        localStorage.setItem(userKey, JSON.stringify(existingJoined.filter(c => String(c.id) !== String(targetId))));

        setSubscribersList(prev => {
            const updated = prev.filter(s => String(s.userId) !== String(currentUser?.id));
            localStorage.setItem(`knome_community_subscribers_${targetId}`, JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            return updated;
        });
        showToast(`You have unsubscribed from "${community?.name}".`, 'info');
    };

    const handleCancelRequest = async () => {
        const ok = await confirm({
            title: 'Cancel Join Request',
            message: `Are you sure you want to cancel your request to join "${community?.name || 'this community'}"?`,
            confirmText: 'Yes, Cancel Request',
            cancelText: 'Keep Request',
            variant: 'danger'
        });
        if (!ok) return;

        const targetId = Number(community?.id || commData?.communityId || communityId || 101);
        try { await communitiesApi.leave(targetId).catch(() => null); } catch (e) { /* ignore */ }
        const currentUid = String(currentUser?.userId || currentUser?.id || '');
        const currentEmpId = String(currentUser?.employeeId || '').toUpperCase();

        setJoinRequests(prev => {
            const updated = prev.filter(r => {
                const rUid = String(r.userId || r.id || '');
                const rEmp = String(r.employeeId || '').toUpperCase();
                return !((currentUid && rUid === currentUid) || (currentEmpId && rEmp === currentEmpId));
            });
            localStorage.setItem(`knome_join_requests_${targetId}`, JSON.stringify(updated));
            if (String(communityId) !== String(targetId)) {
                localStorage.setItem(`knome_join_requests_${communityId}`, JSON.stringify(updated));
            }
            return updated;
        });

        const userKeys = [
            `knome_joined_communities_${currentUser?.id || 'guest'}`,
            currentUser?.userId ? `knome_joined_communities_${currentUser.userId}` : null,
            currentUser?.employeeId ? `knome_joined_communities_${currentUser.employeeId}` : null
        ].filter(Boolean);

        userKeys.forEach(k => {
            try {
                const existingJoined = JSON.parse(localStorage.getItem(k) || '[]');
                localStorage.setItem(k, JSON.stringify(existingJoined.filter(c => String(c.id) !== String(targetId))));
            } catch (_) {}
        });

        window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId } }));
        window.dispatchEvent(new CustomEvent('community-join-requests-updated', { detail: { communityId: targetId } }));
        setMembershipStatus('none');
        showToast('Your join request has been cancelled.', 'info');
    };

    // ─────────────────────────────────────────
    // FR-CM-03: Approve a join request (Admin)
    // ─────────────────────────────────────────
    const handleApprove = async (requestId, requestName) => {
        const targetId = Number(community?.id || commData?.communityId || communityId || 101);
        const request = joinRequests.find(r => String(r.id || r.userId) === String(requestId));
        const reqUserId = request?.userId || requestId;
        const reqEmpId = request?.employeeId;

        // Try backend API
        try {
            const numericUserId = Number(reqUserId);
            if (!isNaN(numericUserId) && numericUserId > 0) {
                await communitiesApi.decideMembership(targetId, numericUserId, 'Approved').catch(() => null);
            }
        } catch (e) { /* fallback to localStorage */ }

        // Clear any previous removed tombstone for approved user
        try {
            const removedKey = `knome_community_removed_${targetId}`;
            const currentRemoved = JSON.parse(localStorage.getItem(removedKey) || '[]');
            const cleanedRemoved = currentRemoved.filter(x => {
                const s = String(x).toLowerCase();
                return !(s === String(reqUserId).toLowerCase() || (reqEmpId && s === String(reqEmpId).toLowerCase()));
            });
            localStorage.setItem(removedKey, JSON.stringify(cleanedRemoved));
        } catch (_) {}

        // Add to membersList
        setMembersList(prev => {
            const newMember = {
                userId: reqUserId,
                id: reqUserId,
                fullName: request?.name || request?.fullName || requestName,
                employeeId: reqEmpId || 'MPO100',
                designation: request?.role || request?.designation || 'Employee',
                memberType: 'Member',
                status: 'Approved',
                profilePhotoUrl: request?.avatar || null,
            };
            const updated = deduplicateMembers([...prev, newMember], contextUsers);
            localStorage.setItem(`knome_community_members_${targetId}`, JSON.stringify(updated));
            localStorage.setItem(`knome_community_members_updated_${targetId}`, Date.now().toString());
            window.dispatchEvent(new CustomEvent('community-members-updated', { detail: { communityId: targetId } }));
            window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId } }));
            return updated;
        });

        // Persist 'joined' status in the requester's knome_joined_communities
        const requesterJoinedKeys = [
            `knome_joined_communities_${reqUserId}`,
            reqEmpId ? `knome_joined_communities_${reqEmpId}` : null
        ].filter(Boolean);

        requesterJoinedKeys.forEach(k => {
            try {
                const joinedList = JSON.parse(localStorage.getItem(k) || '[]');
                const filtered = joinedList.filter(c => String(c.id) !== String(targetId));
                filtered.push({
                    id: targetId,
                    name: community?.name || 'Community',
                    category: community?.category || 'General',
                    type: community?.type || 'Private',
                    role: 'Member',
                    status: 'joined',
                    joinedDate: new Date().toISOString()
                });
                localStorage.setItem(k, JSON.stringify(filtered));
            } catch (_) {}
        });

        // If the current user on this client was the requester, update membershipStatus immediately
        const currentUid = String(currentUser?.userId || currentUser?.id || '');
        if (currentUid && String(reqUserId) === currentUid) {
            setMembershipStatus('joined');
        }

        // Remove from joinRequests
        setJoinRequests(prev => {
            const updated = prev.filter(r => String(r.id || r.userId) !== String(requestId));
            localStorage.setItem(`knome_join_requests_${targetId}`, JSON.stringify(updated));
            if (String(communityId) !== String(targetId)) {
                localStorage.setItem(`knome_join_requests_${communityId}`, JSON.stringify(updated));
            }
            return updated;
        });

        setCommunity(prev => ({ ...prev, membersCount: (prev.membersCount || 0) + 1 }));
        window.dispatchEvent(new CustomEvent('community-join-requests-updated', { detail: { communityId: targetId } }));

        // Notify the requesting user so they see it in their notification bell
        try {
            const approvalNotif = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                targetUserId: reqUserId,
                type: 'community_approved',
                category: 'Community',
                text: `✅ Your request to join "${community?.name}" has been approved! You are now a Member.`,
                senderName: currentUser?.name || currentUser?.fullName || 'Community Admin',
                senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                unread: true,
                icon: 'check_circle',
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10',
                communityName: community?.name,
                communityId: targetId,
                actionLink: `/community/view?id=${targetId}`
            };
            const existing = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const cleaned = existing.filter(n => !(n.type === 'join_request' && String(n.communityId) === String(targetId) && String(n.senderUserId || '') === String(reqUserId)));
            localStorage.setItem('knome_notifications', JSON.stringify([approvalNotif, ...cleaned]));
            window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: approvalNotif }));
        } catch (e) { /* ignore */ }

        showToast(`✅ ${requestName} approved and added as a Member.`, 'success');
    };

    // ─────────────────────────────────────────
    // FR-CM-03: Reject a join request (Admin)
    // ─────────────────────────────────────────
    const handleReject = async (requestId, requestName) => {
        const targetId = Number(community?.id || commData?.communityId || communityId || 101);
        const request = joinRequests.find(r => String(r.id || r.userId) === String(requestId));
        const reqUserId = request?.userId || requestId;
        const reqEmpId = request?.employeeId;

        // Try backend API
        try {
            const numericUserId = Number(reqUserId);
            if (!isNaN(numericUserId) && numericUserId > 0) {
                await communitiesApi.decideMembership(targetId, numericUserId, 'Rejected').catch(() => null);
            }
        } catch (e) { /* fallback */ }

        // Remove from joinRequests
        setJoinRequests(prev => {
            const updated = prev.filter(r => String(r.id || r.userId) !== String(requestId));
            localStorage.setItem(`knome_join_requests_${targetId}`, JSON.stringify(updated));
            if (String(communityId) !== String(targetId)) {
                localStorage.setItem(`knome_join_requests_${communityId}`, JSON.stringify(updated));
            }
            return updated;
        });

        // Clean requester's knome_joined_communities
        const requesterJoinedKeys = [
            `knome_joined_communities_${reqUserId}`,
            reqEmpId ? `knome_joined_communities_${reqEmpId}` : null
        ].filter(Boolean);

        requesterJoinedKeys.forEach(k => {
            try {
                const joinedList = JSON.parse(localStorage.getItem(k) || '[]');
                const filtered = joinedList.filter(c => String(c.id) !== String(targetId));
                localStorage.setItem(k, JSON.stringify(filtered));
            } catch (_) {}
        });

        const currentUid = String(currentUser?.userId || currentUser?.id || '');
        if (currentUid && String(reqUserId) === currentUid) {
            setMembershipStatus('none');
        }

        window.dispatchEvent(new CustomEvent('community-join-requests-updated', { detail: { communityId: targetId } }));
        window.dispatchEvent(new CustomEvent('community-joined-change', { detail: { communityId: targetId } }));

        // Notify the requesting user of rejection
        try {
            const rejectionNotif = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                targetUserId: reqUserId,
                type: 'community_rejected',
                category: 'Community',
                text: `❌ Your request to join "${community?.name}" was not approved at this time.`,
                senderName: currentUser?.name || currentUser?.fullName || 'Community Admin',
                senderAvatar: currentUser?.avatar || currentUser?.profilePhotoUrl || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                unread: true,
                icon: 'cancel',
                color: 'text-red-400',
                bg: 'bg-red-500/10',
                communityName: community?.name,
                communityId: targetId,
                actionLink: '/community'
            };
            const existing = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const cleaned = existing.filter(n => !(n.type === 'join_request' && String(n.communityId) === String(targetId) && String(n.senderUserId || '') === String(reqUserId)));
            localStorage.setItem('knome_notifications', JSON.stringify([rejectionNotif, ...cleaned]));
            window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: rejectionNotif }));
        } catch (e) { /* ignore */ }

        showToast(`${requestName}'s join request has been rejected.`, 'warning');
    };

    const handleDeleteCommunity = async () => {
        const ok = await confirm({
            title: 'Delete Community',
            message: `Are you sure you want to delete/remove "${community?.name}"? This action cannot be undone.`,
            confirmText: 'Delete Community',
            cancelText: 'Cancel',
            variant: 'danger'
        });
        if (!ok) {
            return;
        }

        const targetId = communityId || community?.id;

        // 1. Immediately track as deleted in localStorage so refresh never restores it
        const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]');
        if (targetId && !deletedIds.includes(String(targetId))) {
            deletedIds.push(String(targetId));
            localStorage.setItem('knome_deleted_community_ids', JSON.stringify(deletedIds));
        }

        // 2. Remove from custom list and pending approvals list
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = customList.filter(c => 
            String(c.id) !== String(targetId) && 
            (c.name || '').toLowerCase().trim() !== (community?.name || '').toLowerCase().trim()
        );
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        const pendingList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = pendingList.filter(c => 
            String(c.id) !== String(targetId) && 
            (c.name || '').toLowerCase().trim() !== (community?.name || '').toLowerCase().trim()
        );
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));

        showToast(`Community "${community?.name}" has been removed.`, 'info');
        navigate('/community');

        // 3. Send delete to backend to set IsActive = 0 in database
        try {
            if (targetId) {
                await communitiesApi.delete(targetId);
            }
        } catch (err) {
            console.warn('Backend delete notification error:', err);
        }
    };

    const handleCancelCommunityRequest = async () => {
        const targetId = communityId || community?.id;
        const commName = community?.name || 'this community';
        const ok = await confirm({
            title: 'Cancel Community Request',
            message: `Are you sure you want to cancel and revert your request for "${commName}"? This community creation proposal will be withdrawn and removed.`,
            confirmText: 'Yes, Cancel Request',
            cancelText: 'Keep Request',
            variant: 'danger'
        });
        if (!ok) return;

        // 1. Immediately track as deleted in localStorage
        const deletedIds = JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]');
        if (targetId && !deletedIds.includes(String(targetId))) {
            deletedIds.push(String(targetId));
            localStorage.setItem('knome_deleted_community_ids', JSON.stringify(deletedIds));
        }

        // 2. Remove from custom list and pending approvals list
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = customList.filter(c => 
            String(c.id) !== String(targetId) && 
            (c.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        );
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        const pendingList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = pendingList.filter(c => 
            String(c.id) !== String(targetId) && 
            (c.name || '').toLowerCase().trim() !== commName.toLowerCase().trim()
        );
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));

        showToast(`Community request for "${commName}" has been cancelled.`, 'info');
        navigate('/community');

        // 3. Send delete to backend to set IsActive = 0 in database
        try {
            if (targetId) {
                await communitiesApi.delete(targetId);
            }
        } catch (err) {
            console.warn('Backend delete notification error:', err);
        }

        window.dispatchEvent(new CustomEvent('community-created'));
        window.dispatchEvent(new CustomEvent('community-approval-requested'));
    };

    // ─────────────────────────────────────────
    // Files & Media Handlers
    // ─────────────────────────────────────────
    const handleOpenFile = async (file) => {
        if (!file) return;
        setPreviewModalFile(file);
    };

    const handleDownloadFile = async (e, file) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!file) return;
        try {
            showToast(`Preparing download for ${file.name || 'file'}...`, 'info');
            let fileUrl = file.url || file.Url || file.fileUrl;
            if (file.hasIndexedDb || file.id) {
                try {
                    const idbBlob = await getFileBlobFromIndexedDb(file.id);
                    if (idbBlob) fileUrl = idbBlob;
                } catch (_) {}
            }
            let resolved = fileUrl ? resolveMediaUrl(fileUrl) : null;
            if (!resolved || resolved === '#') {
                if (file.extension === 'pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
                    resolved = SAMPLE_PDF_DATA_URL;
                } else {
                    showToast('File download URL is not available.', 'warning');
                    return;
                }
            }

            // For local data/blob URLs, trigger direct download anchor
            if (resolved.startsWith('data:') || resolved.startsWith('blob:')) {
                const link = document.createElement('a');
                link.href = resolved;
                link.download = file.name || 'download';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast(`Downloaded ${file.name}`, 'success');
                return;
            }

            // Fetch as blob to guarantee cross-origin file download with correct file name
            try {
                const resp = await fetch(resolved, { mode: 'cors' });
                if (resp.ok) {
                    const blob = await resp.blob();
                    const blobUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = file.name || 'download';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
                    showToast(`Downloaded ${file.name}`, 'success');
                    return;
                }
            } catch (fetchErr) {
                console.warn('Direct blob fetch failed, falling back to direct anchor download:', fetchErr);
            }

            // Fallback: direct anchor with download attribute
            const link = document.createElement('a');
            link.href = resolved;
            link.download = file.name || 'download';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast(`Downloaded ${file.name}`, 'success');
        } catch (err) {
            console.error('Download error:', err);
            showToast('Failed to download file.', 'error');
        }
    };

    const fileCategoryCounts = useMemo(() => {
        const counts = { All: filesList.length, Document: 0, Image: 0, Video: 0, Audio: 0 };
        filesList.forEach(f => {
            const ext = (f.extension || (f.name ? f.name.split('.').pop() : '') || '').toLowerCase();
            const isAudio = f.category === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext);
            if (isAudio) {
                counts.Audio++;
            } else if (f.category === 'Image') {
                counts.Image++;
            } else if (f.category === 'Video') {
                counts.Video++;
            } else {
                counts.Document++;
            }
        });
        return counts;
    }, [filesList]);

    const totalStorageDisplay = useMemo(() => {
        let totalBytes = 0;
        filesList.forEach(f => {
            const sz = String(f.size || '').trim().toLowerCase();
            if (sz.endsWith('mb')) {
                totalBytes += (parseFloat(sz) || 0) * 1024 * 1024;
            } else if (sz.endsWith('kb')) {
                totalBytes += (parseFloat(sz) || 0) * 1024;
            } else if (sz.endsWith('bytes') || sz.endsWith('b')) {
                totalBytes += (parseFloat(sz) || 0);
            } else {
                totalBytes += 250 * 1024; // fallback estimation
            }
        });
        if (totalBytes >= 1024 * 1024) {
            return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${Math.round(totalBytes / 1024)} KB`;
    }, [filesList]);

    const filteredFiles = useMemo(() => {
        let list = filesList.filter(f => {
            const ext = (f.extension || (f.name ? f.name.split('.').pop() : '') || '').toLowerCase();
            const isAudio = f.category === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext);
            let matchesCat = true;
            if (fileCategoryFilter === 'Audio') {
                matchesCat = isAudio;
            } else if (fileCategoryFilter === 'Video') {
                matchesCat = (f.category === 'Video' || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) && !isAudio;
            } else if (fileCategoryFilter === 'Image') {
                matchesCat = f.category === 'Image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
            } else if (fileCategoryFilter === 'Document') {
                matchesCat = !isAudio && f.category !== 'Video' && f.category !== 'Image';
            }
            const q = fileSearchQuery.trim().toLowerCase();
            const matchesQuery = !q || 
                (f.name && f.name.toLowerCase().includes(q)) || 
                (f.uploadedBy && f.uploadedBy.toLowerCase().includes(q)) ||
                (f.extension && f.extension.toLowerCase().includes(q));
            return matchesCat && matchesQuery;
        });

        return [...list].sort((a, b) => {
            if (fileSortBy === 'name') {
                return (a.name || '').localeCompare(b.name || '');
            }
            if (fileSortBy === 'oldest') {
                return new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0);
            }
            if (fileSortBy === 'size') {
                const parseSz = (s) => {
                    const str = String(s || '').toLowerCase();
                    if (str.endsWith('mb')) return parseFloat(str) * 1024 * 1024;
                    if (str.endsWith('kb')) return parseFloat(str) * 1024;
                    return parseFloat(str) || 0;
                };
                return parseSz(b.size) - parseSz(a.size);
            }
            // default: newest first
            return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
        });
    }, [filesList, fileCategoryFilter, fileSearchQuery, fileSortBy]);

    // Sort pinned posts first (FR-CM-08)
    const resolveTargetCommunityFromPost = (p) => {
        if (p.sharedCommunity?.id) return { id: p.sharedCommunity.id, name: p.sharedCommunity.name };
        if (p.title && (p.title.toLowerCase().includes('recommendation') || p.title.toLowerCase().includes('community:'))) {
            const rawName = p.title.replace(/.*Recommendation:\s*/i, '').replace(/.*Community:\s*/i, '').trim();
            if (!rawName) return null;

            const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            const foundCustom = customList.find(c => c.name.toLowerCase() === rawName.toLowerCase());
            if (foundCustom) return { id: foundCustom.id, name: foundCustom.name };

            const seedMap = {
                'tech innovation hub': '1',
                'devops & ai innovation hub': '2',
                'frontend developers guild': '3',
                'database architects': '4',
                'hr & general announcements': '5',
                'culture & hr hub': '6',
                'dotnet developers community': '101'
            };
            const matchedKey = Object.keys(seedMap).find(k => rawName.toLowerCase().includes(k) || k.includes(rawName.toLowerCase()));
            if (matchedKey) return { id: seedMap[matchedKey], name: rawName };
            return { id: '2', name: rawName };
        }
        return null;
    };

    const sortedPosts = [...posts].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = new Date(a.createdDate || a.time || 0).getTime() || 0;
        const timeB = new Date(b.createdDate || b.time || 0).getTime() || 0;
        if (timeA && timeB) return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''));
    });

    // Dynamically resolve Community Admin name from current active members
    const communityAdminDisplay = useMemo(() => {
        const dedupedAll = deduplicateMembers(membersList, contextUsers);
        const adminMembers = dedupedAll.filter(m => 
            m.memberType === 'Admin' || 
            m.memberType === 'Moderator' || 
            m.memberType === 'Community Administrator' ||
            m.memberType === 'Community Admin'
        );
        if (adminMembers.length > 0) {
            return adminMembers
                .map(a => normalizeMemberData(a, contextUsers).displayName)
                .filter(Boolean)
                .join(', ');
        }
        return community?.adminContact || 'Community Admin';
    }, [membersList, community?.adminContact, contextUsers]);

    // Filter & sort members: Community Admins always pinned to the top of the list!
    // Strict Deduplication: Every employee appears at most once in the community members roster
    const filteredMembers = useMemo(() => {
        const normalized = membersList.map(m => normalizeMemberData(m, contextUsers));
        const deduped = deduplicateMembers(normalized, contextUsers);
        return deduped
            .filter(m => 
                !memberSearchQuery.trim() || 
                (m.displayName || '').toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
                (m.displayEmpId || '').toLowerCase().includes(memberSearchQuery.toLowerCase()) || 
                (m.displayDesignation || '').toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                (m.displayDepartment || '').toLowerCase().includes(memberSearchQuery.toLowerCase())
            )
            .sort((a, b) => {
                if (a.isCommAdmin && !b.isCommAdmin) return -1;
                if (!a.isCommAdmin && b.isCommAdmin) return 1;
                return (a.displayName || '').localeCompare(b.displayName || '');
            });
    }, [membersList, memberSearchQuery, contextUsers]);

    // Scroll-wise progressive loading hooks
    const { visibleCount: visiblePostCount, resetVisibleCount: resetPostCount } = useScrollLoading(sortedPosts.length, 6, 6);
    const { visibleCount: visibleMemberCount, resetVisibleCount: resetMemberCount } = useScrollLoading(filteredMembers.length, 12, 12);
    const { visibleCount: visibleFileCount, resetVisibleCount: resetFileCount } = useScrollLoading(filteredFiles.length, 9, 9);

    useEffect(() => {
        resetPostCount();
        resetMemberCount();
        resetFileCount();
    }, [activeTab, communityId]);

    useEffect(() => {
        resetMemberCount();
    }, [memberSearchQuery]);

    useEffect(() => {
        resetFileCount();
    }, [fileCategoryFilter, fileSearchQuery, fileSortBy, fileViewMode]);

    if (isLoading || !community) {
        return (
            <div className="flex-1 flex items-center justify-center p-12 min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <span className="material-symbols-outlined text-[40px] text-indigo-500 animate-spin">progress_activity</span>
                    <p className="text-sm font-bold text-slate-500">Loading Community Details...</p>
                </div>
            </div>
        );
    }

    if (membershipStatus === 'banned') {
        return (
            <main className="flex-1 min-h-[85vh] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950/50">
                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2.5 animate-in slide-in-from-bottom-4 duration-300 ${
                        toast.type === 'error' ? 'bg-red-500 text-white' :
                        toast.type === 'warning' ? 'bg-amber-500 text-white' :
                        toast.type === 'info' ? 'bg-slate-700 text-white' :
                        'bg-emerald-500 text-white'
                    }`}>
                        <span className="material-symbols-outlined text-[18px]">
                            {toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : toast.type === 'info' ? 'info' : 'check_circle'}
                        </span>
                        {toast.message}
                    </div>
                )}

                <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-amber-300/80 dark:border-amber-700/60 rounded-3xl p-8 sm:p-10 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-20 h-20 rounded-3xl bg-amber-500/15 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner border border-amber-500/30">
                        <span className="material-symbols-outlined text-4xl">person_off</span>
                    </div>
                    <div className="space-y-2">
                        <span className="text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 inline-flex items-center gap-1.5 shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                            Access Suspended
                        </span>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            You are suspended from this community.
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                            You cannot open or access <strong className="text-slate-900 dark:text-white">"{community.name}"</strong>, view its content, files, or discussions until your suspension is removed by an administrator.
                        </p>
                    </div>

                    {communitySuspensionInfo && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700/60 text-left space-y-2.5 max-w-md mx-auto shadow-xs">
                            {communitySuspensionInfo.suspensionDuration && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Duration:</span>
                                    <span className="font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 px-2.5 py-0.5 rounded-lg border border-amber-300/80 dark:border-amber-700/60">
                                        {communitySuspensionInfo.suspensionDuration}
                                    </span>
                                </div>
                            )}
                            {communitySuspensionInfo.suspensionReason && (
                                <div className="text-xs pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                                    <span className="text-slate-500 dark:text-slate-400 block mb-1 font-semibold">Reason:</span>
                                    <p className="font-medium text-slate-800 dark:text-slate-200 italic bg-white dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                                        "{communitySuspensionInfo.suspensionReason}"
                                    </p>
                                </div>
                            )}
                            {communitySuspensionInfo.suspendedBy && (
                                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400">
                                    <span className="text-slate-500 dark:text-slate-400 font-medium">Suspended By:</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{communitySuspensionInfo.suspendedBy}</span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={() => navigate('/communities')}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto w-full sm:w-auto"
                        >
                            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                            Back to Communities
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 pb-6">

            {/* Toast Notification (FR-CM-09 user feedback) */}
            {toast && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2.5 animate-in slide-in-from-bottom-4 duration-300 ${
                    toast.type === 'error' ? 'bg-red-500 text-white' :
                    toast.type === 'warning' ? 'bg-amber-500 text-white' :
                    toast.type === 'info' ? 'bg-slate-700 text-white' :
                    'bg-emerald-500 text-white'
                }`}>
                    <span className="material-symbols-outlined text-[18px]">
                        {toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : toast.type === 'info' ? 'info' : 'check_circle'}
                    </span>
                    {toast.message}
                </div>
            )}

            {/* Hero Section (FR-CM-08: Banner, Thumbnail, Member Count) */}

            <section className="relative min-h-[300px] md:min-h-[340px] w-full rounded-b-3xl overflow-hidden -mt-8 shadow-xl border-b border-slate-800">
                <img 
                    src={community.banner || getCommunityImages(community.name, community.category).banner} 
                    alt={community.name} 
                    onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = getCommunityImages(community.name, community.category).banner;
                    }}
                    className="w-full h-full object-cover absolute inset-0" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/50"></div>
                
                <div className="relative z-10 bottom-0 left-0 w-full p-6 md:p-8 flex flex-col md:flex-row items-start md:items-end gap-6 max-w-7xl mx-auto pt-16">
                    <img 
                        src={community.thumbnail || getCommunityImages(community.name, community.category).thumbnail} 
                        alt={community.name} 
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = getCommunityImages(community.name, community.category).thumbnail;
                        }}
                        className="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-slate-900 object-cover shadow-2xl bg-white shrink-0" 
                    />
                    
                    <div className="flex-1 text-white">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <span className="px-2.5 py-0.5 bg-indigo-500/90 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md">{community.type}</span>
                            <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md">{community.category}</span>
                            {membershipStatus === 'banned' && (
                                <span className="px-2.5 py-0.5 bg-amber-500/90 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                                    <span className="material-symbols-outlined text-[12px]">person_off</span> Suspended
                                </span>
                            )}
                            {membershipStatus === 'joined' && (
                                <span className="px-2.5 py-0.5 bg-emerald-500/90 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                                    <span className="material-symbols-outlined text-[12px]">edit</span> Member (Can Post)
                                </span>
                            )}
                            {membershipStatus === 'subscribed' && (
                                <span className="px-2.5 py-0.5 bg-blue-500/90 backdrop-blur-md text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md">
                                    <span className="material-symbols-outlined text-[12px]">visibility</span> Subscriber (View Only)
                                </span>
                            )}
                        </div>
                        <h1 
                            className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight mb-2 drop-shadow-2xl"
                        >
                            <span 
                                className="px-4 py-2 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-amber-400/50 shadow-2xl inline-block text-amber-300"
                                style={{ color: '#FCD34D', textShadow: '0 2px 12px rgba(0,0,0,0.95)' }}
                            >
                                {community.name}
                            </span>
                        </h1>
                        <p 
                            className="text-slate-100 font-medium text-xs md:text-sm max-w-3xl leading-relaxed bg-slate-950/75 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800/80 shadow-lg"
                            style={{ color: '#F8FAFC' }}
                        >
                            {community.description}
                        </p>
                    </div>

                    {(() => {
                        const isDefaultOrg = community?.type?.toLowerCase().includes('default') || community?.type?.toLowerCase().includes('org');
                        return (
                            <div className="flex items-center gap-4 shrink-0">
                                {membershipStatus === 'banned' ? (
                                    <div 
                                        className="h-10 px-4 bg-amber-500/20 text-amber-300 font-bold rounded-xl flex items-center justify-center gap-2 text-xs border border-amber-500/40 backdrop-blur-md shadow-lg"
                                        title="You have been suspended from this community by the Community Admin"
                                    >
                                        <span className="material-symbols-outlined text-[16px] text-amber-400">person_off</span>
                                        <span>Community Access Suspended</span>
                                    </div>
                                ) : isDefaultOrg ? (
                                    <div 
                                        className="h-10 px-4 bg-slate-900/90 text-purple-300 font-bold rounded-xl flex items-center justify-center gap-2 text-xs border border-purple-500/40 backdrop-blur-md shadow-lg"
                                        title="Official mandatory Org community for all MPOnline employees (FR-CM-04)"
                                    >
                                        <span className="material-symbols-outlined text-[16px] text-amber-400">lock</span>
                                        <span className="font-bold">Official Org Space (Mandatory)</span>
                                    </div>
                                ) : membershipStatus === 'joined' ? (
                            <button 
                                onClick={handleLeaveAction} 
                                className="w-44 h-10 px-3 bg-slate-900/90 hover:bg-red-600/90 text-white font-bold rounded-xl transition-all backdrop-blur-md border border-slate-700/60 flex items-center justify-center gap-2 text-xs group cursor-pointer shrink-0 shadow-lg"
                            >
                                <span className="material-symbols-outlined text-[18px] group-hover:hidden shrink-0">check_circle</span>
                                <span className="material-symbols-outlined text-[18px] hidden group-hover:block shrink-0">logout</span>
                                <span className="group-hover:hidden truncate font-bold">Joined Member</span>
                                <span className="hidden group-hover:block truncate font-bold">Leave Community</span>
                            </button>
                        ) : membershipStatus === 'subscribed' ? (
                            <div className="flex gap-2 shrink-0">
                                <button 
                                    onClick={handleJoinAction} 
                                    className="w-44 h-10 px-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-[16px] shrink-0">upgrade</span>
                                    <span className="truncate">Upgrade to Member</span>
                                </button>
                                <button 
                                    onClick={handleUnsubscribeAction} 
                                    className="h-10 px-3.5 bg-white/10 hover:bg-red-500/80 text-white font-bold rounded-xl transition-colors backdrop-blur-md border border-white/20 flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0"
                                >
                                    <span className="truncate">Unsubscribe</span>
                                </button>
                            </div>
                        ) : membershipStatus === 'requested' ? (
                            <button 
                                onClick={handleCancelRequest} 
                                className="w-44 h-10 px-3 bg-white/10 text-white font-bold rounded-xl transition-colors backdrop-blur-md border border-white/20 flex items-center justify-center gap-2 opacity-80 hover:bg-red-500/80 hover:opacity-100 group cursor-pointer shrink-0"
                            >
                                <span className="material-symbols-outlined text-[18px] group-hover:hidden shrink-0">schedule</span>
                                <span className="material-symbols-outlined text-[18px] hidden group-hover:block shrink-0">close</span>
                                <span className="group-hover:hidden font-black text-amber-400 truncate">Join Requested</span>
                                <span className="hidden group-hover:block font-bold truncate">Cancel Request</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 shrink-0">
                                {community.type !== 'Private' && (
                                    <button 
                                        onClick={handleSubscribeAction} 
                                        className="h-10 px-3.5 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-colors backdrop-blur-md border border-white/20 flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0"
                                        title="Subscribe as View-Only (FR-CM-06)"
                                    >
                                        <span className="material-symbols-outlined text-[18px] shrink-0">visibility</span>
                                        <span className="truncate">Subscribe (View Only)</span>
                                    </button>
                                )}
                                <button 
                                    onClick={handleJoinAction} 
                                    className="w-44 h-10 px-3 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-1.5 text-xs cursor-pointer shrink-0"
                                >
                                    <span className="material-symbols-outlined text-[18px] shrink-0">group_add</span>
                                    <span className="truncate">{community.type === 'Private' ? 'Request to Join' : 'Join as Member'}</span>
                                </button>
                            </div>
                        )}

                        {/* Share Button (FR-CM-09) */}
                        <button
                            onClick={handleShareCommunity}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors backdrop-blur-md border border-white/20 flex items-center justify-center text-xs cursor-pointer shrink-0"
                            title="Share Community Link"
                        >
                            <span className="material-symbols-outlined text-[18px]">share</span>
                        </button>

                        {isSysAdmin && (
                            <button 
                                onClick={handleDeleteCommunity}
                                className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 text-xs ml-2 cursor-pointer shrink-0"
                                title="Delete / Remove Community (System Admin)"
                            >
                                <span className="material-symbols-outlined text-[18px] shrink-0">delete_forever</span>
                                <span className="truncate">Remove Community</span>
                            </button>
                        )}
                    </div>
                );
            })()}
        </div>
            </section>

            {/* Pending Approval Notice Banner */}
            {community && (community.approvalStatus === 'Pending' || community.isActive === false) && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
                    {isSysAdmin ? (
                        <div className="bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                            <div className="flex items-start sm:items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-2xl">pending_actions</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">Under Administration Review</span>
                                        <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">Community Awaiting Administrator Clearance</h4>
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                        This community was created by <strong className="text-slate-800 dark:text-slate-100">{community.adminContact || 'an employee'}</strong> and is currently inactive and hidden from the public feed.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button 
                                    onClick={handleApproveThisCommunity}
                                    disabled={isApprovingCommunity}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                    <span>{isApprovingCommunity ? 'Approving...' : 'Approve Community'}</span>
                                </button>
                                <button 
                                    onClick={handleRejectThisCommunity}
                                    disabled={isApprovingCommunity}
                                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                    <span>Reject</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-500/10 dark:bg-amber-950/40 border-2 border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-sm">
                            <div className="flex items-center gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-2xl">hourglass_top</span>
                                </div>
                                <div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white">Under Administration Review</span>
                                    <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white mt-1">Your Community is Awaiting Administrator Clearance</h4>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                        You have submitted this community for approval. It will become publicly visible and open for team members once approved by the Administration.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleCancelCommunityRequest}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 self-start sm:self-center"
                                title="Cancel & withdraw this community proposal"
                            >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                                <span>Cancel Request</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                
                {/* Main Content Area */}
                <div className="w-full">
                    
                    {/* Navigation Tabs */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto">
                        <button 
                            onClick={() => setActiveTab('feed')}
                            className={`px-6 py-3 font-bold text-[14px] transition-colors relative shrink-0 ${activeTab === 'feed' ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            Community Feed
                            {activeTab === 'feed' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full"></div>}
                        </button>
                        <button 
                            onClick={() => setActiveTab('members')}
                            className={`px-6 py-3 font-bold text-[14px] transition-colors relative flex items-center gap-2 shrink-0 ${activeTab === 'members' ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">group</span>
                            Members & Roles
                            {membersList.length > 0 && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[11px] px-2 py-0.5 rounded-full font-bold">{membersList.length}</span>}
                            {activeTab === 'members' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full"></div>}
                        </button>
                        <button 
                            onClick={() => setActiveTab('files')}
                            className={`px-6 py-3 font-bold text-[14px] transition-colors relative flex items-center gap-2 shrink-0 cursor-pointer ${activeTab === 'files' ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">folder_open</span>
                            Files & Media
                            {filesList.length > 0 && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[11px] px-2 py-0.5 rounded-full font-bold">{filesList.length}</span>}
                            {activeTab === 'files' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full"></div>}
                        </button>
                        {isAdmin && (
                            <button 
                                onClick={() => setActiveTab('admin')}
                                className={`px-6 py-3 font-bold text-[14px] transition-colors relative flex items-center gap-2 shrink-0 cursor-pointer ${activeTab === 'admin' ? 'text-indigo-500' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                                Admin Panel
                                {joinRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{joinRequests.length}</span>}
                                {activeTab === 'admin' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full"></div>}
                            </button>
                        )}
                    </div>

                    {activeTab === 'feed' && (
                        <div className="space-y-6">
                            
                            {/* FR-CM-06: Member Composer (Can post & comment) */}
                            {membershipStatus === 'joined' ? (
                                <form onSubmit={handleCreatePost} className="glass card-lift bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-indigo-500/20">
                                            {currentUser?.name?.charAt(0) || 'U'}
                                        </div>
                                        <input 
                                            type="text" 
                                            value={postText}
                                            onChange={(e) => setPostText(e.target.value)}
                                            placeholder={`Share an update with ${community.name}...`} 
                                            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500" 
                                        />
                                        {(() => {
                                            const restrictedInPost = checkRestrictedContent(postText);
                                            if (restrictedInPost) {
                                                return (
                                                    <span className="text-rose-500 text-xs font-semibold px-3 py-2 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 shrink-0">
                                                        ⚠️ Restricted word ("{restrictedInPost}")
                                                    </span>
                                                );
                                            }
                                            return (
                                                <button type="submit" className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 shrink-0">
                                                    Post
                                                </button>
                                            );
                                        })()}
                                    </div>
                                </form>
                            ) : membershipStatus === 'requested' ? (
                                /* FR-CM-03: Pending approval banner for requesting user */
                                <div className="relative overflow-hidden rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 p-5 flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-500 shrink-0">
                                        <span className="material-symbols-outlined text-[22px]">schedule</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-amber-700 dark:text-amber-400 text-sm mb-1">
                                            ⏳ Join Request Pending
                                        </h4>
                                        <p className="text-[13px] text-amber-600 dark:text-amber-500 leading-relaxed">
                                            Your request to join <strong>"{community.name}"</strong> is awaiting approval from a Community Admin.
                                            You will receive a notification once your request is reviewed.
                                        </p>
                                        <button
                                            onClick={handleCancelRequest}
                                            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                            Cancel Request
                                        </button>
                                    </div>
                                    {/* Pulsing indicator */}
                                    <div className="shrink-0 flex items-center gap-2">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                        </span>
                                        <span className="text-[11px] font-bold text-amber-500">Awaiting Review</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-100 dark:bg-slate-800/60 rounded-2xl text-center text-slate-500 text-xs font-bold border border-slate-200 dark:border-slate-700">
                                    {community.type === 'Private' ? (
                                        <>🔒 This is a <span className="text-indigo-500">Private Community</span>. Click <strong>"Request to Join"</strong> above to request membership and view discussions.</>
                                    ) : (
                                        <>🔒 You are in <span className="text-indigo-500">Subscriber Mode (View-Only)</span>. Click <strong>"Upgrade to Member"</strong> above to post and comment in this community.</>
                                    )}
                                </div>
                            )}


                            {/* FR-CM-08: Posts Feed & Pinned Content */}
                            {community.type === 'Private' && membershipStatus !== 'joined' && !isAdmin ? (
                                <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3 shadow-sm">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-200/60 dark:border-indigo-800/40">
                                        <span className="material-symbols-outlined text-[28px]">lock</span>
                                    </div>
                                    <h4 className="font-black text-slate-900 dark:text-white text-base">Private Community Discussions</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                                        Posts and discussions in <strong>"{community.name}"</strong> are visible only to approved members. {membershipStatus === 'requested' ? 'Your join request is currently pending administrator approval.' : 'Submit a join request above to gain full access to discussions and resources.'}
                                    </p>
                                </div>
                            ) : sortedPosts.length === 0 ? (
                                <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2 text-slate-300 dark:text-slate-600">chat_bubble_outline</span>
                                    <p className="text-sm font-semibold">No discussions yet in this community.</p>
                                    <p className="text-xs text-slate-400 mt-1">Be the first to share an update or start a conversation!</p>
                                </div>
                            ) : (
                                sortedPosts.slice(0, visiblePostCount).map(post => {
                                    const authorName = typeof post.author === 'string' 
                                        ? post.author 
                                        : (post.author?.name || post.author?.fullName || post.authorName || 'Member');
                                    const authorRole = typeof post.author === 'object' && post.author?.role 
                                        ? post.author.role 
                                        : (post.role || post.authorRole || 'Member');
                                    const rawAvatar = (typeof post.author === 'object' ? post.author?.avatar : null) || post.authorAvatar || post.avatar;
                                    const authorAvatar = rawAvatar ? resolveMediaUrl(rawAvatar) : null;
                                    const authorInitial = (authorName || 'M').charAt(0).toUpperCase();
                                    const target = resolveSharedTarget(post);

                                const isWelcomePost = Boolean(
                                    post.isWelcome ||
                                    String(post.id).startsWith('welcome_') ||
                                    post.role === 'Official Community Space' ||
                                    authorRole === 'Official Community Space' ||
                                    (authorName === community?.name && (post.content || '').toLowerCase().includes('welcome to')) ||
                                    (post.id === 1 && (post.content || '').toLowerCase().includes('welcome to the community'))
                                );

                                return (
                                <div key={post.id} className={`glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 ${isWelcomePost ? 'bg-gradient-to-br from-indigo-50/20 via-white to-slate-50 dark:from-slate-900 dark:to-indigo-950/20 border-indigo-100 dark:border-indigo-900/30' : post.isPinned ? 'ring-2 ring-indigo-500/50 bg-indigo-50/10' : ''}`}>
                                    {isWelcomePost ? (
                                        <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 dark:text-indigo-400 mb-3 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 rounded-lg w-fit border border-indigo-200/50 dark:border-indigo-800/40">
                                            <span className="material-symbols-outlined text-[15px]">verified</span>
                                            Official Community Space
                                        </div>
                                    ) : post.isPinned && (
                                        <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-500 mb-3 uppercase tracking-wider">
                                            <span className="material-symbols-outlined text-[15px]">push_pin</span>
                                            Pinned by Community Admin
                                        </div>
                                    )}
                                    
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            {authorAvatar ? (
                                                <img 
                                                    src={authorAvatar} 
                                                    alt={authorName} 
                                                    className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=6366f1&color=fff&bold=true`;
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold">
                                                    {authorInitial}
                                                </div>
                                            )}
                                            <div>
                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{authorName}</h4>
                                                <p className="text-[12px] text-slate-500">{authorRole} • {post.time || 'Recently'}</p>
                                            </div>
                                        </div>
                                        
                                        {/* FR-CM-07: Moderation Controls (Pin, Delete) - Only for regular user posts, not the official welcome banner */}
                                        {!isWelcomePost && isAdmin && (
                                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                                <button onClick={() => handlePin(post.id)} className={`p-1.5 rounded-lg transition-colors ${post.isPinned ? 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40' : 'text-slate-400 hover:text-indigo-500'}`} title={post.isPinned ? "Unpin Post" : "Pin Post"}>
                                                    <span className="material-symbols-outlined text-[18px]">{post.isPinned ? 'do_not_disturb_on' : 'push_pin'}</span>
                                                </button>
                                                <button onClick={() => handleDelete(post.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors" title="Remove Post">
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {(() => {
                                        const targetComm = resolveTargetCommunityFromPost(post);
                                        const postUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/posts\?id=([a-zA-Z0-9_-]+)/i);
                                        const extractedPostId = target?.id || post.sharedPostId || (postUrlMatch ? postUrlMatch[1] : null) || post.sharedContent?.id || null;
                                        const sharedPostTitleMatch = (post.content || '').match(/Shared (?:Post|Article|Video|Podcast|Profile):\s*"([^"]+)"/i)
                                            || (post.title || '').match(/Shared (?:Post|Article|Video|Podcast|Profile):\s*"([^"]+)"/i);
                                        let sharedPostTitle = post.sharedContent?.title
                                            || (sharedPostTitleMatch ? sharedPostTitleMatch[1] : null);
                                        if (!sharedPostTitle && post.title && !post.title.startsWith('Shared ')) {
                                            sharedPostTitle = post.title;
                                        }
                                        if (!sharedPostTitle && extractedPostId) {
                                            sharedPostTitle = `${target?.label || 'Post'} #${extractedPostId}`;
                                        }

                                        const hasExplicitArticleCard = Boolean(post.sharedArticle || post.type === 'article_share' || (post.content && (post.content.includes('Shared Article:') || post.content.includes('/article-view'))));
                                        const hasExplicitPodcastCard = Boolean(post.sharedPodcast || post.type === 'podcast_share' || (post.content && (post.content.includes('Shared Podcast:') || post.content.includes('/podcasts'))));
                                        const hasExplicitVideoCard = Boolean(post.sharedVideo || post.type === 'video_share' || post.videoUrl || (post.content && (post.content.includes('Shared Video:') || post.content.includes('📹'))));
                                        const hasExplicitProfileCard = Boolean(post.sharedProfile || post.isProfileShare || (post.content && post.content.includes('Shared Profile:')));

                                        const isWikiShare = Boolean(target?.type === 'Wiki' || post.sharedWiki || post.type === 'wiki_share' || (post.postType || '').toLowerCase() === 'wiki' || (post.content && (post.content.includes('Shared Wiki:') || post.content.includes('/wiki/view') || post.content.includes('/wiki'))));

                                        const isSharedPost = Boolean(
                                            !hasExplicitArticleCard && !hasExplicitPodcastCard && !hasExplicitVideoCard && !hasExplicitProfileCard && !isWikiShare &&
                                            (
                                                target ||
                                                extractedPostId || 
                                                (post.content && (post.content.includes('Shared Post:') || post.content.includes('Shared Article:') || post.content.includes('Shared Video:'))) ||
                                                (post.title && (post.title.startsWith('Shared Post:') || post.title.startsWith('Shared Article:'))) ||
                                                post.type === 'post_share' ||
                                                post.sharedContent
                                            )
                                        );

                                        // Clean user commentary if this is a shared post, article, video, or profile:
                                        let userCommentary = post.content || '';
                                        if (isSharedPost || (post.content && (post.content.includes('Shared Article:') || post.content.includes('Shared Video:') || post.content.includes('Shared Profile:')))) {
                                            userCommentary = userCommentary
                                                .replace(/Shared\s+(?:Post|Article|Video|Profile):\s*"[^"]*"/gi, '')
                                                .replace(/(?:https?:\/\/[^\s]+)?\/(?:posts|article-view|videos|profile)\?[^\s]+/gi, '')
                                                .trim();
                                        }

                                        const renderFormattedText = (text) => {
                                            if (!text) return null;
                                            const urlRegex = /(https?:\/\/[^\s]+|\/wiki(?:\/view)?\?[^\s]+)/g;
                                            const parts = text.split(urlRegex);
                                            return parts.map((part, index) => {
                                                if (!part) return null;
                                                if (part.match(urlRegex)) {
                                                    const cleanUrl = part.replace(/[.,;!?)]+$/, '');
                                                    const trailingPunctuation = part.slice(cleanUrl.length);
                                                    const isWikiUrl = cleanUrl.includes('/wiki') || cleanUrl.includes('/wiki/view');

                                                    if (isWikiUrl) {
                                                        let targetPath = '/wiki';
                                                        try {
                                                            const urlObj = new URL(cleanUrl, window.location.origin);
                                                            targetPath = urlObj.pathname + urlObj.search;
                                                        } catch {
                                                            const match = cleanUrl.match(/\/wiki(?:\/view)?(?:\?[^\s]+)?/i);
                                                            targetPath = match ? match[0] : '/wiki';
                                                        }

                                                        return (
                                                            <span key={index} className="inline-block my-1.5 align-middle">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        navigate(targetPath);
                                                                    }}
                                                                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 active:scale-95 text-white shadow-sm hover:shadow-md transition-all group/wiki cursor-pointer"
                                                                    title="Open Wiki"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                                                                    <span className="tracking-wide">Open Wiki</span>
                                                                    <span className="material-symbols-outlined text-[14px] group-hover/wiki:translate-x-0.5 transition-transform">arrow_forward</span>
                                                                </button>
                                                                {trailingPunctuation}
                                                            </span>
                                                        );
                                                    }

                                                    const isInternal = cleanUrl.includes('/posts') || cleanUrl.includes('/article-view') || cleanUrl.includes('/community') || cleanUrl.includes('/videos') || cleanUrl.includes('/podcasts');
                                                    return (
                                                        <React.Fragment key={index}>
                                                            <a
                                                                href={cleanUrl}
                                                                onClick={(e) => {
                                                                    if (isInternal) {
                                                                        e.preventDefault();
                                                                        try {
                                                                            const urlObj = new URL(cleanUrl, window.location.origin);
                                                                            navigate(urlObj.pathname + urlObj.search);
                                                                        } catch {
                                                                            window.open(cleanUrl, '_blank');
                                                                        }
                                                                    }
                                                                }}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-0.5 break-all cursor-pointer"
                                                            >
                                                                <span>{cleanUrl}</span>
                                                                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                                            </a>
                                                            {trailingPunctuation}
                                                        </React.Fragment>
                                                    );
                                                }
                                                return part;
                                            });
                                        };

                                        const sharedAuthor = post.sharedContent?.author || null;

                                        return (
                                            <>
                                                {post.title && !post.title.startsWith('Shared Post:') && (
                                                    <h5 
                                                        onClick={() => {
                                                            if (targetComm) navigate(`/community/view?id=${targetComm.id}`);
                                                            else if (extractedPostId) navigate(`/posts?id=${extractedPostId}`);
                                                        }}
                                                        className={`font-source-sans font-bold text-slate-900 dark:text-white text-sm md:text-base mb-2 flex items-center gap-2 ${(targetComm || extractedPostId) ? 'cursor-pointer hover:text-indigo-500 transition-colors' : ''}`}
                                                    >
                                                        <span className="material-symbols-outlined text-indigo-500 text-[20px]">campaign</span>
                                                        {post.title}
                                                    </h5>
                                                )}
                                                {userCommentary ? (
                                                    <p className="font-source-sans text-[14.5px] text-slate-800 dark:text-slate-200 mb-3 whitespace-pre-wrap leading-relaxed font-normal">
                                                        {renderFormattedText(userCommentary)}
                                                    </p>
                                                ) : null}
                                                
                                                {/* Post Media / Image Attachments — High-Res Grid & Lightbox */}
                                                {(() => {
                                                    const postMedia = normalizePostAttachments(post);
                                                    const postImages = postMedia.images;
                                                    if (!postImages || postImages.length === 0) return null;
                                                    return (
                                                        <div className="mb-4 w-full rounded-2xl overflow-hidden">
                                                            <ImageGrid 
                                                                images={postImages} 
                                                                onImageClick={(idx) => {
                                                                    setLightboxImages(postImages);
                                                                    setLightboxStartIndex(idx);
                                                                }} 
                                                            />
                                                        </div>
                                                    );
                                                })()}

                                                {/* Non-Image Attachments (Documents / Archives / Media) */}
                                                {(() => {
                                                    const postMedia = normalizePostAttachments(post);
                                                    const otherAtts = (postMedia.attachments || []).filter(a => !isImageAttachment(a));
                                                    if (!otherAtts || otherAtts.length === 0) return null;
                                                    return (
                                                        <div className="mb-4 flex flex-col gap-2">
                                                            {otherAtts.map((att, idx) => {
                                                                const rawUrl = att.url || att.fileUrl || '';
                                                                const resolvedUrl = resolveMediaUrl(rawUrl) || rawUrl;
                                                                return (
                                                                    <a
                                                                        key={att.id || idx}
                                                                        href={resolvedUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition-all text-slate-700 dark:text-slate-200 group"
                                                                    >
                                                                        <span className="material-symbols-outlined text-indigo-500 text-[24px]">description</span>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-xs font-bold truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{att.name || 'Document Attachment'}</p>
                                                                            <span className="text-[11px] text-slate-400">Click to view / download</span>
                                                                        </div>
                                                                        <span className="material-symbols-outlined text-slate-400 text-[18px]">download</span>
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                                
                                                {/* Shared Post Modern Quote Card (LinkedIn / Twitter Style) */}
                                                {isSharedPost && (
                                                    <div 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (target?.url) {
                                                                navigate(target.url);
                                                                return;
                                                            }
                                                            const targetId = extractedPostId || post.id || post.postId;
                                                            if (targetId) navigate(`/posts?id=${targetId}`);
                                                        }}
                                                        className={`mb-4 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100/90 dark:hover:bg-slate-850 border border-slate-200/90 dark:border-slate-800 transition-all cursor-pointer group shadow-xs hover:shadow-md ${
                                                            target?.type === 'Article' ? 'hover:border-emerald-400 dark:hover:border-emerald-500/60' :
                                                            target?.type === 'Video' ? 'hover:border-rose-400 dark:hover:border-rose-500/60' :
                                                            target?.type === 'Podcast' ? 'hover:border-pink-400 dark:hover:border-pink-500/60' :
                                                            target?.type === 'Profile' ? 'hover:border-indigo-400 dark:hover:border-indigo-500/60' :
                                                            'hover:border-blue-400 dark:hover:border-blue-500/60'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-3 mb-2.5">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-arial text-[11px] font-bold ${
                                                                    target?.type === 'Article' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60' :
                                                                    target?.type === 'Video' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60' :
                                                                    target?.type === 'Podcast' ? 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60' :
                                                                    target?.type === 'Profile' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60' :
                                                                    'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60'
                                                                }`}>
                                                                    <span className="material-symbols-outlined text-[13px]">{target?.icon || 'repeat'}</span>
                                                                    {target?.label || 'Shared Post'}
                                                                </span>
                                                                {extractedPostId && (
                                                                    <span className="font-arial text-[11px] text-slate-400 dark:text-slate-500 font-mono font-medium">
                                                                        #{extractedPostId}
                                                                    </span>
                                                                )}
                                                                {sharedAuthor && (
                                                                    <span className="font-arial text-[11.5px] text-slate-500 dark:text-slate-400">
                                                                        by <strong className="font-source-sans text-slate-700 dark:text-slate-200 font-semibold">{sharedAuthor}</strong>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className={`flex items-center gap-1 font-source-sans text-[12px] font-bold group-hover:translate-x-0.5 transition-all shrink-0 ${
                                                                target?.type === 'Article' ? 'text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300' :
                                                                target?.type === 'Video' ? 'text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300' :
                                                                target?.type === 'Podcast' ? 'text-pink-600 dark:text-pink-400 group-hover:text-pink-700 dark:group-hover:text-pink-300' :
                                                                target?.type === 'Profile' ? 'text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-300' :
                                                                'text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300'
                                                            }`}>
                                                                <span>{target?.actionText || 'Open Post'}</span>
                                                                <span className="material-symbols-outlined text-[15px]">arrow_outward</span>
                                                            </div>
                                                        </div>

                                                        {/* Quote Box Body with Georgia Italic voice font */}
                                                        <div className={`border-l-3 pl-3.5 py-1.5 bg-white/70 dark:bg-slate-950/40 rounded-r-xl ${
                                                            target?.type === 'Article' ? 'border-emerald-500/70 dark:border-emerald-400/70' :
                                                            target?.type === 'Video' ? 'border-rose-500/70 dark:border-rose-400/70' :
                                                            target?.type === 'Podcast' ? 'border-pink-500/70 dark:border-pink-400/70' :
                                                            target?.type === 'Profile' ? 'border-indigo-500/70 dark:border-indigo-400/70' :
                                                            'border-blue-500/70 dark:border-blue-400/70'
                                                        }`}>
                                                            <p 
                                                                className="font-georgia-italic text-[16px] text-slate-800 dark:text-slate-100 leading-relaxed group-hover:text-blue-950 dark:group-hover:text-white transition-colors line-clamp-3"
                                                                style={{ fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif', fontStyle: 'italic' }}
                                                            >
                                                                "{sharedPostTitle || 'Original Post'}"
                                                            </p>
                                                            <p className="font-arial text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                                                                <span className={`material-symbols-outlined text-[14px] ${
                                                                    target?.type === 'Article' ? 'text-emerald-500/70' :
                                                                    target?.type === 'Video' ? 'text-rose-500/70' :
                                                                    target?.type === 'Podcast' ? 'text-pink-500/70' :
                                                                    target?.type === 'Profile' ? 'text-indigo-500/70' :
                                                                    'text-blue-500/70'
                                                                }`}>{target?.icon || 'chat_bubble'}</span>
                                                                {target?.type === 'Article' ? 'Click to open and read full article' :
                                                                 target?.type === 'Video' ? 'Click to open and watch full video' :
                                                                 target?.type === 'Podcast' ? 'Click to listen to podcast' :
                                                                 target?.type === 'Profile' ? 'Click to view employee profile' :
                                                                 'Click to open post details, discussions & full comments'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Shared Article Interactive Preview Card */}
                                                {(post.sharedArticle || post.type === 'article_share' || (post.content && (post.content.includes('Shared Article:') || post.content.includes('/article-view')))) && (
                                                    <div 
                                                        onClick={() => {
                                                            const articleUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/article-view\?id=(\d+)/i);
                                                            const aId = post.sharedArticle?.id || (articleUrlMatch ? articleUrlMatch[1] : null);
                                                            if (aId) navigate(`/article-view?id=${aId}`);
                                                            else navigate('/articles');
                                                        }}
                                                        className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-green-500/10 border border-emerald-500/30 hover:border-emerald-500 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group shadow-sm hover:shadow-md"
                                                    >
                                                        <div className="flex items-center gap-3.5 min-w-0">
                                                            {post.sharedArticle?.thumbnail ? (
                                                                <img src={resolveMediaUrl(post.sharedArticle.thumbnail)} alt="article" className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md border border-emerald-500/20 group-hover:scale-105 transition-transform" />
                                                            ) : (
                                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-md shadow-emerald-500/30 group-hover:scale-105 transition-transform">
                                                                    <span className="material-symbols-outlined text-[24px]">article</span>
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[12px]">menu_book</span>
                                                                        Shared Article
                                                                    </span>
                                                                </div>
                                                                <h6 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-emerald-500 transition-colors truncate mt-1">
                                                                    {post.sharedArticle?.title || post.title || 'Shared Knowledge Article'}
                                                                </h6>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                                    {post.sharedArticle?.author ? `By ${post.sharedArticle.author} • ` : ''}Click to read full article
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const articleUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/article-view\?id=(\d+)/i);
                                                                const aId = post.sharedArticle?.id || (articleUrlMatch ? articleUrlMatch[1] : null);
                                                                if (aId) navigate(`/article-view?id=${aId}`);
                                                                else navigate('/articles');
                                                            }}
                                                            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 shrink-0 group-hover:translate-x-0.5 cursor-pointer"
                                                        >
                                                            <span>Read Article</span>
                                                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Shared Podcast Interactive Preview Card */}
                                                {(post.sharedPodcast || post.type === 'podcast_share' || (post.content && (post.content.includes('Shared Podcast:') || post.content.includes('/podcasts')))) && (
                                                    <div 
                                                        onClick={() => {
                                                            const podUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/podcasts\?id=(\d+)/i);
                                                            const podId = post.sharedPodcast?.id || (podUrlMatch ? podUrlMatch[1] : null);
                                                            if (podId) navigate(`/podcasts?id=${podId}`);
                                                            else navigate('/podcasts');
                                                        }}
                                                        className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-purple-500/10 border border-pink-500/30 hover:border-pink-500 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group shadow-sm hover:shadow-md"
                                                    >
                                                        <div className="flex items-center gap-3.5 min-w-0">
                                                            {post.sharedPodcast?.thumbnail ? (
                                                                <img src={resolveMediaUrl(post.sharedPodcast.thumbnail)} alt="podcast" className="w-14 h-14 rounded-xl object-cover shrink-0 shadow-md border border-pink-500/20 group-hover:scale-105 transition-transform" />
                                                            ) : (
                                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-600 text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-md shadow-pink-500/30 group-hover:scale-105 transition-transform">
                                                                    <span className="material-symbols-outlined text-[24px]">podcasts</span>
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] bg-pink-100 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[12px]">graphic_eq</span>
                                                                        Shared Podcast
                                                                    </span>
                                                                </div>
                                                                <h6 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-pink-500 transition-colors truncate mt-1">
                                                                    {post.sharedPodcast?.title || post.title || 'Shared Audio Episode'}
                                                                </h6>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                                    {post.sharedPodcast?.author ? `Hosted by ${post.sharedPodcast.author} • ` : ''}Click to listen now
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const podUrlMatch = (post.content || '').match(/(?:https?:\/\/[^\s]+)?\/podcasts\?id=(\d+)/i);
                                                                const podId = post.sharedPodcast?.id || (podUrlMatch ? podUrlMatch[1] : null);
                                                                if (podId) navigate(`/podcasts?id=${podId}`);
                                                                else navigate('/podcasts');
                                                            }}
                                                            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl shadow-md shadow-pink-600/20 transition-all flex items-center justify-center gap-1.5 shrink-0 group-hover:translate-x-0.5 cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                                                            <span>Listen Podcast</span>
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Shared Video Player / Card inside Community Feed Post */}
                                                {(post.sharedVideo || post.type === 'video_share' || post.videoUrl || (post.content && (post.content.includes('Shared Video:') || post.content.includes('📹')))) && (
                                                    <div className="mb-4 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-xl">
                                                        {(() => {
                                                            const vidObj = post.sharedVideo || {
                                                                id: post.id || `shared_vid_${Date.now()}`,
                                                                title: post.title?.replace('📹 Shared Video: ', '').replace(/ — uploaded by.*/, '') || post.content?.replace(/^.*Shared Video: "/, '').replace(/".*/, '') || 'Shared Video',
                                                                sourceUrl: post.videoUrl || post.sourceUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                                                                thumbnail: post.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200',
                                                                author: post.authorName || post.author || 'MPOnline Team'
                                                            };
                                                            const vUrl = vidObj.sourceUrl || vidObj.videoUrl || post.videoUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
                                                            const isYT = vUrl && (vUrl.includes('youtube.com') || vUrl.includes('youtu.be'));
                                                            const thumb = vidObj.thumbnail || getVideoThumbnail(vidObj);

                                                            return (
                                                                <div className="flex flex-col">
                                                                    <div 
                                                                        onClick={() => navigate(`/videos?id=${vidObj.id || ''}&title=${encodeURIComponent(vidObj.title || '')}&url=${encodeURIComponent(vUrl)}`)}
                                                                        className="relative aspect-video w-full bg-slate-950 overflow-hidden group cursor-pointer"
                                                                    >
                                                                        {thumb ? (
                                                                            <img 
                                                                                src={thumb} 
                                                                                alt={vidObj.title} 
                                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                                                            />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-black">
                                                                                <span className="material-symbols-outlined text-slate-700 text-6xl">movie</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
                                                                            <div className="w-16 h-16 rounded-full bg-indigo-600/90 group-hover:bg-indigo-500 text-white flex items-center justify-center shadow-xl shadow-indigo-500/40 group-hover:scale-110 transition-transform">
                                                                                <span className="material-symbols-outlined text-3xl ml-1">play_arrow</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-[11px] font-semibold text-white flex items-center gap-1.5">
                                                                            <span className="material-symbols-outlined text-[14px] text-cyan-400">open_in_full</span>
                                                                            <span>Click to watch on large screen</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-3.5 bg-slate-900 flex items-center justify-between gap-3 border-t border-slate-800">
                                                                        <div className="min-w-0">
                                                                            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                                                <span className="material-symbols-outlined text-[12px]">play_circle</span>
                                                                                SHARED VIDEO
                                                                            </span>
                                                                            <h5 className="font-extrabold text-white text-xs sm:text-sm truncate mt-1">
                                                                                {vidObj.title}
                                                                            </h5>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => navigate(`/videos?id=${vidObj.id || ''}&title=${encodeURIComponent(vidObj.title || '')}&url=${encodeURIComponent(vUrl)}`)}
                                                                            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[16px]">open_in_full</span>
                                                                            <span>Watch on Large Screen</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                                
                                                {/* Shared Profile Card inside Community Post */}
                                                {(post.sharedProfile || post.isProfileShare || (post.content && post.content.includes('Shared Profile:'))) && (() => {
                                                    const prof = post.sharedProfile || {
                                                        name: (post.content?.match(/Shared Profile:\s*"([^"]+)"/i) || [])[1] || 'Colleague',
                                                        fullName: (post.content?.match(/Shared Profile:\s*"([^"]+)"/i) || [])[1] || 'Colleague',
                                                        designation: 'MPOnline Team Member',
                                                        department: 'MPOnline',
                                                        id: (post.content?.match(/\/profile\?id=([a-zA-Z0-9_-]+)/i) || [])[1] || null
                                                    };
                                                    const profId = prof.userId || prof.id;
                                                    const profName = prof.fullName || prof.name || 'User';
                                                    const profAvatar = prof.avatar || prof.profilePhotoUrl;
                                                    const profDesignation = prof.designation || prof.roleName || prof.role || 'Contributor';
                                                    const profDept = prof.department || prof.departmentName || 'General';

                                                    const handleOpenProfile = (e) => {
                                                        e.stopPropagation();
                                                        if (profId) {
                                                            navigate(`/profile?id=${profId}`, { state: { user: prof } });
                                                        } else {
                                                            navigate('/network');
                                                        }
                                                    };

                                                    return (
                                                        <div 
                                                            onClick={handleOpenProfile}
                                                            className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/25 hover:border-indigo-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                                        >
                                                            <div className="flex items-center gap-3.5 min-w-0">
                                                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md overflow-hidden group-hover:scale-105 transition-transform">
                                                                    {profAvatar ? (
                                                                        <img 
                                                                            src={resolveMediaUrl(profAvatar) || profAvatar} 
                                                                            alt={profName} 
                                                                            className="w-full h-full object-cover" 
                                                                            onError={(e) => {
                                                                                e.target.onerror = null;
                                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profName)}&background=6366f1&color=fff&bold=true`;
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        profName.charAt(0).toUpperCase()
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold uppercase tracking-wider">
                                                                        SHARED PROFILE
                                                                    </span>
                                                                    <h4 className="font-extrabold text-slate-900 dark:text-white text-sm truncate mt-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                                        {profName}
                                                                    </h4>
                                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                                        {profDesignation} • {profDept}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={handleOpenProfile}
                                                                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer group-hover:translate-x-0.5"
                                                            >
                                                                <span className="material-symbols-outlined text-[17px]">visibility</span>
                                                                View Profile
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                                
                                                {targetComm && !post.sharedVideo && post.type !== 'video_share' && (
                                                    <div 
                                                        onClick={() => navigate(`/community/view?id=${targetComm.id}`)}
                                                        className="mb-4 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 hover:border-indigo-500 dark:hover:border-indigo-400 transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-sm hover:shadow-md"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-bold text-xl shrink-0 shadow-md shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                                                                <span className="material-symbols-outlined text-[24px]">groups</span>
                                                            </div>
                                                            <div>
                                                                <h6 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-indigo-500 transition-colors flex items-center gap-2">
                                                                    {targetComm.name}
                                                                    <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Community</span>
                                                                </h6>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click to view community discussions, files & members</p>
                                                            </div>
                                                        </div>
                                                        <button className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 shrink-0 group-hover:translate-x-0.5 cursor-pointer">
                                                            <span>Visit Community</span>
                                                            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                    
                                    {/* Action Bar (Like, Comment, Share, Open Post) - Only for regular user posts, not official welcome announcement */}
                                    {!isWelcomePost && (
                                        <div className="flex items-center gap-4 sm:gap-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-slate-500 flex-wrap">
                                            <button 
                                                onClick={() => handleToggleLike(post.id)}
                                                className={`flex items-center gap-2 transition-all text-[13px] font-bold cursor-pointer hover:scale-105 active:scale-95 ${likedPostsMap[String(post.id)] ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'hover:text-indigo-500'}`}
                                                title={likedPostsMap[String(post.id)] ? "Unlike post" : "Like post"}
                                            >
                                                <span 
                                                    className="material-symbols-outlined text-[18px]" 
                                                    style={likedPostsMap[String(post.id)] ? { fontVariationSettings: "'FILL' 1" } : {}}
                                                >
                                                    thumb_up
                                                </span>
                                                <span>{post.likes || 0} {post.likes === 1 ? 'Like' : 'Likes'}</span>
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleToggleComments(post.id)}
                                                className={`flex items-center gap-2 transition-all text-[13px] font-bold cursor-pointer hover:scale-105 active:scale-95 ${activeCommentPostId === String(post.id) ? 'text-indigo-600 dark:text-indigo-400 font-black' : 'hover:text-indigo-500'}`}
                                                title="View or add comments"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">chat_bubble</span>
                                                <span>{post.comments || 0} {post.comments === 1 ? 'Comment' : 'Comments'}</span>
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleSharePost(post)}
                                                className="flex items-center gap-2 hover:text-indigo-500 transition-all text-[13px] font-bold cursor-pointer hover:scale-105 active:scale-95"
                                                title="Share post or copy link"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">share</span>
                                                <span>{post.shares || 0} {post.shares === 1 ? 'Share' : 'Shares'}</span>
                                            </button>

                                            {/* Open Content Action Button (Article / Video / Podcast / Profile / Post / Wiki) */}
                                            <button 
                                                onClick={() => handleOpenPost(post)}
                                                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-xs hover:shadow-sm cursor-pointer ${
                                                    target?.type === 'Wiki' ? 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-600 dark:text-teal-400' :
                                                    target?.type === 'Article' ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400' :
                                                    target?.type === 'Video' ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400' :
                                                    target?.type === 'Podcast' ? 'bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/50 dark:hover:bg-pink-900/60 text-pink-600 dark:text-pink-400' :
                                                    target?.type === 'Profile' ? 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400' :
                                                    'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400'
                                                }`}
                                                title={target ? `Open ${target.label} in full view` : "Open Post in full view"}
                                            >
                                                <span className="material-symbols-outlined text-[16px]">{target?.icon === 'menu_book' ? 'menu_book' : target?.icon === 'smart_display' ? 'smart_display' : target?.icon === 'podcasts' ? 'podcasts' : target?.icon === 'person' ? 'person' : 'open_in_new'}</span>
                                                <span>{target?.actionText || 'Open Post'}</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Real-Time Inline Comments Drawer */}
                                    {!isWelcomePost && activeCommentPostId === String(post.id) && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                                            {/* Add Comment Input */}
                                            <form 
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    handleAddCommunityComment(post.id);
                                                }} 
                                                className="flex items-center gap-2.5"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm overflow-hidden">
                                                    {currentUser?.avatar ? (
                                                        <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        currentUser?.name?.charAt(0) || 'U'
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={commentInputMap[String(post.id)] || ''}
                                                    onChange={(e) => setCommentInputMap(prev => ({ ...prev, [String(post.id)]: e.target.value }))}
                                                    placeholder="Write a comment..."
                                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!(commentInputMap[String(post.id)] || '').trim()}
                                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer shrink-0"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">send</span>
                                                    <span>Comment</span>
                                                </button>
                                            </form>

                                            {/* Comments List */}
                                            {isLoadingComments ? (
                                                <div className="py-2 text-center text-slate-400 text-xs flex items-center justify-center gap-1.5">
                                                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                                    <span>Loading comments...</span>
                                                </div>
                                            ) : (communityCommentsMap[String(post.id)] || []).length > 0 ? (
                                                <div className="space-y-2 mt-1 max-h-64 overflow-y-auto pr-1">
                                                    {(communityCommentsMap[String(post.id)] || []).map((c, cIdx) => (
                                                        <div key={c.id || cIdx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex items-start gap-2.5">
                                                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-[11px] shrink-0 overflow-hidden">
                                                                {c.avatar ? (
                                                                    <img src={c.avatar} alt={c.author} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    (c.author || 'M').charAt(0).toUpperCase()
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate">{c.author}</span>
                                                                    <span className="text-[10px] text-slate-400 shrink-0">{c.time || 'Recently'}</span>
                                                                </div>
                                                                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">{c.text}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-slate-400 italic py-1 text-center">No comments yet. Be the first to start the discussion!</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                            <ScrollLoadingIndicator isVisible={visiblePostCount < sortedPosts.length} text="Loading more community posts on scroll..." />
                        </div>
                    )}

                    {/* Members & Roles Tab */}
                    {activeTab === 'members' && (
                        <div className="space-y-6">
                            <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap bg-slate-50/50 dark:bg-slate-800/50">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                                            <span className="material-symbols-outlined text-indigo-500">group</span>
                                            Community Members & Roles
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">View all team members, assigned community roles, and designations.</p>
                                    </div>
                                    {(!community || community.type !== 'Private' || membershipStatus === 'joined' || isAdmin) && (
                                        <div className="flex items-center gap-3">
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAddMemberModalOpen(true)}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-xs transition-all cursor-pointer shrink-0"
                                                    title="Add organization employees to this community"
                                                >
                                                    <span className="material-symbols-outlined text-[17px]">person_add</span>
                                                    <span>Add Member</span>
                                                </button>
                                            )}
                                            <div className="relative">
                                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                                <input 
                                                    type="text" 
                                                    value={memberSearchQuery}
                                                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                                                    placeholder="Search members..."
                                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {community.type === 'Private' && membershipStatus !== 'joined' && !isAdmin ? (
                                    <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                                            <span className="material-symbols-outlined text-2xl">lock</span>
                                        </div>
                                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Member Directory Restricted</p>
                                        <p className="text-xs max-w-sm mx-auto">The full member directory for this private community is visible only to approved members.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredMembers
                                            .slice(0, visibleMemberCount)
                                            .map(m => {
                                            const badgeBg = m.isCommAdmin 
                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800' 
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800';

                                            return (
                                                <div 
                                                    key={m.displayEmpId || m.employeeId || m.userId || m.id || m.displayName} 
                                                    className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                                                >
                                                    {/* Member Details */}
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <img 
                                                            src={m.resolvedAvatar} 
                                                            alt={m.displayName} 
                                                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => navigate(`/profile?id=${m.userId || m.id || 1}`)}
                                                            title={`View ${m.displayName}'s Profile`}
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=6366f1&color=fff`;
                                                            }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            {/* Name + Employee ID + Role Badge */}
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => navigate(`/profile?id=${m.userId || m.id || 1}`)}
                                                                    className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer text-left transition-colors"
                                                                    title={`View ${m.displayName}'s Profile`}
                                                                >
                                                                    <HighlightText text={m.displayName} query={memberSearchQuery} />
                                                                </button>
                                                                {m.displayEmpId && (
                                                                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700/60 shrink-0">
                                                                        <HighlightText text={m.displayEmpId} query={memberSearchQuery} />
                                                                    </span>
                                                                )}
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-0.5 ${badgeBg}`}>
                                                                    {m.isCommAdmin && <span className="material-symbols-outlined text-[11px]">shield_person</span>}
                                                                    {m.roleName}
                                                                </span>
                                                            </div>
                                                            {/* Designation & Department */}
                                                            <p className="text-[11px] sm:text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                                                <span className="font-medium text-slate-600 dark:text-slate-300">
                                                                    <HighlightText text={m.displayDesignation} query={memberSearchQuery} />
                                                                </span>
                                                                <span className="mx-1 text-slate-300 dark:text-slate-600">•</span>
                                                                <span>
                                                                    <HighlightText text={m.displayDepartment} query={memberSearchQuery} />
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Action Buttons - reduced compact size */}
                                                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                                                         {isAdmin && String(m.userId || m.id) !== String(currentUser?.id) && (
                                                             <>
                                                                 {!m.isCommAdmin && (
                                                                     <button 
                                                                         onClick={() => handleToggleRole(m.userId || m.id, m.memberType)}
                                                                         className="px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                                                                         title="Promote to Community Admin"
                                                                     >
                                                                         <span className="material-symbols-outlined text-[14px]">manage_accounts</span>
                                                                         <span>Admin</span>
                                                                     </button>
                                                                 )}
                                                                 <button 
                                                                     onClick={() => handleInitiateRemoveMember(m)}
                                                                     className="px-2 py-1 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                                                                     title={m.isCommAdmin && getAdminCount() <= 1 ? "Cannot remove sole Community Admin" : "Remove Member from Community"}
                                                                 >
                                                                     <span className="material-symbols-outlined text-[14px]">person_remove</span>
                                                                     <span>Remove</span>
                                                                 </button>
                                                                 <button 
                                                                     onClick={() => handleInitiateSuspendMember(m)}
                                                                     className="px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                                                                     title={m.isCommAdmin && getAdminCount() <= 1 ? "Cannot suspend sole Community Admin" : "Suspend Member"}
                                                                 >
                                                                     <span className="material-symbols-outlined text-[14px]">person_off</span>
                                                                     <span>Suspend</span>
                                                                 </button>
                                                             </>
                                                         )}
                                                         {isMessagingEnabled && String(m.userId || m.id) !== String(currentUser?.userId || currentUser?.id) && (
                                                             <button 
                                                                 onClick={() => navigate(`/messages?userId=${m.userId || m.id}&name=${encodeURIComponent(m.displayName || '')}`)}
                                                                 className="px-2.5 py-1 rounded-lg border border-cyan-200 dark:border-cyan-800/60 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                                                                 title={`Message ${m.displayName || 'member'}`}
                                                             >
                                                                 <span className="material-symbols-outlined text-[14px]">chat</span>
                                                                 <span>Message</span>
                                                             </button>
                                                         )}
                                                     </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <ScrollLoadingIndicator isVisible={visibleMemberCount < filteredMembers.length} text="Loading more community members on scroll..." />
                            </div>
                        </div>
                    )}

                    {/* Files & Media Tab - Enterprise Document Management */}
                    {activeTab === 'files' && (
                        <div className="space-y-6">
                            {community.type === 'Private' && membershipStatus !== 'joined' && !isAdmin ? (
                                <div className="p-12 text-center glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-sm flex flex-col items-center gap-3">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-1 border border-indigo-200 dark:border-indigo-800/60">
                                        <span className="material-symbols-outlined text-[28px]">lock</span>
                                    </div>
                                    <p className="font-bold text-slate-900 dark:text-white text-base">Community Repository Restricted</p>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto">Shared files, institutional documents, and media for this private community are accessible only to approved community members.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Enterprise Toolbar & Filter System */}
                                    <div className="glass bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-4">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            {/* Category Filter Pills with Badges */}
                                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 custom-scrollbar">
                                                {[
                                                    { id: 'All', label: 'All Assets', icon: 'inventory_2', count: fileCategoryCounts.All },
                                                    { id: 'Document', label: 'Documents', icon: 'description', count: fileCategoryCounts.Document },
                                                    { id: 'Image', label: 'Images', icon: 'image', count: fileCategoryCounts.Image },
                                                    { id: 'Video', label: 'Videos', icon: 'movie', count: fileCategoryCounts.Video },
                                                    { id: 'Audio', label: 'Audio', icon: 'audiotrack', count: fileCategoryCounts.Audio },
                                                ].map(cat => {
                                                    const isSelected = fileCategoryFilter === cat.id;
                                                    return (
                                                        <button
                                                            key={cat.id}
                                                            onClick={() => setFileCategoryFilter(cat.id)}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border ${
                                                                isSelected
                                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                                                                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">{cat.icon}</span>
                                                            <span>{cat.label}</span>
                                                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                                            }`}>
                                                                {cat.count || 0}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Action Controls: Search, Sort, View Toggle, Upload */}
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                {/* Search Input */}
                                                <div className="relative flex-1 sm:w-56 md:w-64">
                                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                                    <input
                                                        type="text"
                                                        value={fileSearchQuery}
                                                        onChange={(e) => setFileSearchQuery(e.target.value)}
                                                        placeholder="Filter by name or ext..."
                                                        className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    {fileSearchQuery && (
                                                        <button onClick={() => setFileSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                            <span className="material-symbols-outlined text-[15px]">close</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Sort By Dropdown */}
                                                <div className="relative">
                                                    <select
                                                        value={fileSortBy}
                                                        onChange={(e) => setFileSortBy(e.target.value)}
                                                        className="py-2 pl-3 pr-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 appearance-none"
                                                    >
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="name">Name (A-Z)</option>
                                                        <option value="size">Size (Largest)</option>
                                                    </select>
                                                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px] pointer-events-none">expand_more</span>
                                                </div>

                                                {/* View Switcher: Table vs Grid */}
                                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                                                    <button
                                                        onClick={() => setFileViewMode('table')}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                                                            fileViewMode === 'table'
                                                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                                        }`}
                                                        title="Directory Table View"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">table_rows</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setFileViewMode('grid')}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                                                            fileViewMode === 'grid'
                                                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                                        }`}
                                                        title="Card Grid View"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">grid_view</span>
                                                    </button>
                                                </div>

                                                {/* Upload Button */}
                                                {(membershipStatus === 'joined' || isAdmin) && (
                                                    <button
                                                        onClick={() => setIsUploadModalOpen(true)}
                                                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm shadow-indigo-600/30 flex items-center gap-1.5 shrink-0 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                                        <span>Upload Document</span>
                                                    </button>
                                                )}
                                            </div>
                                    </div>
                                    </div>

                                    {filteredFiles.length === 0 ? (
                                /* 4. Formal Empty State */
                                <div className="p-12 text-center glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-sm flex flex-col items-center gap-3">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto border border-slate-200 dark:border-slate-700">
                                        <span className="material-symbols-outlined text-[32px]">folder_off</span>
                                    </div>
                                    <p className="font-bold text-slate-900 dark:text-white text-base">No Assets Found</p>
                                    <p className="text-xs text-slate-400 max-w-sm">No files in this repository match your current category or search criteria.</p>
                                    {(membershipStatus === 'joined' || isAdmin) && (
                                        <button
                                            onClick={() => setIsUploadModalOpen(true)}
                                            className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/20"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">upload_file</span>
                                            Upload First Document
                                        </button>
                                    )}
                                </div>
                            ) : fileViewMode === 'table' ? (
                                /* 5. Enterprise Directory Table View */
                                <div className="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                <th className="py-3.5 px-4">Document / Asset</th>
                                                <th className="py-3.5 px-4 hidden md:table-cell">Category</th>
                                                <th className="py-3.5 px-4 hidden sm:table-cell">Size</th>
                                                <th className="py-3.5 px-4 hidden lg:table-cell">Uploaded By</th>
                                                <th className="py-3.5 px-4 hidden sm:table-cell">Date Added</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                            {filteredFiles.slice(0, visibleFileCount).map(file => {
                                                const cfg = getFileFormatConfig(file);
                                                const isAudioFile = file.category === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(file.extension?.toLowerCase());
                                                const isVideoFile = file.category === 'Video' || ['mp4', 'webm', 'mov'].includes(file.extension?.toLowerCase());
                                                return (
                                                    <tr key={file.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.border} ${cfg.color}`} title={cfg.label}>
                                                                    <span className="material-symbols-outlined text-[22px]">{cfg.icon}</span>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <span 
                                                                        className="font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md block text-left text-sm select-text"
                                                                        title={file.name}
                                                                    >
                                                                        <HighlightText text={file.name} query={fileSearchQuery} />
                                                                    </span>
                                                                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                                                        <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${cfg.badgeBg}`}>{cfg.badge}</span>
                                                                        <span>•</span>
                                                                        <span>{cfg.label}</span>
                                                                        <span className="sm:hidden">• {file.size}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 hidden md:table-cell">
                                                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                                {file.category}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4 hidden sm:table-cell text-xs font-mono text-slate-600 dark:text-slate-400">
                                                            {file.size}
                                                        </td>
                                                        <td className="py-3.5 px-4 hidden lg:table-cell">
                                                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-[10px] shrink-0 border border-indigo-500/20">
                                                                    {(file.uploadedBy || 'U').charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="truncate max-w-[140px] font-medium">
                                                                    <HighlightText text={file.uploadedBy || 'Member'} query={fileSearchQuery} />
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 hidden sm:table-cell text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                            {formatFileDate(file.uploadedAt)}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button
                                                                    onClick={() => setPreviewModalFile(file)}
                                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                                                                    title="View File"
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                                </button>
                                                                {(file.url || file.Url || file.fileUrl || file.id) && (
                                                                    <button
                                                                        onClick={(e) => handleDownloadFile(e, file)}
                                                                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                                                                        title="Download File"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">download</span>
                                                                    </button>
                                                                )}
                                                                {canDeleteFile(file) && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDeleteFile(file.id, file.name);
                                                                        }}
                                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                                                        title="Delete File"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* 6. Enterprise Grid / Card View */
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {filteredFiles.slice(0, visibleFileCount).map(file => {
                                        const cfg = getFileFormatConfig(file);
                                        const isAudioFile = file.category === 'Audio' || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus', 'weba', 'm4p'].includes(file.extension?.toLowerCase());
                                        const isVideoFile = file.category === 'Video' || ['mp4', 'webm', 'mov'].includes(file.extension?.toLowerCase());
                                        return (
                                            <div key={file.id} className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-all group">
                                                <div>
                                                    {/* Top Row: Format Badge & Category Tag */}
                                                    <div className="flex items-start justify-between gap-3 mb-4">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${cfg.bg} ${cfg.border} ${cfg.color} shadow-sm`}>
                                                            <span className="material-symbols-outlined text-[28px]">{cfg.icon}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${cfg.badgeBg}`}>
                                                                {cfg.badge}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                                                {cfg.label}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Title & Metadata */}
                                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 mb-2 leading-snug select-text" title={file.name}>
                                                        <HighlightText text={file.name} query={fileSearchQuery} />
                                                    </h4>
                                                    
                                                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-4">
                                                        <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-medium">{file.size}</span>
                                                        <span>•</span>
                                                        <span>{formatFileDate(file.uploadedAt)}</span>
                                                    </div>
                                                </div>

                                                {/* Card Footer: Uploader & Action Icons */}
                                                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                                            {(file.uploadedBy || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="truncate max-w-[110px] font-medium">
                                                            <HighlightText text={file.uploadedBy || 'Member'} query={fileSearchQuery} />
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => setPreviewModalFile(file)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                                                            title="View File"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                                                        </button>
                                                        {(file.url || file.Url || file.fileUrl || file.id) && (
                                                            <button
                                                                onClick={(e) => handleDownloadFile(e, file)}
                                                                className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                                                                title="Download File"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">download</span>
                                                            </button>
                                                        )}
                                                        {canDeleteFile(file) && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteFile(file.id, file.name);
                                                                }}
                                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                                                title="Delete File"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <ScrollLoadingIndicator isVisible={visibleFileCount < filteredFiles.length} text="Loading more community files on scroll..." />
                                </>
                            )}
                        </div>
                    )}

                    {/* FR-CM-03 & FR-CM-07: Admin Tools */}
                    {activeTab === 'admin' && isAdmin && (
                        <div className="space-y-6">
                            {/* Pending Join Requests */}
                            <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-500">group_add</span>
                                        Pending Join Requests
                                        {joinRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{joinRequests.length}</span>}
                                    </h3>
                                    <p className="text-[12px] text-slate-500 mt-1">Review and approve members requesting access to this community.</p>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {joinRequests.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500 text-sm">No pending join requests.</div>
                                    ) : (
                                        joinRequests.map(req => {
                                            const norm = normalizeMemberData(req, contextUsers);
                                            return (
                                                <div key={req.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <img 
                                                            src={norm.resolvedAvatar} 
                                                            alt={norm.displayName} 
                                                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700 shadow-sm"
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(norm.displayName)}&background=6366f1&color=fff`;
                                                            }}
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">{norm.displayName}</h4>
                                                                {norm.displayEmpId && (
                                                                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/60 shrink-0">
                                                                        {norm.displayEmpId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[12px] text-slate-500 mt-0.5 whitespace-nowrap">
                                                                {norm.displayDesignation} • {norm.displayDepartment}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button onClick={() => handleReject(req.id, norm.displayName)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                                                            Reject
                                                        </button>
                                                        <button onClick={() => handleApprove(req.id, norm.displayName)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors cursor-pointer shadow-2xs">
                                                            Approve
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Suspended Members (FR-CM-07) */}
                            <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10">
                                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">person_off</span>
                                        Suspended Members
                                        {suspendedMembers.length > 0 && <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{suspendedMembers.length}</span>}
                                    </h3>
                                    <p className="text-[12px] text-slate-500 mt-1">Suspended members cannot post or view content. You can reinstate them at any time.</p>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {suspendedMembers.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500 text-sm">No suspended members.</div>
                                    ) : (
                                        suspendedMembers.map(m => {
                                            const norm = normalizeMemberData(m, contextUsers);
                                            return (
                                                <div key={m.userId || m.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <img 
                                                            src={norm.resolvedAvatar} 
                                                            alt={norm.displayName} 
                                                            className="w-10 h-10 rounded-full object-cover shrink-0 border border-amber-200 dark:border-amber-800 shadow-sm"
                                                            onError={(e) => {
                                                                e.target.onerror = null;
                                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(norm.displayName)}&background=f59e0b&color=fff`;
                                                            }}
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">{norm.displayName}</h4>
                                                                {norm.displayEmpId && (
                                                                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/60 shrink-0">
                                                                        {norm.displayEmpId}
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                                                                    Suspended
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mt-0.5">
                                                                <span>{norm.displayDesignation}</span>
                                                                <span>•</span>
                                                                <span>{norm.displayDepartment}</span>
                                                                <span>•</span>
                                                                <span>Suspended by {m.suspendedBy || 'Admin'}</span>
                                                                {m.suspensionDuration && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200/60 dark:border-amber-800/40">
                                                                            Duration: {m.suspensionDuration}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {m.suspensionReason && (
                                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1 truncate max-w-md">
                                                                    Reason: {m.suspensionReason}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleReinstate(m, norm)}
                                                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">person_add</span>
                                                        Reinstate
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Manage Community Rules & FAQ (FR-CM-08) */}
                            <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-500">gavel</span>
                                            Community Rules & FAQs
                                        </h3>
                                        <p className="text-[12px] text-slate-500 mt-1">Configure the official guidelines and FAQ items displayed to all community members.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveRulesFaq}
                                        disabled={isSavingRulesFaq}
                                        className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                                    >
                                        {isSavingRulesFaq ? (
                                            <>
                                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">save</span>
                                                Save Changes
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="p-6 space-y-8">
                                    {/* Community Rules Builder */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[18px] text-indigo-500">policy</span>
                                                Rules Guidelines ({editRules.length})
                                            </label>
                                        </div>

                                        <div className="space-y-2.5 mb-3">
                                            {editRules.map((rule, idx) => (
                                                <div key={idx} className="flex items-center gap-2 group">
                                                    <span className="text-xs font-black text-slate-400 w-6 shrink-0">{idx + 1}.</span>
                                                    <input
                                                        type="text"
                                                        value={rule}
                                                        onChange={(e) => handleUpdateRule(idx, e.target.value)}
                                                        placeholder={`Rule ${idx + 1}...`}
                                                        className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRule(idx)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                                                        title="Delete rule"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add Rule Input Row */}
                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <input
                                                type="text"
                                                value={newRuleInput}
                                                onChange={(e) => setNewRuleInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRule(); } }}
                                                placeholder="Type a new community rule and click Add..."
                                                className="flex-1 bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddRule}
                                                disabled={!newRuleInput.trim()}
                                                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                                Add Rule
                                            </button>
                                        </div>
                                    </div>

                                    {/* FAQ Builder */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[18px] text-indigo-500">help</span>
                                                Frequently Asked Questions ({editFaq.length})
                                            </label>
                                        </div>

                                        <div className="space-y-3 mb-3">
                                            {editFaq.map((faq, idx) => (
                                                <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl relative group">
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-500">Q&A #{idx + 1}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFaq(idx)}
                                                            className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                                                            title="Delete FAQ"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-slate-400 w-4">Q:</span>
                                                            <input
                                                                type="text"
                                                                value={faq.q}
                                                                onChange={(e) => handleUpdateFaq(idx, 'q', e.target.value)}
                                                                placeholder="Question..."
                                                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-bold"
                                                            />
                                                        </div>
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs font-bold text-slate-400 w-4 pt-1.5">A:</span>
                                                            <textarea
                                                                value={faq.a}
                                                                onChange={(e) => handleUpdateFaq(idx, 'a', e.target.value)}
                                                                placeholder="Answer..."
                                                                rows={2}
                                                                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 resize-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add Q&A Form */}
                                        <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-800/40 space-y-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-400 w-4">Q:</span>
                                                <input
                                                    type="text"
                                                    value={newFaqQ}
                                                    onChange={(e) => setNewFaqQ(e.target.value)}
                                                    placeholder="Enter new question..."
                                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <span className="text-xs font-bold text-slate-400 w-4 pt-1.5">A:</span>
                                                <textarea
                                                    value={newFaqA}
                                                    onChange={(e) => setNewFaqA(e.target.value)}
                                                    placeholder="Enter corresponding answer..."
                                                    rows={2}
                                                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 resize-none"
                                                />
                                            </div>
                                            <div className="flex justify-end pt-1">
                                                <button
                                                    type="button"
                                                    onClick={handleAddFaq}
                                                    disabled={!newFaqQ.trim() || !newFaqA.trim()}
                                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                                    Add FAQ Q&A
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Manage Community Category & Details (FR-CM-01) */}
                            <div className="glass bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-purple-50/40 dark:bg-purple-950/20 flex items-center justify-between gap-4 flex-wrap">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-purple-500">category</span>
                                            Community Category & Classification
                                        </h3>
                                        <p className="text-[12px] text-slate-500 mt-1">Change the official primary category for this community space.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveCategory}
                                        disabled={isSavingCategory}
                                        className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                                    >
                                        {isSavingCategory ? (
                                            <>
                                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[16px]">save</span>
                                                Update Category
                                            </>
                                        )}
                                    </button>
                                </div>
                                <div className="p-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">Primary Category</label>
                                        <select
                                            value={selectedCategory}
                                            onChange={(e) => setSelectedCategory(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                                        >
                                            {availableCategories.map(cat => (
                                                <option key={cat.categoryId || cat.id || cat.name} value={cat.name}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <span className="text-xs text-slate-400 mb-1">Current Active Badge:</span>
                                        <span className="px-3 py-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-black uppercase tracking-wider inline-block text-center">
                                            {community?.category || 'Technology'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Upload File Modal - Enterprise Grade */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/40">
                                    <span className="material-symbols-outlined text-[24px]">drive_folder_upload</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                                        Upload Community Document / Asset
                                    </h3>
                                    <p className="text-[12px] text-slate-400">Publish reference files, reports, and media for community members</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsUploadModalOpen(false);
                                    setSelectedUploadFile(null);
                                    setUploadFileName('');
                                }} 
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleFileUploadSubmit} className="p-6 space-y-4">
                            {/* Drag & Drop File Upload Zone */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    File Attachment *
                                </label>

                                {selectedUploadFile ? (
                                    <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/50 dark:bg-indigo-950/30 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
                                                {(selectedUploadFile.name.split('.').pop() || 'FILE').toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={selectedUploadFile.name}>
                                                    {selectedUploadFile.name}
                                                </p>
                                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                    {selectedUploadFile.size > 1048576 
                                                        ? `${(selectedUploadFile.size / 1048576).toFixed(1)} MB` 
                                                        : `${Math.round(selectedUploadFile.size / 1024)} KB`} • {uploadFileCategory}
                                                </p>
                                            </div>
                                        </div>
                                        <label className="px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer shrink-0 transition-colors">
                                            Change
                                            <input
                                                type="file"
                                                className="hidden"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        const file = e.target.files[0];
                                                        setSelectedUploadFile(file);
                                                        const detected = detectFileTypeAndCategory(file);
                                                        setUploadFileCategory(detected.category);
                                                        setUploadFileName(file.name);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                ) : (
                                    <label
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                                const file = e.dataTransfer.files[0];
                                                setSelectedUploadFile(file);
                                                const detected = detectFileTypeAndCategory(file);
                                                setUploadFileCategory(detected.category);
                                                setUploadFileName(file.name);
                                            }
                                        }}
                                        className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50/50 dark:bg-slate-800/30 transition-all hover:bg-indigo-50/20 group"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform border border-indigo-100 dark:border-indigo-900/40">
                                            <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                Click to browse files or drag & drop here
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                Institutional documents, presentations & media up to 50 MB
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                                            {['PDF', 'DOCX', 'XLSX', 'PPTX', 'MP3', 'PNG/JPG', 'MP4'].map(tag => (
                                                <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                    const file = e.target.files[0];
                                                    setSelectedUploadFile(file);
                                                    const detected = detectFileTypeAndCategory(file);
                                                    setUploadFileCategory(detected.category);
                                                    setUploadFileName(file.name);
                                                }
                                            }}
                                        />
                                    </label>
                                )}
                            </div>

                            {/* Title / Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Document Title / Display Name *
                                </label>
                                <input
                                    type="text"
                                    value={uploadFileName}
                                    onChange={(e) => setUploadFileName(e.target.value)}
                                    placeholder="e.g. Q3_Technology_Roadmap_Final.pdf"
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-medium"
                                />
                            </div>


                            {/* Compliance / Information Classification Callout */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex items-start gap-2.5">
                                <span className="material-symbols-outlined text-[16px] text-indigo-500 shrink-0 mt-0.5">verified_user</span>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                    Uploaded documents are indexed and made available to authorized members of this community in compliance with MPOnline Limited enterprise information governance standards.
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsUploadModalOpen(false);
                                        setSelectedUploadFile(null);
                                        setUploadFileName('');
                                    }}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUploadingFile || !uploadFileName.trim()}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isUploadingFile ? (
                                        <>
                                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                            Uploading Document...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                                            Publish to Community
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}



            {/* Multi-Option Share Community Modal */}
            {isShareModalOpen && (
                <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                        
                        {/* Modal Header */}
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-2.5">
                                {shareTab !== 'menu' && (
                                    <button
                                        onClick={() => setShareTab('menu')}
                                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                                    </button>
                                )}
                                <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 text-base">
                                    <span className="material-symbols-outlined text-indigo-500">share</span>
                                    {shareTab === 'community' ? 'Share to Community' : shareTab === 'users' ? 'Share with Users' : `Share "${community?.name || 'Community'}"`}
                                </h3>
                            </div>
                            <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4">
                            {shareTab === 'menu' && (
                                <div className="space-y-3">
                                    {/* Option 1: Share to Community */}
                                    <div
                                        onClick={() => setShareTab('community')}
                                        className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-700/50 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/20 transition-all flex items-center gap-4 cursor-pointer group"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[24px]">groups</span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-cyan-600 transition-colors">
                                                Share to Community
                                            </h4>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                Post this community recommendation directly into another community's feed
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                                    </div>

                                    {/* Option 2: Share with Users */}
                                    <div
                                        onClick={() => setShareTab('users')}
                                        className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-700/50 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-all flex items-center gap-4 cursor-pointer group"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-[24px]">person_add</span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-purple-600 transition-colors">
                                                Share with Users
                                            </h4>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                Send direct notifications to specific MPOnline team members & colleagues
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-400 text-[18px]">chevron_right</span>
                                    </div>
                                </div>
                            )}

                            {/* Share to Community Sub-View */}
                            {shareTab === 'community' && (
                                <form onSubmit={handleShareToCommunitySubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Select Target Community *
                                        </label>
                                        <select
                                            value={shareTargetCommunity}
                                            onChange={(e) => setShareTargetCommunity(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                                        >
                                            <option value="">-- Choose Community --</option>
                                            {allCommunities.map(c => (
                                                <option key={c.id} value={c.id}>{c.emoji || '🏘️'} {c.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Add Message / Recommendation Note
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={shareMessageNote}
                                            onChange={(e) => setShareMessageNote(e.target.value)}
                                            placeholder="e.g. Check out this community for DevOps engineers, ML pipelines, and Cloud Infrastructure..."
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500"
                                        />
                                    </div>

                                    <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setShareTab('menu')}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSharingProcess}
                                            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-cyan-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">send</span>
                                            Share to Feed
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Share with Users Sub-View */}
                            {shareTab === 'users' && (
                                <form onSubmit={handleShareToUsersSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Select MPOnline Team Members *
                                        </label>
                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800">
                                            {(contextUsers || [])
                                                .filter(u => String(u.userId || u.id) !== String(currentUser?.userId || currentUser?.id))
                                                .map(userItem => {
                                                    const uId = userItem.id || userItem.userId;
                                                    const isSelected = shareSelectedUsers.includes(uId);
                                                    const uName = userItem.name || userItem.fullName || 'User';
                                                    const uRole = userItem.roleName || userItem.designation || userItem.role || 'Employee';
                                                    const uEmp = userItem.employeeId || '';
                                                    const uAvatar = resolveMediaUrl(userItem.avatar || userItem.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(uName)}&background=6366f1&color=fff&bold=true`;

                                                    return (
                                                        <div
                                                            key={uId}
                                                            onClick={() => {
                                                                if (isSelected) {
                                                                    setShareSelectedUsers(prev => prev.filter(id => id !== uId));
                                                                } else {
                                                                    setShareSelectedUsers(prev => [...prev, uId]);
                                                                }
                                                            }}
                                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-all border ${
                                                                isSelected 
                                                                    ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/60 text-purple-600 dark:text-purple-300' 
                                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 border-transparent text-slate-700 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                                                                <img src={uAvatar} alt={uName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-bold text-slate-900 dark:text-white truncate">{uName}</span>
                                                                        {uEmp && <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-semibold">{uEmp}</span>}
                                                                    </div>
                                                                    <div className="text-[11px] text-slate-400 truncate">{uRole}</div>
                                                                </div>
                                                            </div>

                                                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                                                                isSelected 
                                                                    ? 'bg-purple-600 border-purple-600 text-white' 
                                                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                                                            }`}>
                                                                {isSelected && (
                                                                    <svg className="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                            Optional Invitation Message
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={shareMessageNote}
                                            onChange={(e) => setShareMessageNote(e.target.value)}
                                            placeholder="e.g. Hi! I think you would find this community very helpful..."
                                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>

                                    <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShareTab('menu');
                                                setShareUserSearchQuery('');
                                            }}
                                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSharingProcess}
                                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">send</span>
                                            Send Notification ({shareSelectedUsers.length})
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Document / PDF / Multi-Format Preview Modal */}
            {previewModalFile && (() => {
                const ext = (previewModalFile.extension || previewModalFile.name?.split('.').pop() || '').toLowerCase().trim();
                const isAudio = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus', 'weba', 'm4p'].includes(ext) || previewModalFile.category === 'Audio';
                const isPdf = ext === 'pdf';
                const isImage = (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext) || previewModalFile.category === 'Image') && !isAudio;
                const isVideo = (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(ext) || previewModalFile.category === 'Video') && !isAudio;
                const isOfficeDoc = ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext) && !isAudio;
                const isWord = ['docx', 'doc'].includes(ext);
                const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
                const isPowerPoint = ['pptx', 'ppt'].includes(ext);
                const isArchive = (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || previewModalFile.category === 'Archive') && !isAudio;
                const isCode = ['js', 'jsx', 'ts', 'tsx', 'json', 'sql', 'py', 'html', 'css', 'xml', 'md', 'txt'].includes(ext) || previewModalFile.category === 'Code';

                const candidateUrl = (previewModalFile.url && previewModalFile.url !== '#')
                    ? previewModalFile.url
                    : ((previewModalFile.Url && previewModalFile.Url !== '#')
                        ? previewModalFile.Url
                        : ((previewModalFile.fileUrl && previewModalFile.fileUrl !== '#')
                            ? previewModalFile.fileUrl
                            : null));
                const rawDisplayUrl = (activeFilePreviewUrl && activeFilePreviewUrl !== '#')
                    ? activeFilePreviewUrl
                    : (candidateUrl || (isPdf ? (activePdfBlobUrl || SAMPLE_PDF_DATA_URL) : null));
                const displayUrl = rawDisplayUrl ? resolveMediaUrl(rawDisplayUrl) : (isPdf ? SAMPLE_PDF_DATA_URL : null);

                const docTypeBadgeColor = isAudio
                    ? 'bg-violet-500/10 text-violet-500 border-violet-500/20'
                    : isPdf
                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                    : isWord
                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    : isExcel
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : isPowerPoint
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : isVideo
                    ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                    : isImage
                    ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                    : isArchive
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';

                const docIcon = isAudio
                    ? 'audiotrack'
                    : isPdf
                    ? 'picture_as_pdf'
                    : isWord
                    ? 'description'
                    : isExcel
                    ? 'table_chart'
                    : isPowerPoint
                    ? 'slideshow'
                    : isVideo
                    ? 'movie'
                    : isImage
                    ? 'image'
                    : isArchive
                    ? 'folder_zip'
                    : isCode
                    ? 'code'
                    : 'description';

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/90 shrink-0 gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0 border ${docTypeBadgeColor}`}>
                                        <span className="material-symbols-outlined text-[24px]">
                                            {docIcon}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-900 dark:text-white text-base truncate max-w-sm sm:max-w-md lg:max-w-xl" title={previewModalFile.name}>
                                            {previewModalFile.name}
                                        </h3>
                                        <div className="text-[12px] text-slate-500 flex items-center gap-2 mt-0.5">
                                            <span className="font-bold text-indigo-500 uppercase">{ext || previewModalFile.category || 'DOC'}</span>
                                            <span>•</span>
                                            <span>{previewModalFile.size || '3.4 MB'}</span>
                                            <span>•</span>
                                            <span>Uploaded by {previewModalFile.uploadedBy || 'Team Member'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Image Zoom Controls */}
                                    {isImage && (
                                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                                            <button
                                                onClick={() => setPreviewZoom(prev => Math.max(prev - 0.25, 0.5))}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                title="Zoom Out"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">remove</span>
                                            </button>
                                            <button
                                                onClick={() => setPreviewZoom(1)}
                                                className="px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-500"
                                                title="Reset Zoom"
                                            >
                                                {Math.round(previewZoom * 100)}%
                                            </button>
                                            <button
                                                onClick={() => setPreviewZoom(prev => Math.min(prev + 0.25, 3))}
                                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                title="Zoom In"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">add</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* PDF View Mode Toggle (PDF Document vs Text Summary) */}
                                    {isPdf && (
                                        <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                                            <button
                                                onClick={() => setPreviewTab('viewer')}
                                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                                    previewTab === 'viewer'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                PDF Viewer
                                            </button>
                                            <button
                                                onClick={() => setPreviewTab('summary')}
                                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                                    previewTab === 'summary'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                Document Overview
                                            </button>
                                        </div>
                                    )}

                                    {/* Open Full View (Direct in new window) */}
                                    {displayUrl && (
                                        <a
                                            href={displayUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-decoration-none shadow-sm"
                                            title="Open Full Document in New Window"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                            <span className="hidden sm:inline">Open Full View</span>
                                        </a>
                                    )}

                                    {/* Download Document Button */}
                                    {displayUrl && (
                                        <button
                                            onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
                                            title="Download File"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">download</span>
                                            <span className="hidden sm:inline">Download</span>
                                        </button>
                                    )}

                                    {/* Close Button */}
                                    <button
                                        onClick={() => setPreviewModalFile(null)}
                                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                        title="Close Preview (Esc)"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 md:p-5 relative overflow-hidden flex items-center justify-center">
                                {isImage ? (
                                    <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                                        <img
                                            src={displayUrl}
                                            alt={previewModalFile.name}
                                            style={{ transform: `scale(${previewZoom})` }}
                                            className="max-h-full max-w-full object-contain rounded-xl shadow-lg transition-transform duration-150"
                                        />
                                    </div>
                                ) : isVideo ? (
                                    <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-2xl">
                                        <video
                                            src={displayUrl}
                                            controls
                                            autoPlay
                                            playsInline
                                            className="w-full max-h-[65vh] rounded-2xl object-contain"
                                        >
                                            Your browser does not support HTML5 Video playback.
                                        </video>
                                    </div>
                                ) : isPdf ? (
                                    previewTab === 'viewer' ? (
                                        <div className="w-full h-full relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner bg-white">
                                            <iframe
                                                src={`${displayUrl}#toolbar=1&navpanes=0&view=Fit`}
                                                title={previewModalFile.name}
                                                className="w-full h-full border-0 bg-white"
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-left text-slate-800 dark:text-slate-200 max-h-[72vh] overflow-y-auto custom-scrollbar shadow-xl">
                                            <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                                                <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center font-bold text-2xl shrink-0 border border-red-500/20 shadow-sm">
                                                    <span className="material-symbols-outlined text-[32px]">picture_as_pdf</span>
                                                </div>
                                                <div>
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                                                        Official Architecture Document
                                                    </span>
                                                    <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">System Architecture & Integration Overview</h4>
                                                    <p className="text-xs text-slate-500 mt-0.5">MPOnline Limited Enterprise Knowledge Platform (Knome)</p>
                                                </div>
                                            </div>

                                            <div className="space-y-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/60">
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-2 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-indigo-500">layers</span>
                                                        1. Platform Core Architecture
                                                    </h5>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                        Knome operates on a decoupled modern architecture combining ASP.NET Core 10 on the backend with Microsoft SQL Server, Serilog partitioned audit streaming, and a high-performance React/Vite web application client.
                                                    </p>
                                                </div>

                                                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/60">
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-2 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-emerald-500">security</span>
                                                        2. Security, Isolation & DPDP Governance
                                                    </h5>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                        Built with strict role-based access control (Employee, Community Admin, HR Admin, System Admin), Bcrypt work factor 11 password hashing, JWT HS256 tokens, and automatic PII scrubbing compliant with India's DPDP Act 2023.
                                                    </p>
                                                </div>

                                                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/60">
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-sm mb-2 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[18px] text-purple-500">groups</span>
                                                        3. Community Knowledge & File Isolation
                                                    </h5>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                        Communities maintain segregated document repositories with live file uploads, IndexedDB persistence caches, and real-time interaction syncing across all connected departments.
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-3 pt-3">
                                                    <button
                                                        onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                                        Download PDF ({previewModalFile.size})
                                                    </button>
                                                    <button
                                                        onClick={() => setPreviewTab('viewer')}
                                                        className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                        Switch to Full PDF Viewer
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : isAudio ? (
                                    <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl flex flex-col items-center">
                                        <div className="w-24 h-24 rounded-3xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-4xl mb-5 border border-violet-500/20 shadow-sm">
                                            <span className="material-symbols-outlined text-[48px]">audiotrack</span>
                                        </div>
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 mb-2">
                                            Digital Audio Asset
                                        </span>
                                        <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-1 truncate max-w-md" title={previewModalFile.name}>
                                            {previewModalFile.name}
                                        </h4>
                                        <p className="text-xs text-slate-500 mb-6 font-mono">{previewModalFile.size} • Uploaded by {previewModalFile.uploadedBy || 'Team Member'}</p>
                                        <div className="w-full bg-slate-50 dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 mb-6 shadow-inner">
                                            {displayUrl ? (
                                                <audio
                                                    src={displayUrl}
                                                    controls
                                                    autoPlay
                                                    className="w-full outline-none"
                                                >
                                                    Your browser does not support HTML5 Audio playback.
                                                </audio>
                                            ) : (
                                                <div className="text-center py-3 text-xs text-amber-500 font-medium">
                                                    Audio URL is not available. Please verify the uploaded file.
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">download</span>
                                                Download Audio Track ({previewModalFile.size})
                                            </button>
                                        </div>
                                    </div>
                                ) : isOfficeDoc ? (
                                    <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-left text-slate-800 dark:text-slate-200 max-h-[72vh] overflow-y-auto custom-scrollbar shadow-2xl">
                                        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-3xl shrink-0 border shadow-sm ${docTypeBadgeColor}`}>
                                                <span className="material-symbols-outlined text-[36px]">
                                                    {isWord ? 'description' : isExcel ? 'table_chart' : 'slideshow'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    isWord ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' :
                                                    isExcel ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' :
                                                    'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                                                }`}>
                                                    {isWord ? 'Microsoft Word Document' : isExcel ? 'Excel Spreadsheet' : 'PowerPoint Presentation'}
                                                </span>
                                                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{previewModalFile.name}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{previewModalFile.size} • Uploaded by {previewModalFile.uploadedBy || 'Team Member'}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                                            <h5 className="font-bold text-slate-900 dark:text-white text-base">API Integration Guidelines & Specifications</h5>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                                Comprehensive technical guide detailing REST API endpoints, JWT authentication tokens, ApiResponse standard envelopes, and DPDP compliance standards for MPOnline integration developers.
                                            </p>

                                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                                                <div className="font-bold text-indigo-500 uppercase tracking-wider text-[11px]">Key Documentation Modules:</div>
                                                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono">
                                                    <span className="material-symbols-outlined text-[14px] text-blue-500">check_circle</span>
                                                    <span>1. Authentication & Session Security (<code>/api/v1/auth/login</code>)</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono">
                                                    <span className="material-symbols-outlined text-[14px] text-blue-500">check_circle</span>
                                                    <span>2. Community Management & Role Delegation (<code>/api/v1/communities</code>)</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono">
                                                    <span className="material-symbols-outlined text-[14px] text-blue-500">check_circle</span>
                                                    <span>3. Posts, Media Channels & Interaction Engine (<code>/api/v1/posts</code>)</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono">
                                                    <span className="material-symbols-outlined text-[14px] text-blue-500">check_circle</span>
                                                    <span>4. Global Search, Filter Queries & Audit Logs</span>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 pt-3">
                                                {displayUrl && (
                                                    <button
                                                        onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                                        Download Document ({previewModalFile.size})
                                                    </button>
                                                )}
                                                {displayUrl && (displayUrl.startsWith('http://') || displayUrl.startsWith('https://')) && (
                                                    <a
                                                        href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(displayUrl)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                        Open with Office Online
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : isArchive ? (
                                    <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-left text-slate-800 dark:text-slate-200 max-h-[72vh] overflow-y-auto custom-scrollbar shadow-2xl">
                                        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                                            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold text-3xl shrink-0 border border-amber-500/20 shadow-sm">
                                                <span className="material-symbols-outlined text-[36px]">folder_zip</span>
                                            </div>
                                            <div>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                                                    Compressed Archive
                                                </span>
                                                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{previewModalFile.name}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{previewModalFile.size} • Uploaded by {previewModalFile.uploadedBy || 'Team Member'}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h5 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider text-slate-500">Contained Archive Files (4 files)</h5>
                                            <div className="space-y-2">
                                                {[
                                                    { name: 'src/components/ui/DesignSystem.tsx', size: '42 KB', type: 'TypeScript' },
                                                    { name: 'src/styles/theme.config.css', size: '18 KB', type: 'CSS' },
                                                    { name: 'public/assets/logos/knome_brand.svg', size: '120 KB', type: 'SVG' },
                                                    { name: 'README_SETUP_GUIDE.md', size: '8 KB', type: 'Markdown' }
                                                ].map((item, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs">
                                                        <span className="font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-[16px] text-amber-500">draft</span>
                                                            {item.name}
                                                        </span>
                                                        <span className="text-slate-500">{item.size} • {item.type}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {displayUrl && (
                                                <div className="pt-3">
                                                    <button
                                                        onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                                        className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                                        Download Archive ({previewModalFile.size})
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 text-left text-slate-800 dark:text-slate-200 max-h-[72vh] overflow-y-auto custom-scrollbar shadow-2xl">
                                        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-6">
                                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold text-3xl shrink-0 border border-indigo-500/20 shadow-sm">
                                                <span className="material-symbols-outlined text-[36px]">description</span>
                                            </div>
                                            <div>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                                    {ext ? ext.toUpperCase() : 'Enterprise Asset'}
                                                </span>
                                                <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{previewModalFile.name}</h4>
                                                <p className="text-xs text-slate-500 mt-0.5">{previewModalFile.size} • Uploaded by {previewModalFile.uploadedBy || 'Team Member'}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
                                            <p>This file is stored in the community repository. You can download or view it externally:</p>
                                            {displayUrl && (
                                                <div className="flex items-center gap-3 pt-2">
                                                    <button
                                                        onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                                        Download File ({previewModalFile.size})
                                                    </button>
                                                    <a
                                                        href={displayUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                        Open in New Tab
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500 shrink-0">
                                <span className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                                    <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
                                    MPOnline Enterprise Document Viewer
                                </span>
                                <div className="flex items-center gap-4">
                                    {displayUrl && (
                                        <button
                                            onClick={(e) => handleDownloadFile(e, previewModalFile)}
                                            className="font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-500 transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">download</span>
                                            Download
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setPreviewModalFile(null)}
                                        className="font-bold text-indigo-500 hover:text-indigo-600 cursor-pointer"
                                    >
                                        Close Preview
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 1. Admin Protection Warning Modal */}
            {adminProtectionWarning && (
                <div className="fixed inset-0 z-[9999] overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md my-auto rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center overflow-y-auto flex-1 min-h-0">
                            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-800/50 shadow-sm shrink-0">
                                <span className="material-symbols-outlined text-[34px]">admin_panel_settings</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                                {adminProtectionWarning.title || 'Community Admin Protection'}
                            </h3>
                            <div className="bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 rounded-xl p-3.5 mb-5 text-left">
                                <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed whitespace-pre-line">
                                    {adminProtectionWarning.message}
                                </p>
                            </div>
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={() => setAdminProtectionWarning(null)}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                                >
                                    I Understand
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Suspend Member Duration Popup Modal */}
            <SuspendUserModal
                isOpen={!!suspendModalMember}
                onClose={() => setSuspendModalMember(null)}
                user={suspendModalMember}
                title="Suspend Community Member"
                subtitle="Choose suspension period and reason"
                onConfirm={handleConfirmSuspendMember}
            />

            {/* 3. Remove Member Confirmation Modal */}
            {removeModalMember && (
                <div className="fixed inset-0 z-[9999] overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-md my-auto rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-red-50/70 dark:bg-red-950/20 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
                                    <span className="material-symbols-outlined text-[22px]">person_remove</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-base">Remove Member</h3>
                                    <p className="text-[12px] text-slate-500">Confirm member removal</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setRemoveModalMember(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                                <img
                                    src={removeModalMember.resolvedAvatar || resolveMediaUrl(removeModalMember.profilePhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(removeModalMember.displayName || removeModalMember.fullName || removeModalMember.name || 'User')}&background=6366f1&color=fff`}
                                    alt={removeModalMember.displayName || removeModalMember.fullName || removeModalMember.name}
                                    className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                                        {removeModalMember.displayName || removeModalMember.fullName || removeModalMember.name}
                                    </h4>
                                    <p className="text-xs text-slate-500 truncate">
                                        {removeModalMember.displayDesignation || removeModalMember.designation || 'Member'} • {removeModalMember.displayDepartment || removeModalMember.department || 'MPOnline'}
                                    </p>
                                </div>
                                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 shrink-0">
                                    {removeModalMember.roleName || removeModalMember.memberType || 'Member'}
                                </span>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                Are you sure you want to remove <strong className="text-slate-900 dark:text-white font-bold">{removeModalMember.displayName || removeModalMember.fullName || removeModalMember.name}</strong> from this community?
                            </p>

                            <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 rounded-xl text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2">
                                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5 text-red-500">warning</span>
                                <span>
                                    {removeModalMember.memberType === 'Admin' || removeModalMember.memberType === 'Moderator' || removeModalMember.memberType === 'Community Administrator' || removeModalMember.memberType === 'Community Admin'
                                        ? 'This user is a Community Admin. Once removed, they will lose all admin privileges. Remaining admins will continue managing the community.'
                                        : 'They will immediately lose access to private discussions, files, and community activities.'}
                                </span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-2.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => setRemoveModalMember(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRemoveMember}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">person_remove</span>
                                Yes, Remove Member
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. Add Members to Community Modal (Admin Feature) */}
            {isAddMemberModalOpen && (
                <div className="fixed inset-0 z-[9999] overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl my-auto rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 shrink-0">
                                    <span className="material-symbols-outlined text-[22px]">group_add</span>
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Add Members to Community</h3>
                                    <p className="text-[12px] text-slate-500">Search and enroll organization employees into "{community?.name}"</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setIsAddMemberModalOpen(false);
                                    setSelectedUserIdsToAdd([]);
                                    setAddMemberSearch('');
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Filter Bar & Role Selector */}
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                            <div className="relative flex-1">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                <input
                                    type="text"
                                    value={addMemberSearch}
                                    onChange={(e) => setAddMemberSearch(e.target.value)}
                                    placeholder="Search employee by name, ID, department..."
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-medium shrink-0">Assign Role:</span>
                                <select
                                    value={selectedRoleToAdd}
                                    onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="Member">Member</option>
                                    <option value="Admin">Community Admin</option>
                                </select>
                            </div>
                        </div>

                        {/* Selection quick actions */}
                        <div className="px-6 py-2 bg-slate-100/50 dark:bg-slate-800/50 border-b border-slate-200/50 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
                            <span>
                                Selected: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedUserIdsToAdd.length}</strong> employee(s)
                            </span>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentMemberKeys = new Set();
                                        membersList.filter(m => m.status === 'Approved' || m.status === 'Active' || !m.status).forEach(m => {
                                            if (m.userId) currentMemberKeys.add(String(m.userId).toLowerCase());
                                            if (m.id) currentMemberKeys.add(String(m.id).toLowerCase());
                                            if (m.employeeId) currentMemberKeys.add(String(m.employeeId).toUpperCase());
                                            if (m.empId) currentMemberKeys.add(String(m.empId).toUpperCase());
                                        });
                                        const pool = (allOrgUsers && allOrgUsers.length > 0) ? allOrgUsers : (contextUsers || []);
                                        const availableIds = pool
                                            .filter(u => {
                                                const uid = String(u.id || u.userId || '').toLowerCase();
                                                const emp = String(u.employeeId || u.empId || '').toUpperCase();
                                                return !((uid && currentMemberKeys.has(uid)) || (emp && currentMemberKeys.has(emp)));
                                            })
                                            .map(u => u.id || u.userId);
                                        setSelectedUserIdsToAdd(availableIds);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold cursor-pointer"
                                >
                                    Select All Non-Members
                                </button>
                                {selectedUserIdsToAdd.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUserIdsToAdd([])}
                                        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Employee List */}
                        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoadingOrgUsers ? (
                                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-3xl animate-spin text-indigo-500">progress_activity</span>
                                    <p className="text-xs">Loading employee directory...</p>
                                </div>
                            ) : filteredEmployeesToAdd.length === 0 ? (
                                <div className="py-12 text-center text-slate-400 space-y-1">
                                    <span className="material-symbols-outlined text-3xl">group_off</span>
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">No matching employees found</p>
                                </div>
                            ) : (
                                filteredEmployeesToAdd.map(user => {
                                    const uId = user.id || user.userId;
                                    const uEmpId = String(user.employeeId || user.empId || '').toUpperCase();
                                    const uName = String(user.name || user.fullName || '').toLowerCase();
                                    const isAlreadyMember = membersList.some(m => {
                                        const mUid = String(m.userId || m.id || '');
                                        const mEmpId = String(m.employeeId || m.empId || '').toUpperCase();
                                        const mName = String(m.fullName || m.name || '').toLowerCase();
                                        const isMatch = (uId && mUid === String(uId)) ||
                                                        (uEmpId && mEmpId && uEmpId === mEmpId) ||
                                                        (uName && mName && uName === mName);
                                        return isMatch && (m.status === 'Approved' || m.status === 'Active' || !m.status);
                                    });
                                    const isSelected = selectedUserIdsToAdd.some(x => String(x) === String(uId));

                                    return (
                                        <div
                                            key={uId}
                                            onClick={() => {
                                                if (isAlreadyMember) return;
                                                setSelectedUserIdsToAdd(prev => 
                                                    prev.some(x => String(x) === String(uId)) 
                                                        ? prev.filter(x => String(x) !== String(uId)) 
                                                        : [...prev, uId]
                                                );
                                            }}
                                            className={`py-3 px-3 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                                                isAlreadyMember 
                                                    ? 'opacity-60 bg-slate-50/50 dark:bg-slate-800/20 cursor-not-allowed' 
                                                    : isSelected
                                                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 cursor-pointer'
                                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected || isAlreadyMember}
                                                    disabled={isAlreadyMember}
                                                    onChange={() => {}}
                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                                />
                                                <img
                                                    src={user.avatar || user.profilePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.fullName || 'User')}&background=6366f1&color=fff`}
                                                    alt={user.name || user.fullName}
                                                    className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                                    onError={(e) => {
                                                        e.currentTarget.onerror = null;
                                                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.fullName || 'User')}&background=6366f1&color=fff`;
                                                    }}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                                            {user.name || user.fullName}
                                                        </span>
                                                        {user.employeeId && (
                                                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                                                                {user.employeeId}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                        {user.designation || 'Employee'} • {user.department || user.departmentName || 'MPOnline'}
                                                    </p>
                                                </div>
                                            </div>

                                            {isAlreadyMember ? (
                                                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shrink-0 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">check</span>
                                                    Already Member
                                                </span>
                                            ) : isSelected ? (
                                                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                                                    Selected
                                                </span>
                                            ) : null}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0">
                            <span className="text-xs text-slate-500">
                                Will be added as <strong className="text-slate-800 dark:text-slate-200">{selectedRoleToAdd}</strong>
                            </span>
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddMemberModalOpen(false);
                                        setSelectedUserIdsToAdd([]);
                                    }}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedUserIdsToAdd.length === 0 || isSavingMembers}
                                    onClick={handleAddSelectedMembers}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                    {isSavingMembers ? (
                                        <>
                                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                            <span>Adding...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                                            <span>Add {selectedUserIdsToAdd.length > 0 ? `${selectedUserIdsToAdd.length} Member${selectedUserIdsToAdd.length > 1 ? 's' : ''}` : 'Members'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Universal Share Modal for Community Posts */}
            {sharingPost && (() => {
                const shareTarget = resolveSharedTarget(sharingPost);
                return (
                    <ArticleShareModal 
                        isOpen={isPostShareModalOpen} 
                        onClose={() => {
                            setIsPostShareModalOpen(false);
                            setSharingPost(null);
                        }} 
                        post={sharingPost}
                        contentType={shareTarget?.type || "Post"}
                        onShared={(type, count) => {
                            const pid = String(sharingPost.id || sharingPost.postId);
                            setPosts(prev => prev.map(p => {
                                if (String(p.id) === pid || String(p.postId) === pid) {
                                    const next = Number(p.shares || p.sharesCount || 0) + (count || 1);
                                    return { ...p, shares: next, sharesCount: next };
                                }
                                return p;
                            }));
                        }}
                    />
                );
            })()}

            {/* Fullscreen Image Lightbox */}
            {lightboxImages && (
                <ImageLightbox
                    images={lightboxImages}
                    startIndex={lightboxStartIndex}
                    onClose={() => setLightboxImages(null)}
                />
            )}
        </main>
    );
}
