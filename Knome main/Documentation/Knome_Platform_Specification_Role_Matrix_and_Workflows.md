# Knome Enterprise Knowledge Platform
## Architecture Specification, Role & Permissions Matrix, and Content Workflows

**Organization:** MPOnline Limited  
**Platform:** Knome (Enterprise Knowledge & Collaboration System)  
**Document Classification:** Enterprise Architecture & Governance Specification  
**Version:** 3.0 (2026)  
**Author:** Knome Engineering & Governance Team  

---

## 1. Platform Architectural Mapping ("Knome Which Which Thing")

Knome integrates best-of-breed paradigms from world-class platforms into a unified, secure internal enterprise intranet for MPOnline:

| Platform Paradigm | Knome Feature Module | Key Enterprise Capabilities |
| :--- | :--- | :--- |
| **1. LinkedIn** | **Feed Posts & Clips** | • **Feed Posts:** Real-time workplace status updates (up to 400 characters or rich text), media attachments (images up to 25MB, documents up to 400MB), @mentions, #hashtags, targeted audience scoping (Public, Connections, Specific Community).<br>• **Clips:** Vertical short-form videos / reels with full-screen streaming, creator profile links, instant reactions, comments, and views counter.<br>• **Professional Networking:** Colleague discovery ("People You May Know"), follow/connect requests, skill tags, DPDP Act 2023 privacy toggles. |
| **2. Stack Overflow** | **Articles & Karma Engine** | • **Long-Form Technical Articles:** Markdown editor with live preview, code syntax highlighting, reading time calculator, cover banners, departmental taxonomy.<br>• **Karma Gamification & Reputation Engine:** Points rewarded for contribution (+10 Post, +25 Article, +2 Like, daily streaks), Badge tiers (Bronze, Silver, Gold, Platinum), monthly departmental leaderboards.<br>• **Q&A Discussions:** Threaded nested comments, solution reactions, technical knowledge preservation. |
| **3. Knome (TCS Enterprise)** | **Enterprise Wiki & SOPs** | • **Enterprise Wiki Repository:** Collaborative technical documentation, standard operating procedures (SOPs), project architecture specifications, departmental wikis.<br>• **Version Control & Governance:** Peer collaboration with pre-publication clearance, revision history, and audit compliance. |
| **4. YouTube** | **Videos & Podcasts** | • **Video Catalog:** Video streaming hub (MP4, MOV, WebM up to 500MB), categorization, watch modals, engagement metrics.<br>• **Podcasts & Global Audio Player:** Audio series and episode tracks. Features a persistent **Global Audio Player** at the bottom of the viewport that continues playback seamlessly while employees browse between pages. |
| **5. Employee Hub** | **Internal Careers & Openings** | • **Internal Job Openings:** Departmental vacancies posted by HR, experience and skill criteria, application deadlines, self-service employee applications, automatic vacancy expiry.<br>• **Broadcast Announcements:** High-priority corporate banners pinned to the feed with real-time SignalR push notifications for town halls, emergency notices, or policy changes.<br>• **Communities:** Public and Private departmental interest groups with membership request clearance. |

---

## 2. Complete Roles & Permissions Matrix ("Yeh Kya Kya Kar Sakte Hai")

Knome implements Role-Based Access Control (RBAC) across 5 core roles plus community channel leadership:

### 2.1 Role Definitions
1. **Employee (`EMP`)**: Standard self-service workplace account for all MPOnline employees.
2. **Community Admin (`CADM`)**: Departmental or interest group leader with governance over a specific community.
3. **Moderator (`MOD`)**: Content safety steward responsible for reviewing reported content and clearing media submissions.
4. **HR Administrator (`HRADM`)**: Workforce operations leader managing talent mobility, broadcast alerts, community catalogs, and direct employee account suspensions.
5. **System Administrator (`SYSADM`)**: Top-level security administrator managing RBAC assignments, platform security switches, audit trails, and global system health.

---

### 2.2 Permissions Matrix

