import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to enable smooth progressive scroll loading (infinite scroll) on any list or grid.
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

    useEffect(() => {
        const target = containerRef?.current;

        const handleScroll = () => {
            let isNearBottom = false;
            if (target) {
                isNearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - offset;
            } else {
                isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - offset;
            }

            if (isNearBottom) {
                if (!isFetchingMore && visibleCount < totalItemsCount) {
                    setIsFetchingMore(true);
                    setTimeout(() => {
                        setVisibleCount(prev => prev + batchSize);
                        setIsFetchingMore(false);
                    }, 50);
                }
            }
        };

        if (target) {
            target.addEventListener('scroll', handleScroll, { passive: true });
            return () => target.removeEventListener('scroll', handleScroll);
        } else {
            window.addEventListener('scroll', handleScroll, { passive: true });
            return () => window.removeEventListener('scroll', handleScroll);
        }
    }, [isFetchingMore, visibleCount, totalItemsCount, batchSize, offset, containerRef]);

    const reset = useCallback(() => {
        setVisibleCount(initialCount);
        setIsFetchingMore(false);
    }, [initialCount]);

    return {
        visibleCount,
        isFetchingMore,
        reset,
        resetVisibleCount: reset,
        setVisibleCount
    };
}

export default useScrollLoading;
