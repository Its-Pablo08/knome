import React, { Component } from 'react';

/**
 * ErrorBoundary catches unhandled render-time errors in the React component tree
 * and prevents the entire app from crashing with a blank screen.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.warn('ErrorBoundary captured render error:', error, errorInfo);
        
        // If an error occurred during an in-flight logout, complete the redirection smoothly
        const isLoggingOut = typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true';
        if (isLoggingOut) {
            try {
                window.location.replace('https://counselling-1.mponline.demo.gov.in:3001/applications');
            } catch {
                window.location.href = 'https://counselling-1.mponline.demo.gov.in:3001/applications';
            }
        }
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            const isLoggingOut = typeof window !== 'undefined' && sessionStorage.getItem('knome_logging_out') === 'true';
            if (isLoggingOut) {
                return (
                    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-indigo-600 animate-pulse">
                                <span className="material-symbols-outlined text-white text-[30px]">logout</span>
                            </div>
                            <p className="text-base font-bold text-slate-200">
                                Logging out of Knome...
                            </p>
                            <p className="text-xs text-slate-400">
                                Redirecting to MPO Employee Hub.
                            </p>
                        </div>
                    </div>
                );
            }

            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
                    <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center flex flex-col items-center">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-3xl">refresh</span>
                        </div>
                        <h2 className="text-lg font-bold text-slate-100 mb-1">
                            Something went wrong
                        </h2>
                        <p className="text-xs text-slate-400 mb-6">
                            An unexpected issue occurred while displaying this page.
                        </p>
                        {this.state.error && (
                            <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-left text-xs font-mono text-red-300 max-h-48 overflow-auto mb-4 w-full select-text">
                                <p className="font-bold text-red-200">{this.state.error.toString()}</p>
                                <pre className="text-[10px] mt-1 whitespace-pre-wrap">{this.state.error.stack}</pre>
                            </div>
                        )}
                        <div className="flex items-center gap-3 w-full">
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                            >
                                Reload Page
                            </button>
                            <button
                                type="button"
                                onClick={this.handleGoHome}
                                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all border border-slate-700 active:scale-95 cursor-pointer"
                            >
                                Go to Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
