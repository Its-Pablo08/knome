import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageLoader({ children }) {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const location = useLocation();

    useEffect(() => {
        // Instant snappy progress indicator on route change without artificial delays
        setIsLoading(true);
        setProgress(60);

        const timer = setTimeout(() => {
            setProgress(100);
            setTimeout(() => {
                setIsLoading(false);
                setProgress(0);
            }, 120);
        }, 60);

        return () => {
            clearTimeout(timer);
        };
    }, [location.pathname]);

    return (
        <>
            {/* Minimal Top Progress Bar only, no interface changes */}
            <div 
                className={`fixed top-0 left-0 h-[3px] z-[9999] transition-all ease-out ${isLoading ? 'duration-150 opacity-100' : 'duration-500 opacity-0'}`}
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #3b7fff, #00d4ff, #7c3aed)', boxShadow: '0 0 12px rgba(59,127,255,0.8), 0 0 4px rgba(0,212,255,0.6)' }}
            ></div>

            {/* Render children normally without any opacity/overlay changes */}
            {children}
        </>
    );
}
