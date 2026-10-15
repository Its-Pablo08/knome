import React, { useRef, useEffect } from 'react';
import { useAudio } from '../contexts/AudioContext';
import { useSystemConfig } from '../../utils/systemConfig';

export default function GlobalAudioPlayer() {
    const { isPodcastsEnabled } = useSystemConfig();
    const audioCtx = useAudio() || {};
    const { 
        currentPodcast, isPlaying, volume, speed, progress, 
        currentTime, duration, togglePlay, closePlayer, 
        setVolume, setSpeed, handleSeek, skipTime, toggleMute 
    } = audioCtx;

    const progressRef = useRef(null);

    useEffect(() => {
        if (!isPodcastsEnabled && currentPodcast && closePlayer) {
            closePlayer();
        }
    }, [isPodcastsEnabled, currentPodcast, closePlayer]);

    if (!currentPodcast || !isPodcastsEnabled) return null;

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const onProgressClick = (e) => {
        if (!progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = (clickX / rect.width) * 100;
        handleSeek(percentage);
    };

    return (
        <div className="fixed bottom-0 left-0 w-full z-[150] animate-in slide-in-from-bottom-20 duration-500">
            {/* Progress bar container at very top of player */}
            <div 
                ref={progressRef}
                onClick={onProgressClick}
                className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 cursor-pointer group"
            >
                <div 
                    className="h-full bg-pink-500 relative group-hover:bg-pink-400 transition-colors"
                    style={{ width: `${progress}%` }}
                >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-4 md:px-8 py-3 flex items-center justify-between gap-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                
                {/* Left: Podcast Info */}
                <div className="flex items-center gap-4 w-1/3 min-w-[200px]">
                    <img 
                        src={currentPodcast.thumbnail || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80'} 
                        alt="Podcast Cover" 
                        onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80'; }}
                        className="w-14 h-14 rounded-lg object-cover shadow-sm bg-slate-100 dark:bg-slate-800"
                    />
                    <div className="overflow-hidden">
                        <h4 className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{currentPodcast.title}</h4>
                        <p className="text-[12px] font-medium text-slate-500 truncate">{currentPodcast.series || currentPodcast.category}</p>
                    </div>
                </div>

                {/* Center: Playback Controls */}
                <div className="flex flex-col items-center flex-1 max-w-lg">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => skipTime && skipTime(-10)} 
                            title="Rewind 10 seconds"
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[24px]">replay_10</span>
                        </button>
                        
                        <button 
                            onClick={togglePlay}
                            className="w-12 h-12 bg-pink-500 hover:bg-pink-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-pink-500/30 transition-transform active:scale-95 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[28px]">{isPlaying ? 'pause' : 'play_arrow'}</span>
                        </button>
                        
                        <button 
                            onClick={() => skipTime && skipTime(10)} 
                            title="Forward 10 seconds"
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[24px]">forward_10</span>
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-bold text-slate-500 w-full">
                        <span>{formatTime(currentTime)}</span>
                        <div className="flex-1"></div> {/* Spacer, visual progress is at top of bar */}
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Right: Utility Controls (Volume, Speed, Close) */}
                <div className="flex items-center justify-end gap-6 w-1/3 min-w-[200px]">
                    
                    {/* Playback Speed (FR-PD-04) */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                        {[0.5, 1, 1.5, 2].map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${speed === s ? 'bg-white dark:bg-slate-700 text-pink-500 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>

                    {/* Volume Control */}
                    <div className="hidden md:flex items-center gap-2 group">
                        <button onClick={() => toggleMute && toggleMute()} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                            <span className="material-symbols-outlined text-[20px]">
                                {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                            </span>
                        </button>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-pink-500"
                        />
                    </div>

                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-800"></div>

                    <button onClick={closePlayer} className="text-slate-400 hover:text-red-500 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
