import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser, KNOWN_ROSTER_NAMES } from '../components/contexts/UserContext';
import knomeLogoDark from '../assets/knome_logo_dark.png';

const getSsoUrls = () => {
    const host = window.location.hostname || 'localhost';
    const isIis = window.location.port === '8080';
    const ehPort = isIis ? '8081' : '5001';
    const knomePort = window.location.port || (isIis ? '8080' : '5173');
    const knomeBase = `${window.location.protocol}//${host}${knomePort ? `:${knomePort}` : ''}`;

    // Target the central MPO Employee Hub online portal: https://counselling-1.mponline.demo.gov.in:3001
    const useLocalEh = Boolean(window.__USE_LOCAL_EH__ || (typeof localStorage !== 'undefined' && localStorage.getItem('knome_use_local_eh') === 'true'));
    const ehBase = useLocalEh ? `http://${host}:${ehPort}` : 'https://counselling-1.mponline.demo.gov.in:3001';
    const hubLoginUrl = `${ehBase}/login`;

    return { ehBase, hubLoginUrl, knomeBase };
};

const QUICK_ROSTER = [
    { empId: 'MP0108', name: 'Loveneesh Sharma', role: 'System Admin', badge: 'SYSADM', color: 'from-amber-500 to-orange-600', icon: 'shield_person' },
    { empId: 'Emp101', name: 'Meghna Tiwari', role: 'HR Admin', badge: 'HRADM', color: 'from-emerald-500 to-teal-600', icon: 'badge' },
    { empId: 'MPO652', name: 'Deepak Simrodia', role: 'Moderator', badge: 'MOD', color: 'from-purple-500 to-indigo-600', icon: 'gavel' },
    { empId: 'MP0664', name: 'Vishendra Sharma', role: 'Community Admin', badge: 'CADM', color: 'from-blue-500 to-cyan-600', icon: 'groups' },
    { empId: 'EMP100', name: 'Mayur Bansal', role: 'Employee', badge: 'EMP', color: 'from-slate-600 to-slate-700', icon: 'person' },
];

