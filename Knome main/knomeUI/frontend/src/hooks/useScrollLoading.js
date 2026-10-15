import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to enable smooth progressive scroll loading (infinite scroll) on any list or grid.
 * Combines IntersectionObserver for smooth auto-triggering with a fallback scroll event listener.
 *
 * @param {number} totalItemsCount - Total count of available filtered items.
 * @param {number} initialCount - Number of items to render initially (default: 6).
 * @param {number} batchSize - Number of items to reveal per scroll trigger (default: 6).
 * @param {number} offset - Distance from bottom in px to trigger next batch (default: 400).
 * @param {React.RefObject} containerRef - Optional container ref for overflow scrollable elements (default: null for window).
 */
export function useScrollLoading(totalItemsCount, initialCount = 6, batchSize = 6, offset = 400, containerRef = null) {
    const [visibleCount, setVisibleCount] = useState(initialCount);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const sentinelRef = useRef(null);

    // Keep refs to avoid stale closures in event listeners/observers without tearing them down on every render
    const isFetchingMoreRef = useRef(false);
    const visibleCountRef = useRef(initialCount);
    const totalItemsCountRef = useRef(totalItemsCount);
    const initialCountRef = useRef(initialCount);
    const batchSizeRef = useRef(batchSize);

    // Synchronize refs
    isFetchingMoreRef.current = isFetchingMore;
    visibleCountRef.current = visibleCount;
    totalItemsCountRef.current = totalItemsCount;
    initialCountRef.current = initialCount;
    batchSizeRef.current = batchSize;

    // Load next batch progressively
    const loadMore = useCallback(() => {
        if (isFetchingMoreRef.current) return;
        if (visibleCountRef.current >= totalItemsCountRef.current) return;

        isFetchingMoreRef.current = true;
        setIsFetchingMore(true);

        setTimeout(() => {
            setVisibleCount(prev => {
                const next = Math.min(prev + batchSizeRef.current, totalItemsCountRef.current);
                visibleCountRef.current = next;
                return next;
            });
            setIsFetchingMore(false);
            isFetchingMoreRef.current = false;
        }, 180);
    }, []);

    // 1. IntersectionObserver for modern, smooth infinite scroll
    useEffect(() => {
        const sentinelEl = sentinelRef.current;
        if (!sentinelEl || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
                if (!isFetchingMoreRef.current && visibleCountRef.current < totalItemsCountRef.current) {
                    loadMore();
                }
            }
        }, {
            root: containerRef?.current || null,
            rootMargin: `${offset}px 0px`,
            threshold: 0.01
        });

        observer.observe(sentinelEl);
        return () => observer.disconnect();
    }, [containerRef, offset, loadMore, totalItemsCount, visibleCount]);

    // 2. Window / container scroll listener as robust companion
    useEffect(() => {
        const target = containerRef?.current;

        const handleScroll = () => {
            if (isFetchingMoreRef.current || visibleCountRef.current >= totalItemsCountRef.current) return;

            let isNearBottom = false;
            if (target) {
                isNearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - offset;
            } else {
                const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                const windowHeight = window.innerHeight || document.documentElement.clientHeight || 0;
                const docHeight = Math.max(
                    document.documentElement.scrollHeight,
                    document.body.scrollHeight,
                    document.documentElement.offsetHeight,
                    document.body.offsetHeight
                );
                isNearBottom = windowHeight + scrollY >= docHeight - offset;
            }

            if (isNearBottom) {
                loadMore();
            }
        };

        if (target) {
            target.addEventListener('scroll', handleScroll, { passive: true });
            return () => target.removeEventListener('scroll', handleScroll);
        } else {
            window.addEventListener('scroll', handleScroll, { passive: true });
            window.addEventListener('resize', handleScroll, { passive: true });
            return () => {
                window.removeEventListener('scroll', handleScroll);
                window.removeEventListener('resize', handleScroll);
            };
        }
    }, [containerRef, offset, loadMore, totalItemsCount]);

    const reset = useCallback(() => {
        setVisibleCount(initialCountRef.current);
        visibleCountRef.current = initialCountRef.current;
        setIsFetchingMore(false);
        isFetchingMoreRef.current = false;
    }, []);

    return {
        visibleCount,
        isFetchingMore,
        hasMore: visibleCount < totalItemsCount,
        loadMore,
        reset,
        resetVisibleCount: reset,
        setVisibleCount,
        sentinelRef
    };
}

export default useScrollLoading;
