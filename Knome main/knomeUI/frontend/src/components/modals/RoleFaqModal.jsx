import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '../contexts/UserContext';
import { ROLE_USER_MANUALS, printRoleManualPdf } from '../../utils/roleManualsData';
import HighlightText from '../ui/HighlightText';

const STORAGE_KEY_FAQS = 'knome_role_faqs_v4';
const STORAGE_KEY_RULES = 'knome_role_rules_v3';

// Utility to clean any markdown characters and preserve plain English text
export const stripMarkdown = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<u>([^<]+)<\/u>/gi, '$1')
        .replace(/#{1,6}\s+/g, '')
        .trim();
};

// Default Role Metas & Rules in clear, friendly language
const DEFAULT_ROLES_META = {
    employee: {
        id: 'employee',
        label: 'Employee',
        title: 'Employee',
        badge: 'Employee Guide',
        icon: 'person',
        color: 'blue',
        accentBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        activeTabClass: 'bg-blue-600 text-white shadow-md shadow-blue-500/20',
        scopeDescription: 'Share posts and articles, watch videos, listen to podcasts, join communities, and earn karma points by helping your colleagues.',
        keyAreas: ['Home Feed & Posts', 'Articles', 'Videos & Podcasts', 'Communities', 'Karma Points']
    },
    communityAdmin: {
        id: 'communityAdmin',
        label: 'Community Admin',
        title: 'Community Admin',
        badge: 'Community Guide',
        icon: 'groups',
        color: 'purple',
        accentBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        activeTabClass: 'bg-purple-600 text-white shadow-md shadow-purple-500/20',
        scopeDescription: 'Accept new members, pin important updates to the top, set community rules, and keep group discussions friendly and helpful.',
        keyAreas: ['Member Requests', 'Pinned Posts', 'Community Rules & FAQs', 'Member Management', 'Group Settings']
    },
    hrAdmin: {
        id: 'hrAdmin',
        label: 'HR Admin',
        title: 'HR Admin',
        badge: 'HR Guide',
        icon: 'badge',
        color: 'emerald',
        accentBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        activeTabClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20',
        scopeDescription: 'Post internal job openings, approve new community requests, send company announcements, and view team engagement numbers.',
        keyAreas: ['Job Openings', 'Company Announcements', 'Community Requests', 'HR Analytics']
    },
    systemAdmin: {
        id: 'systemAdmin',
        label: 'System Admin',
        title: 'System Admin',
        badge: 'System Admin Guide',
        icon: 'shield_person',
        color: 'amber',
        accentBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        activeTabClass: 'bg-amber-600 text-white shadow-md shadow-amber-500/20',
        scopeDescription: 'Manage user accounts and roles, review reported posts, and check system activity logs.',
        keyAreas: ['User Accounts & Roles', 'Account Status', 'Reported Content', 'System Activity Logs']
    }
};

