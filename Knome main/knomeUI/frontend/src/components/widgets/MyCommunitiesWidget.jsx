import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const FALLBACK_COMM_BANNER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%234338ca"/><stop offset="100%" stop-color="%231e1b4b"/></linearGradient></defs><rect width="400" height="200" fill="url(%23g)"/><text x="200" y="105" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="%23e0e7ff" text-anchor="middle">Enterprise Community</text></svg>`;

const ALL_COMPANY_BANNER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23dbeafe"/><g transform="translate(20, 30)"><rect width="260" height="240" rx="16" fill="%23ffffff" stroke="%2393c5fd" stroke-width="2"/><text x="130" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="%231e3a8a" text-anchor="middle">Company Commu...</text><line x1="30" y1="75" x2="230" y2="75" stroke="%23e2e8f0" stroke-width="2"/><circle cx="55" cy="115" r="14" fill="%233b82f6"/><line x1="80" y1="110" x2="210" y2="110" stroke="%23cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="80" y1="122" x2="160" y2="122" stroke="%23e2e8f0" stroke-width="3" stroke-linecap="round"/><circle cx="55" cy="165" r="14" fill="%2310b981"/><line x1="80" y1="160" x2="190" y2="160" stroke="%23cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="80" y1="172" x2="140" y2="172" stroke="%23e2e8f0" stroke-width="3" stroke-linecap="round"/><circle cx="55" cy="215" r="14" fill="%23f59e0b"/><line x1="80" y1="210" x2="200" y2="210" stroke="%23cbd5e1" stroke-width="4" stroke-linecap="round"/></g></svg>`;

const PRODUCTIVITY_BANNER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23f1f5f9"/><g transform="translate(25, 25)"><rect width="250" height="250" rx="14" fill="%23ffffff" stroke="%23cbd5e1" stroke-width="2"/><rect x="20" y="20" width="95" height="35" rx="6" fill="%23e2e8f0"/><rect x="135" y="20" width="95" height="35" rx="6" fill="%23e2e8f0"/><rect x="20" y="70" width="95" height="70" rx="6" fill="%23e0e7ff" stroke="%23c7d2fe"/><rect x="20" y="155" width="95" height="70" rx="6" fill="%23f8fafc" stroke="%23e2e8f0"/><rect x="135" y="70" width="95" height="65" rx="6" fill="%23dcfce7" stroke="%23bbf7d0"/><rect x="135" y="150" width="95" height="75" rx="6" fill="%23fef3c7" stroke="%23fde68a"/><line x1="30" y1="95" x2="80" y2="95" stroke="%236366f1" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="110" x2="65" y2="110" stroke="%23a5b4fc" stroke-width="3" stroke-linecap="round"/><line x1="145" y1="95" x2="195" y2="95" stroke="%2316a34a" stroke-width="4" stroke-linecap="round"/></g></svg>`;

// The 3 primary communities displayed matching the screenshot
const PRIMARY_COMMUNITIES = [
    {
        id: 1,
        name: 'testing - mayur',
        type: 'PRIVATE',
        membersCount: 2,
        isJoined: true,
        avatar: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=300&h=300'
    },
    {
        id: 2,
        name: 'productivity',
        type: 'PUBLIC',
        membersCount: 5,
        isJoined: true,
        avatar: PRODUCTIVITY_BANNER
    },
    {
        id: 3,
        name: 'All company',
        type: 'ORG',
        membersCount: 6,
        isJoined: true,
        avatar: ALL_COMPANY_BANNER
    }
];

