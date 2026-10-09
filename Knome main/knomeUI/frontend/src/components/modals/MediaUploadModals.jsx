import React, { useState } from 'react';
import Modal from './Modal';

export function CreateVideoModal({ isOpen, onClose }) {
    const [title, setTitle] = useState('');
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload Video" maxWidth="max-w-xl">
            <div className="flex flex-col gap-4">
                <div className="border-2 border-dashed border-border-subtle rounded-xl p-8 flex flex-col items-center justify-center bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-[48px] text-slate-gray mb-2">cloud_upload</span>
                    <p className="font-bold text-primary">Click to upload or drag and drop</p>
                    <p className="text-meta-sm text-slate-gray mt-1">MP4, MOV, AVI, MKV (Max 500MB)</p>
                    <p className="text-meta-sm text-electric-blue mt-2">Or paste Microsoft Stream / OneDrive link</p>
                </div>
                
                <div className="flex flex-col gap-1 mt-2">
                    <label className="text-label-md font-bold text-slate-gray">Video Title</label>
                    <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 focus:ring-2 focus:ring-electric-blue outline-none" type="text" value={title} onChange={(e)=>setTitle(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Description</label>
                    <textarea className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-electric-blue outline-none resize-none"></textarea>
                </div>

                <div className="flex justify-end gap-3 mt-4 border-t border-border-subtle pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-electric-blue text-white font-label-md rounded-lg hover:opacity-90">Upload & Publish</button>
                </div>
            </div>
        </Modal>
    );
}

export function CreatePodcastModal({ isOpen, onClose }) {
    const [isRecording, setIsRecording] = useState(false);
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload or Record Podcast" maxWidth="max-w-xl">
            <div className="flex flex-col gap-4">
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="border border-border-subtle rounded-xl p-6 flex flex-col items-center justify-center bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors">
                        <span className="material-symbols-outlined text-[32px] text-slate-gray mb-2">audio_file</span>
                        <p className="font-bold text-primary">Upload Audio File</p>
                        <p className="text-meta-sm text-slate-gray text-center mt-1">MP3, WAV, AAC (Max 100MB)</p>
                    </div>
                    <div 
                        className={`border border-border-subtle rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${isRecording ? 'bg-error/10 border-error' : 'bg-surface-container-low hover:bg-surface-container'}`}
                        onClick={() => setIsRecording(!isRecording)}
                    >
                        <span className={`material-symbols-outlined text-[32px] mb-2 ${isRecording ? 'text-error animate-pulse' : 'text-slate-gray'}`}>mic</span>
                        <p className={`font-bold ${isRecording ? 'text-error' : 'text-primary'}`}>
                            {isRecording ? 'Recording... (Click to Stop)' : 'Record in Browser'}
                        </p>
                        <p className="text-meta-sm text-slate-gray mt-1 text-center">Use built-in microphone</p>
                    </div>
                </div>
                
                <div className="flex flex-col gap-1 mt-2">
                    <label className="text-label-md font-bold text-slate-gray">Podcast Title</label>
                    <input className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 focus:outline-none" type="text" />
                </div>
                
                <div className="flex flex-col gap-1">
                    <label className="text-label-md font-bold text-slate-gray">Series (Optional)</label>
                    <select className="bg-surface-container border border-border-subtle rounded-lg px-3 py-2 outline-none">
                        <option>None (Standalone Episode)</option>
                        <option>Tech Talks Weekly</option>
                        <option>Leadership Insights</option>
                    </select>
                </div>

                <div className="flex justify-end gap-3 mt-4 border-t border-border-subtle pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-electric-blue text-white font-label-md rounded-lg hover:opacity-90">Publish Episode</button>
                </div>
            </div>
        </Modal>
    );
}
