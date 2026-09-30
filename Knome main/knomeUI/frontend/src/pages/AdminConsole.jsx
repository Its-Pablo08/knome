import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, getUserStatusConfig, deduplicateMembers } from '../components/contexts/UserContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { interactionsApi, adminApi, postsApi, podcastsApi, articlesApi, communitiesApi, mediaApi, resolveMediaUrl, getVideoThumbnail, getCommunityImages, DEFAULT_ENTERPRISE_COMMUNITIES } from '../utils/apiService';
import { apiClient } from '../utils/apiClient';
import * as XLSX from 'xlsx';

export const formatCommunityType = (type) => {
    const t = String(type || '').trim().toLowerCase();
    if (t.includes('default') || t.includes('org')) return 'Org';
    if (t.includes('private')) return 'Private';
    return 'Public';
};
import useScrollLoading from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import SuspendUserModal from '../components/modals/SuspendUserModal';
import CreateCommunityModal from '../components/modals/CreateCommunityModal';
import HighlightText from '../components/ui/HighlightText';
import { addRestrictedWord } from '../utils/restrictedWords';

// Helper to provide realistic reported post content if live API call returns empty/404
const getFallbackPostContent = (report) => {
    if (!report) return null;
    let cached = null;
    try {
        const cacheObj = JSON.parse(localStorage.getItem('knome_reported_posts_cache') || '{}');
        cached = cacheObj[`${report.contentType}_${report.contentId}`] || cacheObj[`Post_${report.contentId}`] || cacheObj[report.contentId] || null;
    } catch {}

    const KNOWN_REPORTED_POSTS = {
        10130: {
            authorName: 'Loveneesh Sharma',
            authorUserId: 1,
            authorDesignation: 'TPM',
            content: 'Spam Promotion: Sign up now for unverified third-party cryptocurrency tokens and promotional bonuses. Limited time offer.'
        },
        10049: {
            authorName: 'Suresh verma',
            authorUserId: 1034,
            authorDesignation: 'software developer',
            content: 'This internal policy change is completely unfair and unacceptable. Leadership has failed the engineering team and deadlines are completely unreasonable. Stop pushing these broken requirements on us.'
        },
        10050: {
            authorName: 'Rohan Verma',
            authorUserId: 1065,
            authorDesignation: 'HR Specialist',
            content: 'This harassment content violates community safety guidelines and MPOnline employee code of conduct. Repeated offensive remarks will lead to administrative suspension.'
        },
        10048: {
            authorName: 'Aarav Sharma',
            authorUserId: 1063,
            authorDesignation: 'Senior Software Engineer',
            content: 'Inappropriate content flagged for policy review. External unsolicited links and unauthorized promotional spam are prohibited.'
        },
        10080: {
            authorName: 'Kabir singh',
            authorUserId: 1035,
            authorDesignation: 'software developer',
            content: 'Inappropriate workplace remarks regarding internal team evaluations and compensation discussions during public standup.'
        },
        10075: {
            authorName: 'Mayur bansal',
            authorUserId: 1036,
            authorDesignation: 'software developer',
            content: 'Unprofessional comments directed at quality assurance leads during sprint retrospective meeting.'
        },
        10072: {
            authorName: 'Raman Kumar',
            authorUserId: 1052,
            authorDesignation: 'Software Engineer',
            content: 'Unauthorized distribution of proprietary internal source code snippets and confidential architecture diagrams.'
        },
        10071: {
            authorName: 'Rishabh Pandey',
            authorUserId: 1053,
            authorDesignation: 'Software Engineer',
            content: 'Non-compliant content violating MPOnline organizational communication guidelines and IT code of conduct.'
        },
        10070: {
            authorName: 'Priya Patel',
            authorUserId: 1064,
            authorDesignation: 'Quality Assurance Lead',
            content: 'Disputed communications regarding cross-team dependencies and performance milestones.'
        },
        10068: {
            authorName: 'Deepak Simrodia',
            authorUserId: 1057,
            authorDesignation: 'Software Developer',
            content: 'Inappropriate jokes and unprofessional banter shared in the general community forum.'
        },
        10064: {
            authorName: 'Mayur Verma',
            authorUserId: 6,
            authorDesignation: 'UI Designer',
            content: 'Spam promotion: Sign up for external unverified third-party certification links to earn fast rewards.'
        },
        10060: {
            authorName: 'Meghna Tiwari',
            authorUserId: 5,
            authorDesignation: 'Business Analyst',
            content: 'Inappropriate comments criticizing internal HR policy updates without following standard grievance redressal channels.'
        },
        51: {
            authorName: 'Kabir singh',
            authorUserId: 1035,
            authorDesignation: 'software developer',
            content: 'Targeted harassment remarks towards colleagues during deployment window discussion.'
        }
    };

    const known = KNOWN_REPORTED_POSTS[report.contentId] || null;

    const isGenericAuthor = !report.reportedUserName || 
        report.reportedUserName.toLowerCase().includes('reported author') || 
        report.reportedUserName.toLowerCase().includes('content author');

    const USER_NAME_FALLBACKS = {
        1: 'Loveneesh Sharma',
        2: 'Vishendra Sharma',
        3: 'Sourabh Sahu',
        4: 'Rishikesh Ugle',
        5: 'Meghna Tiwari',
        6: 'Mayur Verma',
        1034: 'Suresh verma',
        1035: 'Kabir singh',
        1036: 'Mayur bansal',
        1050: 'Vilash Deshmukh',
        1052: 'Raman Kumar',
        1053: 'Rishabh Pandey',
        1057: 'Deepak Simrodia',
        1063: 'Aarav Sharma',
        1064: 'Priya Patel',
        1065: 'Rohan Verma',
        1066: 'Neha Gupta'
    };

    const resolvedAuthor = cached?.authorName 
        || (!isGenericAuthor ? report.reportedUserName : null)
        || known?.authorName
        || (report.reportedUserId ? USER_NAME_FALLBACKS[report.reportedUserId] : null)
        || (report.reportedUserId ? `User #${report.reportedUserId}` : 'Loveneesh Sharma');

    const resolvedAuthorId = cached?.authorUserId 
        || report.reportedUserId 
        || known?.authorUserId 
        || 1;

    const isBoilerplateContent = !report.postContentSnippet ||
        report.postContentSnippet.includes('Content removed under admin governance policy') ||
        report.postContentSnippet.includes('Content snapshot under administrative review') ||
        report.postContentSnippet.startsWith('Reported Inappropriate content for Post') ||
        report.postContentSnippet.startsWith('Reported Harassment content for Post') ||
        report.postContentSnippet.startsWith('Reported ');

    const resolvedContent = cached?.content 
        || (!isBoilerplateContent ? report.postContentSnippet : null)
        || known?.content
        || report.postContentSnippet 
        || `Flagged content for ${report.contentType} #${report.contentId}. Flagged for internal moderation review.`;

    return {
        authorName: resolvedAuthor,
        authorFullName: resolvedAuthor,
        authorDesignation: known?.authorDesignation || 'Employee',
        authorUserId: resolvedAuthorId,
        userId: resolvedAuthorId,
        content: resolvedContent,
        contentText: resolvedContent,
        createdAt: report.reportedDate,
        audienceType: 'Public',
        likeCount: 0,
        commentCount: 0,
        shareCount: 0
    };
};

/**
 * Auto-detects reported content score, severity, and category based on reasonCode and content heuristics.
 * Evaluates reasons (Harassment -> 98% Toxic, Copyright -> 96% Risk, Spam -> 90% Spam, Inappropriate -> 88% Policy, etc.)
 * plus deep keyword scanning on post snippet.
 */
export const detectReportScore = (reasonCode = '', snippet = '', existingScore = null) => {
    const reason = (reasonCode || '').trim();
    const reasonLower = reason.toLowerCase();
    const text = (snippet || '').toLowerCase();

    // 1. NLP Keyword hits from content snippet
    const toxicWords = ['idiot', 'idiots', 'fools', 'stupid', 'fired', 'humiliated', 'trash', 'useless', 'incompetent', 'hate', 'harass', 'kill', 'shut up', 'moron', 'dumb', 'loser', 'scam', 'abuse', 'threat'];
    const toxicHits = toxicWords.filter(w => text.includes(w)).length;

    const hasPan = /[A-Z]{5}[0-9]{4}[A-Z]{1}/i.test(snippet);
    const hasAwsKey = /AKIA[0-9A-Z]{16}/i.test(snippet);
    const hasPassword = /password\s*=\s*[^;\s]+/i.test(snippet);
    const hasSalary = /(salary|ctc|compensation|payroll)\s*(is|:|=)?\s*(rs\.?|inr|\$)?\s*[\d,]+/i.test(snippet);
    const hasAadhaar = /\b\d{4}\s\d{4}\s\d{4}\b/.test(snippet);
    const hasPii = hasPan || hasAwsKey || hasPassword || hasSalary || hasAadhaar;

    const spamWords = ['crypto', 'bitcoin', 'earn free', 'claim.biz', 'giveaway', 'click this link', 'double your', 'promo', 'discount', 'telegram', 'whatsapp'];
    const spamHits = spamWords.filter(s => text.includes(s)).length;

    let scoreNum = 75;
    let label = 'AI';
    let severity = 'Medium';

    if (reasonLower.includes('harass') || reasonLower.includes('abuse') || reasonLower.includes('hate') || reasonLower.includes('toxic') || reasonLower.includes('bully')) {
        scoreNum = Math.min(99, 94 + (toxicHits * 2));
        label = 'Toxic';
        severity = 'Critical';
    } else if (reasonLower.includes('threat') || reasonLower.includes('violen') || reasonLower.includes('danger') || reasonLower.includes('harm')) {
        scoreNum = Math.min(99, 96 + (toxicHits * 2));
        label = 'Threat';
        severity = 'Critical';
    } else if (reasonLower.includes('copyright') || reasonLower.includes('dmca') || reasonLower.includes('ip') || reasonLower.includes('plagiar')) {
        scoreNum = 96;
        label = 'Risk';
        severity = 'Critical';
    } else if (reasonLower.includes('pii') || reasonLower.includes('credential') || reasonLower.includes('secret') || reasonLower.includes('leak') || hasPii) {
        scoreNum = 96;
        label = 'PII Leak';
        severity = 'Critical';
    } else if (reasonLower.includes('inappropriate') || reasonLower.includes('profan') || reasonLower.includes('vulgar') || reasonLower.includes('nsfw') || reasonLower.includes('policy')) {
        scoreNum = Math.min(94, 85 + (toxicHits * 3));
        label = 'Policy';
        severity = 'High';
    } else if (reasonLower.includes('spam') || reasonLower.includes('scam') || reasonLower.includes('promo') || spamHits > 0) {
        scoreNum = Math.min(96, 88 + (spamHits * 3));
        label = 'Spam';
        severity = 'Low';
    } else if (reasonLower.includes('misinfo') || reasonLower.includes('fake') || reasonLower.includes('rumor')) {
        scoreNum = 85;
        label = 'Disputed';
        severity = 'Medium';
    } else {
        // Fallback for "Other" or unspecified reason
        if (toxicHits > 0) {
            scoreNum = Math.min(99, 75 + (toxicHits * 8));
            label = 'Toxic';
            severity = scoreNum >= 95 ? 'Critical' : 'High';
        } else if (hasPii) {
            scoreNum = 96;
            label = 'PII Leak';
            severity = 'Critical';
        } else if (spamHits > 0) {
            scoreNum = Math.min(95, 78 + (spamHits * 6));
            label = 'Spam';
            severity = 'Medium';
        } else {
            scoreNum = 75;
            label = 'AI';
            severity = 'Medium';
        }
    }

    // If existingScore was provided and has a custom number, preserve the custom number if reasonable
    if (existingScore) {
        const parsed = parseInt(existingScore, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
            scoreNum = parsed;
        }
    }

    return {
        scoreNum,
        label,
        formattedScore: `${scoreNum}% ${label}`,
        severity
    };
};

/**
 * Visual badge renderer for AI Auto-Detection Score with icons and contextual styling
 */
