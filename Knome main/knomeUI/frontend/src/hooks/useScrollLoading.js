import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to enable high-performance progressive scroll loading (infinite scroll).
 * - Zero flickering: reveals batches synchronously in a single state pass without thrashing layout.
 * - Dynamic Callback Ref: automatically attaches IntersectionObserver the moment the sentinel element mounts.
 * - Dual-layer support: IntersectionObserver for sentinel elements + passive scroll listener fallback for lists without sentinels.
 * - Prevents unneeded component re-renders through stable refs.
 *
 * @param {number} totalItemsCount - Total count of available filtered items.
 * @param {number} initialCount - Number of items to render initially (default: 12).
 * @param {number} batchSize - Number of items to reveal per scroll trigger (default: 12).
 * @param {number} offset - Distance from bottom in px to trigger next batch (default: 350).
 * @param {React.RefObject} containerRef - Optional container ref for overflow scrollable elements (default: null for window).
 */
export function useScrollLoading(totalItemsCount, initialCount = 12, batchSize = 12, offset = 350, containerRef = null) {
    const [visibleCount, setVisibleCount] = useState(initialCount);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    const isFetchingMoreRef = useRef(false);
    const visibleCountRef = useRef(initialCount);
    const totalItemsCountRef = useRef(totalItemsCount);
    const initialCountRef = useRef(initialCount);
    const batchSizeRef = useRef(batchSize);
    const lastTriggerTimeRef = useRef(0);
    const observerRef = useRef(null);
    const sentinelNodeRef = useRef(null);

    // Keep refs in sync with incoming props
    isFetchingMoreRef.current = isFetchingMore;
    visibleCountRef.current = visibleCount;
    totalItemsCountRef.current = totalItemsCount;
    initialCountRef.current = initialCount;
    batchSizeRef.current = batchSize;

    // Load next batch progressively without multi-frame thrashing
    const loadMore = useCallback(() => {
        const now = Date.now();
        // Cooldown: prevent successive triggers within 150ms
        if (now - lastTriggerTimeRef.current < 150) return;
        if (visibleCountRef.current >= totalItemsCountRef.current) return;

        lastTriggerTimeRef.current = now;
        setVisibleCount(prev => {
            const next = Math.min(prev + batchSizeRef.current, totalItemsCountRef.current);
            visibleCountRef.current = next;
            return next;
        });
    }, []);

    // Stable callback ref for <div ref={sentinelRef} />
    const sentinelRefCallback = useCallback((node) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        sentinelNodeRef.current = node;
        sentinelRefCallback.current = node;

        if (!node || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
                if (visibleCountRef.current < totalItemsCountRef.current) {
                    loadMore();
                }
            }
        }, {
            root: containerRef?.current || null,
            rootMargin: `${offset}px 0px`,
            threshold: 0.01
        });

        observer.observe(node);
        observerRef.current = observer;
    }, [containerRef, offset, loadMore]);

    // Attach .current for compatibility with callers reading sentinelRef.current
    sentinelRefCallback.current = sentinelNodeRef.current;

    // Cleanup observer on unmount
    useEffect(() => {
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, []);

    // Passive throttled scroll listener fallback (for lists without sentinels or as secondary trigger)
    useEffect(() => {
        const target = containerRef?.current;
        let rafId = null;

        const checkNearBottom = () => {
            if (visibleCountRef.current >= totalItemsCountRef.current) return;

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

        const handleScroll = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                checkNearBottom();
                rafId = null;
            });
        };

        if (target) {
            target.addEventListener('scroll', handleScroll, { passive: true });
            return () => {
                target.removeEventListener('scroll', handleScroll);
                if (rafId) cancelAnimationFrame(rafId);
            };
        } else {
            window.addEventListener('scroll', handleScroll, { passive: true });
            return () => {
                window.removeEventListener('scroll', handleScroll);
                if (rafId) cancelAnimationFrame(rafId);
            };
        }
    }, [containerRef, offset, loadMore]);

    const reset = useCallback(() => {
        setVisibleCount(initialCountRef.current);
        visibleCountRef.current = initialCountRef.current;
        setIsFetchingMore(false);
        isFetchingMoreRef.current = false;
        lastTriggerTimeRef.current = 0;
    }, []);

    return {
        visibleCount,
        isFetchingMore,
        hasMore: visibleCount < totalItemsCount,
        loadMore,
        reset,
        resetVisibleCount: reset,
        setVisibleCount,
        sentinelRef: sentinelRefCallback
    };
}

export default useScrollLoading;

