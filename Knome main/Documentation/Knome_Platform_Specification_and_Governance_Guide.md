# KNOME ENTERPRISE PLATFORM
## Functional Specification, Module Architecture & Governance Permission Matrix

**Organization:** MPOnline Limited  
**Prepared For:** Management & Executive Leadership  
**Prepared By:** Enterprise Engineering & Product Team  
**System Architecture:** Knome Enterprise Core (v2.5) — React 19 / ASP.NET Core 10 / Microsoft SQL Server  
**Date:** October 2026  

---

## 1. Executive Summary & Strategic Purpose

**Knome** is MPOnline's premier internal enterprise knowledge, engagement, and collaboration platform. It consolidates the communication and knowledge-sharing patterns of the world's leading digital ecosystems into a single, unified, secure intranet portal:

| # | Industry Benchmark | Knome Module(s) | Publishing Model |
| :---: | :--- | :--- | :--- |
| 1 | **LinkedIn** | Posts, Clips | Direct Publish |
| 2 | **Stack Overflow** | Articles | Moderator Approval Required |
| 3 | **TCS Knome** | Wiki | Moderator Approval Required |
| 4 | **YouTube** | Videos, Podcasts | Moderator Approval Required |
| 5 | **Employee Hub** | Openings (Internal Job Board) | HR Admin / System Admin Only |

### Core Strategic Objectives
1. **Eliminate Knowledge Silos:** Break departmental boundaries (e.g. Higher Education, Citizen Services, Portal Development) through centralized cross-functional knowledge sharing.
2. **Accelerate Innovation & Onboarding:** Enable rapid discovery of architectural playbooks, technical troubleshooting guides, and reusable code patterns.
3. **Protect Enterprise Integrity:** Guarantee workplace safety, data security, and compliance through strict **multi-tier governance** that balances employee expression with authoritative administrative control.

---

