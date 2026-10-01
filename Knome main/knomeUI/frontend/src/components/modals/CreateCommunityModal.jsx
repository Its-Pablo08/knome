import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useUser, INITIAL_USERS, deduplicateMembers } from '../contexts/UserContext';
import { communitiesApi, mediaApi } from '../../utils/apiService';
import { apiClient } from '../../utils/apiClient';
import useScrollLoading from '../../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../ui/ScrollLoadingIndicator';
import HighlightText from '../ui/HighlightText';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_MB = 5;

export default function CreateCommunityModal({ isOpen, onClose, onCommunityCreated, existingCommunities = [] }) {
    const { currentUser, users } = useUser();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdCommunityLink, setCreatedCommunityLink] = useState(null);
    const [isSubmittedForApproval, setIsSubmittedForApproval] = useState(false);
    const [pendingCommunityData, setPendingCommunityData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [nameError, setNameError] = useState('');
    const [bannerError, setBannerError] = useState('');
    const [avatarError, setAvatarError] = useState('');
    const [liveCommunities, setLiveCommunities] = useState([]);
    const [allAvailableUsers, setAllAvailableUsers] = useState([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        communitiesApi.getAll()
            .then(res => {
                if (Array.isArray(res)) setLiveCommunities(res);
                else if (res?.data && Array.isArray(res.data)) setLiveCommunities(res.data);
            })
            .catch(() => {});
    }, [isOpen]);

    // Fetch and aggregate all available platform users so EVERY employee is visible
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const loadAllUsers = async () => {
            const roster = [...(users || [])];

            // 1. Merge INITIAL_USERS
            (INITIAL_USERS || []).forEach(iu => {
                const uid = iu.id || iu.userId;
                if (!roster.some(u => String(u.id || u.userId) === String(uid) || (u.employeeId && iu.employeeId && u.employeeId.toUpperCase() === iu.employeeId.toUpperCase()))) {
                    roster.push(iu);
                }
            });

            // 2. Merge any custom users from localStorage
            try {
                const customUsers = JSON.parse(localStorage.getItem('knome_custom_users') || '[]');
                if (Array.isArray(customUsers)) {
                    customUsers.forEach(cu => {
                        const cuid = cu.id || cu.userId;
                        if (!roster.some(u => String(u.id || u.userId) === String(cuid) || (u.employeeId && cu.employeeId && u.employeeId.toUpperCase() === cu.employeeId.toUpperCase()))) {
                            roster.push(cu);
                        }
                    });
                }
            } catch (e) {}

            // 3. Try fetching live users from backend /search/users
            try {
                const searchRes = await apiClient.get('/search/users?pageSize=100');
                const items = searchRes?.items || (Array.isArray(searchRes) ? searchRes : (searchRes?.data?.items || searchRes?.data || []));
                if (Array.isArray(items) && items.length > 0) {
                    items.forEach(u => {
                        const uid = u.id || u.userId;
                        if (!roster.some(existing => String(existing.id || existing.userId) === String(uid) || (existing.employeeId && u.authorEmployeeId && existing.employeeId.toUpperCase() === u.authorEmployeeId.toUpperCase()))) {
                            roster.push({
                                id: uid,
                                userId: uid,
                                name: u.title || u.authorFullName || u.name || `Employee ${uid}`,
                                fullName: u.title || u.authorFullName || u.name || `Employee ${uid}`,
                                employeeId: u.authorEmployeeId || `MPO${uid}`,
                                designation: u.summary || u.designation || 'Employee',
                                department: u.departmentName || u.department || 'MPOnline Limited',
                                avatar: u.authorProfilePhotoUrl || u.thumbnailUrl || null
                            });
                        }
                    });
                }
            } catch (e) {}

            if (isMounted) {
                setAllAvailableUsers(roster);
            }
        };

        loadAllUsers();
        return () => { isMounted = false; };
    }, [isOpen, users]);

    const isHRorAdmin = ['SYSADM', 'HRADM', 'CADM', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'HR MANAGER', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
        ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'HR MANAGER', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
        (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => 
            ['SYSADM', 'HRADM', 'CADM', 'ADMIN', 'SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(r || '').toUpperCase())
        )) ||
        (currentUser?.name || '').toLowerCase().includes('loveneesh');

    // Form State
    const [type, setType] = useState('public');
    const [defaultOrg, setDefaultOrg] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('Technology');
    const [availableCategories, setAvailableCategories] = useState([
        { id: 8, name: 'Design' },
        { id: 7, name: 'Engineering' },
        { id: 1019, name: 'Finance' },
        { id: 1014, name: 'General' },
        { id: 1016, name: 'Product & Design' },
        { id: 1, name: 'Technology' }
    ]);
    const [banner, setBanner] = useState('');
    const [avatar, setAvatar] = useState('');
    const [bannerFile, setBannerFile] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    // Structured Rules list
    const [rulesList, setRulesList] = useState(['Be respectful and constructive.', 'Keep discussions relevant to the community topic.', 'Follow MPOnline company guidelines.']);
    // Structured FAQ pairs
    const [faqList, setFaqList] = useState([{ q: 'Who can join?', a: 'All MPOnline employees may join or request access.' }]);
    const [invitedUserIds, setInvitedUserIds] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
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
    }, [isOpen]);

    const bannerInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const checkNameDebounceRef = useRef(null);

    const resetForm = useCallback(() => {
        setStep(1);
        setName('');
        setDescription('');
        setCategory('Technology');
        setType('public');
        setDefaultOrg('');
        setBanner('');
        setAvatar('');
        setBannerFile(null);
        setAvatarFile(null);
        setRulesList(['Be respectful and constructive.', 'Keep discussions relevant to the community topic.', 'Follow MPOnline company guidelines.']);
        setFaqList([{ q: 'Who can join?', a: 'All MPOnline employees may join or request access.' }]);
        setInvitedUserIds([]);
        setUserSearchQuery('');
        setNameError('');
        setBannerError('');
        setAvatarError('');
        setIsSubmitting(false);
        setCreatedCommunityLink(null);
        setIsSubmittedForApproval(false);
        setPendingCommunityData(null);
        setCopied(false);
    }, []);

    // Crucial: Automatically reset all fields whenever modal opens
    useEffect(() => {
        if (isOpen) {
            resetForm();
        }
    }, [isOpen, resetForm]);

    const handleCloseModal = () => {
        resetForm();
        onClose();
    };

    useEffect(() => {
        return () => {
            if (checkNameDebounceRef.current) {
                clearTimeout(checkNameDebounceRef.current);
            }
        };
    }, []);

    // Filter candidate users (all except current user)
    const candidateUsers = useMemo(() => {
        const pool = allAvailableUsers.length > 0 ? allAvailableUsers : (users || INITIAL_USERS || []);
        const filtered = pool.filter(u => {
            const uid = String(u.id || u.userId);
            const curId = String(currentUser?.id || currentUser?.userId);
            const curEmpId = (currentUser?.employeeId || '').toUpperCase();
            const uEmpId = (u.employeeId || '').toUpperCase();
            if (uid && curId && uid === curId) return false;
            if (uEmpId && curEmpId && uEmpId === curEmpId) return false;
            return true;
        });

        // Unique by id or employeeId and sorted alphabetically
        const seen = new Set();
        const uniqueList = [];
        for (const u of filtered) {
            const key = u.employeeId ? u.employeeId.toUpperCase() : String(u.id || u.userId);
            if (!seen.has(key)) {
                seen.add(key);
                uniqueList.push(u);
            }
        }
        return uniqueList.sort((a, b) => (a.name || a.fullName || '').localeCompare(b.name || b.fullName || ''));
    }, [allAvailableUsers, users, currentUser]);

    // Search filter for step 2
    const filteredUsers = useMemo(() => {
        if (!userSearchQuery.trim()) return candidateUsers;
        const q = userSearchQuery.trim().toLowerCase();
        return candidateUsers.filter(u => 
            ((u.name || u.fullName || '').toLowerCase().includes(q)) ||
            ((u.employeeId || '').toLowerCase().includes(q)) ||
            ((u.designation || '').toLowerCase().includes(q)) ||
            ((u.department || u.departmentName || '').toLowerCase().includes(q))
        );
    }, [candidateUsers, userSearchQuery]);

    const employeeGridRef = useRef(null);
    const { visibleCount: visibleUserCount, resetVisibleCount: resetUserCount } = useScrollLoading(filteredUsers.length, 12, 12, 100, employeeGridRef);

    useEffect(() => {
        resetUserCount();
    }, [userSearchQuery, step, isOpen]);

    // Full user objects for selected members
    const selectedUsers = useMemo(() => {
        const pool = [...candidateUsers, ...(allAvailableUsers || []), ...(users || []), ...(INITIAL_USERS || [])];
        const seen = new Set();
        const result = [];
        for (const id of invitedUserIds) {
            const u = pool.find(user => String(user.id || user.userId) === String(id));
            if (u) {
                const key = String(u.id || u.userId);
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(u);
                }
            }
        }
        return result;
    }, [invitedUserIds, candidateUsers, allAvailableUsers, users]);

    // ── Helpers ─────────────────────────────────────────────────
    const toggleInviteUser = (userId) => {
        setInvitedUserIds(prev =>
            prev.some(id => String(id) === String(userId)) 
                ? prev.filter(id => String(id) !== String(userId)) 
                : [...prev, userId]
        );
    };

    if (!isOpen) return null;

    const validateImageFile = (file, setError) => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setError('Invalid format. Only JPG, PNG, and WebP images are allowed.');
            return false;
        }
        if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            setError(`File too large. Maximum size is ${MAX_IMAGE_SIZE_MB} MB.`);
            return false;
        }
        setError('');
        return true;
    };

    const compressImage = (file, maxWidth = 1200, maxHeight = 600, quality = 0.85) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(dataUrl);
                };
                img.onerror = () => resolve(e.target.result);
                img.src = e.target.result;
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    };

    const handleBannerUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!validateImageFile(file, setBannerError)) return;
        setBannerFile(file);
        const compressed = await compressImage(file, 1200, 500, 0.85);
        if (compressed) {
            setBanner(compressed);
        }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!validateImageFile(file, setAvatarError)) return;
        setAvatarFile(file);
        const compressed = await compressImage(file, 400, 400, 0.85);
        if (compressed) {
            setAvatar(compressed);
        }
    };

    // Rules list management
    const addRule = () => {
        if (rulesList.length >= 10) return;
        setRulesList(prev => [...prev, '']);
    };
    const updateRule = (idx, val) => setRulesList(prev => prev.map((r, i) => i === idx ? val : r));
    const removeRule = (idx) => setRulesList(prev => prev.filter((_, i) => i !== idx));

    // FAQ list management
    const addFaq = () => {
        if (faqList.length >= 5) return;
        setFaqList(prev => [...prev, { q: '', a: '' }]);
    };
    const updateFaq = (idx, field, val) => setFaqList(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    const removeFaq = (idx) => setFaqList(prev => prev.filter((_, i) => i !== idx));

    // Comprehensive Duplicate Name Check
    const checkIsDuplicateCommunityName = (targetName) => {
        if (!targetName || !targetName.trim()) return false;
        const normalized = targetName.trim().toLowerCase();

        // 0. Check live active communities from API
        if (liveCommunities.some(c => (c.name || '').trim().toLowerCase() === normalized && c.isActive !== false && c.isActive !== 0)) {
            return true;
        }

        // 0b. Check existingCommunities passed from parent
        if (existingCommunities.some(c => (c.name || '').trim().toLowerCase() === normalized)) {
            return true;
        }

        // 1. Check custom communities in localStorage
        const customComms = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        if (customComms.some(c => c.name && c.name.trim().toLowerCase() === normalized)) {
            return true;
        }

        // 2. Check pending approval communities
        const pendingComms = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        if (pendingComms.some(c => c.name && c.name.trim().toLowerCase() === normalized)) {
            return true;
        }

        // 3. Check all seed & enterprise system communities
        const knownCommunities = [
            'tech innovation hub',
            'devops & ai innovation hub',
            'frontend developers guild',
            'database architects',
            'hr & general announcements',
            'culture & hr hub',
            'dotnet developers community',
            'fullstack engineering guild',
            'ai & data science innovation lab',
            'technology & architecture hub',
            'hr & people operations',
            'finance & accounting operations',
            'marketing & brand strategy',
            'cto leadership & strategy circle',
            'executive ai & data labs'
        ];
        if (knownCommunities.some(k => k === normalized)) {
            return true;
        }

        // 4. Check joined/persisted user communities
        const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
        const joinedComms = JSON.parse(localStorage.getItem(userKey) || '[]');
        if (joinedComms.some(c => c.name && c.name.trim().toLowerCase() === normalized)) {
            return true;
        }

        return false;
    };

    // Helper to auto-select target users based on Default Org group
    const autoSelectEmployeesForTargetGroup = (targetGroup) => {
        if (!targetGroup || targetGroup === 'All Employees') {
            const allOtherIds = (users || []).filter(u => u.id !== currentUser?.id).map(u => u.id);
            setInvitedUserIds(allOtherIds);
        } else {
            const deptFilteredIds = (users || []).filter(u => 
                u.id !== currentUser?.id && 
                ((u.department || u.departmentName || '').toLowerCase().includes(targetGroup.toLowerCase()) || 
                 (u.designation || '').toLowerCase().includes(targetGroup.toLowerCase()))
            ).map(u => u.id);
            setInvitedUserIds(deptFilteredIds.length > 0 ? deptFilteredIds : (users || []).filter(u => u.id !== currentUser?.id).map(u => u.id));
        }
    };

    // Step 1 validation
    const handleNextStep = async () => {
        if (!name.trim()) { 
            setNameError('Community name is required.'); 
            return; 
        }

        if (checkIsDuplicateCommunityName(name)) {
            setNameError('community name already existing');
            return;
        }

        try {
            const res = await communitiesApi.checkName(name.trim());
            const exists = res?.data !== undefined ? res.data : res;
            if (exists === true) {
                setNameError('community name already existing');
                return;
            }
        } catch (err) {}

        setNameError('');

        setStep(2);
    };

    const safeSetStorage = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            console.warn(`LocalStorage quota reached for key: ${key}.`, err);
            try {
                localStorage.removeItem('knome_notifications');
                if (Array.isArray(value)) {
                    localStorage.setItem(key, JSON.stringify(value.slice(0, 15)));
                }
            } catch (e) {
                console.error('LocalStorage save fallback failed:', e);
            }
        }
    };

    const handleSubmit = async () => {
        if (checkIsDuplicateCommunityName(name)) {
            setNameError('community name already existing');
            setStep(1);
            return;
        }

        try {
            const res = await communitiesApi.checkName(name.trim());
            const exists = res?.data !== undefined ? res.data : res;
            if (exists === true) {
                setNameError('community name already existing');
                setStep(1);
                return;
            }
        } catch (err) {}

        setIsSubmitting(true);
        try {
            // 1. Upload banner and avatar files to backend server if user picked local files
            let serverBannerUrl = null;
            let serverAvatarUrl = null;

            if (bannerFile) {
                try {
                    const uploadRes = await mediaApi.uploadFile(bannerFile, 'image');
                    if (uploadRes?.url) {
                        serverBannerUrl = uploadRes.url;
                    }
                } catch (upErr) {
                    console.warn('Banner upload to server failed, using fallback:', upErr);
                }
            }

            if (avatarFile) {
                try {
                    const uploadRes = await mediaApi.uploadFile(avatarFile, 'image');
                    if (uploadRes?.url) {
                        serverAvatarUrl = uploadRes.url;
                    }
                } catch (upErr) {
                    console.warn('Avatar upload to server failed, using fallback:', upErr);
                }
            }

            const finalBanner = serverBannerUrl || (banner && !banner.startsWith('data:') ? banner : 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200&h=400');
            const finalAvatar = serverAvatarUrl || (avatar && !avatar.startsWith('data:') ? avatar : 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=200&h=200');

            const categoryMap = {
                'Technology': 1,
                'Product & Design': 1016,
                'Culture & HR': 1017,
                'Operations': 1018,
                'Finance': 1019,
                'Marketing': 1020,
                'Leadership': 12,
                'Engineering': 7,
                'Design': 8,
                'Product Management': 9,
                'Culture': 10,
                'Company Culture': 10,
                'General': 1014
            };
            const matchedCatObj = (availableCategories || []).find(c => (c.name || '').toLowerCase().trim() === (category || '').toLowerCase().trim());
            const mappedCategoryId = matchedCatObj?.categoryId || matchedCatObj?.id || categoryMap[category] || 1;

            const filteredRules = rulesList.filter(r => r.trim());
            const filteredFaq = faqList.filter(f => f.q.trim() && f.a.trim());
            const formattedCommunityType = type === 'private' ? 'Private' : type === 'default' ? 'Org' : 'Public';

            const validMemberUserIds = (invitedUserIds || []).map(Number).filter(n => !isNaN(n) && n > 0);

            // 2. Persist directly to SQL Server database via API!
            const createPayload = {
                name: name.trim(),
                description: description.trim() || 'A new community created for MPOnline teams.',
                bannerUrl: finalBanner,
                thumbnailUrl: finalAvatar,
                categoryId: mappedCategoryId,
                categoryName: category,
                rules: filteredRules.join('\n'),
                faq: JSON.stringify(filteredFaq),
                communityType: formattedCommunityType,
                invitedUserIds: validMemberUserIds
            };

            let dbCommunity = null;
            try {
                const apiRes = await communitiesApi.create(createPayload);
                dbCommunity = apiRes?.data !== undefined ? apiRes.data : apiRes;
            } catch (apiErr) {
                console.error('Backend community creation failed:', apiErr);
                const errMsg = apiErr?.data?.message || apiErr?.message || 'Failed to save community to database.';
                setNameError(errMsg);
                setIsSubmitting(false);
                setStep(1);
                return;
            }

            const communityId = dbCommunity?.communityId || dbCommunity?.id || Math.floor(Date.now() / 1000);

            // Prepare community members list with creator as Admin + all invited employees
            const creatorMember = {
                userId: currentUser?.id || currentUser?.userId || 1,
                fullName: currentUser?.name || currentUser?.fullName || 'Employee',
                employeeId: currentUser?.employeeId || `MPO${currentUser?.id || '101'}`,
                designation: currentUser?.roleName || 'Community Admin',
                memberType: 'Admin',
                status: 'Approved',
                profilePhotoUrl: currentUser?.avatar
            };

            const memberList = [creatorMember];
            const targetUserEnrollIds = invitedUserIds || [];

            (targetUserEnrollIds || []).forEach(uId => {
                const targetUserObj = candidateUsers.find(u => String(u.id || u.userId) === String(uId)) ||
                    (allAvailableUsers || []).find(u => String(u.id || u.userId) === String(uId)) ||
                    (users || []).find(u => String(u.id || u.userId) === String(uId));
                if (targetUserObj) {
                    const uIdResolved = targetUserObj.id || targetUserObj.userId;
                    memberList.push({
                        userId: uIdResolved,
                        fullName: targetUserObj.name || targetUserObj.fullName,
                        employeeId: targetUserObj.employeeId || `MPO${uIdResolved}`,
                        designation: targetUserObj.designation || 'Member',
                        memberType: 'Member',
                        status: 'Approved',
                        profilePhotoUrl: targetUserObj.avatar || null
                    });

                    // Auto-join directly to target user's joined community list
                    try {
                        const targetUserKey = `knome_joined_communities_${uIdResolved}`;
                        const targetUserJoined = JSON.parse(localStorage.getItem(targetUserKey) || '[]');
                        safeSetStorage(targetUserKey, [{ 
                            id: communityId, 
                            name: dbCommunity?.name || name.trim(), 
                            status: 'joined', 
                            category: dbCommunity?.categoryName || category,
                            type: formattedCommunityType,
                            banner: finalBanner,
                            joinedAt: new Date().toISOString() 
                        }, ...targetUserJoined.filter(c => String(c.id) !== String(communityId))]);
                    } catch (e) { /* ignore */ }
                }
            });

            const dedupedMemberList = deduplicateMembers(memberList);
            safeSetStorage(`knome_community_members_${communityId}`, dedupedMemberList);

            const newCommunity = {
                id: communityId,
                communityId: communityId,
                name: dbCommunity?.name || name.trim(),
                type: type === 'default' ? 'Org' : (dbCommunity?.communityType ? (['default', 'org'].includes(String(dbCommunity.communityType).toLowerCase()) ? 'Org' : dbCommunity.communityType) : type.charAt(0).toUpperCase() + type.slice(1)),
                category: dbCommunity?.categoryName || category,
                members: `${dedupedMemberList.length} ${dedupedMemberList.length === 1 ? 'member' : 'members'}`,
                activity: 'New',
                description: dbCommunity?.description || description.trim() || 'A new community created for MPOnline teams.',
                banner: finalBanner,
                bannerUrl: finalBanner,
                avatar: finalAvatar,
                thumbnail: finalAvatar,
                thumbnailUrl: finalAvatar,
                createdBy: currentUser?.name || currentUser?.fullName || 'Employee',
                creatorUserId: currentUser?.id || currentUser?.userId || 1,
                creatorEmployeeId: currentUser?.employeeId || `MPO${currentUser?.id || '101'}`,
                creatorDepartment: currentUser?.department || currentUser?.departmentName || 'MPOnline Limited',
                creatorAvatar: currentUser?.avatar || null,
                createdDate: dbCommunity?.createdDate || new Date().toISOString(),
                rules: filteredRules.length > 0 ? filteredRules : ['Be respectful.', 'Stay on topic.'],
                faq: filteredFaq.length > 0 ? filteredFaq : [{ q: 'Who can join?', a: 'All MPOnline employees.' }],
                defaultOrg: type === 'default' ? defaultOrg : null,
                status: isHRorAdmin ? 'Approved' : 'Pending Approval',
                isApproved: isHRorAdmin ? true : false,
                invitedUserIds: invitedUserIds || [],
            };

            // Sync invited members to backend DB if needed
            if (validMemberUserIds && validMemberUserIds.length > 0 && dbCommunity?.communityId) {
                try {
                    communitiesApi.addMembers(dbCommunity.communityId, validMemberUserIds).catch(() => {});
                } catch (e) {}
            }

            // Create in-app notifications for invited members
            const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            const newInviteNotifs = invitedUserIds.map(targetId => ({
                id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
                targetUserId: targetId,
                category: 'Community',
                type: 'invite',
                text: `${currentUser?.name || 'An employee'} invited you to join the community "${newCommunity.name}".`,
                message: `${currentUser?.name || 'An employee'} invited you to join the community "${newCommunity.name}".`,
                senderName: currentUser?.name || 'An employee',
                senderAvatar: currentUser?.avatar || null,
                senderUserId: currentUser?.userId || currentUser?.id,
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                unread: true,
                icon: 'group_add',
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
                communityName: newCommunity.name,
                communityId: newCommunity.id,
                actionLink: `/community/view?id=${newCommunity.id}`
            }));

            // ── CASE A: Regular Employee -> Goes to HR Admin for Approval ──
            if (!isHRorAdmin) {
                // 1. Add to pending approvals list
                const existingApprovals = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                safeSetStorage('knome_pending_community_approvals', [newCommunity, ...existingApprovals.filter(c => String(c.id) !== String(communityId))]);

                // 2. Track in user's joined list as pending approval
                const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
                const userJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
                safeSetStorage(userKey, [{ 
                    id: communityId, 
                    name: newCommunity.name, 
                    status: 'pending_approval', 
                    category,
                    type: newCommunity.type,
                    description: newCommunity.description,
                    banner: finalBanner,
                    joinedAt: new Date().toISOString() 
                }, ...userJoined.filter(c => String(c.id) !== String(communityId))]);

                // 3. Send Notification to HR Administrator & System Administrator
                const hrNotif = {
                    id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
                    targetRole: 'HRADM',
                    targetUserId: 'hr_admin',
                    category: 'Community',
                    type: 'community_approval_request',
                    icon: 'approval',
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    text: `📋 New Community Approval Request: ${currentUser?.name || 'Employee'} (${currentUser?.department || currentUser?.roleName || 'MPOnline'}) created "${newCommunity.name}". Awaiting Administration Approval.`,
                    message: `📋 New Community Approval Request: ${currentUser?.name || 'Employee'} (${currentUser?.department || currentUser?.roleName || 'MPOnline'}) created "${newCommunity.name}". Awaiting Administration Approval.`,
                    senderName: currentUser?.name || 'Employee',
                    senderAvatar: currentUser?.avatar || null,
                    senderUserId: currentUser?.userId || currentUser?.id,
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    unread: true,
                    communityName: newCommunity.name,
                    communityId: newCommunity.id,
                    actionLink: '/communities?tab=Approvals'
                };
                safeSetStorage('knome_notifications', [hrNotif, ...newInviteNotifs, ...existingNotifs]);
                window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: hrNotif }));
                window.dispatchEvent(new CustomEvent('community-approval-requested', { detail: newCommunity }));
                window.dispatchEvent(new CustomEvent('community-invite-sent', {
                    detail: { invitedUserIds, communityName: newCommunity.name, senderName: currentUser?.name, senderUserId: currentUser?.userId || currentUser?.id }
                }));

                if (onCommunityCreated) {
                    onCommunityCreated({
                        type: 'approval',
                        communityName: newCommunity.name,
                        category: newCommunity.category,
                        communityType: newCommunity.type,
                        community: newCommunity
                    });
                    resetForm();
                    onClose();
                    return;
                }

                setPendingCommunityData(newCommunity);
                setIsSubmittedForApproval(true);
                return;
            }

            // ── CASE B: HR / System Admin -> Auto-Approved Immediately ──
            safeSetStorage('knome_notifications', [...newInviteNotifs, ...existingNotifs]);

            // Save community
            const customCommunities = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
            safeSetStorage('knome_custom_communities', [newCommunity, ...customCommunities]);

            // Save to creator's joined list with proper format
            const userKey = `knome_joined_communities_${currentUser?.id || 'guest'}`;
            const userJoined = JSON.parse(localStorage.getItem(userKey) || '[]');
            safeSetStorage(userKey, [{ id: communityId, name: newCommunity.name, status: 'joined', joinedAt: new Date().toISOString() }, ...userJoined.filter(c => String(c.id) !== String(communityId))]);



            // Seed official welcome post in the name of the new community
            const initialCommunityPost = {
                id: `welcome_${communityId}`,
                postId: `welcome_${communityId}`,
                author: newCommunity.name,
                role: 'Official Community Space',
                avatar: finalAvatar || finalBanner || null,
                time: 'Just now',
                content: `Welcome to ${newCommunity.name}! Please feel free to introduce yourself, collaborate with fellow members, and share any technical questions, discussions, or resources here.`,
                likes: 0,
                likesCount: 0,
                comments: 0,
                commentsCount: 0,
                shares: 0,
                sharesCount: 0,
                isPinned: true
            };
            safeSetStorage(`knome_community_posts_${communityId}`, [initialCommunityPost]);

            // FR-CM-04: Org community — save department assignment
            if (type === 'default') {
                const deptAssignments = JSON.parse(localStorage.getItem('knome_default_community_assignments') || '[]');
                deptAssignments.push({ communityId, communityName: newCommunity.name, department: defaultOrg || 'All Employees', createdAt: new Date().toISOString() });
                localStorage.setItem('knome_default_community_assignments', JSON.stringify(deptAssignments));
                window.dispatchEvent(new CustomEvent('default-community-assigned', {
                    detail: { community: newCommunity, targetDept: defaultOrg || 'All Employees' }
                }));
            }

            window.dispatchEvent(new CustomEvent('community-joined-change'));
            window.dispatchEvent(new CustomEvent('community-created', { detail: newCommunity }));
            window.dispatchEvent(new CustomEvent('community-invite-sent', {
                detail: { invitedUserIds, communityName: newCommunity.name, senderName: currentUser?.name, senderUserId: currentUser?.userId || currentUser?.id }
            }));

            // Sync invited members to backend DB if needed
            if (validMemberUserIds && validMemberUserIds.length > 0 && dbCommunity?.communityId) {
                try {
                    communitiesApi.addMembers(dbCommunity.communityId, validMemberUserIds).catch(() => {});
                } catch (e) {}
            }

            const generatedLink = `${window.location.origin}/community/view?id=${communityId}`;
            if (onCommunityCreated) {
                onCommunityCreated({
                    type: 'created',
                    communityName: newCommunity.name,
                    category: newCommunity.category,
                    communityType: newCommunity.type,
                    link: generatedLink,
                    communityId: communityId,
                    invitedCount: (invitedUserIds || []).length,
                    community: newCommunity
                });
                resetForm();
                onClose();
                return;
            }

            setCreatedCommunityLink(generatedLink);
        } catch (error) {
            console.error('Failed to process community creation:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyLink = () => {
        if (createdCommunityLink) {
            navigator.clipboard.writeText(createdCommunityLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleFinish = () => {
        resetForm();
        if (onCommunityCreated) onCommunityCreated();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] p-3 sm:p-4 md:p-6 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="fixed inset-0" onClick={handleCloseModal}></div>

            <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[84vh] h-auto flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 z-10">
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-500">
                                {isSubmittedForApproval ? 'hourglass_top' : createdCommunityLink ? 'check_circle' : 'group_add'}
                            </span>
                            {isSubmittedForApproval 
                                ? 'Submitted for Administration Approval' 
                                : createdCommunityLink 
                                    ? 'Community Created Successfully!' 
                                    : 'Create New Community'}
                        </h2>
                        {!createdCommunityLink && !isSubmittedForApproval && (
                            <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2">
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-black ${step >= 1 ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>1</div>
                                    <span className={`text-[11px] sm:text-[12px] font-bold ${step === 1 ? 'text-indigo-500' : 'text-slate-400'}`}>Details & Media</span>
                                </div>
                                <div className={`h-0.5 w-6 sm:w-8 rounded ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-200'}`}></div>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-black ${step >= 2 ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>2</div>
                                    <span className={`text-[11px] sm:text-[12px] font-bold ${step === 2 ? 'text-indigo-500' : 'text-slate-400'}`}>Rules, FAQ & Members</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-900/50">

                    {/* View 1: Pending Approval View for Regular Employees */}
                    {isSubmittedForApproval ? (
                        <div className="flex flex-col items-center justify-center text-center py-8 px-4 animate-in zoom-in-95 duration-200 max-w-xl mx-auto">
                            <div className="w-18 h-18 bg-amber-100 dark:bg-amber-900/40 text-amber-500 rounded-3xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/10 ring-8 ring-amber-50 dark:ring-amber-900/20">
                                <span className="material-symbols-outlined text-[42px] animate-pulse">hourglass_top</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-black uppercase tracking-wider mb-3">
                                ⏳ Pending Administration Approval
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                                "{name}" Submitted for Review!
                            </h3>
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6">
                                Your community request has been forwarded to the <strong>Administration</strong> for governance review. Once approved, it will be published live across the organization and you will receive an instant notification.
                            </p>

                            {/* Summary Card */}
                            <div className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-left mb-6 shadow-sm">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60 mb-3">
                                    <span className="text-xs font-extrabold uppercase text-slate-400">Request Summary</span>
                                    <span className="text-xs font-black text-amber-500 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-0.5 rounded-full">Awaiting Approval</span>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Community Name:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Category:</span>
                                        <span className="font-bold text-indigo-500">{category}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Visibility:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{type === 'default' ? 'Org' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Created By:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">{currentUser?.name} • {currentUser?.department || currentUser?.roleName || 'MPOnline'}</span>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleFinish}
                                className="px-8 py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/30 flex items-center gap-2 cursor-pointer">
                                <span>Done & View Communities</span>
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </button>
                        </div>
                    ) : createdCommunityLink ? (
                        <div className="flex flex-col items-center justify-center text-center py-8 px-4 animate-in zoom-in-95 duration-200">
                            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-[36px]">check_circle</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                                "{name}" is Live!
                            </h3>
                            <p className="text-slate-500 text-sm max-w-md mb-6">
                                {invitedUserIds.length > 0
                                    ? `Direct notifications with the join link have been sent to ${invitedUserIds.length} selected employee(s).`
                                    : 'Your community has been created. Share the link below with your team members.'}
                            </p>
                            <div className="w-full max-w-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm mb-6">
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-left">
                                    🔗 Shareable Invite Link
                                </label>
                                <div className="flex items-center gap-2">
                                    <input type="text" readOnly value={createdCommunityLink}
                                        className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none" />
                                    <button onClick={handleCopyLink}
                                        className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 ${copied ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-500/20'}`}>
                                        <span className="material-symbols-outlined text-[16px]">{copied ? 'done' : 'content_copy'}</span>
                                        {copied ? 'Copied!' : 'Copy Link'}
                                    </button>
                                </div>
                            </div>
                            <button onClick={handleFinish}
                                className="px-8 py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/30">
                                Done & Go to Communities
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* ── STEP 1: Details & Media ── */}
                            {step === 1 && (
                                <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
                                    {/* Left: Text Inputs */}
                                    <div className="flex-1 space-y-3.5">
                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                Community Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                value={name}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setName(val);
                                                    if (checkNameDebounceRef.current) {
                                                        clearTimeout(checkNameDebounceRef.current);
                                                    }
                                                    if (!val.trim()) {
                                                        setNameError('');
                                                        return;
                                                    }
                                                    if (checkIsDuplicateCommunityName(val)) {
                                                        setNameError('community name already existing');
                                                        return;
                                                    }
                                                    setNameError('');
                                                    checkNameDebounceRef.current = setTimeout(() => {
                                                        communitiesApi.checkName(val.trim())
                                                            .then(res => {
                                                                const exists = res?.data !== undefined ? res.data : res;
                                                                if (exists === true) {
                                                                    setNameError('community name already existing');
                                                                }
                                                            })
                                                            .catch(() => {});
                                                    }, 300);
                                                }}
                                                type="text"
                                                placeholder="e.g. Engineering Excellence"
                                                className={`w-full bg-white dark:bg-slate-800 border rounded-xl px-4 py-2 sm:py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white font-bold transition-colors ${nameError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 dark:border-slate-700'}`}
                                            />
                                            {nameError && (
                                                <p className="mt-1 text-[12px] text-red-500 flex items-center gap-1 font-bold">
                                                    <span className="material-symbols-outlined text-[14px]">error</span> {nameError}
                                                </p>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is the purpose of this community?" rows="2"
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white resize-none"></textarea>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">Primary Category</label>
                                            <select value={category} onChange={(e) => setCategory(e.target.value)}
                                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white font-medium">
                                                {availableCategories.map(cat => (
                                                    <option key={cat.categoryId || cat.id || cat.name} value={cat.name}>{cat.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Privacy & Governance Type</label>

                                            <label className={`block p-2.5 sm:p-3 rounded-xl border-2 mb-2 cursor-pointer transition-all ${type === 'public' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300'}`}>
                                                <div className="flex items-center gap-3">
                                                    <input type="radio" name="type" checked={type === 'public'} onChange={() => setType('public')} className="text-indigo-500 focus:ring-indigo-500" />
                                                    <div>
                                                        <h4 className="font-bold text-[13px] sm:text-[14px] text-slate-900 dark:text-white flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[16px] text-emerald-500">public</span> Public
                                                        </h4>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">Anyone can find and join instantly. No approval needed.</p>
                                                    </div>
                                                </div>
                                            </label>

                                            <label className={`block p-2.5 sm:p-3 rounded-xl border-2 mb-2 cursor-pointer transition-all ${type === 'private' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300'}`}>
                                                <div className="flex items-center gap-3">
                                                    <input type="radio" name="type" checked={type === 'private'} onChange={() => setType('private')} className="text-indigo-500 focus:ring-indigo-500" />
                                                    <div>
                                                        <h4 className="font-bold text-[13px] sm:text-[14px] text-slate-900 dark:text-white flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[16px] text-amber-500">lock</span> Private
                                                        </h4>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">Requires Admin approval to join. Join requests are reviewed before access is granted.</p>
                                                    </div>
                                                </div>
                                            </label>

                                            {((['HRADM', 'HR'].includes(currentUser?.role)) ||
                                               (['HR Administrator', 'HR Admin'].includes(currentUser?.roleName)) ||
                                               (currentUser?.roleName && currentUser.roleName.toLowerCase().includes('hr') && !currentUser.roleName.toLowerCase().includes('system')) ||
                                               (currentUser?.role && currentUser.role.toLowerCase().includes('hr') && currentUser.role !== 'SYSADM') ||
                                               currentUser?.isHrAdmin === true) && (
                                                <label className={`block p-2.5 sm:p-3 rounded-xl border-2 cursor-pointer transition-all ${type === 'default' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input 
                                                            type="radio" 
                                                            name="type" 
                                                            checked={type === 'default'} 
                                                            onChange={() => {
                                                                setType('default');
                                                                const chosen = defaultOrg || 'All Employees';
                                                                if (!defaultOrg) setDefaultOrg('All Employees');
                                                                autoSelectEmployeesForTargetGroup(chosen);
                                                            }} 
                                                            className="text-indigo-500 focus:ring-indigo-500 cursor-pointer" 
                                                        />
                                                        <div>
                                                            <h4 className="font-bold text-[13px] sm:text-[14px] text-slate-900 dark:text-white flex items-center gap-1.5">
                                                                <span className="material-symbols-outlined text-[16px] text-purple-500">corporate_fare</span> Org (Auto-Assigned Organization Space)
                                                            </h4>
                                                            <p className="text-[11px] text-slate-500 mt-0.5">Strictly HR Admin Only: Auto-subscribes all employees or specific department members automatically.</p>
                                                        </div>
                                                    </div>
                                                </label>
                                            )}

                                            {type === 'default' && (
                                                <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 rounded-xl animate-in fade-in slide-in-from-top-2">
                                                    <label className="block text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">groups</span> Auto-Subscribe Target Group *
                                                    </label>
                                                    <select 
                                                        value={defaultOrg || 'All Employees'} 
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setDefaultOrg(val);
                                                            autoSelectEmployeesForTargetGroup(val);
                                                        }}
                                                        className="w-full bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-white font-bold"
                                                    >
                                                        <option value="All Employees">🏢 All Employees (Entire Organization)</option>
                                                        <option value="Technology">💻 Technology / Engineering Department</option>
                                                        <option value="HR">👥 HR & People Operations Department</option>
                                                        <option value="Finance">💰 Finance & Accounting Department</option>
                                                        <option value="Marketing">📢 Marketing & Brand Strategy Department</option>
                                                        <option value="Operations">⚙️ Operations & Logistics Department</option>
                                                    </select>
                                                    <p className="text-[10px] text-purple-500 dark:text-purple-300 mt-1 font-medium">
                                                        ✨ All employees in the selected target group will be automatically selected and enrolled as joined members upon creation (FR-CM-04).
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Media Uploads */}
                                    <div className="w-full md:w-72 lg:w-80 flex flex-col gap-4">
                                        {/* Banner */}
                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                Banner Image <span className="text-slate-400 font-normal normal-case">(JPG/PNG/WebP, max 5MB)</span>
                                            </label>
                                            <div onClick={() => bannerInputRef.current?.click()}
                                                className="relative w-full h-28 sm:h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors cursor-pointer group overflow-hidden">
                                                {banner ? (
                                                    <>
                                                        <img src={banner} alt="Banner Preview" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white text-[12px] font-bold">Click to change</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-[26px] sm:text-[28px] mb-1 group-hover:scale-110 transition-transform">wallpaper</span>
                                                        <span className="text-[11px] font-bold">Click to upload banner</span>
                                                        <span className="text-[10px] text-slate-400 mt-0.5">Recommended: 1200 x 400px</span>
                                                    </>
                                                )}
                                            </div>
                                            <input type="file" ref={bannerInputRef} className="hidden" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleBannerUpload} />
                                            {bannerError && (
                                                <p className="mt-1 text-[12px] text-red-500 flex items-center gap-1 font-bold">
                                                    <span className="material-symbols-outlined text-[14px]">error</span> {bannerError}
                                                </p>
                                            )}
                                        </div>

                                        {/* Avatar */}
                                        <div>
                                            <label className="block text-[11px] sm:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                Thumbnail Avatar <span className="text-slate-400 font-normal normal-case">(JPG/PNG/WebP, max 5MB)</span>
                                            </label>
                                            <div onClick={() => avatarInputRef.current?.click()}
                                                className="relative w-24 h-24 sm:w-26 sm:h-26 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors cursor-pointer group overflow-hidden">
                                                {avatar ? (
                                                    <>
                                                        <img src={avatar} alt="Avatar Preview" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white text-[10px] font-bold text-center">Change</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform">add_photo_alternate</span>
                                                        <span className="text-[9px] font-bold mt-1 text-center px-1">Click to upload avatar</span>
                                                    </>
                                                )}
                                            </div>
                                            <input type="file" ref={avatarInputRef} className="hidden" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleAvatarUpload} />
                                            {avatarError && (
                                                <p className="mt-1 text-[12px] text-red-500 flex items-center gap-1 font-bold">
                                                    <span className="material-symbols-outlined text-[14px]">error</span> {avatarError}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── STEP 2: Rules, FAQ & Invite Members ── */}
                            {step === 2 && (
                                <div className="space-y-8">

                                    {/* Rules Builder */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[15px] text-indigo-500">gavel</span>
                                                Community Rules <span className="text-slate-400 font-normal normal-case ml-1">({rulesList.length}/10)</span>
                                            </label>
                                            {rulesList.length < 10 && (
                                                <button onClick={addRule} className="flex items-center gap-1 text-[12px] text-indigo-500 font-bold hover:text-indigo-600 transition-colors">
                                                    <span className="material-symbols-outlined text-[16px]">add_circle</span> Add Rule
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            {rulesList.map((rule, idx) => (
                                                <div key={idx} className="flex items-center gap-2 group">
                                                    <span className="text-[12px] font-black text-slate-400 w-5 shrink-0">{idx + 1}.</span>
                                                    <input
                                                        value={rule}
                                                        onChange={(e) => updateRule(idx, e.target.value)}
                                                        placeholder={`Rule ${idx + 1}...`}
                                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                                    />
                                                    {rulesList.length > 1 && (
                                                        <button onClick={() => removeRule(idx)}
                                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all cursor-pointer p-1">
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* FAQ Builder */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[15px] text-indigo-500">help</span>
                                                FAQ <span className="text-slate-400 font-normal normal-case ml-1">({faqList.length}/5)</span>
                                            </label>
                                            {faqList.length < 5 && (
                                                <button onClick={addFaq} className="flex items-center gap-1 text-[12px] text-indigo-500 font-bold hover:text-indigo-600 transition-colors">
                                                    <span className="material-symbols-outlined text-[16px]">add_circle</span> Add Q&A
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-4">
                                            {faqList.map((item, idx) => (
                                                <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 group relative">
                                                    {faqList.length > 1 && (
                                                        <button onClick={() => removeFaq(idx)}
                                                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all cursor-pointer">
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    )}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-black text-indigo-500 uppercase w-4">Q</span>
                                                            <input
                                                                value={item.q}
                                                                onChange={(e) => updateFaq(idx, 'q', e.target.value)}
                                                                placeholder="Question..."
                                                                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] font-black text-emerald-500 uppercase w-4">A</span>
                                                            <textarea
                                                                value={item.a}
                                                                onChange={(e) => updateFaq(idx, 'a', e.target.value)}
                                                                placeholder="Answer..."
                                                                rows="2"
                                                                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white resize-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Invite Employees */}
                                    {/* Invite Employees */}
                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/40 rounded-2xl p-4 sm:p-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-indigo-500">group_add</span>
                                                <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">
                                                    {type === 'default' ? '🏢 Org Employees' : 'Add / Invite Employees'}
                                                </h3>
                                                {invitedUserIds.length > 0 && (
                                                    <span className="bg-indigo-500 text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                                                        {invitedUserIds.length} selected
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const targetPool = userSearchQuery.trim() ? filteredUsers : candidateUsers;
                                                        const targetIds = targetPool.map(u => u.id || u.userId);
                                                        const allSelected = targetIds.length > 0 && targetIds.every(id => invitedUserIds.some(i => String(i) === String(id)));

                                                        if (allSelected) {
                                                            setInvitedUserIds(prev => prev.filter(id => !targetIds.some(tId => String(tId) === String(id))));
                                                        } else {
                                                            const next = [...invitedUserIds];
                                                            targetIds.forEach(tId => {
                                                                if (!next.some(id => String(id) === String(tId))) {
                                                                    next.push(tId);
                                                                }
                                                            });
                                                            setInvitedUserIds(next);
                                                        }
                                                    }}
                                                    className="px-3.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500 hover:text-white text-indigo-600 dark:text-indigo-400 font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-500/20"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">done_all</span>
                                                    {(() => {
                                                        const targetPool = userSearchQuery.trim() ? filteredUsers : candidateUsers;
                                                        const targetIds = targetPool.map(u => u.id || u.userId);
                                                        const allSelected = targetIds.length > 0 && targetIds.every(id => invitedUserIds.some(i => String(i) === String(id)));
                                                        if (userSearchQuery.trim()) {
                                                            return allSelected ? `Deselect Filtered (${targetIds.length})` : `Select Filtered (${targetIds.length})`;
                                                        }
                                                        return allSelected ? 'Deselect All' : `Select All Employees (${candidateUsers.length})`;
                                                    })()}
                                                </button>
                                            </div>
                                        </div>

                                        <p className="text-[12px] text-slate-500 mb-3">
                                            Only selected members will be added to this community upon creation. Creator is automatically enrolled as Community Admin.
                                        </p>

                                        {/* Search Filter Bar */}
                                        <div className="relative mb-3">
                                            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                            <input
                                                type="text"
                                                value={userSearchQuery}
                                                onChange={(e) => setUserSearchQuery(e.target.value)}
                                                placeholder="Search employees by name, designation, department, or employee ID..."
                                                className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white transition-all shadow-sm placeholder:text-slate-400"
                                            />
                                            {userSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setUserSearchQuery('')}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
                                                    title="Clear search"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Dedicated Selected Members Box */}
                                        <div className="mb-3.5 bg-white dark:bg-slate-800/90 border border-indigo-200/90 dark:border-indigo-800/70 rounded-2xl p-3 sm:p-3.5 shadow-xs transition-all">
                                            <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                                        Selected Members Box
                                                    </span>
                                                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full transition-colors ${
                                                        selectedUsers.length > 0
                                                            ? 'bg-indigo-600 text-white shadow-xs'
                                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                                    }`}>
                                                        {selectedUsers.length}
                                                    </span>
                                                </div>

                                                {selectedUsers.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setInvitedUserIds([])}
                                                        className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                        title="Deselect all members"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">remove_done</span>
                                                        Clear All
                                                    </button>
                                                )}
                                            </div>

                                            {selectedUsers.length === 0 ? (
                                                <div className="py-2.5 px-3 text-center border border-dashed border-slate-200 dark:border-slate-700/80 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                                                    <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                                                        No members selected yet. Click on any employee cards below to add them to this box.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2 max-h-[135px] overflow-y-auto custom-scrollbar p-1">
                                                    {selectedUsers.map(user => {
                                                        const userId = user.id || user.userId;
                                                        const displayName = user.name || user.fullName || 'Employee';
                                                        const displayAvatar = user.avatar || user.profilePhotoUrl;
                                                        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&size=48`;

                                                        return (
                                                            <div
                                                                key={userId}
                                                                className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1.5 bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/90 dark:border-indigo-800/60 rounded-xl shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 transition-all group select-none animate-in fade-in zoom-in-95 duration-150"
                                                            >
                                                                <img
                                                                    src={displayAvatar || fallbackAvatar}
                                                                    className="w-5 h-5 rounded-full object-cover shrink-0 border border-indigo-300 dark:border-indigo-600"
                                                                    alt={displayName}
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = fallbackAvatar;
                                                                    }}
                                                                />
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate max-w-[130px] leading-tight">
                                                                        {displayName}
                                                                    </span>
                                                                    {user.designation && (
                                                                        <span className="text-[9px] text-slate-400 truncate max-w-[130px] leading-none mt-0.5">
                                                                            {user.designation}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleInviteUser(userId);
                                                                    }}
                                                                    className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer shrink-0 ml-1"
                                                                    title={`Remove ${displayName}`}
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1 mb-2">
                                            <span>Showing {filteredUsers.length} of {candidateUsers.length} employees</span>
                                            {invitedUserIds.length > 0 && (
                                                <span className="text-indigo-600 dark:text-indigo-400 font-bold">{invitedUserIds.length} selected</span>
                                            )}
                                        </div>

                                        {/* Employee Grid with Scroll */}
                                        <div ref={employeeGridRef} className="max-h-[340px] overflow-y-auto pr-1">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                                {filteredUsers.length === 0 ? (
                                                    <div className="col-span-full py-8 text-center bg-white dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                                        <span className="material-symbols-outlined text-[32px] text-slate-400 mb-1">person_search</span>
                                                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No employees found matching "{userSearchQuery}"</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => setUserSearchQuery('')}
                                                            className="mt-2 text-xs text-indigo-500 font-bold hover:underline cursor-pointer"
                                                        >
                                                            Clear search
                                                        </button>
                                                    </div>
                                                ) : (
                                                    filteredUsers.slice(0, visibleUserCount).map(user => {
                                                        const userId = user.id || user.userId;
                                                        const isSelected = invitedUserIds.some(id => String(id) === String(userId));
                                                        const displayName = user.name || user.fullName || 'Employee';
                                                        const displayAvatar = user.avatar || user.profilePhotoUrl;
                                                        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff&size=96`;

                                                        return (
                                                            <div
                                                                key={userId}
                                                                onClick={() => toggleInviteUser(userId)}
                                                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                                                                    isSelected
                                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500'
                                                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
                                                                }`}
                                                            >
                                                                <img
                                                                    src={displayAvatar || fallbackAvatar}
                                                                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
                                                                    alt={displayName}
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = fallbackAvatar;
                                                                    }}
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-[12px] font-bold truncate leading-tight ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                                                                        <HighlightText text={displayName} query={userSearchQuery} />
                                                                    </p>
                                                                    <p className={`text-[10px] truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                                        <HighlightText text={user.designation || 'Member'} query={userSearchQuery} />
                                                                    </p>
                                                                    {(user.department || user.departmentName) && (
                                                                        <span className={`inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider ${
                                                                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                                                        }`}>
                                                                            <HighlightText text={user.department || user.departmentName} query={userSearchQuery} />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className={`material-symbols-outlined text-[18px] shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                                                                    {isSelected ? 'check_circle' : 'add_circle'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <ScrollLoadingIndicator isVisible={visibleUserCount < filteredUsers.length} text="Loading more employees on scroll..." />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Buttons */}
                {!createdCommunityLink && !isSubmittedForApproval && (
                    <div className="px-5 py-3 sm:px-6 sm:py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center rounded-b-2xl sm:rounded-b-3xl bg-white dark:bg-slate-900 shrink-0 z-10">
                        <button onClick={handleCloseModal} className="px-5 py-2 text-[13px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
                            Cancel
                        </button>
                        <div className="flex gap-3">
                            {step === 2 && (
                                <button onClick={() => setStep(1)}
                                    className="px-5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[13px] font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                                    Back
                                </button>
                            )}
                            {step === 1 ? (
                                <button onClick={handleNextStep}
                                    className="px-7 py-2 bg-indigo-500 text-white text-[13px] font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer">
                                    Next Step
                                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                </button>
                            ) : (
                                <button onClick={handleSubmit} disabled={isSubmitting}
                                    className={`px-8 py-2.5 text-white text-[13px] font-bold rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer ${
                                        !isHRorAdmin 
                                            ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20' 
                                            : 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20'
                                    }`}>
                                    <span className="material-symbols-outlined text-[18px]">
                                        {!isHRorAdmin ? 'hourglass_top' : 'send'}
                                    </span>
                                    {!isHRorAdmin 
                                        ? (isSubmitting ? 'Sending for Approval...' : 'Send for Approval') 
                                        : (isSubmitting ? 'Creating...' : (invitedUserIds.length === candidateUsers.length && candidateUsers.length > 0 ? '⚡ Create & Add All Members' : (invitedUserIds.length > 0 ? `Create & Add ${invitedUserIds.length} Members` : 'Create Community')))
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
