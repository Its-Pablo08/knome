/**
 * Notice Period Management & Post-Scheduling Governance Utility
 * 
 * Manages employee notice period status and policy enforcement.
 * Role-specific: Only HR Administrators configure and manage this policy.
 * When enabled, employees marked as "In Notice Period" have their post-scheduling
 * capability disabled across the application. When disabled or unmarked, scheduling is restored immediately.
 */

import { noticePeriodApi } from './apiService';

export const NOTICE_PERIOD_CONFIG_KEY = 'knome_notice_period_config';
export const NOTICE_PERIOD_EVENT = 'knome_notice_period_updated';
const NOTICE_PERIOD_UNSYNCED_KEY = 'knome_notice_period_unsynced';

// Clear any legacy sticky unsynced flag in sessionStorage that could block backend syncs
if (typeof window !== 'undefined') {
    try {
        sessionStorage.removeItem(NOTICE_PERIOD_UNSYNCED_KEY);
    } catch {}
}

let pendingSyncPromise = Promise.resolve();
let inFlightMutations = 0;
let mutationEpoch = 0;

// Cross-tab BroadcastChannel for instant multi-tab synchronization
let noticeBroadcastChannel = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
        noticeBroadcastChannel = new BroadcastChannel('knome_notice_period_channel');
        noticeBroadcastChannel.onmessage = (event) => {
            if (event?.data && typeof event.data === 'object') {
                saveNoticePeriodConfig(event.data, { skipBroadcastChannel: true });
            }
        };
    } catch {}
}

// Listen for real-time SignalR broadcasts ('knome:notice-period-updated' from signalrService)
if (typeof window !== 'undefined') {
    window.addEventListener('knome:notice-period-updated', (e) => {
        if (inFlightMutations > 0) return;
        const detail = e?.detail?.data || e?.detail;
        if (detail && typeof detail === 'object') {
            const config = {
                isEnabled: detail.isEnabled !== false && detail.IsEnabled !== false,
                employees: sanitizeEmployeesMap(detail.employees || detail.Employees || {})
            };
            saveNoticePeriodConfig(config);
        } else {
            syncNoticePeriodFromBackend().catch(() => {});
        }
    });
}

function enqueueBackendMutation(apiFn) {
    inFlightMutations += 1;
    mutationEpoch += 1;
    const currentEpoch = mutationEpoch;

    pendingSyncPromise = pendingSyncPromise
        .catch(() => {})
        .then(async () => {
            try {
                const res = await apiFn();
                const data = res?.data || res;
                if (data && typeof data === 'object' && ('isEnabled' in data || 'IsEnabled' in data || 'employees' in data || 'Employees' in data)) {
                    if (mutationEpoch === currentEpoch) {
                        saveNoticePeriodConfig({
                            isEnabled: data.isEnabled !== false && data.IsEnabled !== false,
                            employees: sanitizeEmployeesMap(data.employees || data.Employees || {})
                        });
                    }
                }
            } catch (err) {
                console.warn('[NoticePeriodManager] Backend sync warning:', err?.message || err);
            } finally {
                inFlightMutations = Math.max(0, inFlightMutations - 1);
                try {
                    sessionStorage.removeItem(NOTICE_PERIOD_UNSYNCED_KEY);
                } catch {}
            }
        });
    return pendingSyncPromise;
}

export const DEFAULT_NOTICE_PERIOD_CONFIG = {
    isEnabled: true, // Master policy switch: when true, notice period restrictions apply
    employees: {}
};

