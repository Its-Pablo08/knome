const getHostIp = () => {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        return window.location.hostname;
    }
    return 'localhost';
};

const currentHost = getHostIp();

// Candidate Backend URLs ordered by priority (Dynamic host first for LAN / WiFi access)
const CANDIDATES = [
    `http://${currentHost}:5096/api`,
    `http://${currentHost}:5095/api`,
    'http://localhost:5096/api',
    'http://localhost:5095/api'
];

let activeBaseUrl = CANDIDATES[0];

export const getApiBaseUrl = () => {
    return activeBaseUrl.replace(/\/api$/, '');
};

export const getHubUrl = () => {
    return `${getApiBaseUrl()}/hubs/notifications`;
};

// In-flight reauth promise deduplication & cooldown guard
let reauthPromise = null;
let lastReauthFailTime = 0;
const REAUTH_COOLDOWN_MS = 6000;

/** Silently re-login or refresh session using stored credentials */
async function silentReauth() {
    // If a reauth request is already in-flight, return the same promise to prevent hammering backend
    if (reauthPromise) {
        return reauthPromise;
    }

    // Cooldown check: if reauth failed recently with invalid credentials, wait before trying again
    if (Date.now() - lastReauthFailTime < REAUTH_COOLDOWN_MS) {
        return null;
    }

    // Do not attempt reauth if user has actively logged out or is logging out
    if (typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true') {
        return null;
    }

    let employeeId = localStorage.getItem('knome_employeeId');
    if (!employeeId) {
        const token = localStorage.getItem('knome_jwt');
        if (token && token.includes('.')) {
            try {
                const parts = token.split('.');
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                employeeId = payload.employeeId || payload.empId || payload.sub || payload.unique_name;
            } catch { /* ignore */ }
        }
    }
    // If not logged in, NEVER fallback to EMP001 (Aarav) or any user
    if (!employeeId) {
        return null;
    }

    const authCred = sessionStorage.getItem('knome_auth_pwd');
    const password = authCred || 'Password@123';

    reauthPromise = (async () => {
        let respondedWithHttpError = false;
        try {
            const searchUrls = Array.from(new Set([activeBaseUrl, ...CANDIDATES]));
            for (const baseUrl of searchUrls) {
                try {
                    const res = await fetch(`${baseUrl}/Auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ employeeId, password }),
                    });
                    if (res.ok) {
                        const json = await res.json();
                        const token = json?.data?.token || json?.token;
                        if (token) {
                            activeBaseUrl = baseUrl;
                            localStorage.setItem('knome_jwt', token);
                            localStorage.setItem('knome_employeeId', employeeId);
                            if (json?.data?.refreshToken) {
                                localStorage.setItem('knome_refresh', json.data.refreshToken);
                            }
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('knome_token_refreshed', { detail: { token } }));
                            }
                            return token;
                        }
                    } else {
                        respondedWithHttpError = true;
                    }
                } catch { /* transient network / connection refused */ }
            }
            // Only set cooldown if server explicitly rejected credentials, not if offline
            if (respondedWithHttpError) {
                lastReauthFailTime = Date.now();
            }
            return null;
        } finally {
            reauthPromise = null;
        }
    })();

    return reauthPromise;
}

// High-speed in-memory response cache & in-flight promise deduplication
const responseCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL_MS = 6000; // 6 seconds fast TTL for read requests

export const apiClient = {
    getBaseUrl() {
        return activeBaseUrl;
    },

    clearCache() {
        responseCache.clear();
        inFlightRequests.clear();
    },

    async request(endpoint, options = {}) {
        let reqEndpoint = endpoint;
        if (options.params && typeof options.params === 'object') {
            const searchParams = new URLSearchParams();
            Object.entries(options.params).forEach(([key, val]) => {
                if (val !== undefined && val !== null && val !== '') {
                    searchParams.append(key, val);
                }
            });
            const qs = searchParams.toString();
            if (qs) {
                reqEndpoint += (reqEndpoint.includes('?') ? '&' : '?') + qs;
            }
        }

        const method = (options.method || 'GET').toUpperCase();
        const isGet = method === 'GET';
        const cacheKey = `${reqEndpoint}_${options.headers?.Authorization || localStorage.getItem('knome_jwt') || ''}`;

        // 1. If it's a GET request and cached within TTL, return instantly (0ms latency)
        if (isGet && !options.noCache) {
            const cached = responseCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                return cached.data;
            }

            // In-flight deduplication: reuse active pending promise
            if (inFlightRequests.has(cacheKey)) {
                return inFlightRequests.get(cacheKey);
            }
        }

        // Invalidate cache on any state mutation (POST/PUT/DELETE)
        if (!isGet) {
            responseCache.clear();
            inFlightRequests.clear();
        }

        const executeFetch = async () => {
            const token = localStorage.getItem('knome_jwt');
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...options.headers
            };

            const config = { ...options, headers };

            // 1. Try active cached base URL first
            try {
                const url = `${activeBaseUrl}${reqEndpoint}`;
                const response = await fetch(url, config);
                const result = await this.handleResponse(response, { url, config });

                // Cache successful GET responses
                if (isGet && !options.noCache) {
                    responseCache.set(cacheKey, { timestamp: Date.now(), data: result });
                }
                return result;
            } catch (activeErr) {
                if (activeErr?.isApiError) {
                    throw activeErr;
                }

                // 2. Only if network fetch failed completely, try candidate URLs
                for (const candidate of CANDIDATES) {
                    if (candidate === activeBaseUrl) continue;
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 400);
                        const url = `${candidate}${reqEndpoint}`;
                        const response = await fetch(url, { ...config, signal: controller.signal });
                        clearTimeout(timeoutId);
                        
                        activeBaseUrl = candidate;
                        const result = await this.handleResponse(response, { url, config });
                        if (isGet && !options.noCache) {
                            responseCache.set(cacheKey, { timestamp: Date.now(), data: result });
                        }
                        return result;
                    } catch (candidateErr) {
                        if (candidateErr?.isApiError) throw candidateErr;
                    }
                }
                console.error(`API Call failed across all endpoints for ${reqEndpoint}`);
                throw activeErr;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        };

        if (isGet && !options.noCache) {
            const pendingPromise = executeFetch();
            inFlightRequests.set(cacheKey, pendingPromise);
            return pendingPromise;
        }

        return executeFetch();
    },

    async handleResponse(response, retryConfig) {
        if (response.status === 401) {
            // Try silent re-auth once before giving up (only if an active user session exists)
            if (retryConfig && localStorage.getItem('knome_jwt') && sessionStorage.getItem('knome_logging_out') !== 'true') {
                const freshToken = await silentReauth();

                if (freshToken) {
                    // Retry the original request with the fresh token
                    try {
                        const { url, config } = retryConfig;
                        const retryHeaders = {
                            ...config.headers,
                            'Authorization': `Bearer ${freshToken}`,
                        };
                        const retryResponse = await fetch(url, { ...config, headers: retryHeaders });
                        return this.handleResponse(retryResponse, null); // no retry on 2nd 401
                    } catch { /* fall through to throw */ }
                }
            }

            // Only remove tokens if we truly cannot recover
            // Do NOT remove knome_jwt here blindly — it may be set by SSO flow mid-restore.
            // The caller (restoreSession) manages token lifecycle.
            const err = new Error('Unauthorized');
            err.isApiError = true;
            err.status = 401;
            throw err;
        }

        if (response.status === 204) {
            return null;
        }

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        
        if (!response.ok) {
            let errMessage = (data && (data.message || data.title)) || `API request failed with status ${response.status}`;
            if (data?.errors) {
                if (Array.isArray(data.errors) && data.errors.length > 0) {
                    errMessage = data.errors.join('; ');
                } else if (typeof data.errors === 'object') {
                    const errorList = Object.values(data.errors).flat().filter(Boolean);
                    if (errorList.length > 0) {
                        errMessage = errorList.join('; ');
                    }
                }
            }
            const err = new Error(errMessage);
            err.isApiError = true;
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data?.data !== undefined ? data.data : data;
    },

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    },

    post(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
    },

    put(endpoint, body, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
    },

    delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    },

    async uploadProfileImage(file) {
        const token = localStorage.getItem('knome_jwt');
        const formData = new FormData();
        formData.append('File', file);
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        try {
            const response = await fetch(`${activeBaseUrl}/users/profile/image`, { method: 'POST', headers, body: formData });
            return (await this.handleResponse(response));
        } catch (e) {
            for (const candidate of CANDIDATES) {
                if (candidate === activeBaseUrl) continue;
                try {
                    const response = await fetch(`${candidate}/users/profile/image`, { method: 'POST', headers, body: formData });
                    activeBaseUrl = candidate;
                    return (await this.handleResponse(response));
                } catch { /* continue */ }
            }
            throw e;
        }
    },

    async uploadFile(endpoint, file, type = 'doc') {
        const token = localStorage.getItem('knome_jwt');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        
        try {
            const response = await fetch(`${activeBaseUrl}${endpoint}`, { method: 'POST', headers, body: formData });
            return (await this.handleResponse(response));
        } catch (e) {
            for (const candidate of CANDIDATES) {
                if (candidate === activeBaseUrl) continue;
                try {
                    const response = await fetch(`${candidate}${endpoint}`, { method: 'POST', headers, body: formData });
                    activeBaseUrl = candidate;
                    return (await this.handleResponse(response));
                } catch { /* continue */ }
            }
            throw e;
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        apiClient.clearCache();
        lastReauthFailTime = 0;
        reauthPromise = null;
    });
}
