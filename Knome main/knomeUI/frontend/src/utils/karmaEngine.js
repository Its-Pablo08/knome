/**
 * Karma Engine (FR-KP-03)
 * Calculates badge tiers and contributor levels based on lifetime karma points.
 * Level 5 - Platinum: 5,000+ pts
 * Level 4 - Gold:     1,000 – 4,999 pts
 * Level 3 - Silver:   500 – 999 pts
 * Level 2 - Bronze:   100 – 499 pts
 * Level 1 - Starter:  0 – 99 pts
 */

export const KARMA_TIERS = [
    {
        level: 5,
        name: 'Diamond',
        legacyName: 'Platinum',
        title: 'Enterprise Luminary',
        points: '5,000+ pts',
        minPoints: 5000,
        maxPoints: null,
        icon: 'diamond',
        color: 'text-cyan-500 dark:text-cyan-400',
        circleBorder: 'border-cyan-400',
        circleBg: 'bg-cyan-500/10 dark:bg-cyan-950/60',
        circleText: 'text-cyan-600 dark:text-cyan-300',
        progressBar: 'bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500',
        bg: 'bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-indigo-500/10',
        border: 'border-cyan-400/40 dark:border-cyan-500/30',
        badgeClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/50 shadow-[0_2px_12px_rgba(6,182,212,0.3)]',
        pillClass: 'from-cyan-500/20 via-blue-500/15 to-violet-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/40',
        gradient: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 50%, #6366f1 100%)',
        glow: 'shadow-[0_4px_22px_rgba(6,182,212,0.4)]'
    },
    {
        level: 4,
        name: 'Gold',
        title: 'Domain Expert',
        points: '1,000 – 4,999 pts',
        minPoints: 1000,
        maxPoints: 4999,
        icon: 'stars',
        color: 'text-amber-500 dark:text-amber-400',
        circleBorder: 'border-amber-400',
        circleBg: 'bg-amber-500/10 dark:bg-amber-950/60',
        circleText: 'text-amber-600 dark:text-amber-400',
        progressBar: 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-600',
        bg: 'bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-orange-500/10',
        border: 'border-amber-400/40 dark:border-amber-500/30',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/50 shadow-[0_2px_12px_rgba(245,158,11,0.3)]',
        pillClass: 'from-amber-500/20 via-yellow-400/15 to-amber-600/10 text-amber-600 dark:text-amber-400 border-amber-400/40',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #d97706 100%)',
        glow: 'shadow-[0_4px_20px_rgba(245,158,11,0.4)]'
    },
    {
        level: 3,
        name: 'Silver',
        title: 'Active Contributor',
        points: '500 – 999 pts',
        minPoints: 500,
        maxPoints: 999,
        icon: 'military_tech',
        color: 'text-slate-400 dark:text-slate-300',
        circleBorder: 'border-slate-300 dark:border-slate-500',
        circleBg: 'bg-slate-200/50 dark:bg-slate-800/60',
        circleText: 'text-slate-700 dark:text-slate-200',
        progressBar: 'bg-gradient-to-r from-slate-400 via-slate-300 to-slate-500',
        bg: 'bg-gradient-to-br from-slate-300/20 via-slate-200/10 to-slate-400/10',
        border: 'border-slate-300/40 dark:border-slate-600/40',
        badgeClass: 'bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300/60 dark:border-slate-600/60 shadow-[0_2px_10px_rgba(148,163,184,0.25)]',
        pillClass: 'from-slate-400/20 via-slate-300/10 to-slate-500/10 text-slate-700 dark:text-slate-200 border-slate-400/40',
        gradient: 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 50%, #64748b 100%)',
        glow: 'shadow-[0_4px_16px_rgba(148,163,184,0.35)]'
    },
    {
        level: 2,
        name: 'Bronze',
        title: 'Community Explorer',
        points: '100 – 499 pts',
        minPoints: 100,
        maxPoints: 499,
        icon: 'shield',
        color: 'text-amber-700 dark:text-amber-500',
        circleBorder: 'border-amber-600 dark:border-amber-700',
        circleBg: 'bg-orange-500/10 dark:bg-orange-950/60',
        circleText: 'text-amber-700 dark:text-amber-400',
        progressBar: 'bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700',
        bg: 'bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-amber-700/10',
        border: 'border-amber-600/40 dark:border-amber-700/30',
        badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40 shadow-[0_2px_10px_rgba(217,119,6,0.25)]',
        pillClass: 'from-amber-600/20 via-orange-500/15 to-amber-700/10 text-amber-700 dark:text-amber-400 border-amber-600/40',
        gradient: 'linear-gradient(135deg, #d97706 0%, #ea580c 50%, #b45309 100%)',
        glow: 'shadow-[0_4px_16px_rgba(217,119,6,0.35)]'
    },
    {
        level: 1,
        name: 'Starter',
        title: 'New Member',
        points: '0 – 99 pts',
        minPoints: 0,
        maxPoints: 99,
        icon: 'flag',
        color: 'text-indigo-500 dark:text-indigo-400',
        circleBorder: 'border-indigo-400 dark:border-indigo-500',
        circleBg: 'bg-indigo-500/10 dark:bg-indigo-950/60',
        circleText: 'text-indigo-600 dark:text-indigo-400',
        progressBar: 'bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500',
        bg: 'bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-purple-500/10',
        border: 'border-indigo-400/40 dark:border-indigo-500/30',
        badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-400/40 shadow-[0_2px_8px_rgba(99,102,241,0.2)]',
        pillClass: 'from-indigo-500/20 via-blue-500/15 to-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-400/40',
        gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #4f46e5 100%)',
        glow: 'shadow-[0_4px_14px_rgba(99,102,241,0.3)]'
    }
];