export default function Login() {
    const { currentUser, isAuthenticated, login } = useUser();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const { hubLoginUrl, knomeBase } = getSsoUrls();
    const returnUrl = encodeURIComponent(`${knomeBase}/sso`);
    const fullSsoLoginTarget = `${hubLoginUrl}?client_id=Knome-2026&returnUrl=${returnUrl}&redirect_uri=${encodeURIComponent(`${knomeBase}/sso`)}`;

    const [employeeIdInput, setEmployeeIdInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loginError, setLoginError] = useState(null);

    useEffect(() => {
        if (searchParams.get('logout') === 'true') {
            const authKeys = ['knome_jwt', 'accessToken', 'knome_employeeId', 'knome_refresh', 'userProfile', 'knome_token'];
            authKeys.forEach(k => {
                try { localStorage.removeItem(k); } catch {}
            });
            try { sessionStorage.removeItem('knome_logging_out'); } catch {}
            return;
        }

        try {
            sessionStorage.removeItem('knome_logging_out');
        } catch {}

        if (isAuthenticated && currentUser) {
            const returnTarget = sessionStorage.getItem('knome_return_url') || sessionStorage.getItem('knome_last_route') || '/';
            sessionStorage.removeItem('knome_return_url');
            navigate(returnTarget, { replace: true });
            return;
        }

        // Check if there are SSO tokens or credentials present in the URL query or hash
        const hashString = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
        const hashParams = new URLSearchParams(hashString);

        const token = searchParams.get('token') ||
                      searchParams.get('access_token') ||
                      searchParams.get('sso_token') ||
                      searchParams.get('id_token') ||
                      searchParams.get('code') ||
                      hashParams.get('token') ||
                      hashParams.get('access_token');

        const employeeId = searchParams.get('employeeId') || searchParams.get('empId') || searchParams.get('email');

        if (token || employeeId) {
            // Forward directly to /sso to process the token cleanly
            window.location.replace(`/sso${window.location.search}${window.location.hash}`);
            return;
        }

        const urlError = searchParams.get('error');
        if (urlError) {
            setLoginError(decodeURIComponent(urlError));
        }
    }, [isAuthenticated, currentUser, navigate, searchParams]);

    const handleDirectLogin = async (targetEmpId) => {
        const empId = (targetEmpId || employeeIdInput || '').trim();
        if (!empId) {
            setLoginError('Please enter a valid Employee ID or email address.');
            return;
        }
        setIsSubmitting(true);
        setLoginError(null);
        try {
            await login(empId);
            const returnTarget = sessionStorage.getItem('knome_return_url') || sessionStorage.getItem('knome_last_route') || '/';
            sessionStorage.removeItem('knome_return_url');
            navigate(returnTarget, { replace: true });
        } catch (err) {
            setLoginError(err?.message || 'Login failed. Please check credentials.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-[32rem] h-[32rem] bg-blue-600/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[32rem] h-[32rem] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

            <div className="w-full max-w-xl relative z-10 flex flex-col items-center">
                {/* Header Branding */}
                <div className="flex flex-col items-center gap-3 text-center mb-8">
                    <img src={knomeLogoDark} alt="KNOME" className="h-16 w-auto object-contain drop-shadow-2xl" />
                    <p className="text-sm text-slate-300 font-medium tracking-wide">
                        MPOnline Enterprise Knowledge & Collaboration Platform
                    </p>
                </div>

                {/* Main Card */}
                <div className="w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-indigo-950/40 flex flex-col gap-6">
                    {/* Error Notification */}
                    {loginError && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3 text-rose-300 text-sm animate-in fade-in duration-200">
                            <span className="material-symbols-outlined text-rose-400 text-xl shrink-0 mt-0.5">error</span>
                            <span className="flex-1 leading-relaxed">{loginError}</span>
                            <button onClick={() => setLoginError(null)} className="text-rose-400 hover:text-white cursor-pointer">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    )}

                    {/* Primary SSO Action */}
                    <div className="flex flex-col gap-2">
                        <a
                            href={fullSsoLoginTarget}
                            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-base shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 transition-all flex items-center justify-center gap-3 group cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">hub</span>
                            <span>Sign in with MPO Employee Hub</span>
                            <span className="material-symbols-outlined text-lg opacity-70 group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </a>
                        <p className="text-[11px] text-slate-400 text-center">
                            Official Single Sign-On (SSO) via <span className="text-sky-400">counselling-1.mponline.demo.gov.in</span>
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center my-1">
                        <div className="border-t border-slate-800 w-full"></div>
                        <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider font-semibold text-slate-400 shrink-0">
                            Or Sign In Directly
                        </span>
                        <div className="border-t border-slate-800 w-full"></div>
                    </div>

                    {/* Employee ID Direct Input */}
                    <form onSubmit={(e) => { e.preventDefault(); handleDirectLogin(); }} className="flex flex-col gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Employee ID or Official Email
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">badge</span>
                                <input
                                    type="text"
                                    value={employeeIdInput}
                                    onChange={(e) => setEmployeeIdInput(e.target.value)}
                                    placeholder="e.g. MP0108, Emp101, or MPO652"
                                    className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                                    disabled={isSubmitting}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting || !employeeIdInput.trim()}
                                className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <span>Enter</span>
                                        <span className="material-symbols-outlined text-base">login</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    {/* 1-Click Role-Based Quick Access */}
                    <div className="flex flex-col gap-2.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Quick Role Access (Verified Enterprise Identities)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {QUICK_ROSTER.map((usr) => (
                                <button
                                    key={usr.empId}
                                    type="button"
                                    onClick={() => handleDirectLogin(usr.empId)}
                                    disabled={isSubmitting}
                                    className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all text-left flex items-center justify-between gap-3 group cursor-pointer disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${usr.color} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                                            <span className="material-symbols-outlined text-base">{usr.icon}</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                                                {usr.name}
                                            </span>
                                            <span className="text-[10px] text-slate-400 truncate">
                                                {usr.role} • {usr.empId}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white transition-colors shrink-0">
                                        {usr.badge}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="mt-6 text-center text-xs text-slate-500">
                    Knome Knowledge Sharing, Group & Technical Post Platform • MPOnline Limited
                </div>
            </div>
        </div>
    );
}