// Easy-to-understand Frequently Asked Questions for Each Role (Plain English)
const DEFAULT_FAQ_DATA = {
    employee: [
        {
            id: 1,
            category: 'Posts & Feed',
            question: 'How do I create and share a post?',
            answer: `Sharing an update with your colleagues is simple:
1. Go to the Home feed or Posts page.
2. Click inside the "Create Post" box.
3. Write your message (up to 400 characters). You can:
   - Tag a coworker: Type @ and choose their name.
   - Add a topic: Type hashtags like #Project or #MPOnline.
   - Attach files: Add photos, videos (MP4), audio clips (MP3), or documents (PDF).
4. Choose who can see your post:
   - Everyone: All colleagues across MPOnline.
   - Specific Community: Only members of a group you choose.
   - Specific People: Only the colleagues you pick.
5. Click "Post Now" to share immediately, or click the clock icon to schedule it for later.`
        },
        {
            id: 2,
            category: 'Scheduling',
            question: 'How do I schedule a post or article for later?',
            answer: `You can write content now and have Knome publish it automatically later:
- While writing your post or article, click the clock icon (Schedule).
- Pick a future date and time, or choose a quick shortcut like "+1 Min", "Tonight 8 PM", or "Tomorrow 9 AM".
- Click "Schedule".
- Private until published: Only you can see your scheduled drafts.
- You can view, publish immediately, or cancel your scheduled items anytime under the Scheduled tab on the Posts or Articles page.`
        },
        {
            id: 3,
            category: 'Karma Points',
            question: 'What are Karma Points and how do I earn them?',
            answer: `Karma points reward you for participating and sharing helpful knowledge with your team:
- How to earn points:
  - Share a post: +2 Points
  - Publish an article: +5 Points
  - Upload a video or podcast: +3 Points
  - When someone likes your post: +1 Point
  - When someone comments on your post: +1 Point
- Badges you can reach:
  - Starter: 0 to 99 points (Welcome badge)
  - Bronze: 100 to 249 points
  - Silver: 250 to 499 points
  - Gold: 500 to 999 points
  - Platinum: 1,000+ points (Top Contributor)
- Click the Karma badge in the top menu anytime to see your score, rank, and history.`
        },
        {
            id: 4,
            category: 'Communities',
            question: 'How do I join, explore, or create a Community?',
            answer: `Communities let you connect with coworkers who share your department, project, or interests:
- Company Groups: You are automatically a member of core company groups like MPOnline Official.
- Public Groups: Click Communities in the menu, find an interesting group, and click "Join Community" to join right away.
- Private Groups: Click "Request Access" and the group admin will review your request.
- Starting a New Group: Click "Create Community", add a title, description, and photo, then submit. An HR Admin will review and approve it.`
        },
        {
            id: 5,
            category: 'Articles',
            question: 'How do I write and format an Article?',
            answer: `Articles are great for longer guides, detailed tutorials, and project notes:
1. Go to Articles in the top menu and click "Write Article".
2. Enter a title, choose a category, and upload a cover picture.
3. Write your content using the simple formatting toolbar:
   - Make text bold, italic, or underlined.
   - Add bullet lists or numbered steps.
4. When you are ready, click "Publish" to share it, or schedule it for a future date.`
        },
        {
            id: 6,
            category: 'Videos & Podcasts',
            question: 'How do Videos and Podcasts work?',
            answer: `You can watch and listen to useful training and team updates anytime:
- Videos: Watch recorded presentations, town halls, and tutorials. You can upload video files (MP4) up to 500MB or embed YouTube videos.
- Podcasts: Listen to audio talks and interviews, or record and upload your own audio episodes (MP3).
- You can like, comment, and save your favorite videos and podcasts to Saved Content to revisit them later.`
        },
        {
            id: 7,
            category: 'Privacy & Safety',
            question: 'How do I protect my privacy or report inappropriate content?',
            answer: `Knome is designed to be a safe, positive, and respectful workplace:
- Report a post: If you see any rude, offensive, or inappropriate content, click the three dots menu on that post and choose "Report Content". Our admin team will review it immediately.
- Profile Privacy: Go to Profile, select Edit Profile, and choose whether your bio and photo are visible to everyone or kept private.`
        }
    ],

    communityAdmin: [
        {
            id: 101,
            category: 'Role Basics',
            question: 'What can a Community Admin do?',
            answer: `As a Community Admin, you help run your group smoothly:
- Review and accept requests from colleagues who want to join.
- Pin up to 3 important announcements to the top of your feed.
- Set helpful rules and FAQs for your community members.
- Delete inappropriate posts and temporarily pause disruptive members if needed.`
        },
        {
            id: 102,
            category: 'Members',
            question: 'How do I accept or decline member requests?',
            answer: `To manage people asking to join your private community:
1. Open your community and click the Admin Tools or Members tab.
2. Look under Pending Requests.
3. Click "Approve" to welcome them, or "Decline" if they should not join.
4. You can also invite colleagues directly by clicking "Invite Employees".`
        },
        {
            id: 103,
            category: 'Pinned Posts',
            question: 'How do I pin important posts to the top?',
            answer: `Keep important announcements where everyone can see them:
- Click the three dots menu on any post in your community and select "Pin to Community".
- You can have up to 3 pinned posts at a time.
- Pinned posts always stay at the top of your group feed with a pin badge.
- To pin a fourth post, simply unpin one of your older posts first.`
        },
        {
            id: 104,
            category: 'Community Care',
            question: 'How do I remove bad posts or pause a member?',
            answer: `You have simple controls to keep your community welcoming and respectful:
- Delete a post: Click the three dots menu on any post in your group and choose Delete.
- Pause a member: If someone repeatedly posts spam or breaks rules:
  1. Go to the Members tab in your community.
  2. Find their name and click "Suspend Member".
  3. Pick a duration (such as 1 day, 7 days, or 30 days) and write a short reason.
  4. While suspended, they can still read posts but cannot post or comment until the time ends.`
        },
        {
            id: 105,
            category: 'Rules & FAQs',
            question: 'How do I set up Community Rules and FAQs?',
            answer: `Help members know what is expected in your community:
1. Go to your community and click Admin Tools, then select Rules & FAQs.
2. Add simple guidelines (like "Be respectful" and "Stay on topic").
3. Add common questions and answers.
4. Click "Save". They will appear on the right side of your community page immediately.`
        }
    ],

    hrAdmin: [
        {
            id: 201,
            category: 'Job Openings',
            question: 'How do I post an internal job opening?',
            answer: `Help colleagues discover new career opportunities at MPOnline:
1. Click Openings in the top menu.
2. Click "Post New Opening".
3. Fill in the job title, department, location, required skills, and deadline.
4. Click "Publish Opportunity".
5. The job post appears on the Openings board for all employees and automatically closes after the deadline.`
        },
        {
            id: 202,
            category: 'Announcements',
            question: 'How do I send an announcement to all employees?',
            answer: `When you have important company news to share:
- Home Feed Post: Create a post and set the Audience to "Everyone" so it appears on all employees' home feeds.
- Notification Bell Broadcast: Use the Broadcast feature to send an instant alert directly to every employee's notification bell with an alert chime.`
        },
        {
            id: 203,
            category: 'Community Requests',
            question: 'How do I approve a new community request?',
            answer: `When a colleague suggests a new community:
1. Open the Admin Console or Communities page and view Community Requests.
2. Review the proposed group name, purpose, and lead.
3. Click "Approve" to create the group right away and make the creator its admin, or click "Decline" with helpful feedback.`
        },
        {
            id: 204,
            category: 'HR Analytics',
            question: 'What information is shown on the HR Analytics page?',
            answer: `The HR Analytics page gives you a clear snapshot of team engagement:
- Employee Counts: Total registered, active, and paused employee accounts.
- Department Activity: Which teams are most active in sharing and learning.
- Karma Overview: Total karma earned and top contributors across the company.
- Community Engagement: How active groups are and where collaboration is happening.`
        }
    ],

    systemAdmin: [
        {
            id: 301,
            category: 'Admin Scope',
            question: 'What can a System Administrator do?',
            answer: `System Administrators have full control over platform settings and safety:
- Access the full Admin Console (/admin-console).
- Assign and change user roles (Employee, Community Admin, HR Admin, System Admin).
- Pause or reactivate employee accounts.
- Review and resolve reported posts and comments.
- View system activity logs to see all administrative changes.`
        },
        {
            id: 302,
            category: 'Moderation',
            question: 'How do I handle reported posts?',
            answer: `When an employee reports a post or comment:
1. Open the Admin Console and click the Content Moderation tab.
2. Click any report to view the reported content, author, and reason.
3. Choose an action:
   - Dismiss: Keep the post if it follows company guidelines.
   - Delete Content: Permanently remove the post from all feeds.
   - Suspend User: Pause the author's account if the violation was serious.`
        },
        {
            id: 303,
            category: 'Roles & Permissions',
            question: 'How do I change an employee role?',
            answer: `To update an employee's permissions:
1. In the Admin Console, click the User Governance tab.
2. Search for the employee by name or ID.
3. Click "Edit Roles" and pick their new role.
4. Save changes. Their permissions update immediately and they receive an email notification.`
        },
        {
            id: 304,
            category: 'Account Suspension',
            question: 'How does account suspension work?',
            answer: `If an account needs to be paused for safety or policy reasons:
1. Click "Suspend User" next to their name in the Admin Console.
2. Choose a duration (such as 1 day, 7 days, 30 days, or until reactivated) and enter a reason.
3. While suspended, the user cannot log in and will see a clear message explaining that their account is temporarily paused.
4. You can click "Reactivate User" at any time to restore their access immediately.`
        },
        {
            id: 305,
            category: 'Activity Logs',
            question: 'How do I check system activity logs?',
            answer: `To review what administrative actions have been taken:
1. Open the Admin Console and click Audit Logs.
2. You will see a clear, dated list of actions such as role updates, suspensions, and content deletions.
3. You can filter by date, action type, or admin name to easily find specific events.`
        }
    ]
};

