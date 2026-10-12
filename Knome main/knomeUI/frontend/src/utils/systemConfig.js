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
    requireCommunityApproval: true,
    requireVideoApproval: true,
    requirePodcastApproval: true,
    enablePosts: true,
    enableArticles: true,
    enableClips: true,
    enableWiki: true,
    enableVideos: true,
    enablePodcasts: true,
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
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => {
                window.dispatchEvent(new CustomEvent(SYSTEM_CONFIG_EVENT, { detail: merged }));
            });
        } else {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent(SYSTEM_CONFIG_EVENT, { detail: merged }));
            }, 0);
        }
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
 * Fast synchronous check whether Content & Community Approval is required (master/legacy).
 */
export function isApprovalRequired() {
    const config = getSystemConfig();
    return config.requireContentAndCommunityApproval !== false;
}

/**
 * Fast synchronous check whether Community Approval is required (ON).
 */
export function isCommunityApprovalRequired() {
    const config = getSystemConfig();
    if (typeof config.requireCommunityApproval === 'boolean') {
        return config.requireCommunityApproval;
    }
    return config.requireContentAndCommunityApproval !== false;
}

/**
 * Fast synchronous check whether Video Approval is required (ON).
 */
export function isVideoApprovalRequired() {
    const config = getSystemConfig();
    if (typeof config.requireVideoApproval === 'boolean') {
        return config.requireVideoApproval;
    }
    return config.requireContentAndCommunityApproval !== false;
}

/**
 * Fast synchronous check whether Podcast Approval is required (ON).
 */
export function isPodcastApprovalRequired() {
    const config = getSystemConfig();
    if (typeof config.requirePodcastApproval === 'boolean') {
        return config.requirePodcastApproval;
    }
    return config.requireContentAndCommunityApproval !== false;
}

/**
 * Fast synchronous checks for independent feature module toggles
 */
export function isPostsEnabled() {
    const config = getSystemConfig();
    return config.enablePosts !== false;
}

export function isArticlesEnabled() {
    const config = getSystemConfig();
    return config.enableArticles !== false;
}

export function isClipsEnabled() {
    const config = getSystemConfig();
    return config.enableClips !== false;
}

export function isWikiEnabled() {
    const config = getSystemConfig();
    return config.enableWiki !== false;
}

export function isVideosEnabled() {
    const config = getSystemConfig();
    return config.enableVideos !== false;
}

export function isPodcastsEnabled() {
    const config = getSystemConfig();
    return config.enablePodcasts !== false;
}

let backendSyncPromise = null;

/**
 * Loads the authoritative approval policies and platform services from backend SQL Server.
 */
export async function loadSystemApprovalSettingFromBackend() {
    if (typeof window === 'undefined') return getSystemConfig();
    if (backendSyncPromise) return backendSyncPromise;

    backendSyncPromise = (async () => {
        try {
            const { apiClient } = await import('./apiClient');
            const res = await apiClient.get('/settings/approval');
            const data = res?.data !== undefined ? res.data : res;
            if (data) {
                const patch = {};
                if (typeof data.requireApproval === 'boolean') {
                    patch.requireContentAndCommunityApproval = data.requireApproval;
                }
                if (typeof data.requireCommunityApproval === 'boolean') {
                    patch.requireCommunityApproval = data.requireCommunityApproval;
                }
                if (typeof data.requireVideoApproval === 'boolean') {
                    patch.requireVideoApproval = data.requireVideoApproval;
                }
                if (typeof data.requirePodcastApproval === 'boolean') {
                    patch.requirePodcastApproval = data.requirePodcastApproval;
                }
                if (typeof data.enableMessaging === 'boolean') {
                    patch.enableMessaging = data.enableMessaging;
                }
                if (typeof data.enableEmail === 'boolean') {
                    patch.enableEmail = data.enableEmail;
                }
                if (typeof data.enablePosts === 'boolean') {
                    patch.enablePosts = data.enablePosts;
                }
                if (typeof data.enableArticles === 'boolean') {
                    patch.enableArticles = data.enableArticles;
                }
                if (typeof data.enableClips === 'boolean') {
                    patch.enableClips = data.enableClips;
                }
                if (typeof data.enableWiki === 'boolean') {
                    patch.enableWiki = data.enableWiki;
                }
                if (typeof data.enableVideos === 'boolean') {
                    patch.enableVideos = data.enableVideos;
                }
                if (typeof data.enablePodcasts === 'boolean') {
                    patch.enablePodcasts = data.enablePodcasts;
                }
                const updated = saveSystemConfig(patch);
                return updated;
            }
        } catch (e) {
            // Fallback to locally stored configuration if backend is temporarily unreachable
        } finally {
            setTimeout(() => {
                backendSyncPromise = null;
            }, 3000);
        }
        return getSystemConfig();
    })();

    return backendSyncPromise;
}

/**
 * React hook to reactively subscribe to system configuration changes.
 */
export function useSystemConfig() {
    const [config, setConfig] = useState(getSystemConfig);

    useEffect(() => {
        // Initial sync with backend database
        loadSystemApprovalSettingFromBackend().then(latestConfig => {
            if (latestConfig) {
                setConfig(latestConfig);
            }
        }).catch(() => {});

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
        ...config,
        config,
        isMessagingEnabled: config.enableMessaging !== false,
        isEmailEnabled: config.enableEmail !== false,
        isApprovalRequired: config.requireContentAndCommunityApproval !== false,
        isCommunityApprovalRequired: config.requireCommunityApproval !== false,
        isVideoApprovalRequired: config.requireVideoApproval !== false,
        isPodcastApprovalRequired: config.requirePodcastApproval !== false,
        isPostsEnabled: config.enablePosts !== false,
        isArticlesEnabled: config.enableArticles !== false,
        isClipsEnabled: config.enableClips !== false,
        isWikiEnabled: config.enableWiki !== false,
        isVideosEnabled: config.enableVideos !== false,
        isPodcastsEnabled: config.enablePodcasts !== false,
        enablePosts: config.enablePosts !== false,
        enableArticles: config.enableArticles !== false,
        enableClips: config.enableClips !== false,
        enableWiki: config.enableWiki !== false,
        enableVideos: config.enableVideos !== false,
        enablePodcasts: config.enablePodcasts !== false,
        updateConfig,
    };
}
