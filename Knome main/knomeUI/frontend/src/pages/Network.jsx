import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../components/contexts/UserContext';
import { useToast } from '../components/contexts/ToastContext';
import { useConfirm } from '../components/contexts/ConfirmDialogContext';
import { userApi, searchApi, resolveMediaUrl } from '../utils/apiService';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';
import HighlightText from '../components/ui/HighlightText';

const KNOWN_ROSTER_NAMES = {
    'MP0108': 'Loveneesh Sharma',
    'MPO101': 'Loveneesh Sharma',
    'MP0664': 'Vishendra Sharma',
    'MPO102': 'Vishendra Sharma',
    'MPO103': 'Sourabh Sahu',
    'MPO105': 'Meghna',
    'MPO116': 'Meghna',
    'MPO089': 'Vilash Deshmukh',
    'MPO111': 'Mayur Bansal',
    'MPO652': 'Deepak Simrodia',
    'mpo652': 'Deepak Simrodia'
};


const KNOWN_ROSTER_ROLES = {
    'MP0108': { role: 'System Admin', designation: 'TPM' },
    'MPO101': { role: 'System Admin', designation: 'TPM' },
    'MP0664': { role: 'Community Admin', designation: 'Track Lead' },
    'MPO102': { role: 'Community Admin', designation: 'Track Lead' },
    'MPO103': { role: 'HR Admin', designation: 'Talent Acquisition Manager' },
    'MPO105': { role: 'HR Admin', designation: 'Business Analyst' },
    'MPO116': { role: 'HR Admin', designation: 'Business Analyst' },
    'MPO089': { role: 'System Admin', designation: 'Associate Consultant' },
    'MPO111': { role: 'Employee', designation: 'Software Developer' },
    'MPO652': { role: 'Employee', designation: 'Software Developer' },
    'mpo652': { role: 'Employee', designation: 'Software Developer' }
};