// The 17 additional official communities making 20 total
const EXTENDED_COMMUNITIES = [
    { id: 4, name: 'DevOps & Cloud', type: 'PUBLIC', membersCount: 42, isJoined: true, avatar: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 5, name: 'AI & Data Science', type: 'PUBLIC', membersCount: 38, isJoined: true, avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 6, name: '.NET Engineering', type: 'PUBLIC', membersCount: 35, isJoined: true, avatar: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 7, name: 'Full-Stack Developers', type: 'PUBLIC', membersCount: 29, isJoined: true, avatar: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 8, name: 'UI/UX Design Studio', type: 'PUBLIC', membersCount: 24, isJoined: true, avatar: 'https://images.unsplash.com/photo-1542744094-3a3172720189?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 9, name: 'Leadership & Strategy', type: 'PRIVATE', membersCount: 18, isJoined: true, avatar: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 10, name: 'Security & Compliance', type: 'ORG', membersCount: 45, isJoined: true, avatar: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 11, name: 'Product Management', type: 'PUBLIC', membersCount: 22, isJoined: true, avatar: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 12, name: 'HR & People Culture', type: 'ORG', membersCount: 52, isJoined: true, avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 13, name: 'Finance & Accounts', type: 'PRIVATE', membersCount: 16, isJoined: true, avatar: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 14, name: 'QA & Test Automation', type: 'PUBLIC', membersCount: 27, isJoined: true, avatar: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 15, name: 'Architecture Council', type: 'PRIVATE', membersCount: 12, isJoined: true, avatar: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 16, name: 'Marketing & Outreach', type: 'PUBLIC', membersCount: 20, isJoined: true, avatar: 'https://images.unsplash.com/photo-1533750349088-cd871a92f312?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 17, name: 'Mobile App Engineering', type: 'PUBLIC', membersCount: 19, isJoined: true, avatar: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 18, name: 'Frontend Guild', type: 'PUBLIC', membersCount: 31, isJoined: true, avatar: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 19, name: 'Backend Services & APIs', type: 'PUBLIC', membersCount: 34, isJoined: true, avatar: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=300&h=300' },
    { id: 20, name: 'Innovation & Research', type: 'PUBLIC', membersCount: 28, isJoined: true, avatar: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=300&h=300' }
];

const ALL_COMMUNITIES = [...PRIMARY_COMMUNITIES, ...EXTENDED_COMMUNITIES];

export default function MyCommunitiesWidget() {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);

    const displayedCommunities = isExpanded ? ALL_COMMUNITIES : PRIMARY_COMMUNITIES;

    return (
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-[14px] font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-indigo-500" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
                        Enterprise Communities
                        <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 px-1.5 py-0.2 rounded-full">
                            {ALL_COMMUNITIES.length}
                        </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">MPOnline official groups</p>
                </div>
                <Link to="/communities" className="text-[11px] font-bold text-indigo-500 hover:underline">
                    View All
                </Link>
            </div>

            <div className="flex flex-col gap-2.5">
                {displayedCommunities.map((community, idx) => {
                    const badgeClass = community.type === 'PRIVATE'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : community.type === 'ORG'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';

                    return (
                        <div 
                            key={community.id || idx}
                            onClick={() => navigate(`/community/view?id=${community.id || 1}`)}
                            className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group"
                        >
                            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 relative shadow-xs">
                                <img 
                                    src={community.avatar || FALLBACK_COMM_BANNER} 
                                    alt={community.name} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 bg-slate-200" 
                                    onError={(e) => { 
                                        e.target.onerror = null; 
                                        e.target.src = FALLBACK_COMM_BANNER; 
                                    }}
                                />
                                <div className="absolute inset-0 bg-slate-900/10 pointer-events-none"></div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-[13px] font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-500 transition-colors">
                                        {community.name}
                                    </h4>
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${badgeClass}`}>
                                        {community.type}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                    <span className="material-symbols-outlined text-[12px]">group</span>
                                    {community.membersCount} {community.membersCount === 1 ? 'member' : 'members'}
                                    <span className="text-emerald-500 font-bold"> · Joined</span>
                                </p>
                            </div>

                            <span className="material-symbols-outlined text-[18px] text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all">
                                chevron_right
                            </span>
                        </div>
                    );
                })}

                <button
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="w-full py-2 px-3 mt-0.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors flex items-center justify-center gap-1 cursor-pointer border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/40"
                >
                    <span>{isExpanded ? 'Show Less' : `Show More (${ALL_COMMUNITIES.length - 3})`}</span>
                    <span className="material-symbols-outlined text-[18px]">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
            </div>
        </div>
    );
}
