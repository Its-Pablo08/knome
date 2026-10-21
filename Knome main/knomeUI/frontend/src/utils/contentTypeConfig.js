/**
 * Configuration and metadata helper for Knome content types.
 * Maps content types (Posts, Videos, Clips, Articles, Podcasts, etc.) to distinct icons,
 * vibrant badges, consistent color schemes, and styling for tables and modals.
 */

export const getContentTypeConfig = (contentType = '') => {
    const norm = String(contentType || '').trim().toLowerCase();

    // 1. Clips / Short Videos
    if (norm.includes('clip')) {
        return {
            type: 'Clip',
            label: 'Clip',
            icon: 'movie',
            color: '#9333ea',
            badgeBg: 'bg-purple-50 dark:bg-purple-950/50',
            borderColor: 'border-purple-200/80 dark:border-purple-800/60',
            iconColor: 'text-purple-600 dark:text-purple-400',
            textColor: 'text-purple-600 dark:text-purple-400',
            hoverColor: 'group-hover:text-purple-700 dark:group-hover:text-purple-300'
        };
    }

    // 2. Videos / Video Library
    if (norm.includes('video')) {
        return {
            type: 'Video',
            label: 'Video',
            icon: 'videocam',
            color: '#ef4444',
            badgeBg: 'bg-rose-50 dark:bg-rose-950/50',
            borderColor: 'border-rose-200/80 dark:border-rose-800/60',
            iconColor: 'text-rose-600 dark:text-rose-400',
            textColor: 'text-rose-600 dark:text-rose-400',
            hoverColor: 'group-hover:text-rose-700 dark:group-hover:text-rose-300'
        };
    }

    // 3. Articles / Long-form Posts
    if (norm.includes('article')) {
        return {
            type: 'Article',
            label: 'Article',
            icon: 'article',
            color: '#0284c7',
            badgeBg: 'bg-sky-50 dark:bg-sky-950/50',
            borderColor: 'border-sky-200/80 dark:border-sky-800/60',
            iconColor: 'text-sky-600 dark:text-sky-400',
            textColor: 'text-sky-600 dark:text-sky-400',
            hoverColor: 'group-hover:text-sky-700 dark:group-hover:text-sky-300'
        };
    }

    // 4. Podcasts / Audio
    if (norm.includes('podcast') || norm.includes('audio')) {
        return {
            type: 'Podcast',
            label: 'Podcast',
            icon: 'podcasts',
            color: '#c026d3',
            badgeBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/50',
            borderColor: 'border-fuchsia-200/80 dark:border-fuchsia-800/60',
            iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
            textColor: 'text-fuchsia-600 dark:text-fuchsia-400',
            hoverColor: 'group-hover:text-fuchsia-700 dark:group-hover:text-fuchsia-300'
        };
    }

    // 5. Wikis / Knowledge Base
    if (norm.includes('wiki')) {
        return {
            type: 'Wiki',
            label: 'Wiki',
            icon: 'menu_book',
            color: '#4f46e5',
            badgeBg: 'bg-indigo-50 dark:bg-indigo-950/50',
            borderColor: 'border-indigo-200/80 dark:border-indigo-800/60',
            iconColor: 'text-indigo-600 dark:text-indigo-400',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            hoverColor: 'group-hover:text-indigo-700 dark:group-hover:text-indigo-300'
        };
    }

    // 6. Comments / Discussion
    if (norm.includes('comment')) {
        return {
            type: 'Comment',
            label: 'Comment',
            icon: 'chat_bubble',
            color: '#d97706',
            badgeBg: 'bg-amber-50 dark:bg-amber-950/50',
            borderColor: 'border-amber-200/80 dark:border-amber-800/60',
            iconColor: 'text-amber-600 dark:text-amber-400',
            textColor: 'text-amber-600 dark:text-amber-400',
            hoverColor: 'group-hover:text-amber-700 dark:group-hover:text-amber-300'
        };
    }

    // 7. Communities / Channels
    if (norm.includes('community')) {
        return {
            type: 'Community',
            label: 'Community',
            icon: 'groups',
            color: '#0d9488',
            badgeBg: 'bg-teal-50 dark:bg-teal-950/50',
            borderColor: 'border-teal-200/80 dark:border-teal-800/60',
            iconColor: 'text-teal-600 dark:text-teal-400',
            textColor: 'text-teal-600 dark:text-teal-400',
            hoverColor: 'group-hover:text-teal-700 dark:group-hover:text-teal-300'
        };
    }

    // 8. Posts / Feed Posts
    if (norm.includes('post')) {
        return {
            type: 'Post',
            label: 'Post',
            icon: 'dynamic_feed',
            color: '#2563eb',
            badgeBg: 'bg-blue-50 dark:bg-blue-950/50',
            borderColor: 'border-blue-200/80 dark:border-blue-800/60',
            iconColor: 'text-blue-600 dark:text-blue-400',
            textColor: 'text-blue-600 dark:text-blue-400',
            hoverColor: 'group-hover:text-blue-700 dark:group-hover:text-blue-300'
        };
    }

    // 9. Fallback / Generic Content
    return {
        type: contentType || 'Content',
        label: contentType || 'Content',
        icon: 'description',
        color: '#64748b',
        badgeBg: 'bg-slate-100 dark:bg-slate-800/60',
        borderColor: 'border-slate-200 dark:border-slate-700/60',
        iconColor: 'text-slate-600 dark:text-slate-400',
        textColor: 'text-indigo-600 dark:text-indigo-400',
        hoverColor: 'group-hover:text-indigo-700 dark:group-hover:text-indigo-300'
    };
};