// Canonical roster alias mapping to bridge frontend INITIAL_USERS IDs and SQL Server UserIds/EmployeeIds
const CANONICAL_ROSTER_ALIASES = [
    { userId: '1057', empId: 'MPO652', email: 'deepak.simrodia@mponline.gov.in', name: 'deepak simrodia' },
    { userId: '108',  empId: 'MPO108', email: 'loveneesh.sharma@mponline.gov.in', name: 'loveneesh sharma' },
    { userId: '100',  empId: 'EMP100', email: 'mayurbansal7089@gmail.com', name: 'mayur bansal' },
    { userId: '101',  empId: 'EMP101', email: 'meghna@gmail.com', name: 'meghna tiwari' },
    { userId: '52',   empId: 'EMP052', email: 'sourabhsahu45@gmail.com', name: 'sourabh sahu' },
    { userId: '889',  empId: 'MPO889', email: 'vilash.deshmukh@mponline.gov.in', name: 'vilash deshmukh' },
    { userId: '2001', empId: 'MPO201', email: 'rohit.verma@mponline.gov.in', name: 'rohit verma' }
];

/**
 * Normalizes identifier strings (uppercase trimmed) for robust lookup.
 * Equates 'MPO' and 'MP0' prefixes (e.g. MPO652 vs MP0652).
 */
export function normalizeKey(val) {
    if (val === null || val === undefined) return '';
    const str = String(val).trim().toUpperCase();
    if (str.startsWith('MPO') || str.startsWith('MP0')) {
        return 'MPO' + str.slice(3);
    }
    return str;
}

/**
 * Checks whether an employee record in the notice map represents an active notice period restriction.
 */
function isActiveNoticeRecord(emp) {
    if (!emp || typeof emp !== 'object') return false;
    if (emp.disablePostScheduling === false || emp.DisablePostScheduling === false) return false;
    const status = String(emp.status || emp.Status || '').trim().toLowerCase();
    if (status === 'standard active' || status === 'standard' || status === 'restored') return false;
    return true;
}

/**
 * Filters an employees map so only active notice period records are kept.
 */
function sanitizeEmployeesMap(rawMap) {
    if (!rawMap || typeof rawMap !== 'object') return {};
    const clean = {};
    Object.keys(rawMap).forEach(key => {
        const emp = rawMap[key];
        if (isActiveNoticeRecord(emp)) {
            clean[key] = emp;
        }
    });
    return clean;
}

/**
 * Resolves all known identifier aliases (empId, userId, email, name) for a user object.
 */
function getUserIdentifiers(user) {
    const empIds = new Set();
    const userIds = new Set();
    const emails = new Set();
    const names = new Set();

    if (!user) return { empIds, userIds, emails, names };

    const rawEmpId = String(user.employeeId || '').trim().toUpperCase();
    const normEmpId = normalizeKey(rawEmpId);
    const uid = String(user.userId || user.id || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.fullName || user.name || '').trim().toLowerCase();

    if (normEmpId) {
        empIds.add(normEmpId);
        if (normEmpId.startsWith('MPO')) empIds.add('MP0' + normEmpId.slice(3));
    }
    if (rawEmpId) empIds.add(rawEmpId);
    if (uid) userIds.add(uid);
    if (email) emails.add(email);
    if (name && name.length > 2 && name !== 'employee') names.add(name);

    CANONICAL_ROSTER_ALIASES.forEach(alias => {
        if (
            empIds.has(alias.empId) ||
            userIds.has(alias.userId) ||
            emails.has(alias.email) ||
            names.has(alias.name)
        ) {
            empIds.add(alias.empId);
            empIds.add('MP0' + alias.empId.slice(3));
            userIds.add(alias.userId);
            emails.add(alias.email);
            names.add(alias.name);
        }
    });

    return { empIds, userIds, emails, names };
}

/**
 * Reads current notice period configuration from localStorage.
 */
export function getNoticePeriodConfig() {
    if (typeof window === 'undefined') return { ...DEFAULT_NOTICE_PERIOD_CONFIG };
    try {
        const raw = localStorage.getItem(NOTICE_PERIOD_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                isEnabled: parsed.isEnabled !== false && parsed.IsEnabled !== false,
                employees: sanitizeEmployeesMap(parsed.employees || parsed.Employees || {})
            };
        }
    } catch (e) {
        console.warn('[NoticePeriodManager] Failed to parse notice period configuration:', e);
    }
    return { ...DEFAULT_NOTICE_PERIOD_CONFIG };
}

