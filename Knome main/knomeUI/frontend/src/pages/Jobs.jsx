import React, { useState, useEffect } from 'react';
import { jobsApi } from '../utils/apiService';
import { useScrollLoading } from '../hooks/useScrollLoading';
import ScrollLoadingIndicator from '../components/ui/ScrollLoadingIndicator';

export default function Jobs() {
    const [activeFilter, setActiveFilter] = useState('All Roles');
    const [jobs, setJobs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const filters = ['All Roles', 'Engineering', 'Product & Design', 'Marketing', 'Product'];

const normalizeJobUrl = (url) => {
    if (!url || typeof url !== 'string') return 'https://counselling-1.mponline.demo.gov.in:3001/careers';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    if (trimmed.startsWith('/')) {
        return `https://counselling-1.mponline.demo.gov.in:3001${trimmed}`;
    }
    return `https://${trimmed}`;
};

    const fetchJobsFromDb = async () => {
        setIsLoading(true);
        try {
            // 1. First priority: Live HRMS Server Jobs API
            let jobList = await jobsApi.getLiveServerJobs();

            // 2. Fall back to local Knome database if live API returns empty
            if (!jobList || jobList.length === 0) {
                const data = await jobsApi.getAll();
                jobList = Array.isArray(data) ? data : (data?.items || []);
            }

            if (jobList && jobList.length > 0) {
                const mapped = jobList.map((j, idx) => {
                    const rawSkills = j.requiredSkills || j.skillsRequired || j.requirements || '';
                    const skillsList = Array.isArray(rawSkills)
                        ? rawSkills
                        : (typeof rawSkills === 'string' && rawSkills.trim()
                            ? rawSkills.split(',').map(s => s.trim()).filter(Boolean)
                            : []);

                    return {
                        id: j.jobId || j.id || `job-${idx}`,
                        title: j.jobName || j.title || 'Software Developer',
                        department: j.departmentName || j.department || 'Engineering',
                        team: j.departmentName || 'Engineering Team',
                        location: (j.location && j.location.trim()) ? j.location.trim() : 'Bhopal, MP',
                        experience: j.experience || null,
                        employmentType: j.employmentType || null,
                        positionCount: j.postionCount || j.positionCount || null,
                        posted: (j.postedDate || j.createdDate) ? new Date(j.postedDate || j.createdDate).toLocaleDateString() : 'Active',
                        closes: j.closingDate ? new Date(j.closingDate).toLocaleDateString() : (j.expiryDate ? new Date(j.expiryDate).toLocaleDateString() : 'Dec 31, 2026'),
                        skills: skillsList.length > 0 ? skillsList : ['React', 'Node.js', 'Express'],
                        isFeatured: j.isFeatured || false,
                        isExpired: j.isExpired || false,
                        link: normalizeJobUrl(j.url || j.applicationLink || j.applicationUrl)
                    };
                });
                setJobs(mapped);
            } else {
                // Fallback default set if database is empty initially
                setJobs(defaultJobs);
            }
        } catch (err) {
            console.warn('Could not fetch jobs from API, showing default database list:', err);
            setJobs(defaultJobs);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchJobsFromDb();
    }, []);

    const defaultJobs = [
        {
            id: 1,
            title: 'Senior Principal Product Designer',
            department: 'Product & Design',
            team: 'Product Experience',
            location: 'Remote / NYC',
            posted: '2 days ago',
            closes: 'Oct 30, 2026',
            skills: ['Design Systems', 'Strategy', 'Figma'],
            isFeatured: true,
            isExpired: false,
            link: 'https://workday.example.com/apply/1'
        },
        {
            id: 2,
            title: 'Full Stack Engineer (.NET Core & React)',
            department: 'Engineering',
            team: 'Infrastructure & DevTools',
            location: 'Bhopal, MP (Hybrid)',
            posted: '4 days ago',
            closes: 'Nov 15, 2026',
            skills: ['React', 'ASP.NET Core', 'SQL Server', 'YARP'],
            isFeatured: false,
            isExpired: false,
            link: 'https://workday.example.com/apply/2'
        },
        {
            id: 3,
            title: 'Product Marketing Manager',
            department: 'Marketing',
            team: 'Growth & Acquisition',
            location: 'Bhopal, MP',
            posted: '1 week ago',
            closes: 'Nov 05, 2026',
            skills: ['Go-to-Market', 'Analytics', 'Copywriting'],
            isFeatured: false,
            isExpired: false,
            link: 'https://workday.example.com/apply/3'
        }
    ];

    const displayedJobs = jobs.filter(job => activeFilter === 'All Roles' || job.department === activeFilter);

    const { visibleCount, reset: resetScrollLoading } = useScrollLoading(displayedJobs.length, 6, 6);

    useEffect(() => {
        resetScrollLoading();
    }, [activeFilter, resetScrollLoading]);

    return (
        <>
            <main className="flex-1 flex flex-col gap-8 pb-6">
                
                {/* Hero Header */}
                <div className="relative rounded-2xl overflow-hidden mb-8 shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row items-start md:items-center justify-between text-left px-6 py-8 md:px-10 md:py-8 gap-6">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_var(--tw-gradient-stops))] from-teal-100/50 dark:from-teal-900/20 via-transparent to-transparent pointer-events-none"></div>
                    <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-32 bg-teal-400/10 dark:bg-teal-500/10 blur-[80px] pointer-events-none"></div>
                    
                    <div className="relative z-10 flex flex-col items-start max-w-3xl">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-[11px] font-bold mb-3 backdrop-blur-md uppercase tracking-wider">
                            ✨ Empowering MPOnline Teams
                        </div>
                        
                        <h1 className="text-3xl md:text-4xl lg:text-[40px] font-black tracking-tight mb-3 text-slate-900 dark:text-white" style={{ lineHeight: '1.2' }}>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 dark:from-teal-400 dark:via-emerald-400 dark:to-green-400">
                                Discover Internal Opportunities
                            </span>
                        </h1>
                        
                        <p className="text-slate-600 dark:text-slate-400 text-sm font-normal max-w-xl">
                            Explore cross-department openings, internal transfers, and career advancement roles across MPOnline.
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
                    {filters.map(filter => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                activeFilter === filter
                                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* Jobs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading ? (
                        <div className="col-span-full py-12 text-center text-slate-400 font-medium text-sm">
                            Loading opportunities...
                        </div>
                    ) : displayedJobs.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-slate-400 font-medium text-sm">
                            No jobs found for the selected filter.
                        </div>
                    ) : (
                        <>
                            {displayedJobs.slice(0, visibleCount).map(job => (
                                <div key={job.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500/50 transition-all shadow-sm group">
                                    <div>
                                        <div className="flex items-start justify-between gap-4 mb-4">
                                            <div>
                                                <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 mb-2">
                                                    {job.department}
                                                </span>
                                                <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-teal-500 transition-colors">
                                                    {job.title}
                                                </h3>
                                            </div>
                                            {job.isFeatured && (
                                                <span className="material-symbols-outlined text-amber-500 text-[20px]" title="Featured Role">star</span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                {job.location}
                                            </span>
                                            {job.experience && (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                                                        <span className="material-symbols-outlined text-[14px]">work_history</span>
                                                        {job.experience}
                                                    </span>
                                                </>
                                            )}
                                            {job.employmentType && (
                                                <>
                                                    <span>•</span>
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
                                                        {job.employmentType}
                                                    </span>
                                                </>
                                            )}
                                            {job.positionCount && (
                                                <>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                                                        <span className="material-symbols-outlined text-[14px]">group</span>
                                                        {job.positionCount} {job.positionCount === 1 ? 'Opening' : 'Openings'}
                                                    </span>
                                                </>
                                            )}
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                                {job.posted}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 mb-6">
                                            {job.skills.map(skill => (
                                                <span key={skill} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <span className="text-[11px] text-slate-400 font-medium">Closes {job.closes}</span>
                                        <a 
                                            href={job.link} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (job.link) {
                                                    window.open(job.link, '_blank', 'noopener,noreferrer');
                                                    e.preventDefault();
                                                }
                                            }}
                                            className="px-4 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-bold text-xs hover:bg-teal-500 hover:text-white transition-all flex items-center gap-1 cursor-pointer">
                                            Apply Now
                                            <span className="material-symbols-outlined text-[14px]">north_east</span>
                                        </a>
                                    </div>
                                </div>
                            ))}
                            <ScrollLoadingIndicator isVisible={visibleCount < displayedJobs.length} text="Loading more opportunities on scroll..." />
                        </>
                    )}
                </div>

            </main>
        </>
    );
}