export function getKarmaLevelInfo(points) {
    const pts = Math.max(0, Number(points || 0));

    if (pts >= 5000) {
        const tier = KARMA_TIERS[0];
        return {
            ...tier,
            nextTarget: null,
            nextName: null,
            nextLevel: null,
            progressPercent: 100,
            pointsRemaining: 0
        };
    } else if (pts >= 1000) {
        const tier = KARMA_TIERS[1];
        const range = 5000 - 1000;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 1000) / range) * 100)));
        return {
            ...tier,
            nextTarget: 5000,
            nextName: KARMA_TIERS[0].name,
            nextLevel: 5,
            progressPercent: progress,
            pointsRemaining: 5000 - pts
        };
    } else if (pts >= 500) {
        const tier = KARMA_TIERS[2];
        const range = 1000 - 500;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 500) / range) * 100)));
        return {
            ...tier,
            nextTarget: 1000,
            nextName: KARMA_TIERS[1].name,
            nextLevel: 4,
            progressPercent: progress,
            pointsRemaining: 1000 - pts
        };
    } else if (pts >= 100) {
        const tier = KARMA_TIERS[3];
        const range = 500 - 100;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 100) / range) * 100)));
        return {
            ...tier,
            nextTarget: 500,
            nextName: KARMA_TIERS[2].name,
            nextLevel: 3,
            progressPercent: progress,
            pointsRemaining: 500 - pts
        };
    } else {
        const tier = KARMA_TIERS[4];
        const range = 100;
        const progress = Math.min(100, Math.max(0, Math.round((pts / range) * 100)));
        return {
            ...tier,
            nextTarget: 100,
            nextName: KARMA_TIERS[3].name,
            nextLevel: 2,
            progressPercent: progress,
            pointsRemaining: 100 - pts
        };
    }
}

export function getKarmaBadge(points) {
    const info = getKarmaLevelInfo(points);
    return {
        level: info.level,
        name: info.name,
        color: info.color,
        bg: info.bg,
        border: info.border,
        badgeClass: info.badgeClass,
        pillClass: info.pillClass,
        gradient: info.gradient,
        glow: info.glow,
        icon: info.icon,
        levelInfo: info
    };
}