## 2. Functional Modules & Industry Benchmarks

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             KNOME ENTERPRISE PORTAL                              │
├─────────────────────┬──────────────────────┬─────────────────────────────────────┤
│  LinkedIn Paradigm  │ Stack Overflow Model │         TCS Knome Paradigm          │
│   • Posts (Feed)    │   • Tech Articles    │         • Departmental Wikis        │
│   • Clips (Reels)   │   • Markdown Guides  │         • Hierarchical Sections     │
│   • Direct Publish  │   • Moderator Review │         • Revision Versioning       │
├─────────────────────┼──────────────────────┼─────────────────────────────────────┤
│  YouTube & Podcast  │ Internal Career Hub  │        Community Ecosystem          │
│   • Tech Talk Video │   • Job Openings     │         • Departmental Channels     │
│   • Audio Episodes  │   • Lateral Mobility │         • Public / Private Hubs     │
│   • Curated Media   │   • Internal Apply   │         • Dedicated Channel Admins  │
└─────────────────────┴──────────────────────┴─────────────────────────────────────┘
```

### 2.1. Professional Feed & Micro-Content (LinkedIn Benchmark)
- **Posts Module:**
  - Dynamic company-wide feed allowing employees to post project milestones, achievements, polls, code snippets, and multimedia.
  - **Publishing Model:** Direct instantaneous publication (no approval needed).
  - **Engagement:** Real-time reactions (Like, Celebrate, Support, Insightful), threaded multi-level comments, and karma point rewards for active contributors.
- **Clips Module:**
  - Modern, vertical short-form video reels (up to 60 seconds) tailored for rapid developer tips, tool demonstrations, team highlights, and company announcements.
  - **Publishing Model:** Direct instantaneous publication (no approval needed).
  - Features auto-play, custom video player, engagement analytics (views, shares, comments), and direct publishing.

### 2.2. Technical Knowledge Repository (Stack Overflow Benchmark)
- **Articles Module:**
  - Deep-dive technical documentation, architectural decision records (ADRs), frameworks comparison, and implementation playbooks.
  - Supports rich-text formatting, syntax-highlighted code blocks, multi-tag indexing, and scheduled releases.
  - **Publishing Model:** Employee creates article → Submitted for Moderator Approval → Published only after Moderator approves.

### 2.3. Enterprise Encyclopedia (TCS Knome Benchmark)
- **Wiki Module:**
  - Structured, authoritative corporate encyclopedia documenting institutional procedures, standard operating procedures (SOPs), API references, and project manuals.
  - Supports nested hierarchical sections, change tracking, rollback versioning, file attachments, and departmental category tagging.
  - **Publishing Model:** Employee creates wiki → Submitted for Moderator Approval → Published only after Moderator approves.

### 2.4. Multimedia & Thought Leadership (YouTube & Podcast Benchmark)
- **Videos Module:**
  - Long-form media library hosting technical webinars, townhall recordings, project demos, and curated educational playlists. Includes view tracking and full-screen playback.
  - **Publishing Model:** Employee uploads video → Submitted for Moderator Approval → Published only after Moderator approves.
- **Podcasts Module:**
  - Audio thought leadership series featuring interviews with project directors, engineering leaders, and external tech specialists. Features persistent mini-player playback across platform navigation.
  - **Publishing Model:** Employee records/uploads podcast → Submitted for Moderator Approval → Published only after Moderator approves.

### 2.5. Employee Hub & Internal Career Mobility
- **Openings (Internal Job Board):**
  - Transparent internal marketplace displaying open roles, departmental requisitions, required skills, and qualification criteria.
  - Allows staff to apply internally, promoting talent retention, cross-departmental agility, and leadership development within MPOnline.
  - **Access:** Only HR Administrator and System Administrator can post job openings. Employees can browse and apply.

### 2.6. Communities & Collaboration Channels
- **Communities Hub:**
  - Dedicated virtual spaces for departments (Higher Education, Citizen Services, Infrastructure, Quality Assurance) and interest groups (AI/ML, DevOps, UI/UX).
  - Configurable as **Public** (open to all staff) or **Private** (membership-gated), managed by designated **Community Administrators**.
  - Community Administrators manage members, approve join requests, pin announcements, moderate content, and upload community files & media.

---

## 3. Platform Roles

Knome implements a rigorous **Role-Based Access Control (RBAC)** architecture with five defined roles:

### 3.1. Employee (Standard User)
Regular MPOnline staff member. Can create posts & clips (direct publish), submit articles/wikis/podcasts (requires moderator approval), interact with all content (like, comment, share, bookmark), manage profile, connect with colleagues, join communities, earn karma points, and apply for internal job openings.

### 3.2. Moderator (Content Safety & Compliance Officer)
Departmental or platform-level content moderator. Responsible for reviewing pending content queues (articles, wikis, podcasts), approving or rejecting submissions, investigating flagged/reported content, deleting violating content, and submitting suspension requests to HR Administrator. **Cannot directly suspend employee accounts.**

### 3.3. Community Administrator (Channel Lead)
Departmental manager or technical lead with administrative jurisdiction over their assigned community channel(s). Can manage community members, approve/reject join requests, pin announcements, moderate channel content, upload files, suspend members from their community (community-level only), and configure channel rules.

### 3.4. HR Administrator (Personnel & Governance Authority)
Human Resources executive with exclusive authority to review and approve/reject suspension requests submitted by moderators, execute direct account suspensions, reinstate suspended users, post internal job openings, manage HR analytics & department metrics, and issue organization-wide broadcast announcements.

### 3.5. System Administrator (Super Admin / Root Authority)
Enterprise IT lead with complete platform authority. Full access to all modules, user management override, audit trail inspection, keyword blocklist management, platform configuration, database-level operations, and root suspension/reinstatement authority. Can override any action by any other role.

---

## 4. Comprehensive Permissions Matrix

| # | Functional Capability | Employee | Moderator | Community Admin | HR Admin | System Admin |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | **Create & Publish Posts** | ✅ Direct | ✅ Direct | ✅ Direct | ✅ Direct | ✅ Direct |
| 2 | **Upload & Publish Clips** | ✅ Direct | ✅ Direct | ✅ Direct | ✅ Direct | ✅ Direct |
| 3 | **Author Articles** | ⏳ Needs Approval | ✅ Approve/Reject | ⏳ Channel Scope | ✅ Approve/Reject | 👑 Full Access |
| 4 | **Author Wikis** | ⏳ Needs Approval | ✅ Approve/Reject | ⏳ Channel Scope | ✅ Approve/Reject | 👑 Full Access |
| 5 | **Upload Videos** | ⏳ Needs Approval | ✅ Approve/Reject | ❌ No Access | ✅ Approve/Reject | 👑 Full Access |
| 6 | **Record & Publish Podcasts** | ⏳ Needs Approval | ✅ Approve/Reject | ❌ No Access | ✅ Approve/Reject | 👑 Full Access |
| 7 | **Approve Pending Content Queue** | ❌ No Access | ✅ Full Queue | 🔶 Channel Only | ✅ Full Queue | 👑 Full Access |
| 8 | **Report Abuse / Flag Content** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| 9 | **Delete Violating Content** | 👤 Own Only | ✅ Moderation | 🔶 Channel Only | ✅ All Content | 👑 Root Delete |
| 10 | **Submit Suspension Request to HR** | ❌ No Access | ✅ Unlimited | ❌ No Access | ⚡ Direct Action | 👑 Direct Action |
| 11 | **Approve / Reject Suspension Request** | ❌ No Access | ❌ No Access | ❌ No Access | ✅ Sole Authority | 👑 Override |
| 12 | **Execute Direct Account Suspension** | ❌ No Access | ❌ No Access | ❌ No Access | ✅ Yes | 👑 Yes |
| 13 | **Reinstate Suspended Account** | ❌ No Access | ❌ No Access | ❌ No Access | ✅ Yes | 👑 Yes |
| 14 | **Suspend Community Member** | ❌ No Access | ❌ No Access | ✅ Channel Ban | ❌ N/A | 👑 Full Access |
| 15 | **Post Internal Job Openings** | 📄 Apply Only | 📄 Apply Only | ❌ No Access | ✅ Create & Manage | 👑 Full Access |
| 16 | **Create / Manage Communities** | 👥 Join/Leave | 🔍 Inspect | ✅ Manage Own | 🔍 Review/Approve | 👑 Full Access |
| 17 | **View HR Analytics** | ❌ No Access | ❌ No Access | ❌ No Access | ✅ Full Access | 👑 Full Access |
| 18 | **Access Admin Console** | ❌ No Access | 🛡️ Moderation | ❌ No Access | ❌ No Access | 👑 Full Access |
| 19 | **Inspect Audit Logs** | ❌ No Access | 🛡️ Moderation | ❌ No Access | 📋 HR Logs | 👑 Full Audit |
| 20 | **Configure Platform Settings** | ❌ No Access | ❌ No Access | ❌ No Access | ❌ No Access | 👑 Root Access |

---

## 5. End-to-End Governance & Lifecycle Workflows

### 5.1. Workflow 1: Direct Publishing (Posts & Clips)
```
 ┌───────────────────────────────────┐
 │  Employee Creates Post or Clip    │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Automated Security Check         │
 │  (Restricted Keywords / URLs)     │
 └────────────────┬──────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌─────────────┐  ┌──────────────┐
   │  Blocked /   │  │  Clean Post  │
   │  Warning     │  │              │
   └─────────────┘  └──────┬───────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  INSTANT PUBLICATION │
                │  (Live on Feed)      │
                └──────────┬───────────┘
                           │
                   ┌───────┴───────┐
                   ▼               ▼
            ┌────────────┐  ┌────────────┐
            │  Peer       │  │  Karma     │
            │  Engagement │  │  Award     │
            │  (Likes,    │  │  (+Points  │
            │  Comments)  │  │  to Author)│
            └────────────┘  └────────────┘
