import React, { useState } from 'react';
import { jobsApi } from '../../utils/apiService';

export default function CreateJobModal({ isOpen, onClose, onJobCreated }) {
    const [title, setTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [location, setLocation] = useState('');
    const [closingDate, setClosingDate] = useState('');
    const [applicationLink, setApplicationLink] = useState('');
    const [description, setDescription] = useState('');
    const [skills, setSkills] = useState([]);
    const [skillInput, setSkillInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!isOpen) return null;

    const handleSkillKeyDown = (e) => {
        if (e.key === 'Enter' && skillInput.trim() !== '') {
            if (!skills.includes(skillInput.trim())) {
                setSkills([...skills, skillInput.trim()]);
            }
            setSkillInput('');
            e.preventDefault();
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setErrorMsg('');

        if (!title.trim()) {
            setErrorMsg('Please enter a job title.');
            return;
        }

        setIsSubmitting(true);
        try {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);
            const formattedClosing = closingDate || futureDate.toISOString().split('T')[0];

            const jobData = {
                title: title.trim(),
                description: description.trim() || title.trim(),
                location: location.trim() || 'Bhopal, MP (Hybrid)',
                skillsRequired: skills.length > 0 ? skills.join(', ') : 'Standard skills required',
                closingDate: formattedClosing,
                applicationLink: applicationLink.trim() || 'https://ats.mponline.gov.in',
                status: 'Open'
            };

            await jobsApi.create(jobData);
            setIsSubmitting(false);

            // Reset form
            setTitle('');
            setDepartment('');
            setLocation('');
            setClosingDate('');
            setApplicationLink('');
            setDescription('');
            setSkills([]);

            if (onJobCreated) onJobCreated();
            onClose();
        } catch (err) {
            console.error('Failed to save job posting to database:', err);
            // Even on error, notify parent to trigger refresh / show state
            setIsSubmitting(false);
            if (onJobCreated) onJobCreated();
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto p-3 sm:p-4 md:p-6 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="fixed inset-0" onClick={onClose}></div>
            
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col my-auto border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
                
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-teal-500">work</span>
                            Post Internal Job
                        </h2>
                        <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5 sm:mt-1">Create a new opportunity across MPOnline.</p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8">
                    {errorMsg && (
                        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold">
                            {errorMsg}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        
                        {/* Title */}
                        <div className="md:col-span-2">
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Job Title *</label>
                            <input 
                                type="text" 
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Senior Backend Engineer" 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white font-bold" 
                            />
                        </div>

                        {/* Department & Location */}
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Department</label>
                            <select 
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white font-medium">
                                <option value="">Select Department</option>
                                <option value="Engineering">Engineering</option>
                                <option value="Product & Design">Product & Design</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Sales">Sales</option>
                                <option value="Human Resources">Human Resources</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Location / Model</label>
                            <input 
                                type="text" 
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. Bhopal, MP (Hybrid)" 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white" 
                            />
                        </div>

                        {/* Closing Date & ATS Link */}
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Closing Date</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">calendar_month</span>
                                <input 
                                    type="date" 
                                    value={closingDate}
                                    onChange={(e) => setClosingDate(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white font-medium [color-scheme:light] dark:[color-scheme:dark]" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                Application Link
                                <span className="material-symbols-outlined text-[14px] text-amber-500" title="Link to external ATS like Workday or MPOnline">info</span>
                            </label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">link</span>
                                <input 
                                    type="url" 
                                    value={applicationLink}
                                    onChange={(e) => setApplicationLink(e.target.value)}
                                    placeholder="https://ats.mponline.gov.in/apply" 
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white" 
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div className="md:col-span-2">
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Job Description</label>
                            <textarea 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the responsibilities, requirements, and what makes this role great..." 
                                rows="5" 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none text-slate-900 dark:text-white resize-none"
                            ></textarea>
                        </div>

                        {/* Skills */}
                        <div className="md:col-span-2">
                            <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Required Skills & Tags</label>
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-teal-500 transition-shadow min-h-[50px]">
                                {skills.map(skill => (
                                    <span key={skill} className="flex items-center gap-1 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 px-2.5 py-1 rounded-md text-[12px] font-bold border border-teal-200 dark:border-teal-800/50">
                                        {skill}
                                        <button type="button" onClick={() => setSkills(skills.filter(s => s !== skill))} className="hover:text-red-500 flex items-center"><span className="material-symbols-outlined text-[14px]">close</span></button>
                                    </span>
                                ))}
                                <input 
                                    type="text" 
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    onKeyDown={handleSkillKeyDown}
                                    placeholder={skills.length === 0 ? "Type a skill and press Enter..." : "Add more..."}
                                    className="flex-1 min-w-[150px] bg-transparent border-none p-1 text-sm text-slate-900 dark:text-white focus:ring-0 outline-none placeholder-slate-400"
                                />
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 rounded-b-2xl sm:rounded-b-3xl bg-slate-50/50 dark:bg-slate-800/50 shrink-0 z-10">
                    <button 
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-8 py-2.5 bg-teal-500 text-white text-[13px] font-bold rounded-xl hover:bg-teal-600 transition-colors shadow-md shadow-teal-500/20 disabled:opacity-50 flex items-center gap-2">
                        {isSubmitting ? (
                            <>Publishing Job...</>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">publish</span>
                                Save & Publish Job
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