| Functional Capability | Employee | Community Admin | Moderator | HR Admin | System Admin |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Content Creation & Consumption** | | | | | |
| Create Feed Posts (Direct Publishing) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Create Clips (Direct Publishing) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Like, Comment, Bookmark, Share Posts | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Write Articles (Draft & Submit for Review) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Write Wiki Entries (Submit for Review) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Upload Videos & Podcasts (Submit for Clearance) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Listen to Continuous Podcasts / Audio Player | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Earn Karma Points & Climb Leaderboard | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Community Management** | | | | | |
| Join Public Communities | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Request Access to Private Communities | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Propose Creation of New Community | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Approve / Reject Community Join Requests | ❌ No | ✅ Yes (Own) | ❌ No | ✅ Yes | ✅ Yes |
| Pin Announcements in Community Feed | ❌ No | ✅ Yes (Own) | ❌ No | ✅ Yes | ✅ Yes |
| Suspend / Remove Member from Community | ❌ No | ✅ Yes (Own) | ❌ No | ✅ Yes | ✅ Yes |
| Configure Community Guidelines & FAQs | ❌ No | ✅ Yes (Own) | ❌ No | ✅ Yes | ✅ Yes |
| Approve / Reject Proposed New Communities | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Moderation & Content Safety** | | | | | |
| Report Inappropriate Content (Flag Abuse) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Access Moderation Console Queue | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Dismiss False-Positive Reports | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Remove / Delete Violating Posts & Comments | ❌ No | ✅ (Own Channel) | ✅ Yes | ✅ Yes | ✅ Yes |
| Approve / Reject Pending Articles & Wikis | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Approve / Reject Pending Videos & Podcasts | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| Submit Suspension Request to HR Admin | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No |
| **Account Suspension & Governance** | | | | | |
| Review Pending Suspension Requests | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Reject Suspension Request (with mandatory note) | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Direct Account Suspension (Select Duration) | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ (No Duration) |
| Configure Suspension Duration (1d, 3d, 7d, 14d, 30d, Indefinite, Custom Date) | ❌ No | ❌ No | ❌ No | ✅ Yes (Only) | ❌ No |
| Reinstate Suspended Employee Account | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Talent & HR Operations** | | | | | |
| Browse Internal Job Openings | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Apply for Internal Job Openings | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Create, Edit & Close Job Openings | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Review Internal Job Applicants | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Publish Organization-Wide Broadcast Banners | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| View Departmental Analytics & Talent Velocity | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Security & System Administration** | | | | | |
| Assign & Escalate Employee Roles | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| Inspect Immutable Security Audit Logs | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| Configure Keyword Blocklists & URL Security | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| Toggle Enterprise Pre-Publication Switches | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |

---

## 3. End-to-End Content & Governance Workflows

### 3.1 Workflow 1: Direct Publishing (Posts & Clips)
* **Target Content:** Feed Posts, Clips (Short Videos).
* **Speed:** Instant / Real-Time.

```
[Employee Composes Post / Uploads Clip]
                  │
                  ▼
   [Client-Side Keyword & PII Filter]
                  │
                  ▼
         [Direct Publish to Feed]
                  │
                  ├───────────────────────────────┐
                  ▼                               ▼
       [Earns +10 Karma Points]      [SignalR Push Notification]
                                      (Sent to Followers / Community)
```

1. **Composition:** Employee creates a Post or uploads a vertical Clip.
2. **Security Sanity Check:** Client-side scanner verifies no blacklisted keywords or raw PII leaks (Aadhaar, PAN, AWS keys).
3. **Instant Publication:** Content becomes immediately visible on the Public Feed or targeted Community channel without administrative delay.
4. **Karma & Engagement:** Employee receives **+10 Karma points** instantly.

---

### 3.2 Workflow 2: Moderated Content Clearance (Articles, Wiki, Videos & Podcasts)
* **Target Content:** Technical Articles, Enterprise Wiki entries, Video tutorials, Audio Podcasts.
* **Speed:** 24–48 Hours Review Turnaround.

```
[Employee Drafts Article / Wiki / Podcast]
                  │
                  ▼
       [Status: Pending Approval]
                  │
                  ▼
   [Moderator Queue (Moderation Console)]
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
    [APPROVED]          [DECLINED]
        │                   │
        ▼                   ▼
[Published to Catalog]  [Returned to Drafts]
[Earns +25 Karma]       [Revision Notes Sent to Author]
```

1. **Submission:** Employee completes authoring and clicks **Submit for Review**.
2. **Pending Queue:** The content is tagged with `Status: Pending` and held in the Moderator's clearance queue.
3. **Moderator Review:** The Moderator inspects formatting, technical validity, and community safety guidelines.
4. **Resolution:**
   - **Approved:** The content goes live immediately across the knowledge repository. Author earns **+25 Karma points**.
   - **Declined:** Content is returned to the author's private drafts along with actionable revision feedback.

