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

export const DEFAULT_NOTICE_PERIOD_CONFIG = {
    isEnabled: true, // Master policy switch: when true, notice period restrictions apply
    employees: {}
};

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
 * Reads current notice period configuration from localStorage.
 */
export function getNoticePeriodConfig() {
    if (typeof window === 'undefined') return { ...DEFAULT_NOTICE_PERIOD_CONFIG };
    try {
        const raw = localStorage.getItem(NOTICE_PERIOD_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                isEnabled: parsed.isEnabled !== false,
                employees: parsed.employees || {}
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
export function saveNoticePeriodConfig(newConfig) {
    if (typeof window === 'undefined') return getNoticePeriodConfig();
    try {
        const current = getNoticePeriodConfig();
        const merged = {
            isEnabled: newConfig.isEnabled !== undefined ? !!newConfig.isEnabled : current.isEnabled,
            employees: newConfig.employees !== undefined ? newConfig.employees : current.employees
        };

        localStorage.setItem(NOTICE_PERIOD_CONFIG_KEY, JSON.stringify(merged));

        // Real-time local and cross-window dispatch
        const dispatch = () => {
            window.dispatchEvent(new CustomEvent(NOTICE_PERIOD_EVENT, { detail: merged }));
            window.dispatchEvent(new StorageEvent('storage', {
                key: NOTICE_PERIOD_CONFIG_KEY,
                newValue: JSON.stringify(merged)
            }));
        };

        if (typeof queueMicrotask === 'function') {
            queueMicrotask(dispatch);
        } else {
            setTimeout(dispatch, 0);
        }

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
        const res = await noticePeriodApi.getConfig();
        const data = res?.data || res;
        if (data && typeof data === 'object') {
            const config = {
                isEnabled: data.isEnabled !== false && data.IsEnabled !== false,
                employees: data.employees || data.Employees || {}
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

    // Sync to backend asynchronously (failsafe if backend is restarting)
    noticePeriodApi.togglePolicy(enabled).catch(() => {});

    return updated;
}

/**
 * Checks if an employee is currently marked as "In Notice Period" in the database/storage,
 * regardless of whether the master policy is currently active.
 */
export function isEmployeeMarkedInNotice(user) {
    if (!user) return false;

    // Check direct property flags on user object if set by backend or auth
    if (user.inNoticePeriod === true || user.isInNoticePeriod === true || user.disablePostScheduling === true) {
        return true;
    }

    const config = getNoticePeriodConfig();
    const employees = config.employees || {};

    const targetEmpId = normalizeKey(user.employeeId);
    const targetUserId = String(user.userId || user.id || '').trim();
    const targetEmail = String(user.email || '').trim().toLowerCase();
    const targetName = String(user.fullName || user.name || '').trim().toLowerCase();

    // Direct key check
    if (targetEmpId && employees[targetEmpId]) return true;
    if (targetUserId && employees[targetUserId]) return true;
    if (targetEmail && employees[targetEmail]) return true;

    // Deep check across values
    const entries = Object.values(employees);
    return entries.some(emp => {
        if (!emp) return false;

        if (targetEmpId && normalizeKey(emp.employeeId) === targetEmpId) return true;
        if (targetUserId && String(emp.userId || emp.id || '') === targetUserId) return true;
        if (targetEmail && String(emp.email || '').trim().toLowerCase() === targetEmail) return true;
        if (targetName && targetName.length > 2 && String(emp.name || emp.fullName || '').trim().toLowerCase() === targetName) return true;
        return false;
    });
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

    // Sync to backend API asynchronously
    noticePeriodApi.toggleEmployee({
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
    }).catch(() => {});

    return updated;
}

/**
 * Removes an employee from "In Notice Period", immediately restoring scheduling capabilities.
 */
export function unmarkEmployeeFromNotice(user) {
    if (!user) return getNoticePeriodConfig();
    const config = getNoticePeriodConfig();
    const employees = { ...config.employees };

    const normEmpId = normalizeKey(user.employeeId);
    const rawEmpId = String(user.employeeId || '').toUpperCase();
    const userIdStr = String(user.userId || user.id || '');
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.fullName || user.name || '').trim().toLowerCase();

    // Delete matching keys
    Object.keys(employees).forEach(key => {
        const emp = employees[key];
        let matches = false;
        if (normEmpId && normalizeKey(emp?.employeeId) === normEmpId) matches = true;
        if (rawEmpId && String(emp?.employeeId || '').toUpperCase() === rawEmpId) matches = true;
        if (userIdStr && String(emp?.userId || emp?.id || '') === userIdStr) matches = true;
        if (email && String(emp?.email || '').trim().toLowerCase() === email) matches = true;
        if (name && name.length > 2 && String(emp?.name || emp?.fullName || '').trim().toLowerCase() === name) matches = true;
        if (normalizeKey(key) === normEmpId || key === userIdStr) matches = true;

        if (matches) {
            delete employees[key];
        }
    });

    const updated = saveNoticePeriodConfig({
        ...config,
        employees
    });

    // Sync to backend API asynchronously
    noticePeriodApi.toggleEmployee({
        userId: user.userId || user.id,
        employeeId: user.employeeId,
        name: user.fullName || user.name,
        email: user.email,
        isMarked: false
    }).catch(() => {});

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
        if (!emp) return;
        const key = normalizeKey(emp.employeeId) || String(emp.userId || emp.id) || emp.email;
        if (key && !seen.has(key)) {
            seen.add(key);
            result.push(emp);
        }
    });

    return result;
}
