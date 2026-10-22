import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { resolveMediaUrl } from '../../utils/apiService';

/**
 * Knome In-Site Professional Document Viewer
 * - Renders via React Portal directly into document.body to prevent parent card transform/hover layout shifts.
 * - Compensates scrollbar width on body lock to eliminate horizontal flickering/layout jumps.
 * - Suppresses all native download controls (#toolbar=0&navpanes=0) and disables context menus.
 * - Stable, flicker-free iframe rendering without node recreation on view mode toggle.
 */
export default function DocumentViewerModal({ document: docFile, onClose }) {
    const modalRef = useRef(null);
    const iframeRef = useRef(null);

    const fileName = docFile?.name || 'Document.pdf';
    const rawUrl = docFile?.url || docFile?.rawUrl || docFile?.fileUrl || '';
    const fileUrl = useMemo(() => resolveMediaUrl(rawUrl) || rawUrl, [rawUrl]);

    const isPdf = useMemo(() => {
        return fileName.toLowerCase().endsWith('.pdf') || (typeof fileUrl === 'string' && fileUrl.toLowerCase().includes('.pdf'));
    }, [fileName, fileUrl]);

    const isImage = useMemo(() => {
        return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(fileName) || /\.(jpg|jpeg|png|gif|webp|svg|avif)/i.test(fileUrl);
    }, [fileName, fileUrl]);

    const isOfficeDoc = useMemo(() => {
        return /\.(docx|doc|xlsx|xls|pptx|ppt)$/i.test(fileName) || /\.(docx|doc|xlsx|xls|pptx|ppt)/i.test(fileUrl);
    }, [fileName, fileUrl]);

    // Pre-initialize URL synchronously if already valid to avoid blank/flash delay
    const initialUrl = useMemo(() => {
        if (!fileUrl) return null;
        if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://') || fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) {
            return fileUrl;
        }
        return null;
    }, [fileUrl]);

    const [blobUrl, setBlobUrl] = useState(initialUrl);
    const [isLoading, setIsLoading] = useState(!initialUrl && !isImage);
    const [hasError, setHasError] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewMode, setViewMode] = useState('fit'); // 'fit' | 'width'
    const [zoom, setZoom] = useState(1);

    // Prevent body scroll with scrollbar-width compensation to eliminate layout shift / page jumping
    useEffect(() => {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const originalOverflow = document.body.style.overflow;
        const originalPaddingRight = document.body.style.paddingRight;

        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.paddingRight = originalPaddingRight;
        };
    }, []);

    // Handle Escape key and Fullscreen toggle
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (isFullscreen) {
                    setIsFullscreen(false);
                } else {
                    onClose();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, isFullscreen]);

    // Handle Blob resolution for relative or custom file endpoints
    useEffect(() => {
        let isMounted = true;
        let createdUrl = null;

        if (!fileUrl || isImage || isOfficeDoc || initialUrl) {
            if (initialUrl) setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setHasError(false);

        fetch(fileUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then(blob => {
                if (!isMounted) return;
                const pdfBlob = new Blob([blob], { type: isPdf ? 'application/pdf' : blob.type });
                createdUrl = URL.createObjectURL(pdfBlob);
                setBlobUrl(createdUrl);
                setIsLoading(false);
            })
            .catch(err => {
                console.error("Document viewer load error", err);
                if (isMounted) {
                    setHasError(true);
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
            if (createdUrl && createdUrl.startsWith('blob:')) {
                setTimeout(() => {
                    try { URL.revokeObjectURL(createdUrl); } catch (e) {}
                }, 3000);
            }
        };
    }, [fileUrl, isPdf, isImage, isOfficeDoc, initialUrl]);

    // Resilient safety timeout for PDF renderers that handle docs internally without iframe.onLoad
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1200);
        return () => clearTimeout(timer);
    }, [fileUrl]);

    const displayUrl = blobUrl || fileUrl;

    // Secure in-browser PDF parameters:
    // toolbar=0 -> removes the native download/save/print toolbar
    // navpanes=0 -> hides side bookmarks for clean reading
    // scrollbar=1 -> allows smooth document scrolling
    // view=Fit / view=FitH -> scales correctly to window
    const targetSrc = useMemo(() => {
        if (!displayUrl) return '';
        if (!isPdf) return displayUrl;
        const cleanUrl = displayUrl.split('#')[0];
        const hash = viewMode === 'width' 
            ? '#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=page-width' 
            : '#toolbar=0&navpanes=0&scrollbar=1&view=Fit&zoom=page-fit';
        return `${cleanUrl}${hash}`;
    }, [displayUrl, isPdf, viewMode]);

    const handleZoomIn = useCallback((e) => {
        e.stopPropagation();
        setZoom(prev => Math.min(prev + 0.25, 2.5));
    }, []);

    const handleZoomOut = useCallback((e) => {
        e.stopPropagation();
        setZoom(prev => Math.max(prev - 0.25, 0.75));
    }, []);

    const handleZoomReset = useCallback((e) => {
        e.stopPropagation();
        setZoom(1);
    }, []);

    if (!docFile) return null;

    return createPortal(
        <div 
            ref={modalRef}
            className={`fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md transition-opacity duration-200 select-none ${
                isFullscreen ? 'p-0' : 'p-2 sm:p-4 md:p-6'
            }`}
            onClick={(e) => {
                if (e.target === modalRef.current) onClose();
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ overscrollBehavior: 'contain' }}
        >
            {/* Modal Container */}
            <div 
                className={`relative w-full bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                    isFullscreen ? 'w-screen h-screen rounded-none border-0' : 'max-w-6xl h-[92vh] rounded-2xl'
                }`}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
                style={{ overscrollBehavior: 'contain' }}
            >
                {/* ── Modal Header ── */}
                <div className="px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    {/* Left: Document Title & Metadata */}
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                            isPdf 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                : isOfficeDoc 
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                            <span className="material-symbols-outlined text-[20px]">
                                {isPdf ? 'picture_as_pdf' : isOfficeDoc ? 'article' : isImage ? 'image' : 'description'}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md lg:max-w-xl" title={fileName}>
                                {fileName}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-medium">
                                <span className={`uppercase font-bold tracking-wider ${isPdf ? 'text-red-400' : 'text-blue-400'}`}>
                                    {isPdf ? 'PDF Document' : isOfficeDoc ? 'Office Document' : isImage ? 'Image' : 'Document'}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    In-Site Viewer
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Controls & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Zoom Controls for Image Viewer */}
                        {isImage && (
                            <div className="flex items-center gap-1 bg-slate-800/90 rounded-xl p-1 border border-slate-700/60">
                                <button
                                    type="button"
                                    onClick={handleZoomOut}
                                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                                    title="Zoom Out"
                                >
                                    <span className="material-symbols-outlined text-[16px]">remove</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleZoomReset}
                                    className="px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
                                    title="Reset Zoom"
                                >
                                    {Math.round(zoom * 100)}%
                                </button>
                                <button
                                    type="button"
                                    onClick={handleZoomIn}
                                    className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                                    title="Zoom In"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                </button>
                            </div>
                        )}

                        {/* PDF View Mode Switcher (Fit Page vs Fit Width) */}
                        {isPdf && (
                            <div className="hidden sm:flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('fit')}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                        viewMode === 'fit'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                    title="Fit Page in Window"
                                >
                                    <span className="material-symbols-outlined text-[15px]">fit_screen</span>
                                    <span>Fit Page</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('width')}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                        viewMode === 'width'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                    title="Fit Document Width"
                                >
                                    <span className="material-symbols-outlined text-[15px]">width</span>
                                    <span>Fit Width</span>
                                </button>
                            </div>
                        )}

                        {/* Fullscreen Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(prev => !prev)}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Viewer"}
                        >
                            <span className="material-symbols-outlined text-[18px]">
                                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                            </span>
                        </button>

                        {/* Close Viewer */}
                        <button 
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all flex items-center justify-center border border-slate-700 ml-1 cursor-pointer active:scale-95"
                            title="Close viewer (Esc)"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* ── Modal Body / Reader Viewport ── */}
                <div 
                    className="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ overscrollBehavior: 'contain' }}
                >
                    {/* Smooth loader overlay */}
                    {isLoading && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 backdrop-blur-xs transition-opacity duration-300">
                            <span className="material-symbols-outlined text-[36px] animate-spin text-indigo-500">progress_activity</span>
                            <p className="text-xs font-medium text-slate-300">Rendering document in-site...</p>
                        </div>
                    )}

                    {isImage ? (
                        <div 
                            className="w-full h-full flex items-center justify-center overflow-auto p-4 custom-scrollbar"
                            style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
                        >
                            <img 
                                src={displayUrl} 
                                alt={fileName} 
                                className="max-w-full max-h-full object-contain rounded-lg shadow-xl select-none transition-transform duration-150"
                                style={{ transform: `scale(${zoom})` }}
                                draggable={false}
                                onContextMenu={(e) => e.preventDefault()}
                            />
                        </div>
                    ) : isOfficeDoc ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-3">
                            {displayUrl && (displayUrl.startsWith('http://') || displayUrl.startsWith('https://')) && !displayUrl.includes('localhost') ? (
                                <iframe
                                    src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(displayUrl)}`}
                                    title={fileName}
                                    className="w-full h-full border-0 bg-white rounded-xl"
                                    allow="fullscreen"
                                    style={{ overscrollBehavior: 'contain' }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-2xl text-center max-w-md border border-slate-800 shadow-2xl">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4 border border-blue-500/20">
                                        <span className="material-symbols-outlined text-[36px]">description</span>
                                    </div>
                                    <h4 className="font-bold text-white text-base mb-1">{fileName}</h4>
                                    <p className="text-xs text-slate-400 mb-4">
                                        Microsoft Office Document
                                    </p>
                                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-800/80 border border-slate-700/80 text-[11px] text-slate-400 font-medium">
                                        <span className="material-symbols-outlined text-[15px] text-indigo-400">verified_user</span>
                                        <span>Embedded View Only • Direct Downloads Disabled</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : hasError ? (
                        <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-2xl text-center max-w-md border border-slate-800 shadow-2xl">
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 border border-amber-500/20">
                                <span className="material-symbols-outlined text-[32px]">warning</span>
                            </div>
                            <h4 className="font-bold text-white text-base mb-1">{fileName}</h4>
                            <p className="text-xs text-slate-400 mb-2">
                                Unable to render inline preview for this document format.
                            </p>
                            <span className="text-[11px] text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                                Protected file • Direct downloads restricted
                            </span>
                        </div>
                    ) : (
                        <div className="w-full h-full bg-slate-950 relative flex items-center justify-center overflow-auto p-1 sm:p-3 custom-scrollbar">
                            <div 
                                className={`h-full transition-all duration-300 ease-in-out flex items-center justify-center mx-auto ${
                                    viewMode === 'fit'
                                        ? 'w-full max-w-[850px] shadow-2xl rounded-xl overflow-hidden ring-1 ring-slate-800'
                                        : 'w-full max-w-full shadow-none rounded-none'
                                }`}
                                style={{
                                    width: viewMode === 'fit' 
                                        ? (isFullscreen ? 'min(100%, calc((100vh - 96px) * 0.75))' : 'min(100%, calc((92vh - 100px) * 0.75))')
                                        : '100%'
                                }}
                            >
                                <iframe 
                                    key={`pdf-frame-${viewMode}`}
                                    ref={iframeRef}
                                    src={targetSrc}
                                    title={fileName}
                                    className={`w-full h-full border-0 bg-white transition-all duration-300 ${
                                        viewMode === 'fit' ? 'rounded-xl' : 'rounded-none'
                                    }`}
                                    onLoad={() => setIsLoading(false)}
                                    allow="fullscreen"
                                    style={{ overscrollBehavior: 'contain' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="px-5 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[12px] text-slate-400 shrink-0">
                    <span className="flex items-center gap-1.5 font-medium">
                        <span className="material-symbols-outlined text-[16px] text-indigo-400">verified_user</span>
                        <span>Knome Enterprise Document Viewer</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-400 font-semibold text-[11px]">In-Site View Only</span>
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                            Downloads Disabled
                        </span>
                        <button 
                            type="button"
                            onClick={onClose}
                            className="hover:text-white font-medium transition-colors cursor-pointer"
                        >
                            Press Esc or Close to exit
                        </button>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
}
