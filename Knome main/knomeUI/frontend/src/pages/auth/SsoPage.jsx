import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../../components/contexts/UserContext';
import { profileApi } from '../../utils/apiService';
import SuspendedAlertModal from '../../components/modals/SuspendedAlertModal';

/**
 * SSO Handler — /sso?token=<mpo_access_token>
 *
 * Flow:
 *  1. MPO Employee Hub portal opens: http://localhost:5173/sso?token=<token>
 *  2. This page picks up the token, saves it as 'knome_jwt' & 'accessToken'
 *  3. Calls backend /api/auth/me (or profileApi.getMe) to get user details & roles
 *  4. Syncs user into UserContext and redirects to /
 *  5. If user is suspended, pops up suspend alert with OK button and logs out.
 *  6. If token is invalid or missing, redirects to MPO login.
 */
export default function SsoPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { currentUser, isAuthLoading } = useUser();
    const [statusMessage, setStatusMessage] = useState('Validating SSO token with MPO Employee Hub...');
    const [error, setError] = useState(null);
    const [suspendedUser, setSuspendedUser] = useState(null);

    useEffect(() => {
        const hashString = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
        const hashParams = new URLSearchParams(hashString);

        const token = searchParams.get('token') ||
                      searchParams.get('access_token') ||
                      searchParams.get('sso_token') ||
                      searchParams.get('id_token') ||
                      hashParams.get('token') ||
                      hashParams.get('access_token');

        if (!token) {
            const mpoLoginUrl = 'https://counselling-1.mponline.demo.gov.in:3001/login';
            window.location.href = mpoLoginUrl;
            return;
        }

        const doSso = async () => {
            try {
                try {
                    sessionStorage.removeItem('knome_logging_out');
                } catch {}
                setStatusMessage('Authenticating session...');
                
                // Store MPO access token
                localStorage.setItem('knome_jwt', token);
                localStorage.setItem('accessToken', token);

                // Decode token claims for local identification
                let email = searchParams.get('email') || null;
                let sub = searchParams.get('sub') || null;
                let empId = searchParams.get('employeeId') || searchParams.get('empId') || searchParams.get('employee_id') || null;
                let fullName = searchParams.get('name') || null;

                try {
                    const parts = token.split('.');
                    if (parts.length >= 2) {
                        const base64Url = parts[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
                        const payload = JSON.parse(jsonPayload);
                        
                        email = email || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
                                payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
                                payload.email ||
                                payload.preferred_username ||
                                payload.upn;

                        sub = sub || payload.sub;

                        empId = empId || payload.employeeId ||
                                payload.employee_id ||
                                payload.empId ||
                                payload.unique_name;

                        fullName = fullName || payload.name ||
                                   payload.fullName ||
                                   payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
                                   payload.given_name;
                    }
                } catch { /* ignore jwt decode errors */ }

                const resolvedIdentity = empId || email || sub;
                if (resolvedIdentity) {
                    localStorage.setItem('knome_employeeId', resolvedIdentity);
                }

                let isSuspendedLocal = false;
                try {
                    const suspendedMap = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                    if (
                        (resolvedIdentity && suspendedMap[resolvedIdentity.toUpperCase()]) ||
                        (resolvedIdentity && suspendedMap[resolvedIdentity.toLowerCase()]) ||
                        (email && suspendedMap[email.toUpperCase()])
                    ) {
                        isSuspendedLocal = true;
                    }
                } catch {}

                if (isSuspendedLocal) {
                    setSuspendedUser({
                        fullName: fullName || resolvedIdentity || 'Employee',
                        employeeId: resolvedIdentity || '',
                        email: email || '',
                    });
                    return;
                }

                // Verify with backend
                let profile = null;
                try {
                    profile = await profileApi.getMe();
                } catch {
                    try {
                        const res = await authApi.getMe();
                        profile = res?.data || res;
                    } catch {
                        // Backend may be initializing; continue if token identity is established
                    }
                }

                if (profile) {
                    let isSuspended = isSuspendedLocal || profile.isSuspended === true || profile.isPermanentlySuspended === true || profile.isActive === false || (profile.suspendedUntil && new Date(profile.suspendedUntil) > new Date());
                    try {
                        const suspendedMap = JSON.parse(localStorage.getItem('knome_suspended_accounts') || '{}');
                        const pUid = String(profile.userId || profile.id || '');
                        const pEmp = String(profile.employeeId || '').toUpperCase();
                        if ((pUid && suspendedMap[pUid]) || (pEmp && suspendedMap[pEmp])) {
                            isSuspended = true;
                        }
                    } catch {}

                    if (isSuspended) {
                        setSuspendedUser({
                            fullName: profile.fullName || profile.name || fullName || 'Employee',
                            employeeId: profile.employeeId || resolvedIdentity || '',
                            email: profile.email || email,
                        });
                        return;
                    }
                }

                setStatusMessage('Welcome to Knome! Redirecting to dashboard...');
                setTimeout(() => {
                    window.location.href = '/';
                }, 300);
            } catch (err) {
                console.error('[SSO] Verification failed:', err);
                const errMsg = (err?.message || '').toLowerCase();
                const isSuspended = err?.status === 403 || errMsg.includes('suspended') || errMsg.includes('inactive') || errMsg.includes('forbidden');
                if (isSuspended) {
                    setSuspendedUser({
                        fullName: fullName || email || 'Employee',
                        employeeId: empId || email || '',
                        email: email,
                    });
                    return;
                }
                setError(err?.message || 'SSO authentication failed.');
                localStorage.removeItem('knome_jwt');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('knome_employeeId');
                
                setTimeout(() => {
                    window.location.href = 'https://counselling-1.mponline.demo.gov.in:3001/applications';
                }, 2000);
            }
        };

        doSso();
    }, [searchParams, navigate]);

    const handleSuspendOk = () => {
        localStorage.removeItem('knome_jwt');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('knome_refresh');
        localStorage.removeItem('knome_employeeId');
        window.location.href = 'https://counselling-1.mponline.demo.gov.in:3001/applications';
    };

    if (suspendedUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
                <SuspendedAlertModal
                    isOpen={true}
                    user={suspendedUser}
                    onOk={handleSuspendOk}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-xl shadow-blue-500/20 mb-6 animate-pulse">
                <span className="material-symbols-outlined text-white text-3xl">hub</span>
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-2">
                Knome Knowledge Platform
            </h2>
            
            <p className="text-sm text-slate-400 mb-6 text-center max-w-sm">
                {statusMessage}
            </p>

            {error ? (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold max-w-md text-center">
                    {error}
                </div>
            ) : (
                <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            )}
        </div>
    );
}
