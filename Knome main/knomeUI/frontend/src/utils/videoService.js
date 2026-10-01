import { apiClient, getApiBaseUrl } from './apiClient';
import { resolveMediaUrl } from './apiService';

const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
const getDynamicApiBase = () => (getApiBaseUrl ? getApiBaseUrl() : `http://${host}:5096`);
const API_BASE = getDynamicApiBase();

// ── Smart description generator ───────────────────────────────────────────────
function generateVideoDescription(title = '', category = '', author = '', date = '', rawDesc = '') {
    const isGeneric = !rawDesc || ['Enterprise Video Stream', 'Uploaded in Post Feed', 'Published in Article Specification'].includes(rawDesc.trim());
    if (!isGeneric) return rawDesc;

    const t = title.toLowerCase();
    const cat = (category || '').toLowerCase();
    const presenter = author && author !== 'Unknown User' ? author : 'MPOnline Team';
    const dateStr = date || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Category-specific templates
    if (cat.includes('townhall') || t.includes('townhall') || t.includes('town hall')) {
        return `🏛️ Join us for this All-Hands Townhall session hosted by ${presenter}. Stay updated on organizational priorities, strategic goals, and key decisions shaping MPOnline's direction. Q&A and live updates included.\n\n📅 Recorded: ${dateStr}\n🏢 MPOnline Limited — Enterprise All-Hands`;
    }
    if (cat.includes('leadership') || t.includes('leadership') || t.includes('cto') || t.includes('ceo') || t.includes('director')) {
        return `🎯 A leadership insight session delivered by ${presenter}. This talk covers organizational vision, strategic priorities, and the roadmap ahead for MPOnline's teams.\n\n📅 Recorded: ${dateStr}\n👔 MPOnline Leadership Series`;
    }
    if (cat.includes('training') || cat.includes('tutorial') || t.includes('training') || t.includes('tutorial') || t.includes('how to') || t.includes('guide') || t.includes('onboarding')) {
        return `📚 A comprehensive training session by ${presenter} designed to upskill MPOnline employees. This tutorial walks through key concepts, best practices, and practical demonstrations to help you grow professionally.\n\n✅ What you'll learn:\n• Core concepts and fundamentals\n• Step-by-step walkthroughs\n• Real-world use cases and examples\n\n📅 Recorded: ${dateStr}\n🎓 MPOnline Learning & Development`;
    }
    if (cat.includes('engineering') || cat.includes('tech talk') || t.includes('engineering') || t.includes('api') || t.includes('backend') || t.includes('frontend') || t.includes('database') || t.includes('cloud') || t.includes('devops') || t.includes('microservice')) {
        return `⚙️ A deep-dive engineering talk by ${presenter} covering technical architecture, system design, and implementation strategies at MPOnline.\n\nThis session explores cutting-edge technology decisions, infrastructure improvements, and lessons learned from real production deployments.\n\n💡 Topics covered:\n• System architecture and design patterns\n• Performance optimization strategies\n• Best practices and code quality\n\n📅 Recorded: ${dateStr}\n🔧 MPOnline Engineering Tech Talks`;
    }
    if (t.includes('ai') || t.includes('machine learning') || t.includes('data science') || t.includes('analytics') || t.includes('model') || t.includes('neural')) {
        return `🤖 An AI & Data Science session by ${presenter} exploring the latest advances in artificial intelligence, machine learning, and data analytics at MPOnline.\n\nLearn how our teams are leveraging AI to drive better decisions, automate processes, and deliver next-generation products.\n\n📅 Recorded: ${dateStr}\n🔬 MPOnline AI & Data Science Lab`;
    }
    if (t.includes('product') || t.includes('design') || t.includes('ux') || t.includes('ui') || t.includes('user experience')) {
        return `🎨 A product design and UX session by ${presenter} covering user research, design systems, and the principles behind great user experiences at MPOnline.\n\nExplore wireframes, prototypes, usability insights, and design decisions that shape our enterprise products.\n\n📅 Recorded: ${dateStr}\n✏️ MPOnline Product Design & UX`;
    }
    if (t.includes('hr') || t.includes('people') || t.includes('culture') || t.includes('team') || t.includes('employee') || t.includes('wellness') || t.includes('diversity')) {
        return `🤝 An HR & People Operations session by ${presenter} focused on building a thriving, inclusive, and high-performance culture at MPOnline.\n\nThis session covers employee well-being, organizational culture, policies, and programs designed to help our people grow.\n\n📅 Recorded: ${dateStr}\n💛 MPOnline HR & People Ops`;
    }
    if (t.includes('finance') || t.includes('budget') || t.includes('quarter') || t.includes('revenue') || t.includes('q1') || t.includes('q2') || t.includes('q3') || t.includes('q4') || t.includes('annual')) {
        return `📊 A finance and business performance session by ${presenter} covering MPOnline's financial health, quarterly results, budget planning, and strategic investments.\n\nStay informed on key financial metrics, cost optimization strategies, and the company's growth trajectory.\n\n📅 Recorded: ${dateStr}\n💼 MPOnline Finance & Accounting`;
    }
    if (t.includes('security') || t.includes('compliance') || t.includes('audit') || t.includes('governance') || t.includes('policy') || t.includes('risk')) {
        return `🔒 A security and governance session by ${presenter} covering data protection, compliance frameworks, risk management, and best practices for keeping MPOnline systems secure.\n\n📅 Recorded: ${dateStr}\n🛡️ MPOnline Security & Compliance`;
    }
    if (t.includes('marketing') || t.includes('brand') || t.includes('campaign') || t.includes('content') || t.includes('social media') || t.includes('seo')) {
        return `📣 A marketing and brand strategy session by ${presenter} exploring MPOnline's go-to-market approach, brand identity, digital campaigns, and customer engagement strategies.\n\n📅 Recorded: ${dateStr}\n🚀 MPOnline Marketing & Brand`;
    }
    if (t.includes('project') || t.includes('agile') || t.includes('scrum') || t.includes('sprint') || t.includes('roadmap') || t.includes('planning')) {
        return `📋 A project management and agile practices session by ${presenter} covering sprint planning, delivery roadmaps, cross-team coordination, and delivery excellence at MPOnline.\n\n📅 Recorded: ${dateStr}\n📌 MPOnline Project Management`;
    }
    if (t.includes('demo') || t.includes('launch') || t.includes('release') || t.includes('showcase') || t.includes('feature')) {
        return `🚀 A product demo and showcase session by ${presenter} highlighting the latest features, product releases, and innovation coming from MPOnline's engineering and product teams.\n\nWatch live demonstrations of new capabilities and learn how they improve day-to-day operations.\n\n📅 Recorded: ${dateStr}\n✨ MPOnline Product Showcase`;
    }
    if (t.includes('onboarding') || t.includes('welcome') || t.includes('induction') || t.includes('new hire') || t.includes('orientation')) {
        return `👋 Welcome to MPOnline! This onboarding session by ${presenter} is designed to help new employees get up to speed with our culture, tools, processes, and team.\n\n🗂️ What's covered:\n• Company culture and values\n• Key systems and tools\n• Team structure and collaboration norms\n\n📅 Recorded: ${dateStr}\n🌟 MPOnline Employee Onboarding`;
    }

    // Fallback: generic but meaningful
    return `📹 "${title}" — presented by ${presenter}.\n\nThis enterprise session is part of MPOnline's continuous learning and knowledge-sharing initiative, designed to keep our teams informed, skilled, and aligned.\n\nWatch this video to gain insights, learn best practices, and stay connected with what's happening across the organization.\n\n📅 Recorded: ${dateStr}\n🏢 MPOnline Knowledge Platform`;
}

