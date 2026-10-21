import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HotPostsWidget() {
    const navigate = useNavigate();
    const [timeWindow, setTimeWindow] = useState('Daily');

    // Static hot post matching the screenshot exactly
    const staticHotPost = {
        id: 'dot-net-exploration',
        title: '🚀 Exploring the Power of .NET De...',
        author: 'Vilash Deshmukh',
        score: 0,
        isRecent: true
    };

    const handlePostClick = () => {
        navigate('/posts');
    };

    return (
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            {/* Accent Orb */}
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #f97316, transparent 70%)' }}></div>
            
            <div className="flex items-center justify-between mb-5 relative">
                <h3 className="text-base font-black flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-orange-400 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                    Hot Posts
                </h3>
                
                <div className="flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(2,132,199,0.1)', border: '1px solid rgba(2,132,199,0.2)', color: '#0284C7' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]"></span>
                    Live Updates
                </div>
            </div>

            {/* Time Window Toggle (FR-HP-02) */}
            <div className="flex p-1 rounded-xl mb-5 gap-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                {['Daily', 'Weekly', 'Monthly'].map(window => (
                    <button
                        key={window}
                        onClick={() => setTimeWindow(window)}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${
                            timeWindow === window
                                ? 'bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-[#2563EB] shadow-xs'
                                : 'text-slate-500 dark:text-slate-400 border border-transparent hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        style={timeWindow === window ? {
                            background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(14,165,233,0.1))',
                            border: '1px solid rgba(37,99,235,0.25)',
                            color: '#2563EB',
                            boxShadow: '0 2px 8px rgba(37,99,235,0.1)'
                        } : {}}
                    >
                        {window}
                    </button>
                ))}
            </div>

            {/* Static Post Card matching screenshot */}
            <div className="flex flex-col gap-4">
                <div 
                    onClick={handlePostClick}
                    className="flex gap-3 group cursor-pointer p-2 rounded-xl transition-all hover:bg-blue-500/5 active:scale-[0.98]"
                >
                    <div className="text-xl font-extrabold w-5 shrink-0 leading-none mt-0.5 text-[#0284C7]">
                        1
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded text-[9px] font-black uppercase tracking-wider shrink-0 shadow-sm">
                                NEW
                            </span>
                            <h4 className="text-[13px] font-bold leading-relaxed truncate group-hover:text-[#2563EB] transition-colors text-slate-900 dark:text-white">
                                {staticHotPost.title}
                            </h4>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate pr-2">
                                {staticHotPost.author}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0"
                                style={{ background: 'rgba(2,132,199,0.1)', color: '#0284C7', border: '1px solid rgba(2,132,199,0.2)' }}>
                                <span className="material-symbols-outlined text-[12px]">trending_up</span>
                                {staticHotPost.score}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
