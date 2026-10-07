import React, { useState, useEffect } from 'react';
import { useUser, INITIAL_USERS } from '../contexts/UserContext';
import { userApi, resolveMediaUrl } from '../../utils/apiService';
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
    let mutualBridge = 'Loveneesh Sharma';
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
    const itemName = String(item.name || item.fullName || '').toLowerCase().trim();
    const currentName = String(currentUser.name || currentUser.fullName || '').toLowerCase().trim();

    return (itemUserId && currentUserId && itemUserId === currentUserId) || 
           (itemEmpId && currentEmpId && itemEmpId === currentEmpId) || 
           (itemName && currentName && itemName === currentName);
}

function buildInitialRoster(currentUser) {
    const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
    const userRelations = storedRelations[currentUser?.employeeId] || {};

    return (INITIAL_USERS || [])
        .filter(u => u && u.isActive && !checkIsCurrentUser(u, currentUser))
        .slice(0, 5)
        .map(u => {
            const personId = u.employeeId || String(u.id);
            const numUserId = u.userId || u.id;
            const status = userRelations[personId] || userRelations[String(numUserId)] || 'none';
            return {
                id: personId,
                userId: numUserId,
                name: u.name || u.fullName,
                role: u.designation || u.roleName || 'Colleague',
                department: u.department || 'Technology',
                avatar: u.avatar,
                mutual: u.karmaPoints ? Math.min(5, Math.max(2, Math.floor(u.karmaPoints / 50))) : 3,
                commonConnectionText: getCommonConnectionText(u, currentUser),
                status
            };
        });
}

