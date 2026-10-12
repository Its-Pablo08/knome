import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUser } from '../../components/contexts/UserContext';

/**
 * SSO Logout Handler — /sso-logout
 *
 * Flow:
 *  1. Clear local tokens and context
 *  2. Redirect to MPO Employee Hub central logout endpoint
 */
export default function SsoLogoutPage() {
    const [searchParams] = useSearchParams();
    const { logout } = useUser();
    const [status, setStatus] = useState('Logging out of Knome...');

    useEffect(() => {
        const doLogout = async () => {
            const CENTRAL_LOGOUT_URL = 'https://counselling-1.mponline.demo.gov.in:3001/login?logout=true';
            let returnUrl = searchParams.get('returnUrl') || CENTRAL_LOGOUT_URL;
            if (returnUrl === '/login' || returnUrl.includes('localhost:5173/login') || returnUrl.includes('/applications')) {
                returnUrl = CENTRAL_LOGOUT_URL;
            }

            try {
                if (logout) {
                    await logout(returnUrl);
                    return;
                }
            } catch {}

            // Fallback token cleanup if logout provider method is not mounted
            const authKeys = ['knome_jwt', 'accessToken', 'knome_employeeId', 'knome_refresh', 'userProfile', 'knome_token'];
            authKeys.forEach(k => {
                try { localStorage.removeItem(k); } catch {}
            });
            try { sessionStorage.removeItem('knome_logging_out'); } catch {}

            try {
                window.location.replace(returnUrl);
            } catch {
                window.location.href = returnUrl;
            }
        };

        doLogout();
    }, [logout, searchParams]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-xl shadow-blue-500/20 mb-6 animate-pulse">
                <span className="material-symbols-outlined text-white text-3xl">logout</span>
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-2">
                Secure Logout
            </h2>
            
            <p className="text-sm text-slate-400 mb-6 text-center max-w-sm">
                {status}
            </p>

            <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
    );
}
