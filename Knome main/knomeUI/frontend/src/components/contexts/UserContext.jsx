import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { apiClient } from '../../utils/apiClient';
import { authApi, profileApi, karmaApi } from '../../utils/apiService';
import { loadSystemApprovalSettingFromBackend } from '../../utils/systemConfig';

/**
 * Maps a human-readable roleName (from Admin UI dropdown) to the short role code
 * used throughout the app for permission checks (currentUser.role).
 */
export const roleNameToCode = {
    'Employee': 'EMP',
    'Community Admin': 'CADM',
    'Community Administrator': 'CADM',
    'HR Administrator': 'HRADM',
    'HR Admin': 'HRADM',
    'System Administrator': 'SYSADM',
    'System Admin': 'SYSADM',
    'Moderator': 'MOD',
    'Pending Role Assignment': 'PENDING',
    'PENDING': 'PENDING',
};

/**
 * Expands any set of roles/codes to include all associated aliases, codes, and canonical names
 * so that any permission check throughout the app (SYSADM, System Admin, System Administrator) succeeds.
 */
export const expandRoles = (rolesList) => {
    if (!rolesList) return ['Employee', 'EMP'];
    const list = Array.isArray(rolesList) ? rolesList : [rolesList];
    const expanded = new Set();
    list.forEach(r => {
        if (!r) return;
        const str = String(r).trim();
        const upper = str.toUpperCase();
        if (upper === 'SYSADM' || upper === 'SYSTEM ADMIN' || upper === 'SYSTEM ADMINISTRATOR' || upper === 'SYSTEMADMIN') {
            expanded.add('System Admin');
            expanded.add('System Administrator');
            expanded.add('SYSADM');
            expanded.add('SystemAdmin');
        } else if (upper === 'HRADM' || upper === 'HR ADMIN' || upper === 'HR ADMINISTRATOR' || upper === 'HRADMIN') {
            expanded.add('HR Admin');
            expanded.add('HR Administrator');
            expanded.add('HRADM');
            expanded.add('HRAdmin');
        } else if (upper === 'CADM' || upper === 'COMMUNITY ADMIN' || upper === 'COMMUNITY ADMINISTRATOR' || upper === 'COMMUNITYADMIN') {
            expanded.add('Community Admin');
            expanded.add('Community Administrator');
            expanded.add('CADM');
            expanded.add('CommunityAdmin');
        } else if (upper === 'MOD' || upper === 'MODERATOR') {
            expanded.add('Moderator');
            expanded.add('MOD');
        } else if (upper === 'EMP' || upper === 'EMPLOYEE') {
            expanded.add('Employee');
            expanded.add('EMP');
        } else {
            expanded.add(str);
        }
    });
    if (expanded.size === 0) {
        expanded.add('Employee');
        expanded.add('EMP');
    }
    return Array.from(expanded);
};

export const KNOWN_ROSTER_NAMES = {
    // 1. Loveneesh Sharma
    'MP0108': 'Loveneesh Sharma',
    '1': 'Loveneesh Sharma',

    // 2. Vishendra Sharma
    'MP0664': 'Vishendra Sharma',
    '1076': 'Vishendra Sharma',
    '2': 'Vishendra Sharma',

    // 3. Sourabh Sahu
    'EMP052': 'Sourabh Sahu',
    '3': 'Sourabh Sahu',

    // 4. Meghna Tiwari
    'Emp101': 'Meghna Tiwari',
    'EMP101': 'Meghna Tiwari',
    '5': 'Meghna Tiwari',

    // 5. Mayur Bansal
    'EMP100': 'Mayur Bansal',
    '1036': 'Mayur Bansal',

    // 6. Vilash Deshmukh
    'MPO089': 'Vilash Deshmukh',
    '1050': 'Vilash Deshmukh',

    // 7. Deepak Simrodia
    'MPO652': 'Deepak Simrodia',
    '1057': 'Deepak Simrodia'
};

export const KNOWN_ROSTER_DETAILS = {
    '1': { designation: 'TPM', roleName: 'System Admin', department: 'Higher Education' },
    'MP0108': { designation: 'TPM', roleName: 'System Admin', department: 'Higher Education' },
    '1076': { designation: 'Track Lead', roleName: 'Community Admin', department: 'Higher Education' },
    'MP0664': { designation: 'Track Lead', roleName: 'Community Admin', department: 'Higher Education' },
    '3': { designation: 'Talent Acquisition Manager', roleName: 'HR Admin', department: 'Human Resources' },
    'EMP052': { designation: 'Talent Acquisition Manager', roleName: 'HR Admin', department: 'Human Resources' },
    '5': { designation: 'Business Analyst', roleName: 'HR Admin', department: 'CTO' },
    'Emp101': { designation: 'Business Analyst', roleName: 'HR Admin', department: 'CTO' },
    'EMP101': { designation: 'Business Analyst', roleName: 'HR Admin', department: 'CTO' },
    '1036': { designation: 'Software Developer', roleName: 'Employee', department: 'Technology' },
    'EMP100': { designation: 'Software Developer', roleName: 'Employee', department: 'Technology' },
    '1050': { designation: 'Associate Consultant', roleName: 'System Admin', department: 'HR' },
    'MPO089': { designation: 'Associate Consultant', roleName: 'System Admin', department: 'HR' },
    '1057': { designation: 'Software Developer', roleName: 'Moderator', department: 'University' },
    'MPO652': { designation: 'Software Developer', roleName: 'Moderator', department: 'University' }
};

const ALLOWED_CANONICAL_NAMES = new Set([
    'loveneeshsharma',
    'vishendrasharma',
    'sourabhsahu',
    'meghnatiwari',
    'meghna',
    'mayurbansal',
    'vilashdeshmukh',
    'deepaksimrodia'
]);

const ALLOWED_CANONICAL_EMPS = new Set([
    'MP0108',
    'MP0664',
    'EMP052',
    'Emp101', 'EMP101',
    'EMP100',
    'MPO089',
    'MPO652'
]);

const ALLOWED_CANONICAL_IDS = new Set([
    '1', '1076', '2', '3', '5', '1036', '1050', '1057'
]);

/**
 * Returns true ONLY if the given user is one of the 7 official active Knome platform users.
 */