/**
 * Persists notice period configuration and broadcasts real-time updates across components & browser tabs.
 */
export function saveNoticePeriodConfig(newConfig, options = {}) {
    if (typeof window === 'undefined') return getNoticePeriodConfig();
    try {
        const current = getNoticePeriodConfig();
        const merged = {
            isEnabled: newConfig.isEnabled !== undefined ? !!newConfig.isEnabled : current.isEnabled,
            employees: sanitizeEmployeesMap(newConfig.employees !== undefined ? newConfig.employees : current.employees)
        };

        const serialized = JSON.stringify(merged);
        localStorage.setItem(NOTICE_PERIOD_CONFIG_KEY, serialized);

        // Broadcast across tabs via BroadcastChannel
        if (!options.skipBroadcastChannel && noticeBroadcastChannel) {
            try {
                noticeBroadcastChannel.postMessage(merged);
            } catch {}
        }

        // Real-time local and cross-window dispatch
        window.dispatchEvent(new CustomEvent(NOTICE_PERIOD_EVENT, { detail: merged }));
        window.dispatchEvent(new StorageEvent('storage', {
            key: NOTICE_PERIOD_CONFIG_KEY,
            newValue: serialized
        }));

        return merged;
    } catch (e) {
        console.error('[NoticePeriodManager] Failed to save notice period configuration:', e);
        return getNoticePeriodConfig();
    }
}

/**
 * Synchronizes notice period configuration from the backend API.
 */
export async function syncNoticePeriodFromBackend() {
    try {
        if (inFlightMutations > 0) {
            await pendingSyncPromise.catch(() => {});
        }
        const epochBeforeFetch = mutationEpoch;
        const res = await noticePeriodApi.getConfig();
        const data = res?.data || res;
        if (data && typeof data === 'object') {
            // Do not overwrite if a local mutation was triggered while the GET was in-flight
            if (inFlightMutations > 0 || mutationEpoch !== epochBeforeFetch) {
                return getNoticePeriodConfig();
            }
            const config = {
                isEnabled: data.isEnabled !== false && data.IsEnabled !== false,
                employees: sanitizeEmployeesMap(data.employees || data.Employees || {})
            };
            saveNoticePeriodConfig(config);
            return config;
        }
    } catch (err) {
        // Fallback silently to existing local storage cache
    }
    return getNoticePeriodConfig();
}

/**
 * Toggles master policy enforcement (ON / OFF).
 */
export function setNoticePeriodPolicyEnabled(enabled) {
    const config = getNoticePeriodConfig();
    const updated = saveNoticePeriodConfig({
        ...config,
        isEnabled: !!enabled
    });

    // Sync to backend sequentially
    enqueueBackendMutation(() => noticePeriodApi.togglePolicy(enabled));

    return updated;
}

/**
 * Checks if an employee is currently marked as "In Notice Period" in the database/storage,
 * regardless of whether the master policy is currently active.
 */
