import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../components/contexts/UserContext';
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

export default function Login() {
    const { currentUser, isAuthenticated } = useUser();
    const navigate = useNavigate();

    const { hubLoginUrl, knomeBase } = getSsoUrls();
    const returnUrl = encodeURIComponent(`${knomeBase}/sso`);
    const fullSsoLoginTarget = `${hubLoginUrl}?client_id=Knome-2026&returnUrl=${returnUrl}&redirect_uri=${encodeURIComponent(`${knomeBase}/sso`)}`;

    useEffect(() => {
        try {
            sessionStorage.removeItem('knome_logging_out');
        } catch {}

        if (isAuthenticated && currentUser) {
            navigate('/', { replace: true });
            return;
        }

        // Check if there are SSO tokens or credentials present in the URL query or hash
        const hashString = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
        const hashParams = new URLSearchParams(hashString);
        const searchParams = new URLSearchParams(window.location.search);

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

        // Redirect to central MPO Hub login with registered client_id & /sso returnUrl
        try {
            window.location.replace(fullSsoLoginTarget);
        } catch {
            window.location.href = fullSsoLoginTarget;
        }
    }, [isAuthenticated, currentUser, navigate, fullSsoLoginTarget]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col items-center gap-5 relative z-10 max-w-sm text-center">
                <img src={knomeLogoDark} alt="KNOME" className="h-14 w-auto object-contain drop-shadow-lg animate-pulse" />
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-semibold text-slate-300 tracking-wide">
                        Connecting to MPO Employee Hub...
                    </span>
                </div>
                <p className="text-xs text-slate-400">
                    Authenticating with <a href="https://counselling-1.mponline.demo.gov.in:3001" target="_blank" rel="noreferrer" className="text-sky-400 underline hover:text-sky-300">counselling-1.mponline.demo.gov.in:3001</a>
                </p>
                <a
                    href={fullSsoLoginTarget}
                    className="mt-2 text-xs text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer"
                >
                    Click here if not redirected automatically →
                </a>
            </div>
        </div>
    );
}
