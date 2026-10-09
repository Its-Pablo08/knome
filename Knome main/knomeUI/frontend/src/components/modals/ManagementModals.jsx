import React from 'react';
import Modal from './Modal';

export function CreateCommunityModal({ isOpen, onClose }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Community" maxWidth="max-w-2xl">
            <div className="flex flex-col gap-4">
                
                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Community Name</label>
                    <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none" type="text" placeholder="e.g. Frontend Guild" />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Description</label>
                    <textarea className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 h-20 outline-none resize-none" placeholder="What is this community about?"></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Category</label>
                        <select className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none">
                            <option>Engineering</option>
                            <option>Design</option>
                            <option>Product</option>
                            <option>Social / Hobby</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Community Type</label>
                        <select className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none">
                            <option value="public">Public (Open to all)</option>
                            <option value="private">Private (Request to join)</option>
                            <option value="default">Org (Auto-subscribed)</option>
                        </select>
                        <span className="text-[10px] text-slate-gray mt-1">* Org type requires HR Admin privileges (FR-CM-04)</span>
                    </div>
                </div>

                <div className="flex gap-4 mt-2">
                    <div className="flex-1 border border-border-subtle border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container">
                        <span className="material-symbols-outlined text-slate-gray mb-1">image</span>
                        <span className="text-xs font-bold">Upload Banner</span>
                    </div>
                    <div className="w-24 h-24 border border-border-subtle border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-surface-container shrink-0">
                        <span className="material-symbols-outlined text-slate-gray mb-1">add_photo_alternate</span>
                        <span className="text-[10px] font-bold text-center">Thumbnail</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1 mt-2">
                    <label className="text-label-md font-bold text-slate-gray">Community Rules</label>
                    <textarea className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 h-16 outline-none resize-none" placeholder="Optional rules for members..."></textarea>
                </div>

                <div className="flex justify-end gap-3 mt-4 border-t border-border-subtle pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-electric-blue text-white font-label-md rounded-lg hover:opacity-90">Create Community</button>
                </div>
            </div>
        </Modal>
    );
}

export function CreateJobModal({ isOpen, onClose }) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Post Internal Job" maxWidth="max-w-2xl">
            <div className="flex flex-col gap-4">
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Job Title</label>
                        <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none" type="text" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Department</label>
                        <select className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none">
                            <option>Engineering</option>
                            <option>Design</option>
                            <option>HR</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Job Description & Skills Required</label>
                    <textarea className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 h-24 outline-none resize-none"></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Location</label>
                        <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none" type="text" placeholder="e.g. London / Remote" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-label-md font-bold text-slate-gray">Closing Date</label>
                        <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none text-slate-gray" type="date" />
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Application Link (HRMS/ATS)</label>
                    <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none" type="url" placeholder="https://" />
                </div>

                <div className="flex justify-end gap-3 mt-4 border-t border-border-subtle pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-electric-blue text-white font-label-md rounded-lg hover:opacity-90">Publish Job</button>
                </div>
            </div>
        </Modal>
    );
}
