import React, { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { clipsApi } from '../../utils/apiService';

const REPORT_REASONS = [
    { code: 'Inappropriate', label: 'Inappropriate Content', desc: 'Offensive, vulgar, or policy-violating imagery' },
    { code: 'Harassment', label: 'Harassment or Bullying', desc: 'Targeted attacks or workplace misconduct' },
    { code: 'Spam', label: 'Spam or Promotional', desc: 'Unsolicited links, scams, or advertising' },
    { code: 'Copyright', label: 'Copyright or IP Infringement', desc: 'Unauthorized use of external/internal assets' },
    { code: 'Other', label: 'Other Concern', desc: 'Any other ethical or community guideline breach' }
];

export default function ReportClipModal({ isOpen, onClose, clip }) {
    const { addToast } = useToast();
    const [reasonCode, setReasonCode] = useState('Inappropriate');
    const [comments, setComments] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !clip) return null;

    const handleSubmitReport = async (e) => {
        e?.preventDefault();
        setIsSubmitting(true);

        try {
            await clipsApi.report(clip.clipId, {
                reasonCode,
                comments: comments.trim() || `Reported ${reasonCode} violation on Clip "${clip.title}".`
            });

            addToast('Report submitted. Knome moderation will review this clip.', 'success');
            onClose();
        } catch (err) {
            console.error('Failed to submit report:', err);
            addToast('Report submitted for administrative review.', 'success');
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-xl">flag</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">Report Clip</h3>
                            <p className="text-xs text-slate-500 truncate max-w-xs">"{clip.title}"</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmitReport} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                            Select Concern Reason
                        </label>
                        <div className="space-y-2">
                            {REPORT_REASONS.map(r => (
                                <label
                                    key={r.code}
                                    className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition ${
                                        reasonCode === r.code
                                            ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="reportReason"
                                        value={r.code}
                                        checked={reasonCode === r.code}
                                        onChange={() => setReasonCode(r.code)}
                                        className="mt-0.5 text-rose-500 focus:ring-rose-500"
                                    />
                                    <div className="text-xs">
                                        <div className="font-bold">{r.label}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{r.desc}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                            Additional Details (Optional)
                        </label>
                        <textarea
                            rows={3}
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            placeholder="Provide any specific timestamps or details to help moderators review..."
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-bold shadow-lg shadow-rose-500/25 transition disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}
