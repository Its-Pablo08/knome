import React from 'react';
import mponlineLogo from '../../assets/mponline_logo.png';

export default function Footer() {
    return (
        <footer className="relative w-full mt-auto bg-[#040d21] text-slate-100 font-['Inter',-apple-system,BlinkMacSystemFont,sans-serif] border-t border-slate-800/80 shadow-2xl antialiased">
            <div className="relative w-full max-w-[1780px] mx-auto px-6 sm:px-8 md:px-12 py-3.5 sm:py-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-slate-300">
                    
                    {/* Left: Copyright */}
                    <div className="text-xs sm:text-sm font-medium text-center md:text-left text-slate-300">
                        © 2026 MPOnline Limited. All rights reserved.
                    </div>

                    {/* Center: Social Media Icons */}
                    <div className="flex items-center gap-2.5">
                        <a 
                            href="https://facebook.com/mponlinelimited" 
                            target="_blank" 
                            rel="noreferrer" 
                            title="Facebook" 
                            aria-label="Facebook"
                            className="w-8 h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:bg-blue-600 hover:border-blue-500 hover:text-white flex items-center justify-center text-slate-200 transition-all text-xs shadow-sm cursor-pointer"
                        >
                            <span className="font-bold leading-none text-sm">f</span>
                        </a>
                        <a 
                            href="https://instagram.com/mponlinelimited" 
                            target="_blank" 
                            rel="noreferrer" 
                            title="Instagram" 
                            aria-label="Instagram"
                            className="w-8 h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:bg-pink-600 hover:border-pink-500 hover:text-white flex items-center justify-center text-slate-200 transition-all shadow-sm cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px] leading-none">photo_camera</span>
                        </a>
                        <a 
                            href="https://youtube.com/@mponlinelimited" 
                            target="_blank" 
                            rel="noreferrer" 
                            title="YouTube" 
                            aria-label="YouTube"
                            className="w-8 h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:bg-red-600 hover:border-red-500 hover:text-white flex items-center justify-center text-slate-200 transition-all shadow-sm cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[17px] leading-none">play_arrow</span>
                        </a>
                        <a 
                            href="https://linkedin.com/company/mponlinelimited" 
                            target="_blank" 
                            rel="noreferrer" 
                            title="LinkedIn" 
                            aria-label="LinkedIn"
                            className="w-8 h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:bg-blue-700 hover:border-blue-600 hover:text-white flex items-center justify-center text-slate-200 transition-all text-xs shadow-sm cursor-pointer"
                        >
                            <span className="font-bold leading-none text-xs">in</span>
                        </a>
                        <a 
                            href="https://x.com/mponlinelimited" 
                            target="_blank" 
                            rel="noreferrer" 
                            title="X (Twitter)" 
                            aria-label="X (Twitter)"
                            className="w-8 h-8 rounded-full bg-slate-900/90 border border-slate-700/80 hover:bg-slate-800 hover:border-slate-500 hover:text-white flex items-center justify-center text-slate-200 transition-all text-xs shadow-sm cursor-pointer"
                        >
                            <span className="font-bold leading-none text-xs">𝕏</span>
                        </a>
                    </div>

                    {/* Right: Powered by & Logo */}
                    <div className="flex items-center gap-2.5 text-xs sm:text-sm shrink-0">
                        <span className="text-slate-300 font-medium">Powered by</span>
                        <a 
                            href="https://www.mponline.gov.in/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            aria-label="Visit official MPOnline website" 
                            title="MPOnline Limited"
                            className="bg-white rounded px-2.5 py-0.5 shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center"
                        >
                            <img 
                                src={mponlineLogo} 
                                alt="MPOnline Limited" 
                                className="h-5 sm:h-5.5 max-h-[22px] w-auto object-contain block" 
                            />
                        </a>
                    </div>

                </div>
            </div>
        </footer>
    );
}