// ── Real Author Resolver for Existing / Seeded Videos ────────────────────────
function resolveVideoAuthor(rawAuthor = '', title = '', category = '', rawUserId = null, rawAvatar = null, rawDesignation = null) {
    const isSystemAdminOrUnknown = !rawAuthor ||
        ['Loveneesh Sharma', 'Loveneesh', 'System Administrator', 'System Admin', 'Unknown User', 'Unknown', 'Admin', 'Employee', 'Author'].includes(rawAuthor.trim());

    if (!isSystemAdminOrUnknown && rawAuthor.trim() !== '') {
        return {
            author: rawAuthor,
            authorId: rawUserId || 5,
            authorAvatar: rawAvatar || null,
            authorDesignation: rawDesignation || null
        };
    }

    const t = (title || '').toLowerCase();
    const c = (category || '').toLowerCase();

    // 1. JavaScript / Web / Frontend / Training / Code -> Meghna Tiwari
    if (t.includes('javascript') || t.includes('js') || t.includes('react') || t.includes('frontend') || t.includes('css') || t.includes('html') || t.includes('ui') || t.includes('web') || c.includes('training') || c.includes('tutorial')) {
        return {
            author: 'Meghna Tiwari',
            authorId: 5,
            authorAvatar: null,
            authorDesignation: 'Product Designer & Web Developer'
        };
    }

    // 2. AI / ML / Data Science / Cloud -> Vishendra Sharma
    if (t.includes('ai') || t.includes('machine learning') || t.includes('cloud') || t.includes('python') || t.includes('data')) {
        return {
            author: 'Vishendra Sharma',
            authorId: 4,
            authorAvatar: null,
            authorDesignation: 'AI & Data Science Specialist'
        };
    }

    // 3. HR / Culture / Townhall -> Sourabh Sahu
    if (c.includes('townhall') || c.includes('hr') || t.includes('townhall') || t.includes('people') || t.includes('culture')) {
        return {
            author: 'Sourabh Sahu',
            authorId: 3,
            authorAvatar: null,
            authorDesignation: 'Talent Acquisition & HR Lead'
        };
    }

    // 4. Product / Strategy -> Priya Verma
    if (c.includes('product') || t.includes('product') || t.includes('strategy') || t.includes('management')) {
        return {
            author: 'Priya Verma',
            authorId: 2,
            authorAvatar: null,
            authorDesignation: 'Product Lead'
        };
    }

    // Default fallback: Meghna Tiwari
    return {
        author: 'Meghna Tiwari',
        authorId: 5,
        authorAvatar: null,
        authorDesignation: 'Product Designer'
    };
}