export function isEmployeeMarkedInNotice(user) {
    if (!user) return false;

    const config = getNoticePeriodConfig();
    const employees = config.employees || {};
    const { empIds, userIds, emails, names } = getUserIdentifiers(user);

    // Direct key check across all known aliases
    for (const empId of empIds) {
        if (empId && isActiveNoticeRecord(employees[empId])) return true;
    }
    for (const uid of userIds) {
        if (uid && isActiveNoticeRecord(employees[uid])) return true;
    }
    for (const email of emails) {
        if (email && isActiveNoticeRecord(employees[email])) return true;
    }

    // Deep check across values and normalized keys
    const entries = Object.entries(employees);
    const matched = entries.some(([key, emp]) => {
        if (!isActiveNoticeRecord(emp)) return false;

        const keyNorm = normalizeKey(key);
        if (keyNorm && empIds.has(keyNorm)) return true;
        if (userIds.has(String(key).trim())) return true;
        if (emails.has(String(key).trim().toLowerCase())) return true;

        const empIdNorm = normalizeKey(emp.employeeId || emp.EmployeeId);
        const empUid = String(emp.userId || emp.UserId || emp.id || emp.Id || '').trim();
        const empEmail = String(emp.email || emp.Email || '').trim().toLowerCase();
        const empName = String(emp.name || emp.fullName || emp.FullName || emp.Name || '').trim().toLowerCase();

        if (empIdNorm && empIds.has(empIdNorm)) return true;
        if (empUid && userIds.has(empUid)) return true;
        if (empEmail && emails.has(empEmail)) return true;
        if (empName && empName.length > 2 && names.has(empName)) return true;
        return false;
    });

    if (matched) return true;

    // Fallback to direct property flags only if notice period config has never been stored in localStorage
    if (typeof window !== 'undefined' && !localStorage.getItem(NOTICE_PERIOD_CONFIG_KEY)) {
        if (user.inNoticePeriod === true || user.isInNoticePeriod === true || user.disablePostScheduling === true) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if post-scheduling is disabled for the given user.
 * Returns TRUE only if:
 * 1) Master Notice Period policy is ENABLED
 * 2) The employee is marked as "In Notice Period"
 */
export function isUserInNoticePeriod(user) {
    if (!user) return false;
    const config = getNoticePeriodConfig();
    if (!config.isEnabled) return false;
    return isEmployeeMarkedInNotice(user);
}

/**
 * Marks an employee as "In Notice Period".
 */
export function markEmployeeInNotice(user, adminUser = null, options = {}) {
    if (!user) return getNoticePeriodConfig();
    const config = getNoticePeriodConfig();
    const employees = { ...config.employees };

    const rawEmpId = user.employeeId || '';
    const normEmpId = normalizeKey(rawEmpId);
    const userIdNum = user.userId || user.id || null;
    const userIdStr = userIdNum ? String(userIdNum) : '';
    const email = user.email ? String(user.email).trim().toLowerCase() : '';
    const name = user.fullName || user.name || 'Employee';

    // Primary indexing key
    const primaryKey = normEmpId || userIdStr || email || `USER_${Date.now()}`;

    const record = {
        primaryKey,
        employeeId: rawEmpId || normEmpId,
        userId: userIdNum,
        id: userIdNum,
        name,
        fullName: name,
        email,
        designation: user.designation || 'Staff Member',
        department: user.department || user.departmentName || 'General',
        role: user.role || user.roleName || 'Employee',
        markedAt: options.markedAt || new Date().toISOString(),
        markedBy: adminUser?.fullName || adminUser?.name || 'HR Administrator',
        markedByRole: 'HR Admin',
        noticeDays: options.noticeDays || 30,
        reason: options.reason || 'Notice Period Registered',
        disablePostScheduling: true,
        status: 'In Notice Period'
    };

    employees[primaryKey] = record;
    if (normEmpId) employees[normEmpId] = record;
    if (rawEmpId) employees[rawEmpId] = record;
    if (userIdStr) employees[userIdStr] = record;
    if (email) employees[email] = record;

    const updated = saveNoticePeriodConfig({
        ...config,
        employees
    });

    // Sync to backend API sequentially
    enqueueBackendMutation(() => noticePeriodApi.toggleEmployee({
        userId: userIdNum,
        employeeId: rawEmpId || normEmpId,
        name,
        email,
        designation: user.designation,
        department: user.department,
        role: user.role || user.roleName,
        isMarked: true,
        noticeDays: options.noticeDays || 30,
        reason: options.reason || 'Notice Period Registered'
    }));

    return updated;
}

/**
 * Removes an employee from "In Notice Period", immediately restoring scheduling capabilities.
 */
