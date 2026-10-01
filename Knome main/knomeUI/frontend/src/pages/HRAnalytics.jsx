import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
    adminApi, 
    interactionsApi, 
    karmaApi, 
    communitiesApi, 
    postsApi, 
    articlesApi, 
    videosApi, 
    podcastsApi,
    analyticsApi,
    notificationsApi
} from '../utils/apiService';
import { useUser } from '../components/contexts/UserContext';
import HighlightText from '../components/ui/HighlightText';
import BroadcastModal from '../components/modals/BroadcastModal';

export default function HRAnalytics() {
    const { currentUser, users: contextUsers } = useUser();
    const [activeReport, setActiveReport] = useState('RPT-01');
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [editingBroadcast, setEditingBroadcast] = useState(null);
    const [activeBroadcasts, setActiveBroadcasts] = useState([]);

    // Live backend data states
    const [engagementMetrics, setEngagementMetrics] = useState(null);
    const [communityHealthMetrics, setCommunityHealthMetrics] = useState(null);
    const [contentPerformanceMetrics, setContentPerformanceMetrics] = useState(null);
    const [trendingMetrics, setTrendingMetrics] = useState(null);
    const [moderationMetrics, setModerationMetrics] = useState(null);

    const [auditLogs, setAuditLogs] = useState([]);
    const [pendingReports, setPendingReports] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [communitiesList, setCommunitiesList] = useState([]);
    const [postsList, setPostsList] = useState([]);
    const [articlesList, setArticlesList] = useState([]);
    const [videosList, setVideosList] = useState([]);
    const [podcastsList, setPodcastsList] = useState([]);
    const [karmaLeaderboard, setKarmaLeaderboard] = useState([]);

    // Role check — allow all authenticated platform users to view analytics
    const isAuthorized = Boolean(currentUser);

    // Load data from live backend APIs
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [
                engagementRes,
                commHealthRes,
                contentPerfRes,
                trendingRes,
                moderationRes,
                usersRes, 
                karmaRes, 
                commsRes, 
                postsRes, 
                articlesRes, 
                videosRes, 
                podcastsRes, 
                reportsRes,
                auditLogsRes
            ] = await Promise.allSettled([
                analyticsApi.getEngagement(),
                analyticsApi.getCommunityHealth(),
                analyticsApi.getContentPerformance(),
                analyticsApi.getTrending(),
                analyticsApi.getModeration(),
                adminApi.getUsers(1, 100),
                karmaApi.getLeaderboard(10),
                communitiesApi.getAll(),
                postsApi.getPosts(null, null, 1, 100),
                articlesApi.getAll(),
                videosApi.getAll(),
                podcastsApi.getAll(),
                interactionsApi.getPendingReports(1, 50),
                adminApi.getAuditLogs(1, 50)
            ]);

            if (engagementRes.status === 'fulfilled' && engagementRes.value) {
                setEngagementMetrics(engagementRes.value?.data || engagementRes.value);
            }
            if (commHealthRes.status === 'fulfilled' && commHealthRes.value) {
                setCommunityHealthMetrics(commHealthRes.value?.data || commHealthRes.value);
            }
            if (contentPerfRes.status === 'fulfilled' && contentPerfRes.value) {
                setContentPerformanceMetrics(contentPerfRes.value?.data || contentPerfRes.value);
            }
            if (trendingRes.status === 'fulfilled' && trendingRes.value) {
                setTrendingMetrics(trendingRes.value?.data || trendingRes.value);
            }
            if (moderationRes.status === 'fulfilled' && moderationRes.value) {
                setModerationMetrics(moderationRes.value?.data || moderationRes.value);
            }

            if (usersRes.status === 'fulfilled' && usersRes.value) {
                const rawUsers = Array.isArray(usersRes.value) ? usersRes.value : (usersRes.value.items || usersRes.value.data || []);
                setUsersList(rawUsers.length > 0 ? rawUsers : (contextUsers || []));
            } else if (contextUsers?.length > 0) {
                setUsersList(contextUsers);
            }

            if (karmaRes.status === 'fulfilled' && karmaRes.value) {
                const rawKarma = Array.isArray(karmaRes.value) ? karmaRes.value : (karmaRes.value.items || karmaRes.value.data || []);
                setKarmaLeaderboard(rawKarma);
            }
            if (commsRes.status === 'fulfilled' && commsRes.value) {
                const rawComms = Array.isArray(commsRes.value) ? commsRes.value : (commsRes.value.items || commsRes.value.data || []);
                setCommunitiesList(rawComms);
            }
            if (postsRes.status === 'fulfilled' && postsRes.value) {
                const rawPosts = Array.isArray(postsRes.value) ? postsRes.value : (postsRes.value.items || postsRes.value.data || []);
                setPostsList(rawPosts);
            }
            if (articlesRes.status === 'fulfilled' && articlesRes.value) {
                const rawArticles = Array.isArray(articlesRes.value) ? articlesRes.value : (articlesRes.value.items || articlesRes.value.data || []);
                setArticlesList(rawArticles);
            }
            if (videosRes.status === 'fulfilled' && videosRes.value) {
                const rawVideos = Array.isArray(videosRes.value) ? videosRes.value : (videosRes.value.items || videosRes.value.data || []);
                setVideosList(rawVideos);
            }
            if (podcastsRes.status === 'fulfilled' && podcastsRes.value) {
                const rawPodcasts = Array.isArray(podcastsRes.value) ? podcastsRes.value : (podcastsRes.value.items || podcastsRes.value.data || []);
                setPodcastsList(rawPodcasts);
            }

            // Pending Reports from real database
            if (reportsRes.status === 'fulfilled' && reportsRes.value) {
                const rawReports = Array.isArray(reportsRes.value) ? reportsRes.value : (reportsRes.value.items || reportsRes.value.data || []);
                setPendingReports(rawReports);
            } else if (moderationRes.status === 'fulfilled' && moderationRes.value) {
                const mod = moderationRes.value?.data || moderationRes.value;
                if (Array.isArray(mod?.pendingReports)) {
                    setPendingReports(mod.pendingReports);
                }
            }

            // Audit Logs from real database
            if (auditLogsRes.status === 'fulfilled' && auditLogsRes.value) {
                const rawLogs = Array.isArray(auditLogsRes.value) ? auditLogsRes.value : (auditLogsRes.value.items || auditLogsRes.value.data || []);
                if (rawLogs.length > 0) {
                    const mappedLogs = rawLogs.map(l => ({
                        logId: l.auditId || l.logId || Math.random(),
                        timestamp: l.timestamp,
                        actorFullName: l.actorName || l.actorFullName || (l.actorUserId === 1 ? 'Loveneesh Sharma (SYSADM)' : `User #${l.actorUserId || 'Admin'}`),
                        action: l.action || 'SystemAction',
                        details: l.reason || (l.targetType ? `${l.targetType} #${l.targetId}` : (l.details || 'Governance Action'))
                    }));
                    setAuditLogs(mappedLogs);
                }
            } else if (moderationRes.status === 'fulfilled' && moderationRes.value) {
                const mod = moderationRes.value?.data || moderationRes.value;
                if (Array.isArray(mod?.auditLogs) && mod.auditLogs.length > 0) {
                    setAuditLogs(mod.auditLogs);
                }
            }
        } catch (err) {
            console.error("Failed to load analytics data", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [contextUsers]);

    const loadBroadcasts = useCallback(() => {
        notificationsApi.broadcasts.getAll().then(res => {
            const list = Array.isArray(res) ? res : (res?.items || res?.data || []);
            setActiveBroadcasts(list);
        }).catch(() => setActiveBroadcasts([]));
    }, []);

    useEffect(() => {
        loadData();
        loadBroadcasts();

        const handleBroadcastUpdate = () => {
            loadBroadcasts();
        };
        window.addEventListener('knome:broadcast-updated', handleBroadcastUpdate);
        return () => {
            window.removeEventListener('knome:broadcast-updated', handleBroadcastUpdate);
        };
    }, [loadData, loadBroadcasts]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    if (!isAuthorized) {
        return (
            <main className="flex-1 p-margin-page bg-background flex flex-col items-center justify-center min-h-[60vh] text-center">
                <h1 className="text-2xl font-bold text-red-500 mb-2">Authentication Required</h1>
                <p className="text-slate-500 max-w-md">Please sign in to your Knome workforce account to view enterprise analytics.</p>
                <Link to="/" className="mt-4 px-4 py-2 bg-electric-blue text-white rounded-lg font-bold text-sm">
                    Return to Knome
                </Link>
            </main>
        );
    }

    const reportsList = [
        { id: 'RPT-01', name: 'User Engagement', icon: 'group', desc: 'DAU, MAU, Karma Distribution, Profile Views' },
        { id: 'RPT-02', name: 'Community Health', icon: 'diversity_3', desc: 'Members, New Joins, Post Frequency, Engagement Rate' },
        { id: 'RPT-03', name: 'Content Performance', icon: 'analytics', desc: 'Posts, Articles, Video Views, Podcast Plays, Reactions' },
        { id: 'RPT-04', name: 'Trending Content', icon: 'trending_up', desc: 'Top Contributors, Top Communities, Most Viewed Content' },
        { id: 'RPT-05', name: 'Moderation Audit', icon: 'security', desc: 'Reports Filed, Resolved, Content Removed, Suspensions' },
    ];

    // Dynamic aggregate metrics computed directly from live SQL Server database
    const activeRoster = usersList.length > 0 ? usersList : (contextUsers || []);
    const engData = engagementMetrics?.data || engagementMetrics;
    const commData = communityHealthMetrics?.data || communityHealthMetrics;
    const contentData = contentPerformanceMetrics?.data || contentPerformanceMetrics;
    const trendData = trendingMetrics?.data || trendingMetrics;
    const modData = moderationMetrics?.data || moderationMetrics;

    const totalUsersCount = engData?.totalUsers ?? engData?.TotalUsers ?? activeRoster.length;
    const activeUsersCount = engData?.activeUsers ?? engData?.ActiveUsers ?? activeRoster.filter(u => u.isActive !== false).length;
    const suspendedUsersCount = engData?.suspendedUsers ?? engData?.SuspendedUsers ?? modData?.suspendedUsersCount ?? activeRoster.filter(u => u.isSuspended || u.status === 'Suspended').length;
    
    const totalCommunitiesCount = commData?.totalCommunities ?? commData?.TotalCommunities ?? (communitiesList.length || 7);
    const totalMembersInCommunities = commData?.totalMemberships ?? commData?.TotalMemberships ?? communitiesList.reduce((sum, c) => sum + (c.membersCount || c.totalMembers || 0), 0);
    const avgMembersPerComm = totalCommunitiesCount > 0 ? (commData?.averageMembersPerCommunity ?? Math.round(totalMembersInCommunities / totalCommunitiesCount)) : 0;

    const avgKarmaPoints = engData?.averageKarmaPerUser ?? engData?.AverageKarmaPerUser ?? (activeRoster.length > 0
        ? Math.round(activeRoster.reduce((sum, u) => sum + (u.karmaPoints || u.karma || 0), 0) / activeRoster.length)
        : 0);

    const totalKarmaDistributed = engData?.totalKarmaDistributed ?? engData?.TotalKarmaDistributed ?? activeRoster.reduce((sum, u) => sum + (u.karmaPoints || u.karma || 0), 0);

    // Karma Tier Distribution from Real Database
    const karmaTiers = engData?.karmaTiers || engData?.KarmaTiers;
    const newbiesCount = karmaTiers?.bronze ?? karmaTiers?.Bronze ?? activeRoster.filter(u => (u.karmaPoints || u.karma || 0) <= 250).length;
    const contributorsCount = karmaTiers?.silver ?? karmaTiers?.Silver ?? activeRoster.filter(u => (u.karmaPoints || u.karma || 0) > 250 && (u.karmaPoints || u.karma || 0) <= 1000).length;
    const expertsCount = karmaTiers?.gold ?? karmaTiers?.Gold ?? activeRoster.filter(u => (u.karmaPoints || u.karma || 0) > 1000 && (u.karmaPoints || u.karma || 0) <= 5000).length;
    const legendsCount = karmaTiers?.platinum ?? karmaTiers?.Platinum ?? activeRoster.filter(u => (u.karmaPoints || u.karma || 0) > 5000).length;
    
    const totalCalcUsers = totalUsersCount || 1;
    const newbiePct = Math.round((newbiesCount / totalCalcUsers) * 100) || 0;
    const contributorPct = Math.round((contributorsCount / totalCalcUsers) * 100) || 0;
    const expertPct = Math.round((expertsCount / totalCalcUsers) * 100) || 0;
    const legendPct = Math.round((legendsCount / totalCalcUsers) * 100) || 0;

    // Content totals from Real Database
    const totalPostsCount = contentData?.totalPosts ?? contentData?.TotalPosts ?? postsList.length;
    const totalArticlesCount = contentData?.totalArticles ?? contentData?.TotalArticles ?? articlesList.length;
    const totalVideosCount = contentData?.totalVideos ?? contentData?.TotalVideos ?? videosList.length;
    const totalPodcastsCount = contentData?.totalPodcasts ?? contentData?.TotalPodcasts ?? podcastsList.length;
    const totalReactionsCount = contentData?.totalReactions ?? contentData?.TotalReactions ?? 0;
    const totalCommentsCount = contentData?.totalComments ?? contentData?.TotalComments ?? 0;
    const totalContentAll = contentData?.totalContentCount ?? contentData?.TotalContentCount ?? (totalPostsCount + totalArticlesCount + totalVideosCount + totalPodcastsCount);

    const totalVideoViewsCount = videosList.reduce((sum, v) => sum + (v.viewCount || v.views || 0), 0);
    const totalPodcastPlaysCount = podcastsList.reduce((sum, p) => sum + (p.viewCount || p.playCount || p.views || 0), 0);

    // Top Leaderboard Array from Real Backend
    const rawContributors = (trendData?.topContributors?.length > 0 ? trendData.topContributors : null) || 
                            (karmaLeaderboard.length > 0 ? karmaLeaderboard : null);

    const topContributorsList = rawContributors && rawContributors.length > 0
        ? rawContributors.map((k, idx) => ({
            rank: idx + 1,
            name: k.fullName || k.userName || `Employee #${k.userId}`,
            role: k.designation || k.departmentName || k.department || 'Employee',
            karma: (k.totalKarmaPoints ?? k.totalPoints ?? k.karmaPoints ?? 0).toLocaleString()
        }))
        : activeRoster.slice(0, 5).map((u, idx) => ({
            rank: idx + 1,
            name: u.fullName || u.name || `Employee #${u.userId || u.id}`,
            role: u.designation || u.department || 'Employee',
            karma: (u.karmaPoints || u.karma || 0).toLocaleString()
        }));

    // Top Communities from Real Backend
    const topCommunitiesList = (commData?.topCommunities?.length > 0 ? commData.topCommunities : null) ||
        (commData?.TopCommunities?.length > 0 ? commData.TopCommunities : null) ||
        (trendData?.topCommunities?.length > 0 ? trendData.topCommunities : null) ||
        communitiesList.slice(0, 7).map(c => ({
            communityId: c.communityId || c.id,
            name: c.name,
            membersCount: c.membersCount || c.totalMembers || 0,
            postsCount: c.postsCount || c.totalPosts || 0
        }));

    // Moderation & Audit counts
    const totalAuditLogsCount = modData?.totalAuditLogsCount ?? modData?.TotalAuditLogsCount ?? auditLogs.length;
    const pendingReportsCount = modData?.pendingReportsCount ?? modData?.PendingReportsCount ?? pendingReports.length;

    // Filtered data for active tab search
    const filteredCommunities = communitiesList.filter(c => 
        !searchQuery || 
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (c.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredAuditLogs = auditLogs.filter(l =>
        !searchQuery ||
        (l.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.actorFullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.details || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Dynamic Multi-Format Export Handler (100% Real Live Data)
    const handleExport = (type) => {
        let headers = [];
        let rows = [];
        const currentReport = reportsList.find(r => r.id === activeReport);
        let filename = `knome_${(currentReport?.name || activeReport).toLowerCase().replace(/\s+/g, '_')}_report`;

        if (activeReport === 'RPT-01') {
            headers = ['Metric', 'Live Value', 'Description'];
            rows = [
                ['Total Registered Employees', totalUsersCount.toLocaleString(), 'Total accounts registered in Knome DB'],
                ['Active Platform Users', activeUsersCount.toLocaleString(), 'Users currently active and enabled'],
                ['Suspended Accounts', suspendedUsersCount.toLocaleString(), 'Restricted or deactivated accounts'],
                ['Total Karma Points Distributed', `${totalKarmaDistributed.toLocaleString()} Points`, 'Total engagement karma recorded'],
                ['Average Karma per User', `${avgKarmaPoints.toLocaleString()} Points`, 'Average points per registered user'],
                ['Karma Tier: Bronze / Newbie (0-250)', `${newbiesCount} users (${newbiePct}%)`, 'Initial engagement tier'],
                ['Karma Tier: Silver / Contributor (250-1000)', `${contributorsCount} users (${contributorPct}%)`, 'Active participation tier'],
                ['Karma Tier: Gold / Expert (1000-5000)', `${expertsCount} users (${expertPct}%)`, 'Subject matter expert tier'],
                ['Karma Tier: Platinum / Legend (5000+)', `${legendsCount} users (${legendPct}%)`, 'Platform champions']
            ];
        } else if (activeReport === 'RPT-02') {
            headers = ['Community ID', 'Community Name', 'Category', 'Total Members', 'Access Level', 'Created Date'];
            rows = communitiesList.length > 0 
                ? communitiesList.map(c => [
                    c.communityId || c.id || 'N/A',
                    c.name || 'Unnamed Community',
                    c.category || 'General',
                    (c.membersCount || c.totalMembers || 0).toLocaleString(),
                    c.isPrivate ? 'Private' : 'Public',
                    c.createdDate ? new Date(c.createdDate).toLocaleDateString() : 'Active'
                ])
                : [['N/A', 'No communities found in database', 'N/A', '0', 'N/A', 'N/A']];
        } else if (activeReport === 'RPT-03') {
            headers = ['Content Category', 'Total Count in DB', 'Live Metric Details'];
            rows = [
                ['Feed Posts Published', totalPostsCount.toLocaleString(), `${totalPostsCount} posts published in database`],
                ['Knowledge Articles Published', totalArticlesCount.toLocaleString(), `${totalArticlesCount} long-form articles in database`],
                ['Video Modules & Recordings', totalVideosCount.toLocaleString(), `${totalVideoViewsCount.toLocaleString()} total playback views recorded`],
                ['Podcasts & Audio Streams', totalPodcastsCount.toLocaleString(), `${totalPodcastPlaysCount.toLocaleString()} total audio streams played`],
                ['Total Content Items Created', totalContentAll.toLocaleString(), 'Combined enterprise knowledge assets'],
                ['Total User Reactions (Likes/Hearts)', totalReactionsCount.toLocaleString(), 'Live reaction interaction count'],
                ['Total Discussion Comments', totalCommentsCount.toLocaleString(), 'Live comments across posts and articles']
            ];
        } else if (activeReport === 'RPT-04') {
            headers = ['Rank', 'Contributor Name', 'Department / Role', 'Karma Points'];
            rows = topContributorsList.length > 0 
                ? topContributorsList.map(u => [
                    `#${u.rank}`,
                    u.name,
                    u.role,
                    `${u.karma} Karma`
                ])
                : [['1', 'No karma records in database yet', 'N/A', '0 Karma']];
        } else if (activeReport === 'RPT-05') {
            headers = ['Log ID', 'Actor / Moderator', 'Action Taken', 'Timestamp', 'Target Details'];
            rows = auditLogs.length > 0 
                ? auditLogs.map(l => [
                    l.logId || l.id || 'N/A',
                    l.actorFullName || l.actorUserId || 'System Admin',
                    l.action || 'Logged Event',
                    l.timestamp ? new Date(l.timestamp).toLocaleString() : 'N/A',
                    l.details || l.entityName || 'Moderation Record'
                ])
                : [
                    ['Pending Reports', 'User Flags', `${pendingReports.length} Pending`, 'Current Status', 'Flags awaiting review'],
                    ['Suspended Users', 'HR Administration', `${suspendedUsersCount} Suspended`, 'Current Status', 'Accounts with restricted access']
                ];
        }

        if (type === 'csv') {
            const BOM = '\uFEFF';
            const csv = BOM + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${filename}_${Date.now()}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } else if (type === 'excel') {
            const excelXml = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
                <style>th { background-color: #2563eb; color: #ffffff; font-weight: bold; border: 0.5pt solid #cbd5e1; padding: 8px; } td { border: 0.5pt solid #cbd5e1; padding: 6px; }</style>
                </head><body><h2>Knome Enterprise Portal — ${activeReport} Report</h2><p>Export Date: ${new Date().toLocaleString()}</p><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>
            `;
            const blob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${filename}_${Date.now()}.xls`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        setIsExportOpen(false);
    };

    return (
        <main className="flex-1 bg-background dark:bg-surface p-margin-page overflow-x-hidden min-h-screen">
            {/* Hero Header */}
            <div className="relative rounded-2xl mb-8 shadow-sm border border-border-subtle dark:border-outline-variant bg-white dark:bg-charcoal-dark flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6 z-20">
                <div className="relative z-10 flex flex-col items-start max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-electric-blue/30 bg-blue-50 dark:bg-blue-900/30 text-electric-blue dark:text-blue-400 text-[11px] font-bold mb-3 uppercase tracking-wider">
                        ✨ Live Knome Enterprise Workforce Metrics
                    </div>
                    <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-on-surface dark:text-white" style={{ lineHeight: '1.2' }}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-blue via-teal-accent to-cyan-500">
                            Analytics & Reporting Portal
                        </span>
                    </h1>
                    <p className="text-slate-gray text-sm md:text-[15px] font-medium leading-relaxed max-w-2xl">
                        Real-time workforce intelligence reflecting user activity, karma recognition, community memberships, and content engagement across MPOnline.
                    </p>
                </div>
                
                {/* Header Control Buttons */}
                <div className="relative z-10 shrink-0 flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
                    <button
                        onClick={() => {
                            setEditingBroadcast(activeBroadcasts[0] || null);
                            setIsBroadcastModalOpen(true);
                        }}
                        className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 text-sm cursor-pointer"
                        title="Send or edit organization broadcast announcement"
                    >
                        <span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>campaign</span>
                        <span>{activeBroadcasts.length > 0 ? 'Manage Broadcast' : 'Send Broadcast'}</span>
                    </button>

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full sm:w-auto px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                        title="Reload Live Analytics Data"
                    >
                        <span className={`material-symbols-outlined text-[20px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>

                    <div className="relative w-full sm:w-auto">
                        <button 
                            onClick={() => setIsExportOpen(!isExportOpen)}
                            className="w-full sm:w-auto px-6 py-3 bg-electric-blue text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">table_view</span>
                            Export Report
                            <span className="material-symbols-outlined text-[16px]">expand_more</span>
                        </button>

                        {isExportOpen && (
                            <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden py-1 animate-in fade-in zoom-in duration-150">
                                <button onClick={() => handleExport('csv')} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined text-green-600 text-[18px]">csv</span> Export as CSV (.csv)
                                </button>
                                <button onClick={() => handleExport('excel')} className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined text-emerald-600 text-[18px]">table_view</span> Export as Excel (.xls)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Active Organization Broadcast Notice (If Any) */}
            {activeBroadcasts && activeBroadcasts.length > 0 && activeBroadcasts[0] && (
                <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/5 border border-amber-500/30 flex items-start justify-between gap-4 shadow-xs animate-in fade-in duration-300">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <span className="material-symbols-outlined text-[22px]" style={{fontVariationSettings: "'FILL' 1"}}>campaign</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-md">
                                    Live HR Broadcast
                                </span>
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                    • Active on all employee dashboards
                                </span>
                            </div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white leading-snug">
                                {activeBroadcasts[0].title || activeBroadcasts[0].message}
                            </h4>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed">
                                {activeBroadcasts[0].content || activeBroadcasts[0].details || activeBroadcasts[0].message}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => {
                                setEditingBroadcast(activeBroadcasts[0]);
                                setIsBroadcastModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                            <span>Edit Message</span>
                        </button>
                        <button
                            onClick={async () => {
                                const target = activeBroadcasts[0];
                                const targetId = target?.id || target?.Id || target?.notificationId;
                                if (!targetId) return;

                                setActiveBroadcasts(prev => prev.filter(a => (a.id || a.Id || a.notificationId) !== targetId));

                                try {
                                    await notificationsApi.broadcasts.delete(targetId);
                                    window.dispatchEvent(new CustomEvent('knome:broadcast-updated'));
                                    loadBroadcasts();
                                } catch (e) {
                                    console.error('Failed to remove broadcast:', e);
                                    loadBroadcasts();
                                }
                            }}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                            title="Remove Broadcast"
                        >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 5 Report Selector Tabs (RPT-01 to RPT-05) */}
            <div className="flex border-b border-border-subtle dark:border-outline-variant mb-stack-lg overflow-x-auto no-scrollbar gap-2">
                {reportsList.map(rpt => (
                    <button
                        key={rpt.id}
                        onClick={() => { setActiveReport(rpt.id); setSearchQuery(''); }}
                        className={`px-5 py-3.5 border-b-2 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                            activeReport === rpt.id 
                                ? 'border-electric-blue text-electric-blue bg-blue-50/50 dark:bg-blue-900/20 rounded-t-xl' 
                                : 'border-transparent text-slate-gray hover:text-electric-blue'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {rpt.icon}
                        </span>
                        {rpt.name}
                    </button>
                ))}
            </div>

            {/* Table Search Bar for active report */}
            {['RPT-02', 'RPT-05'].includes(activeReport) && (
                <div className="mb-6 max-w-md">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder={activeReport === 'RPT-02' ? "Search communities by name or category..." : "Search audit logs by actor, action, or details..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-electric-blue"
                        />
                    </div>
                </div>
            )}

            {/* Loading Spinner Indicator */}
            {loading && (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                    <div className="w-10 h-10 border-4 border-electric-blue border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-xs font-semibold">Syncing live analytics metrics from Knome platform...</p>
                </div>
            )}

            {/* REPORT VIEW RENDERER */}
            {!loading && (
                <>
                    {/* RPT-01: USER ENGAGEMENT */}
                    {activeReport === 'RPT-01' && (
                        <div className="space-y-stack-lg animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg text-emerald-600"><span className="material-symbols-outlined">group</span></div>
                                        <span className="text-emerald-500 text-xs font-bold flex items-center">Active</span>
                                    </div>
                                    <p className="text-slate-gray text-xs mb-1">Active Platform Users</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{activeUsersCount.toLocaleString()}</h2>
                                    <p className="text-slate-400 text-[11px] mt-1">Enabled workforce accounts</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-rose-50 dark:bg-rose-900/30 rounded-lg text-rose-600"><span className="material-symbols-outlined">block</span></div>
                                        <span className="text-rose-500 text-xs font-bold flex items-center">Suspended</span>
                                    </div>
                                    <p className="text-slate-gray text-xs mb-1">Suspended Users</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{suspendedUsersCount.toLocaleString()}</h2>
                                    <p className="text-slate-400 text-[11px] mt-1">Restricted governance status</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-purple-600"><span className="material-symbols-outlined">badge</span></div>
                                        <span className="text-indigo-500 text-xs font-bold flex items-center">Registered</span>
                                    </div>
                                    <p className="text-slate-gray text-xs mb-1">Total Registered Users</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalUsersCount.toLocaleString()}</h2>
                                    <p className="text-slate-400 text-[11px] mt-1">Workforce directory roster</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-amber-500"><span className="material-symbols-outlined">workspace_premium</span></div>
                                        <span className="text-amber-500 text-xs font-bold flex items-center">Karma</span>
                                    </div>
                                    <p className="text-slate-gray text-xs mb-1">Total Karma Points</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalKarmaDistributed.toLocaleString()} <span className="text-xs font-normal text-slate-400">Pts</span></h2>
                                    <p className="text-slate-400 text-[11px] mt-1">{avgKarmaPoints.toLocaleString()} avg points per user</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-lg text-teal-accent"><span className="material-symbols-outlined">analytics</span></div>
                                        <span className="text-teal-accent text-xs font-bold flex items-center">Content</span>
                                    </div>
                                    <p className="text-slate-gray text-xs mb-1">Total Knowledge Items</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalContentAll.toLocaleString()}</h2>
                                    <p className="text-slate-400 text-[11px] mt-1">Posts, Articles, Videos, Podcasts</p>
                                </div>
                            </div>

                            {/* Visual Charts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
                                <div className="glass-card p-stack-lg rounded-xl card-shadow">
                                    <h3 className="font-bold text-slate-900 dark:text-white mb-4">Karma Level Tier Distribution</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-xs font-bold mb-1"><span>Bronze / Newbie (0 - 250 Karma)</span><span>{newbiePct}% ({newbiesCount} users)</span></div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3"><div className="bg-slate-400 h-3 rounded-full" style={{width: `${Math.max(newbiePct, newbiesCount > 0 ? 5 : 0)}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-xs font-bold mb-1"><span>Silver / Contributor (250 - 1,000 Karma)</span><span>{contributorPct}% ({contributorsCount} users)</span></div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3"><div className="bg-blue-500 h-3 rounded-full" style={{width: `${Math.max(contributorPct, contributorsCount > 0 ? 5 : 0)}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-xs font-bold mb-1"><span>Gold / Expert (1,000 - 5,000 Karma)</span><span>{expertPct}% ({expertsCount} users)</span></div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3"><div className="bg-teal-500 h-3 rounded-full" style={{width: `${Math.max(expertPct, expertsCount > 0 ? 5 : 0)}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-xs font-bold mb-1"><span>Platinum / Legend (5,000+ Karma)</span><span>{legendPct}% ({legendsCount} users)</span></div>
                                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3"><div className="bg-amber-500 h-3 rounded-full" style={{width: `${Math.max(legendPct, legendsCount > 0 ? 5 : 0)}%`}}></div></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-card p-stack-lg rounded-xl card-shadow">
                                    <h3 className="font-bold text-slate-900 dark:text-white mb-4">Enterprise Account Status</h3>
                                    <div className="space-y-4 pt-2">
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Active Accounts</p>
                                                    <p className="text-[11px] text-slate-500">Enabled for platform access</p>
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-emerald-600">{activeUsersCount}</span>
                                        </div>

                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
                                                    <span className="material-symbols-outlined text-[20px]">block</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Suspended / Deactivated</p>
                                                    <p className="text-[11px] text-slate-500">Restricted governance status</p>
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-rose-600">{suspendedUsersCount}</span>
                                        </div>

                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                                                    <span className="material-symbols-outlined text-[20px]">flag</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Pending Moderation Flags</p>
                                                    <p className="text-[11px] text-slate-500">Reported content awaiting action</p>
                                                </div>
                                            </div>
                                            <span className="text-lg font-black text-indigo-600">{pendingReports.length}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RPT-02: COMMUNITY HEALTH */}
                    {activeReport === 'RPT-02' && (
                        <div className="space-y-stack-lg animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Total Active Communities</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalCommunitiesCount.toLocaleString()}</h2>
                                    <p className="text-electric-blue text-[11px] mt-1 font-bold">Live on platform</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Total Community Memberships</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalMembersInCommunities.toLocaleString()}</h2>
                                    <p className="text-teal-accent text-[11px] mt-1 font-bold">Active user joins</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Avg Members / Community</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{avgMembersPerComm}</h2>
                                    <p className="text-slate-400 text-[11px] mt-1">Average membership size</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Posts in Communities</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalPostsCount.toLocaleString()}</h2>
                                    <p className="text-indigo-500 text-[11px] mt-1 font-bold">Shared community feed items</p>
                                </div>
                            </div>

                            {/* Community Breakdown Table */}
                            <div className="glass-card rounded-xl card-shadow overflow-hidden">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white flex justify-between items-center">
                                    <span>Community Health Breakdown ({filteredCommunities.length} Total)</span>
                                    {searchQuery && <span className="text-xs text-electric-blue">Filtering by: "{searchQuery}"</span>}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[12px] font-bold text-slate-500 uppercase">
                                            <tr>
                                                <th className="p-4">Community Name</th>
                                                <th className="p-4">Category</th>
                                                <th className="p-4">Total Members</th>
                                                <th className="p-4">Access Level</th>
                                                <th className="p-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                            {filteredCommunities.length > 0 ? (
                                                filteredCommunities.map((c, i) => (
                                                    <tr key={c.communityId || c.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="p-4 font-bold text-electric-blue">
                                                            <HighlightText text={c.name} query={searchQuery} />
                                                        </td>
                                                        <td className="p-4 font-medium text-slate-600 dark:text-slate-300">
                                                            <HighlightText text={c.category || 'General'} query={searchQuery} />
                                                        </td>
                                                        <td className="p-4 font-semibold">{(c.membersCount || c.totalMembers || 0).toLocaleString()}</td>
                                                        <td className="p-4"><span className={`px-2 py-0.5 rounded font-bold text-[11px] ${c.isPrivate ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'}`}>{c.isPrivate ? 'Private' : 'Public'}</span></td>
                                                        <td className="p-4"><span className="px-2 py-1 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 font-bold">Active</span></td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="5" className="p-6 text-center text-slate-400">No communities found matching the criteria.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RPT-03: CONTENT PERFORMANCE */}
                    {activeReport === 'RPT-03' && (
                        <div className="space-y-stack-lg animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Posts Created</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalPostsCount.toLocaleString()}</h2>
                                    <p className="text-electric-blue text-[11px] mt-1 font-bold">Feed updates & discussions</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Articles Published</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalArticlesCount.toLocaleString()}</h2>
                                    <p className="text-blue-500 text-[11px] mt-1 font-bold">Long-form publications</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Video Modules</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalVideosCount.toLocaleString()}</h2>
                                    <p className="text-red-500 text-[11px] mt-1 font-bold">{totalVideoViewsCount.toLocaleString()} playback views</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Podcasts & Audio</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalPodcastsCount.toLocaleString()}</h2>
                                    <p className="text-purple-500 text-[11px] mt-1 font-bold">{totalPodcastPlaysCount.toLocaleString()} audio streams</p>
                                </div>
                            </div>

                            {/* Engagement Totals */}
                            <div className="glass-card p-stack-lg rounded-xl card-shadow">
                                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Content Interactions Breakdown</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40">
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-rose-500 bg-rose-50 dark:bg-rose-900/30">
                                            <span className="material-symbols-outlined text-[24px]">favorite</span>
                                        </div>
                                        <div>
                                            <h4 className="text-xs text-slate-500 font-bold">Total Reactions</h4>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white">{totalReactionsCount.toLocaleString()}</p>
                                            <p className="text-[11px] text-slate-400">Likes and applause across content</p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40">
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-blue-500 bg-blue-50 dark:bg-blue-900/30">
                                            <span className="material-symbols-outlined text-[24px]">forum</span>
                                        </div>
                                        <div>
                                            <h4 className="text-xs text-slate-500 font-bold">Total Comments</h4>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white">{totalCommentsCount.toLocaleString()}</p>
                                            <p className="text-[11px] text-slate-400">Collaborative threads & discussions</p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40">
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30">
                                            <span className="material-symbols-outlined text-[24px]">library_books</span>
                                        </div>
                                        <div>
                                            <h4 className="text-xs text-slate-500 font-bold">Combined Knowledge Assets</h4>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white">{totalContentAll.toLocaleString()}</p>
                                            <p className="text-[11px] text-slate-400">All published items</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RPT-04: TRENDING CONTENT */}
                    {activeReport === 'RPT-04' && (
                        <div className="space-y-stack-lg animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
                                {/* Top Contributors */}
                                <div className="glass-card rounded-xl card-shadow overflow-hidden">
                                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white flex items-center justify-between">
                                        <span>🏆 Top Contributors (Karma Leaderboard)</span>
                                        <span className="text-xs text-slate-400">Live Platform Ranks</span>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {topContributorsList.length > 0 ? (
                                            topContributorsList.map((u) => (
                                                <div key={u.rank} className="p-3.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${u.rank === 1 ? 'bg-amber-100 text-amber-700' : u.rank === 2 ? 'bg-slate-200 text-slate-700' : u.rank === 3 ? 'bg-orange-100 text-orange-700' : 'text-slate-400'}`}>
                                                            {u.rank}
                                                        </span>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900 dark:text-white">{u.name}</p>
                                                            <p className="text-[11px] text-slate-400">{u.role}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-black text-amber-500">{u.karma} Karma</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-6 text-center text-slate-400 text-xs">No karma records found.</div>
                                        )}
                                    </div>
                                </div>

                                {/* Top Communities */}
                                <div className="glass-card rounded-xl card-shadow overflow-hidden">
                                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white flex items-center justify-between">
                                        <span>🔥 Top Communities (by Members & Posts)</span>
                                        <span className="text-xs text-slate-400">Live Platform Rank</span>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {topCommunitiesList.length > 0 ? (
                                            topCommunitiesList.map((c, idx) => (
                                                <div key={c.communityId || idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-slate-400">{idx + 1}</span>
                                                        <div>
                                                            <p className="text-xs font-bold text-electric-blue">{c.name}</p>
                                                            <p className="text-[11px] text-slate-400">{(c.membersCount || c.totalMembers || 0).toLocaleString()} Members • {c.postsCount || 0} Posts</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">Active</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-6 text-center text-slate-400 text-xs">No community records found.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RPT-05: MODERATION AUDIT */}
                    {activeReport === 'RPT-05' && (
                        <div className="space-y-stack-lg animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Pending Reports</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{pendingReportsCount}</h2>
                                    <p className="text-amber-500 text-[11px] mt-1 font-bold">Content awaiting moderation</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Suspended Accounts</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{suspendedUsersCount}</h2>
                                    <p className="text-rose-600 text-[11px] mt-1 font-bold">Restricted workforce users</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Total Audit Logs</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalAuditLogsCount}</h2>
                                    <p className="text-electric-blue text-[11px] mt-1 font-bold">Security & governance events</p>
                                </div>
                                <div className="glass-card p-stack-md rounded-xl card-shadow">
                                    <p className="text-slate-gray text-xs mb-1">Active Communities</p>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{totalCommunitiesCount}</h2>
                                    <p className="text-emerald-600 text-[11px] mt-1 font-bold">Monitored groups</p>
                                </div>
                            </div>

                            {/* Moderator Actions Audit Log */}
                            <div className="glass-card rounded-xl card-shadow overflow-hidden">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-slate-900 dark:text-white flex items-center justify-between">
                                    <span>🛡️ Security & Moderator Actions Audit Log</span>
                                    <span className="text-xs text-slate-400">{filteredAuditLogs.length} Records</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[12px] font-bold text-slate-500 uppercase">
                                            <tr>
                                                <th className="p-4">Timestamp</th>
                                                <th className="p-4">Actor / User</th>
                                                <th className="p-4">Action Taken</th>
                                                <th className="p-4">Target Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                            {filteredAuditLogs.length > 0 ? (
                                                filteredAuditLogs.map((log, i) => (
                                                    <tr key={log.logId || log.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="p-4 text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recent'}</td>
                                                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                                                            <HighlightText text={log.actorFullName || log.actorUserId || 'System Admin'} query={searchQuery} />
                                                        </td>
                                                        <td className="p-4 font-semibold text-electric-blue">
                                                            <HighlightText text={log.action} query={searchQuery} />
                                                        </td>
                                                        <td className="p-4 text-slate-600 dark:text-slate-300">
                                                            <HighlightText text={log.details || log.entityName || 'Audit Event'} query={searchQuery} />
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="4" className="p-6 text-center text-slate-400">No moderator audit logs found.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            <BroadcastModal
                isOpen={isBroadcastModalOpen}
                onClose={() => {
                    setIsBroadcastModalOpen(false);
                    setEditingBroadcast(null);
                }}
                initialData={editingBroadcast}
                onSuccess={() => loadBroadcasts()}
            />
        </main>
    );
}