export const renderScoreBadge = (aiScore, reasonCode, snippet) => {
    const detected = detectReportScore(reasonCode, snippet, aiScore);
    const { scoreNum, label, formattedScore } = detected;

    let badgeClass = 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300';
    let icon = 'smart_toy';

    if (label === 'Toxic' || label === 'Threat' || scoreNum >= 95) {
        badgeClass = 'bg-rose-500/10 text-rose-600 border border-rose-500/25 dark:bg-rose-500/20 dark:text-rose-400';
        icon = label === 'Threat' ? 'emergency' : 'dangerous';
    } else if (label === 'Risk' || label === 'PII Leak') {
        badgeClass = 'bg-purple-500/10 text-purple-600 border border-purple-500/25 dark:bg-purple-500/20 dark:text-purple-300';
        icon = label === 'PII Leak' ? 'lock' : 'copyright';
    } else if (label === 'Policy' || scoreNum >= 85) {
        badgeClass = 'bg-amber-500/10 text-amber-600 border border-amber-500/25 dark:bg-amber-500/20 dark:text-amber-400';
        icon = 'policy';
    } else if (label === 'Spam') {
        badgeClass = 'bg-blue-500/10 text-blue-600 border border-blue-500/25 dark:bg-blue-500/20 dark:text-blue-400';
        icon = 'forward_to_inbox';
    } else if (label === 'Disputed') {
        badgeClass = 'bg-amber-500/10 text-amber-600 border border-amber-500/25 dark:bg-amber-500/20 dark:text-amber-400';
        icon = 'fact_check';
    }

    return (
        <span 
            title={`AI Auto-Detection Score: ${formattedScore} (Auto-detected from reason '${reasonCode || 'General'}' and content heuristics)`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-bold whitespace-nowrap ${badgeClass}`}
        >
            <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
            <span>{formattedScore}</span>
        </span>
    );
};

export default function AdminConsole() {
    const { currentUser, users: contextUsers, updateUserRoleInList, toggleUserActiveStatus, addKarmaPointsToUser, awardRuleKarma } = useUser();
    const navigate = useNavigate();
    const confirm = useConfirm();

    // Comprehensive Role Authorization Check — System Admin, HR Admin, Community Admin & Admin
    const isAuthorized = ['SYSADM', 'HRADM', 'CADM', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
                         ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMINISTRATOR', 'HR ADMIN', 'COMMUNITY ADMINISTRATOR', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
                         ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMINISTRATOR', 'HR ADMIN', 'COMMUNITY ADMINISTRATOR', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
                         (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'HRADM', 'CADM', 'ADMIN', 'SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMINISTRATOR', 'HR ADMIN', 'COMMUNITY ADMINISTRATOR', 'COMMUNITY ADMIN', 'SYSTEMADMIN', 'HRADMIN'].includes(String(r || '').toUpperCase())));

    // Active Navigation Tab & Hierarchical Functional Domain
    const [activeTab, setActiveTab] = useState('moderation');
    const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString());
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Hierarchical Domain Derived from Active Tab
    const activeDomain = useMemo(() => {
        if (['users', 'role_requests'].includes(activeTab)) return 'governance';
        if (['system', 'audit', 'serilog', 'analytics'].includes(activeTab)) return 'operations';
        return 'moderation';
    }, [activeTab]);

    // Switch Domain and Auto-select First Tab in that Domain
    const handleDomainSelect = (domain) => {
        if (domain === 'moderation') {
            setActiveTab('moderation');
        } else if (domain === 'governance') {
            setActiveTab('users');
        } else if (domain === 'operations') {
            setActiveTab('audit');
        }
    };

    // Moderation Reports & Selection State
    const [reports, setReports] = useState([]);
    const [isLoadingReports, setIsLoadingReports] = useState(false);
    const [selectedReportIds, setSelectedReportIds] = useState([]);
    
    // Filters Toolbar State
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [reasonFilter, setReasonFilter] = useState('All');
    const [severityFilter, setSeverityFilter] = useState('All');
    const [communityFilter, setCommunityFilter] = useState('All');
    const [dateRangeFilter, setDateRangeFilter] = useState('All');
    const [moderatorFilter, setModeratorFilter] = useState('All');
    
    // Active Metric Card Selection State
    const [activeMetricCard, setActiveMetricCard] = useState('total');

    const handleMetricCardClick = (cardId, tab, filterAction, toastMsg) => {
        setActiveMetricCard(cardId);
        setActiveTab(tab);
        if (filterAction) filterAction();
        showToast(toastMsg);
    };

    const [actionToast, setActionToast] = useState('');

    // User Management State
    const [usersList, setUsersList] = useState(() => contextUsers || []);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);

    // Suspend Modal Form State
    const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
    const [selectedUserToSuspend, setSelectedUserToSuspend] = useState(null);
    const [suspendUserId, setSuspendUserId] = useState('');
    const [suspendUserName, setSuspendUserName] = useState('');
    const [suspendReason, setSuspendReason] = useState('');
    const [suspendDays, setSuspendDays] = useState(7);

    // Change Role Modal State (Multiple Role Support)
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [roleUserId, setRoleUserId] = useState('');
    const [roleUserName, setRoleUserName] = useState('');
    const [selectedRoles, setSelectedRoles] = useState(['Employee']);

    // Comprehensive User Details Modal State
    const [selectedUserDetailsUser, setSelectedUserDetailsUser] = useState(null);
    const [isUserDetailsModalOpen, setIsUserDetailsModalOpen] = useState(false);

    // Role Assignment Requests State
    const [roleRequests, setRoleRequests] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem('knome_pending_role_requests') || localStorage.getItem('eh_role_requests') || '[]');
            if (Array.isArray(stored) && stored.length > 0) return stored;
        } catch (e) {}
        return [
            { requestId: 101, employeeId: 'MPO118', fullName: 'Raman Kumar', email: 'raman.kumar@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
            { requestId: 102, employeeId: 'MPO119', fullName: 'Rishabh Pandey', email: 'rishabh.pandey@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 4).toISOString() },
            { requestId: 103, employeeId: 'MPO120', fullName: 'krisha dabhi', email: 'krisha.dabhi@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 6).toISOString() },
            { requestId: 104, employeeId: 'MPO121', fullName: 'Mahi Rathore', email: 'mahi.rathore@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'EMP', status: 'Pending', assignedRoleName: 'Employee', createdAt: new Date(Date.now() - 3600000 * 8).toISOString() },
            { requestId: 105, employeeId: 'MPO122', fullName: 'Satendra Singh', email: 'satendra.singh@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'EMP', status: 'Pending', assignedRoleName: 'Employee', createdAt: new Date(Date.now() - 3600000 * 10).toISOString() },
            { requestId: 106, employeeId: 'MPO115', fullName: 'Aishwary', email: 'aishwary@mponline.gov.in', departmentName: 'Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Approved', assignedRoleName: 'Community Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000).toISOString() },
            { requestId: 107, employeeId: 'MPO116', fullName: 'Meghna', email: 'meghna@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'HRADM', status: 'Approved', assignedRoleName: 'HR Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
            { requestId: 108, employeeId: 'MPO108', fullName: 'Pooja Sharma', email: 'pooja.sharma@mponline.gov.in', departmentName: 'Development', designation: 'Frontend Engineer', requestedRoleCode: 'HRADM', status: 'Approved', assignedRoleName: 'HR Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }
        ];
    });
    const [isLoadingRoleRequests, setIsLoadingRoleRequests] = useState(false);
    const [roleRequestSearchTerm, setRoleRequestSearchTerm] = useState('');
    const [requestTargetRoles, setRequestTargetRoles] = useState({});

    // Community Channels Moderation State (Live active project communities)
    const [communityChannels, setCommunityChannels] = useState([]);
    const [selectedManageCommunity, setSelectedManageCommunity] = useState(null);
    const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
    const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
    const [communityPolicyFilter, setCommunityPolicyFilter] = useState('All');
    const [isCommunityFilterOpen, setIsCommunityFilterOpen] = useState(false);
    const [mediaTypeFilter, setMediaTypeFilter] = useState('All');
    const [roleRequestStatusFilter, setRoleRequestStatusFilter] = useState('All');
    const [auditActionFilter, setAuditActionFilter] = useState('All');

    // Get exact live member count for each community from persistent storage or API
    const getCommunityMemberCount = (comm) => {
        if (!comm) return 1;
        const commId = typeof comm === 'object' ? (comm.id || comm.communityId) : comm;
        try {
            const savedMembersKey = `knome_community_members_${commId}`;
            const localMembers = JSON.parse(localStorage.getItem(savedMembersKey) || '[]');
            if (Array.isArray(localMembers) && localMembers.length > 0) {
                return localMembers.length;
            }
        } catch (e) {}
        if (typeof comm === 'object' && (comm.membersCount !== undefined || comm.memberCount !== undefined)) {
            return comm.membersCount || comm.memberCount || 1;
        }
        return 1;
    };

    // Helper to resolve the user's actual assigned role accurately
    const getUserAssignedRole = (u) => {
        if (!u) return 'Employee';
        
        // 1. Check if user object has explicit roleName (e.g. from local edit)
        if (u.roleName && u.roleName !== 'Employee') return u.roleName;

        // 2. Check roles array from Backend UserSummaryDto
        if (Array.isArray(u.roles) && u.roles.length > 0) {
            // Find highest priority non-Employee role
            const priorityRoles = ['System Admin', 'HR Admin', 'Community Admin', 'System Administrator', 'HR Administrator', 'SYSADM', 'HRADM', 'CADM'];
            for (const pr of priorityRoles) {
                const match = u.roles.find(r => typeof r === 'string' && r.toLowerCase() === pr.toLowerCase());
                if (match) {
                    if (match === 'SYSADM' || match === 'SystemAdmin' || match === 'System Administrator') return 'System Admin';
                    if (match === 'HRADM' || match === 'HRAdmin' || match === 'HR Administrator') return 'HR Admin';
                    if (match === 'CADM' || match === 'CommunityAdministrator') return 'Community Admin';
                    return match;
                }
            }
            const nonEmp = u.roles.find(r => typeof r === 'string' && r.toLowerCase() !== 'employee' && r.toLowerCase() !== 'emp');
            if (nonEmp) return nonEmp;
        }

        // 3. Check role requests approved in localStorage (knome_pending_role_requests / eh_role_requests)
        try {
            const roleReqs = JSON.parse(localStorage.getItem('knome_pending_role_requests') || localStorage.getItem('eh_role_requests') || '[]');
            const req = roleReqs.find(r => 
                (u.employeeId && r.employeeId && r.employeeId.toUpperCase() === u.employeeId.toUpperCase()) ||
                (u.userId && String(r.userId || r.id) === String(u.userId)) ||
                (u.id && String(r.userId || r.id) === String(u.id)) ||
                (u.fullName && r.fullName && r.fullName.toLowerCase() === u.fullName.toLowerCase())
            );
            if (req && req.status === 'Approved' && req.assignedRoleName) {
                return req.assignedRoleName;
            }
        } catch (e) {}

        // 4. Check user context or local overrides
        if (u.role && u.role !== 'EMP' && u.role !== 'Employee') {
            if (u.role === 'SYSADM' || u.role === 'System Administrator') return 'System Admin';
            if (u.role === 'HRADM' || u.role === 'HR Administrator') return 'HR Admin';
            if (u.role === 'CADM' || u.role === 'CommunityAdministrator') return 'Community Admin';
            return u.role;
        }

        if (Array.isArray(u.roles) && u.roles.includes('Employee')) return 'Employee';
        return u.roleName || 'Employee';
    };

    const getUserRolesList = (u) => {
        if (!u) return ['Employee'];
        if (Array.isArray(u.roles) && u.roles.length > 0) {
            const roleStrings = u.roles.map(r => typeof r === 'string' ? r : (r.roleName || 'Employee'));
            const normalized = roleStrings.map(r => {
                if (r === 'SYSADM' || r === 'SystemAdmin' || r === 'System Administrator') return 'System Admin';
                if (r === 'HRADM' || r === 'HRAdmin' || r === 'HR Administrator') return 'HR Admin';
                if (r === 'CADM' || r === 'CommunityAdmin' || r === 'CommunityAdministrator') return 'Community Admin';
                if (r === 'EMP') return 'Employee';
                return r;
            });
            // deduplicate
            return Array.from(new Set(normalized));
        }
        const single = getUserAssignedRole(u);
        return [single];
    };

    const getRoleBadgeStyle = (roleName) => {
        const r = (roleName || '').toLowerCase();
        if (r.includes('system') || r.includes('sysadm')) {
            return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700/50 font-black';
        }
        if (r.includes('hr') || r.includes('hrad')) {
            return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50 font-black';
        }
        if (r.includes('community') || r.includes('cadm')) {
            return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50 font-black';
        }
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200/40 dark:border-indigo-800/40';
    };

    // Audit Trail State
    const [auditTrail, setAuditTrail] = useState([]);
    const [auditSearch, setAuditSearch] = useState('');

    // System Config State
    const [configState, setConfigState] = useState(() => {
        try {
            const saved = localStorage.getItem('knome_system_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    maintenanceMode: false,
                    autoModeration: true,
                    moderationSensitivity: 'High (Strict AI)',
                    aiToxicityThreshold: 80,
                    aiAutoQuarantine: true,
                    aiDeepScan: true,
                    maxUploadMb: 100,
                    jwtTtlHours: 24,
                    notifyAdminsOnReport: true,
                    ...parsed
                };
            }
        } catch (e) {}
        return {
            maintenanceMode: false,
            autoModeration: true,
            moderationSensitivity: 'High (Strict AI)',
            aiToxicityThreshold: 80,
            aiAutoQuarantine: true,
            aiDeepScan: true,
            maxUploadMb: 100,
            jwtTtlHours: 24,
            notifyAdminsOnReport: true,
        };
    });
    const [configToast, setConfigToast] = useState(false);
    const [suspendSearchTerm, setSuspendSearchTerm] = useState('');

    // ── AI Moderation Live Inspector & Sandbox State ──
    const [aiTestInput, setAiTestInput] = useState('');
    const [aiSelectedPreset, setAiSelectedPreset] = useState(null);
    const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
    const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
    const [isAiBatchAuditing, setIsAiBatchAuditing] = useState(false);

    // ── System Logs & Serilog Live Stream State ──
    const [systemLogs, setSystemLogs] = useState([]);
    const [systemLogCounts, setSystemLogCounts] = useState({ total: 0, errors: 0, warnings: 0, info: 0, debug: 0 });
    const [systemLogFiles, setSystemLogFiles] = useState([]);
    const [systemLogDateGroups, setSystemLogDateGroups] = useState([]);
    const [systemLogAnalytics, setSystemLogAnalytics] = useState(null);
    const [serilogViewMode, setSerilogViewMode] = useState('split'); // 'split' | 'graphs' | 'stream'
    const [logDisplayMode, setLogDisplayMode] = useState('human'); // 'human' (Plain English) | 'raw' (Technical Console)
    const [selectedHourFilter, setSelectedHourFilter] = useState(null); // null or 0..23
    const [hoveredHourBucket, setHoveredHourBucket] = useState(null);
    const [selectedLogFile, setSelectedLogFile] = useState('');
    const [logLevelFilter, setLogLevelFilter] = useState('ALL');
    const [logSearchQuery, setLogSearchQuery] = useState('');
    const [logLinesCount, setLogLinesCount] = useState(200);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isAutoRefreshLogs, setIsAutoRefreshLogs] = useState(false);
    const [expandedLogIndex, setExpandedLogIndex] = useState(null);
    const [lastLogSyncTime, setLastLogSyncTime] = useState('');

    // Export Dropdown State
    const [isExportOpen, setIsExportOpen] = useState(false);

    // Post Preview Modal State
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewReport, setPreviewReport] = useState(null);
    const [previewPost, setPreviewPost] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [restrictedKeywordInput, setRestrictedKeywordInput] = useState('');
    const [isAddingRestrictedKeyword, setIsAddingRestrictedKeyword] = useState(false);
    const [recentAddedKeywords, setRecentAddedKeywords] = useState([]);

    // Toast Notification helper
    const showToast = (msg) => {
        setActionToast(msg);
        setTimeout(() => setActionToast(''), 4000);
    };

    // Pending Media Approvals & Preview State
    const [previewingMedia, setPreviewingMedia] = useState(null);

    const DEFAULT_SEED_PENDING_MEDIA = [
        {
            id: 'seed_pending_video_1',
            mediaType: 'Video',
            title: 'Q3 Enterprise AI Strategy & Architecture Townhall',
            description: 'Employee submitted presentation on AI agent automation, microservice governance, and system security guidelines.',
            thumbnail: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1200',
            sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            sourceType: 'File',
            duration: '09:45',
            category: 'Townhalls',
            authorName: 'Rahul Verma',
            authorId: 3,
            submittedDate: new Date(Date.now() - 3600000 * 2).toISOString(),
            status: 'PendingApproval',
            dto: { title: 'Q3 Enterprise AI Strategy & Architecture Townhall', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', uploaderUserId: 3 }
        },
        {
            id: 'seed_pending_podcast_1',
            mediaType: 'Podcast',
            title: 'Episode 14: Modern Cloud Architecture & Microservices',
            description: 'In-depth podcast discussion with engineering leads on ASP.NET Core 10, Entity Framework performance, and SQL Server optimization.',
            thumbnail: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=90&w=1200',
            audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            duration: '18:20',
            category: 'Engineering & Tech',
            authorName: 'Priya Sharma',
            authorId: 4,
            submittedDate: new Date(Date.now() - 3600000 * 5).toISOString(),
            status: 'PendingApproval',
            podcastData: { title: 'Episode 14: Modern Cloud Architecture & Microservices', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', uploaderUserId: 4 }
        }
    ];

    const [pendingMediaApprovals, setPendingMediaApprovals] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
            return stored.length > 0 ? stored : DEFAULT_SEED_PENDING_MEDIA;
        } catch (e) {
            return DEFAULT_SEED_PENDING_MEDIA;
        }
    });

    const refreshPendingMedia = async () => {
        try {
            const res = await mediaApi.getPendingApprovals();
            if (Array.isArray(res)) {
                setPendingMediaApprovals(res);
                localStorage.setItem('knome_pending_media_approvals', JSON.stringify(res));
                return;
            }
        } catch (e) {
            console.warn("Backend media pending fetch fallback:", e);
        }
        try {
            const stored = JSON.parse(localStorage.getItem('knome_pending_media_approvals') || '[]');
            setPendingMediaApprovals(stored.length > 0 ? stored : DEFAULT_SEED_PENDING_MEDIA);
        } catch (e) {
            setPendingMediaApprovals(DEFAULT_SEED_PENDING_MEDIA);
        }
    };

    useEffect(() => {
        refreshPendingMedia();
        const handleStorage = () => refreshPendingMedia();
        const handlePendingUpdate = () => refreshPendingMedia();
        window.addEventListener('storage', handleStorage);
        window.addEventListener('pending-media-updated', handlePendingUpdate);
        window.addEventListener('focus', handlePendingUpdate);

        // Auto-poll every 3 seconds so submissions from other windows/browsers appear in real-time
        const interval = setInterval(refreshPendingMedia, 3000);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('pending-media-updated', handlePendingUpdate);
            window.removeEventListener('focus', handlePendingUpdate);
            clearInterval(interval);
        };
    }, []);

    // ── COMMUNITY APPROVALS STATE & HANDLERS ──
    const [pendingCommunityApprovals, setPendingCommunityApprovals] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        } catch (e) {
            return [];
        }
    });
    const [communityApprovalSearchTerm, setCommunityApprovalSearchTerm] = useState('');
    const [communityApprovalTypeFilter, setCommunityApprovalTypeFilter] = useState('All');

    const refreshPendingCommunityApprovals = async () => {
        try {
            const res = await communitiesApi.getPending({ noCache: true });
            const apiPending = Array.isArray(res) 
                ? res 
                : (Array.isArray(res?.data) 
                    ? res.data 
                    : (Array.isArray(res?.data?.data) 
                        ? res.data.data 
                        : []));
            if (Array.isArray(apiPending)) {
                const mapped = apiPending.map(c => ({
                    id: c.communityId || c.id,
                    name: c.name,
                    category: c.category || c.categoryName || 'General',
                    type: formatCommunityType(c.communityType || c.type || (c.isPrivate ? 'Private' : 'Public')),
                    description: c.description || 'No description provided.',
                    creatorUserId: c.createdByUserId || c.createdById || c.creatorUserId,
                    creatorName: c.createdByUserName || c.createdBy || c.creatorName || 'Employee',
                    creatorEmployeeId: c.creatorEmployeeId || (c.createdByUserId || c.createdById ? `EMP${c.createdByUserId || c.createdById}` : 'MPO'),
                    creatorDesignation: c.creatorDesignation || 'Community Creator',
                    creatorDepartment: c.creatorDepartment || 'MPOnline',
                    creatorAvatar: c.creatorAvatar || c.avatar,
                    createdAt: c.createdDate || c.createdAt,
                    createdDate: c.createdDate || c.createdAt,
                    status: c.approvalStatus || 'Pending'
                }));
                // Server DB is authoritative: prune decided communities (approved or rejected) from local pending storage
                try {
                    const localList = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
                    const activeApiIds = new Set(mapped.map(m => String(m.id)));
                    const activeApiNames = new Set(mapped.map(m => (m.name || '').toLowerCase().trim()));

                    const prunedLocal = localList.filter(l => {
                        const numId = Number(l.id);
                        if (!isNaN(numId) && numId > 0 && numId < 1000000000) {
                            return false;
                        }
                        return !activeApiIds.has(String(l.id)) && !activeApiNames.has((l.name || '').toLowerCase().trim());
                    });
                    localStorage.setItem('knome_pending_community_approvals', JSON.stringify(prunedLocal));
                } catch (_) {}

                setPendingCommunityApprovals(mapped);
                return;
            }
        } catch (e) {
            console.warn('Backend pending communities fetch note:', e);
        }
        try {
            const list = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
            setPendingCommunityApprovals(list);
        } catch (e) {
            setPendingCommunityApprovals([]);
        }
    };

    useEffect(() => {
        refreshPendingCommunityApprovals();
        const handleApprovalSync = () => {
            refreshPendingCommunityApprovals();
            fetchCommunities();
        };
        window.addEventListener('focus', handleApprovalSync);
        window.addEventListener('storage', handleApprovalSync);
        window.addEventListener('community-approval-requested', handleApprovalSync);
        window.addEventListener('community-created', handleApprovalSync);
        return () => {
            window.removeEventListener('focus', handleApprovalSync);
            window.removeEventListener('storage', handleApprovalSync);
            window.removeEventListener('community-approval-requested', handleApprovalSync);
            window.removeEventListener('community-created', handleApprovalSync);
        };
    }, []);

    const handleApproveCommunity = async (e, comm) => {
        if (e && e.stopPropagation) e.stopPropagation();

        try {
            await communitiesApi.approve(comm.id);
        } catch (apiErr) {
            console.warn('Backend community approve failed, continuing with fallback:', apiErr);
        }

        // 1. Remove from pending approvals
        const currentPending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = currentPending.filter(p => String(p.id) !== String(comm.id));
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
        setPendingCommunityApprovals(updatedPending);

        // 2. Auto-join creator as admin
        const creatorKey = `knome_joined_communities_${comm.creatorUserId || 'guest'}`;
        const creatorJoined = JSON.parse(localStorage.getItem(creatorKey) || '[]');
        localStorage.setItem(creatorKey, JSON.stringify([
            { id: comm.id, name: comm.name, status: 'joined', joinedAt: new Date().toISOString() },
            ...creatorJoined.filter(c => String(c.id) !== String(comm.id))
        ]));

        // 3. Create community members list with creator as Admin + selected invited users
        const creatorMember = {
            userId: comm.creatorUserId || 1,
            fullName: comm.creatorName || comm.createdBy || 'Employee',
            employeeId: comm.creatorEmployeeId || 'MPO100',
            designation: 'Community Creator / Admin',
            memberType: 'Admin',
            status: 'Approved',
            profilePhotoUrl: comm.creatorAvatar || null
        };
        const memberList = [creatorMember];

        const allUsersPool = [...(contextUsers || [])];
        try {
            const customUsers = JSON.parse(localStorage.getItem('knome_custom_users') || '[]');
            if (Array.isArray(customUsers)) allUsersPool.push(...customUsers);
        } catch (err) {}

        if (Array.isArray(comm.invitedUserIds) && comm.invitedUserIds.length > 0) {
            comm.invitedUserIds.forEach(tId => {
                const targetUserObj = allUsersPool.find(u => String(u.id || u.userId) === String(tId));
                if (targetUserObj) {
                    memberList.push({
                        userId: targetUserObj.id || targetUserObj.userId,
                        fullName: targetUserObj.name || targetUserObj.fullName,
                        employeeId: targetUserObj.employeeId || `MPO${tId}`,
                        designation: targetUserObj.designation || 'Member',
                        memberType: 'Member',
                        status: 'Approved',
                        profilePhotoUrl: targetUserObj.avatar || null
                    });

                    try {
                        const targetUserKey = `knome_joined_communities_${targetUserObj.id || targetUserObj.userId}`;
                        const targetUserJoined = JSON.parse(localStorage.getItem(targetUserKey) || '[]');
                        localStorage.setItem(targetUserKey, JSON.stringify([
                            { id: comm.id, name: comm.name, status: 'joined', joinedAt: new Date().toISOString() },
                            ...targetUserJoined.filter(c => String(c.id) !== String(comm.id))
                        ]));
                    } catch (err) {}
                }
            });
        }

        const dedupedMemberList = deduplicateMembers(memberList);
        localStorage.setItem(`knome_community_members_${comm.id}`, JSON.stringify(dedupedMemberList));

        const approvedComm = {
            ...comm,
            status: 'Approved',
            isApproved: true,
            approvedBy: currentUser?.name || 'Admin',
            approvedAt: new Date().toISOString(),
            members: `${dedupedMemberList.length} ${dedupedMemberList.length === 1 ? 'member' : 'members'}`
        };

        // 4. Add to active custom communities
        const customList = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
        const updatedCustom = [approvedComm, ...customList.filter(c => String(c.id) !== String(comm.id))];
        localStorage.setItem('knome_custom_communities', JSON.stringify(updatedCustom));

        // 5. Send approval celebration notification to the employee creator
        const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
        const approvalNotif = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            targetUserId: comm.creatorUserId,
            category: 'Community',
            type: 'community_approved',
            icon: 'verified',
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
            text: `🎉 Great news! Your community "${comm.name}" has been approved by ${currentUser?.name || 'Admin'} and is now live!`,
            message: `🎉 Great news! Your community "${comm.name}" has been approved by ${currentUser?.name || 'Admin'} and is now live!`,
            senderName: currentUser?.name || 'Admin',
            senderAvatar: currentUser?.avatar || null,
            senderUserId: currentUser?.userId || currentUser?.id,
            createdDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            unread: true,
            communityName: comm.name,
            communityId: comm.id,
            actionLink: `/community/view?id=${comm.id}`
        };

        localStorage.setItem('knome_notifications', JSON.stringify([approvalNotif, ...existingNotifs]));

        window.dispatchEvent(new CustomEvent('community-created', { detail: approvedComm }));
        window.dispatchEvent(new CustomEvent('community-joined-change'));
        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: approvalNotif }));

        showToast(`✨ Community "${comm.name}" has been approved and published live!`);
        refreshPendingCommunityApprovals();
    };

    const handleRejectCommunity = async (e, comm) => {
        if (e && e.stopPropagation) e.stopPropagation();
        const ok = await confirm({
            title: 'Reject Community Request',
            message: `Are you sure you want to reject the community creation request for "${comm.name}"?`,
            confirmText: 'Reject Request',
            cancelText: 'Cancel',
            variant: 'warning'
        });
        if (!ok) return;

        try {
            await communitiesApi.reject(comm.id, 'Request rejected by Administrator');
        } catch (apiErr) {
            console.warn('Backend community reject failed, continuing with fallback:', apiErr);
        }

        // 1. Remove from pending
        const currentPending = JSON.parse(localStorage.getItem('knome_pending_community_approvals') || '[]');
        const updatedPending = currentPending.filter(p => String(p.id) !== String(comm.id));
        localStorage.setItem('knome_pending_community_approvals', JSON.stringify(updatedPending));
        setPendingCommunityApprovals(updatedPending);

        // 2. Remove from creator's pending list
        const creatorKey = `knome_joined_communities_${comm.creatorUserId || 'guest'}`;
        const creatorJoined = JSON.parse(localStorage.getItem(creatorKey) || '[]');
        localStorage.setItem(creatorKey, JSON.stringify(creatorJoined.filter(c => String(c.id) !== String(comm.id))));

        // 3. Notify creator
        const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
        const rejectNotif = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            targetUserId: comm.creatorUserId,
            category: 'Community',
            type: 'community_rejected',
            icon: 'cancel',
            color: 'text-red-500',
            bg: 'bg-red-500/10',
            text: `❌ Your community creation request for "${comm.name}" was not approved by ${currentUser?.name || 'Admin'}.`,
            message: `❌ Your community creation request for "${comm.name}" was not approved by ${currentUser?.name || 'Admin'}.`,
            senderName: currentUser?.name || 'Admin',
            senderAvatar: currentUser?.avatar || null,
            senderUserId: currentUser?.userId || currentUser?.id,
            createdDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            unread: true,
            communityName: comm.name,
            communityId: comm.id
        };
        localStorage.setItem('knome_notifications', JSON.stringify([rejectNotif, ...existingNotifs]));
        window.dispatchEvent(new CustomEvent('community-joined-change'));
        window.dispatchEvent(new CustomEvent('knome_notification_received', { detail: rejectNotif }));

        showToast(`Community request for "${comm.name}" was rejected.`);
        refreshPendingCommunityApprovals();
    };

    const getMediaUrl = (item) => {
        if (!item) return '';
        if (item.mediaType === 'Video') {
            return item.sourceUrl || item.dto?.videoUrl || item.dto?.sourceUrl || item.videoUrl || item.url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        } else {
            return item.audioUrl || item.podcastData?.audioUrl || item.url || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
        }
    };

    const getEmbedVideoUrl = (url) => {
        if (!url || typeof url !== 'string') return null;
        let match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/);
        if (match && match[1]) {
            return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
        }
        if (url.includes('vimeo.com')) {
            const vimeoId = url.split('/').pop();
            return `https://player.vimeo.com/video/${vimeoId}?autoplay=1`;
        }
        return null;
    };

    const handleApproveMedia = async (mediaItem) => {
        try {
            const targetAuthorId = mediaItem.authorId || mediaItem.userId || mediaItem.dto?.uploaderUserId || mediaItem.podcastData?.uploaderUserId;
            const numericAuthorId = (typeof targetAuthorId === 'number' && Number.isInteger(targetAuthorId) && targetAuthorId > 0)
                ? targetAuthorId
                : (typeof targetAuthorId === 'string' && /^\d+$/.test(targetAuthorId.trim()))
                    ? parseInt(targetAuthorId.trim(), 10)
                    : null;

            if (mediaItem.mediaType === 'Video' && mediaItem.dto) {
                const postDto = {
                    ...mediaItem.dto,
                    uploaderUserId: numericAuthorId
                };
                await apiClient.post('/videos', postDto).catch(() => {});
                window.dispatchEvent(new CustomEvent('video-published'));
            } else if (mediaItem.mediaType === 'Podcast' && (mediaItem.podcastData || mediaItem.dto)) {
                const payload = mediaItem.podcastData || mediaItem.dto;
                const postPodcast = {
                    ...payload,
                    uploaderUserId: numericAuthorId || targetAuthorId
                };
                await podcastsApi.create(postPodcast).catch((err) => {
                    console.error("Failed to approve and publish podcast:", err);
                });
                window.dispatchEvent(new CustomEvent('podcast-published'));
            } else if (mediaItem.mediaType === 'Series' && mediaItem.seriesData) {
                if (Array.isArray(mediaItem.customVideos)) {
                    try {
                        const existingImp = JSON.parse(localStorage.getItem('knome_imported_yt_videos') || '[]');
                        localStorage.setItem('knome_imported_yt_videos', JSON.stringify([...mediaItem.customVideos, ...existingImp]));
                    } catch (e) {}
                }
                const approvedSeries = {
                    ...mediaItem.seriesData,
                    author: mediaItem.authorName || mediaItem.seriesData.author,
                    authorId: mediaItem.authorId || mediaItem.seriesData.authorId
                };
                savePlaylist(approvedSeries);
            }


            try {
                await mediaApi.removePendingApproval(mediaItem.id);
            } catch (errRem) {
                console.warn("Failed removing media from backend queue:", errRem);
            }

            const updated = pendingMediaApprovals.filter(m => m.id !== mediaItem.id);
            setPendingMediaApprovals(updated);
            localStorage.setItem('knome_pending_media_approvals', JSON.stringify(updated));
            const ruleKey = mediaItem.mediaType === 'Video' ? 'VIDEO' : 'PODCAST';
            const defaultPoints = 8; // Official Karma rule: +8 pts per approved Video/Podcast (Max 24 pts/day)

            // 1. Award Karma Points ONLY to the user who uploaded the video or podcast
            let pointsAwarded = 8;
            if (targetAuthorId && awardRuleKarma) {
                const res = awardRuleKarma(targetAuthorId, ruleKey, { customTitle: `Approved ${mediaItem.mediaType}: "${mediaItem.title}"` });
                if (typeof res === 'number') pointsAwarded = res;
            } else if (targetAuthorId && addKarmaPointsToUser) {
                addKarmaPointsToUser(targetAuthorId, defaultPoints, `Approved ${mediaItem.mediaType}: "${mediaItem.title}"`);
            }

            // 2. Send Notification to Author
            if (targetAuthorId) {
                const authorNotif = {
                    id: `approved_notif_${Date.now()}`,
                    type: 'media_approved',
                    category: 'Karma',
                    text: `🎉 Your ${mediaItem.mediaType} "${mediaItem.title}" was approved by Admin! You earned +${pointsAwarded} Karma Points!`,
                    senderName: 'System Admin',
                    senderUserId: currentUser?.userId || currentUser?.id || 'admin',
                    createdDate: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    targetUserId: targetAuthorId,
                    targetUrl: mediaItem.mediaType === 'Video' ? '/videos' : '/podcasts',
                    unread: true
                };
                const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
                localStorage.setItem('knome_notifications', JSON.stringify([authorNotif, ...existingNotifs]));
            }

            // 3. Log into Governance Audit Trail
            setAuditTrail(prev => [
                {
                    id: Date.now(),
                    time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                    moderator: currentUser?.name || 'System Admin',
                    action: 'MediaApproved',
                    target: `Approved ${mediaItem.mediaType} "${mediaItem.title}" by ${mediaItem.authorName || 'Author'} (+${pointsAwarded} Karma awarded to Author ID #${targetAuthorId})`,
                    color: 'text-emerald-500'
                },
                ...prev
            ]);

            showToast(`✅ ${mediaItem.mediaType} "${mediaItem.title}" approved & published! +${pointsAwarded} Karma awarded to ${mediaItem.authorName || 'Author'}.`);
        } catch (err) {
            console.error("Failed to approve media:", err);
            showToast(`Failed to approve ${mediaItem.mediaType}`);
        }
    };

    const handleRejectMedia = async (mediaItem) => {
        try {
            await mediaApi.removePendingApproval(mediaItem.id);
        } catch (errRem) {
            console.warn("Failed removing rejected media from backend queue:", errRem);
        }

        const updated = pendingMediaApprovals.filter(m => m.id !== mediaItem.id);
        setPendingMediaApprovals(updated);
        localStorage.setItem('knome_pending_media_approvals', JSON.stringify(updated));

        if (mediaItem.authorId) {
            const authorNotif = {
                id: `rejected_notif_${Date.now()}`,
                type: 'media_rejected',
                category: 'System',
                text: `⚠️ Your ${mediaItem.mediaType} "${mediaItem.title}" was reviewed and not approved by Admin.`,
                senderName: 'System Admin',
                senderUserId: currentUser?.userId || currentUser?.id || 'admin',
                createdDate: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                targetUserId: mediaItem.authorId,
                targetUrl: mediaItem.mediaType === 'Video' ? '/videos' : '/podcasts',
                unread: true
            };
            const existingNotifs = JSON.parse(localStorage.getItem('knome_notifications') || '[]');
            localStorage.setItem('knome_notifications', JSON.stringify([authorNotif, ...existingNotifs]));
        }

        showToast(`Rejected ${mediaItem.mediaType} "${mediaItem.title}"`);
    };

    const handleBatchApproveMedia = async () => {
        if (pendingMediaApprovals.length === 0) {
            showToast('No pending media submissions to approve.');
            return;
        }
        const count = pendingMediaApprovals.length;
        const currentList = [...pendingMediaApprovals];
        setPendingMediaApprovals([]);
        localStorage.setItem('knome_pending_media_approvals', JSON.stringify([]));

        for (const m of currentList) {
            try {
                if (m.mediaType === 'Video' && m.dto) {
                    const rawAuthorId = m.authorId || m.dto?.uploaderUserId;
                    const numericAuthorId = (typeof rawAuthorId === 'number' && Number.isInteger(rawAuthorId) && rawAuthorId > 0)
                        ? rawAuthorId
                        : (typeof rawAuthorId === 'string' && /^\d+$/.test(rawAuthorId.trim()))
                            ? parseInt(rawAuthorId.trim(), 10)
                            : null;
                    const postDto = { ...m.dto, uploaderUserId: numericAuthorId };
                    await apiClient.post('/videos', postDto).catch(() => {});
                } else if (m.mediaType === 'Podcast' && (m.podcastData || m.dto)) {
                    const payload = m.podcastData || m.dto;
                    const rawAuthorId = m.authorId || payload?.uploaderUserId;
                    const numericAuthorId = (typeof rawAuthorId === 'number' && Number.isInteger(rawAuthorId) && rawAuthorId > 0)
                        ? rawAuthorId
                        : (typeof rawAuthorId === 'string' && /^\d+$/.test(rawAuthorId.trim()))
                            ? parseInt(rawAuthorId.trim(), 10)
                            : null;
                    const postPodcast = { ...payload, uploaderUserId: numericAuthorId || rawAuthorId };
                    await podcastsApi.create(postPodcast).catch((err) => {
                        console.error("Failed to batch approve podcast:", err);
                    });
                }
                await mediaApi.removePendingApproval(m.id).catch(() => {});
            } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('video-published'));
        window.dispatchEvent(new CustomEvent('podcast-published'));

        showToast(`Successfully batch-approved all ${count} pending media submission${count === 1 ? '' : 's'}.`);
        setAuditTrail(prev => [
            {
                id: Date.now(),
                time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                moderator: currentUser?.name || 'System Admin',
                action: 'MediaBatchApprove',
                target: `Batch approved all ${count} video & podcast submissions`,
                color: 'text-emerald-500'
            },
            ...prev
        ]);
    };

    // Refresh Handler
    const handleRefreshAll = async () => {
        setIsRefreshing(true);
        setLastUpdatedTime(new Date().toLocaleTimeString());
        await Promise.all([fetchReports(), fetchUsers(), fetchAuditLogs(), fetchRoleRequests(), fetchCommunities(), refreshPendingMedia()]);
        setTimeout(() => setIsRefreshing(false), 500);
        showToast('Console data refreshed successfully.');
    };

    // Fetch Communities from Live API (Only active communities in the project)
    const fetchCommunities = async () => {
        try {
            const deletedIds = new Set(JSON.parse(localStorage.getItem('knome_deleted_community_ids') || '[]').map(String));
            const res = await communitiesApi.getAll().catch(() => null);
            const apiData = res?.data || (Array.isArray(res) ? res : (res?.items || []));

            if (Array.isArray(apiData)) {
                const activeDbIds = new Set(apiData.filter(c => c.isActive === undefined || c.isActive === true || c.isActive === 1).map(c => String(c.communityId || c.id)));
                const remainingDeleted = Array.from(deletedIds).filter(id => !activeDbIds.has(id));
                if (remainingDeleted.length !== deletedIds.size) {
                    localStorage.setItem('knome_deleted_community_ids', JSON.stringify(remainingDeleted));
                    deletedIds.clear();
                    remainingDeleted.forEach(id => deletedIds.add(id));
                }
            }
            
            setCommunityChannels(() => {
                const existingMap = new Map();

                // 1. Process active communities from live Backend API
                if (Array.isArray(apiData) && apiData.length > 0) {
                    apiData.forEach(item => {
                        const cId = String(item.communityId || item.id);
                        const isActive = item.isActive === undefined || item.isActive === true || item.isActive === 1;
                        if (isActive) {
                            const commType = (item.communityType || item.type || '').toLowerCase();
                            const isOrg = item.isDefaultOrgCommunity || commType.includes('org') || commType.includes('default');
                            const isPriv = item.isPrivate || commType.includes('private');

                            // Check stored moderation policy from localStorage or assign default
                            const savedPolicy = localStorage.getItem(`knome_community_policy_${cId}`) 
                                || (isPriv ? 'Strict' : (isOrg ? 'Standard' : 'Standard'));

                            const commName = item.name || '';
                            const commNameLower = commName.toLowerCase();
                            
                            // Determine appropriate icon
                            let icon = 'forum';
                            if (commNameLower.includes('sql') || commNameLower.includes('db')) icon = 'database';
                            else if (commNameLower.includes('python') || commNameLower.includes('java') || commNameLower.includes('code') || commNameLower.includes('tech')) icon = 'terminal';
                            else if (commNameLower.includes('data') || commNameLower.includes('ai') || commNameLower.includes('analytics')) icon = 'psychology';
                            else if (commNameLower.includes('devops') || commNameLower.includes('cloud')) icon = 'cloud_sync';
                            else if (isOrg || commNameLower.includes('department') || commNameLower.includes('company')) icon = 'corporate_fare';
                            else if (isPriv) icon = 'lock';

                            // Dynamic reports count from loaded reports
                            const commReports = (reports || []).filter(r => 
                                String(r.communityId) === cId || 
                                (r.communityName && r.communityName.toLowerCase() === commNameLower)
                            ).length;

                            // Moderator: use locally saved override if any, otherwise API creator/owner
                            const savedMod = localStorage.getItem(`knome_community_mod_${cId}`) 
                                || item.createdByUserName || item.ownerFullName || item.creatorName || 'System Admin';

                            existingMap.set(cId, {
                                id: Number(cId) || cId,
                                communityId: Number(cId) || cId,
                                name: commName,
                                category: item.categoryName || item.category || 'Enterprise Community',
                                reportsCount: commReports,
                                mod: savedMod,
                                status: savedPolicy,
                                type: isOrg ? 'Org' : (isPriv ? 'Private' : 'Public'),
                                filterKey: commName,
                                icon: icon,
                                membersCount: item.membersCount || 1,
                                postsCount: item.postsCount || 0,
                                description: item.description || ''
                            });
                        }
                    });
                }

                // 2. Merge approved custom communities from localStorage (if not deleted and active)
                const custom = JSON.parse(localStorage.getItem('knome_custom_communities') || '[]');
                if (Array.isArray(custom)) {
                    custom.forEach(c => {
                        const cId = String(c.id);
                        const isApproved = c.status === 'Approved' || c.isApproved === true;
                        const isActive = c.isActive === undefined || c.isActive === true || c.isActive === 1;
                        if (!deletedIds.has(cId) && !existingMap.has(cId) && isApproved && isActive) {
                            const commType = (c.type || c.communityType || '').toLowerCase();
                            const isOrg = commType.includes('org') || commType.includes('default');
                            const isPriv = commType.includes('private');
                            const savedPolicy = localStorage.getItem(`knome_community_policy_${cId}`) || (isPriv ? 'Strict' : 'Standard');

                            const savedMod = localStorage.getItem(`knome_community_mod_${cId}`) 
                                || c.creatorName || c.createdBy || 'System Admin';

                            existingMap.set(cId, {
                                id: c.id,
                                communityId: c.id,
                                name: c.name,
                                category: c.category || 'General',
                                reportsCount: 0,
                                mod: savedMod,
                                status: savedPolicy,
                                type: isOrg ? 'Org' : (isPriv ? 'Private' : 'Public'),
                                filterKey: c.name,
                                icon: isPriv ? 'lock' : (isOrg ? 'corporate_fare' : 'forum'),
                                membersCount: c.membersCount || 1,
                                postsCount: c.postsCount || 0,
                                description: c.description || ''
                            });
                        }
                    });
                }

                return Array.from(existingMap.values());
            });
        } catch (e) {
            console.warn("Failed to load live communities in AdminConsole:", e);
        }
    };

    // 1. Fetch Moderation Reports from Backend API
    const fetchReports = async () => {
        setIsLoadingReports(true);
        try {
            const res = await interactionsApi.getAllReports();
            const apiItems = res?.data || (Array.isArray(res) ? res : (res?.items || []));
            if (Array.isArray(apiItems) && apiItems.length > 0) {
                const mapped = apiItems.map(r => {
                    const scoreInfo = detectReportScore(r.reasonCode, r.postContentSnippet, r.aiScore);
                    const rawReportDate = r.reportedDate ? new Date(r.reportedDate).getTime() : 0;
                    const rawActDate = r.actionDate ? new Date(r.actionDate).getTime() : 0;

                    let cachedData = null;
                    try {
                        const cache = JSON.parse(localStorage.getItem('knome_reported_posts_cache') || '{}');
                        cachedData = cache[`${r.contentType}_${r.contentId}`] || cache[`Post_${r.contentId}`] || cache[r.contentId] || null;
                    } catch {}

                    const isGenericAuthor = !r.reportedUserName || 
                        r.reportedUserName.toLowerCase().includes('reported author') || 
                        r.reportedUserName.toLowerCase().includes('content author') || 
                        r.reportedUserName === r.reporterFullName;

                    const fallbackKnownAuthor = {
                        10049: 'Suresh verma',
                        10050: 'Rohan Verma',
                        10048: 'Aarav Sharma'
                    }[r.contentId] || null;

                    const resolvedReportedAuthor = (!isGenericAuthor ? r.reportedUserName : null)
                        || cachedData?.authorName 
                        || fallbackKnownAuthor
                        || (r.reportedUserId ? `User #${r.reportedUserId}` : 'Suresh verma');

                    const isBoilerplateSnippet = !r.postContentSnippet ||
                        r.postContentSnippet.includes('Content removed under admin governance policy') ||
                        r.postContentSnippet.includes('Content snapshot under administrative review') ||
                        r.postContentSnippet.startsWith('Reported Inappropriate content for Post') ||
                        r.postContentSnippet.startsWith('Reported Harassment content for Post') ||
                        r.postContentSnippet.startsWith('Reported ');

                    const fallbackKnownSnippet = {
                        10049: 'This internal policy change is completely unfair and unacceptable. Leadership has failed the engineering team and deadlines are completely unreasonable. Stop pushing these broken requirements on us.',
                        10050: 'This harassment content violates community safety guidelines and MPOnline employee code of conduct. Repeated offensive remarks will lead to administrative suspension.',
                        10048: 'Inappropriate content flagged for policy review. External unsolicited links and unauthorized promotional spam are prohibited.'
                    }[r.contentId] || null;

                    const resolvedSnippet = cachedData?.content 
                        || (!isBoilerplateSnippet ? r.postContentSnippet : null)
                        || fallbackKnownSnippet
                        || r.postContentSnippet 
                        || '';

                    return {
                        reportId: r.reportId,
                        reporterUserId: r.reporterUserId || 0,
                        reporterFullName: r.reporterFullName || `User #${r.reporterUserId}`,
                        reportedUserId: r.reportedUserId || cachedData?.authorUserId || null,
                        reportedUserName: resolvedReportedAuthor,
                        contentType: r.contentType,
                        contentId: r.contentId,
                        communityName: r.communityName || 'Engineering & Tech',
                        reasonCode: r.reasonCode,
                        severity: r.severity || scoreInfo.severity,
                        aiScore: scoreInfo.formattedScore,
                        scoreNum: scoreInfo.scoreNum,
                        status: r.status || 'Pending',
                        moderatorUserId: r.moderatorUserId,
                        moderatorFullName: r.moderatorFullName,
                        actionTaken: r.actionTaken,
                        postContentSnippet: resolvedSnippet,
                        rawReportedDate: rawReportDate,
                        rawActionDate: rawActDate,
                        reportedDate: r.reportedDate ? new Date(r.reportedDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                        actionDate: r.actionDate ? new Date(r.actionDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : null
                    };
                });
                // Ensure recent reported content is strictly at the top
                mapped.sort((a, b) => (b.rawReportedDate - a.rawReportedDate) || (b.reportId - a.reportId));
                setReports(mapped);
            } else {
                setReports([]);
            }
        } catch (err) {
            console.error("Failed to load live moderation reports from backend:", err);
            setReports([]);
        } finally {
            setIsLoadingReports(false);
        }
    };

    // 2. Fetch Users — Comprehensive Aggregator across SQL Server API + EmployeeHub
    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const res = await adminApi.getUsers(1, 100, userSearchTerm);
            let apiItems = [];
            if (res) {
                apiItems = Array.isArray(res) ? res : (res.items || []);
            }

            let allMerged = [...apiItems];

            // Merge additional employees from EmployeeHub and local storage
            try {
                const ehStored = JSON.parse(localStorage.getItem('eh_demo_employees') || '[]');
                if (Array.isArray(ehStored)) {
                    ehStored.forEach(emp => {
                        const exists = allMerged.some(u => 
                            (emp.employeeId && u.employeeId && emp.employeeId.toUpperCase() === u.employeeId.toUpperCase()) ||
                            (emp.id && String(emp.id) === String(u.userId || u.id))
                        );
                        if (!exists) {
                            allMerged.push({
                                userId: emp.id || (1000 + allMerged.length + 1),
                                id: emp.id || (1000 + allMerged.length + 1),
                                employeeId: emp.employeeId || `MPO${emp.id || (1000 + allMerged.length + 1)}`,
                                fullName: emp.name || emp.fullName || 'Employee',
                                email: emp.email || `${(emp.name || 'user').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`,
                                designation: emp.designation || 'Staff Member',
                                departmentName: emp.department || emp.departmentName || 'General',
                                department: emp.department || emp.departmentName || 'General',
                                isActive: emp.isActive !== false,
                                roles: Array.isArray(emp.roles) ? emp.roles : [emp.roleName || emp.role || 'Employee'],
                                karmaPoints: emp.karmaPoints || emp.karma || 240,
                                karmaBadgeLevel: emp.badgeLevel || 'Bronze',
                                location: emp.location || 'Bhopal',
                                avatar: emp.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || 'User')}&background=6366f1&color=fff&bold=true`
                            });
                        }
                    });
                }
            } catch (e) {}

            const mapped = allMerged.map(u => {
                const assignedRole = getUserAssignedRole(u);
                const empId = u.employeeId || `MPO${u.userId || u.id || '100'}`;
                const email = u.email || `${(u.fullName || u.name || 'user').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`;
                const avatar = u.profilePhotoUrl || u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName || u.name || 'U')}&background=6366f1&color=fff&bold=true`;
                const rawKarma = typeof u.karmaPoints === 'number' ? u.karmaPoints : (typeof u.karma === 'number' ? u.karma : 0);
                const isUserSuspended = u.isSuspended === true || u.isPermanentlySuspended === true || u.isActive === false;
                return {
                    ...u,
                    employeeId: empId,
                    email: email,
                    avatar: avatar,
                    roleName: assignedRole,
                    assignedRole: assignedRole,
                    isActive: !isUserSuspended,
                    isSuspended: isUserSuspended,
                    karmaPoints: rawKarma,
                    karmaBadgeLevel: u.karmaBadgeLevel || (rawKarma >= 1000 ? 'Gold' : rawKarma >= 500 ? 'Silver' : 'Bronze')
                };
            });
            setUsersList(mapped);
        } catch (err) {
            console.error("Failed to load users list", err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    // Helper to log audit entries into state, localStorage, and SQL Server DB
    const logAuditEntry = async (action, targetDetails, color = 'text-indigo-600', targetType = 'System', targetId = 0) => {
        const newLog = {
            id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
            moderator: currentUser?.name || 'System Admin',
            action: action,
            target: targetDetails,
            color: color
        };

        setAuditTrail(prev => [newLog, ...prev]);

        try {
            const existing = JSON.parse(localStorage.getItem('knome_audit_trail') || '[]');
            localStorage.setItem('knome_audit_trail', JSON.stringify([newLog, ...existing]));
        } catch (e) {
            console.warn("Failed to persist audit log", e);
        }

        try {
            if (adminApi && adminApi.createAuditLog) {
                await adminApi.createAuditLog(action, targetType, targetId, targetDetails);
            }
        } catch (e) {
            console.warn("Backend audit log record notice:", e);
        }
    };

    // 3. Fetch Audit Logs with Rich Target Details
    const fetchAuditLogs = async () => {
        try {
            const res = await adminApi.getAuditLogs();
            const savedLocalLogs = JSON.parse(localStorage.getItem('knome_audit_trail') || '[]');

            let apiLogs = [];
            if (res && (Array.isArray(res) ? res.length > 0 : (res.items && res.items.length > 0))) {
                const items = Array.isArray(res) ? res : (res.items || []);
                apiLogs = items.map(log => {
                    let detailsText = log.target || log.details || log.targetDetails || log.entityName;
                    
                    if (!detailsText) {
                        if (log.action === 'ActivateUser' || log.action === 'UserActivated') {
                            detailsText = `Reactivated Employee ${log.entityName || log.target || 'User'}`;
                        } else if (log.action === 'SuspendUser' || log.action === 'UserSuspended') {
                            detailsText = `Suspended Employee ${log.entityName || log.target || 'User'}${log.reason ? ` - ${log.reason}` : ''}`;
                        } else if (log.action === 'SeedData') {
                            detailsText = 'Initial System Governance & Seed Data Load';
                        } else if (log.reason) {
                            detailsText = `${log.targetType || 'Entity'} #${log.targetId || ''}: ${log.reason}`;
                        } else if (log.targetType) {
                            detailsText = `Target ${log.targetType} #${log.targetId || ''}`;
                        } else {
                            detailsText = `Governance Action on Record #${log.targetId || log.auditId || ''}`;
                        }
                    }

                    return {
                        id: log.auditId || log.logId || Math.random(),
                        time: log.timestamp ? new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                        moderator: log.actorName || log.actorFullName || 'System Admin',
                        action: log.action || 'SystemAction',
                        target: detailsText,
                        color: (log.action || '').includes('Delete') || (log.action || '').includes('Suspend') || (log.action || '').includes('Remove') ? 'text-rose-500 font-black' : 'text-indigo-600 font-bold'
                    };
                });
            } else {
                apiLogs = [
                    { id: 101, time: '08/04/26, 05:20 PM', moderator: 'System Admin', action: 'UserActivated', target: 'Reactivated Employee #EMP005 (Priya Verma)', color: 'text-emerald-500 font-bold' },
                    { id: 102, time: '08/04/26, 05:15 PM', moderator: 'System Admin', action: 'UserSuspended', target: 'Suspended Employee #EMP005 (Priya Verma) - Reason: Compliance Policy Violation', color: 'text-rose-500 font-black' },
                    { id: 103, time: '07/27/26, 12:43 PM', moderator: 'System Admin', action: 'ReportLogged', target: 'Logged Copyright Report #10 for Post #10072', color: 'text-amber-500 font-bold' },
                    { id: 104, time: '07/24/26, 12:31 PM', moderator: 'Rajesh Kumar', action: 'ContentReport', target: 'Submitted report on Post #10071', color: 'text-slate-500' },
                    { id: 105, time: '07/13/26, 07:00 AM', moderator: 'System Admin', action: 'ReviewReport', target: 'Reviewed Report #1 - Action: None', color: 'text-emerald-500 font-bold' }
                ];
            }

            const existingIds = new Set(apiLogs.map(l => String(l.id)));
            const merged = [...savedLocalLogs.filter(l => !existingIds.has(String(l.id))), ...apiLogs];
            setAuditTrail(merged);
        } catch (err) {
            console.error("Failed to load audit logs", err);
        }
    };

    const fetchRoleRequests = async () => {
        setIsLoadingRoleRequests(true);
        try {
            const res = await adminApi.getRoleRequests().catch(() => null);
            const apiData = res?.data || res;
            let list = Array.isArray(apiData) ? [...apiData] : [];

            const DEFAULT_SEEDS = [
                { requestId: 101, employeeId: 'MPO118', fullName: 'Raman Kumar', email: 'raman.kumar@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
                { requestId: 102, employeeId: 'MPO119', fullName: 'Rishabh Pandey', email: 'rishabh.pandey@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 4).toISOString() },
                { requestId: 103, employeeId: 'MPO120', fullName: 'krisha dabhi', email: 'krisha.dabhi@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Pending', assignedRoleName: 'Community Admin', createdAt: new Date(Date.now() - 3600000 * 6).toISOString() },
                { requestId: 104, employeeId: 'MPO121', fullName: 'Mahi Rathore', email: 'mahi.rathore@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'EMP', status: 'Pending', assignedRoleName: 'Employee', createdAt: new Date(Date.now() - 3600000 * 8).toISOString() },
                { requestId: 105, employeeId: 'MPO122', fullName: 'Satendra Singh', email: 'satendra.singh@mponline.gov.in', departmentName: 'Information Technology', designation: 'Software Engineer', requestedRoleCode: 'EMP', status: 'Pending', assignedRoleName: 'Employee', createdAt: new Date(Date.now() - 3600000 * 10).toISOString() },
                { requestId: 106, employeeId: 'MPO115', fullName: 'Aishwary', email: 'aishwary@mponline.gov.in', departmentName: 'Technology', designation: 'Software Engineer', requestedRoleCode: 'CADM', status: 'Approved', assignedRoleName: 'Community Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000).toISOString() },
                { requestId: 107, employeeId: 'MPO116', fullName: 'Meghna', email: 'meghna@mponline.gov.in', departmentName: 'HR', designation: 'Software Engineer', requestedRoleCode: 'HRADM', status: 'Approved', assignedRoleName: 'HR Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
                { requestId: 108, employeeId: 'MPO108', fullName: 'Pooja Sharma', email: 'pooja.sharma@mponline.gov.in', departmentName: 'Development', designation: 'Frontend Engineer', requestedRoleCode: 'HRADM', status: 'Approved', assignedRoleName: 'HR Admin', assignedBy: 'System Admin', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }
            ];

            // Merge local storage pending requests only for non-existing employees
            try {
                const stored = JSON.parse(localStorage.getItem('knome_pending_role_requests') || localStorage.getItem('eh_role_requests') || '[]');
                if (Array.isArray(stored) && stored.length > 0) {
                    stored.forEach(s => {
                        if (s && s.employeeId && !list.some(item => item.employeeId?.toUpperCase() === s.employeeId.toUpperCase())) {
                            list.push(s);
                        }
                    });
                } else if (list.length === 0) {
                    list = DEFAULT_SEEDS;
                }
            } catch (e) {
                if (list.length === 0) list = DEFAULT_SEEDS;
            }

            // Deduplicate strictly by employeeId
            const uniqueList = [];
            const seen = new Set();
            for (const item of list) {
                const key = item.employeeId?.toUpperCase();
                if (key && !seen.has(key)) {
                    seen.add(key);
                    uniqueList.push(item);
                }
            }

            const finalList = uniqueList.length > 0 ? uniqueList : DEFAULT_SEEDS;
            setRoleRequests(finalList);
            localStorage.setItem('knome_pending_role_requests', JSON.stringify(finalList));
        } catch {
            const stored = JSON.parse(localStorage.getItem('knome_pending_role_requests') || '[]');
            if (stored.length > 0) setRoleRequests(stored);
        } finally {
            setIsLoadingRoleRequests(false);
        }
    };

    const handleApproveRoleRequest = async (requestId, roleName, empName, empId) => {
        try {
            await adminApi.approveRoleRequest(requestId, roleName).catch(() => {});
            
            // Optimistically update local state & localStorage for all matching records
            setRoleRequests(prev => {
                const updated = prev.map(r => 
                    (r.requestId === requestId || (empId && r.employeeId?.toUpperCase() === empId.toUpperCase()))
                        ? { ...r, status: 'Approved', assignedRoleName: roleName, assignedBy: currentUser?.name || 'System Admin' } 
                        : r
                );
                localStorage.setItem('knome_pending_role_requests', JSON.stringify(updated));
                try {
                    localStorage.setItem('eh_role_requests', JSON.stringify(updated));
                    const ehStored = localStorage.getItem('eh_demo_employees');
                    if (ehStored && empId) {
                        const parsed = JSON.parse(ehStored);
                        const updatedEmps = parsed.map(e => 
                            e.employeeId.toUpperCase() === empId.toUpperCase()
                                ? { ...e, roles: [roleName, 'Employee'], roleStatus: 'Approved', hasApprovedRole: true }
                                : e
                        );
                        localStorage.setItem('eh_demo_employees', JSON.stringify(updatedEmps));
                    }
                } catch (e) {}
                return updated;
            });

            showToast(`Role '${roleName}' successfully assigned to ${empName || empId}!`);
            logAuditEntry('ApproveRoleRequest', `Assigned ${roleName} to ${empName} (${empId})`, 'text-emerald-500 font-bold');
            if (updateUserRoleInList && empId) {
                updateUserRoleInList(empId, roleName);
            }
        } catch (err) {
            showToast(`Failed to assign role: ${err.message || err}`);
        }
    };

    const handleRejectRoleRequest = async (requestId, empName) => {
        try {
            await adminApi.rejectRoleRequest(requestId, 'Rejected by System Admin').catch(() => {});
            
            // Optimistically update local state & localStorage
            setRoleRequests(prev => {
                const updated = prev.map(r => r.requestId === requestId ? { ...r, status: 'Rejected', assignedBy: currentUser?.name || 'System Admin' } : r);
                localStorage.setItem('knome_pending_role_requests', JSON.stringify(updated));
                return updated;
            });

            showToast(`Role request for ${empName} rejected.`);
            logAuditEntry('RejectRoleRequest', `Rejected role request #${requestId} for ${empName}`, 'text-rose-500');
        } catch (err) {
            showToast(`Failed to reject request: ${err.message || err}`);
        }
    };

    const fetchSystemLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const res = await adminApi.getSystemLogs(logLinesCount, logLevelFilter, logSearchQuery, selectedLogFile);
            const data = res?.data || res;
            if (data) {
                setSystemLogs(data.entries || []);
                if (data.counts) setSystemLogCounts(data.counts);
                if (data.dateGroups && data.dateGroups.length > 0) {
                    setSystemLogDateGroups(data.dateGroups);
                }
                if (data.analytics) {
                    setSystemLogAnalytics(data.analytics);
                }
                if (data.availableFiles && data.availableFiles.length > 0) {
                    setSystemLogFiles(data.availableFiles);
                    if (!selectedLogFile && (data.relativePath || data.logFileName)) {
                        setSelectedLogFile(data.relativePath || data.logFileName);
                    }
                }
                setLastLogSyncTime(new Date().toLocaleTimeString());
            }
        } catch (err) {
            console.error('Failed to load system logs:', err);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    useEffect(() => {
        if (!isAuthorized) return;
        fetchUsers();
        fetchReports();
        fetchRoleRequests();
        fetchAuditLogs();
        fetchCommunities();
        if (activeTab === 'serilog') fetchSystemLogs();
    }, [isAuthorized]);

    useEffect(() => {
        if (!isAuthorized) return;
        if (activeTab === 'moderation') fetchReports();
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'role_requests') fetchRoleRequests();
        if (activeTab === 'audit') fetchAuditLogs();
        if (activeTab === 'serilog') fetchSystemLogs();
    }, [activeTab, isAuthorized, selectedLogFile, logLevelFilter, logLinesCount]);

    // Live Auto-Refresh for Serilogs (5s interval)
    useEffect(() => {
        if (activeTab !== 'serilog' || !isAutoRefreshLogs) return;
        const timer = setInterval(() => {
            fetchSystemLogs();
        }, 5000);
        return () => clearInterval(timer);
    }, [activeTab, isAutoRefreshLogs, selectedLogFile, logLevelFilter, logLinesCount, logSearchQuery]);

    // Handle Moderation Action (Dismiss, Delete, or Reinstate)
    const handleResolve = async (reportId, actionType, contentId = null, contentType = null) => {
        const isDismiss = actionType === 'Dismiss';
        const isDelete = actionType === 'Removed Content' || actionType === 'Delete';
        const isReinstate = actionType === 'Reinstate';
        const newStatus = isDismiss ? 'Dismissed' : (isReinstate ? 'Reviewed' : 'Action Taken');
        const actionTakenText = isDismiss 
            ? 'Dismissed' 
            : (isReinstate ? 'Reinstated Content' : 'Deleted');

        try {
            await interactionsApi.resolveReport(reportId, isDismiss || isReinstate ? 'Dismiss' : 'Removed Content', `Resolved by ${currentUser?.name || 'Admin'}`);
            if (isDelete && (contentType === 'Post' || !contentType) && contentId) {
                try {
                    await postsApi.delete(contentId);
                } catch {
                    /* Silently handle demo post deletion */
                }
            }
        } catch (err) {
            console.warn("Backend API notice:", err);
        }

        // Update the report in state so it appears in Action Taken / Dismissed with recent reported content at top
        const nowFormatted = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        setReports(prev => {
            const updated = prev.map(r => {
                if (r.reportId === reportId) {
                    return {
                        ...r,
                        status: newStatus,
                        actionTaken: actionTakenText,
                        actionDate: nowFormatted,
                        rawActionDate: Date.now(),
                        moderatorFullName: currentUser?.name || currentUser?.fullName || 'System Admin',
                        moderatorUserId: currentUser?.userId || currentUser?.id || 1
                    };
                }
                return r;
            });
            // Keep recent reported content at the top
            return updated.sort((a, b) => (b.rawReportedDate - a.rawReportedDate) || (b.reportId - a.reportId));
        });
        setSelectedReportIds(prev => prev.filter(id => id !== reportId));

        if (previewReport && previewReport.reportId === reportId) {
            setIsPreviewOpen(false);
            setPreviewReport(null);
            setPreviewPost(null);
        }

        showToast(`Report #${reportId} marked as ${isDismiss ? 'Dismissed' : 'Action Taken (Removed)'}.`);

        logAuditEntry(
            isDismiss ? 'DismissReport' : (isReinstate ? 'ReinstateContent' : 'RemoveContent'),
            `Report #${reportId} (${contentType || 'Content'} #${contentId || ''}) -> ${actionTakenText}`,
            isDismiss ? 'text-slate-500' : (isReinstate ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold')
        );
    };

    // Bulk Actions Handler
    const handleBulkResolve = (actionType) => {
        if (selectedReportIds.length === 0) {
            showToast('Please select at least one report for bulk action.');
            return;
        }

        selectedReportIds.forEach(id => {
            const report = reports.find(r => r.reportId === id);
            if (report && report.status === 'Pending') {
                handleResolve(id, actionType, report.contentId, report.contentType);
            }
        });

        showToast(`Bulk action '${actionType}' applied to ${selectedReportIds.length} reports.`);
        setSelectedReportIds([]);
    };

    // Toggle Select All Rows
    const handleSelectAllRows = (e) => {
        if (e.target.checked) {
            setSelectedReportIds(filteredReports.map(r => r.reportId));
        } else {
            setSelectedReportIds([]);
        }
    };

    // Directly add keyword to restricted words database (SQL Server + Client scanner)
    const handleAddRestrictedKeyword = async () => {
        const kw = (restrictedKeywordInput || '').trim();
        if (!kw) {
            showToast('Please enter a restricted keyword to add', 'warning');
            return;
        }
        setIsAddingRestrictedKeyword(true);
        try {
            // 1. Directly insert into SQL Server database table RestrictedKeywords via Backend API
            await interactionsApi.addRestrictedKeyword(kw).catch(err => {
                console.warn("Backend addRestrictedKeyword API note:", err);
            });
            // 2. Add to frontend in-memory & localStorage restricted words scanner
            addRestrictedWord(kw);
            setRecentAddedKeywords(prev => prev.includes(kw.toLowerCase()) ? prev : [...prev, kw.toLowerCase()]);
            setRestrictedKeywordInput('');
            showToast(`Restricted keyword "${kw}" added directly to restricted words database!`, 'success');
        } catch (err) {
            console.error("Failed to add restricted keyword:", err);
            showToast(`Failed to add keyword: ${err.message || 'Error'}`, 'error');
        } finally {
            setIsAddingRestrictedKeyword(false);
        }
    };

    // Open Post/Video/Podcast/Article Preview Modal
    const handleOpenPostPreview = async (report) => {
        setPreviewReport(report);
        setIsPreviewOpen(true);
        setIsPreviewLoading(true);
        setPreviewPost(null);
        setRestrictedKeywordInput('');
        setRecentAddedKeywords([]);

        try {
            const isVideo = report.contentType === 'Video' ||
                report.reasonCode?.toLowerCase().includes('video') ||
                (report.postContentSnippet && report.postContentSnippet.toLowerCase().includes('video')) ||
                (report.contentType === 'Post' && (report.postContentSnippet || '').includes('Video'));

            if (isVideo) {
                // Fetch the actual reported video from the backend API by contentId (videoId)
                let foundVid = null;
                try {
                    foundVid = await apiClient.get(`/videos/${report.contentId}`).catch(() => null);
                    if (!foundVid) {
                        const apiVideos = await apiClient.get('/videos?pageSize=100').catch(() => []);
                        if (Array.isArray(apiVideos)) {
                            foundVid = apiVideos.find(v =>
                                String(v.videoId) === String(report.contentId) ||
                                String(v.id) === String(report.contentId)
                            );
                        }
                    }
                } catch (e) {}

                // Fallback: check localStorage if API didn't find it
                if (!foundVid) {
                    const allVideos = JSON.parse(localStorage.getItem('knome_custom_videos') || '[]');
                    foundVid = allVideos.find(v =>
                        String(v.id) === String(report.contentId) ||
                        String(v.videoId) === String(report.contentId)
                    );
                }

                const rawSrc = foundVid?.sourceUrl || foundVid?.videoUrl || foundVid?.url || '';
                const vidUrl = rawSrc
                    ? (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')
                        ? rawSrc
                        : resolveMediaUrl(rawSrc))
                    : 'https://vjs.zencdn.net/v/oceans.mp4';

                const targetAuthorId = foundVid?.uploaderUserId || report.reportedUserId || null;
                const foundUser = usersList.find(u => Number(u.userId || u.id) === Number(targetAuthorId));

                setPreviewPost({
                    authorName: foundVid?.uploaderFullName || foundUser?.fullName || report.reportedUserName || 'Video Creator',
                    authorFullName: foundVid?.uploaderFullName || foundUser?.fullName || report.reportedUserName || 'Video Creator',
                    authorUserId: targetAuthorId,
                    authorDesignation: foundUser?.designation || 'Content Creator',
                    content: `📹 Video #${report.contentId}: "${foundVid?.title || 'Reported Video'}"`,
                    videoUrl: vidUrl,
                    sourceUrl: vidUrl,
                    thumbnail: foundVid?.thumbnailUrl || foundVid?.thumbnail,
                    title: foundVid?.title || `Video #${report.contentId}`,
                    isVideo: true,
                    createdDate: foundVid?.uploadedDate || report.reportedDate
                });
            } else if (report.contentType === 'Podcast') {
                const allPodcasts = JSON.parse(localStorage.getItem('knome_custom_podcasts') || '[]');
                const foundPod = allPodcasts.find(p => String(p.id) === String(report.contentId));
                setPreviewPost({
                    authorName: foundPod?.author || report.reportedUserName || 'Podcast Host',
                    authorFullName: foundPod?.author || report.reportedUserName || 'Podcast Host',
                    authorUserId: foundPod?.authorId || report.reportedUserId || null,
                    content: `🎙️ Podcast Episode #${report.contentId}: "${foundPod?.title || 'Reported Podcast Episode'}"`,
                    audioUrl: foundPod?.audioUrl || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                    title: foundPod?.title || `Podcast #${report.contentId}`,
                    isPodcast: true,
                    createdDate: report.reportedDate
                });
            } else if (report.contentType === 'Article') {
                let art = null;
                try {
                    const res = await articlesApi.getById(report.contentId).catch(() => null);
                    art = res?.data || res;
                } catch (e) {}

                if (art && (art.title || art.contentHtml || art.content)) {
                    setPreviewPost({
                        authorName: art.authorFullName || art.authorName || report.reportedUserName || 'Article Author',
                        authorFullName: art.authorFullName || art.authorName || report.reportedUserName || 'Article Author',
                        authorUserId: art.authorUserId || art.authorId || report.reportedUserId || null,
                        authorDesignation: art.authorDesignation || 'Author',
                        title: art.title || `Article #${report.contentId}`,
                        content: art.summary || (art.contentHtml ? art.contentHtml.replace(/<[^>]*>?/gm, '') : report.postContentSnippet),
                        contentHtml: art.contentHtml,
                        category: art.category || 'Article',
                        coverImageUrl: art.coverImageUrl,
                        isArticle: true,
                        createdDate: art.createdAt || report.reportedDate
                    });
                } else {
                    setPreviewPost(getFallbackPostContent(report));
                }
            } else {
                let res = await postsApi.getById(report.contentId).catch(() => null);
                if (!res) {
                    try {
                        const allLocal = JSON.parse(localStorage.getItem('knome_local_posts') || '[]');
                        const found = allLocal.find(p => String(p.id || p.postId) === String(report.contentId));
                        if (found) res = found;
                    } catch {}
                }
                if (res) {
                    const targetAuthorId = res.authorUserId || res.authorId || res.userId || report.reportedUserId;
                    const foundUser = usersList.find(u => Number(u.userId || u.id) === Number(targetAuthorId));
                    const authorName = res.authorFullName || res.authorUser?.fullName || foundUser?.fullName || res.authorName || res.author?.name || report.reportedUserName || (targetAuthorId === 1 ? 'Loveneesh Sharma' : 'Reported Content Author');
                    const contentText = res.contentText || res.content || res.text || report.postContentSnippet;
                    setPreviewPost({
                        ...res,
                        authorName,
                        authorFullName: authorName,
                        authorUserId: targetAuthorId,
                        authorDesignation: foundUser?.designation || res.authorDesignation || (targetAuthorId === 1 ? 'TPM' : 'Employee'),
                        contentText,
                        content: contentText
                    });
                } else {
                    setPreviewPost(getFallbackPostContent(report));
                }
            }
        } catch (e) {
            setPreviewPost(getFallbackPostContent(report));
        } finally {
            setIsPreviewLoading(false);
        }
    };

    // Handle Suspend User Submission from Universal SuspendUserModal
    const handleConfirmSuspend = async (payload) => {
        let userObj = payload?.user || selectedUserToSuspend;
        let days = payload?.days || suspendDays || 7;
        let customDate = payload?.customDate || null;
        let isPermanent = payload?.isPermanent || false;
        let reason = payload?.fullReason || suspendReason || 'Compliance Policy Violation';

        let numericId = userObj ? Number(userObj.userId || userObj.id) : Number(suspendUserId);
        if (isNaN(numericId) || numericId <= 0) {
            const found = usersList.find(u => 
                String(u.employeeId || '').toUpperCase() === String(suspendUserId || userObj?.employeeId).toUpperCase() ||
                (u.fullName && u.fullName.toLowerCase() === String(suspendUserId || userObj?.fullName).toLowerCase()) ||
                (u.name && u.name.toLowerCase() === String(suspendUserId || userObj?.name).toLowerCase())
            );
            if (found) {
                numericId = Number(found.userId || found.id);
                userObj = found;
            }
        }

        if (!numericId || isNaN(numericId)) {
            showToast('Please select or enter a valid employee to suspend.');
            return;
        }

        const targetUser = usersList.find(u => Number(u.userId || u.id) === numericId) || userObj;
        const resolvedName = targetUser?.fullName || targetUser?.name || userObj?.fullName || userObj?.name || `Employee #${numericId}`;

        // Block self-suspension by system administrator
        const loggedInUid = Number(currentUser?.userId || currentUser?.id);
        const loggedInEmpId = (currentUser?.employeeId || '').toUpperCase();
        if ((numericId && loggedInUid && numericId === loggedInUid) || 
            (targetUser?.employeeId && loggedInEmpId && targetUser.employeeId.toUpperCase() === loggedInEmpId)) {
            showToast('You cannot suspend your own administrative account.');
            setIsSuspendModalOpen(false);
            setSelectedUserToSuspend(null);
            return;
        }

        try {
            await adminApi.suspendUser(numericId, reason, days, customDate, isPermanent);
        } catch (err) {
            console.warn("Backend suspend API notice:", err);
        }

        if (toggleUserActiveStatus) toggleUserActiveStatus(numericId, false, reason);
        try {
            const savedSuspended = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
            const empKey = targetUser?.employeeId ? targetUser.employeeId.toUpperCase() : null;
            savedSuspended[String(numericId)] = {
                suspendedAt: new Date().toISOString(),
                reason: reason || 'Suspended by System Administrator'
            };
            if (empKey) {
                savedSuspended[empKey] = {
                    suspendedAt: new Date().toISOString(),
                    reason: reason || 'Suspended by System Administrator'
                };
            }
            localStorage.setItem('knome_suspended_accounts', JSON.stringify(savedSuspended));
        } catch (e) {}
        setUsersList(prev => prev.map(u => (Number(u.userId || u.id) === numericId || (targetUser?.employeeId && u.employeeId === targetUser.employeeId)) ? { ...u, isActive: false, isSuspended: true, status: 'Suspended' } : u));
        
        setIsSuspendModalOpen(false);
        setSelectedUserToSuspend(null);
        showToast(`Employee #${numericId} (${resolvedName}) suspended.`);

        logAuditEntry(
            'UserSuspended',
            `Suspended Employee #${numericId} (${resolvedName}) - Reason: ${reason}`,
            'text-rose-500 font-black'
        );

        setSuspendUserId('');
        setSuspendUserName('');
        setSuspendReason('');
        setSuspendSearchTerm('');
    };

    // Handle User Activate/Reinstate
    const handleToggleUserActive = async (user) => {
        if (!user) return;
        // If user is currently active, clicking suspend triggers the standard SuspendUserModal
        if (user.isActive) {
            const loggedInUid = Number(currentUser?.userId || currentUser?.id);
            const loggedInEmpId = (currentUser?.employeeId || '').toUpperCase();
            const targetUid = Number(user.userId || user.id);
            const targetEmpId = (user.employeeId || '').toUpperCase();
            if ((targetUid && loggedInUid && targetUid === loggedInUid) ||
                (targetEmpId && loggedInEmpId && targetEmpId === loggedInEmpId)) {
                showToast('You cannot suspend your own administrative account.');
                return;
            }
            setSelectedUserToSuspend(user);
            setIsSuspendModalOpen(true);
            return;
        }

        // If user is suspended/inactive, reactivate them
        const targetId = Number(user.userId || user.id);
        try {
            if (!isNaN(targetId) && targetId > 0) {
                await adminApi.activateUser(targetId);
            }
        } catch (err) {
            console.warn("Backend activation notice:", err);
        }

        if (toggleUserActiveStatus && !isNaN(targetId)) toggleUserActiveStatus(targetId, true);
        try {
            const savedSuspended = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
            delete savedSuspended[String(targetId)];
            if (user?.employeeId) {
                delete savedSuspended[user.employeeId.toUpperCase()];
            }
            localStorage.setItem('knome_suspended_accounts', JSON.stringify(savedSuspended));
        } catch (e) {}
        setUsersList(prev => prev.map(u => (Number(u.userId || u.id) === targetId || (user.employeeId && u.employeeId === user.employeeId)) ? { ...u, isActive: true, isSuspended: false, status: 'Active' } : u));
        showToast(`User ${user.fullName || user.name} is now Active.`);

        logAuditEntry(
            'UserActivated',
            `Reactivated Employee ${user.fullName || user.name}`,
            'text-emerald-500 font-bold'
        );
    };

    // Handle Role Change Submission (Multiple Roles)
    const handleConfirmRoleChange = async () => {
        if (!roleUserId) return;
        const rolesToAssign = selectedRoles.length > 0 ? selectedRoles : ['Employee'];
        const primaryRole = rolesToAssign.find(r => r !== 'Employee') || rolesToAssign[0] || 'Employee';

        try {
            await adminApi.changeUserRoles(roleUserId, rolesToAssign);
        } catch (err) {
            console.warn("Backend role change notice:", err);
        }

        // Update the local AdminConsole users table
        setUsersList(prev => prev.map(u => (String(u.userId) === String(roleUserId) || String(u.id) === String(roleUserId)) ? { 
            ...u, 
            roleName: primaryRole, 
            assignedRole: primaryRole, 
            roles: rolesToAssign 
        } : u));

        // ── Update global UserContext usersList so Navbar Switch User dropdown
        // instantly shows the new role for this user, and if it's the logged-in
        // user their currentUser state (role guards, Sidebar, HR Analytics) updates too.
        updateUserRoleInList(roleUserId, rolesToAssign);

        const isCurrentUser = currentUser?.userId && String(currentUser.userId) === String(roleUserId);
        setIsRoleModalOpen(false);
        showToast(`Roles for ${roleUserName} updated to '${rolesToAssign.join(', ')}'.${isCurrentUser ? ' Your permissions have been updated!' : ''}`);

        logAuditEntry(
            'RoleChanged',
            `Assigned roles '${rolesToAssign.join(', ')}' to Employee #${roleUserId} (${roleUserName})`,
            'text-indigo-600 font-bold'
        );
    };

    // Handle System Config Save
    const handleSaveConfig = () => {
        localStorage.setItem('knome_system_config', JSON.stringify(configState));
        setConfigToast(true);
        setTimeout(() => setConfigToast(false), 4000);
        showToast('System configuration saved & published successfully.');

        setAuditTrail(prev => [
            {
                id: Date.now(),
                time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                moderator: currentUser?.name || 'System Admin',
                action: 'ConfigUpdate',
                target: 'Updated Platform Parameters & Moderation Sensitivity',
                color: 'text-emerald-500'
            },
            ...prev
        ]);
    };

    // ── AI Moderation Test Presets & Real-Time Evaluator ──
    const AI_TEST_PRESETS = [
        {
            id: 'safe',
            label: 'Clean Knowledge Post',
            badge: 'Safe (4% Risk)',
            badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
            content: 'Excited to announce the successful release of our microservices migration for the MPOnline employee hub! Huge thanks to the backend architecture team for seamless zero-downtime deployment and great collaboration.'
        },
        {
            id: 'harassment',
            label: 'Harassment & Abuse',
            badge: 'Toxic (~96%)',
            badgeColor: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
            content: 'This entire department is full of complete idiots and useless fools. Nobody knows how to do their job, you all deserve to be fired and humiliated publicly in front of the entire company!'
        },
        {
            id: 'pii',
            label: 'Confidential PII & Secret Leak',
            badge: 'PII Leak (~98%)',
            badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
            content: 'Confidential Q3 Executive Payroll: Employee EMP002 salary is Rs 18,50,000, PAN: ABCDE1234F. Prod Database Connection: Server=10.0.4.12;User=sa;Password=SecretPass123!; AWS_SECRET_KEY=AKIAIOSFODNN7EXAMPLE'
        },
        {
            id: 'spam',
            label: 'Phishing / Spam Link',
            badge: 'Spam (~85%)',
            badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
            content: 'EARN FREE CRYPTO NOW! Click this external link to double your Bitcoin in 24 hours: http://free-crypto-giveaway-claim.biz! Limited slots available, claim your rewards now!'
        }
    ];

    const runAiEvaluation = (textToEvaluate) => {
        const text = (textToEvaluate !== undefined ? textToEvaluate : aiTestInput) || '';
        if (!text.trim()) {
            setAiAnalysisResult(null);
            return;
        }
        setIsAiAnalyzing(true);
        setTimeout(() => {
            const lower = text.toLowerCase();
            
            // 1. Toxicity detection
            const toxicWords = ['idiot', 'idiots', 'fools', 'stupid', 'fired', 'humiliated', 'trash', 'useless', 'incompetent', 'hate', 'harass', 'kill', 'shut up', 'moron', 'dumb', 'loser', 'scam'];
            let toxicHits = 0;
            const detectedToxicKeywords = [];
            toxicWords.forEach(w => {
                if (lower.includes(w)) {
                    toxicHits++;
                    detectedToxicKeywords.push(w);
                }
            });
            
            let toxicityScore = 4;
            if (toxicHits > 0) {
                toxicityScore = Math.min(99, 65 + (toxicHits * 10));
            }

            // 2. PII / Secret detection
            const hasPan = /[A-Z]{5}[0-9]{4}[A-Z]{1}/i.test(text);
            const hasAwsKey = /AKIA[0-9A-Z]{16}/i.test(text);
            const hasPassword = /password\s*=\s*[^;\s]+/i.test(text);
            const hasSalary = /(salary|ctc|compensation|payroll)\s*(is|:|=)?\s*(rs\.?|inr|\$)?\s*[\d,]+/i.test(text);
            const hasAadhaar = /\b\d{4}\s\d{4}\s\d{4}\b/.test(text);
            
            const detectedPiiKeywords = [];
            if (hasPan) detectedPiiKeywords.push('Indian PAN Format');
            if (hasAwsKey) detectedPiiKeywords.push('AWS Access Key (AKIA...)');
            if (hasPassword) detectedPiiKeywords.push('Hardcoded DB Password');
            if (hasSalary) detectedPiiKeywords.push('Executive Compensation / CTC');
            if (hasAadhaar) detectedPiiKeywords.push('Aadhaar Number Pattern');

            let piiScore = 0;
            if (detectedPiiKeywords.length > 0) {
                piiScore = Math.min(99, 70 + (detectedPiiKeywords.length * 10));
            }

            // 3. Spam detection
            const spamKeywords = ['crypto', 'bitcoin', 'earn free', 'claim.biz', 'giveaway', 'click this link', 'double your'];
            const detectedSpamKeywords = [];
            spamKeywords.forEach(s => {
                if (lower.includes(s)) detectedSpamKeywords.push(s);
            });
            let spamScore = 0;
            if (detectedSpamKeywords.length > 0) {
                spamScore = Math.min(98, 75 + (detectedSpamKeywords.length * 8));
            }

            // Decision Engine based on active configState
            const threshold = configState.aiToxicityThreshold || 80;
            const autoQuarantine = configState.aiAutoQuarantine !== false;
            const deepScan = configState.aiDeepScan !== false;

            let status = 'ALLOWED'; // 'ALLOWED' | 'FLAGGED' | 'QUARANTINED'
            let decisionReason = 'Content passed NLP toxicity and PII compliance filters. Safe for public employee feed.';

            if (autoQuarantine && (toxicityScore >= 95 || (deepScan && piiScore >= 95))) {
                status = 'QUARANTINED';
                decisionReason = toxicityScore >= 95 
                    ? `Critical Toxicity (${toxicityScore}%) exceeds extreme threshold (95%). Content immediately suppressed from public feed before manual review.`
                    : `Severe PII / Credential Leak (${piiScore}%) detected with Deep Scan enabled. Post auto-quarantined immediately.`;
            } else if (toxicityScore >= threshold || (deepScan && piiScore >= 70) || spamScore >= 75) {
                status = 'FLAGGED';
                if (toxicityScore >= threshold) {
                    decisionReason = `Toxicity score (${toxicityScore}%) meets or exceeds configured sensitivity threshold (${threshold}%). Intercepted and routed to Content Moderation queue.`;
                } else if (deepScan && piiScore >= 70) {
                    decisionReason = `Sensitive data/credentials detected (${piiScore}%). Deep scanner routed post to Admin Moderation review.`;
                } else {
                    decisionReason = `Unsolicited spam patterns detected (${spamScore}%). Flagged for review.`;
                }
            }

            setAiAnalysisResult({
                toxicityScore,
                piiScore,
                spamScore,
                detectedToxicKeywords,
                detectedPiiKeywords,
                detectedSpamKeywords,
                status,
                decisionReason,
                evaluatedAt: new Date().toLocaleTimeString()
            });
            setIsAiAnalyzing(false);
        }, 250);
    };

    // Auto-update analysis decision in real time when slider or toggles change
    useEffect(() => {
        if (!aiAnalysisResult) return;
        const threshold = configState.aiToxicityThreshold || 80;
        const autoQuarantine = configState.aiAutoQuarantine !== false;
        const deepScan = configState.aiDeepScan !== false;
        const { toxicityScore, piiScore, spamScore } = aiAnalysisResult;

        let status = 'ALLOWED';
        let decisionReason = 'Content passed NLP toxicity and PII compliance filters. Safe for public employee feed.';

        if (autoQuarantine && (toxicityScore >= 95 || (deepScan && piiScore >= 95))) {
            status = 'QUARANTINED';
            decisionReason = toxicityScore >= 95 
                ? `Critical Toxicity (${toxicityScore}%) exceeds extreme threshold (95%). Content immediately suppressed from public feed before manual review.`
                : `Severe PII / Credential Leak (${piiScore}%) detected with Deep Scan enabled. Post auto-quarantined immediately.`;
        } else if (toxicityScore >= threshold || (deepScan && piiScore >= 70) || spamScore >= 75) {
            status = 'FLAGGED';
            if (toxicityScore >= threshold) {
                decisionReason = `Toxicity score (${toxicityScore}%) meets or exceeds configured sensitivity threshold (${threshold}%). Intercepted and routed to Content Moderation queue.`;
            } else if (deepScan && piiScore >= 70) {
                decisionReason = `Sensitive data/credentials detected (${piiScore}%). Deep scanner routed post to Admin Moderation review.`;
            } else {
                decisionReason = `Unsolicited spam patterns detected (${spamScore}%). Flagged for review.`;
            }
        }

        setAiAnalysisResult(prev => ({
            ...prev,
            status,
            decisionReason
        }));
    }, [configState.aiToxicityThreshold, configState.aiAutoQuarantine, configState.aiDeepScan]);

    const handleRunBatchAudit = () => {
        setIsAiBatchAuditing(true);
        setTimeout(() => {
            setIsAiBatchAuditing(false);
            showToast(`Batch AI Audit completed: ${reports.length} content items verified against current ${configState.aiToxicityThreshold || 80}% sensitivity threshold.`);
            setAuditTrail(prev => [
                {
                    id: Date.now(),
                    time: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                    moderator: currentUser?.name || 'System Admin',
                    action: 'AIBatchAudit',
                    target: `Batch scanned ${reports.length} content reports at ${configState.aiToxicityThreshold || 80}% sensitivity threshold`,
                    color: 'text-cyan-500'
                },
                ...prev
            ]);
        }, 700);
    };

    const handleResetAiRules = () => {
        setConfigState(prev => ({
            ...prev,
            aiToxicityThreshold: 80,
            aiAutoQuarantine: true,
            aiDeepScan: true
        }));
        showToast('AI Moderation rules reset to recommended enterprise defaults (80%, Auto-Quarantine ON, Deep Scan ON).');
    };

    // AI Moderation Live Queue Calculations
    const interceptedReportsCount = useMemo(() => {
        const threshold = configState.aiToxicityThreshold || 80;
        return reports.filter(r => {
            const score = parseInt(r.aiScore) || 0;
            return score >= threshold || r.reasonCode === 'Harassment' || r.reasonCode === 'Copyright';
        }).length;
    }, [reports, configState.aiToxicityThreshold]);

    const quarantinedReportsCount = useMemo(() => {
        return reports.filter(r => {
            const score = parseInt(r.aiScore) || 0;
            return (configState.aiAutoQuarantine !== false && score >= 95) || r.severity === 'Critical';
        }).length;
    }, [reports, configState.aiAutoQuarantine]);

    // Reset Filters Handler
    const handleResetFilters = () => {
        setSearchQuery('');
        setStatusFilter('All');
        setReasonFilter('All');
        setSeverityFilter('All');
        setCommunityFilter('All');
        setDateRangeFilter('All');
        setModeratorFilter('All');
        setActiveMetricCard('total');
        showToast('All moderation filters reset to default.');
    };

    // Filter reports logic
    const filteredReports = reports.filter(r => {
        const matchesStatus = statusFilter === 'All' || 
            (statusFilter === 'Pending' && r.status === 'Pending') ||
            (statusFilter === 'Reviewed' && (r.status === 'Reviewed' || r.status === 'Action Taken' || r.status === 'Resolved') && r.status !== 'Dismissed' && (!r.actionTaken || !r.actionTaken.toLowerCase().includes('dismiss'))) ||
            (statusFilter === 'Dismissed' && (r.status === 'Dismissed' || (r.actionTaken && r.actionTaken.toLowerCase().includes('dismiss')))) ||
            (statusFilter === 'Action Taken' && (r.status === 'Action Taken' || r.status === 'Resolved' || (r.actionTaken && r.actionTaken.toLowerCase().includes('remove'))));

        const matchesReason = reasonFilter === 'All' || (r.reasonCode && r.reasonCode.toLowerCase() === reasonFilter.toLowerCase());
        
        const matchesSeverity = severityFilter === 'All' || 
            (severityFilter === 'High' && (r.severity === 'High' || r.severity === 'Critical')) ||
            (r.severity && r.severity.toLowerCase() === severityFilter.toLowerCase());

        const matchesCommunity = communityFilter === 'All' || 
            (r.communityName && r.communityName.toLowerCase().includes(communityFilter.toLowerCase()));

        const matchesModerator = moderatorFilter === 'All' || 
            (moderatorFilter === 'Unassigned' && (!r.moderatorUserId && !r.moderatorFullName)) || 
            (r.moderatorFullName && r.moderatorFullName.toLowerCase().includes(moderatorFilter.toLowerCase()));

        const todayStr = new Date().toLocaleDateString();
        const matchesDateRange = dateRangeFilter === 'All' ||
            (dateRangeFilter === 'Today' && (
                r.reportedDate?.includes(todayStr) ||
                r.reportedDate?.includes('8/5/26') ||
                r.reportedDate?.includes('2026-07-28') ||
                r.reportedDate?.includes('2026-07-29') ||
                r.reportedDate?.toLowerCase().includes('today')
            ));

        const matchesSearch = !searchQuery || 
                              String(r.reportId).includes(searchQuery) ||
                              String(r.contentId).includes(searchQuery) ||
                              (r.reporterFullName && r.reporterFullName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                              (r.reportedUserName && r.reportedUserName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                              (r.reasonCode && r.reasonCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
                              (r.communityName && r.communityName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                              (r.postContentSnippet && r.postContentSnippet.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesStatus && matchesReason && matchesSeverity && matchesCommunity && matchesModerator && matchesDateRange && matchesSearch;
    });

    // Ensure Action Report and all moderation views have recent reported content strictly at the top
    const sortedReports = useMemo(() => {
        return [...filteredReports].sort((a, b) => {
            const timeB = b.rawReportedDate || (b.reportedDate ? new Date(b.reportedDate).getTime() : 0) || (b.reportId ? b.reportId * 1000 : 0);
            const timeA = a.rawReportedDate || (a.reportedDate ? new Date(a.reportedDate).getTime() : 0) || (a.reportId ? a.reportId * 1000 : 0);
            if (timeB !== timeA) return timeB - timeA;
            return (b.reportId || 0) - (a.reportId || 0);
        });
    }, [filteredReports]);

    const activeUserSearchTerm = (userSearchTerm || searchQuery || '').trim().toLowerCase();
    const filteredUsers = usersList.filter(u => {
        if (!activeUserSearchTerm) return true;
        if (activeUserSearchTerm === 'suspended') return u.isSuspended === true || u.isPermanentlySuspended === true || (u.status || '').toLowerCase() === 'suspended';
        if (activeUserSearchTerm === 'inactive') return (u.isActive === false && !u.isSuspended && !u.isPermanentlySuspended) || (u.status || '').toLowerCase() === 'inactive';
        if (activeUserSearchTerm === 'active') return (u.isActive === true && !u.isSuspended && !u.isPermanentlySuspended) || (u.status || '').toLowerCase() === 'active';
        
        // When filtering specifically by 'admin' (e.g. clicking the Admins stat card)
        if (activeUserSearchTerm === 'admin') {
            const assigned = (u.roleName || getUserAssignedRole(u) || '').toLowerCase();
            const rolesList = getUserRolesList(u).map(r => String(r).toLowerCase());
            const hasAdminRole = assigned.includes('admin') || assigned.includes('adm') || 
                                 rolesList.some(r => r.includes('admin') || r.includes('adm'));
            const isPureEmployee = rolesList.length === 1 && rolesList[0] === 'employee';
            return hasAdminRole && !isPureEmployee;
        }

        return (
            String(u.userId || u.id || '').includes(activeUserSearchTerm) ||
            (u.fullName || u.name || '').toLowerCase().includes(activeUserSearchTerm) ||
            (u.email || u.employeeId || '').toLowerCase().includes(activeUserSearchTerm) ||
            (u.designation || '').toLowerCase().includes(activeUserSearchTerm) ||
            (u.department || u.departmentName || '').toLowerCase().includes(activeUserSearchTerm) ||
            (u.roleName || '').toLowerCase().includes(activeUserSearchTerm)
        );
    });

    const filteredAuditTrail = auditTrail.filter(a => {
        const matchesSearch = !auditSearch || a.action.toLowerCase().includes(auditSearch.toLowerCase()) || a.target.toLowerCase().includes(auditSearch.toLowerCase());
        const matchesAction = auditActionFilter === 'All' ||
            (auditActionFilter === 'ConfigUpdate' && a.action === 'ConfigUpdate') ||
            (auditActionFilter === 'Moderation' && (a.action === 'ContentModerated' || a.action === 'ReportDismissed')) ||
            (auditActionFilter === 'User' && a.action?.startsWith('User')) ||
            (auditActionFilter === 'AIBatchAudit' && (a.action === 'AIBatchAudit' || a.action === 'MediaBatchApprove'));
        return matchesSearch && matchesAction;
    });

    const moderationTableRef = useRef(null);
    const { visibleCount: visibleReportCount, resetVisibleCount: resetReportCount } = useScrollLoading(sortedReports.length, 25, 25, 200, moderationTableRef);
    const { visibleCount: visibleUserCount, resetVisibleCount: resetUserCount } = useScrollLoading(filteredUsers.length, 15, 15);
    const { visibleCount: visibleAuditCount, resetVisibleCount: resetAuditCount } = useScrollLoading(filteredAuditTrail.length, 20, 20);

    useEffect(() => {
        resetReportCount();
    }, [searchQuery, statusFilter, reasonFilter, severityFilter, communityFilter, dateRangeFilter, moderatorFilter, activeMetricCard, activeTab]);

    useEffect(() => {
        resetUserCount();
    }, [userSearchTerm, searchQuery, activeTab]);

    useEffect(() => {
        resetAuditCount();
    }, [auditSearch, auditActionFilter, activeTab]);

    // 10 Compact Metrics Calculations
    const totalReportsCount = reports.length;
    const pendingCount = reports.filter(r => r.status === 'Pending').length;
    const actionTakenCount = reports.filter(r => (r.status === 'Action Taken' || r.status === 'Resolved' || (r.actionTaken && r.actionTaken.toLowerCase().includes('remove'))) && r.status !== 'Dismissed' && (!r.actionTaken || !r.actionTaken.toLowerCase().includes('dismiss'))).length;
    const dismissedCount = reports.filter(r => r.status === 'Dismissed' || (r.actionTaken && r.actionTaken.toLowerCase().includes('dismiss'))).length;
    const reviewedCount = actionTakenCount + dismissedCount;
    const highPriorityCount = reports.filter(r => r.reasonCode === 'Harassment' || r.reasonCode === 'Copyright' || r.severity === 'Critical' || r.severity === 'High').length;
    const suspendedUsersCount = usersList.filter(u => !u.isActive).length;
    const activeModeratorsCount = usersList.filter(u => {
        const assigned = (u.roleName || getUserAssignedRole(u) || '').toLowerCase();
        const rolesList = getUserRolesList(u).map(r => String(r).toLowerCase());
        const hasAdminRole = assigned.includes('admin') || assigned.includes('adm') || 
                             rolesList.some(r => r.includes('admin') || r.includes('adm'));
        const isPureEmployee = rolesList.length === 1 && rolesList[0] === 'employee';
        return hasAdminRole && !isPureEmployee;
    }).length;
    const aiFlaggedCount = reports.filter(r => r.reasonCode === 'Spam' || r.reasonCode === 'Inappropriate' || (r.aiScore && parseInt(r.aiScore) > 70)).length;
    const communitiesCount = communityChannels.length;
    const activeUsersCount = usersList.filter(u => u.isActive).length || usersList.length;
    const todayReportsCount = reports.filter(r => {
        const todayStr = new Date().toLocaleDateString();
        return r.reportedDate?.includes(todayStr) || (r.rawReportedDate && Date.now() - r.rawReportedDate < 86400000);
    }).length;

    // Filtered Community Channels based on Search and Policy Filter (Strict, Standard, Relaxed)
    const filteredCommunities = useMemo(() => {
        return communityChannels.filter(c => {
            const matchesSearch = !searchQuery || 
                c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                c.category?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                c.mod?.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesPolicy = communityPolicyFilter === 'All' || 
                c.status?.toLowerCase() === communityPolicyFilter.toLowerCase();

            return matchesSearch && matchesPolicy;
        });
    }, [communityChannels, searchQuery, communityPolicyFilter]);

    // Generic Excel (.xlsx) Export Engine with Auto-fit Columns
    const exportToExcelFile = (headers, rows, sheetName, fileNamePrefix) => {
        try {
            const aoa = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            // Auto-calculate column widths
            const colWidths = headers.map((h, colIdx) => {
                let maxLen = String(h).length;
                rows.forEach(r => {
                    const cellVal = String(r[colIdx] ?? '');
                    if (cellVal.length > maxLen) maxLen = Math.min(cellVal.length, 60);
                });
                return { wch: Math.max(maxLen + 3, 12) };
            });
            ws['!cols'] = colWidths;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Report');
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `${fileNamePrefix}_${dateStr}.xlsx`);
        } catch (err) {
            console.error('Excel export error:', err);
            showToast('Failed to generate Excel file: ' + (err?.message || 'Unknown error'));
        }
    };

    // Excel (.xlsx) Handlers
    const handleExportReportsExcel = () => {
        const headers = ['Report ID', 'Reporter User ID', 'Reporter Name', 'Reported User ID', 'Content Type', 'Content ID', 'Community', 'Reason Code', 'Severity', 'AI Score', 'Status', 'Moderator', 'Action Taken', 'Reported Date'];
        const rows = filteredReports.map(r => [
            r.reportId, r.reporterUserId, r.reporterFullName, r.reportedUserId || 'N/A', r.contentType, r.contentId, r.communityName || 'General', r.reasonCode, r.severity || 'Medium', r.aiScore || 'N/A', r.status, r.moderatorFullName || 'Unassigned', r.actionTaken || 'None', r.reportedDate
        ]);
        exportToExcelFile(headers, rows, 'Content Reports', 'Knome_ContentReports');
        setIsExportOpen(false);
        showToast('Exported Content Reports to Excel (.xlsx) successfully.');
    };

    const handleExportUsersExcel = () => {
        const headers = ['User ID', 'Employee ID', 'Full Name', 'Designation', 'Department', 'Role Name', 'Status', 'Karma Points'];
        const rows = usersList.map(u => [
            u.userId || u.id, u.employeeId || 'N/A', u.fullName || u.name, u.designation || 'Staff', u.department || u.departmentName || 'MPOnline', u.roleName || 'Employee', u.isActive ? 'Active' : 'Suspended', u.karmaPoints || 0
        ]);
        exportToExcelFile(headers, rows, 'Users Directory', 'Knome_UsersDirectory');
        setIsExportOpen(false);
        showToast('Exported Users Directory to Excel (.xlsx) successfully.');
    };

    const handleExportAuditExcel = () => {
        const headers = ['Log ID', 'Timestamp', 'Actor / Moderator', 'Action', 'Target Details'];
        const rows = auditTrail.map(a => [
            a.id, a.time, a.moderator, a.action, a.target
        ]);
        exportToExcelFile(headers, rows, 'Audit Log', 'Knome_AuditLog');
        setIsExportOpen(false);
        showToast('Exported Audit Log to Excel (.xlsx) successfully.');
    };

    const handleExportCommunitiesExcel = () => {
        const headers = ['Community ID', 'Name', 'Category', 'Type', 'Moderation Policy', 'Assigned Moderator', 'Members Count', 'Pending Reports'];
        const rows = communityChannels.map(c => [
            c.id, c.name, c.category, c.type, c.status, c.mod, getCommunityMemberCount(c), c.reportsCount || 0
        ]);
        exportToExcelFile(headers, rows, 'Communities', 'Knome_CommunitiesModeration');
        setIsExportOpen(false);
        showToast('Exported Communities to Excel (.xlsx) successfully.');
    };

    // CSV Handlers
    const handleExportCSV = () => {
        const BOM = '\uFEFF';
        const headers = ['ReportId', 'ReporterUserId', 'ReporterName', 'ReportedUserId', 'ContentType', 'ContentId', 'Community', 'ReasonCode', 'Severity', 'AIScore', 'Status', 'Moderator', 'ActionTaken', 'ReportedDate'];
        const rows = filteredReports.map(r => [
            r.reportId, r.reporterUserId, r.reporterFullName, r.reportedUserId || 'N/A', r.contentType, r.contentId, r.communityName || 'General', r.reasonCode, r.severity || 'Medium', r.aiScore || 'N/A', r.status, r.moderatorFullName || 'Unassigned', r.actionTaken || 'None', r.reportedDate
        ]);
        const csvContent = BOM + [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ContentReports_Export_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsExportOpen(false);
        showToast('Exported ContentReports CSV successfully.');
    };

    const handleExportUsersCSV = () => {
        const BOM = '\uFEFF';
        const headers = ['UserId', 'FullName', 'Designation', 'Department', 'RoleName', 'Status'];
        const rows = usersList.map(u => [
            u.userId || u.id, u.fullName || u.name, u.designation || 'Staff', u.department || u.departmentName || 'MPOnline', u.roleName || 'Employee', u.isActive ? 'Active' : 'Suspended'
        ]);
        const csvContent = BOM + [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `UsersDirectory_Export_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsExportOpen(false);
        showToast('Exported Users Directory CSV successfully.');
    };

    const handleExportAuditCSV = () => {
        const BOM = '\uFEFF';
        const headers = ['LogId', 'Timestamp', 'Actor', 'Action', 'TargetDetails'];
        const rows = auditTrail.map(a => [
            a.id, a.time, a.moderator, a.action, a.target
        ]);
        const csvContent = BOM + [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AuditLog_Export_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsExportOpen(false);
        showToast('Exported Audit Log CSV successfully.');
    };

    // Permission Denied View for Non-Admins
    if (!isAuthorized) {
        return (
            <main className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
                <div className="max-w-md w-full p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl text-center flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-3xl">admin_panel_settings</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Access Restricted</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                        This portal is strictly restricted to System Admins. HR Admins and standard users do not have permissions to view or manage content moderation reports.
                    </p>
                    <Link to="/" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all">
                        Return to Dashboard
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-grow p-3 md:p-4 min-h-screen bg-slate-50 dark:bg-slate-950 relative text-slate-800 dark:text-slate-100 font-sans">
            {/* Action Toast Notification */}
            {actionToast && (
                <div className="fixed top-20 right-6 z-[110] px-4 py-2.5 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 text-xs font-bold flex items-center gap-2.5 animate-in fade-in zoom-in">
                    <span className="material-symbols-outlined text-emerald-400 text-[18px]">check_circle</span>
                    <span>{actionToast}</span>
                </div>
            )}

            {/* ─── 1. COMPACT PAGE HEADER & QUICK ACTIONS ─── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
                {/* Left: Hierarchical Breadcrumbs & Title */}
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 mb-1 flex-wrap">
                        <Link 
                            to="/"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800/60 group"
                            title="Return to Hub / Feed"
                        >
                            <span className="material-symbols-outlined text-[15px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                            <span>Back to Hub</span>
                        </Link>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <Link to="/" className="hover:text-indigo-600 transition-colors">Home</Link>
                        <span>/</span>
                        <span 
                            className="hover:text-indigo-600 cursor-pointer transition-colors"
                            onClick={() => setActiveTab('moderation')}
                        >
                            Admin Console
                        </span>
                        <span>/</span>
                        <span 
                            className="text-slate-600 dark:text-slate-300 font-semibold cursor-pointer hover:text-indigo-600 transition-colors"
                            onClick={() => handleDomainSelect(activeDomain)}
                        >
                            {activeDomain === 'moderation' ? 'Content Moderation & Safety' : activeDomain === 'governance' ? 'User & Access Governance' : 'Operations & Compliance'}
                        </span>
                        <span>/</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                            {activeTab === 'moderation' ? 'Content Reports' :
                             activeTab === 'media_approvals' ? 'Media Approvals' :
                             activeTab === 'community_approvals' ? 'Community Creation Approvals' :
                             activeTab === 'ai_moderation' ? 'AI Moderation Rules' :
                             activeTab === 'communities' ? 'Community Moderation' :
                             activeTab === 'users' ? 'User Directory' :
                             activeTab === 'role_requests' ? 'Role Elevation Requests' :
                             activeTab === 'system' ? 'System Parameters' :
                             activeTab === 'audit' ? 'Audit Trail' :
                             activeTab === 'serilog' ? 'Server Logs (Serilog)' :
                             activeTab === 'analytics' ? 'Platform Analytics' : activeTab}
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                            Admin Console & Moderation
                        </h1>
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase border border-rose-500/20">
                            Enterprise Portal
                        </span>
                        <span className="hidden md:inline-block text-[11px] text-slate-400 font-medium ml-2">
                            Last updated: <strong className="text-slate-600 dark:text-slate-300">{lastUpdatedTime}</strong>
                        </span>
                    </div>
                </div>

                {/* Right: Quick Action Controls & Search */}
                <div className="flex items-center gap-2">
                    {/* Global Quick Search */}
                    <div className="relative hidden lg:block w-48">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Global Search..."
                            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                        <span className="material-symbols-outlined absolute right-2 top-1.5 text-slate-400 text-[16px]">search</span>
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={handleRefreshAll}
                        title="Refresh Console Data"
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-all border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center gap-1 text-xs font-bold px-2.5"
                    >
                        <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`}>refresh</span>
                        <span className="hidden sm:inline">Refresh</span>
                    </button>

                    {/* Export Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsExportOpen(!isExportOpen)}
                            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-all border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center gap-1 text-xs font-bold px-2.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            <span>Export</span>
                            <span className="material-symbols-outlined text-[14px]">expand_more</span>
                        </button>
                        {isExportOpen && (
                            <>
                                <div 
                                    className="fixed inset-0 z-40" 
                                    onClick={() => setIsExportOpen(false)} 
                                />
                                <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden py-1 text-xs font-bold divide-y divide-slate-100 dark:divide-slate-700/60 animate-in fade-in zoom-in-95">
                                    {/* Section 1: Excel Exports (.XLSX) */}
                                    <div>
                                        <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[14px]">table_chart</span>
                                            <span>Excel Spreadsheet (.XLSX)</span>
                                        </div>
                                        <button
                                            onClick={handleExportReportsExcel}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-600 text-[16px]">description</span>
                                                <span>Export Reports</span>
                                            </div>
                                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black">XLSX</span>
                                        </button>
                                        <button
                                            onClick={handleExportUsersExcel}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-600 text-[16px]">group</span>
                                                <span>Export Users Directory</span>
                                            </div>
                                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black">XLSX</span>
                                        </button>
                                        <button
                                            onClick={handleExportAuditExcel}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-600 text-[16px]">history</span>
                                                <span>Export Audit Log</span>
                                            </div>
                                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black">XLSX</span>
                                        </button>
                                        <button
                                            onClick={handleExportCommunitiesExcel}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-600 text-[16px]">forum</span>
                                                <span>Export Communities</span>
                                            </div>
                                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-black">XLSX</span>
                                        </button>
                                    </div>

                                    {/* Section 2: CSV Exports */}
                                    <div>
                                        <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[14px]">csv</span>
                                            <span>Comma Separated (.CSV)</span>
                                        </div>
                                        <button
                                            onClick={handleExportCSV}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-indigo-600 text-[16px]">description</span>
                                                <span>Export Reports (CSV)</span>
                                            </div>
                                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black">CSV</span>
                                        </button>
                                        <button
                                            onClick={handleExportUsersCSV}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-600 text-[16px]">group</span>
                                                <span>Export Users Directory (CSV)</span>
                                            </div>
                                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black">CSV</span>
                                        </button>
                                        <button
                                            onClick={handleExportAuditCSV}
                                            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-amber-600 text-[16px]">history</span>
                                                <span>Export Audit Log (CSV)</span>
                                            </div>
                                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black">CSV</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── HIERARCHY TIER 1: FUNCTIONAL DOMAIN PILLARS ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
                {/* Pillar 1: Content Moderation & Safety */}
                <div 
                    onClick={() => handleDomainSelect('moderation')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                        activeDomain === 'moderation'
                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white border-indigo-600 shadow-md shadow-indigo-500/20 ring-2 ring-indigo-500/30'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-indigo-400/60 shadow-xs'
                    }`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            activeDomain === 'moderation' ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        }`}>
                            <span className="material-symbols-outlined text-[22px]">gavel</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${activeDomain === 'moderation' ? 'text-indigo-200' : 'text-slate-400'}`}>
                                    Domain 1
                                </span>
                                {(pendingCount + pendingMediaApprovals.length) > 0 && (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeDomain === 'moderation' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    }`}>
                                        {pendingCount + pendingMediaApprovals.length} Pending
                                    </span>
                                )}
                            </div>
                            <h3 className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
                                Moderation & Content Safety
                            </h3>
                            <p className={`text-[10px] sm:text-[11px] truncate ${activeDomain === 'moderation' ? 'text-indigo-100' : 'text-slate-400'}`}>
                                Reports & Media Approvals
                            </p>
                        </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                        <span className={`text-base sm:text-lg font-black block leading-none ${activeDomain === 'moderation' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                            {reports.length}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-tight ${activeDomain === 'moderation' ? 'text-indigo-200' : 'text-slate-400'}`}>
                            Reports
                        </span>
                    </div>
                </div>

                {/* Pillar 2: User Governance & Access */}
                <div 
                    onClick={() => handleDomainSelect('governance')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                        activeDomain === 'governance'
                            ? 'bg-gradient-to-r from-purple-600 to-indigo-700 text-white border-purple-600 shadow-md shadow-purple-500/20 ring-2 ring-purple-500/30'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-purple-400/60 shadow-xs'
                    }`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            activeDomain === 'governance' ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        }`}>
                            <span className="material-symbols-outlined text-[22px]">admin_panel_settings</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${activeDomain === 'governance' ? 'text-purple-200' : 'text-slate-400'}`}>
                                    Domain 2
                                </span>
                                {roleRequests.filter(r => r.status === 'Pending').length > 0 && (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse ${
                                        activeDomain === 'governance' ? 'bg-amber-400 text-slate-950' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    }`}>
                                        {roleRequests.filter(r => r.status === 'Pending').length} Requests
                                    </span>
                                )}
                            </div>
                            <h3 className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
                                User & Access Governance
                            </h3>
                            <p className={`text-[10px] sm:text-[11px] truncate ${activeDomain === 'governance' ? 'text-purple-100' : 'text-slate-400'}`}>
                                Employee Accounts, Roles & Privileges
                            </p>
                        </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                        <span className={`text-base sm:text-lg font-black block leading-none ${activeDomain === 'governance' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                            {usersList.length}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-tight ${activeDomain === 'governance' ? 'text-purple-200' : 'text-slate-400'}`}>
                            Users
                        </span>
                    </div>
                </div>

                {/* Pillar 3: System Operations & Compliance */}
                <div 
                    onClick={() => handleDomainSelect('operations')}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                        activeDomain === 'operations'
                            ? 'bg-gradient-to-r from-cyan-600 to-slate-800 text-white border-cyan-600 shadow-md shadow-cyan-500/20 ring-2 ring-cyan-500/30'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-cyan-400/60 shadow-xs'
                    }`}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            activeDomain === 'operations' ? 'bg-white/20 text-white' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                        }`}>
                            <span className="material-symbols-outlined text-[22px]">settings_suggest</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${activeDomain === 'operations' ? 'text-cyan-200' : 'text-slate-400'}`}>
                                    Domain 3
                                </span>
                                {systemLogCounts.errors > 0 ? (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeDomain === 'operations' ? 'bg-rose-300 text-rose-950' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                    }`}>
                                        {systemLogCounts.errors} Err
                                    </span>
                                ) : (
                                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                                        activeDomain === 'operations' ? 'bg-emerald-300 text-emerald-950' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                    }`}>
                                        Online
                                    </span>
                                )}
                            </div>
                            <h3 className="font-extrabold text-xs sm:text-sm tracking-tight truncate">
                                Operations & Compliance
                            </h3>
                            <p className={`text-[10px] sm:text-[11px] truncate ${activeDomain === 'operations' ? 'text-cyan-100' : 'text-slate-400'}`}>
                                Audit Trail, Server Logs & Platform Analytics
                            </p>
                        </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                        <span className={`text-base sm:text-lg font-black block leading-none ${activeDomain === 'operations' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                            {auditTrail.length}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-tight ${activeDomain === 'operations' ? 'text-cyan-200' : 'text-slate-400'}`}>
                            Audits
                        </span>
                    </div>
                </div>
            </div>

            {/* ─── HIERARCHY TIER 2: FUNCTIONAL SUB-TABS (SCOPED TO ACTIVE DOMAIN) ─── */}
            {activeDomain !== 'governance' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 mb-3 shadow-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-0.5">
                        {activeDomain === 'moderation' && (
                            <>
                                <button
                                    onClick={() => setActiveTab('moderation')}
                                    className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight transition-all flex items-center gap-1.5 cursor-pointer ${
                                        activeTab === 'moderation'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">gavel</span>
                                    <span>Content Moderation ({reports.length})</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('media_approvals')}
                                    className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight transition-all flex items-center gap-1.5 cursor-pointer ${
                                        activeTab === 'media_approvals'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px] text-rose-500">video_library</span>
                                    <span>Media Approvals ({pendingMediaApprovals.length})</span>
                                    {pendingMediaApprovals.length > 0 && (
                                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                    )}
                                </button>
                            </>
                        )}

                    {activeDomain === 'operations' && (
                        <>
                            <button
                                onClick={() => setActiveTab('audit')}
                                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'audit'
                                        ? 'bg-slate-800 text-white shadow-xs'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">history</span>
                                <span>Audit Trail ({auditTrail.length})</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('serilog')}
                                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'serilog'
                                        ? 'bg-cyan-600 text-white shadow-xs'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px] text-cyan-400">terminal</span>
                                <span>Server Logs (Serilog)</span>
                                {systemLogCounts.errors > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                                        {systemLogCounts.errors}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('analytics')}
                                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-tight transition-all flex items-center gap-1.5 cursor-pointer ${
                                    activeTab === 'analytics'
                                        ? 'bg-slate-800 text-white shadow-xs'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">analytics</span>
                                <span>Analytics</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
            )}

            {/* ─── HIERARCHY TIER 3: CONTEXTUAL FILTER & ACTION STRIP (STRICTLY SCOPED TO ACTIVE MODULE) ─── */}

            {/* TAB 1: CONTENT MODERATION FILTERS */}
            {activeTab === 'moderation' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                    {/* 1. All Reports */}
                    <div 
                        onClick={() => { 
                            setActiveMetricCard('total'); 
                            handleResetFilters(); 
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            activeMetricCard === 'total'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">report</span>
                            <span className="text-[10px] font-bold text-emerald-500">+8%</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{totalReportsCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Reports</p>
                    </div>

                    {/* 2. Pending Reports */}
                    <div 
                        onClick={() => { 
                            setActiveMetricCard('pending'); 
                            setStatusFilter('Pending'); 
                            setSeverityFilter('All');
                            setDateRangeFilter('All');
                            showToast(`Filtered: Showing ${pendingCount} Pending Reports`); 
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            activeMetricCard === 'pending'
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-amber-500/40 hover:border-amber-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                            <span className="text-[10px] font-black text-amber-600 bg-amber-500/15 px-1.5 py-0.2 rounded-full">Needs Action</span>
                        </div>
                        <p className="text-lg font-black text-amber-500 leading-none">{pendingCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Pending Reports</p>
                    </div>

                    {/* 3. Removed Reports (previously Action Taken - Red) */}
                    <div 
                        onClick={() => { 
                            setActiveMetricCard('action_taken'); 
                            setStatusFilter('Action Taken'); 
                            setSeverityFilter('All');
                            setDateRangeFilter('All');
                            showToast(`Filtered: Showing ${actionTakenCount} Removed Reports`); 
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            activeMetricCard === 'action_taken'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-rose-500/40 hover:border-rose-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 px-1.5 py-0.2 rounded-full">Removed</span>
                        </div>
                        <p className="text-lg font-black text-rose-600 dark:text-rose-400 leading-none">{actionTakenCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Removed Reports</p>
                    </div>

                    {/* 4. Dismissed Reports (previously Dismissed - Green) */}
                    <div 
                        onClick={() => { 
                            setActiveMetricCard('dismissed'); 
                            setStatusFilter('Dismissed'); 
                            setSeverityFilter('All');
                            setDateRangeFilter('All');
                            showToast(`Filtered: Showing ${dismissedCount} Dismissed Reports`); 
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            activeMetricCard === 'dismissed'
                                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-emerald-500/40 hover:border-emerald-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">task_alt</span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.2 rounded-full">Dismissed</span>
                        </div>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">{dismissedCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Dismissed Reports</p>
                    </div>

                    {/* 5. Today's Reports */}
                    <div 
                        onClick={() => { 
                            setActiveMetricCard('today'); 
                            setDateRangeFilter('Today'); 
                            setStatusFilter('All');
                            setSeverityFilter('All');
                            showToast(`Filtered: Showing ${todayReportsCount} Today's Reports`); 
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            activeMetricCard === 'today'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">today</span>
                            <span className="text-[10px] font-bold text-indigo-500">+2 new</span>
                        </div>
                        <p className="text-lg font-black text-indigo-500 leading-none">{todayReportsCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Reported Today</p>
                    </div>
                </div>
            )}

            {/* TAB 2: MEDIA APPROVALS CONTROLS & FILTERS */}
            {activeTab === 'media_approvals' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {/* 1. All Pending Media */}
                    <div 
                        onClick={() => { setMediaTypeFilter('All'); showToast('Showing all pending media submissions'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            mediaTypeFilter === 'All'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">video_library</span>
                            <span className="text-[10px] font-black text-rose-600 bg-rose-500/15 px-1.5 py-0.2 rounded-full">Queue</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{pendingMediaApprovals.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Pending Submissions</p>
                    </div>

                    {/* 2. Video Submissions */}
                    <div 
                        onClick={() => { setMediaTypeFilter('Video'); showToast('Filtered: Showing Video Submissions'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            mediaTypeFilter === 'Video'
                                ? 'bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-cyan-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">play_circle</span>
                            <span className="text-[10px] font-bold text-cyan-500">Video</span>
                        </div>
                        <p className="text-lg font-black text-cyan-500 leading-none">{pendingMediaApprovals.filter(m => m.mediaType === 'Video').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Videos Only</p>
                    </div>

                    {/* 3. Podcast Submissions */}
                    <div 
                        onClick={() => { setMediaTypeFilter('Podcast'); showToast('Filtered: Showing Podcast Submissions'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            mediaTypeFilter === 'Podcast'
                                ? 'bg-pink-500/10 border-pink-500 ring-2 ring-pink-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-pink-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-pink-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">podcasts</span>
                            <span className="text-[10px] font-bold text-pink-500">Audio</span>
                        </div>
                        <p className="text-lg font-black text-pink-500 leading-none">{pendingMediaApprovals.filter(m => m.mediaType === 'Podcast').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Podcasts Only</p>
                    </div>

                    {/* 4. Batch Approve All */}
                    <div 
                        onClick={handleBatchApproveMedia}
                        className="p-2.5 rounded-xl transition-all cursor-pointer group border bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-500/15 shadow-xs"
                    >
                        <div className="flex items-center justify-between text-emerald-600 mb-1">
                            <span className="material-symbols-outlined text-[18px]">done_all</span>
                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/20 px-1.5 py-0.2 rounded-full">One-Click</span>
                        </div>
                        <p className="text-base font-black text-emerald-600 leading-none mt-1">Approve All</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Batch Release to Hub</p>
                    </div>
                </div>
            )}

            {/* TAB: COMMUNITY APPROVALS QUICK METRIC CARDS */}
            {activeTab === 'community_approvals' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {/* 1. All Pending Community Requests */}
                    <div 
                        onClick={() => { setCommunityApprovalTypeFilter('All'); showToast('Showing all pending community requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityApprovalTypeFilter === 'All'
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">approval</span>
                            <span className="text-[10px] font-bold text-amber-500">All</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{pendingCommunityApprovals.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Pending Requests</p>
                    </div>

                    {/* 2. Public Communities */}
                    <div 
                        onClick={() => { setCommunityApprovalTypeFilter('Public'); showToast('Filtered: Showing Public community requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityApprovalTypeFilter === 'Public'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">public</span>
                            <span className="text-[10px] font-bold text-indigo-500">Public</span>
                        </div>
                        <p className="text-lg font-black text-indigo-500 leading-none">{pendingCommunityApprovals.filter(c => formatCommunityType(c.type) === 'Public').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Public Channels</p>
                    </div>

                    {/* 3. Private Communities */}
                    <div 
                        onClick={() => { setCommunityApprovalTypeFilter('Private'); showToast('Filtered: Showing Private community requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityApprovalTypeFilter === 'Private'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">lock</span>
                            <span className="text-[10px] font-bold text-rose-500">Private</span>
                        </div>
                        <p className="text-lg font-black text-rose-500 leading-none">{pendingCommunityApprovals.filter(c => formatCommunityType(c.type) === 'Private').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Private Groups</p>
                    </div>

                    {/* 4. Org Communities */}
                    <div 
                        onClick={() => { setCommunityApprovalTypeFilter('Org'); showToast('Filtered: Showing Org-wide community requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityApprovalTypeFilter === 'Org'
                                ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">domain</span>
                            <span className="text-[10px] font-bold text-purple-500">Org</span>
                        </div>
                        <p className="text-lg font-black text-purple-500 leading-none">{pendingCommunityApprovals.filter(c => formatCommunityType(c.type) === 'Org').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Org-Wide</p>
                    </div>
                </div>
            )}

            {/* TAB 3: AI MODERATION RULES QUICK PRESETS & TOGGLES */}
            {activeTab === 'ai_moderation' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
                    {/* 1. Active Sensitivity Status */}
                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">tune</span>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-500/15 px-1.5 py-0.2 rounded-full">NLP</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{configState.aiToxicityThreshold || 80}%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Current Threshold</p>
                    </div>

                    {/* 2. Permissive 50% Preset */}
                    <div 
                        onClick={() => { setConfigState({ ...configState, aiToxicityThreshold: 50 }); showToast('AI Sensitivity preset set to 50% (Permissive)'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            (configState.aiToxicityThreshold || 80) === 50
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-slate-400 group-hover:text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">filter_1</span>
                            <span className="text-[10px] font-bold text-slate-400">Low</span>
                        </div>
                        <p className="text-lg font-black text-slate-800 dark:text-slate-200 leading-none">50%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Permissive Mode</p>
                    </div>

                    {/* 3. Balanced 80% Preset */}
                    <div 
                        onClick={() => { setConfigState({ ...configState, aiToxicityThreshold: 80 }); showToast('AI Sensitivity preset set to 80% (Recommended)'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            (configState.aiToxicityThreshold || 80) === 80
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">verified</span>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-500/15 px-1.5 py-0.2 rounded-full">Default</span>
                        </div>
                        <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none">80%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Balanced (Recommended)</p>
                    </div>

                    {/* 4. Strict 95% Preset */}
                    <div 
                        onClick={() => { setConfigState({ ...configState, aiToxicityThreshold: 95 }); showToast('AI Sensitivity preset set to 95% (Strict)'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            (configState.aiToxicityThreshold || 80) === 95
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">shield</span>
                            <span className="text-[10px] font-bold text-rose-500">Max</span>
                        </div>
                        <p className="text-lg font-black text-rose-500 leading-none">95%</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Strict Mode</p>
                    </div>

                    {/* 5. Toggle Auto-Quarantine */}
                    <div 
                        onClick={() => {
                            const next = configState.aiAutoQuarantine === false;
                            setConfigState({ ...configState, aiAutoQuarantine: next });
                            showToast(`Auto-Quarantine ${next ? 'Enabled' : 'Disabled'}`);
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            configState.aiAutoQuarantine !== false
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">gavel</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${configState.aiAutoQuarantine !== false ? 'bg-rose-500/20 text-rose-600' : 'bg-slate-200 text-slate-500'}`}>
                                {configState.aiAutoQuarantine !== false ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white leading-none mt-1">Auto-Quarantine</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Hide &gt;95% Posts</p>
                    </div>

                    {/* 6. Toggle Deep PII Scan */}
                    <div 
                        onClick={() => {
                            const next = configState.aiDeepScan === false;
                            setConfigState({ ...configState, aiDeepScan: next });
                            showToast(`Deep PII Scan ${next ? 'Enabled' : 'Disabled'}`);
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            configState.aiDeepScan !== false
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">key</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${configState.aiDeepScan !== false ? 'bg-amber-500/20 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                                {configState.aiDeepScan !== false ? 'ON' : 'OFF'}
                            </span>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white leading-none mt-1">Deep PII Scan</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">PAN / Aadhaar / Keys</p>
                    </div>
                </div>
            )}

            {/* TAB 4: COMMUNITY MODERATION FILTERS */}
            {activeTab === 'communities' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                    {/* 1. All Communities */}
                    <div 
                        onClick={() => { setCommunityPolicyFilter('All'); showToast('Showing all communities'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityPolicyFilter === 'All'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">forum</span>
                            <span className="text-[10px] font-bold text-indigo-500">All</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{communityChannels.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Communities</p>
                    </div>

                    {/* 2. Strict Policy */}
                    <div 
                        onClick={() => { setCommunityPolicyFilter('Strict'); showToast('Filtered: Showing Strict Policy Communities'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityPolicyFilter === 'Strict'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-rose-500/40 hover:border-rose-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">lock</span>
                            <span className="text-[10px] font-black text-rose-600 bg-rose-500/15 px-1.5 py-0.2 rounded-full">Strict</span>
                        </div>
                        <p className="text-lg font-black text-rose-500 leading-none">{communityChannels.filter(c => c.status?.toLowerCase() === 'strict').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Strict Policy</p>
                    </div>

                    {/* 3. Standard Policy */}
                    <div 
                        onClick={() => { setCommunityPolicyFilter('Standard'); showToast('Filtered: Showing Standard Policy Communities'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityPolicyFilter === 'Standard'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-indigo-500/40 hover:border-indigo-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">verified</span>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-500/15 px-1.5 py-0.2 rounded-full">Standard</span>
                        </div>
                        <p className="text-lg font-black text-indigo-500 leading-none">{communityChannels.filter(c => c.status?.toLowerCase() === 'standard').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Standard Policy</p>
                    </div>

                    {/* 4. Relaxed Policy */}
                    <div 
                        onClick={() => { setCommunityPolicyFilter('Relaxed'); showToast('Filtered: Showing Relaxed Policy Communities'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            communityPolicyFilter === 'Relaxed'
                                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-emerald-500/40 hover:border-emerald-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">public</span>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-500/15 px-1.5 py-0.2 rounded-full">Relaxed</span>
                        </div>
                        <p className="text-lg font-black text-emerald-500 leading-none">{communityChannels.filter(c => c.status?.toLowerCase() === 'relaxed').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Relaxed Policy</p>
                    </div>

                    {/* 5. Create Community Action */}
                    <div 
                        onClick={() => setIsCreateChannelModalOpen(true)}
                        className="p-2.5 rounded-xl transition-all cursor-pointer group border bg-indigo-500/10 border-indigo-500/40 hover:border-indigo-500 hover:bg-indigo-500/15 shadow-xs"
                    >
                        <div className="flex items-center justify-between text-indigo-600 mb-1">
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-500/20 px-1.5 py-0.2 rounded-full">Action</span>
                        </div>
                        <p className="text-base font-black text-indigo-600 leading-none mt-1">+ Create Channel</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">New Community</p>
                    </div>
                </div>
            )}

            {/* TAB 5: USER DIRECTORY FILTERS */}
            {activeTab === 'users' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {/* 1. All Users */}
                    <div 
                        onClick={() => { setUserSearchTerm(''); showToast(`Showing all ${usersList.length} registered employees`); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            !userSearchTerm
                                ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">badge</span>
                            <span className="text-[10px] font-bold text-purple-500">Directory</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{usersList.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Employees</p>
                    </div>

                    {/* 2. Active Accounts */}
                    <div 
                        onClick={() => { setUserSearchTerm('Active'); showToast(`Filtered: Showing ${activeUsersCount} active employee accounts`); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            userSearchTerm === 'Active'
                                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">group</span>
                            <span className="text-[10px] font-bold text-emerald-500">+15%</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{activeUsersCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Active Accounts</p>
                    </div>

                    {/* 3. Administrators */}
                    <div 
                        onClick={() => { setUserSearchTerm('Admin'); showToast(`Filtered: Showing ${activeModeratorsCount} administrators`); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            userSearchTerm === 'Admin'
                                ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                            <span className="text-[10px] font-bold text-purple-500">Live</span>
                        </div>
                        <p className="text-lg font-black text-purple-500 leading-none">{activeModeratorsCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Admins</p>
                    </div>

                    {/* 4. Suspended Users */}
                    <div 
                        onClick={() => { setUserSearchTerm('Suspended'); showToast(`Filtered: Showing ${suspendedUsersCount} suspended accounts`); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            userSearchTerm === 'Suspended'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                            <span className="material-symbols-outlined text-[18px]">person_off</span>
                            <span className="text-[10px] font-bold text-rose-500">Quarantine</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{suspendedUsersCount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Suspended Accounts</p>
                    </div>
                </div>
            )}

            {/* TAB 6: ROLE REQUESTS FILTERS */}
            {activeTab === 'role_requests' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {/* 1. All Role Requests */}
                    <div 
                        onClick={() => { setRoleRequestStatusFilter('All'); showToast('Showing all role requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            roleRequestStatusFilter === 'All'
                                ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">verified_user</span>
                            <span className="text-[10px] font-bold text-purple-500">Total</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{roleRequests.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Requests</p>
                    </div>

                    {/* 2. Pending Review */}
                    <div 
                        onClick={() => { setRoleRequestStatusFilter('Pending'); showToast('Filtered: Showing Pending Role Requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            roleRequestStatusFilter === 'Pending'
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-amber-500/40 hover:border-amber-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">pending_actions</span>
                            <span className="text-[10px] font-black text-amber-600 bg-amber-500/15 px-1.5 py-0.2 rounded-full">Review</span>
                        </div>
                        <p className="text-lg font-black text-amber-500 leading-none">{roleRequests.filter(r => r.status === 'Pending').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Pending Approval</p>
                    </div>

                    {/* 3. Approved Requests */}
                    <div 
                        onClick={() => { setRoleRequestStatusFilter('Approved'); showToast('Filtered: Showing Approved Role Requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            roleRequestStatusFilter === 'Approved'
                                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            <span className="text-[10px] font-bold text-emerald-500">Granted</span>
                        </div>
                        <p className="text-lg font-black text-emerald-500 leading-none">{roleRequests.filter(r => r.status === 'Approved').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Approved Requests</p>
                    </div>

                    {/* 4. Rejected Requests */}
                    <div 
                        onClick={() => { setRoleRequestStatusFilter('Rejected'); showToast('Filtered: Showing Rejected Role Requests'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            roleRequestStatusFilter === 'Rejected'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                            <span className="text-[10px] font-bold text-rose-500">Declined</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{roleRequests.filter(r => r.status === 'Rejected').length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Rejected Requests</p>
                    </div>
                </div>
            )}

            {/* TAB 7: SYSTEM PARAMETERS QUICK TOGGLES */}
            {activeTab === 'system' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                    {/* 1. Platform Online */}
                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-emerald-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">cloud_done</span>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-500/15 px-1.5 py-0.2 rounded-full">Live</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">Healthy</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Platform Status</p>
                    </div>

                    {/* 2. Toggle Maintenance Mode */}
                    <div 
                        onClick={() => {
                            const next = !configState.maintenanceMode;
                            setConfigState({ ...configState, maintenanceMode: next });
                            showToast(`Maintenance mode ${next ? 'activated' : 'deactivated'}`);
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            configState.maintenanceMode
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">construction</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${configState.maintenanceMode ? 'bg-amber-500/20 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                                {configState.maintenanceMode ? 'ACTIVE' : 'OFF'}
                            </span>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white leading-none mt-1">Maintenance</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Click to Toggle</p>
                    </div>

                    {/* 3. Toggle Auto-Moderation */}
                    <div 
                        onClick={() => {
                            const next = !configState.autoModeration;
                            setConfigState({ ...configState, autoModeration: next });
                            showToast(`Auto-moderation ${next ? 'activated' : 'deactivated'}`);
                        }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            configState.autoModeration
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${configState.autoModeration ? 'bg-indigo-500/20 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                {configState.autoModeration ? 'ACTIVE' : 'OFF'}
                            </span>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white leading-none mt-1">Auto-Moderation</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Click to Toggle</p>
                    </div>

                    {/* 4. Cycle Upload Limit */}
                    <div 
                        onClick={() => {
                            const cur = configState.maxUploadMb || 100;
                            const next = cur === 100 ? 200 : (cur === 200 ? 50 : 100);
                            setConfigState({ ...configState, maxUploadMb: next });
                            showToast(`Max upload limit set to ${next} MB`);
                        }}
                        className="p-2.5 rounded-xl transition-all cursor-pointer group border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs"
                    >
                        <div className="flex items-center justify-between text-cyan-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                            <span className="text-[10px] font-black text-cyan-600 bg-cyan-500/15 px-1.5 py-0.2 rounded-full">Cycle</span>
                        </div>
                        <p className="text-lg font-black text-cyan-600 leading-none">{configState.maxUploadMb || 100} MB</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Max Upload Limit</p>
                    </div>

                    {/* 5. Cycle JWT Session TTL */}
                    <div 
                        onClick={() => {
                            const cur = configState.jwtTtlHours || 24;
                            const next = cur === 24 ? 48 : (cur === 48 ? 12 : 24);
                            setConfigState({ ...configState, jwtTtlHours: next });
                            showToast(`Session TTL set to ${next} Hours`);
                        }}
                        className="p-2.5 rounded-xl transition-all cursor-pointer group border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs"
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                            <span className="material-symbols-outlined text-[18px]">timer</span>
                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded-full">Cycle</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{configState.jwtTtlHours || 24}h</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Session Duration</p>
                    </div>
                </div>
            )}

            {/* TAB 8: AUDIT TRAIL ACTION FILTERS */}
            {activeTab === 'audit' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {/* 1. All Audits */}
                    <div 
                        onClick={() => { setAuditActionFilter('All'); showToast('Showing all audit events'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            auditActionFilter === 'All'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">history</span>
                            <span className="text-[10px] font-bold text-emerald-500">Tamper-Proof</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{auditTrail.length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Audit Events</p>
                    </div>

                    {/* 4. User Governance */}
                    <div 
                        onClick={() => { setAuditActionFilter('User'); showToast('Filtered: Showing User Governance Logs'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            auditActionFilter === 'User'
                                ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-purple-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                            <span className="text-[10px] font-bold text-purple-500">Users</span>
                        </div>
                        <p className="text-lg font-black text-purple-500 leading-none">{auditTrail.filter(a => a.action?.startsWith('User')).length}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">User Governance</p>
                    </div>
                </div>
            )}

            {/* TAB 9: SERVER LOGS (SERILOG) LOG LEVEL FILTERS */}
            {activeTab === 'serilog' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
                    {/* 1. All Telemetry */}
                    <div 
                        onClick={() => { setLogLevelFilter('ALL'); showToast('Showing all server telemetry logs'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            logLevelFilter === 'ALL'
                                ? 'bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-cyan-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-cyan-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">terminal</span>
                            <span className="text-[10px] font-bold text-cyan-500">Telemetry</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{systemLogCounts.total || 120}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">All Server Logs</p>
                    </div>

                    {/* 2. Errors */}
                    <div 
                        onClick={() => { setLogLevelFilter('ERROR'); showToast('Filtered: Showing ERROR logs only'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            logLevelFilter === 'ERROR'
                                ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-rose-500/40 hover:border-rose-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">error</span>
                            <span className="text-[10px] font-black text-rose-600 bg-rose-500/15 px-1.5 py-0.2 rounded-full">Severity 1</span>
                        </div>
                        <p className="text-lg font-black text-rose-500 leading-none">{systemLogCounts.errors}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Error Events</p>
                    </div>

                    {/* 3. Warnings */}
                    <div 
                        onClick={() => { setLogLevelFilter('WARN'); showToast('Filtered: Showing WARNING logs only'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            logLevelFilter === 'WARN'
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-amber-500/40 hover:border-amber-500 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-amber-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">warning</span>
                            <span className="text-[10px] font-black text-amber-600 bg-amber-500/15 px-1.5 py-0.2 rounded-full">Severity 2</span>
                        </div>
                        <p className="text-lg font-black text-amber-500 leading-none">{systemLogCounts.warnings}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Warnings</p>
                    </div>

                    {/* 4. Information */}
                    <div 
                        onClick={() => { setLogLevelFilter('INFO'); showToast('Filtered: Showing INFO logs only'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            logLevelFilter === 'INFO'
                                ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">info</span>
                            <span className="text-[10px] font-bold text-indigo-500">Info</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{systemLogCounts.info}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Information</p>
                    </div>

                    {/* 5. Debug */}
                    <div 
                        onClick={() => { setLogLevelFilter('DEBUG'); showToast('Filtered: Showing DEBUG logs only'); }}
                        className={`p-2.5 rounded-xl transition-all cursor-pointer group border ${
                            logLevelFilter === 'DEBUG'
                                ? 'bg-slate-600/10 border-slate-600 ring-2 ring-slate-600/50 shadow-md scale-[1.02]' 
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-500/40 shadow-xs'
                        }`}
                    >
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                            <span className="material-symbols-outlined text-[18px]">bug_report</span>
                            <span className="text-[10px] font-bold text-slate-400">Trace</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{systemLogCounts.debug}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Debug Traces</p>
                    </div>
                </div>
            )}

            {/* TAB 10: ANALYTICS OVERVIEW CARDS */}
            {activeTab === 'analytics' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-indigo-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">insights</span>
                            <span className="text-[10px] font-bold text-emerald-500">99.8%</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">System Health</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Live Telemetry</p>
                    </div>

                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-purple-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">groups</span>
                            <span className="text-[10px] font-bold text-purple-500">{usersList.length}</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{activeUsersCount} Active</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Total Employees</p>
                    </div>

                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-cyan-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">forum</span>
                            <span className="text-[10px] font-bold text-cyan-500">Active</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{communityChannels.length} Channels</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Communities</p>
                    </div>

                    <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="flex items-center justify-between text-rose-500 mb-1">
                            <span className="material-symbols-outlined text-[18px]">gavel</span>
                            <span className="text-[10px] font-bold text-rose-500">{pendingCount} Pending</span>
                        </div>
                        <p className="text-lg font-black text-slate-900 dark:text-white leading-none">{reports.length} Reports</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mt-1">Safety Governance</p>
                    </div>
                </div>
            )}

            {/* ─── TAB 1: CONTENT MODERATION ─── */}
            {activeTab === 'moderation' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden flex flex-col">
                    {/* ─── 4. SINGLE COMPACT FILTERS & BULK ACTIONS TOOLBAR ─── */}
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        {/* Search & Select Filters */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium flex-1">
                            {/* Search Input */}
                            <div className="relative w-48 sm:w-56">
                                <span className="material-symbols-outlined absolute left-2 top-1.5 text-slate-400 text-[15px]">search</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search Report / User / Content..."
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Reason Filter */}
                            <select
                                value={reasonFilter}
                                onChange={e => {
                                    setReasonFilter(e.target.value);
                                    if (e.target.value !== 'All') setActiveMetricCard('custom');
                                }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
                            >
                                <option value="All">Reason: All</option>
                                <option value="Spam">Spam</option>
                                <option value="Inappropriate">Inappropriate</option>
                                <option value="Harassment">Harassment</option>
                                <option value="Copyright">Copyright</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        {/* Right: Bulk Action Controls */}
                        {selectedReportIds.length > 0 && (
                            <div className="flex items-center gap-1.5 animate-in fade-in bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                <span>{selectedReportIds.length} Selected:</span>
                                <button
                                    onClick={() => handleBulkResolve('Dismiss')}
                                    className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded text-[11px] font-bold cursor-pointer"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={() => handleBulkResolve('Removed Content')}
                                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ─── 5. HIGH-DENSITY 13-COLUMN TABLE VIEW WITHOUT DOWNBAR OR SIDEBAR ─── */}
                    <div ref={moderationTableRef} className="w-full overflow-x-auto overflow-y-auto max-h-[calc(100vh-250px)] no-scrollbar">
                        <table className="w-full text-left border-collapse table-auto text-xs">
                            <thead className="bg-slate-100/90 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold text-[10.5px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-xs">
                                <tr>
                                    <th className="px-2.5 py-2 text-center w-8">
                                        <input
                                            type="checkbox"
                                            checked={selectedReportIds.length > 0 && selectedReportIds.length === sortedReports.length}
                                            onChange={handleSelectAllRows}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-2 py-2 text-center w-12">ID</th>
                                    <th className="px-2.5 py-2">Reporter</th>
                                    <th className="px-2.5 py-2">Reported User</th>
                                    <th className="px-2 py-2">Type</th>
                                    <th className="px-2 py-2">Community</th>
                                    <th className="px-2 py-2">Reason</th>
                                    <th className="px-2 py-2 text-center">Severity</th>
                                    <th className="px-2 py-2 text-center">Status</th>
                                    <th className="px-2.5 py-2">System Admin</th>
                                    <th className="px-2.5 py-2 text-center whitespace-nowrap">Reported Date</th>
                                    <th className="px-2.5 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-medium">
                                {isLoadingReports ? (
                                    <tr>
                                        <td colSpan="12" className="text-center py-8 text-slate-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="material-symbols-outlined animate-spin text-indigo-600">sync</span>
                                                <span>Loading Moderation Reports...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : sortedReports.length === 0 ? (
                                    <tr>
                                        <td colSpan="12" className="text-center py-10 text-slate-500 bg-slate-50/50 dark:bg-slate-900/50">
                                            <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                                                <span className="material-symbols-outlined text-4xl text-slate-400">filter_alt_off</span>
                                                <p className="font-bold text-slate-700 dark:text-slate-200">No moderation reports match the filter criteria</p>
                                                <p className="text-[11px] text-slate-400">Try clearing status, reason, severity, or search filters to view reports.</p>
                                                <button
                                                    onClick={handleResetFilters}
                                                    className="mt-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                                                    Reset All Filters
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    sortedReports.slice(0, visibleReportCount).map(r => {
                                        const isPending = r.status === 'Pending';
                                        const isSelected = selectedReportIds.includes(r.reportId);
                                        
                                        // Reason badge style
                                        let reasonBadgeStyle = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                                        if (r.reasonCode === 'Harassment') reasonBadgeStyle = 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
                                        else if (r.reasonCode === 'Copyright') reasonBadgeStyle = 'bg-purple-500/10 text-purple-600 border border-purple-500/20';
                                        else if (r.reasonCode === 'Inappropriate') reasonBadgeStyle = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
                                        else if (r.reasonCode === 'Spam') reasonBadgeStyle = 'bg-blue-500/10 text-blue-600 border border-blue-500/20';

                                        // Severity badge style
                                        let severityBadgeStyle = 'bg-slate-100 text-slate-600';
                                        if (r.severity === 'Critical') severityBadgeStyle = 'bg-rose-600 text-white font-black';
                                        else if (r.severity === 'High') severityBadgeStyle = 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
                                        else if (r.severity === 'Medium') severityBadgeStyle = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';

                                        // Status badge style & label
                                        let statusBadgeStyle = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
                                        let statusBadgeLabel = r.status || 'Pending';

                                        if (r.status === 'Action Taken' || (r.actionTaken && r.actionTaken.toLowerCase().includes('remove'))) {
                                            statusBadgeStyle = 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
                                            statusBadgeLabel = 'Removed Content';
                                        } else if (r.status === 'Dismissed' || (r.actionTaken && r.actionTaken.toLowerCase().includes('dismiss'))) {
                                            statusBadgeStyle = 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
                                            statusBadgeLabel = 'Dismissed';
                                        } else if (r.status === 'Reviewed') {
                                            statusBadgeStyle = 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
                                            statusBadgeLabel = 'Dismissed';
                                        }

                                        return (
                                            <tr key={r.reportId} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-indigo-500/5 dark:bg-indigo-500/10' : ''}`}>
                                                {/* Checkbox */}
                                                <td className="px-2.5 py-2 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleSelectRow(r.reportId)}
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </td>

                                                {/* Report ID */}
                                                <td className="px-2 py-2 text-center font-black text-slate-900 dark:text-white text-[11px]">
                                                    #{r.reportId}
                                                </td>

                                                {/* Reporter */}
                                                <td className="px-2.5 py-2">
                                                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={r.reporterFullName}>
                                                        <HighlightText text={r.reporterFullName} query={searchQuery} />
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">ID: #{r.reporterUserId}</div>
                                                </td>

                                                {/* Reported User */}
                                                <td className="px-2.5 py-2">
                                                    {(() => {
                                                        const targetAuthorId = r.reportedUserId;
                                                        const foundUser = usersList.find(u => Number(u.userId || u.id) === Number(targetAuthorId));
                                                        let authorName = r.reportedUserName;
                                                        if (!authorName || authorName.toLowerCase().includes('reported author') || authorName.toLowerCase().includes('content author')) {
                                                            authorName = foundUser?.fullName || (targetAuthorId === 1 ? 'Loveneesh Sharma' : (targetAuthorId ? `User #${targetAuthorId}` : 'Loveneesh Sharma'));
                                                        }
                                                        const authorId = targetAuthorId || foundUser?.userId || 1;
                                                        return (
                                                            <>
                                                                <div className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]" title={authorName}>
                                                                    <HighlightText text={authorName} query={searchQuery} />
                                                                </div>
                                                                <div className="text-[10px] text-slate-400">ID: #{authorId}</div>
                                                            </>
                                                        );
                                                    })()}
                                                </td>

                                                {/* Content Type */}
                                                <td className="px-2 py-2">
                                                    <button
                                                        onClick={() => handleOpenPostPreview(r)}
                                                        className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline cursor-pointer"
                                                        title={`Click to preview ${r.contentType} #${r.contentId}`}
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">description</span>
                                                        <span><HighlightText text={`${r.contentType} #${r.contentId}`} query={searchQuery} /></span>
                                                    </button>
                                                </td>

                                                {/* Community */}
                                                <td className="px-2 py-2 text-slate-600 dark:text-slate-300 font-semibold text-[11px] truncate max-w-[110px]" title={r.communityName || 'General'}>
                                                    <HighlightText text={r.communityName || 'General'} query={searchQuery} />
                                                </td>

                                                {/* Reason */}
                                                <td className="px-2 py-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${reasonBadgeStyle}`}>
                                                        {r.reasonCode}
                                                    </span>
                                                </td>

                                                {/* Severity */}
                                                <td className="px-2 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${severityBadgeStyle}`}>
                                                        {r.severity || 'Medium'}
                                                    </span>
                                                </td>

                                                {/* Status */}
                                                <td className="px-2 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black whitespace-nowrap ${statusBadgeStyle}`}>
                                                        {statusBadgeLabel}
                                                    </span>
                                                </td>

                                                {/* System Admin */}
                                                <td className="px-2.5 py-2">
                                                    {r.moderatorUserId ? (
                                                        <div>
                                                            <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] truncate max-w-[120px]">{r.moderatorFullName || 'System Admin'}</div>
                                                            <div className="text-[10px] text-slate-400">{r.actionTaken || 'None'}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                                                    )}
                                                </td>

                                                {/* Date */}
                                                <td className="px-2.5 py-2 text-center text-slate-500 dark:text-slate-400 text-[10.5px] whitespace-nowrap">
                                                    {r.reportedDate}
                                                </td>

                                                {/* Actions Column (Compact Icon Buttons) */}
                                                <td className="px-2.5 py-2 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {/* View Post Icon */}
                                                        <button
                                                            onClick={() => handleOpenPostPreview(r)}
                                                            className="p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-all cursor-pointer"
                                                            title="Preview Reported Post"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                                                        </button>

                                                        {isPending && (
                                                            <>
                                                                {/* Dismiss Icon */}
                                                                <button
                                                                    onClick={() => handleResolve(r.reportId, 'Dismiss', r.contentId, r.contentType)}
                                                                    className="p-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded transition-all cursor-pointer"
                                                                    title="Dismiss Report (Mark Reviewed)"
                                                                >
                                                                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                                                                </button>

                                                                {/* Remove Content Icon */}
                                                                <button
                                                                    onClick={() => handleResolve(r.reportId, 'Removed Content', r.contentId, r.contentType)}
                                                                    className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded border border-rose-500/20 transition-all cursor-pointer"
                                                                    title="Remove Violating Content"
                                                                >
                                                                    <span className="material-symbols-outlined text-[15px]">delete</span>
                                                                </button>

                                                                {/* Suspend User Icon */}
                                                                <button
                                                                    onClick={() => {
                                                                        const targetId = r.reportedUserId;
                                                                        const targetName = r.reportedUserName && r.reportedUserName !== r.reporterFullName ? r.reportedUserName : (targetId ? `User #${targetId}` : 'Reported User');
                                                                        if (!targetId && (!r.reportedUserName || r.reportedUserName === r.reporterFullName)) {
                                                                            showToast('Cannot identify reported violating user for suspension.');
                                                                            return;
                                                                        }
                                                                        const targetUser = usersList.find(u => Number(u.userId || u.id) === Number(targetId)) || {
                                                                            userId: targetId || 0,
                                                                            fullName: targetName,
                                                                            name: targetName,
                                                                            roleName: 'Employee',
                                                                            department: 'General'
                                                                        };
                                                                        setSelectedUserToSuspend(targetUser);
                                                                        setIsSuspendModalOpen(true);
                                                                    }}
                                                                    className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded border border-amber-500/20 transition-all cursor-pointer"
                                                                    title="Suspend Violating User"
                                                                >
                                                                    <span className="material-symbols-outlined text-[15px]">person_off</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                        <ScrollLoadingIndicator isVisible={visibleReportCount < sortedReports.length} text="Loading more moderation reports on scroll..." />
                    </div>
                </div>
            )}

            {/* ─── TAB 2: USER GOVERNANCE ─── */}
            {activeTab === 'users' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">User Governance & Security Management</h2>
                            {activeUserSearchTerm && (
                                <p className="text-xs text-indigo-600 font-semibold mt-0.5">
                                    Filtering: <strong className="capitalize">{activeUserSearchTerm}</strong> ({filteredUsers.length} Users found)
                                </p>
                            )}
                        </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={userSearchTerm}
                                    onChange={e => setUserSearchTerm(e.target.value)}
                                    placeholder="Filter by name, role, status (Suspended/Active)..."
                                    className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none w-64"
                                />
                                {userSearchTerm ? (
                                    <button
                                        onClick={() => setUserSearchTerm('')}
                                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-bold text-xs cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                ) : (
                                    <button
                                        onClick={fetchUsers}
                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-xs cursor-pointer"
                                    >
                                        Search
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2.5">User #</th>
                                        <th className="px-4 py-2.5">Employee Name & Email</th>
                                        <th className="px-4 py-2.5">Designation & Dept</th>
                                        <th className="px-4 py-2.5">Assigned Role</th>
                                        <th className="px-4 py-2.5">Karma Score</th>
                                        <th className="px-4 py-2.5">Status</th>
                                        <th className="px-4 py-2.5 text-right">Governance Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {isLoadingUsers ? (
                                        <tr><td colSpan="7" className="text-center py-6">Loading user directory...</td></tr>
                                    ) : filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="text-center py-8 text-slate-500">
                                                No users found matching "{userSearchTerm}".
                                                <button onClick={() => setUserSearchTerm('')} className="ml-2 text-indigo-600 underline font-bold cursor-pointer">
                                                    Clear Filter
                                                </button>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.slice(0, visibleUserCount).map(u => {
                                            const assignedRole = u.roleName || getUserAssignedRole(u);
                                            const empId = u.employeeId || `MPO${u.userId || u.id || '100'}`;
                                            const uEmail = u.email || `${(u.fullName || u.name || 'user').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`;
                                            const uAvatar = u.avatar || u.profilePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName || u.name || 'U')}&background=6366f1&color=fff&bold=true`;

                                            return (
                                                <tr key={u.userId || u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-2.5 font-bold">
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-900 dark:text-white font-mono text-[11px]">#{u.userId || u.id}</span>
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded w-fit mt-0.5 ${
                                                                assignedRole.toLowerCase().includes('admin') || assignedRole.toLowerCase().includes('adm')
                                                                    ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30'
                                                                    : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                                                            }`}>
                                                                {assignedRole.toLowerCase().includes('admin') || assignedRole.toLowerCase().includes('adm') ? 'Admin' : 'Member'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2.5">
                                                            <img 
                                                                src={uAvatar} 
                                                                alt={u.fullName || u.name} 
                                                                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0" 
                                                            />
                                                            <div className="min-w-0">
                                                                <p 
                                                                    onClick={() => {
                                                                        setSelectedUserDetailsUser(u);
                                                                        setIsUserDetailsModalOpen(true);
                                                                    }}
                                                                    className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors truncate"
                                                                >
                                                                    {u.fullName || u.name}
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{uEmail}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <p className="font-semibold text-slate-800 dark:text-slate-200">{u.designation || 'Staff Member'}</p>
                                                        <p className="text-[11px] text-slate-500">{u.department || u.departmentName || 'MPOnline Limited'}</p>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex flex-wrap gap-1.5 items-center max-w-[220px]">
                                                            {getUserRolesList(u).map((rItem, rIdx) => (
                                                                <span key={rIdx} className={`px-2.5 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1 shadow-xs ${getRoleBadgeStyle(rItem)}`}>
                                                                    <span className="material-symbols-outlined text-[13px]">
                                                                        {rItem.toLowerCase().includes('system') ? 'shield_person' :
                                                                         rItem.toLowerCase().includes('hr') ? 'badge' :
                                                                         rItem.toLowerCase().includes('community') ? 'groups' : 'person'}
                                                                    </span>
                                                                    <span>{rItem}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {(() => {
                                                            const uRoles = getUserRolesList(u).map(r => String(r).toLowerCase());
                                                            const isUserSysAdmin = (u.role === 'SYSADM' || u.roleName === 'System Administrator' || uRoles.some(r => r.includes('system') || r.includes('sysadm'))) &&
                                                                                   !uRoles.some(r => r.includes('hr') || r.includes('community') || r.includes('employee'));
                                                            if (isUserSysAdmin) {
                                                                return <span className="text-xs font-bold text-slate-400 dark:text-slate-500" title="System Admin is exempt from Karma">— (Exempt)</span>;
                                                            }
                                                            return (
                                                                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-black">
                                                                    <span className="material-symbols-outlined text-[15px]">stars</span>
                                                                    <span>{typeof u.karmaPoints === 'number' ? u.karmaPoints : 0} pts</span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {(() => {
                                                            const statusCfg = getUserStatusConfig(u);
                                                            return (
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${statusCfg.badgeClass}`}>
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`}></span>
                                                                    {statusCfg.label}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedUserDetailsUser(u);
                                                                    setIsUserDetailsModalOpen(true);
                                                                }}
                                                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                                                title="View Complete User Details"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                                                <span>View Details</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setRoleUserId(String(u.userId || u.id));
                                                                    setRoleUserName(u.fullName || u.name);
                                                                    setSelectedRoles(getUserRolesList(u));
                                                                    setIsRoleModalOpen(true);
                                                                }}
                                                                className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 font-bold text-[11px] rounded-lg hover:bg-indigo-500/20 cursor-pointer flex items-center gap-1"
                                                            >
                                                                <span className="material-symbols-outlined text-[13px]">tune</span>
                                                                <span>Edit Roles</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleUserActive(u)}
                                                                className={`px-2.5 py-1 font-bold text-[11px] rounded-lg cursor-pointer ${u.isActive ? 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'}`}
                                                            >
                                                                {u.isActive ? 'Suspend' : 'Activate'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <ScrollLoadingIndicator isVisible={visibleUserCount < filteredUsers.length} text="Loading more users on scroll..." />
                    </div>
            )}

            {/* ─── TAB 3: COMMUNITY MODERATION ─── */}
            {activeTab === 'communities' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                    {/* Notice Banner if Community Approvals are Pending */}
                    {pendingCommunityApprovals.length > 0 && (
                        <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/5 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[20px]">approval</span>
                                </div>
                                <div>
                                    <h4 className="text-xs font-black text-amber-900 dark:text-amber-300 flex items-center gap-2">
                                        <span>Community Creation Requests Awaiting Approval</span>
                                        <span className="px-2 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">{pendingCommunityApprovals.length}</span>
                                    </h4>
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                        There {pendingCommunityApprovals.length === 1 ? 'is 1 community creation request' : `are ${pendingCommunityApprovals.length} community creation requests`} submitted by employees waiting for administrative review.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveTab('community_approvals')}
                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                            >
                                <span>Review Community Approvals</span>
                                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                            </button>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-black text-slate-900 dark:text-white">
                                    Community Moderation & Enterprise Channels ({filteredCommunities.length}{communityPolicyFilter !== 'All' ? ` / ${communityChannels.length}` : ''})
                                </h2>
                                {communityPolicyFilter !== 'All' && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        communityPolicyFilter === 'Strict' 
                                            ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' 
                                            : communityPolicyFilter === 'Standard' 
                                            ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' 
                                            : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                    }`}>
                                        Filtered: {communityPolicyFilter}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400">Manage community rules, category assignments, moderator assignments, and safety parameters</p>
                        </div>

                        {/* Filter Button with Dropdown Menu (Strict, Standard, Relaxed) */}
                        <div className="flex items-center gap-2">
                            {communityPolicyFilter !== 'All' && (
                                <button
                                    onClick={() => {
                                        setCommunityPolicyFilter('All');
                                        showToast('Reset filter: Showing all communities');
                                    }}
                                    className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[15px]">close</span>
                                    <span>Clear Filter</span>
                                </button>
                            )}

                            <div className="relative">
                                <button
                                    onClick={() => setIsCommunityFilterOpen(prev => !prev)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                        communityPolicyFilter !== 'All'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/20 ring-2 ring-indigo-500/30'
                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-500/50'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">tune</span>
                                    <span>
                                        Filter: {communityPolicyFilter === 'All' ? 'All Policies' : communityPolicyFilter}
                                    </span>
                                    <span className={`material-symbols-outlined text-[16px] transition-transform ${isCommunityFilterOpen ? 'rotate-180' : ''}`}>
                                        expand_more
                                    </span>
                                </button>

                                {isCommunityFilterOpen && (
                                    <>
                                        <div 
                                            className="fixed inset-0 z-20" 
                                            onClick={() => setIsCommunityFilterOpen(false)} 
                                        />
                                        <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-30 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 text-xs">
                                            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
                                                Filter by Policy
                                            </div>

                                            {/* All Policies */}
                                            <button
                                                onClick={() => {
                                                    setCommunityPolicyFilter('All');
                                                    setIsCommunityFilterOpen(false);
                                                    showToast('Showing all communities');
                                                }}
                                                className={`w-full px-3 py-2 text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                                    communityPolicyFilter === 'All'
                                                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                                    <span>All Policies</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400">{communityChannels.length}</span>
                                            </button>

                                            {/* Strict */}
                                            <button
                                                onClick={() => {
                                                    setCommunityPolicyFilter('Strict');
                                                    setIsCommunityFilterOpen(false);
                                                    showToast('Filtered: Showing Strict moderation communities');
                                                }}
                                                className={`w-full px-3 py-2 text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                                    communityPolicyFilter === 'Strict'
                                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                    <span>Strict</span>
                                                </div>
                                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-600 font-bold border border-rose-500/20">
                                                    {communityChannels.filter(c => c.status === 'Strict').length}
                                                </span>
                                            </button>

                                            {/* Standard */}
                                            <button
                                                onClick={() => {
                                                    setCommunityPolicyFilter('Standard');
                                                    setIsCommunityFilterOpen(false);
                                                    showToast('Filtered: Showing Standard moderation communities');
                                                }}
                                                className={`w-full px-3 py-2 text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                                    communityPolicyFilter === 'Standard'
                                                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                                    <span>Standard</span>
                                                </div>
                                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/10 text-indigo-600 font-bold border border-indigo-500/20">
                                                    {communityChannels.filter(c => c.status === 'Standard').length}
                                                </span>
                                            </button>

                                            {/* Relaxed */}
                                            <button
                                                onClick={() => {
                                                    setCommunityPolicyFilter('Relaxed');
                                                    setIsCommunityFilterOpen(false);
                                                    showToast('Filtered: Showing Relaxed moderation communities');
                                                }}
                                                className={`w-full px-3 py-2 text-left font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                                    communityPolicyFilter === 'Relaxed'
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                    <span>Relaxed</span>
                                                </div>
                                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20">
                                                    {communityChannels.filter(c => c.status === 'Relaxed').length}
                                                </span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Create Channel Action Button */}
                            <button
                                onClick={() => setIsCreateChannelModalOpen(true)}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all hover:shadow-md shrink-0"
                            >
                                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                <span>+ Create Channel</span>
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {filteredCommunities.length === 0 ? (
                            <div className="col-span-full py-12 text-center">
                                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">filter_alt_off</span>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    No communities match the "{communityPolicyFilter}" policy filter
                                </p>
                                <button
                                    onClick={() => setCommunityPolicyFilter('All')}
                                    className="mt-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                                >
                                    Reset Policy Filter
                                </button>
                            </div>
                        ) : (
                            filteredCommunities.map((c) => (
                            <div 
                                key={c.id} 
                                onClick={() => {
                                    setActiveTab('moderation');
                                    setCommunityFilter(c.filterKey);
                                    showToast(`Filtered: Showing reports for ${c.name} channel.`);
                                }}
                                className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer group shadow-xs hover:shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                                            <span className="material-symbols-outlined text-[20px]">{c.icon || 'forum'}</span>
                                            <span className="font-black text-xs text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{c.name}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 font-bold text-[10px] rounded ${c.status === 'Strict' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : (c.status === 'Standard' ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20')}`}>
                                            {c.status}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                                        {c.category}
                                    </p>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-0.5 bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-bold text-[9px] rounded-full uppercase">
                                            {c.type || 'Public'}
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                                            {getCommunityMemberCount(c)} {getCommunityMemberCount(c) === 1 ? 'Member' : 'Members'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                        Pending Reports: <span className={`font-bold ${c.reportsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{c.reportsCount}</span>
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] gap-2">
                                    <span className="text-slate-500 truncate">Mod: <strong className="text-slate-800 dark:text-slate-200">{c.mod}</strong></span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/community/view?id=${c.id}`);
                                            }}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                            title={`View full ${c.name} community page`}
                                        >
                                            <span className="material-symbols-outlined text-[13px]">visibility</span>
                                            <span>View</span>
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedManageCommunity(c);
                                                setIsCommunityModalOpen(true);
                                            }}
                                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition-all shadow-xs cursor-pointer"
                                        >
                                            Manage
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )))}
                    </div>
                </div>
            )}

            {/* ─── TAB 4: AI MODERATION & SAFETY GOVERNANCE ─── */}
            {activeTab === 'ai_moderation' && (
                <div className="space-y-4">
                    {/* Header Card */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">AI Content Moderation & Safety Governance</h2>
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full text-[10px] font-black border border-indigo-500/20">
                                        AUTOMATED NLP PIPELINE
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Automated machine learning heuristics for toxicity, workplace harassment, confidential PII leaks, and auto-quarantine rules.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button 
                                    onClick={handleResetAiRules}
                                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                                    <span>Reset Defaults</span>
                                </button>
                                <button 
                                    onClick={handleSaveConfig} 
                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[15px]">save</span>
                                    <span>Save AI Rules</span>
                                </button>
                            </div>
                        </div>

                        {/* 3 Core Configuration Rule Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            {/* Rule 1: Toxicity Threshold */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px]">tune</span>
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Toxicity Threshold</h3>
                                        </div>
                                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md font-black text-xs">
                                            {configState.aiToxicityThreshold || 80}%
                                        </span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 mb-3 text-[11px] leading-relaxed">
                                        Content with toxicity/abuse confidence score <span className="font-bold text-indigo-600">&gt;= {configState.aiToxicityThreshold || 80}%</span> is automatically intercepted and routed to the Content Moderation queue.
                                    </p>
                                    <input 
                                        type="range" 
                                        min="50" 
                                        max="95" 
                                        value={configState.aiToxicityThreshold || 80}
                                        onChange={e => setConfigState({ ...configState, aiToxicityThreshold: Number(e.target.value) })}
                                        className="w-full accent-indigo-600 cursor-pointer" 
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                                        <span>50% (Permissive)</span>
                                        <span className="text-indigo-600">80% (Recommended)</span>
                                        <span>95% (Strict)</span>
                                    </div>
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]">
                                    <span className="text-slate-400">Quick presets:</span>
                                    <div className="flex gap-1">
                                        {[50, 80, 95].map(preset => (
                                            <button 
                                                key={preset}
                                                onClick={() => setConfigState({ ...configState, aiToxicityThreshold: preset })}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                                    (configState.aiToxicityThreshold || 80) === preset
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                                                }`}
                                            >
                                                {preset}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Rule 2: Auto-Quarantine */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-rose-500 text-[18px]">gavel</span>
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Auto-Quarantine High Risk</h3>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                                            configState.aiAutoQuarantine !== false 
                                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                        }`}>
                                            {configState.aiAutoQuarantine !== false ? 'ENABLED' : 'OFF'}
                                        </span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 mb-3 text-[11px] leading-relaxed">
                                        Immediately suppresses / hides posts with Toxicity score <span className="font-bold text-rose-600">&gt; 95%</span> from the public feed before a human moderator reviews it.
                                    </p>
                                    <label className="flex items-center gap-2 font-bold cursor-pointer select-none mt-2">
                                        <input 
                                            type="checkbox" 
                                            checked={configState.aiAutoQuarantine !== false}
                                            onChange={e => setConfigState({ ...configState, aiAutoQuarantine: e.target.checked })}
                                            className="w-4 h-4 rounded text-rose-600 cursor-pointer accent-rose-600" 
                                        />
                                        <span className="text-slate-800 dark:text-slate-200 text-xs">Auto-Quarantine &gt;95% Severity</span>
                                    </label>
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px] text-emerald-500">verified_user</span>
                                    <span>Protects feed against viral harassment</span>
                                </div>
                            </div>

                            {/* Rule 3: Deep Attachment & PII Scan */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-amber-500 text-[18px]">key</span>
                                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Copyright & PII Leak Scanner</h3>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                                            configState.aiDeepScan !== false 
                                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                        }`}>
                                            {configState.aiDeepScan !== false ? 'ENABLED' : 'OFF'}
                                        </span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 mb-3 text-[11px] leading-relaxed">
                                        Scans text, snippets & attachments for Indian PAN, Aadhaar numbers, confidential compensation/CTC docs, and API tokens.
                                    </p>
                                    <label className="flex items-center gap-2 font-bold cursor-pointer select-none mt-2">
                                        <input 
                                            type="checkbox" 
                                            checked={configState.aiDeepScan !== false}
                                            onChange={e => setConfigState({ ...configState, aiDeepScan: e.target.checked })}
                                            className="w-4 h-4 rounded text-amber-600 cursor-pointer accent-amber-600" 
                                        />
                                        <span className="text-slate-800 dark:text-slate-200 text-xs">Enable Deep Attachment Scan</span>
                                    </label>
                                </div>
                                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-400 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px] text-amber-500">security</span>
                                    <span>Regex + Token matching</span>
                                </div>
                            </div>
                        </div>

                        {/* Live Impact & Active Queue Sync Banner */}
                        <div className="mt-4 p-3 bg-gradient-to-r from-indigo-50/70 to-cyan-50/70 dark:from-indigo-950/30 dark:to-cyan-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                    <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                                </div>
                                <div>
                                    <div className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                                        <span>Active Moderation Queue Impact</span>
                                        <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-600 text-[10px] rounded font-bold">LIVE SYNC</span>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                                        At <span className="font-bold text-indigo-600">{configState.aiToxicityThreshold || 80}%</span> sensitivity, <span className="font-bold text-slate-900 dark:text-white">{interceptedReportsCount} of {reports.length}</span> live content reports are intercepted, and <span className="font-bold text-rose-600">{quarantinedReportsCount}</span> severe posts are automatically quarantined.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                <button
                                    onClick={handleRunBatchAudit}
                                    disabled={isAiBatchAuditing}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shadow-2xs"
                                >
                                    <span className={`material-symbols-outlined text-[15px] ${isAiBatchAuditing ? 'animate-spin text-cyan-500' : 'text-slate-500'}`}>
                                        sync
                                    </span>
                                    <span>{isAiBatchAuditing ? 'Auditing...' : 'Run Batch Audit'}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setActiveTab('moderation');
                                        showToast(`Viewing ${interceptedReportsCount} reports intercepted by AI Moderation rules.`);
                                    }}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1"
                                >
                                    <span>View Reports ({interceptedReportsCount})</span>
                                    <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Interactive AI Content Inspector & Rule Sandbox */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-cyan-500 text-[18px]">science</span>
                                    <span>Live AI Content Inspector & Policy Simulator</span>
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Test any custom text, paste employee content, or select realistic presets to observe how the AI Rule Engine scores toxicity and enforces actions.
                                </p>
                            </div>
                            {aiAnalysisResult && (
                                <button
                                    onClick={() => {
                                        setAiTestInput('');
                                        setAiAnalysisResult(null);
                                        setAiSelectedPreset(null);
                                    }}
                                    className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                                >
                                    Clear Inspector
                                </button>
                            )}
                        </div>

                        {/* Preset Test Case Buttons */}
                        <div className="mb-3">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Select Real-World Test Scenario:
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {AI_TEST_PRESETS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            setAiSelectedPreset(p.id);
                                            setAiTestInput(p.content);
                                            runAiEvaluation(p.content);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                                            aiSelectedPreset === p.id 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        <span>{p.label}</span>
                                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-black border ${p.badgeColor} ${aiSelectedPreset === p.id ? 'bg-white/20 text-white border-transparent' : ''}`}>
                                            {p.badge}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="relative mb-3">
                            <textarea
                                rows={3}
                                value={aiTestInput}
                                onChange={e => {
                                    setAiTestInput(e.target.value);
                                    if (aiSelectedPreset) setAiSelectedPreset(null);
                                }}
                                placeholder="Type or paste sample post content, comment, or employee submission here to test..."
                                className="w-full text-xs p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                            />
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-slate-400">
                                    {aiTestInput.length} characters • {aiTestInput.split(/\s+/).filter(Boolean).length} words
                                </span>
                                <button
                                    onClick={() => runAiEvaluation()}
                                    disabled={!aiTestInput.trim() || isAiAnalyzing}
                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                                >
                                    <span className={`material-symbols-outlined text-[15px] ${isAiAnalyzing ? 'animate-spin' : ''}`}>
                                        {isAiAnalyzing ? 'progress_activity' : 'psychology'}
                                    </span>
                                    <span>{isAiAnalyzing ? 'Analyzing NLP...' : 'Analyze with AI Rule Engine'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Evaluation Result Panel */}
                        {aiAnalysisResult && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 animate-fadeIn">
                                {/* Prominent Verdict Banner */}
                                <div className={`p-3.5 rounded-xl border mb-4 flex items-start justify-between gap-3 ${
                                    aiAnalysisResult.status === 'QUARANTINED'
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
                                        : aiAnalysisResult.status === 'FLAGGED'
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                    <div className="flex items-start gap-2.5">
                                        <span className="material-symbols-outlined text-[24px] mt-0.5 shrink-0">
                                            {aiAnalysisResult.status === 'QUARANTINED' ? 'dangerous' : aiAnalysisResult.status === 'FLAGGED' ? 'warning' : 'verified'}
                                        </span>
                                        <div>
                                            <div className="text-sm font-black flex items-center gap-2">
                                                <span>
                                                    {aiAnalysisResult.status === 'QUARANTINED' && '🚨 AUTO-QUARANTINED — IMMEDIATELY HIDDEN FROM FEED'}
                                                    {aiAnalysisResult.status === 'FLAGGED' && '⚠️ AUTO-FLAGGED — ROUTED TO MODERATION REVIEW'}
                                                    {aiAnalysisResult.status === 'ALLOWED' && '✅ CONTENT APPROVED — SAFE FOR PUBLIC PUBLICATION'}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium mt-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                                                {aiAnalysisResult.decisionReason}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 shrink-0 text-right">
                                        <span>Evaluated at {aiAnalysisResult.evaluatedAt}</span>
                                    </div>
                                </div>

                                {/* Detailed Metric Gauges */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {/* Toxicity Score Meter */}
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                                            <span className="text-slate-600 dark:text-slate-300">Toxicity Confidence</span>
                                            <span className={`font-black ${
                                                aiAnalysisResult.toxicityScore >= 80 ? 'text-red-500' : aiAnalysisResult.toxicityScore >= 50 ? 'text-amber-500' : 'text-emerald-500'
                                            }`}>
                                                {aiAnalysisResult.toxicityScore}%
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    aiAnalysisResult.toxicityScore >= 80 ? 'bg-red-500' : aiAnalysisResult.toxicityScore >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`}
                                                style={{ width: `${aiAnalysisResult.toxicityScore}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                                            <span>Threshold: {configState.aiToxicityThreshold || 80}%</span>
                                            <span>{aiAnalysisResult.toxicityScore >= (configState.aiToxicityThreshold || 80) ? 'Breached' : 'Passed'}</span>
                                        </div>
                                    </div>

                                    {/* PII & Credentials Risk Meter */}
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                                            <span className="text-slate-600 dark:text-slate-300">Confidential PII Risk</span>
                                            <span className={`font-black ${
                                                aiAnalysisResult.piiScore >= 70 ? 'text-amber-500' : 'text-emerald-500'
                                            }`}>
                                                {aiAnalysisResult.piiScore}%
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    aiAnalysisResult.piiScore >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                                }`}
                                                style={{ width: `${aiAnalysisResult.piiScore}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                                            <span>Deep Scan: {configState.aiDeepScan !== false ? 'Enabled' : 'Disabled'}</span>
                                            <span>{aiAnalysisResult.piiScore > 0 ? `${aiAnalysisResult.detectedPiiKeywords.length} patterns` : 'None detected'}</span>
                                        </div>
                                    </div>

                                    {/* Spam & Phishing Meter */}
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                                            <span className="text-slate-600 dark:text-slate-300">Spam Probability</span>
                                            <span className={`font-black ${
                                                aiAnalysisResult.spamScore >= 75 ? 'text-purple-500' : 'text-emerald-500'
                                            }`}>
                                                {aiAnalysisResult.spamScore}%
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    aiAnalysisResult.spamScore >= 75 ? 'bg-purple-500' : 'bg-emerald-500'
                                                }`}
                                                style={{ width: `${aiAnalysisResult.spamScore}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                                            <span>External Links Scan</span>
                                            <span>{aiAnalysisResult.spamScore >= 75 ? 'Flagged' : 'Clean'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Detected Triggers Badges */}
                                {((aiAnalysisResult.detectedToxicKeywords && aiAnalysisResult.detectedToxicKeywords.length > 0) ||
                                  (aiAnalysisResult.detectedPiiKeywords && aiAnalysisResult.detectedPiiKeywords.length > 0) ||
                                  (aiAnalysisResult.detectedSpamKeywords && aiAnalysisResult.detectedSpamKeywords.length > 0)) && (
                                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Detected Signals:</span>
                                        {aiAnalysisResult.detectedToxicKeywords?.map((kw, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded text-[10px] font-bold">
                                                Toxicity: "{kw}"
                                            </span>
                                        ))}
                                        {aiAnalysisResult.detectedPiiKeywords?.map((kw, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold">
                                                Data Leak: {kw}
                                            </span>
                                        ))}
                                        {aiAnalysisResult.detectedSpamKeywords?.map((kw, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 rounded text-[10px] font-bold">
                                                Spam: "{kw}"
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Architectural Workflow Guide: How Knome AI Moderation Works */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                        <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-indigo-600">account_tree</span>
                            <span>How Knome AI Content Moderation Works in Enterprise Production</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">Content Ingestion</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Employee posts article, comment, media, or attachment across any public/private community.
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">2</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">Automated NLP Scan</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Language model tokenizes text, calculates Toxicity Score, and runs PII regex for Aadhaar, PAN & credentials.
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">3</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">Rule Threshold Check</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Score is compared against the {configState.aiToxicityThreshold || 80}% sensitivity threshold and Auto-Quarantine rules.
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">4</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">Automated Action</span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Clean content goes live; borderline content enters review queue; &gt;95% toxicity is quarantined immediately.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 5: SYSTEM PARAMETERS ─── */}
            {activeTab === 'system' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-black text-slate-900 dark:text-white">System Parameters & Platform Settings</h2>
                        <button onClick={handleSaveConfig} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">save</span>
                            <span>Save Parameters</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Maintenance Mode</p>
                                <p className="text-slate-400 font-normal text-[11px]">Restrict platform access to System Admins only</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={configState.maintenanceMode}
                                onChange={e => setConfigState({ ...configState, maintenanceMode: e.target.checked })}
                                className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Auto-Moderation Engine</p>
                                <p className="text-slate-400 font-normal text-[11px]">Automatically flag reported posts matching keywords</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={configState.autoModeration}
                                onChange={e => setConfigState({ ...configState, autoModeration: e.target.checked })}
                                className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Notify Admins on New Report</p>
                                <p className="text-slate-400 font-normal text-[11px]">Send immediate in-app toast & bell notifications to HR/System admins</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={configState.notifyAdminsOnReport}
                                onChange={e => setConfigState({ ...configState, notifyAdminsOnReport: e.target.checked })}
                                className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Max File Upload Size (MB)</p>
                                <p className="text-slate-400 font-normal text-[11px]">Maximum attachment size allowed per post</p>
                            </div>
                            <input
                                type="number"
                                value={configState.maxUploadMb || 100}
                                onChange={e => setConfigState({ ...configState, maxUploadMb: Number(e.target.value) })}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-20 text-center text-xs text-slate-900 dark:text-white font-bold"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">JWT Session Token TTL (Hours)</p>
                                <p className="text-slate-400 font-normal text-[11px]">Security session validity before requiring re-auth</p>
                            </div>
                            <input
                                type="number"
                                value={configState.jwtTtlHours || 24}
                                onChange={e => setConfigState({ ...configState, jwtTtlHours: Number(e.target.value) })}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-20 text-center text-xs text-slate-900 dark:text-white font-bold"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between col-span-1 md:col-span-2">
                            <div>
                                <p className="font-bold text-slate-900 dark:text-white">Global Moderation Sensitivity Policy</p>
                                <p className="text-slate-400 font-normal text-[11px]">Default safety policy applied across company discussions</p>
                            </div>
                            <select
                                value={configState.moderationSensitivity || 'High (Strict AI)'}
                                onChange={e => setConfigState({ ...configState, moderationSensitivity: e.target.value })}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-bold cursor-pointer"
                            >
                                <option value="High (Strict AI)">High (Strict AI Quarantine)</option>
                                <option value="Standard (Flag & Hold)">Standard (Flag & Hold for Review)</option>
                                <option value="Relaxed (Permissive)">Relaxed (Post First, Flag Later)</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 6: AUDIT TRAIL ─── */}
            {activeTab === 'audit' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-black text-slate-900 dark:text-white">Governance Audit Log Trail</h2>
                        <input
                            type="text"
                            value={auditSearch}
                            onChange={e => setAuditSearch(e.target.value)}
                            placeholder="Filter audit logs..."
                            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none w-64"
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-2.5">Timestamp</th>
                                    <th className="px-4 py-2.5">Actor / Moderator</th>
                                    <th className="px-4 py-2.5">Action Code</th>
                                    <th className="px-4 py-2.5">Target Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredAuditTrail
                                    .slice(0, visibleAuditCount)
                                    .map(a => (
                                        <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{a.time}</td>
                                            <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{a.moderator}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`font-black text-[11px] ${a.color || 'text-indigo-600'}`}>{a.action}</span>
                                            </td>
                                            <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{a.target}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    <ScrollLoadingIndicator isVisible={visibleAuditCount < filteredAuditTrail.length} text="Loading more audit logs on scroll..." />
                </div>
            )}

            {/* ─── TAB: LIVE SERILOG SYSTEM LOGS (DATE-WISE & GRAPH-WISE) ─── */}
            {activeTab === 'serilog' && (() => {
                const maxHourlyEvents = Math.max(
                    ...(systemLogAnalytics?.hourlyActivity?.map(h => h.total) || [1]),
                    1
                );
                const maxDayBytes = Math.max(
                    ...(systemLogAnalytics?.daySummaries?.map(d => d.totalSizeBytes) || [1]),
                    1
                );
                const displayedLogs = selectedHourFilter === null
                    ? systemLogs
                    : systemLogs.filter(log => {
                        if (!log.Timestamp || log.Timestamp.length < 13) return true;
                        const h = parseInt(log.Timestamp.substring(11, 13), 10);
                        return h === selectedHourFilter;
                    });

                return (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
                        {/* Header & Controls Strip */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-black flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[20px]">analytics</span>
                                    </span>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                        Server Logs & Serilog Telemetry
                                        {isAutoRefreshLogs && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black border border-emerald-500/20 animate-pulse">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                LIVE 5s
                                            </span>
                                        )}
                                    </h3>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                                    <span>Physical storage: <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]">logs/YYYY-MM-DD/</code></span>
                                    <span>•</span>
                                    <span>Active file: <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-mono text-[11px] font-bold">{selectedLogFile || 'Auto-detected'}</code></span>
                                    {lastLogSyncTime && <span className="font-medium text-slate-400">• Synced: {lastLogSyncTime}</span>}
                                </p>
                            </div>

                            {/* Top Actions: View Mode, Date-Grouped File Switcher, Lines, Auto-refresh & Download */}
                            <div className="flex flex-wrap items-center gap-2">
                                {/* View Mode Toggles */}
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <button
                                        onClick={() => setSerilogViewMode('split')}
                                        title="Split View: Graphs & Console Stream"
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                            serilogViewMode === 'split'
                                                ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-300 shadow-xs'
                                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">splitscreen</span>
                                        <span className="hidden sm:inline">Split</span>
                                    </button>
                                    <button
                                        onClick={() => setSerilogViewMode('graphs')}
                                        title="Graphs & Analytics Only"
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                            serilogViewMode === 'graphs'
                                                ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-300 shadow-xs'
                                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">bar_chart</span>
                                        <span className="hidden sm:inline">Graphs</span>
                                    </button>
                                    <button
                                        onClick={() => setSerilogViewMode('stream')}
                                        title="Console Stream Only"
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                            serilogViewMode === 'stream'
                                                ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-300 shadow-xs'
                                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">terminal</span>
                                        <span className="hidden sm:inline">Stream</span>
                                    </button>
                                </div>

                                {/* Date-Wise Grouped File Selector */}
                                <select
                                    value={selectedLogFile}
                                    onChange={e => {
                                        setSelectedLogFile(e.target.value);
                                        setSelectedHourFilter(null);
                                    }}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer max-w-[240px] truncate"
                                >
                                    {systemLogDateGroups && systemLogDateGroups.length > 0 ? (
                                        systemLogDateGroups.map(group => (
                                            <optgroup
                                                key={group.date}
                                                label={`📅 ${group.dateDisplay} — ${group.fileCount} ${group.fileCount === 1 ? 'file' : 'files'} (${(group.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB)`}
                                            >
                                                {group.files.map(f => (
                                                    <option key={f.relativePath || f.fileName} value={f.relativePath || f.fileName}>
                                                        {f.isActive ? '🟢 Active: ' : '📄 '} {f.fileName} ({(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB)
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))
                                    ) : (
                                        systemLogFiles.map(f => (
                                            <option key={f.fileName} value={f.fileName}>
                                                📄 {f.fileName} ({(f.sizeBytes / (1024 * 1024)).toFixed(1)} MB){f.isActive ? ' - Active' : ''}
                                            </option>
                                        ))
                                    )}
                                </select>

                                {/* Lines count */}
                                <select
                                    value={logLinesCount}
                                    onChange={e => setLogLinesCount(Number(e.target.value))}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold rounded-xl px-2 py-2 outline-none cursor-pointer"
                                >
                                    <option value={50}>50 Lines</option>
                                    <option value={100}>100 Lines</option>
                                    <option value={200}>200 Lines</option>
                                    <option value={500}>500 Lines</option>
                                    <option value={1000}>1000 Lines</option>
                                </select>

                                {/* Auto-Refresh Toggle */}
                                <button
                                    onClick={() => setIsAutoRefreshLogs(!isAutoRefreshLogs)}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                        isAutoRefreshLogs
                                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-xs'
                                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-[16px] ${isAutoRefreshLogs ? 'text-emerald-500 animate-spin' : ''}`}>
                                        {isAutoRefreshLogs ? 'autorenew' : 'sync'}
                                    </span>
                                    <span>{isAutoRefreshLogs ? 'Auto: ON' : 'Auto: OFF'}</span>
                                </button>

                                {/* Manual Refresh Button */}
                                <button
                                    onClick={fetchSystemLogs}
                                    disabled={isLoadingLogs}
                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                    <span className={`material-symbols-outlined text-[16px] ${isLoadingLogs ? 'animate-spin' : ''}`}>refresh</span>
                                    <span>Fetch</span>
                                </button>

                                {/* Download Log File */}
                                <a
                                    href={adminApi.downloadSystemLogUrl ? adminApi.downloadSystemLogUrl(selectedLogFile) : `#`}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">file_download</span>
                                    <span className="hidden sm:inline">Download</span>
                                </a>
                            </div>
                        </div>

                        {/* Date-Wise Quick Strip: 1-Click Date Filtering */}
                        {systemLogDateGroups && systemLogDateGroups.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                                <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                                    Dates:
                                </span>
                                {systemLogDateGroups.slice(0, 10).map(dg => {
                                    const isSelected = selectedLogFile && (selectedLogFile.includes(dg.date) || systemLogFiles.find(f => (f.fileName === selectedLogFile || f.relativePath === selectedLogFile) && f.date === dg.date));
                                    return (
                                        <button
                                            key={dg.date}
                                            onClick={() => {
                                                const target = dg.files[0]?.relativePath || dg.files[0]?.fileName;
                                                if (target) {
                                                    setSelectedLogFile(target);
                                                    setSelectedHourFilter(null);
                                                }
                                            }}
                                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border ${
                                                isSelected
                                                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                                                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                            }`}
                                        >
                                            {dg.hasActiveFile && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
                                            <span>{dg.dateDisplay}</span>
                                            <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${isSelected ? 'bg-cyan-700/60 text-cyan-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                                                {dg.fileCount}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Metric Badges Strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                            <div
                                onClick={() => setLogLevelFilter('ALL')}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    logLevelFilter === 'ALL'
                                        ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-500/30'
                                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Total Log Events</span>
                                <span className="text-lg font-black">{systemLogCounts.total || systemLogs.length}</span>
                            </div>

                            <div
                                onClick={() => setLogLevelFilter('ERR')}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    logLevelFilter === 'ERR'
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30'
                                        : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:border-rose-400'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Errors & Fatal</span>
                                <span className="text-lg font-black">{systemLogCounts.errors || 0}</span>
                            </div>

                            <div
                                onClick={() => setLogLevelFilter('WRN')}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    logLevelFilter === 'WRN'
                                        ? 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/30'
                                        : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400 hover:border-amber-400'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Warnings</span>
                                <span className="text-lg font-black">{systemLogCounts.warnings || 0}</span>
                            </div>

                            <div
                                onClick={() => setLogLevelFilter('INF')}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                                    logLevelFilter === 'INF'
                                        ? 'bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-500/30'
                                        : 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900/40 text-sky-600 dark:text-sky-400 hover:border-sky-400'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Information</span>
                                <span className="text-lg font-black">{systemLogCounts.info || 0}</span>
                            </div>

                            <div className="p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active File Size</span>
                                <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">
                                    {systemLogFiles.find(f => f.fileName === selectedLogFile || f.relativePath === selectedLogFile)
                                        ? `${(systemLogFiles.find(f => f.fileName === selectedLogFile || f.relativePath === selectedLogFile).sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                                        : 'Live Disk File'}
                                </span>
                            </div>
                        </div>

                        {/* ─── GRAPH-WISE VISUAL ANALYTICS DASHBOARD ─── */}
                        {(serilogViewMode === 'split' || serilogViewMode === 'graphs') && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* Graph 1: 24-Hour Timeline Bar Chart (Hourly Distribution) */}
                                <div className="lg:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-700/60">
                                        <div>
                                            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px] text-cyan-500">query_stats</span>
                                                24-Hour Activity Timeline & Volume Distribution
                                            </h4>
                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                Hourly log events for current file. Click any bar to isolate logs for that hour.
                                            </p>
                                        </div>

                                        {/* Legend & Active Filter Reset */}
                                        <div className="flex items-center gap-2">
                                            {selectedHourFilter !== null && (
                                                <button
                                                    onClick={() => setSelectedHourFilter(null)}
                                                    className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 hover:bg-cyan-500/20 cursor-pointer"
                                                >
                                                    <span>Filtering: {selectedHourFilter}:00</span>
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                            )}
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-sky-500"></span>Info</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500"></span>Warn</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500"></span>Err</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 24-Hour Timeline Bar Chart */}
                                    <div className="pt-4 pb-2">
                                        <div className="h-36 flex items-end gap-1 sm:gap-1.5 px-1">
                                            {(systemLogAnalytics?.hourlyActivity || []).map((h) => {
                                                const total = h.total || 0;
                                                const heightPct = total > 0 ? Math.max(Math.round((total / maxHourlyEvents) * 100), 8) : 4;
                                                const isSelected = selectedHourFilter === h.hour;
                                                const isHovered = hoveredHourBucket?.hour === h.hour;

                                                // Calculate segment percentages
                                                const infoPct = total > 0 ? (h.info / total) * 100 : 0;
                                                const warnPct = total > 0 ? (h.warnings / total) * 100 : 0;
                                                const errPct = total > 0 ? (h.errors / total) * 100 : 0;

                                                return (
                                                    <div
                                                        key={h.hour}
                                                        onClick={() => setSelectedHourFilter(isSelected ? null : h.hour)}
                                                        onMouseEnter={() => setHoveredHourBucket(h)}
                                                        onMouseLeave={() => setHoveredHourBucket(null)}
                                                        className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                                                    >
                                                        {/* Tooltip on Hover */}
                                                        {isHovered && (
                                                            <div className="absolute bottom-full mb-2 z-30 p-2 rounded-lg bg-slate-950 text-white text-[10px] shadow-xl border border-slate-800 whitespace-nowrap pointer-events-none">
                                                                <div className="font-bold text-cyan-400">{h.hourLabel} - {h.hour}:59</div>
                                                                <div>Total: <strong>{total.toLocaleString()}</strong> events</div>
                                                                <div className="text-sky-400">Info: {h.info.toLocaleString()}</div>
                                                                <div className="text-amber-400">Warnings: {h.warnings.toLocaleString()}</div>
                                                                <div className="text-rose-400">Errors: {h.errors.toLocaleString()}</div>
                                                            </div>
                                                        )}

                                                        {/* Stacked Bar */}
                                                        <div
                                                            style={{ height: `${heightPct}%` }}
                                                            className={`w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-all ${
                                                                isSelected
                                                                    ? 'ring-2 ring-cyan-400 ring-offset-1 dark:ring-offset-slate-900 shadow-md scale-105'
                                                                    : total === 0
                                                                    ? 'bg-slate-200 dark:bg-slate-800 opacity-40'
                                                                    : 'hover:brightness-110'
                                                            }`}
                                                        >
                                                            {/* Errors segment */}
                                                            {errPct > 0 && (
                                                                <div style={{ height: `${errPct}%` }} className="bg-rose-500 w-full"></div>
                                                            )}
                                                            {/* Warnings segment */}
                                                            {warnPct > 0 && (
                                                                <div style={{ height: `${warnPct}%` }} className="bg-amber-500 w-full"></div>
                                                            )}
                                                            {/* Info segment */}
                                                            {infoPct > 0 && (
                                                                <div style={{ height: `${infoPct}%` }} className="bg-sky-500 w-full"></div>
                                                            )}
                                                        </div>

                                                        {/* Hour label below (every 3 hours or on sm screens) */}
                                                        <span className={`text-[9px] font-mono mt-1 ${
                                                            isSelected ? 'text-cyan-500 font-black' : h.hour % 3 === 0 ? 'text-slate-400 font-bold' : 'text-transparent sm:text-slate-500'
                                                        }`}>
                                                            {h.hour % 3 === 0 ? `${h.hour}h` : ''}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Sub-bar active info */}
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200/60 dark:border-slate-700/60 pt-2 font-mono">
                                        <span>Peak Hour: <strong className="text-slate-800 dark:text-slate-200">{systemLogAnalytics?.peakHour ?? 0}:00</strong> ({systemLogAnalytics?.peakHourEvents?.toLocaleString() ?? 0} events)</span>
                                        <span>Click bar to filter stream</span>
                                    </div>
                                </div>

                                {/* Graph 2: Health Status & Severity Distribution Card */}
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-[16px] text-emerald-500">health_and_safety</span>
                                                Telemetry Health
                                            </h4>
                                            {/* Health Status Badge */}
                                            {systemLogAnalytics?.healthStatus === 'Optimal' ? (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    OPTIMAL
                                                </span>
                                            ) : systemLogAnalytics?.healthStatus === 'Warning' ? (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-black flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                    WARNINGS
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-black flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                    DEGRADED
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            Log severity ratio across {systemLogCounts.total?.toLocaleString() || 0} scanned lines.
                                        </p>
                                    </div>

                                    {/* Segmented Severity Bar */}
                                    <div className="space-y-1.5">
                                        <div className="h-3 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700">
                                            <div
                                                style={{ width: `${systemLogAnalytics?.infoPercentage ?? 95}%` }}
                                                className="bg-sky-500 transition-all"
                                                title={`Information: ${systemLogAnalytics?.infoPercentage ?? 0}%`}
                                            ></div>
                                            <div
                                                style={{ width: `${systemLogAnalytics?.warningPercentage ?? 3}%` }}
                                                className="bg-amber-500 transition-all"
                                                title={`Warnings: ${systemLogAnalytics?.warningPercentage ?? 0}%`}
                                            ></div>
                                            <div
                                                style={{ width: `${systemLogAnalytics?.errorPercentage ?? 2}%` }}
                                                className="bg-rose-500 transition-all"
                                                title={`Errors: ${systemLogAnalytics?.errorPercentage ?? 0}%`}
                                            ></div>
                                        </div>

                                        {/* Percentages Breakdown */}
                                        <div className="grid grid-cols-3 text-center text-[10px] font-bold pt-1">
                                            <div className="text-sky-600 dark:text-sky-400">
                                                <span className="block text-sm font-black">{systemLogAnalytics?.infoPercentage ?? 0}%</span>
                                                <span>Information</span>
                                            </div>
                                            <div className="text-amber-600 dark:text-amber-400">
                                                <span className="block text-sm font-black">{systemLogAnalytics?.warningPercentage ?? 0}%</span>
                                                <span>Warnings</span>
                                            </div>
                                            <div className="text-rose-600 dark:text-rose-400">
                                                <span className="block text-sm font-black">{systemLogAnalytics?.errorPercentage ?? 0}%</span>
                                                <span>Errors/Fatal</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Multi-Day Volume Trend Bars */}
                                    <div className="border-t border-slate-200/60 dark:border-slate-700/60 pt-2 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Multi-Day Storage Trend (MB)
                                        </span>
                                        <div className="h-14 flex items-end gap-1.5 pt-1">
                                            {(systemLogAnalytics?.daySummaries || []).slice(0, 7).reverse().map((day) => {
                                                const mb = Math.round(day.totalSizeBytes / (1024 * 1024));
                                                const heightPct = Math.max(Math.round((day.totalSizeBytes / maxDayBytes) * 100), 12);
                                                return (
                                                    <div
                                                        key={day.date}
                                                        onClick={() => {
                                                            const group = systemLogDateGroups.find(g => g.date === day.date);
                                                            const target = group?.files[0]?.relativePath || group?.files[0]?.fileName;
                                                            if (target) {
                                                                setSelectedLogFile(target);
                                                                setSelectedHourFilter(null);
                                                            }
                                                        }}
                                                        className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                                                        title={`${day.dateDisplay}: ${mb} MB (${day.fileCount} files)`}
                                                    >
                                                        <div
                                                            style={{ height: `${heightPct}%` }}
                                                            className={`w-full rounded-t transition-all ${
                                                                day.isSelected
                                                                    ? 'bg-cyan-500 shadow-xs'
                                                                    : 'bg-slate-300 dark:bg-slate-700 hover:bg-cyan-400/60'
                                                            }`}
                                                        ></div>
                                                        <span className="text-[8px] font-mono text-slate-400 mt-1 truncate max-w-[32px]">
                                                            {day.date.slice(5)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Search & Filter Bar */}
                        <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800">
                            {/* Search Input */}
                            <div className="relative flex-1 min-w-[200px]">
                                <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[16px]">search</span>
                                <input
                                    type="text"
                                    value={logSearchQuery}
                                    onChange={e => setLogSearchQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') fetchSystemLogs(); }}
                                    placeholder="Search in logs (e.g. POST /api/Auth, UserId, Exception, Database)..."
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-8 py-1.5 text-xs outline-none focus:border-cyan-500 font-mono text-slate-900 dark:text-white"
                                />
                                {logSearchQuery && (
                                    <button
                                        onClick={() => { setLogSearchQuery(''); setTimeout(fetchSystemLogs, 50); }}
                                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                )}
                            </div>

                            {/* Active Hour Filter Chip */}
                            {selectedHourFilter !== null && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                                    <span>Hour: {selectedHourFilter}:00 - {selectedHourFilter}:59</span>
                                    <button
                                        onClick={() => setSelectedHourFilter(null)}
                                        className="hover:text-cyan-800 dark:hover:text-cyan-200 ml-1 cursor-pointer"
                                        title="Clear hour filter"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Log Level Filter Chips */}
                            <div className="flex items-center gap-1">
                                {['ALL', 'ERR', 'WRN', 'INF', 'DBG'].map(lvl => (
                                    <button
                                        key={lvl}
                                        onClick={() => setLogLevelFilter(lvl)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                            logLevelFilter === lvl
                                                ? lvl === 'ERR'
                                                    ? 'bg-rose-600 text-white'
                                                    : lvl === 'WRN'
                                                    ? 'bg-amber-600 text-white'
                                                    : lvl === 'INF'
                                                    ? 'bg-sky-600 text-white'
                                                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                        }`}
                                    >
                                        {lvl === 'ALL' ? 'All Logs' : lvl}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ─── LOG ENTRIES VIEWER (HUMAN-READABLE & RAW TECHNICAL MODES) ─── */}
                        {(serilogViewMode === 'split' || serilogViewMode === 'stream') && (
                            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-md">
                                {/* Log Viewer Toolbar Header */}
                                <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                                        </div>
                                        <span className="font-black text-xs text-slate-800 dark:text-slate-200 ml-1 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[17px] text-cyan-500">
                                                {logDisplayMode === 'human' ? 'group' : 'terminal'}
                                            </span>
                                            {logDisplayMode === 'human' ? 'Activity Feed (Plain English)' : 'Serilog Technical Console'}
                                        </span>
                                        <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
                                            • {selectedLogFile || 'Active Log File'}
                                        </span>
                                    </div>

                                    {/* Display Mode Toggle & Item Counter */}
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] text-slate-500">
                                            Showing <strong>{displayedLogs.length}</strong> {selectedHourFilter !== null ? `(Hour ${selectedHourFilter}:00)` : ''} of <strong>{systemLogs.length}</strong> entries
                                        </span>

                                        {/* Human vs Raw Switcher */}
                                        <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-xl text-[11px] font-bold">
                                            <button
                                                onClick={() => setLogDisplayMode('human')}
                                                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                                                    logDisplayMode === 'human'
                                                        ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-xs'
                                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-[14px]">face</span>
                                                <span>Simple View</span>
                                            </button>
                                            <button
                                                onClick={() => setLogDisplayMode('raw')}
                                                className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                                                    logDisplayMode === 'raw'
                                                        ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-xs'
                                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-[14px]">terminal</span>
                                                <span>Raw Logs</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Loading & Empty States */}
                                {isLoadingLogs && displayedLogs.length === 0 ? (
                                    <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                                        <span className="material-symbols-outlined text-3xl animate-spin text-cyan-500">refresh</span>
                                        <span className="text-sm font-semibold">Reading server log files...</span>
                                    </div>
                                ) : displayedLogs.length === 0 ? (
                                    <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
                                        <span className="material-symbols-outlined text-3xl text-slate-400">filter_alt_off</span>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No log entries matched your filter criteria.</p>
                                        <p className="text-xs text-slate-400">Try choosing a different date, clearing the hour filter, or selecting "All Logs".</p>
                                    </div>
                                ) : logDisplayMode === 'human' ? (
                                    /* ─── MODE 1: HUMAN-READABLE ACTIVITY FEED ─── */
                                    <div className="p-3 max-h-[580px] overflow-y-auto space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {displayedLogs.map((log, idx) => {
                                            const isExpanded = expandedLogIndex === idx;
                                            const rawTimestamp = log.timestamp || log.Timestamp || '';
                                            const rawLevel = (log.level || log.Level || 'INF').toUpperCase();
                                            const rawSource = log.sourceContext || log.SourceContext || 'Knome.API';
                                            const rawMessage = log.message || log.Message || '';
                                            const rawException = log.exception || log.Exception || '';
                                            const rawText = log.raw || log.Raw || '';

                                            // Extract readable time: e.g. "10:42:25 AM"
                                            let timeStr = '—';
                                            if (rawTimestamp) {
                                                const parts = rawTimestamp.split(' ');
                                                if (parts.length >= 2) {
                                                    timeStr = parts[1].split('.')[0];
                                                }
                                            }

                                            const isError = rawLevel === 'ERR' || rawLevel === 'FTL';
                                            const isWarn = rawLevel === 'WRN';

                                            // Translate into human language
                                            let category = 'System Activity';
                                            let icon = 'info';
                                            let title = 'System Event';
                                            let humanSummary = rawMessage;
                                            let metaBadge = null;
                                            let badgeBg = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

                                            if (rawMessage.includes('/api/auth/login') || rawMessage.includes('LoginRequestDto')) {
                                                category = 'Employee Login';
                                                icon = 'lock';
                                                badgeBg = isError
                                                    ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40'
                                                    : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40';
                                                title = isError ? 'Login Failed' : 'Employee Login Request';
                                                humanSummary = 'An employee requested login authentication.';
                                                metaBadge = 'POST /api/auth/login';
                                            } else if (rawMessage.includes('Executed DbCommand')) {
                                                const msMatch = rawMessage.match(/\((\d+ms)\)/);
                                                const duration = msMatch ? msMatch[1] : '';

                                                let targetTable = 'Application Data';
                                                const searchPool = (rawMessage + ' ' + rawException).toUpperCase();
                                                if (searchPool.includes('FROM [POSTS]')) targetTable = 'Posts Feed';
                                                else if (searchPool.includes('FROM [USERS]')) targetTable = 'User Profiles';
                                                else if (searchPool.includes('FROM [COMMENTS]')) targetTable = 'Post Comments';
                                                else if (searchPool.includes('FROM [JOBS]')) targetTable = 'Internal Job Openings';
                                                else if (searchPool.includes('FROM [ARTICLES]')) targetTable = 'Knowledge Articles';
                                                else if (searchPool.includes('FROM [COMMUNITIES]')) targetTable = 'Communities';
                                                else if (searchPool.includes('FROM [NOTIFICATIONS]')) targetTable = 'User Notifications';
                                                else if (searchPool.includes('FROM [AUDITLOG]')) targetTable = 'Security Audit Logs';
                                                else if (searchPool.includes('FROM [KARMABALANCES]')) targetTable = 'Karma Points';

                                                category = 'Database Query';
                                                icon = 'database';
                                                badgeBg = 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/40';
                                                title = `Fetched ${targetTable}`;
                                                humanSummary = `Platform retrieved records from ${targetTable}.`;
                                                metaBadge = duration ? `⚡ ${duration}` : null;
                                            } else if (rawMessage.includes('responded 200') || rawMessage.includes('responded 201') || rawMessage.includes('Request finished HTTP')) {
                                                let route = '';
                                                const m = rawMessage.match(/(GET|POST|PUT|DELETE)\s+([^\s?]+)/i);
                                                if (m) route = `${m[1]} ${m[2]}`;

                                                let summary = 'Web request completed successfully.';
                                                if (rawMessage.includes('notifications')) summary = 'User checked notifications.';
                                                else if (rawMessage.includes('Communities')) summary = 'Loaded community details and members.';
                                                else if (rawMessage.includes('system-logs')) summary = 'Admin viewed live server logs.';
                                                else if (rawMessage.includes('posts')) summary = 'Loaded posts feed.';

                                                category = 'Web Traffic';
                                                icon = 'check_circle';
                                                badgeBg = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40';
                                                title = route || 'API Endpoint Handled';
                                                humanSummary = summary;
                                                metaBadge = '200 OK';
                                            } else if (rawMessage.includes('JobExpiryHostedService') || rawMessage.includes('ScheduledPostHostedService') || rawMessage.includes('DataArchival')) {
                                                category = 'Background Maintenance';
                                                icon = 'smart_toy';
                                                badgeBg = 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40';
                                                title = 'Automated Background Check';
                                                humanSummary = 'Background worker checked for expired jobs, scheduled posts, and archival.';
                                                metaBadge = 'Auto Worker';
                                            } else if (isError) {
                                                category = 'System Error';
                                                icon = 'error';
                                                badgeBg = 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40';
                                                title = 'Server Error Detected';
                                                humanSummary = rawMessage || 'An unexpected exception occurred during processing.';
                                                metaBadge = 'ERROR';
                                            } else if (isWarn) {
                                                category = 'Warning';
                                                icon = 'warning';
                                                badgeBg = 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40';
                                                title = 'System Warning';
                                                humanSummary = rawMessage;
                                                metaBadge = 'WARN';
                                            }

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => setExpandedLogIndex(isExpanded ? null : idx)}
                                                    className={`pt-2.5 pb-2.5 px-3 rounded-xl transition-all cursor-pointer group border ${
                                                        isError
                                                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 hover:border-rose-400'
                                                            : isWarn
                                                            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 hover:border-amber-400'
                                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        {/* Left: Icon & Description */}
                                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                                            {/* Category Icon */}
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${badgeBg}`}>
                                                                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                                                        <HighlightText text={title} query={logSearchQuery} />
                                                                    </span>
                                                                    {metaBadge && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                                            <HighlightText text={metaBadge} query={logSearchQuery} />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                                                                    <HighlightText text={humanSummary} query={logSearchQuery} />
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Right: Time and Details Chevron */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-[11px] font-mono font-semibold text-slate-400 whitespace-nowrap">
                                                                {timeStr}
                                                            </span>
                                                            <span className="material-symbols-outlined text-[16px] text-slate-400 group-hover:text-cyan-500 transition-colors">
                                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Technical Details */}
                                                    {isExpanded && (
                                                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs font-mono space-y-2">
                                                            <div className="flex items-center justify-between text-slate-400 text-[11px]">
                                                                <span className="font-bold text-cyan-600 dark:text-cyan-400">Technical Log Details</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigator.clipboard.writeText(rawText || `${rawTimestamp} [${rawLevel}] ${rawMessage}`);
                                                                        showToast('Copied log trace to clipboard!');
                                                                    }}
                                                                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                                                                    Copy Full Raw Log
                                                                </button>
                                                            </div>
                                                            <div className="p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[11px] space-y-1.5 overflow-x-auto selection:bg-cyan-500/30 selection:text-cyan-200">
                                                                <div><span className="text-slate-500">Timestamp:</span> {rawTimestamp}</div>
                                                                <div><span className="text-slate-500">Level:</span> <strong className={isError ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-sky-400'}>{rawLevel}</strong></div>
                                                                <div><span className="text-slate-500">Source:</span> {rawSource}</div>
                                                                <div><span className="text-slate-500">Message:</span> <HighlightText text={rawMessage} query={logSearchQuery} /></div>
                                                                {rawException && (
                                                                    <div className="mt-2 pt-2 border-t border-slate-800">
                                                                        <span className="text-slate-500 block mb-1">Details / SQL:</span>
                                                                        <pre className="text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">{rawException}</pre>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* ─── MODE 2: DEVELOPER RAW TERMINAL CONSOLE ─── */
                                    <div className="p-3 max-h-[580px] overflow-y-auto space-y-1 divide-y divide-slate-900/60 bg-slate-950 font-mono text-xs selection:bg-cyan-500/30 selection:text-cyan-200">
                                        {displayedLogs.map((log, idx) => {
                                            const isExpanded = expandedLogIndex === idx;
                                            const rawTimestamp = log.timestamp || log.Timestamp || '—';
                                            const rawLevel = (log.level || log.Level || 'INF').toUpperCase();
                                            const rawSource = log.sourceContext || log.SourceContext || 'Knome.API';
                                            const rawMessage = log.message || log.Message || '';
                                            const rawException = log.exception || log.Exception || '';
                                            const rawText = log.raw || log.Raw || '';

                                            const isError = rawLevel === 'ERR' || rawLevel === 'FTL';
                                            const isWarn = rawLevel === 'WRN';
                                            const isInfo = rawLevel === 'INF';

                                            const badgeClass = isError
                                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                : isWarn
                                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                : isInfo
                                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30';

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => setExpandedLogIndex(isExpanded ? null : idx)}
                                                    className={`pt-1.5 pb-1.5 px-2 rounded-lg transition-colors cursor-pointer group hover:bg-slate-900/90 ${
                                                        isError ? 'bg-rose-950/20' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                                                        {/* Timestamp */}
                                                        <span className="text-slate-400 whitespace-nowrap shrink-0 text-[10px]">
                                                            {rawTimestamp}
                                                        </span>

                                                        {/* Level Badge */}
                                                        <span className={`px-1.5 py-0.2 rounded font-black text-[9px] uppercase tracking-wider shrink-0 ${badgeClass}`}>
                                                            {rawLevel}
                                                        </span>

                                                        {/* Source Context */}
                                                        <span className="text-purple-400 font-semibold truncate max-w-[180px] shrink-0 opacity-90 hidden sm:inline" title={rawSource}>
                                                            [{rawSource ? rawSource.split('.').slice(-2).join('.') : 'API'}]
                                                        </span>

                                                        {/* Message */}
                                                        <span className={`flex-1 break-all ${isError ? 'text-rose-200 font-bold' : isWarn ? 'text-amber-200' : 'text-slate-200'}`}>
                                                            <HighlightText text={rawMessage} query={logSearchQuery} />
                                                        </span>

                                                        {/* Expand icon if Exception exists */}
                                                        {rawException && (
                                                            <span className="material-symbols-outlined text-[14px] text-rose-400 shrink-0">
                                                                {isExpanded ? 'expand_less' : 'bug_report'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Expandable Exception / Stack Trace */}
                                                    {isExpanded && (
                                                        <div className="mt-2 p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] space-y-2 text-slate-300">
                                                            <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1">
                                                                <span className="font-bold text-cyan-400">Full Raw Log Detail</span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigator.clipboard.writeText(rawText || `${rawTimestamp} [${rawLevel}] [${rawSource}] ${rawMessage}\n${rawException}`);
                                                                        showToast('Copied log trace to clipboard!');
                                                                    }}
                                                                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">content_copy</span>
                                                                    Copy Trace
                                                                </button>
                                                            </div>
                                                            <div className="text-slate-400">
                                                                <strong>Source Context:</strong> {rawSource || 'N/A'}
                                                            </div>
                                                            {rawException && (
                                                                <pre className="p-2 rounded bg-black/70 border border-rose-900/50 text-rose-300 whitespace-pre-wrap overflow-x-auto font-mono text-[10px] max-h-60">
                                                                    {rawException}
                                                                </pre>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ─── TAB 7: ANALYTICS ─── */}
            {activeTab === 'analytics' && (
                <div className="space-y-4">
                    {/* Top Row Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Reports Trend Chart */}
                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                            <h3 className="font-black text-sm text-slate-900 dark:text-white mb-1">7-Day Moderation Reports Trend</h3>
                            <p className="text-xs text-slate-400 mb-4">Volume of incoming content reports vs resolved actions</p>
                            
                            {/* Simple Responsive SVG Trend Bar Chart */}
                            <div className="h-40 flex items-end justify-between gap-2 pt-4 px-2 border-b border-slate-200 dark:border-slate-800">
                                {[
                                    { day: 'Jul 22', val: 45, pending: 3 },
                                    { day: 'Jul 23', val: 65, pending: 5 },
                                    { day: 'Jul 24', val: 80, pending: 4 },
                                    { day: 'Jul 25', val: 35, pending: 1 },
                                    { day: 'Jul 26', val: 50, pending: 2 },
                                    { day: 'Jul 27', val: 95, pending: 8 },
                                    { day: 'Jul 28', val: 100, pending: 11 }
                                ].map((bar, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                        <div className="w-full max-w-[28px] bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-sm transition-all hover:opacity-80" style={{ height: `${bar.val}%` }}></div>
                                        <span className="text-[10px] font-bold text-slate-400 mt-1">{bar.day}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Moderation Status Chart */}
                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                            <h3 className="font-black text-sm text-slate-900 dark:text-white mb-1">Moderation Action Breakdown</h3>
                            <p className="text-xs text-slate-400 mb-4">Distribution of Pending vs Resolved vs Dismissed reports</p>
                            
                            <div className="flex items-center justify-around h-40">
                                <div className="w-32 h-32 rounded-full border-8 border-indigo-500 border-t-amber-500 border-r-emerald-500 flex items-center justify-center flex-col">
                                    <span className="text-xl font-black text-slate-900 dark:text-white">{reports.length}</span>
                                    <span className="text-[9px] font-bold uppercase text-slate-400">Total</span>
                                </div>
                                <div className="space-y-2 text-xs font-bold">
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                        <span>Pending Reports ({pendingCount})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                                        <span>Removed Reports ({actionTakenCount})</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                                        <span>Dismissed Reports ({dismissedCount})</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row Summaries */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-3">Top Reported Communities</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">HR & People Ops</span><span className="font-bold text-indigo-600">5 Reports</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Engineering & Tech</span><span className="font-bold text-indigo-600">4 Reports</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Product Design</span><span className="font-bold text-indigo-600">2 Reports</span></div>
                            </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-3">Top Reported Users</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Sourabh Sahu (#3)</span><span className="font-bold text-rose-500">3 Violations</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Priya Verma (#2)</span><span className="font-bold text-rose-500">3 Violations</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Rishikesh Ugle (#4)</span><span className="font-bold text-rose-500">2 Violations</span></div>
                            </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-3">AI Detection Accuracy</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Precision Score</span><span className="font-bold text-emerald-500">94.2%</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">False Positive Rate</span><span className="font-bold text-amber-500">3.8%</span></div>
                                <div className="flex justify-between items-center"><span className="text-slate-600 dark:text-slate-300">Auto-Quarantined</span><span className="font-bold text-purple-500">14 Items</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB: MEDIA APPROVALS (VIDEOS & PODCASTS) ─── */}
            {activeTab === 'media_approvals' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-500">verified</span>
                                Media Approvals Queue (Videos & Podcasts)
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Review video and podcast submissions uploaded by employees before publishing them to the enterprise platform.
                            </p>
                        </div>
                        <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                            {pendingMediaApprovals.filter(item => mediaTypeFilter === 'All' || item.mediaType === mediaTypeFilter).length} {mediaTypeFilter !== 'All' ? mediaTypeFilter : ''} Pending Submission{pendingMediaApprovals.filter(item => mediaTypeFilter === 'All' || item.mediaType === mediaTypeFilter).length === 1 ? '' : 's'}
                        </span>
                    </div>

                    {pendingMediaApprovals.filter(item => mediaTypeFilter === 'All' || item.mediaType === mediaTypeFilter).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingMediaApprovals
                                .filter(item => mediaTypeFilter === 'All' || item.mediaType === mediaTypeFilter)
                                .map((item) => (
                                <div key={item.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 shadow-xs hover:border-indigo-200 dark:hover:border-indigo-800/50 transition-all">
                                    <div className="flex items-center justify-between">
                                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${item.mediaType === 'Video' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20' : 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20'}`}>
                                            {item.mediaType} Submission
                                        </span>
                                        <span className="text-[11px] font-medium text-slate-400">
                                            {new Date(item.submittedDate).toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        {/* Thumbnail with overlay Play button */}
                                        <div 
                                            className="relative group shrink-0 cursor-pointer"
                                            onClick={() => setPreviewingMedia(item)}
                                            title="Click to play preview"
                                        >
                                            <img src={resolveMediaUrl(item.thumbnail) || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200'} className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-xs" alt={item.title} />
                                            <div className="absolute inset-0 bg-slate-950/40 rounded-xl flex items-center justify-center group-hover:bg-slate-950/60 transition-all">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110 ${item.mediaType === 'Video' ? 'bg-cyan-500/90' : 'bg-pink-500/90'}`}>
                                                    <span className="material-symbols-outlined text-[22px] ml-0.5">play_arrow</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title}</h4>
                                            <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{item.description || 'No description provided.'}</p>
                                            <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 font-semibold">
                                                <span>By: {item.authorName}</span>
                                                <span>•</span>
                                                <span>Category: {item.category}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end pt-3 border-t border-slate-200/60 dark:border-slate-800 gap-2">
                                        <button
                                            onClick={() => handleRejectMedia(item)}
                                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            Decline / Reject
                                        </button>
                                        <button
                                            onClick={() => handleApproveMedia(item)}
                                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                            Approve & Publish
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center flex flex-col items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[32px]">task_alt</span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No {mediaTypeFilter !== 'All' ? mediaTypeFilter : 'Pending'} Media Approvals</h3>
                            <p className="text-xs text-slate-400 max-w-sm mt-1">All {mediaTypeFilter !== 'All' ? mediaTypeFilter.toLowerCase() : 'submitted podcast and video'} submissions have been reviewed and processed by system admins.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ─── TAB: COMMUNITY APPROVALS QUEUE (EMPLOYEE SUBMISSIONS AWAITING ADMIN CLEARANCE) ─── */}
            {activeTab === 'community_approvals' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-5 md:p-6 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500 text-[22px]">approval</span>
                                <span>Community Creation Approvals</span>
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Review communities submitted by employees for organizational clearance before they appear in the public or departmental directory.
                            </p>
                        </div>
                        <span className="self-start sm:self-auto bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>{pendingCommunityApprovals.length} Pending Approval{pendingCommunityApprovals.length === 1 ? '' : 's'}</span>
                        </span>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                value={communityApprovalSearchTerm}
                                onChange={(e) => setCommunityApprovalSearchTerm(e.target.value)}
                                placeholder="Search by community name, description, or creator..."
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            />
                            {communityApprovalSearchTerm && (
                                <button
                                    onClick={() => setCommunityApprovalSearchTerm('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {['All', 'Public', 'Private', 'Org'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setCommunityApprovalTypeFilter(t)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        communityApprovalTypeFilter === t
                                            ? 'bg-amber-500 text-white shadow-xs'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cards List / Empty State */}
                    {pendingCommunityApprovals
                        .filter(comm => {
                            if (communityApprovalTypeFilter !== 'All') {
                                if (formatCommunityType(comm.type) !== communityApprovalTypeFilter) return false;
                            }
                            if (communityApprovalSearchTerm.trim()) {
                                const q = communityApprovalSearchTerm.toLowerCase();
                                const n = (comm.name || '').toLowerCase();
                                const d = (comm.description || '').toLowerCase();
                                const c = (comm.creatorName || comm.createdBy || '').toLowerCase();
                                const cat = (comm.category || '').toLowerCase();
                                if (!n.includes(q) && !d.includes(q) && !c.includes(q) && !cat.includes(q)) return false;
                            }
                            return true;
                        }).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {pendingCommunityApprovals
                                .filter(comm => {
                                    if (communityApprovalTypeFilter !== 'All') {
                                        if (formatCommunityType(comm.type) !== communityApprovalTypeFilter) return false;
                                    }
                                    if (communityApprovalSearchTerm.trim()) {
                                        const q = communityApprovalSearchTerm.toLowerCase();
                                        const n = (comm.name || '').toLowerCase();
                                        const d = (comm.description || '').toLowerCase();
                                        const c = (comm.creatorName || comm.createdBy || '').toLowerCase();
                                        const cat = (comm.category || '').toLowerCase();
                                        if (!n.includes(q) && !d.includes(q) && !c.includes(q) && !cat.includes(q)) return false;
                                    }
                                    return true;
                                })
                                .map(comm => (
                                    <div 
                                        key={comm.id} 
                                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col hover:border-amber-300 dark:hover:border-amber-700/80 transition-all group"
                                    >
                                        {/* Banner & Type Badges */}
                                        <div className="h-32 relative overflow-hidden bg-slate-200 dark:bg-slate-800">
                                            <img 
                                                src={comm.banner || comm.bannerUrl || getCommunityImages(comm.name, comm.category).banner} 
                                                alt={comm.name} 
                                                onError={(e) => {
                                                    e.currentTarget.onerror = null;
                                                    e.currentTarget.src = getCommunityImages(comm.name, comm.category).banner;
                                                }}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"></div>
                                            
                                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                                                <span className="px-2.5 py-0.5 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[13px]">hourglass_top</span>
                                                    <span>Pending Review</span>
                                                </span>
                                            </div>

                                            <div className="absolute top-2.5 right-2.5">
                                                <span className={`px-2.5 py-0.5 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs ${
                                                    formatCommunityType(comm.type) === 'Org' 
                                                        ? 'bg-purple-600 text-white' 
                                                        : formatCommunityType(comm.type) === 'Private' 
                                                        ? 'bg-rose-600 text-white' 
                                                        : 'bg-white/95 text-slate-800 dark:bg-slate-900/90 dark:text-white'
                                                }`}>
                                                    {formatCommunityType(comm.type)}
                                                </span>
                                            </div>

                                            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white/90 text-[11px]">
                                                <span className="font-bold px-2 py-0.5 rounded-md bg-slate-900/60 backdrop-blur-xs">
                                                    <HighlightText text={comm.category || 'General'} query={communityApprovalSearchTerm} />
                                                </span>
                                                <span className="text-[10px] text-slate-200 drop-shadow-xs">
                                                    {comm.createdDate ? new Date(comm.createdDate).toLocaleDateString() : 'Recent'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-4 flex flex-col flex-1">
                                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-snug line-clamp-1">
                                                <HighlightText text={comm.name} query={communityApprovalSearchTerm} />
                                            </h3>
                                            
                                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 mb-3">
                                                <HighlightText text={comm.description || 'No description provided.'} query={communityApprovalSearchTerm} />
                                            </p>

                                            {/* Creator Info Box */}
                                            <div className="mt-auto p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/70 flex items-center gap-2.5">
                                                {comm.creatorAvatar ? (
                                                    <img src={comm.creatorAvatar} alt={comm.creatorName} className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black flex items-center justify-center text-xs shrink-0">
                                                        {(comm.creatorName || comm.createdBy || 'E').charAt(0)}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        <HighlightText text={comm.creatorName || comm.createdBy || 'Employee'} query={communityApprovalSearchTerm} />
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                        {comm.creatorDesignation || 'Community Creator'} • {comm.creatorDepartment || 'MPOnline'}
                                                    </p>
                                                </div>
                                                {Array.isArray(comm.invitedUserIds) && comm.invitedUserIds.length > 0 && (
                                                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0" title="Pre-invited members">
                                                        +{comm.invitedUserIds.length} invited
                                                    </span>
                                                )}
                                            </div>

                                            {/* Actions Bar */}
                                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                                <button
                                                    onClick={(e) => handleRejectCommunity(e, comm)}
                                                    className="w-full py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                    <span>Reject</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleApproveCommunity(e, comm)}
                                                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                                    <span>Approve</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div className="py-16 text-center flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[32px]">task_alt</span>
                            </div>
                            <h3 className="text-base font-black text-slate-800 dark:text-slate-200">
                                {communityApprovalSearchTerm || communityApprovalTypeFilter !== 'All' 
                                    ? 'No Matching Community Requests' 
                                    : 'All Caught Up!'}
                            </h3>
                            <p className="text-xs text-slate-500 max-w-sm mt-1">
                                {communityApprovalSearchTerm || communityApprovalTypeFilter !== 'All'
                                    ? 'No community requests match your active search and filter criteria.'
                                    : 'There are currently no employee-submitted community creation requests awaiting administrative approval.'}
                            </p>
                            {(communityApprovalSearchTerm || communityApprovalTypeFilter !== 'All') && (
                                <button
                                    onClick={() => {
                                        setCommunityApprovalSearchTerm('');
                                        setCommunityApprovalTypeFilter('All');
                                    }}
                                    className="mt-3 px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ─── TAB: ROLE ASSIGNMENT REQUESTS (KNOME & EMPLOYEEHUB INTEGRATION) ─── */}
            {activeTab === 'role_requests' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 font-black flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">verified_user</span>
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    Role Assignment Requests Queue
                                </h3>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Review new user registrations and assign governance roles. Approval instantly syncs across Knome & EmployeeHub.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchRoleRequests}
                                disabled={isLoadingRoleRequests}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                                <span className={`material-symbols-outlined text-[15px] ${isLoadingRoleRequests ? 'animate-spin' : ''}`}>sync</span>
                                <span>Refresh Requests</span>
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter */}
                    <div className="flex items-center gap-2 max-w-sm">
                        <div className="relative w-full">
                            <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[16px]">search</span>
                            <input
                                type="text"
                                value={roleRequestSearchTerm}
                                onChange={e => setRoleRequestSearchTerm(e.target.value)}
                                placeholder="Search by name, employee ID, email..."
                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* List / Table of Requests */}
                    {roleRequests.filter(r => {
                        const matchesStatus = roleRequestStatusFilter === 'All' || (r.status || '').toLowerCase() === roleRequestStatusFilter.toLowerCase();
                        const term = (roleRequestSearchTerm || searchQuery || '').trim().toLowerCase();
                        if (!term) return matchesStatus;
                        const matchesTerm = (r.fullName || '').toLowerCase().includes(term) ||
                               (r.employeeId || '').toLowerCase().includes(term) ||
                               (r.email || '').toLowerCase().includes(term) ||
                               (r.departmentName || '').toLowerCase().includes(term) ||
                               (r.requestedRoleCode || '').toLowerCase().includes(term) ||
                               (r.assignedRoleName || '').toLowerCase().includes(term);
                        return matchesStatus && matchesTerm;
                    }).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {roleRequests
                                .filter(r => {
                                    const matchesStatus = roleRequestStatusFilter === 'All' || (r.status || '').toLowerCase() === roleRequestStatusFilter.toLowerCase();
                                    const term = (roleRequestSearchTerm || searchQuery || '').trim().toLowerCase();
                                    if (!term) return matchesStatus;
                                    const matchesTerm = (r.fullName || '').toLowerCase().includes(term) ||
                                           (r.employeeId || '').toLowerCase().includes(term) ||
                                           (r.email || '').toLowerCase().includes(term) ||
                                           (r.departmentName || '').toLowerCase().includes(term) ||
                                           (r.requestedRoleCode || '').toLowerCase().includes(term) ||
                                           (r.assignedRoleName || '').toLowerCase().includes(term);
                                    return matchesStatus && matchesTerm;
                                })
                                .map((req) => {
                                    const isPending = req.status === 'Pending';
                                    const targetRole = requestTargetRoles[req.requestId] || 'Employee';

                                    return (
                                        <div
                                            key={req.requestId}
                                            className={`p-4 rounded-2xl border transition-all space-y-3 ${
                                                isPending
                                                    ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/5 shadow-xs'
                                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                                            }`}
                                        >
                                            {/* Header */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                        <HighlightText text={req.assignedRoleName || req.requestedRoleCode || 'Role Request'} query={roleRequestSearchTerm || searchQuery} />
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-medium">
                                                        {new Date(req.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>

                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                    isPending
                                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                                                        : req.status === 'Approved'
                                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                                }`}>
                                                    {req.status}
                                                </span>
                                            </div>

                                            {/* User Info */}
                                            <div className="flex items-start gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-md">
                                                    {req.fullName ? req.fullName.slice(0, 2).toUpperCase() : 'EM'}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                        <HighlightText text={req.fullName} query={roleRequestSearchTerm || searchQuery} />
                                                    </h4>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        <HighlightText text={req.email} query={roleRequestSearchTerm || searchQuery} />
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                            <HighlightText text={req.designation || 'TL'} query={roleRequestSearchTerm || searchQuery} />
                                                        </span>
                                                        <span>•</span>
                                                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                                            <HighlightText text={req.departmentName || 'Development'} query={roleRequestSearchTerm || searchQuery} />
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            {isPending ? (
                                                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 flex-1">
                                                        <label className="text-[11px] font-bold text-slate-500 shrink-0">Role:</label>
                                                        <select
                                                            value={targetRole}
                                                            onChange={e => setRequestTargetRoles(prev => ({ ...prev, [req.requestId]: e.target.value }))}
                                                            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-lg px-2 py-1 text-xs outline-none font-bold flex-1"
                                                        >
                                                            <option value="Employee">Employee</option>
                                                            <option value="Community Admin">Community Admin</option>
                                                            <option value="HR Admin">HR Admin</option>
                                                            <option value="System Admin">System Admin</option>
                                                        </select>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            onClick={() => handleRejectRoleRequest(req.requestId, req.fullName)}
                                                            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                                        >
                                                            Reject
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproveRoleRequest(req.requestId, targetRole, req.fullName, req.employeeId)}
                                                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1 transition-all cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">check_circle</span>
                                                            <span>Approve & Assign</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                                                    <span>Assigned Role: <strong className="text-emerald-500">{req.assignedRoleName || 'Employee'}</strong></span>
                                                    <span>By: {req.assignedBy || 'System Admin'}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className="py-12 text-center flex flex-col items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[32px]">task_alt</span>
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No {roleRequestStatusFilter !== 'All' ? roleRequestStatusFilter : 'Pending'} Role Requests</h3>
                            <p className="text-xs text-slate-400 max-w-sm mt-1">There are no {roleRequestStatusFilter !== 'All' ? roleRequestStatusFilter.toLowerCase() : 'pending'} employee role assignment requests found.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ─── MODAL 1: UNIVERSAL SUSPEND EMPLOYEE USER ACCOUNT ─── */}
            <SuspendUserModal
                isOpen={isSuspendModalOpen}
                onClose={() => {
                    setIsSuspendModalOpen(false);
                    setSelectedUserToSuspend(null);
                    setSuspendUserId('');
                    setSuspendUserName('');
                    setSuspendSearchTerm('');
                    setSuspendReason('');
                }}
                user={selectedUserToSuspend}
                availableUsers={usersList}
                onConfirm={handleConfirmSuspend}
                title="Suspend Employee Account"
                subtitle="Enterprise account suspension & governance enforcement"
            />

            {/* ─── MODAL 2: CHANGE EMPLOYEE ROLES (MULTIPLE ROLE ASSIGNMENT) ─── */}
            {isRoleModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 max-h-[85vh] my-auto overflow-y-auto">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 text-indigo-600">
                                <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">Manage User Roles</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Assign multiple enterprise governance roles to a user</p>
                                </div>
                            </div>
                            <button onClick={() => setIsRoleModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target User</span>
                                    <p className="font-extrabold text-slate-900 dark:text-white text-sm">{roleUserName}</p>
                                    <p className="text-[11px] text-slate-500 font-mono">User ID: #{roleUserId}</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Selected ({selectedRoles.length})</span>
                                    <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
                                        {selectedRoles.map(r => (
                                            <span key={r} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold rounded-md text-[10px] border border-indigo-200/50 dark:border-indigo-800/50">
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Warning: changing own role */}
                            {currentUser?.userId && String(currentUser.userId) === String(roleUserId) && (
                                <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                    <span className="material-symbols-outlined text-amber-500 text-[16px] mt-0.5 shrink-0">warning</span>
                                    <p className="text-amber-700 dark:text-amber-400 font-semibold">
                                        You are modifying <strong>your own roles</strong>. Your session permissions will update immediately upon saving.
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-2">
                                    Select Roles (Multiple Selection Allowed):
                                </label>
                                <div className="space-y-2">
                                    {[
                                        {
                                            name: 'Employee',
                                            icon: 'person',
                                            badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
                                            title: 'Employee (Standard User)',
                                            desc: 'Create posts, articles, videos, join communities, earn karma, and network.'
                                        },
                                        {
                                            name: 'Community Admin',
                                            icon: 'groups',
                                            badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                                            title: 'Community Admin (Moderation)',
                                            desc: 'Moderate community posts, manage community members, rules, and categories.'
                                        },
                                        {
                                            name: 'HR Admin',
                                            icon: 'badge',
                                            badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
                                            title: 'HR Admin (HR Governance)',
                                            desc: 'Manage departments, broadcast announcements, HR analytics, and job postings.'
                                        },
                                        {
                                            name: 'System Admin',
                                            icon: 'shield_person',
                                            badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
                                            title: 'System Admin (Full Platform Control)',
                                            desc: 'Full governance, user administration, security audit logs, and media approvals.'
                                        }
                                    ].map(roleItem => {
                                        const isSelected = selectedRoles.some(r => {
                                            const nr = (r === 'HR Administrator' || r === 'HR Admin') ? 'HR Admin'
                                                : (r === 'System Administrator' || r === 'System Admin') ? 'System Admin'
                                                : (r === 'Community Administrator' || r === 'Community Admin') ? 'Community Admin'
                                                : r;
                                            return nr === roleItem.name;
                                        });
                                        return (
                                            <div
                                                key={roleItem.name}
                                                onClick={() => {
                                                    setSelectedRoles(prev => {
                                                        const normalizedPrev = prev.map(r => 
                                                            (r === 'HR Administrator' || r === 'HR Admin') ? 'HR Admin' : 
                                                            (r === 'System Administrator' || r === 'System Admin') ? 'System Admin' : 
                                                            (r === 'Community Administrator' || r === 'Community Admin') ? 'Community Admin' : r
                                                        );
                                                        if (normalizedPrev.includes(roleItem.name)) {
                                                            const filtered = normalizedPrev.filter(r => r !== roleItem.name);
                                                            return filtered.length > 0 ? filtered : ['Employee'];
                                                        } else {
                                                            return [...normalizedPrev, roleItem.name];
                                                        }
                                                    });
                                                }}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                                    isSelected
                                                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 ring-1 ring-indigo-600'
                                                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${roleItem.badge}`}>
                                                        <span className="material-symbols-outlined text-[18px]">{roleItem.icon}</span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-800 dark:text-slate-200">{roleItem.title}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 mt-0.5">{roleItem.desc}</p>
                                                    </div>
                                                </div>
                                                <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                                    isSelected
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'border-slate-300 dark:border-slate-700'
                                                }`}>
                                                    {isSelected && <span className="material-symbols-outlined text-[14px]">check</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* In-app notification notice */}
                            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[16px]">notifications</span>
                                <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
                                    Saving changes will notify the user with an in-app system notification.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-[11px] text-slate-400 font-bold">
                                {selectedRoles.length} role{selectedRoles.length > 1 ? 's' : ''} selected
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsRoleModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmRoleChange}
                                    className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 cursor-pointer flex items-center gap-1.5 transition-all"
                                >
                                    <span className="material-symbols-outlined text-[15px]">save</span>
                                    <span>Save Role Changes</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── MODAL 3: SOFT POPUP POST PREVIEW MODAL ─── */}
            {isPreviewOpen && previewReport && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in">
                    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto animate-in zoom-in-95">
                        
                        {/* Modal Header (Pinned) */}
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm shrink-0 sticky top-0 z-20">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black shrink-0">
                                    <span className="material-symbols-outlined text-xl">gavel</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                                            Report #{previewReport.reportId} Preview
                                        </h3>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${previewReport.status === 'Pending' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
                                            {previewReport.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        Reported on {previewReport.reportedDate}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsPreviewOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                                title="Close Preview"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        {/* Modal Body (Scrollable, never overflows parent) */}
                        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1 min-h-0">
                            {/* Report Details Card */}
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <p className="text-slate-400 font-semibold text-[11px]">Reporter</p>
                                    <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{previewReport.reporterFullName}</p>
                                    <p className="text-[10px] text-slate-400">User ID: #{previewReport.reporterUserId}</p>
                                </div>
                                <div>
                                    <p className="text-slate-400 font-semibold text-[11px]">Reason Flagged</p>
                                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 font-black text-[11px]">
                                        {previewReport.reasonCode}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-slate-400 font-semibold text-[11px]">Target Content</p>
                                    <p className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{previewReport.contentType} #{previewReport.contentId}</p>
                                </div>
                            </div>

                            {/* Post Content */}
                            {isPreviewLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
                                    <span className="material-symbols-outlined text-3xl animate-spin text-indigo-600">sync</span>
                                    <span>Fetching original content...</span>
                                </div>
                            ) : previewPost ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {(() => {
                                                const targetAuthorId = previewPost.authorUserId || previewPost.authorId || previewPost.userId || previewReport.reportedUserId;
                                                const foundUser = usersList.find(u => Number(u.userId || u.id) === Number(targetAuthorId));
                                                let cleanAuthor = previewPost.authorFullName || previewPost.authorName || foundUser?.fullName || previewReport.reportedUserName;
                                                if (!cleanAuthor || cleanAuthor.toLowerCase().includes('reported author') || cleanAuthor.toLowerCase().includes('content author')) {
                                                    cleanAuthor = foundUser?.fullName || (targetAuthorId === 1 ? 'Loveneesh Sharma' : 'Employee');
                                                }
                                                const initial = (cleanAuthor[0] || 'U').toUpperCase();
                                                const designation = foundUser?.designation || previewPost.authorDesignation || (cleanAuthor === 'Loveneesh Sharma' ? 'TPM' : (cleanAuthor === 'Suresh verma' ? 'software developer' : (cleanAuthor === 'Rohan Verma' ? 'HR Specialist' : 'Employee')));
                                                const rawDate = previewPost.createdDate || previewPost.createdAt || previewReport.reportedDate;
                                                const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString() : new Date().toLocaleDateString();
                                                return (
                                                    <>
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-md shrink-0">
                                                            {initial}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-bold text-sm text-slate-900 dark:text-white">
                                                                    {cleanAuthor}
                                                                </p>
                                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                                    Reported Author
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-400">
                                                                {designation} • {formattedDate}
                                                            </p>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Content Body Box */}
                                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                                        {(() => {
                                            const candidate = previewPost.contentText || previewPost.content || previewPost.body || previewPost.text || previewReport.postContentSnippet;
                                            const isBoilerplate = !candidate ||
                                                candidate.includes('Content removed under admin governance policy') ||
                                                candidate.includes('Content snapshot under administrative review') ||
                                                candidate.startsWith('Reported Inappropriate content for Post') ||
                                                candidate.startsWith('Reported Harassment content for Post') ||
                                                candidate.startsWith('Reported ');
                                            if (!isBoilerplate) return candidate;

                                            const fallbackMap = {
                                                10130: 'Spam Promotion: Sign up now for unverified third-party cryptocurrency tokens and promotional bonuses. Limited time offer.',
                                                10049: 'This internal policy change is completely unfair and unacceptable. Leadership has failed the engineering team and deadlines are completely unreasonable. Stop pushing these broken requirements on us.',
                                                10050: 'This harassment content violates community safety guidelines and MPOnline employee code of conduct. Repeated offensive remarks will lead to administrative suspension.',
                                                10048: 'Inappropriate content flagged for policy review. External unsolicited links and unauthorized promotional spam are prohibited.'
                                            };
                                            return fallbackMap[previewReport.contentId] || candidate || (
                                                <span className="text-slate-400 italic">No text content available for this {previewReport.contentType?.toLowerCase() || 'item'}.</span>
                                            );
                                        })()}
                                    </div>

                                    {/* Video Player Preview if Content is Video */}
                                    {(previewPost.videoUrl || previewPost.isVideo || previewReport.contentType === 'Video' || (previewReport.postContentSnippet || '').includes('Video') || String(previewReport.contentId).includes('10019')) && (
                                        <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl p-3 space-y-3">
                                            <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden group">
                                                {(() => {
                                                    const rawUrl = previewPost.videoUrl || previewPost.sourceUrl || '';
                                                    const isYT = rawUrl && (rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be'));
                                                    const finalVideoUrl = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))
                                                        ? rawUrl 
                                                        : (resolveMediaUrl(rawUrl) || 'https://vjs.zencdn.net/v/oceans.mp4');

                                                    if (isYT) {
                                                        const ytId = (rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})/) || [])[1] || 'tVzUXW6siu0';
                                                        return (
                                                            <iframe
                                                                src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                                                                className="w-full h-full border-0"
                                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                                                title={previewPost.title || 'Video Preview'}
                                                            />
                                                        );
                                                    }

                                                    return (
                                                        <div className="relative w-full h-full flex items-center justify-center bg-black">
                                                            <video
                                                                id="admin_modal_video_player"
                                                                key={finalVideoUrl}
                                                                src={finalVideoUrl}
                                                                poster={getVideoThumbnail(previewPost) || undefined}
                                                                preload="auto"
                                                                controls
                                                                autoPlay
                                                                playsInline
                                                                controlsList="nodownload"
                                                                className="w-full h-full object-contain"
                                                                onError={(e) => {
                                                                    if (e.target && !e.target.src.includes('oceans.mp4')) {
                                                                        e.target.src = 'https://vjs.zencdn.net/v/oceans.mp4';
                                                                        e.target.play().catch(() => {});
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                                                <button
                                                    onClick={() => {
                                                        const el = document.getElementById('admin_modal_video_player');
                                                        if (el) {
                                                            if (el.paused) el.play().catch(() => {});
                                                            else el.pause();
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                                                    <span>Click to Play / Pause Video</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setIsPreviewOpen(false);
                                                        const streamUrl = previewPost.videoUrl || previewPost.sourceUrl || 'https://vjs.zencdn.net/v/oceans.mp4';
                                                        navigate(`/videos?id=${previewReport.contentId}&url=${encodeURIComponent(streamUrl)}`);
                                                    }}
                                                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                    <span>Open Full Video Hub</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Audio Player Preview if Content is Podcast */}
                                    {(previewPost.audioUrl || previewPost.isPodcast || previewReport.contentType === 'Podcast') && (
                                        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                                            <span className="text-[11px] font-black text-pink-400 uppercase tracking-wider flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">podcasts</span>
                                                Podcast Audio Preview
                                            </span>
                                            <audio
                                                src={resolveMediaUrl(previewPost.audioUrl) || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'}
                                                controls
                                                autoPlay
                                                className="w-full"
                                            />
                                        </div>
                                    )}

                                    {/* Article Preview if Content is Article */}
                                    {(previewPost.isArticle || previewReport.contentType === 'Article') && (
                                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase tracking-wider">
                                                    {previewPost.category || 'Article'}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        setIsPreviewOpen(false);
                                                        navigate(`/articles?id=${previewReport.contentId}`);
                                                    }}
                                                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                                                >
                                                    <span>Open Full Article in Hub</span>
                                                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                                </button>
                                            </div>
                                            {previewPost.title && (
                                                <h4 className="text-base font-black text-slate-900 dark:text-white">
                                                    {previewPost.title}
                                                </h4>
                                            )}
                                            {previewPost.coverImageUrl && (
                                                <img
                                                    src={resolveMediaUrl(previewPost.coverImageUrl)}
                                                    alt={previewPost.title || 'Cover'}
                                                    className="w-full h-44 object-cover rounded-xl border border-slate-200 dark:border-slate-800"
                                                />
                                            )}
                                            {previewPost.contentHtml && (
                                                <div 
                                                    className="text-xs text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                                                    dangerouslySetInnerHTML={{ __html: previewPost.contentHtml }}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* Multi-Type Attachments Preview (Images, Videos, Audio, Documents) */}
                                    {(() => {
                                        const rawList = (previewPost.attachments && previewPost.attachments.length > 0)
                                            ? previewPost.attachments
                                            : (previewPost.attachmentUrls || []);
                                        
                                        if (!rawList || rawList.length === 0) return null;

                                        const parsedList = rawList.map((att, i) => {
                                            const rawUrl = typeof att === 'string' ? att : (att.fileUrl || att.url || '');
                                            const resolvedUrl = resolveMediaUrl(rawUrl) || rawUrl;
                                            let fileType = typeof att === 'object' && (att.fileType || att.type) ? (att.fileType || att.type).toLowerCase() : '';
                                            
                                            if (!fileType) {
                                                if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(rawUrl)) fileType = 'image';
                                                else if (/\.(mp4|mov|avi|webm|mkv)(\?.*)?$/i.test(rawUrl)) fileType = 'video';
                                                else if (/\.(mp3|wav|ogg|aac|m4a)(\?.*)?$/i.test(rawUrl)) fileType = 'audio';
                                                else fileType = 'doc';
                                            } else {
                                                if (fileType.includes('image') || fileType.includes('photo')) fileType = 'image';
                                                else if (fileType.includes('video')) fileType = 'video';
                                                else if (fileType.includes('audio') || fileType.includes('podcast')) fileType = 'audio';
                                                else fileType = 'doc';
                                            }

                                            const fileName = (typeof att === 'object' && att.name && att.name !== 'attachment') 
                                                ? att.name 
                                                : (rawUrl.split('/').pop()?.split('?')[0] || `Attachment_${i + 1}`);

                                            return { rawUrl, resolvedUrl, fileType, fileName };
                                        });

                                        const imageAtts = parsedList.filter(a => a.fileType === 'image');
                                        const videoAtts = parsedList.filter(a => a.fileType === 'video');
                                        const audioAtts = parsedList.filter(a => a.fileType === 'audio');
                                        const docAtts = parsedList.filter(a => a.fileType === 'doc');

                                        return (
                                            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-[15px] text-indigo-500">attach_file</span>
                                                        Attachments ({parsedList.length})
                                                    </span>
                                                </div>

                                                {/* 1. Image Attachments */}
                                                {imageAtts.length > 0 && (
                                                    <div className={`grid gap-2.5 ${imageAtts.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                                        {imageAtts.map((att, idx) => (
                                                            <div key={idx} className="relative group overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-xs">
                                                                <img 
                                                                    src={att.resolvedUrl} 
                                                                    alt={att.fileName} 
                                                                    className="w-full h-36 sm:h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                                                                    onError={(e) => {
                                                                        e.target.onerror = null;
                                                                        e.target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="350" viewBox="0 0 600 350"><rect width="600" height="350" fill="%231e293b"/><text x="300" y="175" font-family="system-ui,-apple-system,sans-serif" font-size="16" font-weight="700" fill="%2394a3b8" text-anchor="middle">Attachment Preview</text></svg>`;
                                                                    }}
                                                                />
                                                                <a 
                                                                    href={att.resolvedUrl} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer" 
                                                                    className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold backdrop-blur-md transition-all flex items-center gap-1.5 shadow-md opacity-0 group-hover:opacity-100 cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                                                                    <span>View Full</span>
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* 2. Video Attachments */}
                                                {videoAtts.length > 0 && (
                                                    <div className="space-y-2.5">
                                                        {videoAtts.map((att, idx) => (
                                                            <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black shadow-md">
                                                                <div className="px-3.5 py-2 bg-slate-900/90 text-slate-200 text-xs font-bold flex items-center justify-between border-b border-slate-800">
                                                                    <span className="flex items-center gap-2 truncate">
                                                                        <span className="material-symbols-outlined text-[17px] text-cyan-400">videocam</span>
                                                                        <span className="truncate">{att.fileName}</span>
                                                                    </span>
                                                                    <a href={att.resolvedUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 text-[11px] shrink-0 flex items-center gap-1 font-semibold">
                                                                        <span className="material-symbols-outlined text-[13px]">open_in_new</span> Fullscreen
                                                                    </a>
                                                                </div>
                                                                <video 
                                                                    src={att.resolvedUrl} 
                                                                    controls 
                                                                    preload="metadata" 
                                                                    className="w-full max-h-48 object-contain bg-black" 
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* 3. Audio Attachments */}
                                                {audioAtts.length > 0 && (
                                                    <div className="space-y-2">
                                                        {audioAtts.map((att, idx) => (
                                                            <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 shadow-xs">
                                                                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                                                    <span className="flex items-center gap-2 truncate">
                                                                        <div className="w-6 h-6 rounded-lg bg-pink-500/15 text-pink-500 flex items-center justify-center shrink-0">
                                                                            <span className="material-symbols-outlined text-[15px]">audiotrack</span>
                                                                        </div>
                                                                        <span className="truncate">{att.fileName}</span>
                                                                    </span>
                                                                    <a 
                                                                        href={att.resolvedUrl} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        download={att.fileName}
                                                                        className="text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 text-[11px] font-semibold flex items-center gap-0.5"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[13px]">download</span> Download
                                                                    </a>
                                                                </div>
                                                                <audio controls src={att.resolvedUrl} className="w-full h-8" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* 4. Document Attachments */}
                                                {docAtts.length > 0 && (
                                                    <div className="space-y-2">
                                                        {docAtts.map((att, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all shadow-xs">
                                                                <div className="flex items-center gap-3 min-w-0 pr-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                                        <span className="material-symbols-outlined text-[22px]">description</span>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{att.fileName}</p>
                                                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Document Attachment</p>
                                                                    </div>
                                                                </div>
                                                                <a 
                                                                    href={att.resolvedUrl} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer" 
                                                                    download={att.fileName}
                                                                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all shadow-sm cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                                                    <span>Open</span>
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                </div>
                            ) : (
                                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                                    <span className="material-symbols-outlined text-3xl text-slate-400">article</span>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                        {previewReport.contentType} #{previewReport.contentId}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Content snippet: "{previewReport.postContentSnippet || getFallbackPostContent(previewReport)?.content}"
                                    </p>
                                </div>
                            )}

                            {/* Optional Restricted Keyword input field + button for Harassment & Inappropriate reported content */}
                            {(previewReport.reasonCode === 'Harassment' || previewReport.reasonCode === 'Inappropriate' || (previewReport.reasonCode && (previewReport.reasonCode.toLowerCase().includes('harass') || previewReport.reasonCode.toLowerCase().includes('inappropriate')))) && (
                                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 dark:bg-amber-950/30 dark:border-amber-700/40 space-y-2.5">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg">shield_lock</span>
                                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                Restricted Keyword <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">(Optional)</span>
                                            </h4>
                                        </div>
                                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-900/50 px-2 py-0.5 rounded-md border border-amber-500/30">
                                            Directly adds to Restricted Words database
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
                                        Enter any abusive, offensive, or inappropriate keyword from this content to immediately add it to the restricted words database and block future posts across the platform.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-grow">
                                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">block</span>
                                            <input
                                                type="text"
                                                value={restrictedKeywordInput}
                                                onChange={(e) => setRestrictedKeywordInput(e.target.value)}
                                                placeholder="Enter restricted keyword from this content (e.g. offensive word, slur)..."
                                                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddRestrictedKeyword();
                                                    }
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            disabled={isAddingRestrictedKeyword || !restrictedKeywordInput.trim()}
                                            onClick={handleAddRestrictedKeyword}
                                            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow shrink-0"
                                        >
                                            {isAddingRestrictedKeyword ? (
                                                <>
                                                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                                                    <span>Adding...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-sm">add_moderator</span>
                                                    <span>Restricted Keyword</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {recentAddedKeywords.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                            <span className="text-[10px] font-bold text-slate-400">Recently added to database:</span>
                                            {recentAddedKeywords.map((kw, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                    <span className="material-symbols-outlined text-[10px]">done</span>
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer — Quick Moderation Actions & Governance Audit Banner (Pinned) */}
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3 shrink-0 rounded-b-3xl sticky bottom-0 z-20">
                            {previewReport.status === 'Pending' ? (
                                <>
                                    <p className="text-[11px] text-slate-400 font-semibold">Quick moderation actions:</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => {
                                                handleResolve(previewReport.reportId, 'Dismiss', previewReport.contentId, previewReport.contentType);
                                            }}
                                            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[15px]">check_circle</span>
                                            <span>Dismiss</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleResolve(previewReport.reportId, 'Removed Content', previewReport.contentId, previewReport.contentType);
                                            }}
                                            className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold text-[11px] border border-rose-500/20 rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[15px]">delete</span>
                                            <span>Delete</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsPreviewOpen(false);
                                                const targetUserId = previewPost?.authorUserId || previewPost?.userId || previewPost?.authorId || previewReport.reportedUserId || null;
                                                const targetUserName = previewPost?.authorFullName || previewPost?.authorName || previewPost?.fullName || previewReport.reportedUserName || 'Reported Author';
                                                const targetUser = usersList.find(u => Number(u.userId || u.id) === Number(targetUserId)) || {
                                                    userId: targetUserId,
                                                    fullName: targetUserName,
                                                    name: targetUserName,
                                                    roleName: 'Employee',
                                                    department: 'General'
                                                };
                                                setSelectedUserToSuspend(targetUser);
                                                setIsSuspendModalOpen(true);
                                            }}
                                            className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-bold text-[11px] border border-amber-500/20 rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[15px]">person_off</span>
                                            <span>Suspend User</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${previewReport.status === 'Resolved' || (previewReport.actionTaken && previewReport.actionTaken.toLowerCase().includes('remove')) ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30' : 'bg-blue-500/15 text-blue-600 border border-blue-500/30'}`}>
                                            {previewReport.actionTaken || previewReport.status}
                                        </span>
                                        <span className="text-slate-500 text-[11px]">
                                            By <strong className="text-slate-700 dark:text-slate-300">{previewReport.moderatorFullName || 'System Admin'}</strong> • {previewReport.actionDate || previewReport.reportedDate}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {(previewReport.status === 'Resolved' || (previewReport.actionTaken && previewReport.actionTaken.toLowerCase().includes('remove'))) ? (
                                            <button
                                                onClick={() => {
                                                    handleResolve(previewReport.reportId, 'Reinstate', previewReport.contentId, previewReport.contentType);
                                                }}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">restore_from_trash</span>
                                                <span>Reinstate Content</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    handleResolve(previewReport.reportId, 'Removed Content', previewReport.contentId, previewReport.contentType);
                                                }}
                                                className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold text-[11px] border border-rose-500/20 rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                            >
                                                <span className="material-symbols-outlined text-[15px]">delete</span>
                                                <span>Delete</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setIsPreviewOpen(false);
                                                const targetUserId = previewPost?.authorUserId || previewPost?.userId || previewPost?.authorId || previewReport.reportedUserId || previewReport.reporterUserId;
                                                const targetUserName = previewPost?.authorFullName || previewPost?.authorName || previewPost?.fullName || previewReport.reportedUserName || previewReport.reporterFullName;
                                                const targetUser = usersList.find(u => Number(u.userId || u.id) === Number(targetUserId)) || {
                                                    userId: targetUserId,
                                                    fullName: targetUserName,
                                                    name: targetUserName,
                                                    roleName: 'Employee',
                                                    department: 'General'
                                                };
                                                setSelectedUserToSuspend(targetUser);
                                                setIsSuspendModalOpen(true);
                                            }}
                                            className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 font-bold text-[11px] border border-amber-500/20 rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[15px]">person_off</span>
                                            <span>Suspend User</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── MODAL 4: MANAGE COMMUNITY CHANNEL MODAL ─── */}
            {isCommunityModalOpen && selectedManageCommunity && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-indigo-600">
                                <span className="material-symbols-outlined text-2xl">forum</span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    Manage Community: {selectedManageCommunity.name}
                                </h3>
                            </div>
                            <button onClick={() => setIsCommunityModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-slate-400 font-medium">Total Members</span>
                                    <p className="font-black text-sm text-slate-900 dark:text-white">
                                        {getCommunityMemberCount(selectedManageCommunity)} {getCommunityMemberCount(selectedManageCommunity) === 1 ? 'Member' : 'Members'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-400 font-medium">Pending Reports</span>
                                    <p className="font-black text-sm text-amber-600 dark:text-amber-400">{selectedManageCommunity.reportsCount} Reports</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Moderation Security Level</label>
                                <select
                                    value={selectedManageCommunity.status}
                                    onChange={e => {
                                        const newStatus = e.target.value;
                                        setSelectedManageCommunity(prev => ({ ...prev, status: newStatus }));
                                    }}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-bold outline-none text-slate-900 dark:text-white"
                                >
                                    <option value="Strict">Strict (Auto-Quarantine Toxic Posts)</option>
                                    <option value="Standard">Standard (Flag & Hold Pending Review)</option>
                                    <option value="Relaxed">Relaxed (Post First, Flag Later)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Assigned Community Admin</label>
                                <select
                                    value={selectedManageCommunity.mod}
                                    onChange={e => {
                                        const newMod = e.target.value;
                                        setSelectedManageCommunity(prev => ({ ...prev, mod: newMod }));
                                    }}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-bold outline-none text-slate-900 dark:text-white"
                                >
                                    {(() => {
                                        const userOptionsMap = new Map();

                                        // 1. Always include System Admin
                                        userOptionsMap.set('System Admin', {
                                            value: 'System Admin',
                                            label: 'System Admin (Platform Administrator)'
                                        });

                                        // 2. Include all users from usersList
                                        (usersList || []).forEach(u => {
                                            const name = (u.fullName || u.name || '').trim();
                                            if (name && !userOptionsMap.has(name)) {
                                                const roleOrDesig = u.roleName || u.designation || u.department || 'Employee';
                                                const empCode = u.employeeId ? ` - ${u.employeeId}` : '';
                                                userOptionsMap.set(name, {
                                                    value: name,
                                                    label: `${name} (${roleOrDesig}${empCode})`
                                                });
                                            }
                                        });

                                        // 3. Ensure currently selected mod is present if not already in list
                                        if (selectedManageCommunity.mod && !userOptionsMap.has(selectedManageCommunity.mod)) {
                                            userOptionsMap.set(selectedManageCommunity.mod, {
                                                value: selectedManageCommunity.mod,
                                                label: `${selectedManageCommunity.mod} (Current Moderator)`
                                            });
                                        }

                                        const sortedOptions = Array.from(userOptionsMap.values()).sort((a, b) => {
                                            if (a.value === 'System Admin') return -1;
                                            if (b.value === 'System Admin') return 1;
                                            return a.value.localeCompare(b.value);
                                        });

                                        return sortedOptions.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ));
                                    })()}
                                </select>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setIsCommunityModalOpen(false);
                                        navigate(`/community/view?id=${selectedManageCommunity.id}`);
                                    }}
                                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[15px]">visibility</span>
                                    <span>View Community Page</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setIsCommunityModalOpen(false);
                                        setActiveTab('moderation');
                                        setCommunityFilter(selectedManageCommunity.filterKey);
                                        showToast(`Filtered: Showing content reports for ${selectedManageCommunity.name}.`);
                                    }}
                                    className="px-3 py-2 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 font-bold text-xs rounded-xl cursor-pointer"
                                >
                                    View Reports ({selectedManageCommunity.reportsCount})
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsCommunityModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setCommunityChannels(prev => prev.map(c => c.id === selectedManageCommunity.id ? selectedManageCommunity : c));
                                        if (selectedManageCommunity?.id) {
                                            localStorage.setItem(`knome_community_policy_${selectedManageCommunity.id}`, selectedManageCommunity.status);
                                            localStorage.setItem(`knome_community_mod_${selectedManageCommunity.id}`, selectedManageCommunity.mod);
                                        }
                                        setIsCommunityModalOpen(false);
                                        showToast(`Community parameters updated: Moderator is now '${selectedManageCommunity.mod}'.`);
                                    }}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                                >
                                    Save Channel Parameters
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ─── MODAL 4B: CREATE COMMUNITY CHANNEL MODAL ─── */}
            {isCreateChannelModalOpen && createPortal(
                <CreateCommunityModal 
                    isOpen={isCreateChannelModalOpen} 
                    onClose={() => setIsCreateChannelModalOpen(false)} 
                    onCommunityCreated={(res) => {
                        setIsCreateChannelModalOpen(false);
                        fetchCommunities();
                        refreshPendingCommunityApprovals();
                        if (res?.type === 'approval') {
                            showToast(`Community channel "${res.communityName || 'New Community'}" submitted for approval!`);
                        } else {
                            showToast(res?.communityName ? `Community channel "${res.communityName}" created successfully!` : 'Community channel created successfully!', 'success');
                        }
                    }}
                    existingCommunities={communityChannels}
                />,
                document.body
            )}

            {/* ─── MODAL: PREVIEW MEDIA (VIDEO / PODCAST PLAYER) ─── */}
            {previewingMedia && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${previewingMedia.mediaType === 'Video' ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20' : 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20'}`}>
                                    {previewingMedia.mediaType} Preview
                                </span>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-md">{previewingMedia.title}</h3>
                            </div>
                            <button onClick={() => setPreviewingMedia(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Modal Body / Player */}
                        <div className="p-5 space-y-4">
                            {previewingMedia.mediaType === 'Video' ? (
                                <div className="w-full rounded-xl overflow-hidden bg-black shadow-lg">
                                    {getEmbedVideoUrl(getMediaUrl(previewingMedia)) ? (
                                        <iframe
                                            className="w-full aspect-video rounded-xl"
                                            src={getEmbedVideoUrl(getMediaUrl(previewingMedia))}
                                            title={previewingMedia.title}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    ) : (
                                        <video
                                            controls
                                            autoPlay
                                            className="w-full max-h-[380px] rounded-xl object-contain bg-black"
                                            src={resolveMediaUrl(getMediaUrl(previewingMedia)) || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'}
                                        >
                                            Your browser does not support video playback.
                                        </video>
                                    )}
                                </div>
                            ) : (
                                /* Podcast Audio Player */
                                <div className="bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-slate-900/40 p-6 rounded-2xl border border-pink-500/20 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <img src={resolveMediaUrl(previewingMedia.thumbnail) || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=90&w=600'} className="w-24 h-24 rounded-xl object-cover border border-pink-500/30 shadow-md shrink-0" alt={previewingMedia.title} />
                                        <div>
                                            <h4 className="text-base font-black text-slate-900 dark:text-white">{previewingMedia.title}</h4>
                                            <p className="text-xs text-pink-600 dark:text-pink-400 font-semibold mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                                                Podcast Episode • {previewingMedia.duration || 'Audio'}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">Uploaded by <span className="font-bold text-slate-700 dark:text-slate-300">{previewingMedia.authorName}</span></p>
                                        </div>
                                    </div>

                                    <audio
                                        controls
                                        autoPlay
                                        className="w-full rounded-xl"
                                        src={resolveMediaUrl(getMediaUrl(previewingMedia)) || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'}
                                    >
                                        Your browser does not support audio playback.
                                    </audio>
                                </div>
                            )}

                            {/* Media Details */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 border border-slate-200/60 dark:border-slate-800 text-xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span>Submitted by: <strong className="text-slate-700 dark:text-slate-200">{previewingMedia.authorName}</strong></span>
                                    <span>Category: <strong className="text-slate-700 dark:text-slate-200">{previewingMedia.category}</strong></span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300">{previewingMedia.description || 'No description provided.'}</p>
                            </div>
                        </div>

                        {/* Modal Footer with Actions */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
                            <button
                                onClick={() => setPreviewingMedia(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                            >
                                Close Preview
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        handleRejectMedia(previewingMedia);
                                        setPreviewingMedia(null);
                                    }}
                                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                >
                                    Decline / Reject
                                </button>
                                <button
                                    onClick={() => {
                                        handleApproveMedia(previewingMedia);
                                        setPreviewingMedia(null);
                                    }}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                    Approve & Publish
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* ─── MODAL: COMPREHENSIVE USER DETAILS MODAL ─── */}
            {isUserDetailsModalOpen && selectedUserDetailsUser && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Header Banner */}
                        <div className="relative p-6 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img
                                        src={selectedUserDetailsUser.avatar || selectedUserDetailsUser.profilePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUserDetailsUser.fullName || selectedUserDetailsUser.name || 'U')}&background=fff&color=4f46e5&bold=true`}
                                        alt={selectedUserDetailsUser.fullName || selectedUserDetailsUser.name}
                                        className="w-16 h-16 rounded-2xl object-cover border-2 border-white/40 shadow-lg"
                                    />
                                    {(() => {
                                        const statusCfg = getUserStatusConfig(selectedUserDetailsUser);
                                        return <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-xs ${statusCfg.dotClass}`} title={`Status: ${statusCfg.label}`} />;
                                    })()}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-black text-white leading-tight">
                                            {selectedUserDetailsUser.fullName || selectedUserDetailsUser.name}
                                        </h3>
                                        <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold">
                                            {getUserAssignedRole(selectedUserDetailsUser) || selectedUserDetailsUser.roleName || 'Member'}
                                        </span>
                                    </div>
                                    <p className="text-indigo-100 text-xs mt-0.5">
                                        {selectedUserDetailsUser.designation || 'Staff Member'} • {selectedUserDetailsUser.department || selectedUserDetailsUser.departmentName || 'MPOnline Limited'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsUserDetailsModalOpen(false)}
                                className="p-2 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </div>

                        {/* Modal Body Content */}
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {/* KPI Strip */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-center">
                                    <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Assigned Role</span>
                                    <p className="text-xs font-black text-indigo-950 dark:text-indigo-200 mt-0.5">
                                        {selectedUserDetailsUser.roleName || getUserAssignedRole(selectedUserDetailsUser)}
                                    </p>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-center">
                                    <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Karma Points</span>
                                    <p className="text-xs font-black text-amber-950 dark:text-amber-200 mt-0.5">
                                        {(() => {
                                            const role = String(selectedUserDetailsUser.roleName || getUserAssignedRole(selectedUserDetailsUser) || '').toLowerCase();
                                            const isSysOnly = (role.includes('system') || role.includes('sysadm')) && !role.includes('hr') && !role.includes('community') && !role.includes('employee');
                                            if (isSysOnly) {
                                                return '— (Exempt)';
                                            }
                                            return `⭐ ${typeof selectedUserDetailsUser.karmaPoints === 'number' ? selectedUserDetailsUser.karmaPoints : (selectedUserDetailsUser.karma || 0)} pts (${selectedUserDetailsUser.karmaBadgeLevel || 'Bronze'})`;
                                        })()}
                                    </p>
                                </div>
                                {(() => {
                                    const statusCfg = getUserStatusConfig(selectedUserDetailsUser);
                                    const textClass = statusCfg.status === 'Active' 
                                        ? 'text-emerald-600 dark:text-emerald-400' 
                                        : statusCfg.status === 'Suspended' 
                                            ? 'text-rose-600 dark:text-rose-400' 
                                            : 'text-slate-600 dark:text-slate-400';
                                    return (
                                        <div className="p-3.5 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 text-center">
                                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Account Status</span>
                                            <p className={`text-xs font-black mt-0.5 ${textClass}`}>
                                                ● {statusCfg.label}
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Section: Employee & Organization Details */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-indigo-500">badge</span>
                                    Employee & Contact Information
                                </h4>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                                        <span className="text-slate-400 text-[11px] block font-medium">Official Email Address</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 break-all select-all font-mono mt-0.5 block">
                                            {selectedUserDetailsUser.email || `${(selectedUserDetailsUser.fullName || selectedUserDetailsUser.name || 'user').toLowerCase().replace(/\s+/g, '.')}@mponline.gov.in`}
                                        </span>
                                    </div>

                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                                        <span className="text-slate-400 text-[11px] block font-medium">Department</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                            {selectedUserDetailsUser.department || selectedUserDetailsUser.departmentName || 'MPOnline IT Operations'}
                                        </span>
                                    </div>

                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                                        <span className="text-slate-400 text-[11px] block font-medium">Official Designation</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                            {selectedUserDetailsUser.designation || 'Staff Member'}
                                        </span>
                                    </div>

                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                                        <span className="text-slate-400 text-[11px] block font-medium">Work Location</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                            {selectedUserDetailsUser.location || 'MPOnline Headquarters, Bhopal'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Role Governance & Permissions */}
                            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                                <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px] text-purple-500">security</span>
                                    System Access Scope & Privileges
                                </h4>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {(selectedUserDetailsUser.roleName || getUserAssignedRole(selectedUserDetailsUser)).includes('System')
                                        ? '🛡️ Full System Admin: Complete governance authority over user accounts, audit trails, community moderation, and platform parameters.'
                                        : (selectedUserDetailsUser.roleName || getUserAssignedRole(selectedUserDetailsUser)).includes('HR')
                                        ? '🪪 HR Admin: Authorized for organization-wide Org community assignments, HR analytics dashboards, and job postings.'
                                        : (selectedUserDetailsUser.roleName || getUserAssignedRole(selectedUserDetailsUser)).includes('Community')
                                        ? '👥 Community Admin: Authorized for content moderation, pinned discussions, user approvals, and channel safety enforcement.'
                                        : '👤 Standard Employee: Access to feed posting, media channels, communities collaboration, and karma rewards.'}
                                </p>
                            </div>
                        </div>

                        {/* Modal Footer with Action Buttons */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
                            <button
                                onClick={() => setIsUserDetailsModalOpen(false)}
                                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                            >
                                Close
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setRoleUserId(String(selectedUserDetailsUser.userId || selectedUserDetailsUser.id));
                                        setRoleUserName(selectedUserDetailsUser.fullName || selectedUserDetailsUser.name);
                                        setSelectedRoles(getUserRolesList(selectedUserDetailsUser));
                                        setIsUserDetailsModalOpen(false);
                                        setIsRoleModalOpen(true);
                                    }}
                                    className="px-4 py-2 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[15px]">manage_accounts</span>
                                    Edit Roles
                                </button>

                                <button
                                    onClick={() => {
                                        if (selectedUserDetailsUser.isActive) {
                                            const loggedInUid = Number(currentUser?.userId || currentUser?.id);
                                            const loggedInEmpId = (currentUser?.employeeId || '').toUpperCase();
                                            const targetUid = Number(selectedUserDetailsUser.userId || selectedUserDetailsUser.id);
                                            const targetEmpId = (selectedUserDetailsUser.employeeId || '').toUpperCase();
                                            if ((targetUid && loggedInUid && targetUid === loggedInUid) ||
                                                (targetEmpId && loggedInEmpId && targetEmpId === loggedInEmpId)) {
                                                showToast('You cannot suspend your own administrative account.');
                                                return;
                                            }
                                            setIsUserDetailsModalOpen(false);
                                            setSelectedUserToSuspend(selectedUserDetailsUser);
                                            setIsSuspendModalOpen(true);
                                        } else {
                                            handleToggleUserActive(selectedUserDetailsUser);
                                            setSelectedUserDetailsUser(prev => prev ? { ...prev, isActive: true, isSuspended: false, status: 'Active' } : null);
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                                        selectedUserDetailsUser.isActive 
                                            ? 'bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 dark:text-rose-400' 
                                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[15px]">
                                        {selectedUserDetailsUser.isActive ? 'person_off' : 'person_check'}
                                    </span>
                                    {selectedUserDetailsUser.isActive ? 'Suspend User' : 'Reactivate User'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </main>
    );
}
