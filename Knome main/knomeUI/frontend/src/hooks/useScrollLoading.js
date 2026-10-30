import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to enable high-performance progressive scroll loading (infinite scroll).
 * - Avoids layout shifts and screen flickering by smoothly revealing batches via requestAnimationFrame.
 * - Throttles trigger invocations with a cooldown to prevent rapid multi-batch thrashing.
 * - Uses a single stable IntersectionObserver with a gentle margin, and a fallback scroll listener only if needed.
 * - Prevents unneeded component re-renders through stable refs.
 *
 * @param {number} totalItemsCount - Total count of available filtered items.
 * @param {number} initialCount - Number of items to render initially (default: 8).
 * @param {number} batchSize - Number of items to reveal per scroll trigger (default: 8).
 * @param {number} offset - Distance from bottom in px to trigger next batch (default: 300).
 * @param {React.RefObject} containerRef - Optional container ref for overflow scrollable elements (default: null for window).
 */
export function useScrollLoading(totalItemsCount, initialCount = 8, batchSize = 8, offset = 300, containerRef = null) {
    const [visibleCount, setVisibleCount] = useState(initialCount);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const sentinelRef = useRef(null);

    const isFetchingMoreRef = useRef(false);
    const visibleCountRef = useRef(initialCount);
    const totalItemsCountRef = useRef(totalItemsCount);
    const initialCountRef = useRef(initialCount);
    const batchSizeRef = useRef(batchSize);
    const lastTriggerTimeRef = useRef(0);

    // Keep refs in sync with incoming props
    isFetchingMoreRef.current = isFetchingMore;
    visibleCountRef.current = visibleCount;
    totalItemsCountRef.current = totalItemsCount;
    initialCountRef.current = initialCount;
    batchSizeRef.current = batchSize;

    // Load next batch progressively with cooldown and animation frame
    const loadMore = useCallback(() => {
        const now = Date.now();
        // Cooldown: prevent successive triggers within 200ms to avoid freezing and stutter
        if (now - lastTriggerTimeRef.current < 200) return;
        if (isFetchingMoreRef.current) return;
        if (visibleCountRef.current >= totalItemsCountRef.current) return;

        lastTriggerTimeRef.current = now;
        isFetchingMoreRef.current = true;
        setIsFetchingMore(true);

        requestAnimationFrame(() => {
            setVisibleCount(prev => {
                const next = Math.min(prev + batchSizeRef.current, totalItemsCountRef.current);
                visibleCountRef.current = next;
                return next;
            });
            // Reset fetching lock after frame renders
            requestAnimationFrame(() => {
                isFetchingMoreRef.current = false;
                setIsFetchingMore(false);
            });
        });
    }, []);

    // 1. IntersectionObserver (Primary, modern, zero-jank)
    useEffect(() => {
        const sentinelEl = sentinelRef.current;
        if (!sentinelEl || typeof IntersectionObserver === 'undefined') return;

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
            threshold: 0.05
        });

        observer.observe(sentinelEl);
        return () => observer.disconnect();
    }, [containerRef, offset, loadMore]);

    // 2. Scroll listener (Only as fallback if IntersectionObserver is unsupported)
    useEffect(() => {
        if (typeof IntersectionObserver !== 'undefined') {
            return; // IntersectionObserver handles everything smoothly without scroll listeners
        }

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
        sentinelRef
    };
}

export default useScrollLoading;
