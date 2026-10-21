import React from 'react';
import { getContentTypeConfig } from '../../utils/contentTypeConfig';
import HighlightText from './HighlightText';

/**
 * Renders a distinct, beautifully styled content-type icon and badge for Knome content items.
 * Ensures consistent colors, sizing, and alignment across tables, preview modals, and cards.
 */
export default function ContentTypeBadge({
    contentType,
    contentId,
    query = '',
    onClick = null,
    showLabel = true,
    size = 'normal', // 'sm' | 'normal' | 'lg'
    className = ''
}) {
    const config = getContentTypeConfig(contentType);
    const label = `${config.label || contentType || 'Content'} #${contentId}`;

    const iconContainerSizes = {
        sm: 'w-4 h-4 rounded text-[11px]',
        normal: 'w-5 h-5 rounded-md text-[13px]',
        lg: 'w-7 h-7 rounded-lg text-[16px]'
    };

    const containerSizeClass = iconContainerSizes[size] || iconContainerSizes.normal;

    const badgeContent = (
        <span className={`inline-flex items-center gap-1.5 font-bold transition-colors ${config.textColor} ${config.hoverColor} ${className}`}>
            <span
                className={`${containerSizeClass} flex items-center justify-center shrink-0 border shadow-2xs transition-transform group-hover:scale-105 ${config.badgeBg} ${config.borderColor}`}
                title={`Content Type: ${config.label || contentType || 'Content'}`}
            >
                <span className={`material-symbols-outlined leading-none ${config.iconColor}`}>
                    {config.icon}
                </span>
            </span>
            {showLabel && (
                <span className="truncate">
                    {query ? <HighlightText text={label} query={query} /> : label}
                </span>
            )}
        </span>
    );

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="group inline-flex items-center hover:underline cursor-pointer text-left text-xs focus:outline-none"
                title={`Click to preview ${config.label || contentType || 'Content'} #${contentId}`}
            >
                {badgeContent}
            </button>
        );
    }

    return badgeContent;
}
