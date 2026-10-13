import { useState, useEffect, useMemo } from 'react';

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
export async function loadSystemApprovalSettingFromBackend(forceRefresh = false) {
    if (typeof window === 'undefined') return getSystemConfig();
    if (forceRefresh) backendSyncPromise = null;
    if (backendSyncPromise) return backendSyncPromise;

    backendSyncPromise = (async () => {
        try {
            const { apiClient } = await import('./apiClient');
            const res = await apiClient.get('/settings/approval', { noCache: true });
            const data = (res && res.data !== undefined) ? res.data : res;
            if (data && typeof data === 'object') {
                const parseBool = (...keys) => {
                    for (const k of keys) {
                        const v = data[k];
                        if (typeof v === 'boolean') return v;
                        if (v === 'true' || v === 'True') return true;
                        if (v === 'false' || v === 'False') return false;
                    }
                    return undefined;
                };

                const patch = {};
                const reqApp = parseBool('requireApproval', 'RequireApproval');
                if (reqApp !== undefined) patch.requireContentAndCommunityApproval = reqApp;

                const reqComm = parseBool('requireCommunityApproval', 'RequireCommunityApproval');
                if (reqComm !== undefined) patch.requireCommunityApproval = reqComm;

                const reqVid = parseBool('requireVideoApproval', 'RequireVideoApproval');
                if (reqVid !== undefined) patch.requireVideoApproval = reqVid;

                const reqPod = parseBool('requirePodcastApproval', 'RequirePodcastApproval');
                if (reqPod !== undefined) patch.requirePodcastApproval = reqPod;

                const enMsg = parseBool('enableMessaging', 'EnableMessaging');
                if (enMsg !== undefined) patch.enableMessaging = enMsg;

                const enEmail = parseBool('enableEmail', 'EnableEmail');
                if (enEmail !== undefined) patch.enableEmail = enEmail;

                const enPosts = parseBool('enablePosts', 'EnablePosts');
                if (enPosts !== undefined) patch.enablePosts = enPosts;

                const enArticles = parseBool('enableArticles', 'EnableArticles');
                if (enArticles !== undefined) patch.enableArticles = enArticles;

                const enClips = parseBool('enableClips', 'EnableClips');
                if (enClips !== undefined) patch.enableClips = enClips;

                const enWiki = parseBool('enableWiki', 'EnableWiki');
                if (enWiki !== undefined) patch.enableWiki = enWiki;

                const enVideos = parseBool('enableVideos', 'EnableVideos');
                if (enVideos !== undefined) patch.enableVideos = enVideos;

                const enPodcasts = parseBool('enablePodcasts', 'EnablePodcasts');
                if (enPodcasts !== undefined) patch.enablePodcasts = enPodcasts;

                const updated = saveSystemConfig(patch);
                return updated;
            }
        } catch (e) {
            // Fallback to locally stored configuration if backend is temporarily unreachable
        } finally {
            setTimeout(() => {
                backendSyncPromise = null;
            }, 500);
        }
        return getSystemConfig();
    })();

    return backendSyncPromise;
}

let isGlobalInitialSyncCompleted = true;

/**
 * React hook to reactively subscribe to system configuration changes.
 * Initializes instantaneously using locally cached system configuration (0ms latency),
 * then synchronizes with backend asynchronously in the background (SWR pattern).
 */
export function useSystemConfig() {
    const [config, setConfig] = useState(getSystemConfig);
    const [isLoaded, setIsLoaded] = useState(true);

    useEffect(() => {
        // Asynchronous background sync with backend database without blocking initial UI paint
        loadSystemApprovalSettingFromBackend(false).then(latestConfig => {
            isGlobalInitialSyncCompleted = true;
            if (latestConfig) {
                setConfig(latestConfig);
            }
        }).catch(() => {
            isGlobalInitialSyncCompleted = true;
        });

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

        // Window focus & tab visibility re-sync: ensures regular users immediately receive admin changes
        const handleReSync = () => {
            loadSystemApprovalSettingFromBackend(true).then(latestConfig => {
                if (latestConfig) setConfig(latestConfig);
            }).catch(() => {});
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleReSync();
            }
        };

        // Periodic light background re-sync (every 30 seconds)
        const pollInterval = setInterval(() => {
            handleReSync();
        }, 30000);

        window.addEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
        window.addEventListener('storage', handleStorage);
        window.addEventListener('focus', handleReSync);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(pollInterval);
            window.removeEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('focus', handleReSync);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const updateConfig = (patch) => {
        const updated = saveSystemConfig(patch);
        setConfig(updated);
    };

    return useMemo(() => ({
        ...config,
        config,
        isLoaded,
        isSyncing: !isLoaded,
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
    }), [config, isLoaded]);
}