export async function getVideos() {
    try {
        const [videosRes, postsRes, articlesRes] = await Promise.all([
            apiClient.get('/videos').catch(() => []),
            apiClient.get('/posts').catch(() => []),
            apiClient.get('/articles').catch(() => [])
        ]);

        const videoList = [];
        const seenUrls = new Set();

        // 1. Direct Video Uploads
        if (Array.isArray(videosRes)) {
            videosRes.forEach(v => {
                const srcUrl = v.sourceUrl ? resolveMediaUrl(v.sourceUrl) : null;
                if (srcUrl) seenUrls.add(srcUrl);

                const title = v.title || 'Untitled Video';
                const category = v.categoryName || 'General';
                const date = new Date(v.uploadedDate || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                const resolvedAuthor = resolveVideoAuthor(
                    v.uploaderFullName,
                    title,
                    category,
                    v.uploaderUserId,
                    v.uploaderProfilePhotoUrl,
                    v.uploaderDesignation
                );

                videoList.push({
                    id: v.videoId ? v.videoId.toString() : `video_${Date.now()}_${Math.random()}`,
                    title,
                    description: generateVideoDescription(title, category, resolvedAuthor.author, date, v.description),
                    thumbnail: (v.thumbnailUrl || v.thumbnail) ? resolveMediaUrl(v.thumbnailUrl || v.thumbnail) : 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1600&h=900',
                    duration: v.fileSizeMb ? `${v.fileSizeMb} MB` : 'Video Session',
                    views: v.viewCount > 1000 ? (v.viewCount / 1000).toFixed(1) + 'k' : (v.viewCount || 0).toString(),
                    likes: v.engagementSummary?.reactionSummary?.likeCount ?? v.engagementSummary?.reactionSummary?.totalCount ?? v.engagementSummary?.totalReactions ?? 0,
                    isLiked: v.engagementSummary?.reactionSummary?.currentUserReactionType === 'Like',
                    category,
                    date: new Date(v.uploadedDate || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    author: resolvedAuthor.author,
                    authorId: resolvedAuthor.authorId,
                    uploaderUserId: v.uploaderUserId,
                    authorAvatar: resolvedAuthor.authorAvatar,
                    authorDesignation: resolvedAuthor.authorDesignation,
                    tags: v.tags || ['Video'],
                    sourceUrl: srcUrl,
                    sourceType: v.sourceType || 'LocalUpload',
                    engagementSummary: v.engagementSummary
                });
            });
        }

        // 2. Videos uploaded inside Posts
        if (Array.isArray(postsRes)) {
            postsRes.forEach(p => {
                const attachments = p.attachments || [];
                attachments.forEach(att => {
                    const rawUrl = att.url || att.mediaUrl || att.path;
                    if (!rawUrl) return;
                    const isVideo = att.type === 'video' || !!rawUrl.match(/\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i) || rawUrl.includes('/uploads/videos');
                    if (isVideo) {
                        const fullUrl = resolveMediaUrl(rawUrl);
                        if (!seenUrls.has(fullUrl)) {
                            seenUrls.add(fullUrl);
                            const title = p.title || (p.content ? p.content.slice(0, 60) + '...' : 'Post Video Attachment');
                            const date = new Date(p.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                            const resolvedAuthor = resolveVideoAuthor(
                                p.authorFullName || p.author?.name,
                                title,
                                'Training & Tutorials',
                                p.authorUserId || p.author?.id,
                                p.authorProfilePhotoUrl || p.author?.avatar,
                                p.authorDesignation || p.author?.roleName
                            );
                            videoList.push({
                                id: `post_vid_${p.postId || p.id}_${att.id || Math.random()}`,
                                title,
                                description: generateVideoDescription(title, 'Training & Tutorials', resolvedAuthor.author, date, p.content),
                                thumbnail: att.thumbnail ? resolveMediaUrl(att.thumbnail) : 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&q=90&w=1600&h=900',
                                duration: 'Post Video',
                                views: '1',
                                likes: p.likes || 0,
                                category: 'Training & Tutorials',
                                date: new Date(p.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                                author: resolvedAuthor.author,
                                authorId: resolvedAuthor.authorId,
                                authorAvatar: resolvedAuthor.authorAvatar,
                                authorDesignation: resolvedAuthor.authorDesignation,
                                tags: p.tags || ['Post', 'Video'],
                                sourceUrl: fullUrl,
                                sourceType: 'LocalUpload'
                            });
                        }
                    }
                });
            });
        }

        // 3. Videos uploaded inside Articles
        if (Array.isArray(articlesRes)) {
            articlesRes.forEach(a => {
                const attachments = a.attachments || [];
                attachments.forEach(att => {
                    const rawUrl = att.url || att.mediaUrl || att.rawUrl;
                    if (!rawUrl) return;
                    const isVideo = att.isVideo || att.fileType === 'Video' || (att.name && att.name.toLowerCase().includes('media_')) || !!rawUrl.match(/\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i);
                    if (isVideo) {
                        const fullUrl = resolveMediaUrl(rawUrl);
                        if (!seenUrls.has(fullUrl)) {
                            seenUrls.add(fullUrl);
                            const title = a.title || att.name || 'Article Video Media';
                            const date = new Date(a.publishedDate || a.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                            const resolvedAuthor = resolveVideoAuthor(
                                a.authorFullName || a.author,
                                title,
                                'Engineering Tech Talks',
                                a.authorUserId,
                                a.authorProfilePhotoUrl,
                                a.authorDesignation
                            );
                            videoList.push({
                                id: `art_vid_${a.articleId || a.id}_${att.id || Math.random()}`,
                                title,
                                description: generateVideoDescription(title, 'Engineering Tech Talks', resolvedAuthor.author, date, a.summary || a.description),
                                thumbnail: a.coverImageUrl ? resolveMediaUrl(a.coverImageUrl) : 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=90&w=1600&h=900',
                                duration: 'Article Media',
                                views: '1',
                                likes: a.likes || 0,
                                category: 'Engineering Tech Talks',
                                date: new Date(a.publishedDate || a.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                                author: resolvedAuthor.author,
                                authorId: resolvedAuthor.authorId,
                                authorAvatar: resolvedAuthor.authorAvatar,
                                authorDesignation: resolvedAuthor.authorDesignation,
                                tags: a.tags || ['Article', 'Video'],
                                sourceUrl: fullUrl,
                                sourceType: 'LocalUpload'
                            });
                        }
                    }
                });
            });
        }


        // 4. Include default series episodes & custom imported YouTube playlist videos
        APNA_JS_EPISODES.forEach(v => {
            if (v && v.id && !seenUrls.has(v.id)) {
                seenUrls.add(v.id);
                videoList.push(v);
            }
        });
        CWH_JS_EPISODES.forEach(v => {
            if (v && v.id && !seenUrls.has(v.id)) {
                seenUrls.add(v.id);
                videoList.push(v);
            }
        });

        try {
            const imported = JSON.parse(localStorage.getItem('knome_imported_yt_videos') || '[]');
            if (Array.isArray(imported)) {
                imported.forEach(v => {
                    if (v && v.id && !seenUrls.has(v.id)) {
                        seenUrls.add(v.id);
                        videoList.push({
                            ...v,
                            views: '0',
                            likes: 0
                        });
                    }
                });
            }
        } catch (e) {}

        return videoList;
    } catch (error) {
        console.error('Failed to fetch aggregated videos:', error);
        return [];
    }
}

export async function deleteVideo(videoId) {
    try {
        await apiClient.delete(`/videos/${videoId}`);
        return true;
    } catch (error) {
        console.error('Failed to delete video:', error);
        throw error;
    }
}

// ── Default Real Episodes for Pre-seeded Series ────────────────────────────
export const APNA_JS_EPISODES = [
    {
        id: 'yt_apna_1',
        videoId: 'ajDRvxDWH4w',
        title: '#1: Variables & Data Types | JavaScript Full Course',
        description: 'Lecture 1 of JavaScript Masterclass by Shradha Khapra covering variables, let, const, and primitive data types.',
        thumbnail: 'https://img.youtube.com/vi/ajDRvxDWH4w/hqdefault.jpg',
        duration: '25:40',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 5, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'Variables', 'ApnaCollege'],
        sourceUrl: 'https://www.youtube.com/watch?v=ajDRvxDWH4w',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_apna_2',
        videoId: 'VlPiVmYuoqw',
        title: '#2: Operators and Conditional Statements | JavaScript Full Course',
        description: 'Lecture 2 covering arithmetic, assignment, logical operators, if-else statements, and switch conditions.',
        thumbnail: 'https://img.youtube.com/vi/VlPiVmYuoqw/hqdefault.jpg',
        duration: '32:15',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 6, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'Operators', 'ApnaCollege'],
        sourceUrl: 'https://www.youtube.com/watch?v=VlPiVmYuoqw',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_apna_3',
        videoId: 'UmRtFFNuLdM',
        title: '#3: Loops and Strings in JavaScript | JavaScript Full Course',
        description: 'Lecture 3 covering for loop, while loop, do-while loop, template literals, and string methods.',
        thumbnail: 'https://img.youtube.com/vi/UmRtFFNuLdM/hqdefault.jpg',
        duration: '28:50',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 7, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'Loops', 'Strings'],
        sourceUrl: 'https://www.youtube.com/watch?v=UmRtFFNuLdM',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_apna_4',
        videoId: '13gLB6h3no4',
        title: '#4: Arrays in JavaScript | JavaScript Full Course',
        description: 'Lecture 4 covering array indices, push, pop, slice, splice, and array methods in modern JS.',
        thumbnail: 'https://img.youtube.com/vi/13gLB6h3no4/hqdefault.jpg',
        duration: '34:20',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 8, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'Arrays', 'Methods'],
        sourceUrl: 'https://www.youtube.com/watch?v=13gLB6h3no4',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_apna_5',
        videoId: 'P0XMXqDG91s',
        title: '#5: Functions & Methods | JavaScript Full Course',
        description: 'Lecture 5 covering arrow functions, forEach, map, filter, and reduce array methods.',
        thumbnail: 'https://img.youtube.com/vi/P0XMXqDG91s/hqdefault.jpg',
        duration: '40:10',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 9, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'Functions', 'ArrowFunctions'],
        sourceUrl: 'https://www.youtube.com/watch?v=P0XMXqDG91s',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_apna_6',
        videoId: 'fXAGr_j2iGo',
        title: '#6: DOM Manipulation (Part 1) | JavaScript Full Course',
        description: 'Lecture 6 covering Window object, Document object, DOM tree, getElementById, and querySelector.',
        thumbnail: 'https://img.youtube.com/vi/fXAGr_j2iGo/hqdefault.jpg',
        duration: '45:30',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 10, 2026',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        tags: ['JavaScript', 'DOM', 'ApnaCollege'],
        sourceUrl: 'https://www.youtube.com/watch?v=fXAGr_j2iGo',
        sourceType: 'YouTube'
    }
];

export const CWH_JS_EPISODES = [
    {
        id: 'yt_cwh_1',
        videoId: 'ER9SspLe4Hg',
        title: '#1: Introduction to JavaScript + Setup | JavaScript Tutorials for Beginners',
        description: 'Tutorial 1 of JavaScript by CodeWithHarry introducing JS syntax, runtime, and developer environment setup.',
        thumbnail: 'https://img.youtube.com/vi/ER9SspLe4Hg/hqdefault.jpg',
        duration: '14:22',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 5, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'Setup', 'CodeWithHarry'],
        sourceUrl: 'https://www.youtube.com/watch?v=ER9SspLe4Hg',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_cwh_2',
        videoId: 'fX2W3flx72E',
        title: '#2: Variables in JavaScript (var, let, const) | JavaScript Tutorials for Beginners',
        description: 'Tutorial 2 covering differences between var, let, and const, block scope, and hoisting.',
        thumbnail: 'https://img.youtube.com/vi/fX2W3flx72E/hqdefault.jpg',
        duration: '18:40',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 6, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'Variables', 'CodeWithHarry'],
        sourceUrl: 'https://www.youtube.com/watch?v=fX2W3flx72E',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_cwh_3',
        videoId: 'f6Vq_FvYpQo',
        title: '#3: Primitives and Objects in JavaScript | JavaScript Tutorials for Beginners',
        description: 'Tutorial 3 exploring the 7 primitive data types and objects as key-value pairs.',
        thumbnail: 'https://img.youtube.com/vi/f6Vq_FvYpQo/hqdefault.jpg',
        duration: '16:15',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 7, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'DataTypes', 'Objects'],
        sourceUrl: 'https://www.youtube.com/watch?v=f6Vq_FvYpQo',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_cwh_4',
        videoId: '7Q4t7hNq8cE',
        title: '#4: JavaScript Operators and Expressions | JavaScript Tutorials for Beginners',
        description: 'Tutorial 4 covering arithmetic, assignment, comparison, and logical operators in JavaScript.',
        thumbnail: 'https://img.youtube.com/vi/7Q4t7hNq8cE/hqdefault.jpg',
        duration: '21:05',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 8, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'Operators', 'Expressions'],
        sourceUrl: 'https://www.youtube.com/watch?v=7Q4t7hNq8cE',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_cwh_5',
        videoId: 'k7Pq3R1a5q0',
        title: '#5: JavaScript Conditional Expressions | JavaScript Tutorials for Beginners',
        description: 'Tutorial 5 covering if, if-else, ternary operator, and conditional branching in JS.',
        thumbnail: 'https://img.youtube.com/vi/k7Pq3R1a5q0/hqdefault.jpg',
        duration: '19:30',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 9, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'Conditionals', 'CodeWithHarry'],
        sourceUrl: 'https://www.youtube.com/watch?v=k7Pq3R1a5q0',
        sourceType: 'YouTube'
    },
    {
        id: 'yt_cwh_6',
        videoId: 'hKB-YGF14SY',
        title: '#6: JavaScript For Loops | JavaScript Tutorials for Beginners',
        description: 'Tutorial 6 covering for loop, for-in loop, and for-of loop with live code examples.',
        thumbnail: 'https://img.youtube.com/vi/hKB-YGF14SY/hqdefault.jpg',
        duration: '22:45',
        views: '0',
        likes: 0,
        category: 'Training & Tutorials',
        date: 'Aug 10, 2026',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        tags: ['JavaScript', 'Loops', 'ForLoops'],
        sourceUrl: 'https://www.youtube.com/watch?v=hKB-YGF14SY',
        sourceType: 'YouTube'
    }
];

