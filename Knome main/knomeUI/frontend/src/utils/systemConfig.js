import { useState, useEffect } from 'react';

export const SYSTEM_CONFIG_KEY = 'knome_system_config';
export const SYSTEM_CONFIG_EVENT = 'knome_config_updated';

export const DEFAULT_SYSTEM_CONFIG = {
    maintenanceMode: false,
    autoModeration: true,
    moderationSensitivity: 'High (Strict AI)',
    aiToxicityThreshold: 80,
    aiAutoQuarantine: true,
    aiDeepScan: true,
    maxUploadMb: 100,
    jwtTtlHours: 24,
    notifyAdminsOnReport: true,
    enableMessaging: true,
    enableEmail: true,
    requireContentAndCommunityApproval: true,
};

/**
 * Read current system configuration from localStorage, falling back to defaults.
 */
export function getSystemConfig() {
    if (typeof window === 'undefined') return { ...DEFAULT_SYSTEM_CONFIG };
    try {
        const raw = localStorage.getItem(SYSTEM_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_SYSTEM_CONFIG,
                ...parsed,
            };
        }
    } catch (e) {
        console.warn('Failed to parse system configuration:', e);
    }
    return { ...DEFAULT_SYSTEM_CONFIG };
}

/**
 * Persist system configuration to localStorage and broadcast event across components/windows.
 */
export function saveSystemConfig(newConfig) {
    if (typeof window === 'undefined') return;
    try {
        const merged = {
            ...getSystemConfig(),
            ...newConfig,
        };
        localStorage.setItem(SYSTEM_CONFIG_KEY, JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent(SYSTEM_CONFIG_EVENT, { detail: merged }));
        return merged;
    } catch (e) {
        console.error('Failed to save system config:', e);
        return getSystemConfig();
    }
}

/**
 * Fast synchronous check whether direct messaging is enabled.
 */
export function isMessagingEnabled() {
    const config = getSystemConfig();
    return config.enableMessaging !== false;
}

/**
 * Fast synchronous check whether email features are enabled.
 */
export function isEmailEnabled() {
    const config = getSystemConfig();
    return config.enableEmail !== false;
}

/**
 * Fast synchronous check whether Content & Community Approval is required (ON).
 */
export function isApprovalRequired() {
    const config = getSystemConfig();
    return config.requireContentAndCommunityApproval !== false;
}

/**
 * React hook to reactively subscribe to system configuration changes.
 */
export function useSystemConfig() {
    const [config, setConfig] = useState(getSystemConfig);

    useEffect(() => {
        const handleConfigChange = (e) => {
            if (e?.detail) {
                setConfig(prev => ({ ...prev, ...e.detail }));
            } else {
                setConfig(getSystemConfig());
            }
        };

        const handleStorage = (e) => {
            if (e.key === SYSTEM_CONFIG_KEY || e.key === null) {
                setConfig(getSystemConfig());
            }
        };

        window.addEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const updateConfig = (patch) => {
        const updated = saveSystemConfig(patch);
        setConfig(updated);
    };

    return {
        config,
        isMessagingEnabled: config.enableMessaging !== false,
        isEmailEnabled: config.enableEmail !== false,
        isApprovalRequired: config.requireContentAndCommunityApproval !== false,
        updateConfig,
    };
}
