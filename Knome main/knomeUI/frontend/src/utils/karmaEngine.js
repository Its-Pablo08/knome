/**
 * Karma Engine (FR-KP-03)
 * Calculates badge tiers and contributor levels based on lifetime karma points.
 * Level 5 - Platinum: 5,000+ pts
 * Level 4 - Gold:     1,000 – 4,999 pts
 * Level 3 - Silver:   500 – 999 pts
 * Level 2 - Bronze:   100 – 499 pts
 * Level 1 - Starter:  0 – 99 pts
 */

export function getKarmaLevelInfo(points) {
    const pts = Number(points || 0);
    if (pts >= 5000) {
        return {
            level: 5,
            name: 'Platinum',
            title: 'Enterprise Legend',
            color: 'text-cyan-500 dark:text-cyan-400',
            circleBorder: 'border-cyan-500',
            circleBg: 'bg-cyan-50 dark:bg-cyan-950/50',
            circleText: 'text-cyan-600 dark:text-cyan-300',
            progressBar: 'bg-gradient-to-r from-cyan-400 to-blue-500',
            bg: 'bg-slate-200/10',
            border: 'border-slate-300/30',
            minPoints: 5000,
            nextTarget: null,
            nextName: null,
            nextLevel: null,
            progressPercent: 100,
            pointsRemaining: 0
        };
    } else if (pts >= 1000) {
        const range = 5000 - 1000;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 1000) / range) * 100)));
        return {
            level: 4,
            name: 'Gold',
            title: 'Domain Expert',
            color: 'text-amber-500 dark:text-amber-400',
            circleBorder: 'border-amber-500',
            circleBg: 'bg-amber-50 dark:bg-amber-950/50',
            circleText: 'text-amber-600 dark:text-amber-400',
            progressBar: 'bg-gradient-to-r from-amber-400 to-yellow-500',
            bg: 'bg-yellow-500/10',
            border: 'border-yellow-500/30',
            minPoints: 1000,
            nextTarget: 5000,
            nextName: 'Platinum',
            nextLevel: 5,
            progressPercent: progress,
            pointsRemaining: 5000 - pts
        };
    } else if (pts >= 500) {
        const range = 1000 - 500;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 500) / range) * 100)));
        return {
            level: 3,
            name: 'Silver',
            title: 'Active Contributor',
            color: 'text-slate-400 dark:text-slate-300',
            circleBorder: 'border-slate-400',
            circleBg: 'bg-slate-100 dark:bg-slate-800/60',
            circleText: 'text-slate-600 dark:text-slate-300',
            progressBar: 'bg-gradient-to-r from-slate-400 to-slate-500',
            bg: 'bg-slate-400/10',
            border: 'border-slate-400/30',
            minPoints: 500,
            nextTarget: 1000,
            nextName: 'Gold',
            nextLevel: 4,
            progressPercent: progress,
            pointsRemaining: 1000 - pts
        };
    } else if (pts >= 100) {
        const range = 500 - 100;
        const progress = Math.min(100, Math.max(0, Math.round(((pts - 100) / range) * 100)));
        return {
            level: 2,
            name: 'Bronze',
            title: 'Community Explorer',
            color: 'text-amber-700 dark:text-amber-500',
            circleBorder: 'border-amber-700',
            circleBg: 'bg-orange-50 dark:bg-orange-950/50',
            circleText: 'text-amber-700 dark:text-amber-500',
            progressBar: 'bg-gradient-to-r from-amber-600 to-orange-500',
            bg: 'bg-amber-700/10',
            border: 'border-amber-700/30',
            minPoints: 100,
            nextTarget: 500,
            nextName: 'Silver',
            nextLevel: 3,
            progressPercent: progress,
            pointsRemaining: 500 - pts
        };
    } else {
        const range = 100;
        const progress = Math.min(100, Math.max(0, Math.round((pts / range) * 100)));
        return {
            level: 1,
            name: 'Starter',
            title: 'New Member',
            color: 'text-indigo-500 dark:text-indigo-400',
            circleBorder: 'border-indigo-500',
            circleBg: 'bg-indigo-50 dark:bg-indigo-950/50',
            circleText: 'text-indigo-600 dark:text-indigo-400',
            progressBar: 'bg-gradient-to-r from-indigo-500 to-purple-500',
            bg: 'bg-indigo-400/10',
            border: 'border-indigo-400/30',
            minPoints: 0,
            nextTarget: 100,
            nextName: 'Bronze',
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
        levelInfo: info
    };
}