```

**Steps:**
1. **Create:** Employee writes a post or uploads a video clip.
2. **Automated Shield:** System automatically scans content against blocked keywords and unsafe URL domains.
3. **Instant Publication:** Content immediately surfaces on the company feed; SignalR broadcasts real-time updates.
4. **Karma Rewards:** Positive engagements award karma balance points to the author.

---

### 5.2. Workflow 2: Approval-Gated Publishing (Articles)
```
 ┌───────────────────────────────────┐
 │  Employee Creates Article          │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Status: 'PendingApproval'        │
 │  (Queued for Moderator Review)    │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  MODERATOR Reviews Content        │
 │  (Quality, Accuracy, Compliance)  │
 └────────────────┬──────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌─────────────┐  ┌──────────────┐
   │  ✅ APPROVED │  │  ❌ REJECTED  │
   │  Published   │  │  Returned    │
   │  Live on     │  │  to Author   │
   │  Platform    │  │  with Notes  │
   └─────────────┘  └──────────────┘
```

---

### 5.3. Workflow 3: Approval-Gated Publishing (Wiki)
```
 ┌───────────────────────────────────┐
 │  Employee Creates Wiki Page       │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Status: 'PendingApproval'        │
 │  (Queued for Moderator Review)    │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  MODERATOR Reviews Wiki Content   │
 │  (Accuracy, Structure, Policy)    │
 └────────────────┬──────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌─────────────┐  ┌──────────────┐
   │  ✅ APPROVED │  │  ❌ REJECTED  │
   │  Published   │  │  Returned    │
   │  in Wiki     │  │  to Author   │
   │  Repository  │  │  with Notes  │
   └─────────────┘  └──────────────┘