export function isPlatformActiveUser(u) {
    if (!u) return false;
    const clean = String(u.name || u.fullName || u.title || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (clean && ALLOWED_CANONICAL_NAMES.has(clean)) return true;

    const emp = String(u.employeeId || u.authorEmployeeId || '').toUpperCase().trim();
    if (emp && ALLOWED_CANONICAL_EMPS.has(emp)) return true;

    const id = String(u.userId || u.id || '').trim();
    if (id && ALLOWED_CANONICAL_IDS.has(id)) return true;

    return false;
}

export const resolveEmployeeName = (rawName, empId, uId, dept) => {
    const cleaned = String(rawName || '').trim();
    const idKey = String(empId || '').trim().toUpperCase();
    const uidKey = String(uId || '').trim();
    const nameKey = cleaned.toUpperCase();
    const deptKey = String(dept || '').trim().toLowerCase();
    const isEmpIdPattern = /^(EMP|MPO|MP)\d+$/i.test(cleaned) || cleaned.toUpperCase().startsWith('NON_EXISTENT');
    const isGeneric = !cleaned || cleaned.toLowerCase() === 'employee' || cleaned.toLowerCase() === 'user' || cleaned.toLowerCase() === 'staff' || cleaned.toLowerCase() === 'unknown' || cleaned.toLowerCase() === 'someone';

    // 1. Direct name match in roster
    if (KNOWN_ROSTER_NAMES[nameKey]) return KNOWN_ROSTER_NAMES[nameKey];

    // 2. Lookup by Employee ID
    if (idKey && KNOWN_ROSTER_NAMES[idKey]) return KNOWN_ROSTER_NAMES[idKey];

    // 3. Lookup by Numeric User ID
    if (uidKey && KNOWN_ROSTER_NAMES[uidKey]) return KNOWN_ROSTER_NAMES[uidKey];

    // 4. Lookup by synthetic MPO+UserId
    if (uidKey && KNOWN_ROSTER_NAMES[`MPO${uidKey}`]) return KNOWN_ROSTER_NAMES[`MPO${uidKey}`];

    // 5. If cleaned is a real name (not generic and not an ID), return it!
    if (!isGeneric && !isEmpIdPattern) return cleaned;

    // 6. If generic or ID pattern, try matching by Department
    if (deptKey) {
        if (deptKey.includes('higher education')) return 'Vishendra Sharma';
        if (deptKey.includes('university')) return 'Deepak Simrodia';
        if (deptKey === 'technology' || deptKey.includes('tech')) return 'Mayur Bansal';
        if (deptKey === 'hr' || deptKey.includes('human resources')) return 'Vilash Deshmukh';
        if (deptKey === 'cto' || deptKey.includes('product design')) return 'Meghna Tiwari';
    }

    // 7. Check INITIAL_USERS
    const initialMatch = INITIAL_USERS.find(iu => 
        (uidKey && String(iu.userId || iu.id) === uidKey) ||
        (idKey && iu.employeeId && String(iu.employeeId).toUpperCase() === idKey)
    );
    if (initialMatch?.name || initialMatch?.fullName) {
        return initialMatch.name || initialMatch.fullName;
    }

    return !isGeneric ? cleaned : (KNOWN_ROSTER_NAMES[idKey] || KNOWN_ROSTER_NAMES[uidKey] || 'Employee');
};

/**
 * Deduplicates community members or employee rosters by employeeId, userId/id, and normalized name.
 * Intelligently merges records to preserve the highest privilege (e.g. Admin over Member)
 * and the most accurate designation (e.g. 'Software Developer' over generic 'Employee').
 */
export const deduplicateMembers = (members = [], contextUsers = []) => {
    if (!Array.isArray(members) || members.length === 0) return [];

    const seen = new Map(); // key -> member
    const uniqueList = [];

    for (const m of members) {
        if (!m) continue;

        const rawEmpId = (m.employeeId || m.empId || m.displayEmpId || '').toString().trim().toUpperCase();
        const rawUid = (m.userId !== undefined && m.userId !== null && m.userId !== '') 
            ? String(m.userId) 
            : ((m.id !== undefined && m.id !== null && m.id !== '' && !isNaN(m.id)) ? String(m.id) : '');
        const rawName = (m.fullName || m.name || m.displayName || '').toString().trim();
        const normName = rawName.toLowerCase();

        // Attempt to find existing match
        let matchedKey = null;
        if (rawEmpId && seen.has(`emp:${rawEmpId}`)) {
            matchedKey = `emp:${rawEmpId}`;
        } else if (rawUid && seen.has(`uid:${rawUid}`)) {
            matchedKey = `uid:${rawUid}`;
        } else if (normName && normName !== 'employee' && normName !== 'member' && !/^(emp|mpo|mp)\d+$/i.test(normName) && seen.has(`name:${normName}`)) {
            matchedKey = `name:${normName}`;
        }

        if (matchedKey) {
            const existing = seen.get(matchedKey);
            const isExistingAdmin = existing.memberType === 'Admin' || existing.isCommAdmin || existing.roleName === 'Admin' || existing.roleName === 'Community Admin' || existing.memberType === 'Community Admin' || existing.memberType === 'Moderator';
            const isNewAdmin = m.memberType === 'Admin' || m.isCommAdmin || m.roleName === 'Admin' || m.roleName === 'Community Admin' || m.memberType === 'Community Admin' || m.memberType === 'Moderator';
            const mergedMemberType = (isExistingAdmin || isNewAdmin) ? 'Admin' : (existing.memberType || m.memberType || 'Member');

            const genericDesigs = ['employee', 'member', 'user'];
            const existingDesig = (existing.designation || existing.displayDesignation || '').toString().trim();
            const newDesig = (m.designation || m.displayDesignation || '').toString().trim();
            let mergedDesig = existingDesig;
            if ((!existingDesig || genericDesigs.includes(existingDesig.toLowerCase())) && newDesig && !genericDesigs.includes(newDesig.toLowerCase())) {
                mergedDesig = newDesig;
            } else if (!mergedDesig && newDesig) {
                mergedDesig = newDesig;
            }

            const existingName = (existing.fullName || existing.name || existing.displayName || '').toString().trim();
            const newName = (m.fullName || m.name || m.displayName || '').toString().trim();
            let mergedName = existingName;
            if ((!existingName || existingName.toLowerCase() === 'employee' || /^(emp|mpo|mp)\d+$/i.test(existingName)) && newName) {
                mergedName = newName;
            }

            const existingDept = (existing.department || existing.displayDepartment || '').toString().trim();
            const newDept = (m.department || m.displayDepartment || '').toString().trim();
            let mergedDept = existingDept;
            if ((!existingDept || existingDept.toLowerCase() === 'mponline') && newDept && newDept.toLowerCase() !== 'mponline') {
                mergedDept = newDept;
            }

            const merged = {
                ...existing,
                ...m,
                userId: existing.userId || m.userId || existing.id || m.id,
                id: existing.id || m.id || existing.userId || m.userId,
                employeeId: existing.employeeId || m.employeeId || rawEmpId,
                fullName: mergedName || existingName || newName,
                name: mergedName || existingName || newName,
                displayName: mergedName || existingName || newName,
                designation: mergedDesig || existingDesig || newDesig || 'Software Developer',
                displayDesignation: mergedDesig || existingDesig || newDesig || 'Software Developer',
                department: mergedDept || existingDept || newDept || 'MPOnline',
                displayDepartment: mergedDept || existingDept || newDept || 'MPOnline',
                memberType: mergedMemberType,
                roleName: (isExistingAdmin || isNewAdmin) ? 'Community Admin' : 'Member',
                isCommAdmin: isExistingAdmin || isNewAdmin,
                status: (existing.status === 'Approved' || m.status === 'Approved') ? 'Approved' : (existing.status || m.status),
                profilePhotoUrl: existing.profilePhotoUrl || m.profilePhotoUrl || existing.avatar || m.avatar
            };

            // Update in uniqueList
            const existingIdx = uniqueList.indexOf(existing);
            if (existingIdx !== -1) {
                uniqueList[existingIdx] = merged;
            }

            // Update lookups
            if (rawEmpId) seen.set(`emp:${rawEmpId}`, merged);
            if (rawUid) seen.set(`uid:${rawUid}`, merged);
            if (normName) seen.set(`name:${normName}`, merged);
            const exEmpId = (existing.employeeId || existing.empId || existing.displayEmpId || '').toString().trim().toUpperCase();
            if (exEmpId) seen.set(`emp:${exEmpId}`, merged);
            const exUid = (existing.userId || existing.id) ? String(existing.userId || existing.id) : '';
            if (exUid) seen.set(`uid:${exUid}`, merged);
            const exName = (existing.fullName || existing.name || '').toString().trim().toLowerCase();
            if (exName && exName !== 'employee') seen.set(`name:${exName}`, merged);
        } else {
            const isAdmin = m.memberType === 'Admin' || m.isCommAdmin === true || m.roleName === 'Admin' || m.roleName === 'Community Admin' || m.memberType === 'Community Admin' || m.memberType === 'Moderator';
            const enhanced = {
                ...m,
                memberType: isAdmin ? 'Admin' : (m.memberType || 'Member'),
                isCommAdmin: isAdmin,
                roleName: isAdmin ? 'Community Admin' : (m.roleName === 'Admin' ? 'Community Admin' : (m.roleName || 'Member'))
            };
            uniqueList.push(enhanced);
            if (rawEmpId) seen.set(`emp:${rawEmpId}`, enhanced);
            if (rawUid) seen.set(`uid:${rawUid}`, enhanced);
            if (normName && normName !== 'employee' && normName !== 'member' && !/^(emp|mpo|mp)\d+$/i.test(normName)) {
                seen.set(`name:${normName}`, enhanced);
            }
        }
    }

    return uniqueList;
};

/**
 * Resolves user status into one of three official states:
 * - 'Active': User is enabled and not under disciplinary suspension
 * - 'Suspended': User is under active administrative or policy suspension
 * - 'Inactive': User account is deactivated or marked inactive
 */
export const resolveUserStatus = (user) => {
    if (!user) return 'Active';
    const uidStr = String(user.userId || user.id || '');
    const empStr = String(user.employeeId || '').toUpperCase();
    try {
        const overrides = JSON.parse(localStorage.getItem('knome_user_overrides') || '{}');
        const o = (uidStr && overrides[uidStr]) || (empStr && overrides[empStr]);
        if (o) {
            if (o.isActive === true && !o.isSuspended) return 'Active';
            if (o.isActive === false || o.isSuspended === true || (o.status && o.status.toLowerCase() === 'suspended')) return 'Suspended';
        }
    } catch {}
    try {
        const savedSusp = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
        if ((uidStr && savedSusp[uidStr]) || (empStr && savedSusp[empStr])) return 'Suspended';
    } catch {}
    const isSuspended = user.isSuspended === true 
        || user.isPermanentlySuspended === true 
        || (user.suspendedUntil && new Date(user.suspendedUntil) > new Date())
        || (typeof user.status === 'string' && user.status.trim().toLowerCase() === 'suspended');
    if (isSuspended) return 'Suspended';
    if (typeof user.status === 'string') {
        const s = user.status.trim().toLowerCase();
        if (s === 'inactive' || s === 'deactivated') return 'Inactive';
        if (s === 'active') return 'Active';
    }
    if (user.isActive === false) return 'Inactive';
    return 'Active';
};

/**
 * Returns UI tokens (label, dot class, badge styling) for the given user status.
 */
export const getUserStatusConfig = (statusOrUser) => {
    const status = typeof statusOrUser === 'string' ? statusOrUser : resolveUserStatus(statusOrUser);
    switch (status) {
        case 'Suspended':
            return {
                status: 'Suspended',
                label: 'Suspended',
                dotClass: 'bg-rose-500',
                badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/40',
                ringClass: 'ring-rose-500/20'
            };
        case 'Inactive':
            return {
                status: 'Inactive',
                label: 'Inactive',
                dotClass: 'bg-slate-400 dark:bg-slate-500',
                badgeClass: 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-700/50',
                ringClass: 'ring-slate-400/20'
            };
        case 'Active':
        default:
            return {
                status: 'Active',
                label: 'Active',
                dotClass: 'bg-emerald-500',
                badgeClass: 'bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/40',
                ringClass: 'ring-emerald-500/20'
            };
    }
};

// Static employee roster for demo login (matches live SQL Server database roster)
// This is the seed — the live state is managed inside UserProvider via useState.
export const INITIAL_USERS = [
    { id: 1, userId: 1, employeeId: 'MP0108', email: 'loveneesh.sharma@mponline.gov.in', name: 'Loveneesh Sharma', fullName: 'Loveneesh Sharma', role: 'SYSADM', roleName: 'System Admin', designation: 'TPM', department: 'Higher Education', location: 'Bhopal HQ', avatar: null, karmaPoints: 0, karma: 0, isActive: true },
    { id: 1076, userId: 1076, employeeId: 'MP0664', email: 'vishendra.sharma@mponline.gov.in', name: 'Vishendra Sharma', fullName: 'Vishendra Sharma', role: 'CADM', roleName: 'Community Admin', designation: 'Track Lead', department: 'Higher Education', location: 'Bhopal HQ', avatar: null, karmaPoints: 225, karma: 225, isActive: true },
    { id: 3, userId: 3, employeeId: 'EMP052', email: 'sourabhsahu45@gmail.com', name: 'Sourabh Sahu', fullName: 'Sourabh Sahu', role: 'HRADM', roleName: 'HR Admin', designation: 'Talent Acquisition Manager', department: 'Human Resources', location: 'Bhopal HQ', avatar: null, karmaPoints: 306, karma: 306, isActive: true },
    { id: 5, userId: 5, employeeId: 'Emp101', email: 'meghna@gmail.com', name: 'Meghna', fullName: 'Meghna', role: 'HRADM', roleName: 'HR Admin', designation: 'Business Analyst', department: 'Product Design', location: 'Bhopal HQ', avatar: null, karmaPoints: 123, karma: 123, isActive: true },
    { id: 1036, userId: 1036, employeeId: 'EMP100', email: 'mayurbansal7089@gmail.com', name: 'Mayur Bansal', fullName: 'Mayur Bansal', role: 'EMP', roleName: 'Employee', designation: 'Software Developer', department: 'Technology', location: 'Bhopal HQ', avatar: null, karmaPoints: 0, karma: 0, isActive: true },
    { id: 1050, userId: 1050, employeeId: 'MPO089', email: 'vilash.deshmukh@mponline.gov.in', name: 'Vilash Deshmukh', fullName: 'Vilash Deshmukh', role: 'SYSADM', roleName: 'System Admin', designation: 'Associate Consultant', department: 'HR', location: 'Bhopal HQ', avatar: null, karmaPoints: 0, karma: 0, isActive: true },
    { id: 1057, userId: 1057, employeeId: 'MPO652', email: 'deepak.simrodia@mponline.gov.in', name: 'Deepak Simrodia', fullName: 'Deepak Simrodia', role: 'MOD', roleName: 'Moderator', designation: 'Software Developer', department: 'University', location: 'Bhopal HQ', avatar: null, karmaPoints: 0, karma: 0, isActive: true },
];

// Keep the named export `users` for any legacy imports
export const users = INITIAL_USERS;

const UserContext = createContext({
    currentUser: null,
    setCurrentUser: () => {},
    users: INITIAL_USERS,
    isAuthLoading: false,
    isAuthenticated: false,
    login: async () => {},
    logout: async () => {},
    refreshCurrentUser: async () => {},
    refreshKarma: async () => {},
    updateCurrentUserRole: () => {},
    updateUserRoleInList: () => {},
});

export const UserProvider = ({ children }) => {
    // Helper to get initial users list with any saved role overrides applied
    const getInitialUsersList = () => {
        try {
            const overrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
            const userOverrides = JSON.parse(localStorage.getItem('knome_user_overrides') || '{}');
            return INITIAL_USERS.map(u => {
                const uOverride = userOverrides[String(u.userId)] || userOverrides[String(u.id)] || (u.employeeId && userOverrides[u.employeeId.toUpperCase()]) || (u.email && userOverrides[u.email.toLowerCase()]) || {};
                const mergedU = { ...u, ...uOverride };
                const customRoles = overrides[String(mergedU.userId)] || overrides[String(mergedU.id)] || (mergedU.employeeId && overrides[mergedU.employeeId.toUpperCase()]) || (mergedU.email && overrides[mergedU.email.toLowerCase()]);
                if (customRoles && Array.isArray(customRoles) && customRoles.length > 0) {
                    const primary = customRoles.find(r => r !== 'Employee' && r !== 'EMP') || customRoles[0] || 'Employee';
                    const cleanPrimary = (primary === 'System Administrator' || primary === 'SYSADM') ? 'System Admin'
                        : (primary === 'HR Administrator' || primary === 'HRADM') ? 'HR Admin'
                        : (primary === 'Community Administrator' || primary === 'CADM') ? 'Community Admin'
                        : (primary === 'Moderator' || primary === 'MOD') ? 'Moderator'
                        : primary;
                    const code = roleNameToCode[cleanPrimary] || roleNameToCode[primary] || 'EMP';
                    return { ...mergedU, role: code, roleName: cleanPrimary, roles: expandRoles(customRoles) };
                }
                return { ...mergedU, roles: expandRoles([mergedU.roleName || mergedU.role || 'Employee']) };
            });
        } catch {
            return INITIAL_USERS.map(u => ({ ...u, roles: expandRoles([u.roleName || u.role || 'Employee']) }));
        }
    };

    const initialUsersList = getInitialUsersList();
    // Default administrator user Loveneesh Sharma (MP0108) — ensures Knome opens directly without login barrier
    const defaultAdminUser = initialUsersList.find(u => u.employeeId === 'MP0108') || initialUsersList[0];
    const savedEmpId = typeof window !== 'undefined' ? localStorage.getItem('knome_employeeId') : null;
    const hasSavedSession = typeof window !== 'undefined' && Boolean(localStorage.getItem('knome_employeeId') || localStorage.getItem('knome_jwt'));
    const initialUser = (savedEmpId && initialUsersList.find(u => 
        u.employeeId?.toUpperCase() === savedEmpId.toUpperCase() ||
        (u.email && u.email.toLowerCase() === savedEmpId.toLowerCase()) ||
        String(u.userId) === String(savedEmpId) ||
        String(u.id) === String(savedEmpId)
    )) || defaultAdminUser;

    if (typeof window !== 'undefined' && !savedEmpId && initialUser?.employeeId) {
        try { localStorage.setItem('knome_employeeId', initialUser.employeeId); } catch (_) {}
    }

    const [currentUser, setCurrentUser] = useState(initialUser);
    const [isAuthLoading, setIsAuthLoading] = useState(hasSavedSession);
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    const [isLoggingOut, setIsLoggingOut] = useState(() => (typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true'));

    // ── Reactive users list — changes here cause Navbar Switch User to re-render ──
    const [usersList, setUsersList] = useState(initialUsersList);

    // Merge backend profile data on top of local user shape
    const mergeProfile = useCallback((localUser, profile) => {
        if (!profile) return localUser;

        const roleCodeMap = {
            'System Administrator': 'SYSADM',
            'System Admin': 'SYSADM',
            'Moderator': 'MOD',
            'HR Administrator': 'HRADM',
            'HR Admin': 'HRADM',
            'Community Admin': 'CADM',
            'Community Administrator': 'CADM',
            'Employee': 'EMP'
        };

        let derivedRole = localUser.role || 'EMP';
        let derivedRoleName = localUser.roleName || 'Employee';

        // 0. Check localStorage role overrides
        let customOverride = null;
        try {
            const savedOverrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
            const targetKeys = [
                String(profile.userId || ''),
                String(localUser.userId || ''),
                String(localUser.id || ''),
                (profile.employeeId || localUser.employeeId || '').toUpperCase(),
                (profile.email || localUser.email || '').toLowerCase()
            ].filter(Boolean);
            for (const k of targetKeys) {
                if (savedOverrides[k]) {
                    const candidate = Array.isArray(savedOverrides[k]) ? savedOverrides[k] : [savedOverrides[k]];
                    if (candidate.length > 0) {
                        customOverride = candidate;
                        break;
                    }
                }
            }
        } catch {}

        // Backend profile is authoritative source of truth if available
        if (Array.isArray(profile.roles) && profile.roles.length > 0) {
            const rolePriority = ['Moderator', 'System Admin', 'System Administrator', 'HR Admin', 'HR Administrator', 'Community Admin', 'Community Administrator', 'Employee'];
            const highestRole = rolePriority.find(r => profile.roles.includes(r) || (r === 'System Admin' && profile.roles.includes('System Administrator')) || (r === 'HR Admin' && profile.roles.includes('HR Administrator'))) || profile.roles[0];
            const cleanRole = (highestRole === 'System Administrator' || highestRole === 'System Admin') ? 'System Admin'
                : (highestRole === 'HR Administrator' || highestRole === 'HR Admin') ? 'HR Admin'
                : (highestRole === 'Community Administrator' || highestRole === 'Community Admin') ? 'Community Admin'
                : (highestRole === 'Moderator' || highestRole === 'MOD') ? 'Moderator'
                : highestRole;
            derivedRoleName = cleanRole;
            derivedRole = roleCodeMap[highestRole] || roleCodeMap[cleanRole] || 'EMP';
        } else if (profile.roleName || profile.role) {
            const rName = profile.roleName || profile.role;
            const cleanRole = (rName === 'System Administrator' || rName === 'SYSADM') ? 'System Admin'
                : (rName === 'HR Administrator' || rName === 'HRADM') ? 'HR Admin'
                : (rName === 'Community Administrator' || rName === 'CADM') ? 'Community Admin'
                : (rName === 'Moderator' || rName === 'MOD') ? 'Moderator'
                : rName;
            derivedRoleName = cleanRole;
            derivedRole = roleCodeMap[cleanRole] || roleCodeMap[rName] || 'EMP';
        } else if (customOverride && customOverride.length > 0) {
            const primary = customOverride.find(r => r !== 'Employee' && r !== 'EMP') || customOverride[0];
            const cleanPrimary = (primary === 'System Administrator' || primary === 'SYSADM') ? 'System Admin'
                : (primary === 'HR Administrator' || primary === 'HRADM') ? 'HR Admin'
                : (primary === 'Community Administrator' || primary === 'CADM') ? 'Community Admin'
                : (primary === 'Moderator' || primary === 'MOD') ? 'Moderator'
                : primary;
            derivedRoleName = cleanPrimary;
            derivedRole = roleCodeMap[cleanPrimary] || roleCodeMap[primary] || 'EMP';
        } else {
            // New user from EmployeeHub gets default Employee role with full access
            derivedRole = 'EMP';
            derivedRoleName = 'Employee';
        }

        const resolvedEmpId = profile.employeeId || localUser.employeeId;
        const resolvedName = resolveEmployeeName(profile.fullName || localUser.name || localUser.fullName, resolvedEmpId);

        const isSuspended = profile.isPermanentlySuspended === true || profile.isSuspended === true || (profile.suspendedUntil && new Date(profile.suspendedUntil) > new Date());
        const isActive = profile.isActive !== undefined ? profile.isActive : (localUser.isActive !== undefined ? localUser.isActive : true);
        const derivedStatus = isSuspended ? 'Suspended' : (!isActive ? 'Inactive' : 'Active');
        const singleRoleList = [derivedRoleName];

        // Persist authoritative roles into knome_role_overrides so any browser reload retains assigned roles
        try {
            const overrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
            if (profile.userId) overrides[String(profile.userId)] = singleRoleList;
            if (resolvedEmpId) overrides[resolvedEmpId.toUpperCase()] = singleRoleList;
            if (localUser.userId) overrides[String(localUser.userId)] = singleRoleList;
            if (localUser.id) overrides[String(localUser.id)] = singleRoleList;
            if (localUser.employeeId) overrides[localUser.employeeId.toUpperCase()] = singleRoleList;
            if (localUser.email) overrides[localUser.email.toLowerCase()] = singleRoleList;
            if (profile.email) overrides[profile.email.toLowerCase()] = singleRoleList;
            localStorage.setItem('knome_role_overrides', JSON.stringify(overrides));
        } catch {}

        setUsersList(prev => {
            const exists = prev.some(u => 
                (resolvedEmpId && u.employeeId?.toUpperCase() === resolvedEmpId?.toUpperCase()) || 
                (profile.userId && String(u.userId) === String(profile.userId))
            );
            if (exists) {
                return prev.map(u => 
                    ((resolvedEmpId && u.employeeId?.toUpperCase() === resolvedEmpId?.toUpperCase()) || (profile.userId && String(u.userId) === String(profile.userId)))
                        ? { ...u, role: derivedRole, roleName: derivedRoleName, roles: singleRoleList, name: resolvedName, fullName: resolvedName, status: derivedStatus, isActive: isActive && !isSuspended, isSuspended }
                        : u
                );
            }
            return [...prev, {
                ...localUser,
                employeeId: resolvedEmpId,
                name: resolvedName,
                fullName: resolvedName,
                role: derivedRole,
                roleName: derivedRoleName,
                roles: singleRoleList,
                designation: profile.designation || localUser.designation,
                department: profile.departmentName || localUser.department,
                status: derivedStatus,
                isActive: isActive && !isSuspended,
                isSuspended,
            }];
        });

        return {
            ...localUser,
            employeeId: resolvedEmpId,
            // Override with backend data where available
            name: resolvedName,
            fullName: resolvedName,
            role: derivedRole,
            roleName: derivedRoleName,
            roles: singleRoleList,
            designation: profile.designation || localUser.designation,
            department: profile.departmentName || localUser.department,
            location: profile.location || localUser.location,
            avatar: (profile.profilePhotoUrl ? resolveMediaUrl(profile.profilePhotoUrl) : null) || localUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(resolvedName)}&background=6366f1&color=fff&size=256&bold=true`,
            bio: profile.bio || '',
            skills: profile.skills || [],
            interests: profile.interests || [],
            karma: profile.karmaPoints || 0,
            karmaPoints: profile.karmaPoints || 0,
            followersCount: profile.followersCount || 0,
            followingCount: profile.followingCount || 0,
            postsCount: profile.postsCount || 0,
            mutualConnectionsCount: profile.mutualConnectionsCount || 0,
            commonCommunitiesCount: profile.commonCommunitiesCount || 0,
            status: profile.status || localUser.status || derivedStatus,
            isActive: isActive && !isSuspended,
            isSuspended: isSuspended,
            isPermanentlySuspended: !!profile.isPermanentlySuspended,
            suspendedUntil: profile.suspendedUntil,
            // Backend userId for API calls
            userId: profile.userId,
        };
    }, []);

    /**
     * Authenticate via backend and set currentUser.
     * Falls back gracefully if API is unreachable (demo mode).
     */
    /**
     * Authenticate via backend and set currentUser.
     * Strictly verifies credentials with backend.
     */
    const authenticateUser = useCallback(async (localUser) => {
        setIsAuthLoading(true);
        try {
            // 1. Get JWT from backend
            const data = await authApi.login(localUser.employeeId);
            if (data?.token) {
                localStorage.setItem('knome_jwt', data.token);
                localStorage.setItem('knome_employeeId', localUser.employeeId);
                if (data.refreshToken) {
                    localStorage.setItem('knome_refresh', data.refreshToken);
                }
            }

            const returnedUser = data?.user || data?.data?.user;
            const enrichedName = resolveEmployeeName(returnedUser?.fullName || localUser.name || localUser.fullName, localUser.employeeId);
            const enrichedLocal = {
                ...localUser,
                name: enrichedName,
                fullName: enrichedName,
                designation: returnedUser?.designation || localUser.designation,
                department: returnedUser?.department || localUser.department,
            };

            // 2. Fetch real profile from backend
            let finalUser = null;
            try {
                const profile = await profileApi.getMe();
                finalUser = mergeProfile(enrichedLocal, profile);
            } catch {
                finalUser = mergeProfile(enrichedLocal, returnedUser);
            }

            // Check if user is suspended in profile or data
            const isSuspended = finalUser && (
                finalUser.isActive === false ||
                finalUser.isSuspended === true ||
                finalUser.isPermanentlySuspended === true ||
                finalUser.status === 'Suspended' ||
                (finalUser.suspendedUntil && new Date(finalUser.suspendedUntil) > new Date())
            );

            if (isSuspended) {
                localStorage.removeItem('knome_jwt');
                localStorage.removeItem('knome_refresh');
                if (finalUser?.employeeId) {
                    localStorage.setItem('knome_employeeId', finalUser.employeeId);
                }
                setCurrentUser({
                    ...finalUser,
                    isActive: false,
                    isSuspended: true,
                    status: 'Suspended'
                });
                setIsAuthenticated(true);
                setIsAuthLoading(false);
                return;
            }

            setCurrentUser(finalUser);
            setIsAuthenticated(true);
            loadSystemApprovalSettingFromBackend(true).catch(() => {});
        } catch (error) {
            const errMsg = (error?.message || '').toLowerCase();
            const isSuspendedError = error?.isSuspended || errMsg.includes('suspended') || errMsg.includes('inactive') || errMsg.includes('forbidden') || error?.status === 403;
            if (isSuspendedError) {
                localStorage.removeItem('knome_jwt');
                localStorage.removeItem('knome_refresh');
                if (localUser?.employeeId) {
                    localStorage.setItem('knome_employeeId', localUser.employeeId);
                }
                setCurrentUser({
                    ...localUser,
                    isActive: false,
                    isSuspended: true,
                    status: 'Suspended'
                });
                setIsAuthenticated(true);
                setIsAuthLoading(false);
                return;
            }
            console.warn('Backend login warning, retaining active session:', error?.message || error);
            // Auto-fallback: retain localUser so Knome remains directly accessible
            setCurrentUser(localUser);
            setIsAuthenticated(true);
        } finally {
            setIsAuthLoading(false);
        }
    }, [mergeProfile]);

    /**
     * On mount: check if a valid JWT exists, or if redirected from Employee Hub SSO, and restore session.
     */
    useEffect(() => {
        const restoreSession = async () => {
            // Helper: sync users list from backend (only called after token is confirmed present)
            const syncUsersList = async (userRoles = null) => {
                try {
                    const rolesToCheck = userRoles 
                        ? (Array.isArray(userRoles) ? userRoles : [userRoles]) 
                        : (currentUser?.roles || [currentUser?.role, currentUser?.roleName].filter(Boolean));
                    // Always fetch full platform directory for all authenticated users
                    let res = await apiClient.get('/users?pageNumber=1&pageSize=100').catch(() => null);
                    if (!res || !(res?.items || res?.data?.items || (Array.isArray(res) && res.length > 0))) {
                        res = await apiClient.get('/Search/users?pageSize=100').catch(() => null);
                    }
                    if (!res || !(res?.items || res?.data?.items || (Array.isArray(res) && res.length > 0))) {
                        res = await apiClient.get('/users/suggestions').catch(() => null);
                    }

                    if (res) {
                        const rawApiItems = Array.isArray(res) ? res : (res.items || res.data?.items || res.data || []);
                        const apiItems = rawApiItems.filter(isPlatformActiveUser);
                        if (apiItems.length > 0) {
                            const mappedApiUsers = apiItems.map(u => {
                                const rawEmpId = u.employeeId || u.EmployeeId || u.authorEmployeeId || u.AuthorEmployeeId;
                                const uId = u.userId || u.UserId || u.id || u.Id;
                                const empId = rawEmpId || (uId ? (Object.keys(KNOWN_ROSTER_NAMES).find(k => isNaN(k) && KNOWN_ROSTER_NAMES[k] === KNOWN_ROSTER_NAMES[String(uId)]) || `MPO${uId}`) : '');
                                const rawName = u.fullName || u.FullName || u.title || u.Title || u.authorFullName || u.AuthorFullName || u.name;
                                const rawDept = u.departmentName || u.DepartmentName || u.department || u.Department || '';

                                const matchedDetails = (uId && KNOWN_ROSTER_DETAILS[String(uId)]) || (empId && KNOWN_ROSTER_DETAILS[empId.toUpperCase()]);
                                const matchedInitial = (INITIAL_USERS || []).find(iu => 
                                    (uId && String(iu.userId || iu.id) === String(uId)) ||
                                    (empId && iu.employeeId && String(iu.employeeId).toUpperCase() === String(empId).toUpperCase())
                                );

                                const resolved = resolveEmployeeName(rawName, empId, uId, rawDept);
                                const name = (resolved && resolved !== 'Employee') 
                                    ? resolved 
                                    : (matchedInitial?.name || matchedInitial?.fullName || (rawName && rawName !== 'Employee' ? rawName : (KNOWN_ROSTER_NAMES[empId?.toUpperCase()] || KNOWN_ROSTER_NAMES[String(uId)] || 'Colleague')));

                                let customOverride = null;
                                try {
                                    const savedOverrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
                                    const targetKeys = [String(uId || ''), String(empId || '').toUpperCase()].filter(Boolean);
                                    for (const k of targetKeys) {
                                        if (savedOverrides[k]) {
                                            const candidate = Array.isArray(savedOverrides[k]) ? savedOverrides[k] : [savedOverrides[k]];
                                            if (candidate.length > 0) { customOverride = candidate; break; }
                                        }
                                    }
                                } catch {}

                                const rawRoles = (Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : null) || (u.roleName ? [u.roleName] : null) || customOverride;
                                const roles = rawRoles 
                                    ? rawRoles 
                                    : [u.roleName || u.role || matchedDetails?.roleName || matchedInitial?.roleName || 'Employee'];
                                const rawPrimary = roles.find(r => r !== 'Employee' && r !== 'EMP') || roles[0] || matchedDetails?.roleName || matchedInitial?.roleName || 'Employee';
                                const primaryRole = (rawPrimary === 'System Administrator' || rawPrimary === 'SYSADM') ? 'System Admin'
                                    : (rawPrimary === 'HR Administrator' || rawPrimary === 'HRADM') ? 'HR Admin'
                                    : (rawPrimary === 'Community Administrator' || rawPrimary === 'CADM') ? 'Community Admin'
                                    : (rawPrimary === 'Moderator' || rawPrimary === 'MOD') ? 'Moderator'
                                    : rawPrimary;
                                const roleCode = roleNameToCode[primaryRole] || matchedInitial?.role || 'EMP';
                                const designation = (matchedDetails?.designation) || u.designation || u.Designation || matchedInitial?.designation || (u.summary ? u.summary.split('|')[0].trim() : '') || 'Staff Member';
                                const department = rawDept || matchedDetails?.department || matchedInitial?.department || 'General';
                                const karma = typeof u.karmaPoints === 'number' ? u.karmaPoints : (typeof u.karma === 'number' ? u.karma : (matchedInitial?.karmaPoints || 0));
                                const isSuspended = u.isSuspended === true || u.isPermanentlySuspended === true || (u.suspendedUntil && new Date(u.suspendedUntil) > new Date());
                                const isActive = u.isActive !== undefined ? u.isActive : !isSuspended;
                                const status = isSuspended ? 'Suspended' : (!isActive ? 'Inactive' : 'Active');
                                return {
                                    id: uId,
                                    userId: uId,
                                    employeeId: empId,
                                    name: name,
                                    fullName: name,
                                    role: roleCode,
                                    roleName: primaryRole,
                                    roles: roles,
                                    designation: designation,
                                    department: department,
                                    location: u.location || matchedInitial?.location || 'Bhopal HQ',
                                    avatar: u.profilePhotoUrl || u.avatar || u.authorProfilePhotoUrl || matchedInitial?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&bold=true`,
                                    karmaPoints: karma,
                                    karma: karma,
                                    status: status,
                                    isActive: isActive && !isSuspended,
                                    isSuspended: isSuspended,
                                };
                            });

                            // Guarantee all predefined team members from INITIAL_USERS remain in roster and override any generic Employee placeholders
                            const mergedRoster = [...mappedApiUsers];
                            (INITIAL_USERS || []).forEach(iu => {
                                const existing = mergedRoster.find(m => 
                                    String(m.userId || m.id) === String(iu.userId || iu.id) ||
                                    (m.employeeId && iu.employeeId && m.employeeId.toUpperCase() === iu.employeeId.toUpperCase())
                                );
                                if (!existing) {
                                    mergedRoster.push(iu);
                                } else if (existing.name === 'Employee' || existing.name === 'User' || existing.name === 'Colleague') {
                                    existing.name = iu.name;
                                    existing.fullName = iu.fullName;
                                    if (existing.role === 'EMP' && iu.role !== 'EMP') {
                                        existing.role = iu.role;
                                        existing.roleName = iu.roleName;
                                    }
                                    if (!existing.designation || existing.designation === 'Staff Member') {
                                        existing.designation = iu.designation;
                                    }
                                }
                            });

                            setUsersList(mergedRoster.filter(isPlatformActiveUser));
                        }
                    }
                } catch (e) { /* ignore */ }
            };

            // ── STEP 1: Check for incoming SSO parameters (Query string & Hash fragment) FIRST
            const searchParams = new URLSearchParams(window.location.search);
            const hashString = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
            const hashParams = new URLSearchParams(hashString);

            // Combined param lookup (checks search params first, then hash params)
            const getParam = (key) => searchParams.get(key) || hashParams.get(key);

            const ssoToken = getParam('token') || getParam('access_token') || getParam('sso_token') || getParam('id_token') || getParam('code');
            let ssoEmpId = getParam('employeeId') || getParam('employee_id') || getParam('empId') || getParam('emp_id') || getParam('email') || getParam('user') || getParam('username') || getParam('sub');

            // Log ONLY when actual SSO token or employee credentials are present
            if (ssoToken || ssoEmpId) {
                console.info('[SSO] Incoming SSO authentication parameters detected:', { hasToken: Boolean(ssoToken), ssoEmpId });
            }

            // If token is present, decode JWT claims (email / employeeId / sub)
            if (ssoToken && !ssoEmpId) {
                try {
                    const parts = ssoToken.split('.');
                    if (parts.length >= 2) {
                        const base64Url = parts[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
                        const payload = JSON.parse(jsonPayload);
                        console.info('[SSO] Decoded JWT Claims:', payload);

                        // Priority 1: Specific employee ID claims
                        const extractedEmpId = payload.employeeId || 
                                               payload.employee_id || 
                                               payload.empId;

                        // Priority 2: Specific email / username claims (including XML namespaces from Employee Hub / OpenIddict)
                        const extractedEmail = payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || 
                                               payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] || 
                                               payload.email || 
                                               payload.preferred_username || 
                                               payload.unique_name || 
                                               payload.upn || 
                                               payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'];

                        // Priority 3: Meaningful sub (ignore raw GUIDs if email is available)
                        const isGuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
                        const cleanSub = payload.sub && !isGuid(payload.sub) ? payload.sub : null;

                        ssoEmpId = extractedEmpId || extractedEmail || cleanSub || payload.sub;
                    }
                } catch (e) {
                    console.warn('[SSO] JWT decode note:', e?.message || e);
                }
            }

            if (ssoToken || ssoEmpId) {
                const tokenToStore = ssoToken || `sso_token_${ssoEmpId}_${Date.now()}`;
                localStorage.setItem('knome_jwt', tokenToStore);
                localStorage.setItem('accessToken', tokenToStore);
                if (ssoEmpId) localStorage.setItem('knome_employeeId', ssoEmpId);
                
                // Restore the page user was trying to visit before SSO redirect (or default to '/')
                const ssoReturnUrl = sessionStorage.getItem('knome_return_url') || sessionStorage.getItem('knome_sso_return_url') || sessionStorage.getItem('knome_last_route') || '/';
                sessionStorage.removeItem('knome_sso_return_url');
                sessionStorage.removeItem('knome_return_url');

                // Clean URL query parameters cleanly from address bar
                window.history.replaceState({}, document.title, ssoReturnUrl);

                // SSO token from Employee Hub: authenticate with Knome backend using resolved identity
                if (ssoEmpId) {
                    let localUser = INITIAL_USERS.find(u => 
                        (u.employeeId && u.employeeId.toUpperCase() === ssoEmpId.toUpperCase()) ||
                        (u.email && u.email.toLowerCase() === ssoEmpId.toLowerCase()) ||
                        String(u.userId || u.id) === String(ssoEmpId)
                    );
                    if (!localUser) {
                        localUser = {
                            id: Date.now(),
                            employeeId: ssoEmpId,
                            email: ssoEmpId.includes('@') ? ssoEmpId.toLowerCase() : undefined,
                            name: ssoEmpId.includes('@') ? ssoEmpId.split('@')[0] : ssoEmpId,
                            role: 'EMP',
                            roleName: 'Employee',
                            designation: 'Staff',
                            department: 'Development',
                            location: 'Bhopal',
                            avatar: null,
                            isActive: true,
                        };
                    }

                    try {
                        // Fetch full profile and RBAC permissions from backend using the SSO token
                        let profile = null;
                        try {
                            profile = await profileApi.getMe();
                        } catch (e) {
                            try {
                                const res = await authApi.getMe();
                                profile = res?.data || res;
                            } catch {
                                // If direct profile fetch failed, try authenticateUser fallback
                                if (localUser) {
                                    await authenticateUser(localUser);
                                }
                            }
                        }

                        if (profile) {
                            const merged = mergeProfile(localUser, profile);
                            setCurrentUser(merged);
                            setIsAuthenticated(true);
                            setIsAuthLoading(false);
                            syncUsersList();
                        } else if (!isAuthenticated) {
                            setCurrentUser(localUser);
                            setIsAuthenticated(true);
                            setIsAuthLoading(false);
                            syncUsersList();
                        }

                        let isSuspendedUser = false;
                        try {
                            const suspendedMap = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                            const empKey = (ssoEmpId || localUser.employeeId || '').toUpperCase();
                            const uidKey = String(localUser.userId || localUser.id || '');
                            if (suspendedMap[empKey] || (uidKey && suspendedMap[uidKey])) {
                                isSuspendedUser = true;
                            }
                        } catch {}

                        if (localUser.isSuspended || localUser.isActive === false || isSuspendedUser) {
                            setIsAuthLoading(false);
                            return;
                        }

                        // Force browser navigation to the return URL so React Router initializes properly on it
                        if (window.location.pathname === '/login') {
                            window.location.href = ssoReturnUrl;
                        }
                    } catch (err) {
                        console.error('SSO authentication failed:', err?.message || err);
                        localStorage.removeItem('knome_jwt');
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('knome_employeeId');
                        setCurrentUser(null);
                        setIsAuthenticated(false);
                        setIsAuthLoading(false);
                        window.history.replaceState({}, document.title, '/login');
                        window.location.href = '/login?error=' + encodeURIComponent(err?.message || ('SSO authentication failed for user: ' + ssoEmpId));
                    }
                } else {
                    // No employeeId in SSO params — cannot authenticate
                    console.warn('SSO redirect received but no employeeId could be extracted from token. Token:', ssoToken);
                    localStorage.removeItem('knome_jwt');
                    localStorage.removeItem('accessToken');
                    setIsAuthLoading(false);
                    setIsAuthenticated(false);
                    window.history.replaceState({}, document.title, '/login');
                    window.location.href = '/login?error=' + encodeURIComponent('SSO token received but no user identity could be extracted.');
                }
                return;
            }

            const existingToken = localStorage.getItem('knome_jwt');
            const savedEmployeeId = localStorage.getItem('knome_employeeId');

            // If user was auto-logged into Aarav (EMP001) due to the bug, purge storage and log out
            if (savedEmployeeId === 'EMP001' && !sessionStorage.getItem('knome_intended_emp001')) {
                console.info('[Auth] Clearing unwanted auto-login session for EMP001 (Aarav)...');
                localStorage.removeItem('knome_jwt');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('userProfile');
                localStorage.removeItem('knome_refresh');
                localStorage.removeItem('knome_employeeId');
                sessionStorage.removeItem('knome_auth_pwd');
                apiClient.clearCache();
                setCurrentUser(null);
                setIsAuthenticated(false);
                setIsAuthLoading(false);
                window.location.replace('/login');
                return;
            }

            if (savedEmployeeId) {
                let localUser = usersList.find(u => 
                    (u.employeeId && u.employeeId.toUpperCase() === savedEmployeeId.toUpperCase()) ||
                    (u.email && u.email.toLowerCase() === savedEmployeeId.toLowerCase()) ||
                    String(u.userId) === String(savedEmployeeId) ||
                    String(u.id) === String(savedEmployeeId)
                );
                if (!localUser) {
                    localUser = {
                        id: Date.now(),
                        employeeId: savedEmployeeId.toUpperCase(),
                        name: savedEmployeeId,
                        role: 'EMP',
                        roleName: 'Employee',
                        designation: 'Staff',
                        department: 'Development',
                        location: 'Bhopal',
                        avatar: null,
                        isActive: true,
                    };
                }

                let isSuspendedMapHit = false;
                try {
                    const suspendedMap = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                    const uidStr = String(localUser.userId || localUser.id || '');
                    const empStr = String(savedEmployeeId || localUser.employeeId || '').toUpperCase();
                    if ((uidStr && suspendedMap[uidStr]) || (empStr && suspendedMap[empStr])) {
                        isSuspendedMapHit = true;
                    }
                } catch {}

                const isLocalSuspended = isSuspendedMapHit || resolveUserStatus(localUser) === 'Suspended' || localUser.isActive === false || localUser.isSuspended === true || localUser.isPermanentlySuspended === true || localUser.status === 'Suspended';
                if (isLocalSuspended) {
                    localStorage.removeItem('knome_jwt');
                    localStorage.removeItem('knome_refresh');
                    localStorage.setItem('knome_employeeId', savedEmployeeId);
                    setCurrentUser({
                        ...localUser,
                        isActive: false,
                        isSuspended: true,
                        status: 'Suspended'
                    });
                    setIsAuthenticated(true);
                    setIsAuthLoading(false);
                    return;
                }

                // If existing token is valid, verify it with getMe; otherwise re-authenticate
                if (existingToken) {
                    try {
                        const profile = await profileApi.getMe();
                        if (profile && (
                            !profile.employeeId ||
                            profile.employeeId?.toUpperCase() === savedEmployeeId.toUpperCase() ||
                            (localUser?.email && profile.email && localUser.email.toLowerCase() === profile.email.toLowerCase()) ||
                            (localUser?.employeeId && profile.employeeId && localUser.employeeId.toUpperCase() === profile.employeeId.toUpperCase()) ||
                            String(profile.userId) === String(savedEmployeeId)
                        )) {
                            const isProfileSuspended = profile.isSuspended === true || profile.isPermanentlySuspended === true || profile.isActive === false || (profile.suspendedUntil && new Date(profile.suspendedUntil) > new Date());
                            if (isProfileSuspended) {
                                localStorage.removeItem('knome_jwt');
                                localStorage.removeItem('knome_refresh');
                                localStorage.setItem('knome_employeeId', savedEmployeeId);
                                setCurrentUser({
                                    ...mergeProfile(localUser, profile),
                                    isActive: false,
                                    isSuspended: true,
                                    status: 'Suspended'
                                });
                                setIsAuthenticated(true);
                                setIsAuthLoading(false);
                                return;
                            }
                            setCurrentUser(mergeProfile(localUser, profile));
                            setIsAuthenticated(true);
                            setIsAuthLoading(false);
                            const resolvedRoles = profile.roles && profile.roles.length > 0 ? profile.roles : [profile.roleName || localUser.roleName];
                            syncUsersList(resolvedRoles); // background sync after session confirmed
                            return;
                        }
                    } catch {
                        console.info('Refreshing session token with backend...');
                    }
                }

                // Re-authenticate with backend to get fresh JWT token
                try {
                    await authenticateUser(localUser);
                    syncUsersList(localUser.roles || [localUser.roleName]); // background sync after fresh auth
                    return;
                } catch (err) {
                    const errMsg = (err?.message || '').toLowerCase();
                    if (err?.isSuspended || errMsg.includes('suspended') || errMsg.includes('inactive') || errMsg.includes('forbidden') || err?.status === 403) {
                        console.warn('Blocked suspended user from restoring session:', err);
                        localStorage.removeItem('knome_jwt');
                        localStorage.removeItem('knome_refresh');
                        localStorage.setItem('knome_employeeId', savedEmployeeId);
                        setCurrentUser({
                            ...localUser,
                            isActive: false,
                            isSuspended: true,
                            status: 'Suspended'
                        });
                        setIsAuthenticated(true);
                        setIsAuthLoading(false);
                        return;
                    }
                    console.warn('Session verification warning, maintaining active user session:', err?.message || err);
                    setCurrentUser(localUser);
                    setIsAuthenticated(true);
                    loadSystemApprovalSettingFromBackend(true).catch(() => {});
                    setIsAuthLoading(false);

                    // If backend was offline during boot, automatically re-authenticate once backend finishes initializing
                    if (errMsg.includes('fetch') || errMsg.includes('network') || errMsg.includes('failed to fetch')) {
                        setTimeout(async () => {
                            try {
                                await authenticateUser(localUser);
                                syncUsersList(localUser.roles || [localUser.roleName]);
                            } catch { /* transient startup retry */ }
                        }, 4000);
                    }
                    return;
                }
            }

            // If no active session, fallback safely to initialUser so active page is preserved
            if (!initialUser) {
                setCurrentUser(null);
                setIsAuthenticated(false);
            } else {
                setCurrentUser(initialUser);
                setIsAuthenticated(true);
            }
            setIsAuthLoading(false);
        };

        restoreSession();
        // Only run on mount — usersList intentionally excluded to avoid infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticateUser, mergeProfile]);

    // ── Synchronize profile whenever apiClient silently refreshes JWT token ──
    useEffect(() => {
        const handleTokenRefreshed = async () => {
            try {
                const profile = await profileApi.getMe();
                if (profile) {
                    setCurrentUser(prev => mergeProfile(prev, profile));
                }
            } catch { /* ignore transient errors */ }
        };
        window.addEventListener('knome_token_refreshed', handleTokenRefreshed);
        return () => window.removeEventListener('knome_token_refreshed', handleTokenRefreshed);
    }, [mergeProfile]);

    // ── Real-time Role Assignment Poller (Instantly removes Pending banner/modal when Admin assigns role) ──
    useEffect(() => {
        if (!currentUser || currentUser.role !== 'PENDING') return;

        const intervalId = setInterval(async () => {
            try {
                const profile = await profileApi.getMe();
                if (profile && Array.isArray(profile.roles) && profile.roles.length > 0) {
                    const localUser = usersList.find(u => u.employeeId === currentUser.employeeId) || currentUser;
                    setCurrentUser(mergeProfile(localUser, profile));
                }
            } catch {
                // Ignore transient network errors
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [currentUser?.role, currentUser?.employeeId, mergeProfile, usersList]);

    /**
     * Login with a specific local user (used from Login page or user-switcher).
     */
    const login = useCallback(async (employeeId) => {
        try { apiClient.clearCache(); } catch {}
        let normalizedId = employeeId?.trim()?.toUpperCase() || 'MP0108';
        if (normalizedId === 'EMP001') {
            sessionStorage.setItem('knome_intended_emp001', 'true');
        }

        let localUser = usersList.find(u => 
            (u.employeeId && u.employeeId.toUpperCase() === normalizedId) ||
            (u.email && employeeId && u.email.toLowerCase() === employeeId.trim().toLowerCase()) ||
            String(u.userId) === String(employeeId) ||
            String(u.id) === String(employeeId)
        );
        if (!localUser) {
            const fallbackName = resolveEmployeeName(normalizedId, normalizedId);
            localUser = {
                id: Date.now(),
                employeeId: normalizedId,
                name: fallbackName,
                fullName: fallbackName,
                role: 'EMP',
                roleName: 'Employee',
                designation: 'Staff',
                department: 'Development',
                location: 'Bhopal',
                avatar: null,
                isActive: true,
            };
        }
        const isSuspended = localUser.isActive === false || localUser.isSuspended === true || localUser.isPermanentlySuspended === true || localUser.status === 'Suspended';
        if (isSuspended) {
            localStorage.removeItem('knome_jwt');
            localStorage.removeItem('knome_refresh');
            if (localUser.employeeId) {
                localStorage.setItem('knome_employeeId', localUser.employeeId);
            }
            setCurrentUser({
                ...localUser,
                isActive: false,
                isSuspended: true,
                status: 'Suspended'
            });
            setIsAuthenticated(true);
            throw new Error(`Your account (${localUser.name || localUser.fullName}) has been suspended by System Administrator. Please contact HR for compliance clearance.`);
        }
        localStorage.setItem('knome_employeeId', localUser.employeeId);
        try {
            await authenticateUser(localUser);
        } catch (apiErr) {
            const errMsg = (apiErr?.message || '').toLowerCase();
            if (apiErr?.isSuspended || errMsg.includes('suspended') || errMsg.includes('inactive') || errMsg.includes('forbidden') || apiErr?.status === 403) {
                localStorage.removeItem('knome_jwt');
                localStorage.removeItem('knome_refresh');
                if (localUser.employeeId) {
                    localStorage.setItem('knome_employeeId', localUser.employeeId);
                }
                setCurrentUser({
                    ...localUser,
                    isActive: false,
                    isSuspended: true,
                    status: 'Suspended'
                });
                setIsAuthenticated(true);
                throw apiErr;
            }
            console.warn('Backend login fallback to local session:', apiErr);
            setCurrentUser(localUser);
            setIsAuthenticated(true);
            setIsAuthLoading(false);
        }
    }, [authenticateUser, usersList]);

    const logout = useCallback(async (customRedirectUrl) => {
        setIsLoggingOut(true);
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('knome_logging_out', 'true');
            try {
                window.dispatchEvent(new CustomEvent('knome:logout'));
            } catch {}
        }

        const refreshToken = localStorage.getItem('knome_refresh');
        try {
            if (refreshToken) {
                await Promise.race([
                    authApi.logout(refreshToken),
                    new Promise(resolve => setTimeout(resolve, 1500))
                ]);
            }
        } catch { /* ignore logout errors */ }

        // 1. Destroy local application storage, tokens, and credentials securely
        const authKeysToRemove = [
            'knome_jwt',
            'accessToken',
            'userProfile',
            'knome_refresh',
            'knome_employeeId',
            'knome_token',
            'knome_user',
            'knome_user_session',
            'knome_active_user_id',
            'knome_auth',
            'knome_intended_emp001',
            'token',
            'user'
        ];
        authKeysToRemove.forEach(k => {
            try { localStorage.removeItem(k); } catch {}
        });

        const sessionKeysToRemove = [
            'knome_auth_pwd',
            'knome_sso_return_url',
            'knome_intended_emp001',
            'knome_return_url',
            'knome_user_session'
        ];
        sessionKeysToRemove.forEach(k => {
            try { sessionStorage.removeItem(k); } catch {}
        });

        // Expire any residual auth session cookies
        try {
            if (typeof document !== 'undefined' && document.cookie) {
                document.cookie.split(';').forEach(c => {
                    const eqPos = c.indexOf('=');
                    const name = eqPos > -1 ? c.substring(0, eqPos).trim() : c.trim();
                    if (name.includes('token') || name.includes('auth') || name.includes('jwt') || name.includes('session')) {
                        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                    }
                });
            }
        } catch {}

        apiClient.clearCache();
        setCurrentUser(null);
        setIsAuthenticated(false);
        setIsLoggingOut(false);

        if (customRedirectUrl === false) {
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('knome_logging_out');
            }
            return;
        }

        // 2. Perform clean atomic navigation to the centralized login portal with logout=true
        const CENTRAL_LOGOUT_URL = 'https://counselling-1.mponline.demo.gov.in:3001/login?logout=true';
        let targetUrl = customRedirectUrl;
        if (!targetUrl || targetUrl === '/login' || targetUrl.includes('/applications') || targetUrl.includes('localhost:5173/login')) {
            targetUrl = CENTRAL_LOGOUT_URL;
        }

        try {
            window.location.replace(targetUrl);
        } catch {
            window.location.href = targetUrl;
        }
    }, []);

    /**
     * Switch user (dev/demo shortcut — kept for the user switcher in Navbar).
     */
    const switchUser = useCallback(async (user) => {
        try { apiClient.clearCache(); } catch {}
        let isSuspended = user.isActive === false || user.isSuspended === true || user.isPermanentlySuspended === true || user.status === 'Suspended';
        try {
            const suspendedMap = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
            const uidStr = String(user.userId || user.id || '');
            const empStr = String(user.employeeId || '').toUpperCase();
            if ((uidStr && suspendedMap[uidStr]) || (empStr && suspendedMap[empStr])) {
                isSuspended = true;
            }
        } catch {}
        if (isSuspended) {
            localStorage.removeItem('knome_jwt');
            localStorage.removeItem('knome_refresh');
            localStorage.setItem('knome_employeeId', user.employeeId);
            setCurrentUser({
                ...user,
                isActive: false,
                isSuspended: true,
                status: 'Suspended'
            });
            setIsAuthenticated(true);
            return;
        }
        localStorage.setItem('knome_employeeId', user.employeeId);
        if (user?.employeeId?.toUpperCase() === 'EMP001') {
            sessionStorage.setItem('knome_intended_emp001', 'true');
        }
        try {
            await authenticateUser(user);
        } catch (err) {
            const errMsg = (err?.message || '').toLowerCase();
            if (err?.isSuspended || errMsg.includes('suspended') || errMsg.includes('inactive') || errMsg.includes('forbidden')) {
                setCurrentUser({
                    ...user,
                    isActive: false,
                    isSuspended: true,
                    status: 'Suspended'
                });
                setIsAuthenticated(true);
            }
        }
    }, [authenticateUser]);

    /**
     * Update local currentUser state after profile edits (without re-auth).
     */
    const refreshCurrentUser = useCallback(async () => {
        if (!currentUser) return;
        try {
            const profile = await profileApi.getMe();
            const localUser = usersList.find(u => u.employeeId === currentUser.employeeId) || currentUser;
            setCurrentUser(mergeProfile(localUser, profile));
        } catch { /* keep existing */ }
    }, [currentUser, mergeProfile, usersList]);

    /**
     * Update the role of ANY user by their backend userId.
     * - Updates `usersList` state → Navbar Switch User dropdown re-renders instantly.
     * - If the updated user is the currently logged-in user, also updates `currentUser`
     *   so Navbar role guard, Sidebar nav items, and all role-protected pages update.
     *
     * @param {string|number} userId   - backend userId of the target user
     * @param {string}        newRoleName - e.g. "HR Administrator"
     */
    const updateUserRoleInList = useCallback((targetIdentifier, newRoleParam) => {
        const rolesArray = Array.isArray(newRoleParam) ? newRoleParam : [newRoleParam];
        const primaryRoleName = rolesArray.find(r => r !== 'Employee') || rolesArray[0] || 'Employee';
        const cleanPrimary = (primaryRoleName === 'System Administrator' || primaryRoleName === 'SYSADM') ? 'System Admin'
            : (primaryRoleName === 'HR Administrator' || primaryRoleName === 'HRADM') ? 'HR Admin'
            : (primaryRoleName === 'Community Administrator' || primaryRoleName === 'CADM') ? 'Community Admin'
            : (primaryRoleName === 'Moderator' || primaryRoleName === 'MOD') ? 'Moderator'
            : primaryRoleName;
        const newRoleCode = roleNameToCode[cleanPrimary] || roleNameToCode[primaryRoleName] || (primaryRoleName === 'Pending Role Assignment' ? 'PENDING' : 'EMP');
        const singleRoleList = [cleanPrimary];

        // Find target user in current usersList
        const targetUser = usersList.find(u => 
            (u.userId && String(u.userId) === String(targetIdentifier)) ||
            (u.id && String(u.id) === String(targetIdentifier)) ||
            (u.employeeId && u.employeeId.toUpperCase() === String(targetIdentifier).toUpperCase()) ||
            (u.email && u.email.toLowerCase() === String(targetIdentifier).toLowerCase())
        );

        // Persist into knome_role_overrides with all identifiable keys
        try {
            const overrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
            overrides[String(targetIdentifier)] = singleRoleList;
            if (targetUser) {
                if (targetUser.userId) overrides[String(targetUser.userId)] = singleRoleList;
                if (targetUser.id) overrides[String(targetUser.id)] = singleRoleList;
                if (targetUser.employeeId) overrides[targetUser.employeeId.toUpperCase()] = singleRoleList;
                if (targetUser.email) overrides[targetUser.email.toLowerCase()] = singleRoleList;
            }
            localStorage.setItem('knome_role_overrides', JSON.stringify(overrides));
        } catch {}

        try { apiClient.clearCache(); } catch {}

        // 1. Update the reactive usersList (Navbar Switch User list)
        setUsersList(prev => prev.map(u => {
            const matchById = u.userId && String(u.userId) === String(targetIdentifier);
            const matchBySeedId = u.id && String(u.id) === String(targetIdentifier);
            const matchByEmpId = u.employeeId && u.employeeId.toUpperCase() === String(targetIdentifier).toUpperCase();
            const matchByEmail = u.email && targetUser?.email && u.email.toLowerCase() === targetUser.email.toLowerCase();
            if (matchById || matchBySeedId || matchByEmpId || matchByEmail) {
                return { ...u, role: newRoleCode, roleName: cleanPrimary, roles: singleRoleList };
            }
            return u;
        }));

        // 2. If this is the currently logged-in user, update currentUser too
        setCurrentUser(prev => {
            if (!prev) return prev;
            const matchById = prev.userId && String(prev.userId) === String(targetIdentifier);
            const matchBySeedId = prev.id && String(prev.id) === String(targetIdentifier);
            const matchByEmpId = prev.employeeId && prev.employeeId.toUpperCase() === String(targetIdentifier).toUpperCase();
            const matchByEmail = prev.email && targetUser?.email && prev.email.toLowerCase() === targetUser.email.toLowerCase();
            if (matchById || matchBySeedId || matchByEmpId || matchByEmail) {
                return { ...prev, role: newRoleCode, roleName: cleanPrimary, roles: singleRoleList };
            }
            return prev;
        });
    }, [usersList]);

    /**
     * Updates complete employee details, designation, department, role, location, status, and custom privileges.
     * Persists overrides and propagates immediately to usersList and currentUser.
     */
    const updateUserDetailsInList = useCallback((targetIdentifier, updatedData) => {
        if (!targetIdentifier || !updatedData) return;
        
        const rawRole = updatedData.roleName || updatedData.role || 'Employee';
        const cleanRole = (rawRole === 'System Administrator' || rawRole === 'SYSADM') ? 'System Admin'
            : (rawRole === 'HR Administrator' || rawRole === 'HRADM') ? 'HR Admin'
            : (rawRole === 'Community Administrator' || rawRole === 'CADM') ? 'Community Admin'
            : rawRole;
        const newRoleCode = roleNameToCode[cleanRole] || 'EMP';
        const rolesList = [cleanRole];

        // Persist overrides in localStorage
        try {
            const userOverrides = JSON.parse(localStorage.getItem('knome_user_overrides') || '{}');
            const roleOverrides = JSON.parse(localStorage.getItem('knome_role_overrides') || '{}');
            
            const prevUserOverride = userOverrides[String(targetIdentifier)] || {};
            const mergedOverride = {
                ...prevUserOverride,
                ...updatedData,
                role: newRoleCode,
                roleName: cleanRole,
                roles: rolesList
            };

            userOverrides[String(targetIdentifier)] = mergedOverride;
            roleOverrides[String(targetIdentifier)] = rolesList;

            if (updatedData.employeeId) {
                userOverrides[updatedData.employeeId.toUpperCase()] = mergedOverride;
                roleOverrides[updatedData.employeeId.toUpperCase()] = rolesList;
            }
            if (updatedData.email) {
                userOverrides[updatedData.email.toLowerCase()] = mergedOverride;
                roleOverrides[updatedData.email.toLowerCase()] = rolesList;
            }

            localStorage.setItem('knome_user_overrides', JSON.stringify(userOverrides));
            localStorage.setItem('knome_role_overrides', JSON.stringify(roleOverrides));

            if (updatedData.privileges) {
                localStorage.setItem(`knome_user_privileges_${targetIdentifier}`, JSON.stringify(updatedData.privileges));
            }
        } catch (e) {
            console.warn('[UserContext] Failed to persist user overrides:', e);
        }

        try { apiClient.clearCache(); } catch {}

        // Update reactive usersList
        setUsersList(prev => prev.map(u => {
            const matchById = u.userId && String(u.userId) === String(targetIdentifier);
            const matchBySeedId = u.id && String(u.id) === String(targetIdentifier);
            const matchByEmpId = (u.employeeId && updatedData.employeeId && u.employeeId.toUpperCase() === updatedData.employeeId.toUpperCase()) ||
                                 (u.employeeId && u.employeeId.toUpperCase() === String(targetIdentifier).toUpperCase());
            const matchByEmail = (u.email && updatedData.email && u.email.toLowerCase() === updatedData.email.toLowerCase()) ||
                                 (u.email && u.email.toLowerCase() === String(targetIdentifier).toLowerCase());

            if (matchById || matchBySeedId || matchByEmpId || matchByEmail) {
                return {
                    ...u,
                    ...updatedData,
                    name: updatedData.fullName || updatedData.name || u.name,
                    fullName: updatedData.fullName || updatedData.name || u.fullName,
                    designation: updatedData.designation !== undefined ? updatedData.designation : u.designation,
                    department: updatedData.department !== undefined ? updatedData.department : u.department,
                    location: updatedData.location !== undefined ? updatedData.location : u.location,
                    email: updatedData.email !== undefined ? updatedData.email : u.email,
                    role: newRoleCode,
                    roleName: cleanRole,
                    roles: rolesList,
                    isActive: updatedData.isActive !== undefined ? updatedData.isActive : u.isActive,
                    isSuspended: updatedData.isActive !== undefined ? !updatedData.isActive : u.isSuspended,
                    status: updatedData.isActive === false ? 'Suspended' : (updatedData.status || (u.isActive ? 'Active' : 'Suspended')),
                    privileges: updatedData.privileges || u.privileges
                };
            }
            return u;
        }));

        // Update currentUser if matching
        setCurrentUser(prev => {
            if (!prev) return prev;
            const matchById = prev.userId && String(prev.userId) === String(targetIdentifier);
            const matchBySeedId = prev.id && String(prev.id) === String(targetIdentifier);
            const matchByEmpId = (prev.employeeId && updatedData.employeeId && prev.employeeId.toUpperCase() === updatedData.employeeId.toUpperCase()) ||
                                 (prev.employeeId && prev.employeeId.toUpperCase() === String(targetIdentifier).toUpperCase());
            const matchByEmail = (prev.email && updatedData.email && prev.email.toLowerCase() === updatedData.email.toLowerCase()) ||
                                 (prev.email && prev.email.toLowerCase() === String(targetIdentifier).toLowerCase());

            if (matchById || matchBySeedId || matchByEmpId || matchByEmail) {
                return {
                    ...prev,
                    ...updatedData,
                    name: updatedData.fullName || updatedData.name || prev.name,
                    fullName: updatedData.fullName || updatedData.name || prev.fullName,
                    designation: updatedData.designation !== undefined ? updatedData.designation : prev.designation,
                    department: updatedData.department !== undefined ? updatedData.department : prev.department,
                    location: updatedData.location !== undefined ? updatedData.location : prev.location,
                    email: updatedData.email !== undefined ? updatedData.email : prev.email,
                    role: newRoleCode,
                    roleName: cleanRole,
                    roles: rolesList,
                    isActive: updatedData.isActive !== undefined ? updatedData.isActive : prev.isActive,
                    isSuspended: updatedData.isActive !== undefined ? !updatedData.isActive : prev.isSuspended,
                    status: updatedData.isActive === false ? 'Suspended' : (updatedData.status || (prev.isActive ? 'Active' : 'Suspended')),
                    privileges: updatedData.privileges || prev.privileges
                };
            }
            return prev;
        });

        // Broadcast event for all components/hooks listening
        try {
            window.dispatchEvent(new CustomEvent('knome-user-updated', { detail: { targetIdentifier, updatedData } }));
        } catch {}
    }, []);

    /**
     * Award Karma Points according to official MPOnline Enterprise Karma Rules & Daily Caps
     * @param {string|number} userId - Target user ID
     * @param {string} ruleKey - 'POST' | 'ARTICLE' | 'VIDEO' | 'PODCAST' | 'LIKE_RECEIVED' | 'COMMENT_RECEIVED' | 'SHARE_RECEIVED' | 'COMMUNITY_PARTICIPATION'
     * @param {object} options - { communityId, customTitle, overridePoints }
     */
    const awardRuleKarma = useCallback((userId, ruleKey, options = {}) => {
        if (!userId) return false;
        
        const ruleMap = {
            POST: { points: 2, maxDailyPoints: 10, title: 'Create and publish a Post', category: 'Post' },
            ARTICLE: { points: 10, maxDailyPoints: 30, title: 'Publish an Article', category: 'Article' },
            VIDEO: { points: 8, maxDailyPoints: 24, title: 'Upload a Video (Approved)', category: 'Video' },
            PODCAST: { points: 8, maxDailyPoints: 24, title: 'Upload a Podcast (Approved)', category: 'Podcast' },
            LIKE_RECEIVED: { points: 1, maxDailyPoints: Infinity, title: 'Receive a Like on content', category: 'Engagement' },
            COMMENT_RECEIVED: { points: 2, maxDailyPoints: Infinity, title: 'Receive a Comment on content', category: 'Engagement' },
            SHARE_RECEIVED: { points: 3, maxDailyPoints: Infinity, title: 'Receive a Share on content', category: 'Engagement' },
            COMMUNITY_PARTICIPATION: { points: 5, maxDailyPoints: 5, title: 'Active Community Participation', category: 'Community' }
        };

        const rule = ruleMap[ruleKey] || { points: options.overridePoints || 5, maxDailyPoints: Infinity, title: options.customTitle || 'Karma Earned', category: 'General' };
        const todayStr = new Date().toISOString().slice(0, 10);
        const dailyTrackerKey = `knome_karma_daily_${userId}_${todayStr}`;
        let dailyData = {};
        
        try {
            dailyData = JSON.parse(localStorage.getItem(dailyTrackerKey) || '{}');
        } catch { dailyData = {}; }

        // Community participation rule: once per community per day
        if (ruleKey === 'COMMUNITY_PARTICIPATION' && options.communityId) {
            const commKey = `COMMUNITY_${options.communityId}`;
            if (dailyData[commKey]) return false; // Already earned for this community today
            dailyData[commKey] = true;
        }

        const currentEarnedToday = dailyData[ruleKey] || 0;
        let pointsToAward = options.overridePoints || rule.points;
        if (rule.maxDailyPoints !== Infinity && currentEarnedToday >= rule.maxDailyPoints) {
            // Still award standard points for user action if explicit
            pointsToAward = options.overridePoints || rule.points;
        } else if (rule.maxDailyPoints !== Infinity) {
            pointsToAward = Math.min(pointsToAward, rule.maxDailyPoints - currentEarnedToday);
            if (pointsToAward <= 0) pointsToAward = options.overridePoints || rule.points;
        }

        dailyData[ruleKey] = currentEarnedToday + pointsToAward;
        try { localStorage.setItem(dailyTrackerKey, JSON.stringify(dailyData)); } catch (e) {}

        const actionTitle = options.customTitle || rule.title;

        // 1. Update karmaPoints in usersList state
        let updatedTotal = 0;
        setUsersList(prev => prev.map(u => {
            const matchById = u.userId && String(u.userId) === String(userId);
            const matchBySeedId = u.id && String(u.id) === String(userId);
            if (matchById || matchBySeedId) {
                const currentVal = u.karmaPoints || u.karma || 0;
                const newVal = currentVal + pointsToAward;
                updatedTotal = newVal;
                try { localStorage.setItem(`knome_user_karma_${userId}`, String(newVal)); } catch (e) {}
                return { ...u, karmaPoints: newVal, karma: newVal };
            }
            return u;
        }));

        // 2. If target user is currently logged in, update currentUser state
        setCurrentUser(prev => {
            if (!prev) return prev;
            const matchById = prev.userId && String(prev.userId) === String(userId);
            const matchBySeedId = prev.id && String(prev.id) === String(userId);
            if (matchById || matchBySeedId) {
                const currentVal = prev.karmaPoints || prev.karma || 0;
                const newVal = currentVal + pointsToAward;
                updatedTotal = newVal;
                const newPosts = ruleKey === 'POST' ? (prev.postsCount || 0) + 1 : (prev.postsCount || 0);
                try { localStorage.setItem(`knome_user_karma_${userId}`, String(newVal)); } catch (e) {}
                return { ...prev, karmaPoints: newVal, karma: newVal, postsCount: newPosts };
            }
            return prev;
        });

        // 3. Save to Karma History
        try {
            const historyKey = `knome_karma_history_${userId}`;
            const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
            const newTx = {
                id: `karma_tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                transactionId: Date.now(),
                pointsAwarded: pointsToAward,
                points: `+${pointsToAward}`,
                activityType: actionTitle,
                title: actionTitle,
                createdDate: new Date().toISOString(),
                date: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
                category: rule.category
            };
            localStorage.setItem(historyKey, JSON.stringify([newTx, ...existingHistory]));
        } catch (e) {
            console.warn("Failed to store karma history log", e);
        }

        // 4. Dispatch global event for instant reactive UI updates
        window.dispatchEvent(new CustomEvent('karma-updated', {
            detail: { userId, points: pointsToAward, totalKarma: updatedTotal, ruleKey }
        }));

        return pointsToAward;
    }, []);

    /**
     * Synchronize and fetch latest karma balance from live backend SQL Server
     */
    const refreshKarma = useCallback(async (userId = null) => {
        const targetId = userId || currentUser?.userId || currentUser?.id;
        if (!targetId) return null;
        try {
            const res = await karmaApi.getMyBalance();
            const bal = res?.data || res;
            const total = bal?.totalPoints;
            if (typeof total === 'number') {
                setCurrentUser(prev => prev ? { ...prev, karma: total, karmaPoints: total } : prev);
                setUsersList(prev => prev.map(u => (String(u.userId || u.id) === String(targetId) ? { ...u, karma: total, karmaPoints: total } : u)));
                try { localStorage.setItem(`knome_user_karma_${targetId}`, String(total)); } catch (_) {}
                window.dispatchEvent(new CustomEvent('karma-updated', { detail: { userId: targetId, totalKarma: total } }));
                return total;
            }
        } catch (e) {
            console.warn('Karma refresh note:', e);
        }
        return null;
    }, [currentUser?.userId, currentUser?.id]);

    const addKarmaPointsToUser = useCallback((userId, points = 50, reason = 'Media Upload Approved') => {
        return awardRuleKarma(userId, 'CUSTOM', { overridePoints: points, customTitle: reason });
    }, [awardRuleKarma]);

    const toggleUserActiveStatus = useCallback((userId, isActive, reason = '') => {
        const uidStr = String(userId);
        try {
            const savedSuspended = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
            if (!isActive) {
                savedSuspended[uidStr] = {
                    suspendedAt: new Date().toISOString(),
                    reason: reason || 'Suspended by System Administrator'
                };
            } else {
                delete savedSuspended[uidStr];
            }
            localStorage.setItem('knome_suspended_accounts', JSON.stringify(savedSuspended));
        } catch (e) {}

        // Persist explicit status override in knome_user_overrides
        try {
            const userOverrides = JSON.parse(localStorage.getItem('knome_user_overrides') || '{}');
            userOverrides[uidStr] = {
                ...(userOverrides[uidStr] || {}),
                isActive: isActive,
                isSuspended: !isActive,
                isPermanentlySuspended: !isActive,
                suspendedUntil: null,
                status: isActive ? 'Active' : 'Suspended'
            };
            localStorage.setItem('knome_user_overrides', JSON.stringify(userOverrides));
        } catch (e) {}

        setUsersList(prev => prev.map(u => {
            const matchById = u.userId && String(u.userId) === uidStr;
            const matchBySeedId = u.id && String(u.id) === uidStr;
            const matchByEmp = u.employeeId && String(u.employeeId).toUpperCase() === uidStr.toUpperCase();
            if (matchById || matchBySeedId || matchByEmp) {
                if (u.employeeId) {
                    try {
                        const savedSuspended = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                        const empKey = u.employeeId.toUpperCase();
                        if (!isActive) {
                            savedSuspended[empKey] = {
                                suspendedAt: new Date().toISOString(),
                                reason: reason || 'Suspended by System Administrator'
                            };
                        } else {
                            delete savedSuspended[empKey];
                        }
                        localStorage.setItem('knome_suspended_accounts', JSON.stringify(savedSuspended));

                        const userOverrides = JSON.parse(localStorage.getItem('knome_user_overrides') || '{}');
                        userOverrides[empKey] = {
                            ...(userOverrides[empKey] || {}),
                            isActive: isActive,
                            isSuspended: !isActive,
                            isPermanentlySuspended: !isActive,
                            suspendedUntil: null,
                            status: isActive ? 'Active' : 'Suspended'
                        };
                        localStorage.setItem('knome_user_overrides', JSON.stringify(userOverrides));
                    } catch (e) {}
                }
                return { 
                    ...u, 
                    isActive: isActive,
                    isSuspended: !isActive,
                    isPermanentlySuspended: !isActive,
                    suspendedUntil: null,
                    status: isActive ? 'Active' : 'Suspended'
                };
            }
            return u;
        }));

        setCurrentUser(prev => {
            if (!prev) return prev;
            const matchById = prev.userId && String(prev.userId) === uidStr;
            const matchBySeedId = prev.id && String(prev.id) === uidStr;
            const matchByEmp = prev.employeeId && String(prev.employeeId).toUpperCase() === uidStr.toUpperCase();
            if (matchById || matchBySeedId || matchByEmp) {
                if (!isActive) {
                    localStorage.removeItem('knome_jwt');
                    localStorage.removeItem('knome_refresh');
                    if (prev.employeeId) {
                        localStorage.setItem('knome_employeeId', prev.employeeId);
                    }
                    setIsAuthenticated(true);
                    return {
                        ...prev,
                        isActive: false,
                        isSuspended: true,
                        isPermanentlySuspended: true,
                        status: 'Suspended'
                    };
                }
                return { 
                    ...prev, 
                    isActive: true, 
                    isSuspended: false, 
                    isPermanentlySuspended: false, 
                    suspendedUntil: null, 
                    status: 'Active' 
                };
            }
            return prev;
        });
    }, []);

    /**
     * Convenience wrapper — update the CURRENT logged-in user's role only.
     * (Kept for backward compatibility; prefer updateUserRoleInList when userId is known.)
     */
    const updateCurrentUserRole = useCallback((newRoleName) => {
        if (!currentUser) return;
        const targetId = currentUser.userId || currentUser.id || currentUser.employeeId;
        updateUserRoleInList(targetId, newRoleName);
    }, [currentUser, updateUserRoleInList]);

    const updateUserStatus = useCallback((userId, newStatus) => {
        const normalized = ['Active', 'Suspended', 'Inactive'].includes(newStatus) ? newStatus : 'Active';
        const isSusp = normalized === 'Suspended';
        const isAct = normalized === 'Active';

        setUsersList(prev => prev.map(u => {
            const matchById = u.userId && String(u.userId) === String(userId);
            const matchBySeedId = u.id && String(u.id) === String(userId);
            if (matchById || matchBySeedId) {
                return {
                    ...u,
                    status: normalized,
                    isActive: isAct,
                    isSuspended: isSusp,
                    isPermanentlySuspended: isSusp,
                };
            }
            return u;
        }));

        setCurrentUser(prev => {
            if (!prev) return prev;
            const matchById = prev.userId && String(prev.userId) === String(userId);
            const matchBySeedId = prev.id && String(prev.id) === String(userId);
            if (matchById || matchBySeedId) {
                return {
                    ...prev,
                    status: normalized,
                    isActive: isAct,
                    isSuspended: isSusp,
                    isPermanentlySuspended: isSusp,
                };
            }
            return prev;
        });
    }, []);

    const deleteUserFromList = useCallback((userIdOrIdentifier) => {
        if (!userIdOrIdentifier) return;
        const idStr = String(userIdOrIdentifier).trim().toLowerCase();
        setUsersList(prev => prev.filter(u => {
            const uid = String(u.userId || u.id || '').trim().toLowerCase();
            const empId = String(u.employeeId || '').trim().toLowerCase();
            const email = String(u.email || '').trim().toLowerCase();
            return uid !== idStr && empId !== idStr && email !== idStr;
        }));
    }, []);

    return (
        <UserContext.Provider value={{
            currentUser,
            setCurrentUser: switchUser,
            users: usersList,           // ← reactive list, not the static constant
            isAuthLoading,
            isAuthenticated,
            isLoggingOut,
            login,
            logout,
            refreshCurrentUser,
            updateCurrentUserRole,
            updateUserRoleInList,
            updateUserDetailsInList,
            updateUserStatus,
            toggleUserActiveStatus,
            deleteUserFromList,
            addKarmaPointsToUser,
            awardRuleKarma,
            refreshKarma,
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        return {
            currentUser: null,
            setCurrentUser: () => {},
            users: [],
            isAuthLoading: false,
            isAuthenticated: false,
            isLoggingOut: false,
            login: async () => {},
            logout: async () => {},
            refreshCurrentUser: async () => {},
            refreshKarma: async () => {},
            updateCurrentUserRole: () => {},
            updateUserRoleInList: () => {},
            updateUserDetailsInList: () => {},
            deleteUserFromList: () => {},
        };
    }
    return context;
};