export function unmarkEmployeeFromNotice(user, options = {}) {
    if (!user) return getNoticePeriodConfig();
    const config = getNoticePeriodConfig();
    const employees = { ...config.employees };

    // Clear any direct properties on the user object reference if present
    try {
        if ('inNoticePeriod' in user) user.inNoticePeriod = false;
        if ('isInNoticePeriod' in user) user.isInNoticePeriod = false;
        if ('disablePostScheduling' in user) user.disablePostScheduling = false;
    } catch {}

    const { empIds, userIds, emails, names } = getUserIdentifiers(user);

    // Delete all matching keys and aliases
    Object.keys(employees).forEach(key => {
        const emp = employees[key];
        let matches = false;

        const keyNorm = normalizeKey(key);
        if (keyNorm && empIds.has(keyNorm)) matches = true;
        if (userIds.has(String(key).trim())) matches = true;
        if (emails.has(String(key).trim().toLowerCase())) matches = true;

        if (!matches && emp) {
            const empIdNorm = normalizeKey(emp.employeeId || emp.EmployeeId);
            const empUid = String(emp.userId || emp.UserId || emp.id || emp.Id || '').trim();
            const empEmail = String(emp.email || emp.Email || '').trim().toLowerCase();
            const empName = String(emp.name || emp.fullName || emp.FullName || emp.Name || '').trim().toLowerCase();

            if (empIdNorm && empIds.has(empIdNorm)) matches = true;
            if (empUid && userIds.has(empUid)) matches = true;
            if (empEmail && emails.has(empEmail)) matches = true;
            if (empName && empName.length > 2 && names.has(empName)) matches = true;
        }

        if (matches) {
            delete employees[key];
        }
    });

    const updated = saveNoticePeriodConfig({
        ...config,
        employees
    });

    // Sync to backend API sequentially
    if (!options?.skipBackend) {
        enqueueBackendMutation(() => noticePeriodApi.toggleEmployee({
            userId: user.userId || user.id,
            employeeId: user.employeeId,
            name: user.fullName || user.name,
            email: user.email,
            isMarked: false
        }));
    }

    return updated;
}

/**
 * Authoritatively verifies whether a user is currently in notice period with backend.
 * If backend says false, immediately clears any stale local restrictions.
 */
export async function syncUserNoticeStatus(user) {
    if (!user) return false;
    try {
        const identifier = user.employeeId || user.userId || user.id || user.email;
        if (!identifier) return isUserInNoticePeriod(user);
        const res = await noticePeriodApi.checkUser(identifier);
        const data = res?.data || res;
        if (data && typeof data.inNoticePeriod === 'boolean') {
            const inNotice = data.inNoticePeriod;
            if (!inNotice) {
                // If backend says user is not in notice period, ensure local storage and state are cleared immediately
                unmarkEmployeeFromNotice(user, { skipBackend: true });
            }
            return inNotice;
        }
    } catch {
        // Fallback to local evaluation
    }
    return isUserInNoticePeriod(user);
}

/**
 * Bulk marks or unmarks multiple employees in a single atomic local update
 * and queues their backend updates sequentially.
 */
