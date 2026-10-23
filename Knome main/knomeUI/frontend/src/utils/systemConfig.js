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
    requireArticleApproval: false,
    requireWikiApproval: false,
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
        const current = getSystemConfig();
        const merged = {
            ...current,
            ...newConfig,
        };

        // Prevent redundant writes and event storms if config hasn't changed
        let hasChanges = false;
        for (const key of Object.keys(merged)) {
            if (merged[key] !== current[key]) {
                hasChanges = true;
                break;
            }
        }
        if (!hasChanges) {
            return current;
        }

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
 * Fast synchronous check whether Article Approval is required (ON).
 */
export function isArticleApprovalRequired() {
    const config = getSystemConfig();
    if (typeof config.requireArticleApproval === 'boolean') {
        return config.requireArticleApproval;
    }
    if (config.requireArticleApproval === 'false' || config.requireArticleApproval === 'False') {
        return false;
    }
    if (config.requireArticleApproval === 'true' || config.requireArticleApproval === 'True') {
        return true;
    }
    return false;
}

/**
 * Fast synchronous check whether Wiki Approval is required (ON).
 */
export function isWikiApprovalRequired() {
    const config = getSystemConfig();
    if (typeof config.requireWikiApproval === 'boolean') {
        return config.requireWikiApproval;
    }
    if (config.requireWikiApproval === 'false' || config.requireWikiApproval === 'False') {
        return false;
    }
    if (config.requireWikiApproval === 'true' || config.requireWikiApproval === 'True') {
        return true;
    }
    return false;
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
let lastBackendSyncTime = 0;
const SYNC_THROTTLE_MS = 20000;

/**
 * Loads the authoritative approval policies and platform services from backend SQL Server.
 */
export async function loadSystemApprovalSettingFromBackend(forceRefresh = false) {
    if (typeof window === 'undefined') return getSystemConfig();
    const now = Date.now();
    if (!forceRefresh && (now - lastBackendSyncTime < SYNC_THROTTLE_MS)) {
        return getSystemConfig();
    }
    if (forceRefresh) backendSyncPromise = null;
    if (backendSyncPromise) return backendSyncPromise;

    lastBackendSyncTime = now;
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

                const reqArt = parseBool('requireArticleApproval', 'RequireArticleApproval');
                if (reqArt !== undefined) patch.requireArticleApproval = reqArt;

                const reqWiki = parseBool('requireWikiApproval', 'RequireWikiApproval');
                if (reqWiki !== undefined) patch.requireWikiApproval = reqWiki;

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
let activeHookCount = 0;
let globalSyncIntervalId = null;

function ensureGlobalPoller() {
    if (globalSyncIntervalId === null && typeof window !== 'undefined') {
        globalSyncIntervalId = setInterval(() => {
            loadSystemApprovalSettingFromBackend(false).catch(() => {});
        }, 60000);
    }
}

function releaseGlobalPoller() {
    if (activeHookCount <= 0 && globalSyncIntervalId !== null) {
        clearInterval(globalSyncIntervalId);
        globalSyncIntervalId = null;
    }
}

/**
 * React hook to reactively subscribe to system configuration changes.
 * Initializes instantaneously using locally cached system configuration (0ms latency),
 * then synchronizes with backend asynchronously in the background (SWR pattern).
 */
export function useSystemConfig() {
    const [config, setConfig] = useState(getSystemConfig);
    const [isLoaded, setIsLoaded] = useState(true);

    useEffect(() => {
        activeHookCount++;
        ensureGlobalPoller();

        // Initial background sync if needed
        loadSystemApprovalSettingFromBackend(false).catch(() => {});

        const handleConfigChange = (e) => {
            const next = e?.detail || getSystemConfig();
            setConfig(prev => {
                let hasChanges = false;
                for (const key of Object.keys(next)) {
                    if (next[key] !== prev[key]) {
                        hasChanges = true;
                        break;
                    }
                }
                return hasChanges ? { ...prev, ...next } : prev;
            });
        };

        const handleStorage = (e) => {
            if (e.key === SYSTEM_CONFIG_KEY) {
                const latest = getSystemConfig();
                setConfig(prev => {
                    let hasChanges = false;
                    for (const key of Object.keys(latest)) {
                        if (latest[key] !== prev[key]) {
                            hasChanges = true;
                            break;
                        }
                    }
                    return hasChanges ? { ...prev, ...latest } : prev;
                });
            }
        };

        window.addEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
        window.addEventListener('storage', handleStorage);

        return () => {
            activeHookCount--;
            releaseGlobalPoller();
            window.removeEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange);
            window.removeEventListener('storage', handleStorage);
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
        isArticleApprovalRequired: config.requireArticleApproval !== false,
        isWikiApprovalRequired: config.requireWikiApproval !== false,
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