export default function PeopleYouMayKnowWidget() {
    const { currentUser } = useUser();
    const navigate = useNavigate();
    const [people, setPeople] = useState(() => buildInitialRoster(currentUser));

    const loadStatus = () => {
        const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
        const userRelations = storedRelations[currentUser?.employeeId] || {};
        
        setPeople(prev => prev.map(p => ({
            ...p,
            status: userRelations[p.id] || (p.userId && userRelations[String(p.userId)]) || p.status || 'none'
        })));
    };

    useEffect(() => {
        let isMounted = true;

        const loadPeople = async () => {
            const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
            const userRelations = storedRelations[currentUser?.employeeId] || {};

            let apiItems = [];
            try {
                const res = await userApi.getSuggestions();
                const list = Array.isArray(res) ? res : (res?.data || []);
                if (Array.isArray(list) && list.length > 0) {
                    apiItems = list;
                }
            } catch (e) {
                // Graceful fallback to initial roster
            }

            const mappedApiItems = apiItems
                .filter(u => !checkIsCurrentUser(u, currentUser))
                .map(u => {
                    const personId = u.employeeId || String(u.id || u.userId);
                    const numUserId = u.id || u.userId;
                    const status = userRelations[personId] || userRelations[String(numUserId)] || (u.connectionStatus === 'Connected' || u.isFollowing ? 'following' : u.connectionStatus === 'PendingSent' ? 'requested' : 'none');
                    let rawName = u.name || u.fullName || '';
                    const empCode = (u.employeeId || '').toUpperCase().trim();
                    if (!rawName || /^(EMP|MPO)\d+$/i.test(rawName.trim()) || rawName.toUpperCase().startsWith('NON_EXISTENT')) {
                        const codeKey = (rawName.trim() || empCode).toUpperCase();
                        const knownRoster = {
                            'MP0108': 'Loveneesh Sharma',
                            'MPO101': 'Loveneesh Sharma',
                            'MP0664': 'Vishendra Sharma',
                            'MPO102': 'Vishendra Sharma',
                            'EMP052': 'Sourabh Sahu',
                            'MPO103': 'Sourabh Sahu',
                            'MPO105': 'Meghna',
                            'MPO116': 'Meghna',
                            'MPO089': 'Vilash Deshmukh',
                            'MPO111': 'Mayur Bansal',
                            'MPO652': 'Deepak Simrodia',
                            'mpo652': 'Deepak Simrodia'
                        };
                        rawName = knownRoster[codeKey] || rawName || 'Colleague';
                    }
                    const name = rawName;
                    const displayRole = (u.role && u.role !== 'Employee' && u.role !== 'EMP') 
                        ? u.role 
                        : (u.designation || u.role || 'Colleague');

                    return {
                        id: personId,
                        userId: numUserId,
                        name,
                        role: displayRole,
                        department: u.department || 'Technology',
                        avatar: u.avatar || u.profilePhotoUrl,
                        mutual: u.mutualConnections || 3,
                        commonConnectionText: getCommonConnectionText({ ...u, name }, currentUser),
                        status
                    };
                });

            const fallbackItems = buildInitialRoster(currentUser);

            const combined = [...mappedApiItems];
            fallbackItems.forEach(fb => {
                if (!combined.some(c => String(c.userId) === String(fb.userId) || String(c.name || '').toLowerCase() === String(fb.name || '').toLowerCase())) {
                    combined.push(fb);
                }
            });

            if (isMounted) {
                setPeople(combined.length > 0 ? combined : fallbackItems);
            }
        };

        loadPeople();

        return () => { isMounted = false; };
    }, [currentUser]);

    useEffect(() => {
        loadStatus();
        
        const handleFollowApproved = (e) => {
            const { targetUserId, requestedUserId } = e.detail;
            if (requestedUserId === currentUser?.employeeId) {
                const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
                if (!storedRelations[currentUser?.employeeId]) storedRelations[currentUser?.employeeId] = {};
                storedRelations[currentUser?.employeeId][targetUserId] = 'following';
                localStorage.setItem('knome_user_relations', JSON.stringify(storedRelations));
                loadStatus();
            }
        };

        window.addEventListener('follow-request-approved', handleFollowApproved);
        window.addEventListener('storage', loadStatus);
        return () => {
            window.removeEventListener('follow-request-approved', handleFollowApproved);
            window.removeEventListener('storage', loadStatus);
        };
    }, [currentUser]);

    const handleFollowClick = async (person) => {
        if (person.status !== 'none') return;

        // Optimistic UI update
        const storedRelations = JSON.parse(localStorage.getItem('knome_user_relations') || '{}');
        if (!storedRelations[currentUser?.employeeId]) storedRelations[currentUser?.employeeId] = {};
        storedRelations[currentUser?.employeeId][person.id] = 'requested';
        if (person.userId) {
            storedRelations[currentUser?.employeeId][String(person.userId)] = 'requested';
        }
        localStorage.setItem('knome_user_relations', JSON.stringify(storedRelations));
        loadStatus();

        // Send connection request via userApi if numeric userId is available
        if (person.userId) {
            try {
                await userApi.connect(person.userId);
            } catch (err) {
                // silent
            }
        }

        // Dispatch follow request for notifications
        window.dispatchEvent(new CustomEvent('follow-request', {
            detail: {
                targetUserId: person.id,
                targetUserName: person.name,
                requestedUserId: currentUser?.employeeId || 'guest',
                requestedBy: currentUser?.name || 'A user'
            }
        }));
    };

    const visiblePeople = people
        .filter(p => !checkIsCurrentUser(p, currentUser))
        .slice(0, 3);

    const displayPeople = visiblePeople.length > 0 ? visiblePeople : buildInitialRoster(currentUser).slice(0, 3);

    return (
        <div className="rounded-2xl p-5"
            style={{background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'}}>
            <h3 className="text-[14px] font-black mb-4 flex items-center gap-2" style={{color: 'var(--text-primary)'}}>
                <span className="material-symbols-outlined text-[18px] text-pink-500" style={{fontVariationSettings:"'FILL' 1"}}>group_add</span>
                People You May Know
            </h3>
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
                                <span className="truncate">{person.commonConnectionText || '3 mutual connections'}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleFollowClick(person)}
                            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer select-none"
                            style={{
                                background: person.status !== 'none' ? 'transparent' : '#6366f115', 
                                color: person.status !== 'none' ? 'var(--text-muted)' : '#6366f1', 
                                border: person.status !== 'none' ? '1px solid var(--border-subtle)' : '1px solid #6366f130',
                            }}>
                            {person.status === 'following' ? (
                                <>
                                    <span className="material-symbols-outlined text-[13px]">check</span>
                                    Following
                                </>
                            ) : person.status === 'requested' ? (
                                <>
                                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                                    Requested
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[13px]">person_add</span>
                                    Connect
                                </>
                            )}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