export function bulkUpdateEmployeesNotice(users, markAsInNotice, adminUser = null, options = {}) {
    if (!Array.isArray(users) || users.length === 0) return getNoticePeriodConfig();
    const config = getNoticePeriodConfig();
    const employees = { ...config.employees };
    const payloads = [];

    users.forEach(user => {
        if (!user) return;
        const rawEmpId = user.employeeId || '';
        const normEmpId = normalizeKey(rawEmpId);
        const userIdNum = user.userId || user.id || null;
        const userIdStr = userIdNum ? String(userIdNum) : '';
        const email = user.email ? String(user.email).trim().toLowerCase() : '';
        const name = user.fullName || user.name || 'Employee';

        if (markAsInNotice) {
            const primaryKey = normEmpId || userIdStr || email || `USER_${Date.now()}`;
            const record = {
                primaryKey,
                employeeId: rawEmpId || normEmpId,
                userId: userIdNum,
                id: userIdNum,
                name,
                fullName: name,
                email,
                designation: user.designation || 'Staff Member',
                department: user.department || user.departmentName || 'General',
                role: user.role || user.roleName || 'Employee',
                markedAt: options.markedAt || new Date().toISOString(),
                markedBy: adminUser?.fullName || adminUser?.name || 'HR Administrator',
                markedByRole: 'HR Admin',
                noticeDays: options.noticeDays || 30,
                reason: options.reason || 'Notice Period Registered',
                disablePostScheduling: true,
                status: 'In Notice Period'
            };

            employees[primaryKey] = record;
            if (normEmpId) employees[normEmpId] = record;
            if (rawEmpId) employees[rawEmpId] = record;
            if (userIdStr) employees[userIdStr] = record;
            if (email) employees[email] = record;

            payloads.push({
                userId: userIdNum,
                employeeId: rawEmpId || normEmpId,
                name,
                email,
                designation: user.designation,
                department: user.department,
                role: user.role || user.roleName,
                isMarked: true,
                noticeDays: options.noticeDays || 30,
                reason: options.reason || 'Notice Period Registered'
            });
        } else {
            try {
                if ('inNoticePeriod' in user) user.inNoticePeriod = false;
                if ('isInNoticePeriod' in user) user.isInNoticePeriod = false;
                if ('disablePostScheduling' in user) user.disablePostScheduling = false;
            } catch {}

            const { empIds, userIds, emails, names } = getUserIdentifiers(user);

            Object.keys(employees).forEach(key => {
                const emp = employees[key];
                let matches = false;

                const keyNorm = normalizeKey(key);
                if (keyNorm && empIds.has(keyNorm)) matches = true;
                if (userIds.has(String(key).trim())) matches = true;
                if (emails.has(String(key).trim().toLowerCase())) matches = true;

                if (!matches && emp) {
                    const empIdNorm = normalizeKey(emp.employeeId || emp.EmployeeId);
                    const empUid = String(emp.userId || emp.UserId || emp.id || emp.Id || '').trim();
                    const empEmail = String(emp.email || emp.Email || '').trim().toLowerCase();
                    const empName = String(emp.name || emp.fullName || emp.FullName || emp.Name || '').trim().toLowerCase();

                    if (empIdNorm && empIds.has(empIdNorm)) matches = true;
                    if (empUid && userIds.has(empUid)) matches = true;
                    if (empEmail && emails.has(empEmail)) matches = true;
                    if (empName && empName.length > 2 && names.has(empName)) matches = true;
                }

                if (matches) {
                    delete employees[key];
                }
            });

            payloads.push({
                userId: userIdNum,
                employeeId: rawEmpId,
                name,
                email,
                isMarked: false
            });
        }
    });

    const updated = saveNoticePeriodConfig({
        ...config,
        employees
    });

    enqueueBackendMutation(async () => {
        let lastRes = null;
        for (const payload of payloads) {
            lastRes = await noticePeriodApi.toggleEmployee(payload);
        }
        return lastRes;
    });

    return updated;
}

/**
 * Toggles an employee's notice period status.
 * Returns true if the user is now in notice period, false if restored.
 */
export function toggleEmployeeNoticeStatus(user, adminUser = null, options = {}) {
    const isCurrentlyMarked = isEmployeeMarkedInNotice(user);
    if (isCurrentlyMarked) {
        unmarkEmployeeFromNotice(user);
        return false;
    } else {
        markEmployeeInNotice(user, adminUser, options);
        return true;
    }
}

/**
 * Returns a list of unique employee records currently marked in notice period.
 */
export function getMarkedEmployeesList() {
    const config = getNoticePeriodConfig();
    const employeesMap = config.employees || {};
    const seen = new Set();
    const result = [];

    Object.values(employeesMap).forEach(emp => {
        if (!isActiveNoticeRecord(emp)) return;
        const key = normalizeKey(emp.employeeId) || String(emp.userId || emp.id) || emp.email;
        if (key && !seen.has(key)) {
            seen.add(key);
            result.push(emp);
        }
    });

    return result;
}
