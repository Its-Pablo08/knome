import React from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import PageLoader from './PageLoader';
import Footer from './Footer';
import FloatingMessagesButton from '../widgets/FloatingMessagesButton';

export default function Layout({ children }) {
    const location = useLocation();
    const isNoSidebarPage = location.pathname.startsWith('/admin-console');
    const isMessagesPage = location.pathname.startsWith('/messages') || location.pathname.startsWith('/chat');

    return (
        <div className={`relative flex flex-col bg-theme-60 text-theme-30-text ${
            isMessagesPage ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen justify-between'
        }`}>
            {/* Ambient High-Tech Atmospheric Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                {/* Micro tech dot grid for texture and depth */}
                <div className="absolute inset-0 tech-dots-pattern opacity-60 dark:opacity-40"></div>
                {/* Ambient Luminous Orbs */}
                <div className="absolute top-[-8%] right-[-5%] w-[42vw] h-[42vw] max-w-[650px] max-h-[650px] rounded-full blur-[130px] bg-indigo-500/10 dark:bg-indigo-600/15"></div>
                <div className="absolute bottom-[-10%] left-[-8%] w-[45vw] h-[45vw] max-w-[700px] max-h-[700px] rounded-full blur-[140px] bg-cyan-500/10 dark:bg-cyan-500/12"></div>
                <div className="absolute top-[35%] left-[25%] w-[30vw] h-[30vw] max-w-[480px] max-h-[480px] rounded-full blur-[150px] bg-purple-500/5 dark:bg-purple-600/8"></div>
            </div>

            <Navbar />

            <div className={`w-full flex-1 flex flex-col relative min-h-0 ${isMessagesPage ? 'pt-[72px] pb-16 md:pb-3 h-full overflow-hidden' : 'pt-20 md:pt-24 pb-20 md:pb-10'}`}>
                <div className={`w-full ${isNoSidebarPage ? 'px-3 sm:px-4 md:px-6 max-w-[1920px]' : 'px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 max-w-[1720px]'} ${
                    isMessagesPage ? 'h-full min-h-0 overflow-hidden' : ''
                } flex gap-4 lg:gap-6 mx-auto flex-1 min-w-0`}>
                    {!isNoSidebarPage && <Sidebar />}
                    <main className="flex-1 flex flex-col min-w-0 min-h-0 w-full h-full overflow-hidden">
                        <PageLoader>
                            {children}
                        </PageLoader>
                    </main>
                </div>
            </div>

            <FloatingMessagesButton />
            {!isMessagesPage && <Footer />}
        </div>
    );
}


