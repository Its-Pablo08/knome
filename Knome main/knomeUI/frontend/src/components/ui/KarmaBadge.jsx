import React from 'react';
import { getKarmaLevelInfo } from '../../utils/karmaEngine';

/**
 * High-Aesthetic Vector Medallion for Karma Points Levels
 * Levels:
 * L1: Starter (Sapphire & Indigo Crest)
 * L2: Bronze (Burnished Copper/Bronze Medallion)
 * L3: Silver (Polished Sterling Chrome Starburst)
 * L4: Gold (Imperial 24K Gold Laurel Crown)
 * L5: Diamond (Prismatic Crystalline Grandmaster Star)
 */
export const KarmaLevelMedal = ({ level = 1, size = 48, className = '' }) => {
    const lvl = Math.max(1, Math.min(5, Number(level) || 1));
    const uid = `karma-medal-lvl${lvl}-${Math.round(size)}`;

    // Tier-specific SVG definitions
    switch (lvl) {
        case 5: // Diamond / Platinum Luminary
            return (
                <svg 
                    width={size} 
                    height={size} 
                    viewBox="0 0 100 100" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-300 hover:scale-110 drop-shadow-[0_4px_12px_rgba(6,182,212,0.45)] ${className}`}
                >
                    <defs>
                        <linearGradient id={`${uid}-outer`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="30%" stopColor="#818cf8" />
                            <stop offset="70%" stopColor="#c084fc" />
                            <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                        <radialGradient id={`${uid}-glow`} cx="50%" cy="30%" r="65%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.9" />
                        </radialGradient>
                        <linearGradient id={`${uid}-facet`} x1="20%" y1="0%" x2="80%" y2="100%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
                        </linearGradient>
                    </defs>

                    {/* Outer Radiance Burst */}
                    <path 
                        d="M50 4 L57 32 L85 22 L68 45 L96 50 L68 55 L85 78 L57 68 L50 96 L43 68 L15 78 L32 55 L4 50 L32 45 L15 22 L43 32 Z" 
                        fill={`url(#${uid}-outer)`} 
                        opacity="0.95"
                    />

                    {/* Concentric Platinum Ring */}
                    <circle cx="50" cy="50" r="32" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
                    <circle cx="50" cy="50" r="28" fill={`url(#${uid}-glow)`} />

                    {/* Faceted Diamond Crest */}
                    <polygon points="50,26 68,39 61,64 39,64 32,39" fill={`url(#${uid}-facet)`} opacity="0.85" />
                    <polygon points="50,26 61,39 50,68 39,39" fill="#ffffff" opacity="0.95" />
                    <line x1="50" y1="26" x2="50" y2="68" stroke="#38bdf8" strokeWidth="1.2" opacity="0.6" />
                    <line x1="32" y1="39" x2="68" y2="39" stroke="#ffffff" strokeWidth="1.5" opacity="0.8" />

                    {/* Level Numeral Pill */}
                    <rect x="36" y="70" width="28" height="15" rx="7.5" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                    <text x="50" y="81.5" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="900" fontFamily="sans-serif">L5</text>
                </svg>
            );

        case 4: // Gold Domain Expert
            return (
                <svg 
                    width={size} 
                    height={size} 
                    viewBox="0 0 100 100" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-300 hover:scale-110 drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)] ${className}`}
                >
                    <defs>
                        <linearGradient id={`${uid}-gold1`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fef08a" />
                            <stop offset="35%" stopColor="#fbbf24" />
                            <stop offset="70%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#b45309" />
                        </linearGradient>
                        <radialGradient id={`${uid}-goldCore`} cx="38%" cy="32%" r="65%">
                            <stop offset="0%" stopColor="#fffbeb" />
                            <stop offset="40%" stopColor="#fde047" />
                            <stop offset="80%" stopColor="#d97706" />
                            <stop offset="100%" stopColor="#78350f" />
                        </radialGradient>
                    </defs>

                    {/* Scalloped Gold Medallion Rim */}
                    <circle cx="50" cy="50" r="44" fill={`url(#${uid}-gold1)`} />
                    <circle cx="50" cy="50" r="38" fill="#78350f" stroke="#fde047" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="34" fill={`url(#${uid}-goldCore)`} />

                    {/* Laurel Leaves Surround */}
                    <path d="M26 50 C26 36 34 26 44 24 C40 30 38 40 40 50 C34 50 28 50 26 50 Z" fill="#fef08a" opacity="0.65" />
                    <path d="M74 50 C74 36 66 26 56 24 C60 30 62 40 60 50 C66 50 72 50 74 50 Z" fill="#fef08a" opacity="0.65" />

                    {/* 3D Gold Star Emblem */}
                    <polygon points="50,24 55,39 71,40 58,50 63,65 50,55 37,65 42,50 29,40 45,39" fill="#fffbeb" stroke="#b45309" strokeWidth="1.2" />
                    <polygon points="50,24 55,39 50,55 45,39" fill="#fde047" />
                    <polygon points="71,40 58,50 50,55 55,39" fill="#f59e0b" />
                    <polygon points="63,65 50,55 58,50" fill="#b45309" />
                    <polygon points="37,65 50,55 42,50" fill="#d97706" />
                    <polygon points="29,40 45,39 50,55 42,50" fill="#fde047" />

                    {/* Level Numeral Pill */}
                    <rect x="36" y="70" width="28" height="15" rx="7.5" fill="#78350f" stroke="#fde047" strokeWidth="1.5" />
                    <text x="50" y="81.5" textAnchor="middle" fill="#fde047" fontSize="10" fontWeight="900" fontFamily="sans-serif">L4</text>
                </svg>
            );

        case 3: // Silver Active Contributor
            return (
                <svg 
                    width={size} 
                    height={size} 
                    viewBox="0 0 100 100" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-300 hover:scale-110 drop-shadow-[0_4px_12px_rgba(148,163,184,0.45)] ${className}`}
                >
                    <defs>
                        <linearGradient id={`${uid}-silver1`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="40%" stopColor="#cbd5e1" />
                            <stop offset="70%" stopColor="#94a3b8" />
                            <stop offset="100%" stopColor="#475569" />
                        </linearGradient>
                        <radialGradient id={`${uid}-silverCore`} cx="35%" cy="30%" r="65%">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="50%" stopColor="#e2e8f0" />
                            <stop offset="85%" stopColor="#64748b" />
                            <stop offset="100%" stopColor="#334155" />
                        </radialGradient>
                    </defs>

                    {/* Octagonal Silver Medallion */}
                    <polygon points="30,6 70,6 94,30 94,70 70,94 30,94 6,70 6,30" fill={`url(#${uid}-silver1)`} />
                    <circle cx="50" cy="50" r="36" fill="#1e293b" stroke="#e2e8f0" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="32" fill={`url(#${uid}-silverCore)`} />

                    {/* Polished Silver Star */}
                    <polygon points="50,22 56,38 72,39 59,49 64,65 50,55 36,65 41,49 28,39 44,38" fill="#ffffff" stroke="#64748b" strokeWidth="1.2" />
                    <polygon points="50,22 56,38 50,55 44,38" fill="#f8fafc" />
                    <polygon points="72,39 59,49 50,55 56,38" fill="#cbd5e1" />
                    <polygon points="64,65 50,55 59,49" fill="#94a3b8" />
                    <polygon points="36,65 50,55 41,49" fill="#64748b" />
                    <polygon points="28,39 44,38 50,55 41,49" fill="#e2e8f0" />

                    {/* Level Numeral Pill */}
                    <rect x="36" y="70" width="28" height="15" rx="7.5" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1.5" />
                    <text x="50" y="81.5" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="900" fontFamily="sans-serif">L3</text>
                </svg>
            );

        case 2: // Bronze Community Explorer
            return (
                <svg 
                    width={size} 
                    height={size} 
                    viewBox="0 0 100 100" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-300 hover:scale-110 drop-shadow-[0_4px_12px_rgba(180,83,9,0.45)] ${className}`}
                >
                    <defs>
                        <linearGradient id={`${uid}-bronze1`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fdba74" />
                            <stop offset="35%" stopColor="#ea580c" />
                            <stop offset="70%" stopColor="#c2410c" />
                            <stop offset="100%" stopColor="#7c2d12" />
                        </linearGradient>
                        <radialGradient id={`${uid}-bronzeCore`} cx="35%" cy="30%" r="65%">
                            <stop offset="0%" stopColor="#ffedd5" />
                            <stop offset="45%" stopColor="#f97316" />
                            <stop offset="85%" stopColor="#9a3412" />
                            <stop offset="100%" stopColor="#431407" />
                        </radialGradient>
                    </defs>

                    {/* Scalloped Bronze Rim */}
                    <circle cx="50" cy="50" r="44" fill={`url(#${uid}-bronze1)`} />
                    <circle cx="50" cy="50" r="37" fill="#431407" stroke="#fdba74" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="33" fill={`url(#${uid}-bronzeCore)`} />

                    {/* Shield Medal Icon */}
                    <path d="M50 24 L68 32 C68 50 58 62 50 67 C42 62 32 50 32 32 Z" fill="#ffedd5" stroke="#7c2d12" strokeWidth="1.5" />
                    <path d="M50 24 L50 67 C58 62 68 50 68 32 Z" fill="#ea580c" opacity="0.75" />
                    <polygon points="50,33 53,42 62,42 55,48 57,57 50,51 43,57 45,48 38,42 47,42" fill="#fff" />

                    {/* Level Numeral Pill */}
                    <rect x="36" y="70" width="28" height="15" rx="7.5" fill="#431407" stroke="#fdba74" strokeWidth="1.5" />
                    <text x="50" y="81.5" textAnchor="middle" fill="#fed7aa" fontSize="10" fontWeight="900" fontFamily="sans-serif">L2</text>
                </svg>
            );

        case 1: // Starter / Pioneer
        default:
            return (
                <svg 
                    width={size} 
                    height={size} 
                    viewBox="0 0 100 100" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-300 hover:scale-110 drop-shadow-[0_4px_12px_rgba(99,102,241,0.4)] ${className}`}
                >
                    <defs>
                        <linearGradient id={`${uid}-blue1`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a5b4fc" />
                            <stop offset="35%" stopColor="#6366f1" />
                            <stop offset="70%" stopColor="#4f46e5" />
                            <stop offset="100%" stopColor="#312e81" />
                        </linearGradient>
                        <radialGradient id={`${uid}-blueCore`} cx="35%" cy="30%" r="65%">
                            <stop offset="0%" stopColor="#e0e7ff" />
                            <stop offset="45%" stopColor="#818cf8" />
                            <stop offset="85%" stopColor="#4338ca" />
                            <stop offset="100%" stopColor="#1e1b4b" />
                        </radialGradient>
                    </defs>

                    {/* Hexagonal Shield */}
                    <polygon points="50,8 88,28 88,72 50,92 12,72 12,28" fill={`url(#${uid}-blue1)`} />
                    <circle cx="50" cy="50" r="34" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="1.5" />
                    <circle cx="50" cy="50" r="30" fill={`url(#${uid}-blueCore)`} />

                    {/* Centered Star Spark */}
                    <polygon points="50,27 54,41 68,43 57,52 61,66 50,57 39,66 43,52 32,43 46,41" fill="#ffffff" stroke="#312e81" strokeWidth="1.2" />
                    <polygon points="50,27 54,41 50,57 46,41" fill="#c7d2fe" />

                    {/* Level Numeral Pill */}
                    <rect x="36" y="70" width="28" height="15" rx="7.5" fill="#1e1b4b" stroke="#a5b4fc" strokeWidth="1.5" />
                    <text x="50" y="81.5" textAnchor="middle" fill="#c7d2fe" fontSize="10" fontWeight="900" fontFamily="sans-serif">L1</text>
                </svg>
            );
    }
};

/**
 * Reusable Karma Badge Component
 * Variants:
 * - 'medal': Vector metallic emblem with shimmer
 * - 'pill': Compact badge with tier gradient, icon, and points/level
 * - 'card': Full showcase block with progress ring & next tier info
 */
export default function KarmaBadge({ points = 0, variant = 'medal', size = 44, showLabel = true, className = '' }) {
    const info = getKarmaLevelInfo(points);

    if (variant === 'pill') {
        const tierGradients = {
            1: 'bg-gradient-to-r from-indigo-500/15 via-blue-500/10 to-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-400/30',
            2: 'bg-gradient-to-r from-amber-600/15 via-orange-500/10 to-amber-700/5 text-amber-700 dark:text-amber-400 border-amber-600/30',
            3: 'bg-gradient-to-r from-slate-400/20 via-slate-300/10 to-slate-500/5 text-slate-700 dark:text-slate-200 border-slate-400/40',
            4: 'bg-gradient-to-r from-amber-500/20 via-yellow-400/15 to-amber-600/10 text-amber-600 dark:text-amber-400 border-amber-400/50 shadow-[0_2px_10px_rgba(245,158,11,0.2)]',
            5: 'bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-violet-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/50 shadow-[0_2px_12px_rgba(6,182,212,0.25)]'
        };

        const currentStyle = tierGradients[info.level] || tierGradients[1];

        return (
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black backdrop-blur-md transition-all hover:scale-105 select-none ${currentStyle} ${className}`}>
                <KarmaLevelMedal level={info.level} size={18} />
                <span className="tracking-tight">{info.name}</span>
                <span className="text-[10px] opacity-75 font-bold uppercase">L{info.level}</span>
            </div>
        );
    }

    if (variant === 'card') {
        return (
            <div className={`rounded-2xl border p-5 glass card-lift relative overflow-hidden flex flex-col justify-between ${info.bg} ${info.border} ${className}`}>
                <div className="flex items-center gap-4">
                    <KarmaLevelMedal level={info.level} size={size || 56} />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/5 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                                Level {info.level}
                            </span>
                            <span className={`text-xs font-bold ${info.circleText}`}>{info.name} Tier</span>
                        </div>
                        <h4 className="text-base font-black text-slate-900 dark:text-white mt-0.5">{info.title}</h4>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {Number(points || 0).toLocaleString()} Karma Points
                        </p>
                    </div>
                </div>

                {info.nextLevel && (
                    <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                            <span>To Level {info.nextLevel} ({info.nextName})</span>
                            <span className={info.circleText}>{info.progressPercent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div 
                                className={`h-full ${info.progressBar} transition-all duration-500 rounded-full`}
                                style={{ width: `${info.progressPercent}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-right font-medium text-slate-400 mt-1">
                            {info.pointsRemaining.toLocaleString()} pts to unlock {info.nextName}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // Default 'medal' variant
    return (
        <div className={`inline-flex flex-col items-center select-none ${className}`}>
            <KarmaLevelMedal level={info.level} size={size} />
            {showLabel && (
                <div className="text-center mt-1">
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 block leading-tight">
                        {info.name}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        Level {info.level}
                    </span>
                </div>
            )}
        </div>
    );
}
