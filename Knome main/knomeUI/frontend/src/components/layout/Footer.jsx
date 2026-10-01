import React from 'react';
import { Link } from 'react-router-dom';
import knomeLogoDark from '../../assets/knome_logo_dark.png';
import mponlineLogo from '../../assets/mponline_logo.png';

export default function Footer() {
    return (
        <footer className="relative w-full mt-0 bg-[#070c1b]/98 backdrop-blur-md text-slate-200 font-sans border-t border-slate-800/80 shadow-2xl">
            
            {/* Top Gradient Accent Line */}
            <div className="w-full h-[2px] bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-600"></div>

            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 md:py-3">
                
                {/* Main Top Row: Left Brand & Right Support */}
                <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
                    
                    {/* Left: Brand Logo, Tagline & Social Links */}
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 shrink-0">
                        <Link to="/" className="flex items-center gap-2 transition-transform hover:scale-[1.02]">
                            <img 
                                src={knomeLogoDark} 
                                alt="KNOME" 
                                className="h-8 md:h-9 w-auto object-contain drop-shadow-xs" 
                            />
                        </Link>

                        <span className="hidden sm:inline-block w-px h-3.5 bg-slate-700/80"></span>
                        
                        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline tracking-wide">
                            Connecting People & Knowledge
                        </span>

                        {/* Social Links */}
                        <div className="flex items-center gap-1.5 ml-1">
                            <a href="https://facebook.com/mponlinelimited" target="_blank" rel="noreferrer" title="Facebook" className="w-5.5 h-5.5 rounded-full bg-slate-800/80 border border-slate-700/80 hover:bg-blue-600 hover:border-blue-500 flex items-center justify-center text-white transition-all">
                                <span className="font-bold text-[10px] leading-none">f</span>
                            </a>
                            <a href="https://instagram.com/mponlinelimited" target="_blank" rel="noreferrer" title="Instagram" className="w-5.5 h-5.5 rounded-full bg-slate-800/80 border border-slate-700/80 hover:bg-pink-600 hover:border-pink-500 flex items-center justify-center text-white transition-all">
                                <span className="material-symbols-outlined text-[13px] leading-none">photo_camera</span>
                            </a>
                            <a href="https://youtube.com/@mponlinelimited" target="_blank" rel="noreferrer" title="YouTube" className="w-5.5 h-5.5 rounded-full bg-slate-800/80 border border-slate-700/80 hover:bg-red-600 hover:border-red-500 flex items-center justify-center text-white transition-all">
                                <span className="material-symbols-outlined text-[13px] leading-none">smart_display</span>
                            </a>
                            <a href="https://linkedin.com/company/mponlinelimited" target="_blank" rel="noreferrer" title="LinkedIn" className="w-5.5 h-5.5 rounded-full bg-slate-800/80 border border-slate-700/80 hover:bg-blue-700 hover:border-blue-600 flex items-center justify-center text-white transition-all">
                                <span className="font-bold text-[9px] leading-none">in</span>
                            </a>
                            <a href="https://x.com/mponlinelimited" target="_blank" rel="noreferrer" title="X (Twitter)" className="w-5.5 h-5.5 rounded-full bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700 hover:border-slate-600 flex items-center justify-center text-white transition-all">
                                <span className="font-bold text-[9px] leading-none">𝕏</span>
                            </a>
                        </div>
                    </div>

                    {/* Right: Support & Contact Points */}
                    <div className="flex flex-wrap items-center justify-center lg:justify-end gap-x-3.5 gap-y-1 text-[11.5px] text-slate-300 shrink-0">
                        <div className="flex items-center gap-1.5 text-sky-400 font-semibold text-[11px] uppercase tracking-wider hidden xl:flex">
                            <span className="material-symbols-outlined text-[14px]">headset_mic</span>
                            <span>Support:</span>
                        </div>
                        <a href="tel:+07556720200" className="flex items-center gap-1 text-slate-300 hover:text-sky-400 font-medium transition-colors">
                            <span className="material-symbols-outlined text-[13px] text-sky-400">call</span>
                            <span>0755-6720200</span>
                        </a>
                        <span className="text-slate-700 hidden sm:inline">•</span>
                        <a href="mailto:knome-support@mponline.gov.in" className="flex items-center gap-1 text-slate-300 hover:text-sky-400 font-medium transition-colors">
                            <span className="material-symbols-outlined text-[13px] text-sky-400">mail</span>
                            <span>knome-support@mponline.gov.in</span>
                        </a>
                    </div>

                </div>

                {/* Sub Bar: Copyright on Left, Powered by in Middle, Location on Right */}
                <div className="mt-2.5 pt-2.5 border-t border-slate-800/70 flex flex-col md:flex-row items-center justify-between gap-3 text-slate-400">
                    
                    {/* Left: Copyright */}
                    <div className="text-[11px] font-medium text-center md:text-left shrink-0">
                        © {new Date().getFullYear()} MPOnline Limited. All rights reserved.
                    </div>

                    {/* Middle: Powered by MPOnline Limited (Prominent, Larger Logo) */}
                    <div className="flex items-center justify-center gap-2 shrink-0">
                        <span className="text-[12px] text-slate-300 font-medium tracking-wide">Powered by</span>
                        <a 
                            href="https://www.mponline.gov.in/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            aria-label="Visit official MPOnline website" 
                            title="Visit official MPOnline website (https://www.mponline.gov.in/)"
                            className="bg-white px-3 py-1 rounded-md shadow-xs flex items-center justify-center hover:scale-105 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
                        >
                            <img 
                                src={mponlineLogo} 
                                alt="MPOnline Limited" 
                                className="h-5.5 sm:h-6 max-h-[24px] w-auto object-contain block" 
                            />
                        </a>
                    </div>

                    {/* Right: Headquarters Address */}
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-center md:text-right shrink-0">
                        <span className="material-symbols-outlined text-[13px] text-sky-400">location_on</span>
                        <span>State IT Park, Abbas Nagar near RGPV, Gandhi Nagar, Bhopal 462033</span>
                    </div>

                </div>

            </div>
        </footer>
    );
}