```

---

### 5.4. Workflow 4: Approval-Gated Publishing (Videos & Podcasts)
```
 ┌───────────────────────────────────┐
 │  Employee Uploads Video / Records │
 │  Podcast Episode                  │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Status: 'PendingApproval'        │
 │  (Queued for Moderator Review)    │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  MODERATOR Reviews Media Content  │
 │  (Brand Alignment, Quality)       │
 └────────────────┬──────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌─────────────┐  ┌──────────────┐
   │  ✅ APPROVED │  │  ❌ REJECTED  │
   │  Published   │  │  Returned    │
   │  in Media    │  │  to Author   │
   │  Library     │  │  with Notes  │
   └─────────────┘  └──────────────┘
```

---

### 5.5. Workflow 5: Content Flagging & Abuse Reporting
```
 ┌───────────────────────────────────┐
 │  Any Employee Flags Content       │
 │  (Post, Clip, Article, Wiki,      │
 │   Video, Podcast, or Comment)     │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Reason Selected:                 │
 │  • Harassment                     │
 │  • Spam                           │
 │  • Copyright Violation            │
 │  • Policy Violation               │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Report Queued in Content         │
 │  Moderation & Safety Console      │
 │  (SQL Server enrichment of real   │
 │   names, employee IDs, content)   │
 └────────────────┬──────────────────┘
                  │
          ┌───────┼───────────┐
          ▼       ▼           ▼
   ┌──────────┐ ┌──────────┐ ┌─────────────────┐
   │ DISMISS  │ │ DELETE   │ │ ESCALATE TO HR  │
   │ Report   │ │ Content  │ │ (Submit         │
   │ (No      │ │ from     │ │  Suspension     │
   │ Violation│ │ Platform │ │  Request)       │
   └──────────┘ └──────────┘ └─────────────────┘
```

**Steps:**
1. **Report Submission:** Any user clicks the flag icon on any piece of content.
2. **Evidence Collection:** Reporter selects a standardized violation category and inputs optional contextual notes.
3. **Database Enrichment:** Knome queries SQL Server to resolve real names, employee IDs, and content titles of both Reporter and Content Author.
4. **Moderator Adjudication:**
   - **Dismiss:** Report is unsubstantiated → marked resolved.
   - **Delete Content:** Violating content is removed from the platform and database.
   - **Escalate for Suspension:** Moderator triggers a **Suspension Request** to HR Administrator.

---

### 5.6. Workflow 6: Two-Tier Account Suspension Governance (Moderator → HR Admin)
```
 ┌───────────────────────────────────┐
 │  MODERATOR Submits Suspension     │
 │  Request                          │
 │  • Duration: 1d/3d/7d/14d/30d/   │
 │    Indefinite/Custom              │
 │  • Reason: Policy Category &      │
 │    Explanation                     │
 │  • Evidence: Linked Report /      │
 │    Content ID                     │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  Unlimited Requests Saved         │
 │  Independently in SQL Server      │
 │  (SuspensionRequests Table)       │
 └────────────────┬──────────────────┘
                  │
                  ▼
 ┌───────────────────────────────────┐
 │  HR ADMINISTRATOR Reviews         │
 │  Suspension Requests Queue        │
 │  • Filter: All/Pending/Approved/  │
 │    Rejected                       │
 │  • Inspect Content Button         │
 └────────────────┬──────────────────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌─────────────┐  ┌──────────────────┐
   │ HR APPROVE  │  │   HR REJECT      │
   │             │  │                  │
   │ • Account   │  │ • Request        │
   │   Suspended │  │   Declined       │
   │   Immediately│ │   with Reason    │
   │ • Login     │  │ • Target User    │
   │   Blocked   │  │   Remains Active │
   │ • Sessions  │  │ • Requester      │
   │   Revoked   │  │   Notified       │
   │ • Email     │  │ • Full Audit     │
   │   Notification││   Trail Preserved│
   └─────────────┘  └──────────────────┘
```

#### Key Governance Principles:
1. **Separation of Powers:** Moderators have frontline visibility of inappropriate content, but **cannot unilaterally suspend an employee**. Only HR Administrators and System Administrators hold the executive authority to suspend accounts.
2. **Unlimited Independent Requests:** Moderators can submit unlimited suspension requests. Each request is preserved as a distinct record with its own unique ID, reason, and attached evidence. Approving/rejecting one request **never overwrites** other pending requests.
3. **Rich Evidence Inspection:** HR Administrators can inspect the exact violation via the attached Moderation Report and Content ID before rendering a verdict.
4. **Complete Audit Trail:** Every submission, approval, rejection, and reinstatement is permanently recorded in the AuditLogs table with timestamps, user IDs, and rationale.
5. **System Admin Override:** System Administrators hold root authority to intervene, direct-suspend, or reinstate accounts at any time.

---

## 6. Technology Architecture & Security Foundations

| Architectural Layer | Technology Stack | Enterprise Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, Vite, Tailwind CSS | High-performance SPA with GPU-accelerated micro-animations, responsive design across desktop and mobile. |
| **Backend API** | ASP.NET Core 10, C# 13 | High-throughput RESTful endpoints, JWT enterprise authentication, role authorization middleware. |
| **Database** | Microsoft SQL Server | Relational integrity, foreign key cascading, transactional ACID compliance, indexed search queries. |
| **Real-Time Communication** | SignalR WebSocket Hubs | Instant cross-client broadcasting for notifications, comment counts, reaction updates, and moderation events. |
| **Security Layer** | Suspension Guard Middleware | Automatically intercepts suspended user tokens, revokes active sessions, and blocks API access. |
| **Content Security** | Restricted Keywords & URL Blocking | Automated filtering of profanity, sensitive terms, and malicious URLs before publication. |

---

## 7. Strategic Business Value for MPOnline Limited

1. **Enhanced Employee Engagement:** Bottom-up social feeds and video reels increase employee morale and workplace connection across distributed offices.
2. **Accelerated Technical Productivity:** Fast access to vetted technical articles and organizational wikis drastically reduces onboarding time for new engineers and prevents redundant problem-solving.
3. **Complete Risk Mitigation:** Formal multi-tier moderation prevents inappropriate content, leaks of sensitive project data, and workplace harassment.
4. **Internal Talent Retention:** Transparent internal job openings encourage top performers to advance within MPOnline rather than seeking external opportunities.
5. **Governance & Compliance:** Two-tier suspension governance ensures legal compliance and prevents unilateral punitive actions against employees.

---

## 8. Summary: Module → Workflow Quick Reference

| Module | Industry Benchmark | Publishing Model | Workflow |
| :--- | :--- | :--- | :--- |
| **Posts** | LinkedIn | Employee creates → Direct Publish | Workflow 1 |
| **Clips** | LinkedIn | Employee creates → Direct Publish | Workflow 1 |
| **Articles** | Stack Overflow | Employee creates → Moderator Approves | Workflow 2 |
| **Wiki** | TCS Knome | Employee creates → Moderator Approves | Workflow 3 |
| **Videos** | YouTube | Employee uploads → Moderator Approves | Workflow 4 |
| **Podcasts** | YouTube | Employee records → Moderator Approves | Workflow 4 |
| **Openings** | Employee Hub | HR Admin / System Admin creates | HR Managed |
| **Communities** | — | Employee creates → Admin Approval | Admin Managed |

---

## 9. Abuse & Suspension Quick Reference

| Step | Actor | Action |
| :--- | :--- | :--- |
| 1 | Any Employee | Reports inappropriate content (flag icon) |
| 2 | System | Queues report in Content Moderation Console |
| 3 | Moderator | Reviews report → Dismiss / Delete Content / Escalate |
| 4 | Moderator | Submits Suspension Request to HR Admin (if escalated) |
| 5 | HR Admin | Reviews request → Approve (suspends user) / Reject |
| 6 | System Admin | Can override any action at any time |

---
*Document Version: 3.0 (Enterprise Production)*  
*Approved by: Enterprise Systems Engineering Group, MPOnline Limited*
