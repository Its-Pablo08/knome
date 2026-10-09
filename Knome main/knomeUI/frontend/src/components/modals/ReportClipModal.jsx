import React from 'react';
import ReportModal from './ReportModal';

export default function ReportClipModal({ isOpen, onClose, clip }) {
    if (!isOpen || !clip) return null;

    const clipId = clip.clipId || clip.id;
    const authorName = clip.creatorName || clip.author || clip.createdByUser?.fullName || 'Creator';
    const authorUserId = clip.createdByUserId || clip.authorId || clip.userId || null;
    const content = clip.title || clip.description || '';

    return (
        <ReportModal
            isOpen={isOpen}
            onClose={onClose}
            targetType="Clip"
            targetId={clipId}
            targetName={authorName}
            targetUserId={authorUserId}
            targetContent={content}
        />
    );
}