---

### 3.3 Workflow 3: Report Abuse & HR Admin Suspension Governance
* **Target Content:** Inappropriate behavior, toxic language, harassment, policy violations.
* **Governance Model:** Separation of powers between Moderator investigation and HR Admin disciplinary execution.

```
1. [Employee Flags Content (Report Abuse)]
                  │
                  ▼
2. [Moderation Queue: Assigned to Moderator]
   - Content snapshot & AI toxicity score inspected
                  │
                  ▼
3. [Moderator Actions]
   ├── Action A: Dismiss Report (Valid content)
   ├── Action B: Remove Content (Deletes violating post/clip)
   └── Action C: Escalate to HR (Submits Suspension Request)
                  │
                  ▼
4. [HR Admin Console: Suspension Requests Queue]
   - HR Admin reviews violation report & employee profile
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   [APPROVE]             [REJECT]
        │                   │
        ▼                   ▼
 [Choose Duration]    [Enter Rejection Reason]
 (1d, 3d, 7d, 14d,    [Request Marked Rejected]
  30d, Indefinite,    [Employee Remains Active]
  Custom End Date)
        │
        ▼
[Direct Account Suspension Executed]
[Session Revoked / Immediate Lockout]
[Audit Log Entry Recorded]
```

#### Step-by-Step Execution:
1. **Reporting Violation:** Any employee notices offensive or non-compliant content and clicks **Report Post / Clip**. They specify a reason category (Harassment, Toxic, Spam, Inappropriate, PII Leak) and an explanation note.
2. **Moderator Investigation:** The report queues in the **Content Moderation Tab** of the Moderation Console. The Moderator views the context, reported snippet, AI severity score, and author identity.
3. **Remediation & Escalation:**
   - The Moderator can delete the violating content directly to eliminate ongoing harm.
   - Per platform governance policy, Moderators cannot execute global account lockouts directly. If suspension is warranted, the Moderator clicks **Request Suspension**, which automatically forwards the case with attached report evidence to HR Administrators.
4. **HR Administrator Review:**
   - The HR Admin navigates to the **Suspension Requests Tab** in Admin Console.
   - The HR Admin opens the **Suspend Employee Account** window.
   - **Suspension Duration Selection (HR Admin Only):** The HR Admin selects the appropriate disciplinary duration:
     - `1 Day` (24 Hours cooldown)
     - `3 Days` (Short break)
     - `7 Days` (1 Week - Standard governance)
     - `14 Days` (2 Weeks)
     - `30 Days` (1 Month)
     - `Indefinite` (Until manual executive review)
     - `Custom End Date` (Exact reinstatement calendar date)
   - The HR Admin inputs a justification note for the audit trail and clicks **Confirm Suspension**.
5. **Enforcement:**
   - The user's active session is instantly terminated via JWT lockout.
   - Any further API request is intercepted by the backend `SuspensionGuard` middleware.
   - The suspension request is automatically marked as `Approved` by the reviewing HR Administrator.
   - An immutable audit trail entry is committed.

---

### 3.4 Workflow 4: Community Creation & Lifecycle
```
[Employee Proposes Community]
             │
             ▼
[HR / System Admin Review Queue]
             │
   ┌─────────┴─────────┐
   ▼                   ▼
[APPROVED]          [REJECTED]
   │                   │
   ▼                   ▼
[Community Created] [Feedback Sent to Proposer]
[Creator = Community Admin]
   │
   ├─► Public Community: Employees join instantly
   └─► Private Community: Membership requires Community Admin approval
```

---

## 4. Architectural Summary

| Dimension | Specification |
| :--- | :--- |
| **Frontend Architecture** | React 19, Tailwind CSS, Lucide Icons, Google Material Symbols, Vite |
| **Backend Architecture** | ASP.NET Core (.NET 10), Clean Architecture, Entity Framework Core |
| **Database** | Microsoft SQL Server (MSSQL) with full audit triggers and relational integrity |
| **Real-Time Engine** | SignalR WebSocket hub for instantaneous notifications and broadcast alerts |
| **Security Standards** | JWT Bearer Authentication, DPDP Act 2023 Compliance, Immutable Audit Logging |
