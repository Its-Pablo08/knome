import { apiClient } from './apiClient';

export const RESTRICTED_WORDS = [
    // PII & Sensitive Credentials
    "aadhaar", "access token", "api key", "apikey", "bank account", "client secret",
    "connection string", "credit card", "cvv", "database password", "jwt token",
    "otp", "pan card", "passport", "password", "private key", "refresh token",
    "secret key",

    // Abusive / Profanities (Hindi / Hinglish / English)
    "abuse", "abusive", "asshole", "bastard", "bc", "behenchod", "bhenchod",
    "bhosadike", "bhosdike", "bitch", "bkl", "bsdk", "choot", "chutiya",
    "chutiye", "cunt", "damn", "dick", "fool", "fuck", "fucking", "gaali",
    "gaand", "gando", "gandu", "haraami", "harami", "harassment", "hate", "hell",
    "idiot", "kameena", "kamina", "kaminey", "lauda", "laude", "lodu",
    "loser", "lund", "madarchod", "madharchod", "mc", "mkc", "moron",
    "motherfucker", "offensive", "piss", "pussy", "raand", "randi", "saala",
    "saale", "sala", "sale", "sexist", "shit", "slut", "stupid", "suar",
    "tatte", "whore",

    // Threats & Harassment
    "bomb", "bullying", "jaan se maar dunga", "khatam kar dunga", "kill",
    "maar dalunga", "murder", "terrorist", "tujhe dekh lunga", "violence",
    "weapon",

    // Spam / Phishing / Scams
    "betting", "buy now", "casino", "cheat", "click here", "earn money",
    "fraud", "free me paise", "free money", "free recharge", "gambling",
    "ghar baithe kamao", "hack", "hacker", "hacking", "jaldi click karo",
    "lottery", "lottery jeeto", "malware", "paisa kamao", "paytm cash",
    "phishing", "piracy", "ransomware", "scam", "virus",

    // NSFW / Adult / Inappropriate
    "explicit", "hot video", "mallu bhabhi", "nude", "nude bhejo", "porn",
    "pornography", "sex chat", "sexual",

    // Corporate Governance & Confidentiality
    "classified", "confidential", "internal only", "nda", "proprietary",
    "restricted", "salary"
];

// Load persisted custom restricted words from localStorage
try {
    const saved = JSON.parse(localStorage.getItem('knome_custom_restricted_words') || '[]');
    if (Array.isArray(saved)) {
        saved.forEach(w => {
            const lower = (w || '').trim().toLowerCase();
            if (lower && !RESTRICTED_WORDS.includes(lower)) {
                RESTRICTED_WORDS.push(lower);
            }
        });
    }
} catch {}

let syncPromise = null;
let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 60000; // 1 minute cooldown cache

/**
 * Synchronize all live restricted keywords directly from SQL Server database table RestrictedKeywords.
 */
export const syncRestrictedWordsFromBackend = async () => {
    if (syncPromise) {
        return syncPromise;
    }
    if (Date.now() - lastSyncTime < SYNC_COOLDOWN_MS) {
        return RESTRICTED_WORDS;
    }

    syncPromise = (async () => {
        try {
            const res = await apiClient.get('/interactions/restricted-keywords');
            const items = res?.data || (Array.isArray(res) ? res : []);
            if (Array.isArray(items) && items.length > 0) {
                const added = [];
                items.forEach(item => {
                    const kw = (typeof item === 'string' ? item : item?.keyword || '').trim().toLowerCase();
                    if (kw && !RESTRICTED_WORDS.includes(kw)) {
                        RESTRICTED_WORDS.push(kw);
                        added.push(kw);
                    }
                });
                if (added.length > 0) {
                    try {
                        const saved = JSON.parse(localStorage.getItem('knome_custom_restricted_words') || '[]');
                        const merged = Array.from(new Set([...saved, ...added]));
                        localStorage.setItem('knome_custom_restricted_words', JSON.stringify(merged));
                    } catch {}
                }
            }
            lastSyncTime = Date.now();
            return RESTRICTED_WORDS;
        } catch (err) {
            console.warn("Could not sync restricted keywords from backend:", err?.message || err);
            return RESTRICTED_WORDS;
        } finally {
            syncPromise = null;
        }
    })();

    return syncPromise;
};

// Immediate background fetch from SQL Server
syncRestrictedWordsFromBackend();

export const addRestrictedWord = (keyword) => {
    if (!keyword) return;
    const lower = keyword.trim().toLowerCase();
    if (!RESTRICTED_WORDS.includes(lower)) {
        RESTRICTED_WORDS.push(lower);
    }
    try {
        const saved = JSON.parse(localStorage.getItem('knome_custom_restricted_words') || '[]');
        if (Array.isArray(saved) && !saved.includes(lower)) {
            saved.push(lower);
            localStorage.setItem('knome_custom_restricted_words', JSON.stringify(saved));
        }
    } catch {}
};

export const checkRestrictedContent = (text) => {
    if (!text) return null;

    // Strip HTML tags for clean text scanning if HTML content is passed
    const cleanText = typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ') : String(text);

    for (const kw of RESTRICTED_WORDS) {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match whole word or exact multi-word phrase using word boundaries
        const regex = new RegExp(`\\b${escapedKw}\\b`, 'i');
        if (regex.test(cleanText)) {
            return kw;
        }
    }

    return null;
};

export const getRestrictedWarningMessage = (keyword) => {
    return `Security Alert: Your content contains the restricted term ("${keyword}"). Content containing abusive words, spam, threats, or sensitive data cannot be posted.`;
};

export const containsRestrictedWord = (text) => {
    return Boolean(checkRestrictedContent(text));
};