/**
 * Role-Based Knome FAQ & Usage Handbook Modal
 * Rules & Access Control:
 * 1. Each standard role (Employee, Community Admin, HR Admin) can see ONLY their own FAQ & rules.
 * 2. System Administrator can see ALL role FAQs.
 * 3. System Administrator can edit, add, delete, and customize rules and FAQs across all roles.
 */
export default function RoleFaqModal({ isOpen, onClose }) {
    const { currentUser } = useUser();

    // Determine current user role category
    const userRoleCategory = useMemo(() => {
        if (!currentUser) return 'employee';
        const role = String(currentUser?.roleName || currentUser?.role || currentUser?.designation || '').toLowerCase();
        const roles = Array.isArray(currentUser?.roles) ? currentUser.roles.map(r => String(r).toLowerCase()) : [];

        if (role.includes('system') || role.includes('sysadm') || roles.some(r => r.includes('sysadm') || r.includes('system'))) {
            return 'systemAdmin';
        }
        if (role.includes('hr') || roles.some(r => r.includes('hr'))) {
            return 'hrAdmin';
        }
        if (role.includes('community') || role.includes('cadm') || roles.some(r => r.includes('community') || r.includes('cadm'))) {
            return 'communityAdmin';
        }
        return 'employee';
    }, [currentUser]);

    const isSysAdmin = userRoleCategory === 'systemAdmin';

    // State for FAQs and Roles (loaded from persistent storage or defaults)
    const [allFaqs, setAllFaqs] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_FAQS);
            if (saved) return JSON.parse(saved);
        } catch (_) {}
        return DEFAULT_FAQ_DATA;
    });

    const [allRolesMeta, setAllRolesMeta] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_RULES);
            if (saved) return JSON.parse(saved);
        } catch (_) {}
        return DEFAULT_ROLES_META;
    });

    // Active role selection: if not sysAdmin, strictly lock to userRoleCategory
    const [selectedRole, setSelectedRole] = useState(userRoleCategory);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedIds, setExpandedIds] = useState(new Set([1, 101, 201, 301]));
    const [toastMessage, setToastMessage] = useState('');

    // System Admin Edit State
    const [isEditingMode, setIsEditingMode] = useState(false);
    const [editingFaqId, setEditingFaqId] = useState(null);
    const [faqEditForm, setFaqEditForm] = useState({ category: '', question: '', answer: '' });
    
    // Add New FAQ state
    const [isAddingNewFaq, setIsAddingNewFaq] = useState(false);
    const [newFaqForm, setNewFaqForm] = useState({ category: 'General Guidance', question: '', answer: '' });

    // Role Rules Editing State
    const [isEditingRules, setIsEditingRules] = useState(false);
    const [rulesScopeText, setRulesScopeText] = useState('');

    // Re-synchronize when modal opens
    useEffect(() => {
        if (isOpen) {
            if (!isSysAdmin) {
                setSelectedRole(userRoleCategory);
                setIsEditingMode(false);
            }
            setSearchQuery('');
            setEditingFaqId(null);
            setIsAddingNewFaq(false);
            setIsEditingRules(false);
        }
    }, [isOpen, userRoleCategory, isSysAdmin]);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3500);
    };

    // Save FAQs helper
    const saveFaqsState = (updatedFaqs) => {
        setAllFaqs(updatedFaqs);
        try {
            localStorage.setItem(STORAGE_KEY_FAQS, JSON.stringify(updatedFaqs));
            window.dispatchEvent(new CustomEvent('knome-role-faqs-updated', { detail: updatedFaqs }));
        } catch (e) {
            console.error('Failed to persist role faqs', e);
        }
    };

    // Save Role Rules helper
    const saveRulesState = (updatedRoles) => {
        setAllRolesMeta(updatedRoles);
        try {
            localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(updatedRoles));
            window.dispatchEvent(new CustomEvent('knome-role-rules-updated', { detail: updatedRoles }));
        } catch (e) {
            console.error('Failed to persist role rules', e);
        }
    };

    const toggleAccordion = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = (items) => {
        setExpandedIds(new Set(items.map(item => item.id)));
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    // Start inline editing of an existing FAQ
    const handleStartEditFaq = (faq) => {
        setEditingFaqId(faq.id);
        setFaqEditForm({
            category: faq.category || 'General Guidance',
            question: faq.question || '',
            answer: faq.answer || ''
        });
        if (!expandedIds.has(faq.id)) {
            toggleAccordion(faq.id);
        }
    };

    // Save edited FAQ
    const handleSaveFaqEdit = (faqId) => {
        if (!faqEditForm.question.trim() || !faqEditForm.answer.trim()) {
            showToast('Question and Answer cannot be empty.');
            return;
        }

        const roleList = allFaqs[selectedRole] || [];
        const updatedList = roleList.map(item => {
            if (item.id === faqId) {
                return {
                    ...item,
                    category: faqEditForm.category.trim() || 'General Guidance',
                    question: faqEditForm.question.trim(),
                    answer: faqEditForm.answer.trim()
                };
            }
            return item;
        });

        const updatedAll = { ...allFaqs, [selectedRole]: updatedList };
        saveFaqsState(updatedAll);
        setEditingFaqId(null);
        showToast('FAQ updated successfully!');
    };

    // Delete an FAQ item
    const handleDeleteFaq = (faqId) => {
        const roleList = allFaqs[selectedRole] || [];
        const updatedList = roleList.filter(item => item.id !== faqId);
        const updatedAll = { ...allFaqs, [selectedRole]: updatedList };
        saveFaqsState(updatedAll);
        showToast('FAQ item deleted.');
    };

    // Add New FAQ
    const handleCreateNewFaq = () => {
        if (!newFaqForm.question.trim() || !newFaqForm.answer.trim()) {
            showToast('Please enter both question and answer.');
            return;
        }

        const newId = Date.now();
        const roleList = allFaqs[selectedRole] || [];
        const newItem = {
            id: newId,
            category: newFaqForm.category.trim() || 'General Guidance',
            question: newFaqForm.question.trim(),
            answer: newFaqForm.answer.trim()
        };

        const updatedList = [newItem, ...roleList];
        const updatedAll = { ...allFaqs, [selectedRole]: updatedList };
        saveFaqsState(updatedAll);
        setIsAddingNewFaq(false);
        setNewFaqForm({ category: 'General Guidance', question: '', answer: '' });
        setExpandedIds(prev => new Set([newId, ...prev]));
        showToast('New FAQ item added successfully!');
    };

    // Start editing role rules / scope description
    const handleStartEditRules = () => {
        const currMeta = allRolesMeta[selectedRole] || DEFAULT_ROLES_META[selectedRole];
        setRulesScopeText(currMeta.scopeDescription || '');
        setIsEditingRules(true);
    };

    // Save edited role rules / scope description
    const handleSaveRules = () => {
        if (!rulesScopeText.trim()) {
            showToast('Scope and rules description cannot be empty.');
            return;
        }

        const currMeta = allRolesMeta[selectedRole] || DEFAULT_ROLES_META[selectedRole];
        const updatedRoles = {
            ...allRolesMeta,
            [selectedRole]: {
                ...currMeta,
                scopeDescription: rulesScopeText.trim()
            }
        };

        saveRulesState(updatedRoles);
        setIsEditingRules(false);
        showToast(`Rules & scope for ${currMeta.title} updated successfully!`);
    };

    // Reset current role to factory defaults
    const handleResetRoleDefaults = () => {
        const defaultRoleFaqs = DEFAULT_FAQ_DATA[selectedRole] || [];
        const updatedAll = { ...allFaqs, [selectedRole]: defaultRoleFaqs };
        saveFaqsState(updatedAll);

        const defaultRoleMeta = DEFAULT_ROLES_META[selectedRole];
        const updatedRoles = { ...allRolesMeta, [selectedRole]: defaultRoleMeta };
        saveRulesState(updatedRoles);

        setEditingFaqId(null);
        setIsAddingNewFaq(false);
        setIsEditingRules(false);
        showToast(`Reset ${defaultRoleMeta.title} to default rules and FAQs.`);
    };

    if (!isOpen) return null;

    // Roles array based on access permission:
    // Non-admins see ONLY their own role. System Admins see all 4 roles.
    const ALL_ROLES_ARRAY = [
        allRolesMeta.employee || DEFAULT_ROLES_META.employee,
        allRolesMeta.communityAdmin || DEFAULT_ROLES_META.communityAdmin,
        allRolesMeta.hrAdmin || DEFAULT_ROLES_META.hrAdmin,
        allRolesMeta.systemAdmin || DEFAULT_ROLES_META.systemAdmin,
    ];

    const accessibleRoles = isSysAdmin
        ? ALL_ROLES_ARRAY
        : ALL_ROLES_ARRAY.filter(r => r.id === userRoleCategory);

    // Active role metadata, active role FAQs, and role user manual
    const currentActiveRoleId = isSysAdmin ? selectedRole : userRoleCategory;
    const currentRoleMeta = allRolesMeta[currentActiveRoleId] || DEFAULT_ROLES_META[currentActiveRoleId];
    const roleFaqs = allFaqs[currentActiveRoleId] || [];
    const currentManualData = ROLE_USER_MANUALS[currentActiveRoleId] || ROLE_USER_MANUALS.employee;

    // Filter FAQs by search query
    const filteredFaqs = searchQuery.trim()
        ? roleFaqs.filter(faq => 
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.category.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : roleFaqs;

    // PDF Download Action Handler
    const handleDownloadPdf = () => {
        setIsGeneratingPdf(true);
        showToast(`Preparing ${currentRoleMeta.title} PDF Manual...`);
        try {
            printRoleManualPdf(currentActiveRoleId, currentManualData, roleFaqs, currentRoleMeta);
            setTimeout(() => {
                setIsGeneratingPdf(false);
                showToast('PDF print preview ready! Choose "Save as PDF" to download.');
            }, 700);
        } catch (e) {
            console.error('Failed to export PDF manual', e);
            setIsGeneratingPdf(false);
            showToast('Failed to export PDF manual.');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-200">
                
                {/* ─── TOAST NOTIFICATION ─── */}
                {toastMessage && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold rounded-2xl shadow-xl border border-slate-700/50 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-400">check_circle</span>
                        <span>{toastMessage}</span>
                    </div>
                )}

                {/* ─── MODAL HEADER (PINNED) ─── */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm shrink-0 sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black shrink-0 shadow-xs">
                            <span className="material-symbols-outlined text-2xl">
                                help
                            </span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                    Frequently Asked Questions guide
                                </h3>
                                {isSysAdmin && (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                        Master Admin View
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Single User Manual Download Button */}
                        <button
                            onClick={handleDownloadPdf}
                            disabled={isGeneratingPdf}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xs shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                            title={`Download official User Manual PDF for ${currentRoleMeta.title}`}
                        >
                            <span className="material-symbols-outlined text-[16px]">
                                {isGeneratingPdf ? 'hourglass_top' : 'download'}
                            </span>
                            <span className="hidden sm:inline">
                                {isGeneratingPdf ? 'Generating...' : 'Download User Manual'}
                            </span>
                            <span className="sm:hidden">Manual</span>
                        </button>

                        {/* System Admin: Edit Rules & FAQs Toggle */}
                        {isSysAdmin && (
                            <button
                                onClick={() => {
                                    setIsEditingMode(!isEditingMode);
                                    setEditingFaqId(null);
                                    setIsAddingNewFaq(false);
                                    setIsEditingRules(false);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                                    isEditingMode 
                                        ? 'bg-rose-500 hover:bg-rose-600 text-white' 
                                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50 border border-indigo-500/20'
                                }`}
                                title={isEditingMode ? 'Exit Admin Edit Mode' : 'Edit Rules & FAQs for this role'}
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    {isEditingMode ? 'check_circle' : 'edit_note'}
                                </span>
                                <span>{isEditingMode ? 'Finish Editing' : 'Edit Rules & FAQs'}</span>
                            </button>
                        )}

                        <button 
                            onClick={onClose}
                            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                            title="Close Frequently Asked Questions guide"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                </div>

                {/* ─── ROLE SELECTOR & SEARCH BAR ─── */}
                <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        
                        {/* If System Admin: Show interactive tabs across all 4 roles.
                            If Employee / CommAdmin / HRAdmin: Strictly show ONLY their dedicated role manual badge. */}
                        {isSysAdmin ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                {accessibleRoles.map(role => {
                                    const isSelected = selectedRole === role.id;
                                    const isUserActiveRole = userRoleCategory === role.id;

                                    return (
                                        <button
                                            key={role.id}
                                            onClick={() => {
                                                setSelectedRole(role.id);
                                                setEditingFaqId(null);
                                                setIsAddingNewFaq(false);
                                                setIsEditingRules(false);
                                                const firstId = (allFaqs[role.id] || [])[0]?.id;
                                                if (firstId) setExpandedIds(new Set([firstId]));
                                            }}
                                            className={`relative px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                                isSelected 
                                                    ? role.activeTabClass 
                                                    : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[17px]">
                                                {role.icon}
                                            </span>
                                            <span>{role.label}</span>

                                            {isUserActiveRole && (
                                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                                    isSelected 
                                                        ? 'bg-white/25 text-white' 
                                                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                                                }`}>
                                                    Your Role
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5">
                                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                                    <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-[18px]">
                                        {currentRoleMeta.icon}
                                    </span>
                                    <span>Your Role: <strong>{currentRoleMeta.title}</strong></span>
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                </div>
                            </div>
                        )}

                        {/* Search Input */}
                        <div className="relative min-w-[200px] sm:min-w-[250px]">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                search
                            </span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search questions & categories..."
                                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ─── MODAL BODY (SCROLLABLE) ─── */}
                <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1 min-h-0">
                    <div className="space-y-6 animate-in fade-in duration-200">
                    
                    {/* System Admin Notice Banner when in Edit Mode */}
                    {isSysAdmin && isEditingMode && (
                        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl shrink-0">
                                    admin_panel_settings
                                </span>
                                <div>
                                    <p className="font-bold">System Administrator Rule Editor</p>
                                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-0.5">
                                        You are customizing rules and FAQs for <strong>{currentRoleMeta.title}</strong>. Changes take effect immediately for all users in this role.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                <button
                                    onClick={() => setIsAddingNewFaq(true)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    <span>Add FAQ Item</span>
                                </button>
                                <button
                                    onClick={handleResetRoleDefaults}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold text-xs rounded-xl border border-amber-400/40 cursor-pointer"
                                    title="Reset this role to default questions and rules"
                                >
                                    Reset to Defaults
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Role Banner / Scope Card */}
                    <div className={`p-4 sm:p-5 rounded-2xl border ${currentRoleMeta.accentBg} flex flex-col gap-3 shadow-xs`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                                        {currentRoleMeta.title} Quick Guide
                                    </h4>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-white/70 dark:bg-slate-900/60 border border-current">
                                        {currentRoleMeta.badge}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                {isSysAdmin && isEditingMode && !isEditingRules && (
                                    <button
                                        onClick={handleStartEditRules}
                                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                        <span>Edit Guide</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => expandAll(filteredFaqs)}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                                >
                                    Expand All
                                </button>
                                <button
                                    onClick={collapseAll}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                                >
                                    Collapse All
                                </button>
                            </div>
                        </div>

                        {/* Rules Body / Editor */}
                        {isEditingRules ? (
                            <div className="space-y-3 pt-2">
                                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                    Edit Role Summary Description:
                                </label>
                                <textarea
                                    rows={3}
                                    value={rulesScopeText}
                                    onChange={(e) => setRulesScopeText(e.target.value)}
                                    className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-medium"
                                />
                                <div className="flex items-center gap-2 justify-end">
                                    <button
                                        onClick={() => setIsEditingRules(false)}
                                        className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveRules}
                                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-w-3xl">
                                    {currentRoleMeta.scopeDescription}
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick Topics:</span>
                                    {currentRoleMeta.keyAreas.map((area, idx) => (
                                        <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/60 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-slate-800">
                                            {area}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Form to Add a New FAQ Item (System Admin only) */}
                    {isSysAdmin && isEditingMode && isAddingNewFaq && (
                        <div className="p-5 rounded-2xl border-2 border-dashed border-indigo-400/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3 animate-in fade-in">
                            <div className="flex items-center justify-between">
                                <h5 className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                                    Add New FAQ Question for {currentRoleMeta.title}
                                </h5>
                                <button
                                    onClick={() => setIsAddingNewFaq(false)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                        Category Tag:
                                    </label>
                                    <input
                                        type="text"
                                        value={newFaqForm.category}
                                        onChange={(e) => setNewFaqForm(prev => ({ ...prev, category: e.target.value }))}
                                        placeholder="e.g. Content Sharing, Safety, Approvals"
                                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                        Question Title:
                                    </label>
                                    <input
                                        type="text"
                                        value={newFaqForm.question}
                                        onChange={(e) => setNewFaqForm(prev => ({ ...prev, question: e.target.value }))}
                                        placeholder="e.g. How do I request approval for a community?"
                                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-medium"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    Answer Content (Supports Markdown & Numbered Steps):
                                </label>
                                <textarea
                                    rows={4}
                                    value={newFaqForm.answer}
                                    onChange={(e) => setNewFaqForm(prev => ({ ...prev, answer: e.target.value }))}
                                    placeholder="Explain the workflow, buttons to click, and requirements step-by-step..."
                                    className="w-full p-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-medium"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    onClick={() => setIsAddingNewFaq(false)}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateNewFaq}
                                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs"
                                >
                                    Save New Question
                                </button>
                            </div>
                        </div>
                    )}

                    {/* FAQ Items List */}
                    {filteredFaqs.length > 0 ? (
                        <div className="space-y-3">
                            {filteredFaqs.map((faq) => {
                                const isExpanded = expandedIds.has(faq.id);
                                const isBeingEdited = isSysAdmin && editingFaqId === faq.id;

                                return (
                                    <div 
                                        key={faq.id}
                                        className={`rounded-2xl border bg-white dark:bg-slate-900/90 overflow-hidden shadow-xs transition-all ${
                                            isBeingEdited 
                                                ? 'border-indigo-500 ring-2 ring-indigo-500/20' 
                                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        {/* Question Bar */}
                                        <div className="w-full px-5 py-4 text-left flex items-center justify-between gap-4">
                                            <div 
                                                onClick={() => toggleAccordion(faq.id)}
                                                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                            >
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                                    isExpanded 
                                                        ? 'bg-indigo-600 text-white shadow-xs' 
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}>
                                                    <span className="material-symbols-outlined text-[17px]">
                                                        {isExpanded ? 'help_outline' : 'quiz'}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block truncate">
                                                        <HighlightText text={faq.category} query={searchQuery} />
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight block">
                                                        <HighlightText text={faq.question} query={searchQuery} />
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons: System Admin Edit / Delete + Accordion Arrow */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                {isSysAdmin && isEditingMode && (
                                                    <div className="flex items-center gap-1 mr-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleStartEditFaq(faq);
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                                                            title="Edit this FAQ item"
                                                        >
                                                            <span className="material-symbols-outlined text-[17px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteFaq(faq.id);
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                                            title="Delete this FAQ item"
                                                        >
                                                            <span className="material-symbols-outlined text-[17px]">delete</span>
                                                        </button>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => toggleAccordion(faq.id)}
                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                                        isExpanded 
                                                            ? 'rotate-180 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' 
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-base">expand_more</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Inline Editing Form if System Admin clicked Edit */}
                                        {isBeingEdited ? (
                                            <div className="px-5 pb-5 pt-2 border-t border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-3">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Category</label>
                                                        <input
                                                            type="text"
                                                            value={faqEditForm.category}
                                                            onChange={(e) => setFaqEditForm(prev => ({ ...prev, category: e.target.value }))}
                                                            className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-medium"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Question</label>
                                                        <input
                                                            type="text"
                                                            value={faqEditForm.question}
                                                            onChange={(e) => setFaqEditForm(prev => ({ ...prev, question: e.target.value }))}
                                                            className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-medium"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Answer Content</label>
                                                    <textarea
                                                        rows={5}
                                                        value={faqEditForm.answer}
                                                        onChange={(e) => setFaqEditForm(prev => ({ ...prev, answer: e.target.value }))}
                                                        className="w-full p-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-medium"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => setEditingFaqId(null)}
                                                        className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={() => handleSaveFaqEdit(faq.id)}
                                                        className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer shadow-xs"
                                                    >
                                                        Save Changes
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Regular Answer View */
                                            isExpanded && (
                                                <div className="px-5 pb-5 pt-1 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/60 leading-relaxed font-normal bg-slate-50/50 dark:bg-slate-950/30">
                                                    <div className="prose dark:prose-invert max-w-none text-xs whitespace-pre-line">
                                                        <HighlightText text={stripMarkdown(faq.answer)} query={searchQuery} />
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-12 text-center flex flex-col items-center justify-center space-y-2">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                                <span className="material-symbols-outlined text-2xl">search_off</span>
                            </div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                No questions found
                            </p>
                            <p className="text-xs text-slate-400 max-w-sm">
                                No FAQ items in {currentRoleMeta.title} matched &quot;{searchQuery}&quot;. Try another search term or clear the filter.
                            </p>
                            <button
                                onClick={() => setSearchQuery('')}
                                className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                            >
                                Clear Search Filter
                            </button>
                        </div>
                    )}

                        </div>
                </div>

                {/* ─── MODAL FOOTER (PINNED) ─── */}
                <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex items-center justify-between gap-3 shrink-0 sticky bottom-0 z-20">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[18px] text-emerald-500">verified</span>
                        <span>
                            {isSysAdmin 
                                ? 'System Governance Mode • Rules & FAQ Editor Active' 
                                : `MPOnline Knome Knowledge System • ${currentRoleMeta.title} FAQs`}
                        </span>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
}