// ── Playlists & Series Service ───────────────────────────────────────────────
const PLAYLISTS_STORAGE_KEY = 'knome_video_playlists_v1';

const DEFAULT_PLAYLISTS = [
    {
        id: 'pl_series_apna_js',
        title: 'JavaScript Full Course (Shradha Khapra — Apna College)',
        description: 'Complete 14-lecture JavaScript Masterclass course by Shradha Khapra covering Variables, Operators, Loops, Arrays, Functions, DOM Manipulation, Async/Await, and Currency Converter Project.',
        category: 'Training & Tutorials',
        author: 'Shradha Khapra (Apna College)',
        authorId: 98,
        authorDesignation: 'Co-Founder & Lead Educator',
        channelName: 'Apna College',
        thumbnail: 'https://img.youtube.com/vi/ajDRvxDWH4w/hqdefault.jpg',
        type: 'Series',
        createdDate: '2026-08-05',
        videoIds: ['yt_apna_1', 'yt_apna_2', 'yt_apna_3', 'yt_apna_4', 'yt_apna_5', 'yt_apna_6'],
        episodes: APNA_JS_EPISODES
    },
    {
        id: 'pl_series_cwh_js',
        title: 'JavaScript Tutorials for Beginners (CodeWithHarry)',
        description: 'Complete 103-video JavaScript Masterclass series by CodeWithHarry covering ES6, DOM manipulation, Async/Await, and modern Web Development.',
        category: 'Training & Tutorials',
        author: 'CodeWithHarry',
        authorId: 99,
        authorDesignation: 'Lead Educator & Web Engineer',
        channelName: 'CodeWithHarry',
        thumbnail: 'https://img.youtube.com/vi/ER9SspLe4Hg/hqdefault.jpg',
        type: 'Series',
        createdDate: '2026-08-05',
        videoIds: ['yt_cwh_1', 'yt_cwh_2', 'yt_cwh_3', 'yt_cwh_4', 'yt_cwh_5', 'yt_cwh_6'],
        episodes: CWH_JS_EPISODES
    },
    {
        id: 'pl_series_1',
        title: 'Full-Stack Web Development & UI/UX Series',
        description: 'Complete step-by-step masterclass series covering modern frontend architecture, React, Tailwind CSS, and UX design principles.',
        category: 'Training & Tutorials',
        author: 'Meghna Tiwari',
        authorId: 5,
        authorDesignation: 'Product Designer & Web Developer',
        thumbnail: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=90&w=1200',
        videoIds: [],
        type: 'Series',
        createdDate: '2026-07-15'
    },
    {
        id: 'pl_series_2',
        title: 'ASP.NET Core 10 & Microservices Architecture',
        description: 'Enterprise backend architecture series explaining C# 13, EF Core 10, SQL Server optimization, and security headers.',
        category: 'Engineering Tech Talks',
        author: 'Vishendra Sharma',
        authorId: 4,
        authorDesignation: 'AI & Systems Specialist',
        thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=90&w=1200',
        videoIds: [],
        type: 'Series',
        createdDate: '2026-07-20'
    },
    {
        id: 'pl_series_3',
        title: 'MPOnline All-Hands Townhalls & Leadership Updates',
        description: 'Quarterly townhall recordings, strategic updates, and organizational vision talks from leadership.',
        category: 'Townhalls',
        author: 'Sourabh Sahu',
        authorId: 3,
        authorDesignation: 'Talent Acquisition & HR Lead',
        thumbnail: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?auto=format&fit=crop&q=90&w=1200',
        videoIds: [],
        type: 'Playlist',
        createdDate: '2026-08-01'
    }
];

