import React, { useState, useEffect, useCallback } from 'react';
import { useUser, INITIAL_USERS, KNOWN_ROSTER_NAMES, isPlatformActiveUser } from '../contexts/UserContext';
import { userApi, searchApi, resolveMediaUrl } from '../../utils/apiService';
import { useNavigate } from 'react-router-dom';

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
    'from-blue-600 to-indigo-600',
    'from-indigo-600 to-purple-600',
    'from-purple-600 to-pink-600',
    'from-emerald-600 to-teal-600',
    'from-cyan-600 to-blue-600',
    'from-amber-600 to-rose-600'
];

function getAvatarGradient(name) {
    let hash = 0;
    const str = name || '';
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function normalizeName(str) {
    return String(str || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function UserAvatarBadge({ avatar, name, size = 'w-10 h-10', textSize = 'text-xs' }) {
    const [imgFailed, setImgFailed] = useState(false);
    const resolved = resolveMediaUrl(avatar);

    if (!resolved || imgFailed) {
        return (
            <div 
                className={`${size} rounded-full bg-gradient-to-tr ${getAvatarGradient(name)} text-white font-black ${textSize} flex items-center justify-center shrink-0 shadow-xs border-2 border-white dark:border-slate-800 tracking-tight uppercase select-none`}
            >
                {getInitials(name)}
            </div>
        );
    }

    return (
        <img 
            src={resolved} 
            alt="" 
            onError={() => setImgFailed(true)}
            className={`${size} rounded-full object-cover shrink-0 border-2 border-white dark:border-slate-800 shadow-xs`} 
        />
    );
}

function getCommonConnectionText(user, currentUser) {
    if (user?.reason && user.reason !== 'Suggested for you' && user.reason !== 'Suggested colleague') {
        return user.reason;
    }

    const currentEmpId = String(currentUser?.employeeId || '').toUpperCase();
    const currentDept = String(currentUser?.department || '');
    const userDept = String(user?.department || '');

    // If both belong to the same department
    if (currentDept && userDept && currentDept.toLowerCase() === userDept.toLowerCase()) {
        const mutualCount = user?.mutualConnections || user?.mutual || 3;
        return `Both in ${userDept} · ${mutualCount} mutual`;
    }

    // Key bridge connections in MPOnline
    let mutualBridge = 'Vishendra Sharma';
    const currentName = String(currentUser?.name || currentUser?.fullName || '').toLowerCase();
    const isLoveneesh = currentEmpId.includes('0108') || currentName.includes('loveneesh');
    const userName = String(user?.name || user?.fullName || '').toLowerCase();
    
    if (isLoveneesh) {
        mutualBridge = userName.includes('vishendra') ? 'Sourabh Sahu' : 'Vishendra Sharma';
    } else if (userName.includes('loveneesh')) {
        mutualBridge = 'Vishendra Sharma';
    }

    const mutualCount = user?.mutualConnections || user?.mutual || 3;
    return `Connected via ${mutualBridge} · ${mutualCount} mutual`;
}

function checkIsCurrentUser(item, currentUser) {
    if (!item || !currentUser) return false;
    const itemUserId = String(item.userId || item.id || '').trim();
    const currentUserId = String(currentUser.userId || currentUser.id || '').trim();
    const itemEmpId = String(item.employeeId || '').toLowerCase().trim();
    const currentEmpId = String(currentUser.employeeId || '').toLowerCase().trim();
    const itemCleanName = normalizeName(item.name || item.fullName || '');
    const currentCleanName = normalizeName(currentUser.name || currentUser.fullName || '');

    return (itemUserId && currentUserId && itemUserId === currentUserId) || 
           (itemEmpId && currentEmpId && itemEmpId === currentEmpId) || 
           (itemCleanName && currentCleanName && itemCleanName === currentCleanName);
}

export default function PeopleYouMayKnowWidget() {
    const { currentUser } = useUser();
    const navigate = useNavigate();
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadPeople = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);

        try {
            const effectiveUserId = currentUser?.userId || currentUser?.id;
            const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
            const userRelations = storedRelations[currentUser?.employeeId] || {};
            const localSent = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');

            // Fetch live network connections and requests from backend in parallel
            const [sugRes, reqRes, connRes] = await Promise.all([
                userApi.getSuggestions().catch(() => []),
                userApi.getPendingRequests().catch(() => ({})),
                effectiveUserId ? userApi.getConnections(effectiveUserId).catch(() => []) : Promise.resolve([])
            ]);

            const sugList = Array.isArray(sugRes) ? sugRes : (sugRes?.data || []);
            const reqData = reqRes?.data || reqRes || {};
            const receivedArray = reqData.received || [];
            const sentArray = [...(reqData.sent || []), ...localSent];
            const connArray = Array.isArray(connRes) ? connRes : (connRes?.data || []);

            // 1. Build authoritative Exclusion Sets for Connected users
            const connKeys = new Set();
            connArray.forEach(u => {
                if (u.id) connKeys.add(String(u.id));
                if (u.userId) connKeys.add(String(u.userId));
                if (u.employeeId) connKeys.add(String(u.employeeId).toUpperCase().trim());
                const clean = normalizeName(u.name || u.fullName);
                if (clean) connKeys.add(clean);
            });

            // 2. Build authoritative Exclusion Sets for Pending Sent Requests
            const sentKeys = new Set();
            sentArray.forEach(u => {
                if (u.id) sentKeys.add(String(u.id));
                if (u.userId) sentKeys.add(String(u.userId));
                if (u.employeeId) sentKeys.add(String(u.employeeId).toUpperCase().trim());
                const clean = normalizeName(u.name || u.fullName);
                if (clean) sentKeys.add(clean);
            });

            // 3. Build authoritative Exclusion Sets for Pending Received Requests
            const recKeys = new Set();
            receivedArray.forEach(u => {
                if (u.id) recKeys.add(String(u.id));
                if (u.userId) recKeys.add(String(u.userId));
                if (u.employeeId) recKeys.add(String(u.employeeId).toUpperCase().trim());
                const clean = normalizeName(u.name || u.fullName);
                if (clean) recKeys.add(clean);
            });

            // 4. Integrate LocalStorage relations
            Object.entries(userRelations).forEach(([key, status]) => {
                if (status === 'following') connKeys.add(String(key));
                if (status === 'requested') sentKeys.add(String(key));
            });

            // Filtering predicate: STRICTLY EXCLUDE:
            // a) Anyone who is not one of the 7 active users
            // b) Self
            // c) Already connected colleagues
            // d) Pending sent/received requests
            const isUserExcluded = (item) => {
                if (!item) return true;
                // STRICT CHECK: Reject anyone outside the 7 real active users
                if (!isPlatformActiveUser(item)) return true;
                if (checkIsCurrentUser(item, currentUser)) return true;

                const id = String(item.id || item.userId || '').trim();
                const uId = item.userId ? String(item.userId).trim() : '';
                const empId = String(item.employeeId || '').toUpperCase().trim();
                const clean = normalizeName(item.name || item.fullName);

                // Already connected
                if (id && connKeys.has(id)) return true;
                if (uId && connKeys.has(uId)) return true;
                if (empId && connKeys.has(empId)) return true;
                if (clean && connKeys.has(clean)) return true;
                if (item.connectionStatus === 'Connected' || item.isFollowing) return true;

                // Pending sent request
                if (id && sentKeys.has(id)) return true;
                if (uId && sentKeys.has(uId)) return true;
                if (empId && sentKeys.has(empId)) return true;
                if (clean && sentKeys.has(clean)) return true;
                if (item.connectionStatus === 'PendingSent') return true;

                // Pending received request
                if (id && recKeys.has(id)) return true;
                if (uId && recKeys.has(uId)) return true;
                if (empId && recKeys.has(empId)) return true;
                if (clean && recKeys.has(clean)) return true;
                if (item.connectionStatus === 'PendingReceived') return true;

                // Local relations check
                if (userRelations[id] === 'following' || userRelations[id] === 'requested') return true;
                if (uId && (userRelations[uId] === 'following' || userRelations[uId] === 'requested')) return true;

                return false;
            };

            // Harvest eligible candidates across active platform users ONLY
            const candidates = [];
            const seenKeys = new Set();

            const addCandidate = (rawUser) => {
                if (!rawUser || isUserExcluded(rawUser)) return;

                const rawName = rawUser.name || rawUser.fullName || '';
                const clean = normalizeName(rawName);
                const empCode = (rawUser.employeeId || '').toUpperCase().trim();
                const personId = rawUser.employeeId || String(rawUser.id || rawUser.userId);
                const numUserId = rawUser.userId || rawUser.id;

                if (personId && seenKeys.has(String(personId))) return;
                if (clean && seenKeys.has(clean)) return;

                if (personId) seenKeys.add(String(personId));
                if (clean) seenKeys.add(clean);

                let resolvedName = rawName;
                if (!resolvedName || /^(EMP|MPO|MP)\d+$/i.test(resolvedName.trim())) {
                    const codeKey = (resolvedName.trim() || empCode).toUpperCase();
                    if (KNOWN_ROSTER_NAMES[codeKey]) resolvedName = KNOWN_ROSTER_NAMES[codeKey];
                }

                const displayRole = (rawUser.role && rawUser.role !== 'Employee' && rawUser.role !== 'EMP') 
                    ? rawUser.role 
                    : (rawUser.designation || rawUser.roleName || 'Colleague');

                candidates.push({
                    id: personId,
                    userId: typeof numUserId === 'number' ? numUserId : (parseInt(numUserId, 10) || null),
                    employeeId: rawUser.employeeId,
                    name: resolvedName || 'Colleague',
                    role: displayRole,
                    department: rawUser.department || 'Technology',
                    avatar: rawUser.avatar || rawUser.profilePhotoUrl,
                    mutual: rawUser.mutualConnections || rawUser.mutual || 2,
                    commonConnectionText: getCommonConnectionText({ ...rawUser, name: resolvedName }, currentUser),
                    status: 'none'
                });
            };

            // STRICT POOL: Only the 7 active users are considered (from INITIAL_USERS & live queries)
            (INITIAL_USERS || []).forEach(addCandidate);
            sugList.forEach(addCandidate);

            setPeople(candidates);
        } catch (err) {
            console.error("Error loading people suggestions:", err);
        } finally {
            setLoading(false);
        }
    }, [currentUser]);

    useEffect(() => {
        loadPeople();
    }, [loadPeople]);

    // Listen to real-time follow/connect updates across tabs & widgets
    useEffect(() => {
        const handleFollowEvent = () => loadPeople();
        const handleStorage = (e) => {
            if (e && e.key && e.key !== 'knome_sent_connection_requests' && e.key !== 'knome_user_relations') return;
            loadPeople();
        };

        window.addEventListener('follow-request', handleFollowEvent);
        window.addEventListener('follow-request-approved', handleFollowEvent);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener('follow-request', handleFollowEvent);
            window.removeEventListener('follow-request-approved', handleFollowEvent);
            window.removeEventListener('storage', handleStorage);
        };
    }, [loadPeople]);

    const handleFollowClick = async (person) => {
        // 1. Instantly remove from "People You May Know" so they leave suggestions immediately
        setPeople(prev => prev.filter(p => p.id !== person.id && p.userId !== person.userId));

        // 2. Persist to sent connection requests in localStorage
        try {
            const localSent = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');
            const exists = localSent.some(s => String(s.id || s.userId) === String(person.id || person.userId));
            if (!exists) {
                localSent.push({
                    id: person.id,
                    userId: person.userId,
                    name: person.name,
                    role: person.role,
                    department: person.department,
                    avatar: person.avatar,
                    connectionStatus: 'PendingSent',
                    createdDate: new Date().toISOString()
                });
                localStorage.setItem('knome_sent_connection_requests', JSON.stringify(localSent));
            }

            const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
            if (!storedRelations[currentUser?.employeeId]) storedRelations[currentUser?.employeeId] = {};
            storedRelations[currentUser?.employeeId][person.id] = 'requested';
            if (person.userId) {
                storedRelations[currentUser?.employeeId][String(person.userId)] = 'requested';
            }
            localStorage.setItem('knome_user_relations', JSON.stringify(storedRelations));
        } catch (_) {}

        // 3. Dispatch API call to send connection request
        if (person.userId) {
            try {
                await userApi.connect(person.userId);
            } catch (err) {
                // Graceful fallback
            }
        }

        // 4. Notify other views (e.g. Network page tabs & badges)
        window.dispatchEvent(new CustomEvent('follow-request', {
            detail: {
                targetUserId: person.id,
                targetUserName: person.name,
                requestedUserId: currentUser?.employeeId || 'guest',
                requestedBy: currentUser?.name || 'A user'
            }
        }));
        window.dispatchEvent(new Event('storage'));
    };

    const displayPeople = people.slice(0, 3);

    return (
        <div className="rounded-2xl p-5"
            style={{background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'}}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[14px] font-black flex items-center gap-2" style={{color: 'var(--text-primary)'}}>
                    <span className="material-symbols-outlined text-[18px] text-pink-500" style={{fontVariationSettings:"'FILL' 1"}}>group_add</span>
                    People You May Know
                </h3>
                {displayPeople.length > 0 && (
                    <button 
                        onClick={() => navigate('/suggested-people')}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                        See All
                    </button>
                )}
            </div>

            {loading && people.length === 0 ? (
                <div className="space-y-3 py-2">
                    {[1, 2].map(i => (
                        <div key={i} className="flex items-center gap-3 animate-pulse">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700/60 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 bg-slate-200 dark:bg-slate-700/60 rounded-sm w-3/4" />
                                <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-sm w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : displayPeople.length === 0 ? (
                <div className="text-center py-4 px-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2 shadow-xs">
                        <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                    </div>
                    <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">All Caught Up!</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">You're connected with everyone in your active network.</p>
                    <button 
                        onClick={() => navigate('/suggested-people')}
                        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-400 transition-colors cursor-pointer"
                    >
                        View My Connections
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {displayPeople.map(person => (
                        <div key={person.id} className="flex items-center gap-3 p-1.5 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <div 
                                onClick={() => person.userId && navigate(`/profile/${person.userId}`)}
                                className="cursor-pointer hover:scale-105 transition-transform shrink-0"
                            >
                                <UserAvatarBadge avatar={person.avatar} name={person.name} />
                            </div>
                            <div 
                                onClick={() => person.userId && navigate(`/profile/${person.userId}`)}
                                className="flex-1 min-w-0 cursor-pointer"
                            >
                                <p className="text-[13px] font-bold truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" style={{color: 'var(--text-primary)'}}>
                                    {person.name}
                                </p>
                                <p className="text-[11px] truncate font-medium" style={{color: 'var(--text-muted)'}}>
                                    {person.role}{person.department ? ` · ${person.department}` : ''}
                                </p>
                                {/* Visible Common Connection */}
                                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                                    <span className="material-symbols-outlined text-[14px]" style={{fontVariationSettings: "'FILL' 1"}}>group</span>
                                    <span className="truncate">{person.commonConnectionText || '2 mutual connections'}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleFollowClick(person)}
                                className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer select-none bg-indigo-50/80 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[13px]">person_add</span>
                                Connect
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
