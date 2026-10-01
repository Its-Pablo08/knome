import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useModal } from '../contexts/ModalContext';
import { useUser, getUserStatusConfig } from '../contexts/UserContext';
import { resolveMediaUrl } from '../../utils/apiService';

export default function Sidebar() {
    const { openPostModal } = useModal();
    const { currentUser } = useUser();
    const { pathname } = useLocation();
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Listen for mobile sidebar open/toggle events
    useEffect(() => {
        const toggleMobile = () => setIsMobileOpen(prev => !prev);
        const openMobile = () => setIsMobileOpen(true);
        const closeMobile = () => setIsMobileOpen(false);

        window.addEventListener('knome_toggle_mobile_sidebar', toggleMobile);
        window.addEventListener('knome_open_mobile_sidebar', openMobile);
        window.addEventListener('knome_close_mobile_sidebar', closeMobile);

        return () => {
            window.removeEventListener('knome_toggle_mobile_sidebar', toggleMobile);
            window.removeEventListener('knome_open_mobile_sidebar', openMobile);
            window.removeEventListener('knome_close_mobile_sidebar', closeMobile);
        };
    }, []);

    // Auto-close mobile drawer when route changes
    useEffect(() => {
        setIsMobileOpen(false);
    }, [pathname]);

    // Prevent body scroll when mobile drawer is open
    useEffect(() => {
        if (isMobileOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileOpen]);

    const isItemActive = (item) => {
        if (item.matchPaths && Array.isArray(item.matchPaths)) {
            return item.matchPaths.some(p => pathname === p || (p !== '/' && pathname.startsWith(p + '/')));
        }
        return item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(item.to + '/');
    };

    const navItems = [
        { to: '/',                 icon: 'home',         label: 'Home',          color: '#6366f1' },
        { to: '/community',        icon: 'group',        label: 'Communities',   color: '#0ea5e9', matchPaths: ['/community', '/communities'] },
        { to: '/suggested-people', icon: 'person_add',   label: 'People',        color: '#10b981', matchPaths: ['/suggested-people', '/network'] },
        { to: '/saved-content',    icon: 'bookmark',     label: 'Saved',         color: '#f59e0b' },
        { to: '/search',           icon: 'search',       label: 'Discover',      color: '#8b5cf6' },
    ];
    const isSysAdmin = ['SYSADM', 'SYSTEM ADMIN', 'SYSTEM ADMINISTRATOR'].includes(String(currentUser?.role || '').toUpperCase()) ||
                       ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
                       (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'SYSTEM ADMINISTRATOR', 'SYSTEMADMIN', 'SYSTEM ADMIN'].includes(String(r || '').toUpperCase())));

    const isConsoleAdmin = ['SYSADM', 'HRADM', 'CADM', 'ADMIN', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
                           ['SYSTEM ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMINISTRATOR', 'HR ADMIN', 'COMMUNITY ADMINISTRATOR', 'COMMUNITY ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
                           (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'HRADM', 'CADM', 'ADMIN', 'SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'COMMUNITY ADMINISTRATOR', 'SYSTEMADMIN', 'HRADMIN', 'COMMUNITYADMIN', 'SYSTEM ADMIN', 'HR ADMIN', 'COMMUNITY ADMIN'].includes(String(r || '').toUpperCase())));

    const isHrOrSysAdmin = ['SYSADM', 'HRADM', 'SYSTEM ADMIN', 'HR ADMIN', 'ADMIN'].includes(String(currentUser?.role || '').toUpperCase()) ||
                           ['SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'SYSTEM ADMIN', 'HR ADMIN', 'ADMIN'].includes(String(currentUser?.roleName || '').toUpperCase()) ||
                           (Array.isArray(currentUser?.roles) && currentUser.roles.some(r => ['SYSADM', 'HRADM', 'SYSTEM ADMINISTRATOR', 'HR ADMINISTRATOR', 'SYSTEMADMIN', 'HRADMIN', 'SYSTEM ADMIN', 'HR ADMIN', 'ADMIN'].includes(String(r || '').toUpperCase())));

    if (isConsoleAdmin) {
        navItems.push({ to: '/admin-console', icon: 'admin_panel_settings', label: 'Admin Console', color: '#f43f5e' });
    }
    if (isHrOrSysAdmin) {
        navItems.push({ to: '/hr-analytics', icon: 'bar_chart', label: 'HR Analytics', color: '#ef4444' });
    }

    const quickLinks = [
        { to: '/posts',    label: 'Posts',     icon: 'dynamic_feed', color: '#6366f1' },
        { to: '/articles', label: 'Articles',  icon: 'article',      color: '#0ea5e9', matchPaths: ['/articles', '/article-view'] },
        { to: '/videos',   label: 'Videos',    icon: 'videocam',     color: '#ef4444' },
        { to: '/podcasts', label: 'Podcasts',  icon: 'podcasts',     color: '#8b5cf6' },
        { to: '/jobs',     label: 'Openings',  icon: 'work',         color: '#10b981' },
    ];

    const userAvatar = resolveMediaUrl(currentUser?.profilePhotoUrl) || currentUser?.avatar || 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff';
    const userName = currentUser?.fullName || currentUser?.name || 'Employee';
    const userRole = currentUser?.roleName || currentUser?.role || 'Member';
    const userDept = currentUser?.department || currentUser?.departmentName || 'MPOnline';
    const statusConfig = getUserStatusConfig(currentUser);
    const [liveKarma, setLiveKarma] = useState(currentUser?.karmaPoints ?? currentUser?.karma ?? 0);
    const [livePosts, setLivePosts] = useState(currentUser?.postsCount ?? 0);
    const userFollowers = currentUser?.followersCount ?? 0;

    useEffect(() => {
        if (currentUser?.karmaPoints !== undefined || currentUser?.karma !== undefined) {
            setLiveKarma(currentUser.karmaPoints ?? currentUser.karma ?? 0);
        }
        if (currentUser?.postsCount !== undefined) {
            setLivePosts(currentUser.postsCount);
        }
    }, [currentUser?.karmaPoints, currentUser?.karma, currentUser?.postsCount]);

    useEffect(() => {
        const handleKarmaUpdated = (e) => {
            if (e.detail?.totalKarma !== undefined && typeof e.detail.totalKarma === 'number') {
                setLiveKarma(e.detail.totalKarma);
            } else if (e.detail?.points) {
                setLiveKarma(prev => prev + e.detail.points);
            }
        };

        const handlePostCreated = () => {
            setLivePosts(prev => prev + 1);
        };

        window.addEventListener('karma-updated', handleKarmaUpdated);
        window.addEventListener('post-created', handlePostCreated);
        return () => {
            window.removeEventListener('karma-updated', handleKarmaUpdated);
            window.removeEventListener('post-created', handlePostCreated);
        };
    }, []);

    const renderSidebarContent = (isMobile = false) => (
        <>
            {/* User Profile Card */}
            <Link to="/profile" className="block" onClick={() => isMobile && setIsMobileOpen(false)}>
                <div className="rounded-2xl p-4 relative overflow-hidden transition-all hover:scale-[1.01] cursor-pointer bg-theme-60-surface border border-theme-30 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                    {/* Top decorative gradient banner */}
                    <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-pink-500/15 border-b border-indigo-500/10"></div>
                    
                    {/* Orb decorations */}
                    <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-10 pointer-events-none"
                        style={{background: 'radial-gradient(circle, #6366f1, transparent 70%)'}}></div>
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full opacity-[0.08] pointer-events-none"
                        style={{background: 'radial-gradient(circle, #ec4899, transparent 70%)'}}></div>

                    <div className="relative z-10 flex items-center gap-3 mb-2 pt-1">
                        <div className="relative shrink-0 p-[2px] rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-md">
                            <img 
                                className="w-11 h-11 rounded-full object-cover border-2 border-theme-60-surface" 
                                alt="Avatar" 
                                src={userAvatar} 
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=6366f1&color=fff`;
                                }}
                            />
                            <div 
                                className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-theme-60-surface shadow-xs transition-colors ${statusConfig.dotClass}`}
                                title={`Status: ${statusConfig.label}`}
                            ></div>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 
                                className="font-black text-[15.5px] sm:text-[16px] leading-tight tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors break-words"
                                title={userName}
                            >
                                {userName}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-md border border-indigo-100/80 dark:border-indigo-800/40 leading-none truncate">
                                    {userRole}
                                </span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border leading-none transition-colors ${statusConfig.badgeClass}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`}></span>
                                    {statusConfig.label}
                                </span>
                            </div>
                            <p className="text-[10.5px] font-semibold mt-1 truncate text-slate-500 dark:text-slate-400 flex items-center gap-1" title={userDept}>
                                <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0"></span>
                                <span className="truncate">{userDept}</span>
                            </p>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className={`relative z-10 grid ${isSysAdmin ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 pt-2.5 mt-1 border-t border-theme-30`}>
                        {!isSysAdmin && (
                            <div className="text-center py-1.5 px-1 rounded-xl bg-theme-60 dark:bg-slate-800/60 border border-theme-30/60">
                                <p className="text-[12.5px] font-black text-slate-900 dark:text-white leading-tight">{liveKarma.toLocaleString()}</p>
                                <p className="text-[8.5px] uppercase tracking-wider font-extrabold text-theme-30-text mt-0.5">Points</p>
                            </div>
                        )}
                        <div className="text-center py-1.5 px-1 rounded-xl bg-theme-60 dark:bg-slate-800/60 border border-theme-30/60">
                            <p className="text-[12.5px] font-black text-slate-900 dark:text-white leading-tight">{livePosts}</p>
                            <p className="text-[8.5px] uppercase tracking-wider font-extrabold text-theme-30-text mt-0.5">Posts</p>
                        </div>
                        <div className="text-center py-1.5 px-1 rounded-xl bg-theme-60 dark:bg-slate-800/60 border border-theme-30/60">
                            <p className="text-[12.5px] font-black text-slate-900 dark:text-white leading-tight">{userFollowers}</p>
                            <p className="text-[8.5px] uppercase tracking-wider font-extrabold text-theme-30-text mt-0.5">Followers</p>
                        </div>
                    </div>
                </div>
            </Link>

            {/* Navigation */}
            <nav className="flex flex-col gap-1">
                {navItems.map(item => {
                    const isActive = isItemActive(item);
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => isMobile && setIsMobileOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative ${
                                isActive 
                                    ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs' 
                                    : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:border-slate-200/60 dark:hover:border-slate-700/60'
                            }`}
                        >
                            {isActive && (
                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-xs shadow-indigo-500/50"></div>
                            )}
                            <div 
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-xs shadow-indigo-500/30'
                                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 border border-slate-200/60 dark:border-slate-700/50 group-hover:shadow-xs'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]"
                                    style={{
                                        fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                    }}>
                                    {item.icon}
                                </span>
                            </div>
                            <span className={`text-[13.5px] tracking-tight transition-colors duration-200 truncate ${
                                isActive 
                                    ? 'font-black text-slate-900 dark:text-white' 
                                    : 'font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                            }`}>
                                {item.label}
                            </span>
                            <span className={`material-symbols-outlined text-[16px] transition-all ml-auto ${
                                isActive
                                    ? 'text-indigo-600 dark:text-indigo-400 opacity-80'
                                    : 'opacity-0 -translate-x-1 group-hover:opacity-40 group-hover:translate-x-0 text-slate-400'
                            }`}>
                                chevron_right
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* Create Post CTA */}
            {currentUser?.role !== 'SYSADM' && (
                <button
                    onClick={() => {
                        if (isMobile) setIsMobileOpen(false);
                        openPostModal();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-extrabold text-[13.5px] text-white tracking-wide transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/25 active:translate-y-0 active:scale-[0.99] cursor-pointer group bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 border border-white/10"
                >
                    <span className="material-symbols-outlined text-[19px] transition-transform group-hover:rotate-90 duration-300" style={{fontVariationSettings:"'FILL' 1"}}>add_circle</span>
                    <span>Create Post</span>
                </button>
            )}

            {/* Quick Links */}
            <div className="rounded-2xl p-2.5 bg-theme-60-surface border border-theme-30 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)] flex flex-col gap-1">
                <div className="flex flex-col gap-1">
                    {quickLinks.map(link => {
                        const isActive = isItemActive(link);
                        return (
                            <Link key={link.to} to={link.to}
                                onClick={() => isMobile && setIsMobileOpen(false)}
                                className={`flex flex-row items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all duration-200 group relative ${
                                    isActive 
                                        ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs' 
                                        : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:border-slate-200/50 dark:hover:border-slate-700/50'
                                }`}
                                title={link.label}>
                                {isActive && (
                                    <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-xs"></div>
                                )}
                                <div 
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                        isActive 
                                            ? 'shadow-xs text-white' 
                                            : 'bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-xs'
                                    }`}
                                    style={{
                                        backgroundColor: isActive ? link.color : undefined,
                                    }}
                                >
                                    <span className="material-symbols-outlined text-[16px] transition-all"
                                        style={{
                                            color: isActive ? '#ffffff' : link.color,
                                            fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0"
                                        }}>
                                        {link.icon}
                                    </span>
                                </div>
                                <span className={`text-[12.5px] tracking-tight transition-colors truncate ${
                                    isActive
                                        ? 'font-bold text-slate-900 dark:text-white'
                                        : 'font-semibold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                                }`}>
                                    {link.label}
                                </span>
                                <span className={`material-symbols-outlined text-[14px] transition-all ml-auto ${
                                    isActive
                                        ? 'text-indigo-600 dark:text-indigo-400 opacity-70'
                                        : 'opacity-0 -translate-x-1 group-hover:opacity-40 group-hover:translate-x-0 text-slate-400'
                                }`}>
                                    chevron_right
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* 1. Desktop Sticky Sidebar — fixed to viewport while main content scrolls */}
            <aside
                className="hidden md:flex flex-col shrink-0 sticky top-24"
                style={{ width: '260px', height: 'calc(100vh - 7rem)', overflowY: 'auto', overflowX: 'hidden' }}
            >
                {/* Inner wrapper with gap — scrollable when sidebar is taller than screen */}
                <div className="flex flex-col gap-3 pb-4 pr-0.5 custom-scrollbar">
                    {renderSidebarContent(false)}
                </div>
            </aside>

            {/* 2. Mobile Slide-Out Drawer (Accessible via Hamburger & Bottom Bar) */}
            {isMobileOpen && (
                <div className="fixed inset-0 z-[100] md:hidden">
                    {/* Backdrop */}
                    <div 
                        onClick={() => setIsMobileOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
                    />

                    {/* Slide Drawer Content */}
                    <div className="fixed top-0 left-0 bottom-0 w-[290px] max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl p-4 overflow-y-auto z-10 flex flex-col gap-3.5 custom-scrollbar">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                                    <span className="material-symbols-outlined text-[16px]">hub</span>
                                </div>
                                <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight">Knome Menu</span>
                            </div>
                            <button
                                onClick={() => setIsMobileOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                aria-label="Close Sidebar"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>

                        {renderSidebarContent(true)}
                    </div>
                </div>
            )}

            {/* 3. Mobile Bottom Action Bar (Fixed at bottom for 1-tap mobile navigation) */}
            <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-around shadow-lg">
                <Link to="/" className={`flex flex-col items-center gap-0.5 p-1 rounded-xl transition-colors ${pathname === '/' ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: pathname === '/' ? "'FILL' 1" : "'FILL' 0" }}>home</span>
                    <span className="text-[10px]">Home</span>
                </Link>

                <Link to="/community" className={`flex flex-col items-center gap-0.5 p-1 rounded-xl transition-colors ${pathname.startsWith('/community') ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: pathname.startsWith('/community') ? "'FILL' 1" : "'FILL' 0" }}>group</span>
                    <span className="text-[10px]">Groups</span>
                </Link>

                {/* Center Create Post Floating Action Button */}
                {currentUser?.role !== 'SYSADM' && (
                    <button
                        onClick={openPostModal}
                        className="w-11 h-11 -mt-4 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/35 active:scale-95 transition-transform cursor-pointer"
                        title="Create Post"
                        aria-label="Create Post"
                    >
                        <span className="material-symbols-outlined text-[24px]">add</span>
                    </button>
                )}

                <Link to="/videos" className={`flex flex-col items-center gap-0.5 p-1 rounded-xl transition-colors ${pathname.startsWith('/videos') ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: pathname.startsWith('/videos') ? "'FILL' 1" : "'FILL' 0" }}>videocam</span>
                    <span className="text-[10px]">Videos</span>
                </Link>

                <button
                    onClick={() => setIsMobileOpen(true)}
                    className="flex flex-col items-center gap-0.5 p-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                    title="Open Full Sidebar"
                >
                    <span className="material-symbols-outlined text-[20px]">menu</span>
                    <span className="text-[10px]">Menu</span>
                </button>
            </div>
        </>
    );
}

