// Role-Based User Manuals & Enterprise PDF Generation Pipeline for MPOnline Knome
// Provides structured operational manuals, standard operating procedures (SOPs), and PDF export.

export const ROLE_USER_MANUALS = {
    employee: {
        roleKey: 'employee',
        title: 'Standard Employee User Manual',
        docId: 'MPO-KNOME-SOP-EMP-2026',
        version: 'v2.4 (2026)',
        classification: 'Internal Workplace Guide',
        lastUpdated: 'September 2026',
        executiveSummary: 'This manual provides comprehensive standard operating procedures for all MPOnline employees using the Knome Enterprise Knowledge Platform. It covers daily knowledge publishing, articles, multimedia learning channels, community collaboration, post scheduling, DPDP Act privacy safeguards, and karma gamification progression.',
        chapters: [
            {
                chapterNumber: 1,
                title: 'Workplace Identity & Profile Governance',
                icon: 'person',
                summary: 'Establishing your employee profile, technical skills portfolio, and configuring personal privacy settings.',
                sections: [
                    {
                        heading: '1.1 Employee Profile Setup',
                        content: 'Your Knome profile represents your professional identity within MPOnline. Keep your profile up to date by navigating to your Profile page and clicking "Edit Profile".',
                        points: [
                            'Designation & Department: Automatically synchronized with MPOnline HRMS records.',
                            'Professional Bio: Summarize your role, core responsibilities, and technical domains.',
                            'Skills & Expertise Tags: Add up to 10 key skill tags (e.g., ASP.NET Core, React, DevOps, e-Governance) to enable colleagues to discover your expertise.',
                            'Banner & Avatar Customization: Upload a professional cover photo and portrait avatar.'
                        ]
                    },
                    {
                        heading: '1.2 DPDP Act 2023 Privacy Controls',
                        content: 'In strict compliance with the Digital Personal Data Protection (DPDP) Act 2023, Knome provides self-service data privacy toggles under Edit Profile:',
                        points: [
                            'Bio Visibility: Toggle whether your personal summary is visible organization-wide or restricted.',
                            'Profile Photo Visibility: Configure avatar display preferences for departmental vs organization-wide views.',
                            'Activity Privacy: Choose whether your participation in public community spaces displays on your central profile timeline.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 2,
                title: 'Home Feed & Real-Time Content Publishing',
                icon: 'dynamic_feed',
                summary: 'Creating posts, tagging colleagues, adding rich attachments, and selecting targeted audiences.',
                sections: [
                    {
                        heading: '2.1 Publishing a Feed Post',
                        content: 'The Home feed enables fast, interactive knowledge sharing across the entire organization:',
                        steps: [
                            'Click the "Create Post" box on the Home feed or Posts page.',
                            'Write your post content (up to 400 characters for quick updates).',
                            'Use @mentions (type @ followed by a colleague\'s name) to directly notify specific team members.',
                            'Add #hashtags (e.g., #MPOnline, #DotNet10, #KnowledgeShare) to categorize your post for search discovery.'
                        ]
                    },
                    {
                        heading: '2.2 Attachment Capacities & Media Formats',
                        content: 'Knome supports high-capacity enterprise file attachments directly inside feed posts:',
                        points: [
                            'Images: JPEG, PNG, WebP up to 25MB per image.',
                            'Videos: MP4, MOV, WebM up to 500MB with built-in streaming preview.',
                            'Audio: MP3, WAV, AAC up to 100MB for voice notes and short podcasts.',
                            'Documents: PDF, DOCX, XLSX, PPTX up to 400MB for detailed project deliverables.'
                        ]
                    },
                    {
                        heading: '2.3 Targeted Post Audiences',
                        content: 'Before publishing, select the appropriate audience scope to ensure information reaches the right colleagues:',
                        points: [
                            'Everyone (Public): Broadcasts to all MPOnline employees on the central feed.',
                            'Specific Community: Restricts post visibility exclusively to members of the selected community.',
                            'Specific Person / Connections: Private knowledge share visible strictly to targeted colleagues.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 3,
                title: 'Post & Article Scheduling Pipeline',
                icon: 'schedule',
                summary: 'Planning and scheduling content in advance with native background queue execution.',
                sections: [
                    {
                        heading: '3.1 How Post Scheduling Works',
                        content: 'Knome features an enterprise-grade background scheduling engine allowing you to compose content today and publish at optimal engagement times.',
                        steps: [
                            'While composing a post or writing an article, click the Clock (Schedule) icon.',
                            'Choose a quick preset (+1 Min, Tonight 8 PM, Tomorrow 9 AM) or select a custom date and time.',
                            'Confirm the scheduled time. The item will be saved with "Scheduled" status.',
                            'Privacy Guarantee: Scheduled items remain strictly private to you. No other user can see your content until the release timestamp.'
                        ]
                    },
                    {
                        heading: '3.2 Managing Scheduled Content',
                        content: 'Navigate to the "⏰ Scheduled" tab on the Posts or Articles page to view all your queued releases. From here you can:',
                        points: [
                            'Publish Now: Bypass the scheduled timer and release immediately.',
                            'Reschedule: Adjust the release date/time to a new target slot.',
                            'Cancel to Drafts: Return the item to your private drafts for further editing.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 4,
                title: 'Long-Form Articles',
                icon: 'article',
                summary: 'Authoring in-depth technical documentation, post-mortems, and thought leadership articles.',
                sections: [
                    {
                        heading: '4.1 Rich Text Editor Capabilities',
                        content: 'Articles are designed for deep knowledge preservation. The built-in rich text editor provides:',
                        points: [
                            'Typography Controls: Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U).',
                            'Lists: Ordered numbered lists and unordered bulleted checklists.',
                            'Formatting: Blockquotes for highlights and code blocks for technical snippets.',
                            'Cover Banners: High-resolution header images that display prominently in article discovery cards.',
                            'Read Time Computation: Knome automatically calculates estimated reading minutes based on word count.'
                        ]
                    },
                    {
                        heading: '4.2 Category Tagging & Approval',
                        content: 'Select an accurate category (Engineering, Governance, Cloud, Architecture, HR Policies) to ensure your article appears in the relevant departmental knowledge repositories.'
                    }
                ]
            },
            {
                chapterNumber: 5,
                title: 'Multimedia Knowledge Channels (Videos & Podcasts)',
                icon: 'play_circle',
                summary: 'Consuming and publishing video demonstrations, podcasts, and curated knowledge series.',
                sections: [
                    {
                        heading: '5.1 Video Streaming Hub',
                        content: 'Upload walkthroughs, software demos, and town hall recordings directly (MP4/MOV up to 500MB) or link external YouTube references. Features include interactive comment timelines, like reactions, and full-screen playback.'
                    },
                    {
                        heading: '5.2 Podcasts & Audio Learning',
                        content: 'Listen to episodic discussions, technical lectures, and leadership messages on demand. Stream in the background while multitasking on other work.'
                    },
                    {
                        heading: '5.3 Bookmarking & Saved Content',
                        content: 'Click the Bookmark icon on any post, article, video, or podcast to save it to your personal "Saved Content" library for offline reference and future review.'
                    }
                ]
            },
            {
                chapterNumber: 6,
                title: 'Communities & Departmental Collaboration',
                icon: 'groups',
                summary: 'Participating in Org, Public, and Private community channels and submitting new community proposals.',
                sections: [
                    {
                        heading: '6.1 Community Categories',
                        points: [
                            'Org Communities: Mandatory organization-wide channels (e.g., MPOnline Official, Announcements) where all employees are automatically enrolled.',
                            'Public Communities: Open interest groups that any employee can join with a single click.',
                            'Private Communities: Specialized project or departmental spaces requiring membership approval from the Community Administrator.'
                        ]
                    },
                    {
                        heading: '6.2 Proposing a New Community',
                        content: 'Employees can propose new communities by clicking "Create Community". Provide a title, description, category, and banner. Your proposal enters the Administration Review Queue and is activated upon Administration approval.'
                    }
                ]
            },
            {
                chapterNumber: 7,
                title: 'Karma Gamification & Contributor Tiers',
                icon: 'military_tech',
                summary: 'Earning recognition, points matrix breakdown, tier milestones, and leaderboard rankings.',
                sections: [
                    {
                        heading: '7.1 Karma Points Matrix',
                        content: 'Karma reflects your positive contribution to MPOnline\'s organizational knowledge base. Points are awarded as follows:',
                        table: [
                            { action: 'Publish a Feed Post', points: '+2 Points', condition: 'Awarded upon publication' },
                            { action: 'Author a Rich Article', points: '+5 Points', condition: 'Awarded upon publication' },
                            { action: 'Upload Video / Podcast', points: '+3 Points', condition: 'Awarded upon media upload' },
                            { action: 'Receive a Reaction / Like', points: '+1 Point', condition: 'Per unique colleague reaction' },
                            { action: 'Receive a Comment', points: '+1 Point', condition: 'Per constructive comment received' }
                        ]
                    },
                    {
                        heading: '7.2 Contributor Tier Milestones',
                        points: [
                            '🔰 Starter Tier: 0 – 99 Points (New employee welcome badge)',
                            '🥉 Bronze Tier: 100 – 249 Points (Active collaborator)',
                            '🥈 Silver Tier: 250 – 499 Points (Established contributor)',
                            '🥇 Gold Tier: 500 – 999 Points (Subject Matter Expert)',
                            '💎 Platinum Tier: 1,000+ Points (Distinguished Enterprise Contributor)'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 8,
                title: 'Workplace Conduct, Safety & Incident Escalation',
                icon: 'gavel',
                summary: 'Standards of ethical behavior, reporting abusive content, and administrative escalation.',
                sections: [
                    {
                        heading: '8.1 Code of Conduct',
                        content: 'All interactions on Knome must remain professional, respectful, and constructive. Discriminatory remarks, harassment, unauthorized distribution of confidential client records, or deliberate misinformation will result in disciplinary action.'
                    },
                    {
                        heading: '8.2 Reporting Inappropriate Content',
                        content: 'If you encounter content violating workplace guidelines, click the three-dots (...) menu on the item and select "Report Content". Provide a clear reason. The item is queued immediately for System Administrator investigation while your reporter identity is kept strictly confidential.'
                    }
                ]
            }
        ]
    },

    communityAdmin: {
        roleKey: 'communityAdmin',
        title: 'Community Administrator Governance Manual',
        docId: 'MPO-KNOME-SOP-CADM-2026',
        version: 'v2.2 (2026)',
        classification: 'Channel Administration SOP',
        lastUpdated: 'September 2026',
        executiveSummary: 'This standard operating procedure governs Community Administrators across MPOnline. It defines duties for managing community membership approvals, curating pinned announcements, moderating channel safety, setting community guidelines & FAQs, and enforcing channel-level disciplinary actions.',
        chapters: [
            {
                chapterNumber: 1,
                title: 'Community Administrator Mandate & Responsibilities',
                icon: 'shield_person',
                summary: 'Core duties, leadership accountability, and maintaining an engaging departmental knowledge channel.',
                sections: [
                    {
                        heading: '1.1 Role Overview',
                        content: 'As a Community Administrator, you are the steward of your designated community. You are responsible for ensuring high content quality, welcoming new members, upholding professional discussion standards, and resolving member queries promptly.'
                    },
                    {
                        heading: '1.2 Key Administrative Priorities',
                        points: [
                            'Review and action pending membership requests within 24–48 hours.',
                            'Maintain up-to-date Community Guidelines and customized FAQs.',
                            'Curate pinned announcements to highlight critical departmental updates.',
                            'Enforce constructive discussion and apply channel-level moderation when required.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 2,
                title: 'Membership Request Queue & Approvals',
                icon: 'how_to_reg',
                summary: 'Evaluating, approving, and rejecting access requests for Private communities.',
                sections: [
                    {
                        heading: '2.1 Processing Pending Requests',
                        steps: [
                            'Navigate to your Community page and select the "Members" or "Pending Requests" tab.',
                            'Review applicant details: Employee Name, Department, and Designation.',
                            'Click "Approve" to immediately grant full membership and posting privileges.',
                            'Click "Decline" if the applicant does not belong to the project group or department. Provide a brief reason for transparency.'
                        ]
                    },
                    {
                        heading: '2.2 Member Directory & Role Assignments',
                        content: 'Inspect the active member roster, search for colleagues by name or designation, and ensure proper channel representation.'
                    }
                ]
            },
            {
                chapterNumber: 3,
                title: 'Curating Pinned Posts & Announcements',
                icon: 'push_pin',
                summary: 'Highlighting crucial announcements at the top of the community timeline.',
                sections: [
                    {
                        heading: '3.1 The 3-Pinned Posts Rule',
                        content: 'To prevent feed clutter, Knome limits pinned announcements to a maximum of 3 active posts per community at any time.',
                        points: [
                            'To pin a post: Click the three-dots (...) menu on the relevant post and select "Pin Post".',
                            'Pinned posts display with a distinctive banner at the top of the community feed.',
                            'If 3 posts are already pinned, unpin an older notice before pinning a new one.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 4,
                title: 'Community Guidelines, Rules & FAQ Customization',
                icon: 'fact_check',
                summary: 'Establishing clear participation rules and answering common channel questions.',
                sections: [
                    {
                        heading: '4.1 Managing Channel Guidelines',
                        content: 'Under Community Settings ➔ Rules & FAQs, configure clear posting policies, accepted topic domains, and submission formats so members understand channel expectations.'
                    },
                    {
                        heading: '4.2 Adding Channel FAQs',
                        content: 'Create dedicated Q&A entries addressing repetitive questions (e.g., meeting cadence, code repository links, documentation standards).'
                    }
                ]
            },
            {
                chapterNumber: 5,
                title: 'Channel-Level Disciplinary Actions & Suspensions',
                icon: 'block',
                summary: 'Isolating non-compliant members without disrupting their global platform access.',
                sections: [
                    {
                        heading: '5.1 Community-Level Suspension vs Global System Suspension',
                        content: 'Knome maintains a strict two-tier suspension architecture:',
                        points: [
                            'Community Suspension: Restricts an employee from posting, commenting, or interacting strictly inside your specific community. The employee retains full platform access across other communities and company feeds.',
                            'Global System Suspension: Reserved exclusively for System Administrators for severe organization-wide violations.'
                        ]
                    },
                    {
                        heading: '5.2 Suspending a Member',
                        steps: [
                            'Open the Community Members tab and locate the user.',
                            'Click "Suspend Member from Community".',
                            'Select the suspension duration and provide a clear justification.',
                            'The user is notified and marked with a "Suspended" badge inside this community.'
                        ]
                    }
                ]
            }
        ]
    },

    hrAdmin: {
        roleKey: 'hrAdmin',
        title: 'HR Administrator Operations Manual',
        docId: 'MPO-KNOME-SOP-HR-2026',
        version: 'v2.1 (2026)',
        classification: 'HR Governance & Operations SOP',
        lastUpdated: 'September 2026',
        executiveSummary: 'This manual establishes operational protocols for HR Administrators on the Knome platform. It details end-to-end workflows for managing internal job openings, publishing organization-wide notification broadcasts, reviewing employee community proposals, and monitoring workforce analytics.',
        chapters: [
            {
                chapterNumber: 1,
                title: 'HR Administrator Mandate & Strategic Scope',
                icon: 'badge',
                summary: 'Strategic oversight of internal talent mobility, communication broadcasts, and community catalog.',
                sections: [
                    {
                        heading: '1.1 Core Strategic Objectives',
                        points: [
                            'Facilitate transparent internal career mobility across MPOnline departments.',
                            'Disseminate timely, authoritative company announcements via broadcast banners.',
                            'Curate the official community catalog to foster cross-departmental innovation.',
                            'Analyze workforce engagement metrics to identify collaboration trends.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 2,
                title: 'Internal Job Openings & Career Mobility',
                icon: 'work',
                summary: 'Creating, updating, and managing internal career opportunities.',
                sections: [
                    {
                        heading: '2.1 Creating an Internal Job Posting',
                        steps: [
                            'Navigate to the "Openings" portal and click "Post New Opening".',
                            'Specify Job Title, Hiring Department, Location, and Employment Type (Full-Time, Contract, Deputation).',
                            'Detail Requirements: Experience level, core qualifications, and key skills.',
                            'Set Application Deadline: The system automatically marks listings as expired after this date.',
                            'Click "Publish Opening" to make it immediately visible to all employees.'
                        ]
                    },
                    {
                        heading: '2.2 Managing Existing Openings',
                        content: 'HR Administrators can edit active job criteria, extend application deadlines, or mark positions as Filled / Closed directly from the Openings management table.'
                    }
                ]
            },
            {
                chapterNumber: 3,
                title: 'Organization-Wide Notification Broadcasts',
                icon: 'campaign',
                summary: 'Publishing high-priority broadcast banners across the entire organization.',
                sections: [
                    {
                        heading: '3.1 Broadcast Workflow',
                        content: 'Broadcasts are reserved for critical corporate communications such as town halls, holiday announcements, emergency IT maintenance, or policy updates.',
                        steps: [
                            'Open the HR Admin Console and select "Broadcasts".',
                            'Draft the broadcast headline and detailed announcement text.',
                            'Select Priority Level: Normal, High, or Urgent Alert.',
                            'Broadcasts display prominently at the top of the feed for every employee and generate instant system notifications.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 4,
                title: 'Community Review & Approval Queue',
                icon: 'rule',
                summary: 'Reviewing employee proposals to create new communities.',
                sections: [
                    {
                        heading: '4.1 Evaluating Community Proposals',
                        content: 'When an employee proposes a new community, it enters the HR Community Review Queue:',
                        points: [
                            'Review the proposed Community Title, Scope Description, and Target Category.',
                            'Check for duplication against existing active communities.',
                            'Verify designated Community Administrators.',
                            'Approve: The community becomes active immediately and appears in the public catalog.',
                            'Reject / Request Revision: Provide constructive feedback if the community duplicates existing channels or requires scope refinement.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 5,
                title: 'Workforce Analytics & Engagement Dashboards',
                icon: 'insights',
                summary: 'Reviewing cross-departmental collaboration, active contributors, and knowledge velocity.',
                sections: [
                    {
                        heading: '5.1 Key Analytics Metrics',
                        points: [
                            'Knowledge Velocity: Number of posts, articles, and media uploaded per department.',
                            'Top Contributors: Identification of employees reaching Gold and Platinum Karma tiers.',
                            'Community Growth: Member adoption rates across public and org communities.'
                        ]
                    }
                ]
            }
        ]
    },

    systemAdmin: {
        roleKey: 'systemAdmin',
        title: 'System Administrator Security & Master Governance Manual',
        docId: 'MPO-KNOME-SOP-SYS-2026',
        version: 'v3.0 (2026)',
        classification: 'Master Security & Governance SOP',
        lastUpdated: 'September 2026',
        executiveSummary: 'This master standard operating procedure governs System Administrators on Knome. It defines protocols for user identity & role assignment, global account suspensions, content moderation queues, reporter identity confidentiality, immutable audit logging, and master rules/FAQ editing.',
        chapters: [
            {
                chapterNumber: 1,
                title: 'System Administrator Master Governance Mandate',
                icon: 'admin_panel_settings',
                summary: 'Ultimate platform authority, security policy enforcement, and infrastructure health.',
                sections: [
                    {
                        heading: '1.1 System Authority & Accountability',
                        content: 'System Administrators hold top-level administrative authority across MPOnline Knome. You are responsible for ensuring high availability, bulletproof cybersecurity, strict access governance, and impartial content moderation.'
                    },
                    {
                        heading: '1.2 Operational Rules',
                        points: [
                            'All administrative actions are permanently recorded in the immutable audit trail.',
                            'Suspensions and role escalations must always include written justifications.',
                            'Reporter confidentiality is legally protected under whistleblowing and DPDP Act standards.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 2,
                title: 'User Governance & Role Management',
                icon: 'manage_accounts',
                summary: 'Assigning, escalating, and auditing user roles across the organization.',
                sections: [
                    {
                        heading: '2.1 Role Hierarchy & Permissions',
                        points: [
                            'Employee: Standard self-service access, content publishing, community participation.',
                            'Community Admin: Channel governance, membership approvals, pinned announcements.',
                            'HR Admin: Talent openings, org broadcasts, community proposal approvals, Analytics.',
                            'System Admin: Full security authority, account suspensions, moderation queue, audit trail.'
                        ]
                    },
                    {
                        heading: '2.2 Modifying User Roles',
                        content: 'Navigate to Admin Console ➔ User Management to search for employees by Employee ID or Name, inspect assigned roles, and modify permissions as authorized by MPOnline IT Security.'
                    }
                ]
            },
            {
                chapterNumber: 3,
                title: 'Global Account Suspensions Protocol',
                icon: 'lock_person',
                summary: 'Suspending compromised or non-compliant user accounts with immediate lockout.',
                sections: [
                    {
                        heading: '3.1 Suspension Protocol Execution',
                        steps: [
                            'Locate the user in Admin Console ➔ User Management.',
                            'Click "Suspend Account".',
                            'Select Suspension Type: Temporary (specify days) or Indefinite.',
                            'Enter Mandatory Justification: Reference audit report or disciplinary code.',
                            'Effect: User\'s active JWT session is immediately revoked. Any subsequent login attempt is blocked with a security lockout notice.'
                        ]
                    },
                    {
                        heading: '3.2 Reinstating Suspended Accounts',
                        content: 'Upon resolution of the disciplinary review, click "Reinstate Account" and provide an audit justification to restore full access.'
                    }
                ]
            },
            {
                chapterNumber: 4,
                title: 'Content Moderation Reports Queue',
                icon: 'report',
                summary: 'Investigating flagged content, protecting reporter confidentiality, and remediation actions.',
                sections: [
                    {
                        heading: '4.1 Reviewing Flagged Reports',
                        content: 'The Moderation Queue displays items flagged by employees or automated safety filters:',
                        points: [
                            'Investigate Content: Inspect original post, article, media, or comment in full context.',
                            'Reporter Identity Confidentiality: Reporter details are strictly segregated to protect reporting employees from workplace retaliation.',
                            'Dismiss Flag: Mark report as false positive if content adheres to community guidelines.',
                            'Remove Content: Permanently soft-delete infringing content with an audit notification to the author.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 5,
                title: 'Immutable Audit Trail & Compliance Logging',
                icon: 'history_edu',
                summary: 'Inspecting tamper-proof system logs for regulatory and governance compliance.',
                sections: [
                    {
                        heading: '5.1 Audit Log Architecture',
                        content: 'Every critical transaction generates a tamper-evident audit record containing Timestamp (UTC & IST), Actor Employee ID, Action Category, Target Entity, IP Address, and Change Delta.',
                        points: [
                            'Filter by Date Range, Severity Level (Info, Warning, Critical), or Action Type.',
                            'Export audit logs for external ISO/IEC compliance and governance reviews.'
                        ]
                    }
                ]
            },
            {
                chapterNumber: 6,
                title: 'Global FAQ & Operating Rules Master Editor',
                icon: 'edit_note',
                summary: 'Customizing rules, scope descriptions, and FAQ questions for all 4 roles.',
                sections: [
                    {
                        heading: '6.1 Master Rule Editor Capabilities',
                        content: 'As System Administrator, opening the FAQ Handbook reveals the "Edit Rules & FAQs" control. You can update role scope descriptions, add new FAQ items, edit existing questions/answers, or reset any role back to factory defaults in real time.'
                    }
                ]
            }
        ]
    }
};

/**
 * Enterprise PDF Exporter for Knome Role Manuals
 * Generates a clean, vector-rendered printable document in a hidden iframe and triggers window.print().
 */
export function printRoleManualPdf(roleKey, manualData, roleFaqs = [], roleMeta = {}) {
    const manual = manualData || ROLE_USER_MANUALS[roleKey] || ROLE_USER_MANUALS.employee;
    const title = roleMeta.title || manual.title;
    const docId = manual.docId || `MPO-KNOME-SOP-${roleKey.toUpperCase()}-2026`;
    const currentDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    // Build Table of Contents HTML
    const tocHtml = manual.chapters.map((ch) => `
        <li style="margin-bottom: 6px; font-size: 12px; color: #1e293b;">
            <strong>Chapter ${ch.chapterNumber}:</strong> ${ch.title}
        </li>
    `).join('');

    // Build Chapters HTML
    const chaptersHtml = manual.chapters.map((ch) => `
        <div class="chapter-block" style="margin-bottom: 24px; page-break-inside: avoid;">
            <div style="display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px;">
                <span style="background: #4338ca; color: #ffffff; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
                    Chapter ${ch.chapterNumber}
                </span>
                <h2 style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                    ${ch.title}
                </h2>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 0; margin-bottom: 12px; font-style: italic;">
                ${ch.summary}
            </p>

            ${ch.sections.map((sec) => `
                <div style="margin-bottom: 14px;">
                    <h3 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #1e293b;">
                        ${sec.heading}
                    </h3>
                    ${sec.content ? `<p style="margin: 0 0 6px 0; font-size: 12px; line-height: 1.55; color: #334155;">${sec.content}</p>` : ''}
                    
                    ${sec.points ? `
                        <ul style="margin: 4px 0 8px 18px; padding: 0; font-size: 12px; line-height: 1.5; color: #334155;">
                            ${sec.points.map(pt => `<li style="margin-bottom: 4px;">${pt}</li>`).join('')}
                        </ul>
                    ` : ''}

                    ${sec.steps ? `
                        <ol style="margin: 4px 0 8px 18px; padding: 0; font-size: 12px; line-height: 1.5; color: #334155;">
                            ${sec.steps.map(st => `<li style="margin-bottom: 4px;">${st}</li>`).join('')}
                        </ol>
                    ` : ''}

                    ${sec.table ? `
                        <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px;">
                            <thead>
                                <tr style="background: #f1f5f9; text-align: left;">
                                    <th style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 800;">Action / Contribution</th>
                                    <th style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 800; text-align: center;">Karma Award</th>
                                    <th style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 800;">Award Condition</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sec.table.map(row => `
                                    <tr>
                                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">${row.action}</td>
                                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center; color: #4338ca; font-weight: 800;">${row.points}</td>
                                        <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #475569;">${row.condition}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');

    // Build FAQ Appendix HTML
    const faqAppendixHtml = roleFaqs.length > 0 ? `
        <div style="page-break-before: always; margin-top: 30px;">
            <div style="border-bottom: 2px solid #4338ca; padding-bottom: 6px; margin-bottom: 14px;">
                <span style="background: #4338ca; color: #ffffff; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
                    Official Reference Appendix
                </span>
                <h2 style="margin: 6px 0 0 0; font-size: 16px; font-weight: 800; color: #0f172a;">
                    Frequently Asked Questions (FAQ) — ${title}
                </h2>
            </div>
            ${roleFaqs.map((faq, idx) => `
                <div style="margin-bottom: 14px; page-break-inside: avoid; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;">
                    <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #4338ca; margin-bottom: 4px;">
                        Q${idx + 1} • [${faq.category || 'General'}]
                    </div>
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                        ${faq.question}
                    </div>
                    <div style="font-size: 11.5px; line-height: 1.55; color: #334155; white-space: pre-line;">
                        ${faq.answer}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';

    const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MPOnline_Knome_${title.replace(/\s+/g, '_')}_User_Manual_2026</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 18mm 15mm 18mm 15mm;
            @bottom-center {
                content: "MPOnline Limited • Knome Platform Standard Operating Procedure • Page " counter(page);
                font-size: 9px;
                color: #64748b;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.5;
        }
        .header-table {
            width: 100%;
            border-bottom: 3px solid #1e293b;
            padding-bottom: 12px;
            margin-bottom: 18px;
        }
        .doc-title {
            font-size: 20px;
            font-weight: 900;
            color: #0f172a;
            margin: 0 0 4px 0;
            letter-spacing: -0.3px;
        }
        .doc-subtitle {
            font-size: 13px;
            font-weight: 700;
            color: #4338ca;
            margin: 0 0 6px 0;
        }
        .meta-pill {
            display: inline-block;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            color: #334155;
            margin-right: 6px;
        }
        .exec-summary {
            background: #f8fafc;
            border-left: 4px solid #4338ca;
            padding: 10px 14px;
            margin-bottom: 20px;
            border-radius: 0 6px 6px 0;
        }
        .toc-box {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 18px;
            margin-bottom: 24px;
            page-break-inside: avoid;
        }
        .footer-note {
            margin-top: 30px;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            font-size: 10px;
            color: #94a3b8;
            text-align: center;
        }
        @media print {
            body {
                background: #ffffff !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .chapter-block {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>

    <!-- Header Section -->
    <table class="header-table" cellpadding="0" cellspacing="0">
        <tr>
            <td style="vertical-align: top;">
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 4px;">
                    MPOnline Limited • Government of Madhya Pradesh & TCS Joint Venture
                </div>
                <h1 class="doc-title">${title}</h1>
                <div class="doc-subtitle">Knome Enterprise Knowledge Platform • Standard Operating Procedure (SOP)</div>
                <div style="margin-top: 6px;">
                    <span class="meta-pill">Document ID: ${docId}</span>
                    <span class="meta-pill">Version: ${manual.version}</span>
                    <span class="meta-pill">Classification: ${manual.classification}</span>
                    <span class="meta-pill">Generated: ${currentDate}</span>
                </div>
            </td>
            <td style="vertical-align: top; text-align: right; width: 140px;">
                <div style="display: inline-block; background: #0f172a; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-weight: 900; font-size: 13px; letter-spacing: 0.5px;">
                    KNOME
                </div>
                <div style="font-size: 9px; color: #64748b; margin-top: 4px; font-weight: 600;">
                    MPOnline Knowledge System
                </div>
            </td>
        </tr>
    </table>

    <!-- Executive Summary -->
    <div class="exec-summary">
        <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4338ca; margin-bottom: 4px;">
            Executive Operational Scope
        </div>
        <div style="font-size: 12px; line-height: 1.55; color: #1e293b;">
            ${manual.executiveSummary}
        </div>
    </div>

    <!-- Table of Contents -->
    <div class="toc-box">
        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            📋 Table of Contents
        </div>
        <ul style="margin: 0; padding-left: 18px;">
            ${tocHtml}
            ${roleFaqs.length > 0 ? '<li style="margin-bottom: 6px; font-size: 12px; color: #1e293b;"><strong>Appendix:</strong> Frequently Asked Questions (FAQ) Reference</li>' : ''}
        </ul>
    </div>

    <!-- Chapters Content -->
    ${chaptersHtml}

    <!-- FAQ Appendix -->
    ${faqAppendixHtml}

    <!-- Legal & Compliance Footer -->
    <div class="footer-note">
        This document is an official operational manual of MPOnline Limited. Strictly for internal employee use and authorized operational governance.
        <br>© 2026 MPOnline Limited. All rights reserved. • State IT Park, Abbas Nagar near RGPV, Gandhi Nagar, Bhopal 462033
    </div>

    <script>
        window.addEventListener('load', function() {
            setTimeout(function() {
                window.focus();
                window.print();
            }, 300);
        });
    </script>
</body>
</html>`;

    // Render inside a hidden iframe to initiate clean browser print without altering active DOM
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.id = 'knome_manual_pdf_iframe';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlDocument);
    doc.close();

    // Clean up iframe after print dialog completes
    setTimeout(() => {
        try {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        } catch (_) {}
    }, 60000);
}