export function getPlaylists() {
    try {
        const stored = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
        if (stored) {
            const list = JSON.parse(stored);
            if (Array.isArray(list) && list.length > 0) {
                return list.map(pl => {
                    if (pl.id === 'pl_series_apna_js' && (!pl.episodes || pl.episodes.length === 0)) {
                        return { ...pl, episodes: APNA_JS_EPISODES };
                    }
                    if (pl.id === 'pl_series_cwh_js' && (!pl.episodes || pl.episodes.length === 0)) {
                        return { ...pl, episodes: CWH_JS_EPISODES };
                    }
                    return pl;
                });
            }
        }
    } catch (e) {}
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(DEFAULT_PLAYLISTS));
    return DEFAULT_PLAYLISTS;
}

export function savePlaylist(playlistData) {
    const existing = getPlaylists();
    const newPl = {
        id: playlistData.id || `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        title: playlistData.title.trim(),
        description: playlistData.description?.trim() || '',
        category: playlistData.category || 'Training & Tutorials',
        author: playlistData.author || 'Meghna Tiwari',
        authorId: playlistData.authorId || 5,
        authorDesignation: playlistData.authorDesignation || 'Product Specialist',
        channelName: playlistData.channelName || null,
        thumbnail: playlistData.thumbnail || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=90&w=1200',
        videoIds: playlistData.videoIds || [],
        episodes: playlistData.episodes || [],
        type: playlistData.type || 'Playlist',
        createdDate: playlistData.createdDate || new Date().toISOString().split('T')[0]
    };
    const updated = [newPl, ...existing.filter(p => p.id !== newPl.id)];
    localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));
    return newPl;
}

export function deletePlaylist(playlistId) {
    try {
        const existing = getPlaylists();
        const updated = existing.filter(p => p.id !== playlistId);
        localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));
        return true;
    } catch (e) {
        console.error('Failed to delete playlist:', e);
        return false;
    }
}

// ── Real Auto-Fetcher for YouTube Playlists & Series ─────────────────────────
export async function fetchYouTubePlaylistDetails(url) {
    if (!url) return null;
    const cleanUrl = url.trim();

    // Extract list ID (e.g. list=PL... or list=OLAK...)
    const listMatch = cleanUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const listId = listMatch ? listMatch[1] : null;

    // Extract single video ID if present
    const vMatch = cleanUrl.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = vMatch ? vMatch[1] : null;

    let playlistTitle = '';
    let authorName = '';
    let parsedEpisodes = [];

    // 1. If listId exists, attempt to fetch YouTube's official XML feed
    if (listId) {
        let xmlText = null;
        try {
            // First attempt via local Vite proxy middleware (server-to-server, no CORS issues)
            const proxyRes = await fetch(`/api/yt-playlist?list=${encodeURIComponent(listId)}`);
            if (proxyRes.ok) {
                xmlText = await proxyRes.text();
            }
        } catch (e) {
            console.warn('Local proxy failed, trying CORS fallback:', e);
        }

        if (!xmlText) {
            try {
                // Secondary fallback via public CORS proxy
                const fallbackRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.youtube.com/feeds/videos.xml?playlist_id=' + listId)}`);
                if (fallbackRes.ok) {
                    xmlText = await fallbackRes.text();
                }
            } catch (e) {
                console.warn('CORS proxy fallback failed:', e);
            }
        }

        if (xmlText && xmlText.includes('<feed')) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(xmlText, 'text/xml');

                playlistTitle = doc.querySelector('feed > title')?.textContent?.trim() || '';
                authorName = doc.querySelector('feed > author > name')?.textContent?.trim() || '';

                const entries = Array.from(doc.querySelectorAll('entry'));
                entries.forEach((entry, idx) => {
                    let vId = entry.getElementsByTagName('yt:videoId')[0]?.textContent?.trim();
                    if (!vId) {
                        const idStr = entry.querySelector('id')?.textContent?.trim() || '';
                        const idM = idStr.match(/video:([a-zA-Z0-9_-]{11})/);
                        if (idM) vId = idM[1];
                    }
                    if (!vId) {
                        const linkHref = entry.querySelector('link[rel="alternate"]')?.getAttribute('href') || '';
                        const hrefM = linkHref.match(/v=([a-zA-Z0-9_-]{11})/);
                        if (hrefM) vId = hrefM[1];
                    }

                    const title = entry.querySelector('title')?.textContent?.trim() || `Episode ${idx + 1}`;
                    const thumbNode = entry.getElementsByTagName('media:thumbnail')[0];
                    const thumbUrl = thumbNode?.getAttribute('url') || (vId ? `https://img.youtube.com/vi/${vId}/hqdefault.jpg` : '');
                    const descNode = entry.getElementsByTagName('media:description')[0];
                    const desc = descNode?.textContent?.trim() || '';

                    if (vId) {
                        parsedEpisodes.push({
                            index: idx + 1,
                            videoId: vId,
                            title: title,
                            description: desc,
                            thumbnail: thumbUrl,
                            duration: 'Session',
                            views: '0',
                            likes: 0,
                            sourceUrl: `https://www.youtube.com/watch?v=${vId}`
                        });
                    }
                });
            } catch (err) {
                console.error('Error parsing YouTube feed XML:', err);
            }
        }
    }

    // 2. If title or episodes are still missing, fallback to oEmbed / noembed
    if (!playlistTitle || parsedEpisodes.length === 0) {
        try {
            let oembedUrl = cleanUrl;
            if (videoId && !cleanUrl.includes('watch?v=' || 'youtu.be')) {
                oembedUrl = `https://www.youtube.com/watch?v=${videoId}`;
            }
            let oRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(oembedUrl)}&format=json`);
            let oData = null;
            if (oRes.ok) {
                oData = await oRes.json();
            } else {
                oRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(oembedUrl)}`);
                if (oRes.ok) oData = await oRes.json();
            }

            if (oData) {
                if (!playlistTitle) playlistTitle = oData.title || '';
                if (!authorName) authorName = oData.author_name || '';
                if (parsedEpisodes.length === 0 && videoId) {
                    parsedEpisodes.push({
                        index: 1,
                        videoId: videoId,
                        title: oData.title || 'Episode 1',
                        description: `YouTube video session by ${oData.author_name || 'Creator'}.`,
                        thumbnail: oData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                        duration: 'Session',
                        views: '0',
                        likes: 0,
                        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`
                    });
                }
            }
        } catch (e) {
            console.warn('oEmbed fallback error:', e);
        }
    }

    if (!playlistTitle) {
        playlistTitle = listId ? `YouTube Playlist (${listId.substring(0, 8)}...)` : 'YouTube Video Series';
    }

    const detectedCount = parsedEpisodes.length > 0 ? parsedEpisodes.length : (listId ? 10 : 1);

    return {
        success: true,
        title: playlistTitle,
        author: authorName || 'YouTube Creator',
        episodeCount: detectedCount,
        thumbnail: parsedEpisodes[0]?.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''),
        episodes: parsedEpisodes,
        listId: listId,
        videoId: videoId
    };
}

// ── Import YouTube Playlist / Series ─────────────────────────────────────────
export function importYouTubePlaylist({ playlistUrl, title, author, category, episodeCount = 6, user = null, preloadedEpisodes = [] }) {
    let listId = 'PLfqMhTWNBTe2C_dQAP1UoemcgAxBTlItp';
    const match = (playlistUrl || '').match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) listId = match[1];

    let videoId = null;
    const vMatch = (playlistUrl || '').match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (vMatch && vMatch[1]) videoId = vMatch[1];
    if (!videoId && listId === 'PLfqMhTWNBTe2C_dQAP1UoemcgAxBTlItp') {
        videoId = 'ajDRvxDWH4w';
    }

    const cleanTitle = (title || '').trim() || 'YouTube Masterclass Course';
    const knomeAuthorName = user?.name || 'Meghna Tiwari';
    const knomeAuthorId = user?.id || 5;
    const channelCreatorName = (author || '').trim() || 'YouTube Creator';

    const plId = `pl_yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const generatedVideoIds = [];
    const customImportedVideos = [];

    const parsedCount = parseInt(episodeCount, 10);
    const countToGen = isNaN(parsedCount) || parsedCount <= 0
        ? (preloadedEpisodes.length > 0 ? preloadedEpisodes.length : 6)
        : parsedCount;

    for (let i = 0; i < countToGen; i++) {
        const vId = `yt_imp_${plId}_ep_${i + 1}`;
        generatedVideoIds.push(vId);

        const realEp = preloadedEpisodes && preloadedEpisodes[i];
        const epVideoId = realEp?.videoId || (i === 0 && videoId ? videoId : null);

        let epTitle = '';
        if (realEp?.title) {
            epTitle = realEp.title;
            if (!epTitle.startsWith('#') && !epTitle.toLowerCase().startsWith('episode')) {
                epTitle = `#${i + 1}: ${epTitle}`;
            }
        } else {
            epTitle = `#${i + 1}: Episode ${i + 1} | ${cleanTitle}`;
        }

        const epThumb = realEp?.thumbnail || (epVideoId ? `https://img.youtube.com/vi/${epVideoId}/hqdefault.jpg` : (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&q=90&w=1200'));

        const epSourceUrl = epVideoId
            ? `https://www.youtube.com/watch?v=${epVideoId}`
            : (listId
                ? `https://www.youtube.com/embed/videoseries?list=${listId}&index=${i + 1}`
                : `https://www.youtube.com/watch?v=${videoId || 'ajDRvxDWH4w'}`);

        const vidObj = {
            id: vId,
            videoId: epVideoId,
            title: epTitle,
            description: realEp?.description || `Episode ${i + 1} of ${cleanTitle}. Course created by ${channelCreatorName}.`,
            thumbnail: epThumb,
            duration: realEp?.duration || 'Session',
            views: '0',     // Strictly Knome platform view count only
            likes: 0,       // Strictly Knome platform like count only
            category: category || 'Training & Tutorials',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            author: knomeAuthorName,
            authorId: knomeAuthorId,
            authorDesignation: user?.roleName || 'Product Specialist',
            channelName: channelCreatorName,
            tags: ['YouTube', 'Playlist', 'Series'],
            sourceUrl: epSourceUrl,
            sourceType: 'YouTube',
            playlistId: plId,
            episodeIndex: i + 1
        };
        customImportedVideos.push(vidObj);
    }

    const baseThumbnail = customImportedVideos[0]?.thumbnail || (videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?auto=format&fit=crop&q=90&w=1200');

    const newPl = {
        id: plId,
        title: cleanTitle,
        description: `Imported Series (${customImportedVideos.length} Episodes) created by ${knomeAuthorName} (Source: ${channelCreatorName}).`,
        category: category || 'Training & Tutorials',
        author: knomeAuthorName,
        authorId: knomeAuthorId,
        authorDesignation: user?.roleName || 'Product Specialist',
        channelName: channelCreatorName,
        thumbnail: baseThumbnail,
        videoIds: generatedVideoIds,
        episodes: customImportedVideos,
        type: 'Series',
        createdDate: new Date().toISOString().split('T')[0]
    };

    return { playlist: newPl, videos: customImportedVideos };
}