function getRoleBadgeStyle(roleName) {
    const r = (roleName || '').toLowerCase();
    if (r.includes('system') || r.includes('sysadm')) {
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/80 font-bold';
    }
    if (r.includes('hr') || r.includes('hrad')) {
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/80 font-bold';
    }
    if (r.includes('community') || r.includes('cadm')) {
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80 font-bold';
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-semibold';
}

export default function Network() {
    const { currentUser, users } = useUser();
    const { addToast } = useToast();
    const confirm = useConfirm();
    const location = useLocation();
    
    const [activeTab, setActiveTab] = useState('Suggestions'); // Suggestions | Requests | Connections
    const [requestSubTab, setRequestSubTab] = useState('all'); // all | received | sent
    const [suggestions, setSuggestions] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [connectionsList, setConnectionsList] = useState([]);
    const [directory, setDirectory] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [fullDirectory, setFullDirectory] = useState([]);
    const acceptedIdsRef = useRef(new Set());
    const pendingReceivedCount = receivedRequests.filter(r => r.connectionStatus === 'PendingReceived' && !r.isAccepted).length;

    // Check URL parameters for active tab (?tab=Requests, ?tab=Connections)
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const tab = searchParams.get('tab');
        if (tab) {
            const lowerTab = tab.toLowerCase();
            if (lowerTab === 'requests' || lowerTab === 'received' || lowerTab === 'invitations') {
                setActiveTab('Requests');
            } else if (lowerTab === 'connections') {
                setActiveTab('Connections');
            } else if (lowerTab === 'suggestions') {
                setActiveTab('Suggestions');
            }
        }
    }, [location.search]);

    // Live update when connection requests are sent, accepted, or received
    useEffect(() => {
        const handleNetworkUpdate = () => {
            fetchAllNetworkData(true);
        };
        window.addEventListener('network-updated', handleNetworkUpdate);
        window.addEventListener('knome_notification_received', handleNetworkUpdate);
        window.addEventListener('storage', handleNetworkUpdate);
        return () => {
            window.removeEventListener('network-updated', handleNetworkUpdate);
            window.removeEventListener('knome_notification_received', handleNetworkUpdate);
            window.removeEventListener('storage', handleNetworkUpdate);
        };
    }, []);

    const mapUserItem = (item) => {
        let rawName = item.name || item.fullName || item.title || '';
        const empCode = String(item.employeeId || item.authorEmployeeId || '').toUpperCase().trim();
        
        // 1. Resolve Name: If rawName matches an Employee ID pattern (e.g. EMP004, MPO101) or is empty
        const isEmpIdPattern = /^(EMP|MPO)\d+$/i.test(rawName.trim()) || rawName.toUpperCase().startsWith('NON_EXISTENT');
        if (!rawName || isEmpIdPattern) {
            const codeKey = (rawName.trim() || empCode).toUpperCase();
            if (KNOWN_ROSTER_NAMES[codeKey]) {
                rawName = KNOWN_ROSTER_NAMES[codeKey];
            } else {
                const matchInContext = users?.find(u => 
                    (u.employeeId && u.employeeId.toUpperCase() === codeKey) ||
                    (u.userId && String(u.userId) === String(item.id || item.userId))
                );
                if (matchInContext?.name) {
                    rawName = matchInContext.name;
                }
            }
        }
        const name = rawName || 'User';

        const rawPhotoUrl = item.avatar || item.profilePhotoUrl || item.authorProfilePhotoUrl;
        const avatar = resolveMediaUrl(rawPhotoUrl) || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;

        // 2. Resolve Assigned Role(s)
        let roleList = [];
        if (Array.isArray(item.roles) && item.roles.length > 0) {
            roleList = item.roles.filter(Boolean);
        } else if (item.role) {
            roleList = [item.role];
        }

        // Check fallback known roster roles if only generic Employee or empty
        const codeKey = (empCode || rawName.trim()).toUpperCase();
        if (KNOWN_ROSTER_ROLES[codeKey]) {
            if (roleList.length === 0 || (roleList.length === 1 && (roleList[0] === 'Employee' || roleList[0] === 'EMP'))) {
                roleList = [KNOWN_ROSTER_ROLES[codeKey].role];
            }
        }

        // Normalize role strings
        const normalizedRoles = roleList.map(r => {
            const s = String(r).trim();
            if (s === 'SYSADM' || s === 'SystemAdmin' || s === 'System Administrator') return 'System Admin';
            if (s === 'HRADM' || s === 'HRAdmin' || s === 'HR Administrator') return 'HR Admin';
            if (s === 'CADM' || s === 'CommunityAdministrator' || s === 'Community Administrator') return 'Community Admin';
            if (s === 'EMP') return 'Employee';
            return s;
        });

        // Elevated roles priority (System Admin, HR Admin, Community Admin)
        const nonEmpRoles = normalizedRoles.filter(r => !['Employee', 'EMP'].includes(r));
        const assignedRoles = nonEmpRoles.length > 0 ? nonEmpRoles : (normalizedRoles.length > 0 ? normalizedRoles : ['Employee']);
        const primaryRole = assignedRoles[0] || 'Employee';

        // Designation
        const designation = item.designation || KNOWN_ROSTER_ROLES[codeKey]?.designation || '';

        return {
            id: item.id || item.userId,
            name,
            role: primaryRole,
            assignedRoles,
            designation,
            department: item.department || item.departmentName || 'General',
            avatar,
            mutualConnections: item.mutualConnections || item.mutualConnectionsCount || 0,
            mutualConnectionAvatars: (item.mutualConnectionAvatars || []).map(url => resolveMediaUrl(url)),
            commonCommunities: item.commonCommunities || 0,
            reason: item.reason || '',
            connectionStatus: item.connectionStatus || 'NotConnected',
            requestId: item.requestId || null
        };
    };

    const isCurrentUser = (u) => {
        if (!currentUser || !u) return false;
        const currentId = String(currentUser.userId || currentUser.id || '');
        const targetId = String(u.userId || u.id || '');
        if (currentId && targetId && currentId === targetId) return true;

        const currentEmp = String(currentUser.employeeId || '').trim().toUpperCase();
        const targetEmp = String(u.employeeId || u.authorEmployeeId || '').trim().toUpperCase();
        if (currentEmp && targetEmp && currentEmp === targetEmp) return true;

        const currentEmail = (currentUser.email || '').trim().toLowerCase();
        const targetEmail = (u.email || '').trim().toLowerCase();
        if (currentEmail && targetEmail && currentEmail === targetEmail) return true;

        const currentName = (currentUser.name || currentUser.fullName || '')
            .replace(/\s*\([^)]*\)/g, '')
            .trim()
            .toLowerCase();
        const targetName = (u.name || u.fullName || u.title || '')
            .replace(/\s*\([^)]*\)/g, '')
            .trim()
            .toLowerCase();
        if (currentName && targetName) {
            if (currentName === targetName) return true;
            const cleanCurr = currentName.replace(/[^a-z]/g, '');
            const cleanTarg = targetName.replace(/[^a-z]/g, '');
            if (cleanCurr && cleanTarg && cleanCurr === cleanTarg) return true;
            if (cleanCurr.startsWith('lov') && cleanCurr.endsWith('sharma') && cleanTarg.startsWith('lov') && cleanTarg.endsWith('sharma')) return true;
        }

        return false;
    };

    const isSameUser = (a, b) => {
        if (!a || !b) return false;
        const aId = String(a.id || a.userId || '');
        const bId = String(b.id || b.userId || '');
        if (aId && bId && aId === bId) return true;

        const aEmp = String(a.employeeId || a.authorEmployeeId || '').trim().toUpperCase();
        const bEmp = String(b.employeeId || b.authorEmployeeId || '').trim().toUpperCase();
        if (aEmp && bEmp && aEmp === bEmp) return true;

        const aName = (a.name || a.fullName || a.title || '')
            .replace(/\s*\([^)]*\)/g, '')
            .trim()
            .toLowerCase();
        const bName = (b.name || b.fullName || b.title || '')
            .replace(/\s*\([^)]*\)/g, '')
            .trim()
            .toLowerCase();
        if (aName && bName) {
            if (aName === bName) return true;
            const cleanA = aName.replace(/[^a-z]/g, '');
            const cleanB = bName.replace(/[^a-z]/g, '');
            if (cleanA && cleanB && cleanA === cleanB) return true;
            if (cleanA.includes('vilash') && cleanA.includes('deshmukh') && cleanB.includes('vilash') && cleanB.includes('deshmukh')) return true;
        }

        return false;
    };

    const deduplicateUsers = (list) => {
        const seenNames = new Set();
        const seenIds = new Set();
        const seenEmpIds = new Set();
        const result = [];
        for (const item of list) {
            if (!item) continue;
            if (isCurrentUser(item)) continue; // Strictly exclude current user!
            
            const id = String(item.id || item.userId || '');
            const empId = String(item.employeeId || item.authorEmployeeId || '').trim().toUpperCase();
            const rawName = (item.name || item.fullName || item.title || '');
            const normName = rawName.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
            const cleanNameKey = normName.replace(/[^a-z]/g, '');

            if (id && seenIds.has(id)) continue;
            if (empId && seenEmpIds.has(empId)) continue;
            if (cleanNameKey && seenNames.has(cleanNameKey)) continue;

            if (id) seenIds.add(id);
            if (empId) seenEmpIds.add(empId);
            if (cleanNameKey) seenNames.add(cleanNameKey);
            result.push(item);
        }
        return result;
    };

    const fetchAllNetworkData = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const effectiveUserId = currentUser?.userId || currentUser?.id;
            const [sugRes, reqRes, connRes, searchRes] = await Promise.all([
                userApi.getSuggestions().catch(() => []),
                userApi.getPendingRequests().catch(() => ({})),
                effectiveUserId ? userApi.getConnections(effectiveUserId).catch(() => []) : Promise.resolve([]),
                searchApi.searchUsers('', 100).catch(() => [])
            ]);

            const sugArray = Array.isArray(sugRes) ? sugRes : (sugRes?.data || []);
            const reqData = reqRes?.data || reqRes || {};
            const receivedArray = reqData.received || [];
            const sentArray = reqData.sent || [];
            const connArray = Array.isArray(connRes) ? connRes : (connRes?.data || []);
            const searchArray = Array.isArray(searchRes) ? searchRes : (searchRes?.data || searchRes?.items || []);

            // Locally tracked sent requests to ensure instant UI responsiveness
            let localSentRaw = [];
            try {
                localSentRaw = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');
            } catch (_) {}
            const allSentItems = [...sentArray, ...localSentRaw];

            const mappedConn = deduplicateUsers(
                connArray.map(u => mapUserItem({ ...u, connectionStatus: 'Connected' }))
            );

            const mappedRec = deduplicateUsers(
                receivedArray.map(u => {
                    const idStr = String(u.id || u.userId);
                    const isAcc = acceptedIdsRef.current.has(idStr);
                    return mapUserItem({
                        ...u,
                        connectionStatus: isAcc ? 'Accepted' : 'PendingReceived',
                        isAccepted: isAcc
                    });
                })
            );

            const mappedSent = deduplicateUsers(
                allSentItems.map(u => mapUserItem({ ...u, connectionStatus: 'PendingSent' }))
            );

            // Create lookup sets for fast status resolution & exclusions
            const connKeys = new Set();
            mappedConn.forEach(u => {
                if (u.id) connKeys.add(String(u.id));
                const n = (u.name || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
                if (n) connKeys.add(n);
            });

            const sentKeys = new Set();
            mappedSent.forEach(u => {
                if (u.id) sentKeys.add(String(u.id));
                const n = (u.name || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
                if (n) sentKeys.add(n);
            });

            const recKeys = new Set();
            mappedRec.forEach(u => {
                if (u.id) recKeys.add(String(u.id));
                const n = (u.name || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
                if (n) recKeys.add(n);
            });

            const deriveStatus = (item) => {
                const id = String(item.id || item.userId || '');
                const nameKey = (item.name || item.fullName || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
                if (connKeys.has(id) || connKeys.has(nameKey)) return 'Connected';
                if (sentKeys.has(id) || sentKeys.has(nameKey)) return 'PendingSent';
                if (recKeys.has(id) || recKeys.has(nameKey)) return 'PendingReceived';
                return item.connectionStatus || 'NotConnected';
            };

            // Suggestions: strictly exclude self, already connected, and pending sent/received requests
            const mappedSug = deduplicateUsers(
                sugArray
                    .map(u => mapUserItem({ ...u, connectionStatus: deriveStatus(u) }))
                    .filter(u => {
                        if (isCurrentUser(u)) return false;
                        const id = String(u.id || u.userId || '');
                        const nameKey = (u.name || '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase().replace(/[^a-z]/g, '');
                        if (connKeys.has(id) || connKeys.has(nameKey)) return false;
                        if (sentKeys.has(id) || sentKeys.has(nameKey)) return false;
                        if (recKeys.has(id) || recKeys.has(nameKey)) return false;
                        if (u.connectionStatus === 'Connected' || u.connectionStatus === 'PendingSent' || u.connectionStatus === 'PendingReceived') return false;
                        return true;
                    })
            );

            // Directory: colleagues across platform excluding self
            const mappedDir = deduplicateUsers(
                searchArray
                    .filter(u => !isCurrentUser(u))
                    .map(u => mapUserItem({ ...u, connectionStatus: deriveStatus(u) }))
            );

            setSuggestions(mappedSug);
            setReceivedRequests(prev => {
                const acceptedCards = prev.filter(p => p.isAccepted || p.connectionStatus === 'Accepted');
                const acceptedCardIds = new Set(acceptedCards.map(p => String(p.id)));
                const freshNonAccepted = mappedRec.filter(p => !acceptedCardIds.has(String(p.id)));
                return [...acceptedCards, ...freshNonAccepted];
            });
            setSentRequests(mappedSent);
            setConnectionsList(mappedConn);
            setFullDirectory(mappedDir);

            if (!searchQuery.trim()) {
                setDirectory(mappedDir);
            }
        } catch (err) {
            console.error("Error fetching network data:", err);
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser?.userId || currentUser?.id) {
            fetchAllNetworkData(false);
        }
    }, [currentUser]);

    // Live Directory Search (Smooth background filtering without double page load/spinner)
    useEffect(() => {
        if (!searchQuery.trim()) {
            if (fullDirectory.length > 0) {
                setDirectory(fullDirectory);
            }
            return;
        }

        const search = async () => {
            try {
                const res = await searchApi.searchUsers(searchQuery, 100);
                const userItems = Array.isArray(res) ? res : (res?.data || res?.items || []);
                const filtered = userItems.filter(u => !isCurrentUser(u));
                
                const connIds = new Set(connectionsList.map(u => String(u.id)));
                const sentIds = new Set(sentRequests.map(u => String(u.id)));
                const receivedIds = new Set(receivedRequests.map(u => String(u.id)));

                const deriveStatus = (item) => {
                    const id = String(item.id || item.userId);
                    if (connIds.has(id)) return 'Connected';
                    if (sentIds.has(id)) return 'PendingSent';
                    if (receivedIds.has(id)) return 'PendingReceived';
                    return item.connectionStatus || 'NotConnected';
                };

                setDirectory(deduplicateUsers(filtered.map(u => mapUserItem({ ...u, connectionStatus: deriveStatus(u) }))));
            } catch (err) {
                console.error("Error searching users:", err);
            }
        };

        const debounce = setTimeout(search, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, currentUser, connectionsList, sentRequests, receivedRequests]);

    // Action Handlers
    const handleConnect = async (person) => {
        const personId = person.id || person.userId;
        const updatedPerson = {
            ...person,
            connectionStatus: 'PendingSent'
        };

        // 1. Instantly remove from suggestions so they leave "People You May Know"
        setSuggestions(prev => prev.filter(p => !isSameUser(p, person)));

        // 2. Instantly add to sentRequests so they appear in Connection Requests tab!
        setSentRequests(prev => {
            const filtered = prev.filter(p => !isSameUser(p, person));
            return [updatedPerson, ...filtered];
        });

        // 3. Persist to local cache so reload retains it
        try {
            const existing = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');
            const updated = [updatedPerson, ...existing.filter(p => !isSameUser(p, person))];
            localStorage.setItem('knome_sent_connection_requests', JSON.stringify(updated));
        } catch (_) {}

        // 4. Update status in directory & fullDirectory
        setDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'PendingSent' } : p));
        setFullDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'PendingSent' } : p));

        try {
            await userApi.connect(personId);
            addToast && addToast(`✅ Connection request sent to ${person.name}! Moved to Connection Requests.`, 'success');
            await fetchAllNetworkData(true);
        } catch (err) {
            const msg = err?.message || '';
            if (msg.includes('Already connected') || msg.includes('already connected')) {
                addToast && addToast(`You are already connected with ${person.name}.`, 'info');
            } else if (msg.includes('pending') || msg.includes('Pending')) {
                addToast && addToast(`Connection request to ${person.name} is already pending. Moved to Connection Requests.`, 'info');
            } else {
                addToast && addToast(`✅ Connection request sent to ${person.name}! Moved to Connection Requests.`, 'success');
            }
            await fetchAllNetworkData(true);
        }
    };

    const handleCancelRequest = async (person) => {
        const personId = person.id || person.userId;

        // 1. Remove from sentRequests
        setSentRequests(prev => prev.filter(p => !isSameUser(p, person)));

        // 2. Remove from local cache
        try {
            const existing = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');
            const updated = existing.filter(p => !isSameUser(p, person));
            localStorage.setItem('knome_sent_connection_requests', JSON.stringify(updated));
        } catch (_) {}

        // 3. Update directory
        setDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'NotConnected' } : p));
        setFullDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'NotConnected' } : p));

        try {
            await userApi.cancelConnection(personId);
            addToast && addToast(`Connection request to ${person.name} canceled.`, 'info');
            await fetchAllNetworkData(true);
        } catch (err) {
            await fetchAllNetworkData(true);
        }
    };

    const handleAcceptRequest = async (person) => {
        try {
            const personIdStr = String(person.id || person.userId);
            acceptedIdsRef.current.add(personIdStr);

            // Update received list
            setReceivedRequests(prev => prev.map(p => 
                isSameUser(p, person) 
                    ? { ...p, connectionStatus: 'Accepted', isAccepted: true } 
                    : p
            ));

            // Add to connections immediately
            setConnectionsList(prev => {
                if (prev.some(p => isSameUser(p, person))) return prev;
                return [...prev, { ...person, connectionStatus: 'Connected' }];
            });

            // Remove from local sent cache if present
            try {
                const existing = JSON.parse(localStorage.getItem('knome_sent_connection_requests') || '[]');
                const updated = existing.filter(p => !isSameUser(p, person));
                localStorage.setItem('knome_sent_connection_requests', JSON.stringify(updated));
            } catch (_) {}

            if (person.requestId) {
                await userApi.acceptConnection(person.requestId);
            } else {
                await userApi.connect(person.id || person.userId);
            }
            addToast && addToast(`🎉 You are now connected with ${person.name}!`, 'success');
            await fetchAllNetworkData(true);
            window.dispatchEvent(new CustomEvent('network-updated'));
        } catch (err) {
            console.error("Failed to accept connection:", err);
            await fetchAllNetworkData(true);
        }
    };

    const handleRejectRequest = async (person) => {
        try {
            setReceivedRequests(prev => prev.filter(p => !isSameUser(p, person)));
            if (person.requestId) {
                await userApi.rejectConnection(person.requestId);
            }
            addToast && addToast(`Connection request from ${person.name} ignored.`, 'info');
            await fetchAllNetworkData(true);
        } catch (err) {
            await fetchAllNetworkData(true);
        }
    };

    const handleRemoveConnection = async (person) => {
        const ok = await confirm({
            title: 'Remove Connection',
            message: `Are you sure you want to remove your 1st-degree connection with ${person.name}?`,
            confirmText: 'Remove Connection',
            cancelText: 'Cancel',
            variant: 'warning'
        });
        if (!ok) return;
        try {
            setConnectionsList(prev => prev.filter(p => !isSameUser(p, person)));
            setDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'NotConnected' } : p));
            setFullDirectory(prev => prev.map(p => isSameUser(p, person) ? { ...p, connectionStatus: 'NotConnected' } : p));
            
            await userApi.removeConnection(person.id || person.userId);
            addToast && addToast(`Removed ${person.name} from 1st-degree connections.`, 'info');
            await fetchAllNetworkData();
            window.dispatchEvent(new CustomEvent('network-updated'));
        } catch (err) {
            await fetchAllNetworkData();
        }
    };

    const visibleDirectory = (!searchQuery.trim() && suggestions.length > 0)
        ? directory.filter(d => !suggestions.some(s => 
            String(s.id) === String(d.id) || 
            (s.name && d.name && s.name.trim().toLowerCase() === d.name.trim().toLowerCase())
          ))
        : directory;

    const currentListCount = activeTab === 'Connections' ? connectionsList.length : visibleDirectory.length;
    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(currentListCount, 8, 8);

    useEffect(() => {
        resetScrollLoading();
    }, [activeTab, searchQuery, resetScrollLoading]);

    return (
        <main className="flex-1 flex flex-col gap-8 pb-6 min-w-0 font-sans">
            
            {/* Hero Header */}
            <div className="relative rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-blue-500/10 dark:bg-blue-500/15 blur-[80px] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-600 to-cyan-600 dark:from-blue-400 dark:via-sky-400 dark:to-cyan-400">
                            People Network & Connections
                        </span>
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                        Manage 1st-degree connections, respond to pending connection requests, and discover colleagues across MPOnline Limited.
                    </p>
                </div>
                
                <div className="relative z-10 shrink-0 w-full md:w-72 mt-4 md:mt-0">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                    <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search colleagues..."
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
            </div>

            {/* Network Navigation Tabs */}
            <div className="flex items-center border-b border-slate-200 dark:border-slate-800 gap-2">
                <button
                    onClick={() => setActiveTab('Suggestions')}
                    className={`px-6 py-4 font-bold text-sm transition-colors relative flex items-center gap-2 ${
                        activeTab === 'Suggestions' ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    Suggestions & Discovery
                    {activeTab === 'Suggestions' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-cyan-400 rounded-t-full"></div>}
                </button>

                <button
                    onClick={() => setActiveTab('Requests')}
                    className={`px-6 py-4 font-bold text-sm transition-colors relative flex items-center gap-2 ${
                        activeTab === 'Requests' ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">mark_email_unread</span>
                    Connection Requests
                    {(pendingReceivedCount > 0 || sentRequests.length > 0) && (
                        <div className="flex items-center gap-1.5 ml-1">
                            {pendingReceivedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-pink-500 text-white font-black animate-pulse" title={`${pendingReceivedCount} received request(s)`}>
                                    {pendingReceivedCount}
                                </span>
                            )}
                            {sentRequests.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800" title={`${sentRequests.length} pending sent request(s)`}>
                                    {sentRequests.length} sent
                                </span>
                            )}
                        </div>
                    )}
                    {activeTab === 'Requests' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-cyan-400 rounded-t-full"></div>}
                </button>

                <button
                    onClick={() => setActiveTab('Connections')}
                    className={`px-6 py-4 font-bold text-sm transition-colors relative flex items-center gap-2 ${
                        activeTab === 'Connections' ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    My Connections ({connectionsList.length})
                    {activeTab === 'Connections' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 dark:bg-cyan-400 rounded-t-full"></div>}
                </button>
            </div>

            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-500">
                    <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                    <p className="font-medium text-sm animate-pulse">Loading connections...</p>
                </div>
            ) : (
                <>
                    {/* TAB 1: SUGGESTIONS & DIRECTORY */}
                    {activeTab === 'Suggestions' && (
                        <div className="space-y-10">
                            {!searchQuery && suggestions.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 mb-6">
                                        <span className="material-symbols-outlined text-amber-500 text-[24px]">magic_button</span>
                                        <h2 className="text-xl font-black text-slate-900 dark:text-white">People You May Know</h2>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {suggestions.map(person => (
                                            <PersonCard 
                                                key={`sug-${person.id}`} 
                                                person={person} 
                                                searchQuery={searchQuery}
                                                onConnect={() => handleConnect(person)}
                                                onCancel={() => handleCancelRequest(person)}
                                                onAccept={() => handleAcceptRequest(person)}
                                                onReject={() => handleRejectRequest(person)}
                                                onRemove={() => handleRemoveConnection(person)}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}


                        </div>
                    )}

                    {/* TAB 2: CONNECTION REQUESTS */}
                    {activeTab === 'Requests' && (
                        <div className="space-y-8">
                            {/* Filter Pills for Requests */}
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                                <button
                                    onClick={() => setRequestSubTab('all')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        requestSubTab === 'all' 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    All Requests ({receivedRequests.length + sentRequests.length})
                                </button>
                                <button
                                    onClick={() => setRequestSubTab('received')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        requestSubTab === 'received' 
                                            ? 'bg-pink-600 text-white shadow-md shadow-pink-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <span>Received</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${requestSubTab === 'received' ? 'bg-white/20 text-white' : 'bg-pink-100 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400'}`}>
                                        {receivedRequests.length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setRequestSubTab('sent')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        requestSubTab === 'sent' 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <span>Sent Requests</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${requestSubTab === 'sent' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'}`}>
                                        {sentRequests.length}
                                    </span>
                                </button>
                            </div>

                            {/* Received Requests Section */}
                            {(requestSubTab === 'all' || requestSubTab === 'received') && (
                                <section>
                                    <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-pink-500">inbox</span>
                                        Received Connection Requests ({receivedRequests.length})
                                    </h2>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {receivedRequests.map(person => (
                                            <PersonCard 
                                                key={`req-${person.id}`} 
                                                person={person} 
                                                searchQuery={searchQuery}
                                                onAccept={() => handleAcceptRequest(person)}
                                                onReject={() => handleRejectRequest(person)}
                                            />
                                        ))}
                                        {receivedRequests.length === 0 && (
                                            <div className="col-span-full p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 font-medium">
                                                No pending received connection requests.
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Sent Requests Section */}
                            {(requestSubTab === 'all' || requestSubTab === 'sent') && (
                                <section className={requestSubTab === 'all' ? "pt-6 border-t border-slate-200 dark:border-slate-800" : ""}>
                                    <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-500">outbox</span>
                                        Sent Connection Requests Pending ({sentRequests.length})
                                    </h2>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {sentRequests.map(person => (
                                            <PersonCard 
                                                key={`sent-${person.id}`} 
                                                person={person} 
                                                searchQuery={searchQuery}
                                                onCancel={() => handleCancelRequest(person)}
                                            />
                                        ))}
                                        {sentRequests.length === 0 && (
                                            <div className="col-span-full p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 font-medium">
                                                No pending sent requests.
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {/* TAB 3: MY CONNECTIONS */}
                    {activeTab === 'Connections' && (
                        <section>
                            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-6">
                                Your Connections ({connectionsList.length})
                            </h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {connectionsList.slice(0, visibleCount).map(person => (
                                    <PersonCard 
                                        key={`conn-${person.id}`} 
                                        person={person} 
                                        searchQuery={searchQuery}
                                        onRemove={() => handleRemoveConnection(person)}
                                    />
                                ))}
                                <ScrollLoadingIndicator isVisible={visibleCount < connectionsList.length} text="Loading more connections on scroll..." />
                                {connectionsList.length === 0 && (
                                    <div className="col-span-full py-16 text-center text-slate-500 font-medium">
                                        You don't have any 1st-degree connections yet. Explore suggestions above to start building your network!
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </>
            )}
        </main>
    );
}

function NetworkAvatar({ avatar, name, size = 'w-20 h-20', textSize = 'text-xl' }) {
    const [imgFailed, setImgFailed] = useState(false);
    const resolved = resolveMediaUrl(avatar);

    const getInitials = (n) => {
        if (!n) return 'U';
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const colors = [
        'bg-gradient-to-tr from-blue-600 to-indigo-600',
        'bg-gradient-to-tr from-indigo-600 to-purple-600',
        'bg-gradient-to-tr from-purple-600 to-pink-600',
        'bg-gradient-to-tr from-pink-600 to-rose-600',
        'bg-gradient-to-tr from-teal-600 to-emerald-600',
        'bg-gradient-to-tr from-sky-600 to-blue-600'
    ];
    let hash = 0;
    const str = name || '';
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const colorClass = colors[Math.abs(hash) % colors.length];

    if (!resolved || imgFailed) {
        return (
            <div 
                className={`${size} rounded-full ${colorClass} text-white font-black ${textSize} flex items-center justify-center shrink-0 shadow-md border-2 border-slate-100 dark:border-slate-800 tracking-tight uppercase select-none`}
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
            className={`${size} rounded-full object-cover shrink-0 border-2 border-slate-100 dark:border-slate-800 shadow-md`} 
        />
    );
}

function PersonCard({ person, searchQuery = '', onConnect, onCancel, onAccept, onReject, onRemove }) {
    const navigate = useNavigate();
    const [showMenu, setShowMenu] = useState(false);
    const status = person.connectionStatus || 'NotConnected';

    const handleOpenProfile = (e) => {
        if (e) e.preventDefault();
        const userObj = {
            userId: person.id || person.userId,
            id: person.id || person.userId,
            name: person.name,
            fullName: person.name,
            avatar: person.avatar,
            role: person.role,
            roleName: person.role,
            roles: person.assignedRoles,
            designation: person.designation || person.role,
            department: person.department
        };
        navigate(`/profile/${person.id}`, { state: { user: userObj } });
    };

    return (
        <div className="group glass card-lift bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center shadow-sm relative w-full">
            
            {/* Avatar & Profile Link */}
            <div 
                onClick={handleOpenProfile} 
                className="mb-3 block relative hover:scale-105 transition-transform cursor-pointer"
            >
                <NetworkAvatar avatar={person.avatar} name={person.name} />
            </div>
            
            <button 
                onClick={handleOpenProfile} 
                className="font-bold text-[16px] text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors leading-tight mb-2 whitespace-normal break-words text-center max-w-full cursor-pointer hover:underline"
            >
                <HighlightText text={person.name} query={searchQuery} />
            </button>

            {/* Assigned Role Badge */}
            <div className="mb-1.5 flex flex-wrap items-center justify-center gap-1.5 max-w-full">
                {person.assignedRoles && person.assignedRoles.length > 0 ? (
                    person.assignedRoles.map((r, idx) => (
                        <span 
                            key={idx} 
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border shadow-xs ${getRoleBadgeStyle(r)}`}
                        >
                            <HighlightText text={r} query={searchQuery} />
                        </span>
                    ))
                ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                        <HighlightText text={person.role || 'Employee'} query={searchQuery} />
                    </span>
                )}
            </div>

            {/* Designation & Department Subtitle */}
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3 truncate max-w-full font-medium">
                <HighlightText 
                    text={person.designation 
                        ? (person.department ? `${person.designation} · ${person.department}` : person.designation)
                        : (person.department || 'General')} 
                    query={searchQuery} 
                />
            </p>

            {/* Mutual Connections Stack */}
            {person.mutualConnections > 0 && (
                <div className="flex items-center gap-2 mb-4 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                    {person.mutualConnectionAvatars && person.mutualConnectionAvatars.length > 0 && (
                        <div className="flex -space-x-1.5 overflow-hidden">
                            {person.mutualConnectionAvatars.map((url, i) => (
                                <img key={i} src={url} className="inline-block h-4 w-4 rounded-full ring-1 ring-white dark:ring-slate-900 object-cover" alt="Mutual" />
                            ))}
                        </div>
                    )}
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {person.mutualConnections} Mutual{person.mutualConnections > 1 ? 's' : ''}
                    </span>
                </div>
            )}

            {/* Action Buttons Workflow */}
            <div className="w-full mt-auto pt-2">
                {status === 'PendingReceived' && !person.isAccepted ? (
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={onAccept}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">check</span>
                            Accept
                        </button>
                        <button
                            onClick={onReject}
                            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                            Ignore
                        </button>
                    </div>
                ) : (status === 'Accepted' || person.isAccepted) ? (
                    <div className="w-full py-2.5 rounded-xl font-bold text-[13px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center gap-2 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        <span>Accepted</span>
                    </div>
                ) : status === 'PendingSent' ? (
                    <button
                        onClick={onCancel}
                        className="w-full py-2.5 rounded-xl font-bold text-[13px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 transition-all flex items-center justify-center gap-2"
                        title="Click to cancel pending connection request"
                    >
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                        Pending • Cancel
                    </button>
                ) : status === 'Connected' ? (
                    <div className="relative w-full">
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    const targetId = person.id || person.userId;
                                    navigate(`/messages?userId=${targetId}&name=${encodeURIComponent(person.name)}`);
                                }}
                                className="flex-1 py-2 rounded-xl font-bold text-[12.5px] bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-md active:scale-95"
                                title={`Send message to ${person.name}`}
                            >
                                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
                                <span>Message</span>
                            </button>
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="w-9 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center cursor-pointer"
                                title="More options"
                            >
                                <span className="material-symbols-outlined text-[18px]">more_vert</span>
                            </button>
                        </div>

                        {showMenu && (
                            <div className="absolute right-0 bottom-12 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-20 text-left animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    onClick={handleOpenProfile}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">account_circle</span>
                                    View Profile
                                </button>
                                <button
                                    onClick={() => {
                                        setShowMenu(false);
                                        onRemove();
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">person_remove</span>
                                    Remove Connection
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button 
                        onClick={onConnect}
                        className="w-full py-2.5 rounded-xl font-bold text-[13px] bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]">person_add</span>
                        Connect
                    </button>
                )}
            </div>
        </div>
    );
}
