import os
import sys
import zipfile
from datetime import datetime

# Target output files
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DOCX_PATH = os.path.join(SCRIPT_DIR, "Knome_Platform_Specification_and_Governance_Guide.docx")
PUBLIC_DOCX_PATH = os.path.join(SCRIPT_DIR, "..", "knomeUI", "frontend", "public", "Knome_Platform_Specification_and_Governance_Guide.docx")

def generate_via_python_docx():
    import docx
    from docx.shared import Inches, Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
    from docx.oxml import OxmlElement, parse_xml
    from docx.oxml.ns import nsdecls, qn
    import copy

    doc = docx.Document()

    # Set standard margins (1 inch)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    # Palette
    COLOR_PRIMARY = RGBColor(12, 24, 56)       # #0C1838 Deep Navy
    COLOR_SECONDARY = RGBColor(37, 99, 235)    # #2563EB Royal Blue
    COLOR_TEXT = RGBColor(51, 65, 85)           # #334155 Slate
    COLOR_MUTED = RGBColor(100, 116, 139)       # #64748B Slate Muted
    COLOR_AMBER = RGBColor(217, 119, 6)         # #D97706 Warm Amber
    COLOR_GREEN = RGBColor(16, 185, 129)        # #10B981 Emerald
    COLOR_RED = RGBColor(220, 38, 38)           # #DC2626 Red
    COLOR_PURPLE = RGBColor(124, 58, 237)       # #7C3AED Purple
    COLOR_WHITE = RGBColor(255, 255, 255)

    def style_heading(p, text, font_size=18, color=COLOR_PRIMARY, space_before=14, space_after=6, bold=True):
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(font_size)
        run.font.bold = bold
        run.font.color.rgb = color
        return run

    def add_para(text="", font_size=10.5, color=COLOR_TEXT, space_after=6, bold=False, italic=False, align=WD_ALIGN_PARAGRAPH.LEFT):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = 1.15
        if text:
            run = p.add_run(text)
            run.font.name = 'Calibri'
            run.font.size = Pt(font_size)
            run.font.bold = bold
            run.font.italic = italic
            run.font.color.rgb = color
        return p

    def add_bullet(bold_prefix, text, level=0):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.15
        if level > 0:
            p.paragraph_format.left_indent = Inches(0.5 * level)
        r1 = p.add_run(bold_prefix)
        r1.font.name = 'Calibri'
        r1.font.size = Pt(10)
        r1.font.bold = True
        r1.font.color.rgb = COLOR_PRIMARY
        
        r2 = p.add_run(text)
        r2.font.name = 'Calibri'
        r2.font.size = Pt(10)
        r2.font.color.rgb = COLOR_TEXT

    def add_callout(text, title="GOVERNANCE RULE", bg_color="FEF3C7", border_color="D97706"):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)
        
        shading = parse_xml(r'<w:shd {} w:fill="{}"/>'.format(nsdecls('w'), bg_color))
        cell._tc.get_or_add_tcPr().append(shading)
        
        borders = parse_xml(r'''
            <w:tcBorders {} >
                <w:top w:val="none"/>
                <w:left w:val="single" w:sz="24" w:space="0" w:color="{}"/>
                <w:bottom w:val="none"/>
                <w:right w:val="none"/>
            </w:tcBorders>
        '''.format(nsdecls('w'), border_color))
        cell._tc.get_or_add_tcPr().append(borders)
        
        cp = cell.paragraphs[0]
        cp.paragraph_format.space_before = Pt(6)
        cp.paragraph_format.space_after = Pt(4)
        r_title = cp.add_run(f"📌 {title}: ")
        r_title.bold = True
        r_title.font.name = 'Calibri'
        r_title.font.size = Pt(9.5)
        r_title.font.color.rgb = COLOR_AMBER
        
        r_body = cp.add_run(text)
        r_body.font.name = 'Calibri'
        r_body.font.size = Pt(9.5)
        r_body.font.color.rgb = COLOR_TEXT
        
        p_space = doc.add_paragraph()
        p_space.paragraph_format.space_after = Pt(4)

    def add_divider():
        p_divider = doc.add_paragraph()
        p_divider.paragraph_format.space_before = Pt(10)
        p_divider.paragraph_format.space_after = Pt(10)
        r_div = p_divider.add_run("―" * 60)
        r_div.font.color.rgb = RGBColor(203, 213, 225)
        r_div.font.size = Pt(8)

    def style_table_cell(cell, text, font_size=8, bold=False, color=COLOR_TEXT, bg=None, align=WD_ALIGN_PARAGRAPH.CENTER):
        if bg:
            shd = parse_xml(r'<w:shd {} w:fill="{}"/>'.format(nsdecls('w'), bg))
            cell._tc.get_or_add_tcPr().append(shd)
        p = cell.paragraphs[0]
        p.alignment = align
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(font_size)
        r.font.bold = bold
        r.font.color.rgb = color
        return r

    # ─────────────────────────────────────────────────────────────
    # COVER / HEADER BLOCK
    # ─────────────────────────────────────────────────────────────
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(36)
    title_p.paragraph_format.space_after = Pt(4)
    r_tag = title_p.add_run("ENTERPRISE PLATFORM SPECIFICATION")
    r_tag.font.name = 'Calibri'
    r_tag.font.size = Pt(11)
    r_tag.font.bold = True
    r_tag.font.color.rgb = COLOR_SECONDARY

    h1_p = doc.add_paragraph()
    h1_p.paragraph_format.space_after = Pt(6)
    r_title = h1_p.add_run("KNOME COLLABORATION PLATFORM")
    r_title.font.name = 'Calibri'
    r_title.font.size = Pt(28)
    r_title.font.bold = True
    r_title.font.color.rgb = COLOR_PRIMARY

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(16)
    r_sub = sub_p.add_run("Functional Specification, Module Architecture, Role Permissions Matrix & Multi-Tier Governance Workflows")
    r_sub.font.name = 'Calibri'
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = COLOR_MUTED

    # Meta Table
    meta_table = doc.add_table(rows=4, cols=2)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Prepared For:", "Management & Executive Leadership (MPOnline Limited)"),
        ("Prepared By:", "Enterprise Engineering & Product Team"),
        ("System Architecture:", "Knome Enterprise Core (v2.5) — React 19 / ASP.NET Core 10 / SQL Server"),
        ("Document Date:", datetime.now().strftime("%B %d, %Y"))
    ]
    for idx, (label, val) in enumerate(meta_data):
        row = meta_table.rows[idx]
        cell_lbl, cell_val = row.cells[0], row.cells[1]
        cell_lbl.width = Inches(1.8)
        cell_val.width = Inches(4.7)
        
        p_l = cell_lbl.paragraphs[0]
        p_l.paragraph_format.space_after = Pt(2)
        r_l = p_l.add_run(label)
        r_l.bold = True
        r_l.font.size = Pt(9.5)
        r_l.font.color.rgb = COLOR_PRIMARY
        
        p_v = cell_val.paragraphs[0]
        p_v.paragraph_format.space_after = Pt(2)
        r_v = p_v.add_run(val)
        r_v.font.size = Pt(9.5)
        r_v.font.color.rgb = COLOR_TEXT

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 1: EXECUTIVE SUMMARY
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "1. Executive Summary & Platform Purpose", font_size=16)
    
    add_para(
        "Knome is MPOnline's next-generation enterprise knowledge, collaboration, and employee networking platform. "
        "It combines the vibrant social engagement of professional networks (LinkedIn), the deep technical indexing "
        "of developer communities (Stack Overflow), the structured organizational documentation of corporate wikis (TCS Knome), "
        "and rich multimedia knowledge sharing (YouTube & Podcasts) — all backed by internal career mobility and strict "
        "enterprise governance."
    )

    # Industry Benchmark Mapping Table
    style_heading(doc.add_paragraph(), "Module-to-Industry Benchmark Mapping", font_size=12, color=COLOR_SECONDARY, space_before=8)
    
    bench_headers = ["#", "Industry Benchmark", "Knome Module(s)", "Publishing Model"]
    bench_data = [
        ("1", "LinkedIn", "Posts, Clips", "Direct Publish"),
        ("2", "Stack Overflow", "Articles", "Moderator Approval Required"),
        ("3", "TCS Knome", "Wiki", "Moderator Approval Required"),
        ("4", "YouTube", "Videos, Podcasts", "Moderator Approval Required"),
        ("5", "Employee Hub", "Openings (Job Board)", "HR Admin / System Admin Only"),
    ]
    
    bench_tbl = doc.add_table(rows=len(bench_data) + 1, cols=4)
    bench_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    bench_tbl.autofit = True
    
    bench_widths = [Inches(0.4), Inches(1.5), Inches(1.8), Inches(2.8)]
    for i, h in enumerate(bench_headers):
        cell = bench_tbl.rows[0].cells[i]
        cell.width = bench_widths[i]
        style_table_cell(cell, h, font_size=9, bold=True, color=COLOR_WHITE, bg="0C1838")
    
    for r_idx, row_data in enumerate(bench_data):
        bg = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            cell = bench_tbl.rows[r_idx + 1].cells[c_idx]
            cell.width = bench_widths[c_idx]
            is_bold = c_idx == 1
            clr = COLOR_SECONDARY if c_idx == 1 else (COLOR_GREEN if "Direct" in val else (COLOR_AMBER if "Approval" in val or "Admin" in val else COLOR_TEXT))
            style_table_cell(cell, val, font_size=9, bold=is_bold, color=clr, bg=bg)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # ─────────────────────────────────────────────────────────────
    # SECTION 2: FUNCTIONAL MODULES
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "2. Functional Modules & Industry Benchmarks", font_size=16)

    # Module 1 — LinkedIn
    style_heading(doc.add_paragraph(), "2.1. Professional Feed & Micro-Content (LinkedIn Benchmark)", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Posts Module: ", "Enterprise collaboration feed allowing employees to share organizational achievements, project milestones, multimedia, polls, and code snippets. Direct publishing model — no approval needed. Real-time reactions (Like, Celebrate, Support), threaded comments, and karma points.")
    add_bullet("Clips Module: ", "Short-form vertical video reels for agile knowledge sharing, rapid coding tips, project highlights, and employee recognition. Direct publishing — no approval needed. Auto-play, engagement analytics, views, shares, and comments.")

    add_callout("Posts and Clips publish immediately upon creation. No moderator approval is required.", "DIRECT PUBLISHING", bg_color="F0FDF4", border_color="10B981")

    # Module 2 — Stack Overflow
    style_heading(doc.add_paragraph(), "2.2. Technical Knowledge Repository (Stack Overflow Benchmark)", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Articles Module: ", "Long-form technical publications, architectural guides, troubleshooting playbooks, and best practices. Rich-text formatting, code blocks, multi-tag categorization, and scheduled publishing.")
    add_bullet("Publishing Model: ", "Employee creates article → Status set to 'PendingApproval' → Moderator reviews → Approved (published) or Rejected (returned to author with feedback).")

    # Module 3 — TCS Knome
    style_heading(doc.add_paragraph(), "2.3. Enterprise Encyclopedia (TCS Knome Benchmark)", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Wiki Module: ", "Institutional knowledge repository with hierarchical sections, revision versioning, change tracking, file attachments, and departmental categorization.")
    add_bullet("Publishing Model: ", "Employee creates wiki → Status set to 'PendingApproval' → Moderator reviews → Approved (published) or Rejected (returned to author).")

    # Module 4 — YouTube
    style_heading(doc.add_paragraph(), "2.4. Multimedia & Thought Leadership (YouTube & Podcast Benchmark)", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Videos Module: ", "Long-form corporate multimedia — tech talks, webinars, townhalls, project demos, curated playlists. View tracking and full-screen playback.")
    add_bullet("Podcasts Module: ", "Audio episodes and thought leadership interviews with persistent background playback across platform navigation. In-browser recording supported.")
    add_bullet("Publishing Model: ", "Employee uploads/records → Status set to 'PendingApproval' → Moderator reviews → Approved (published) or Rejected (returned to author).")

    add_callout("Articles, Wikis, Videos, and Podcasts all require Content Moderator approval before appearing on the platform. This ensures technical accuracy, corporate compliance, and brand alignment.", "APPROVAL-GATED PUBLISHING")

    # Module 5 — Employee Hub
    style_heading(doc.add_paragraph(), "2.5. Employee Hub & Internal Career Mobility", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Openings (Job Board): ", "Internal career board listing open positions across departments. Employees can browse and apply. Only HR Administrators and System Administrators can post new job openings.")

    # Module 6 — Communities
    style_heading(doc.add_paragraph(), "2.6. Communities & Collaboration Channels", font_size=12, color=COLOR_SECONDARY)
    add_bullet("Community Hubs: ", "Specialized public and private discussion channels for departments and interest groups. Managed by dedicated Community Administrators who handle membership, content moderation, file uploads, and channel rules.")

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 3: ROLES
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "3. Platform Roles", font_size=16)
    
    add_para("Knome implements a rigorous Role-Based Access Control (RBAC) architecture with five defined organizational roles:")

    roles = [
        ("3.1. Employee (Standard User)", "Regular MPOnline staff member. Can create posts & clips (direct publish), submit articles/wikis/podcasts (requires moderator approval), interact with all content (like, comment, share, bookmark), manage profile, connect with colleagues, join communities, earn karma points, and apply for internal job openings."),
        ("3.2. Moderator (Content Safety & Compliance Officer)", "Platform-level content moderator. Responsible for reviewing pending content queues (articles, wikis, podcasts), approving or rejecting submissions, investigating flagged/reported content, deleting violating content, and submitting suspension requests to HR Administrator. Cannot directly suspend employee accounts."),
        ("3.3. Community Administrator (Channel Lead)", "Departmental manager or technical lead with administrative jurisdiction over their assigned community channel(s). Can manage members, approve/reject join requests, pin announcements, moderate channel content, upload files, and suspend members from their community (community-level only)."),
        ("3.4. HR Administrator (Personnel & Governance Authority)", "Human Resources executive with exclusive authority to review and approve/reject suspension requests from moderators, execute direct account suspensions, reinstate suspended users, post internal job openings, manage HR analytics, and issue organization-wide broadcast announcements."),
        ("3.5. System Administrator (Super Admin / Root Authority)", "Enterprise IT lead with complete platform authority. Full access to all modules, user management override, audit trail inspection, keyword blocklist management, platform configuration, and root suspension/reinstatement authority. Can override any action by any other role."),
    ]
    for title, desc in roles:
        style_heading(doc.add_paragraph(), title, font_size=11, color=COLOR_SECONDARY, space_before=8, space_after=2)
        add_para(desc, font_size=10)

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 4: PERMISSIONS MATRIX
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "4. Comprehensive Permissions Matrix", font_size=16)
    add_para("The following matrix outlines exact functional capabilities and governance boundaries for each role:")

    headers = ["#", "Functional Capability", "Employee", "Moderator", "Community\nAdmin", "HR Admin", "System\nAdmin"]
    capabilities = [
        ("1", "Create & Publish Posts", "✅ Direct", "✅ Direct", "✅ Direct", "✅ Direct", "✅ Direct"),
        ("2", "Upload & Publish Clips", "✅ Direct", "✅ Direct", "✅ Direct", "✅ Direct", "✅ Direct"),
        ("3", "Author Articles", "⏳ Approval", "✅ Approve", "⏳ Channel", "✅ Approve", "👑 Full"),
        ("4", "Author Wikis", "⏳ Approval", "✅ Approve", "⏳ Channel", "✅ Approve", "👑 Full"),
        ("5", "Upload Videos", "⏳ Approval", "✅ Approve", "❌ No", "✅ Approve", "👑 Full"),
        ("6", "Record Podcasts", "⏳ Approval", "✅ Approve", "❌ No", "✅ Approve", "👑 Full"),
        ("7", "Approve Content Queue", "❌ No", "✅ Full Queue", "🔶 Channel", "✅ Full Queue", "👑 Full"),
        ("8", "Report Abuse / Flag", "✅ Yes", "✅ Yes", "✅ Yes", "✅ Yes", "✅ Yes"),
        ("9", "Delete Violating Content", "👤 Own Only", "✅ Moderation", "🔶 Channel", "✅ All", "👑 Root"),
        ("10", "Submit Suspension Request", "❌ No", "✅ Unlimited", "❌ No", "⚡ Direct", "👑 Direct"),
        ("11", "Approve/Reject Suspension", "❌ No", "❌ No", "❌ No", "✅ Sole Auth", "👑 Override"),
        ("12", "Direct Account Suspension", "❌ No", "❌ No", "❌ No", "✅ Yes", "👑 Yes"),
        ("13", "Reinstate Suspended Account", "❌ No", "❌ No", "❌ No", "✅ Yes", "👑 Yes"),
        ("14", "Suspend Community Member", "❌ No", "❌ No", "✅ Channel Ban", "❌ N/A", "👑 Full"),
        ("15", "Post Job Openings", "📄 Apply Only", "📄 Apply Only", "❌ No", "✅ Create", "👑 Full"),
        ("16", "Create / Manage Communities", "👥 Join/Leave", "🔍 Inspect", "✅ Manage", "🔍 Review", "👑 Full"),
        ("17", "View HR Analytics", "❌ No", "❌ No", "❌ No", "✅ Full", "👑 Full"),
        ("18", "Access Admin Console", "❌ No", "🛡️ Mod", "❌ No", "❌ No", "👑 Full"),
        ("19", "Inspect Audit Logs", "❌ No", "🛡️ Mod", "❌ No", "📋 HR", "👑 Full"),
        ("20", "Configure Platform Settings", "❌ No", "❌ No", "❌ No", "❌ No", "👑 Root"),
    ]

    tbl_matrix = doc.add_table(rows=len(capabilities) + 1, cols=7)
    tbl_matrix.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_matrix.autofit = True

    col_widths = [Inches(0.3), Inches(2.0), Inches(0.75), Inches(0.75), Inches(0.75), Inches(0.75), Inches(0.75)]
    
    # Header row
    for i, title in enumerate(headers):
        cell = tbl_matrix.rows[0].cells[i]
        cell.width = col_widths[i]
        style_table_cell(cell, title, font_size=7.5, bold=True, color=COLOR_WHITE, bg="0C1838")

    # Data rows
    for r_idx, row_data in enumerate(capabilities):
        row = tbl_matrix.rows[r_idx + 1]
        bg_fill = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            cell = row.cells[c_idx]
            cell.width = col_widths[c_idx]
            
            is_bold = False
            clr = COLOR_TEXT
            if "Full" in val or "Direct" in val or "Yes" in val or "✅" in val or "👑" in val or "⚡" in val:
                is_bold = True
                clr = COLOR_PRIMARY
            elif "❌" in val or "No" in val:
                clr = COLOR_MUTED
            elif "⏳" in val or "Approval" in val:
                is_bold = True
                clr = COLOR_AMBER
            elif "🔶" in val:
                clr = COLOR_PURPLE
            
            align = WD_ALIGN_PARAGRAPH.LEFT if c_idx == 1 else WD_ALIGN_PARAGRAPH.CENTER
            style_table_cell(cell, val, font_size=7, bold=is_bold, color=clr, bg=bg_fill, align=align)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    
    add_callout(
        "Principle of Dual Governance: Content Moderators can delete violating content and flag accounts, "
        "but CANNOT unilaterally suspend an employee. Account suspensions are reserved exclusively for "
        "HR Administrators and System Administrators, ensuring legal compliance and preventing unilateral punitive actions.",
        "GOVERNANCE SAFEGUARD"
    )

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 5: WORKFLOWS
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "5. End-to-End Governance & Lifecycle Workflows", font_size=16)

    # Workflow 1
    style_heading(doc.add_paragraph(), "5.1. Workflow 1: Direct Publishing (Posts & Clips)", font_size=12, color=COLOR_SECONDARY)
    add_para("For daily workplace engagement, agility and instantaneous communication are essential. Posts and Clips bypass pre-moderation and publish immediately:")
    add_bullet("Step 1 — Create: ", "Employee drafts a Post or uploads a short-form video Clip.")
    add_bullet("Step 2 — Automated Security Scan: ", "System validates against restricted keyword lists and malicious URL patterns.")
    add_bullet("Step 3 — Instant Publication: ", "Content goes live immediately on the organization feed. SignalR broadcasts updates to connected clients.")
    add_bullet("Step 4 — Peer Engagement: ", "Colleagues interact via reactions, comments, and shares. Karma points awarded to the author.")

    add_callout("Posts and Clips publish immediately. No moderator approval is required.", "DIRECT PUBLISHING WORKFLOW", bg_color="F0FDF4", border_color="10B981")

    # Workflow 2
    style_heading(doc.add_paragraph(), "5.2. Workflow 2: Approval-Gated Publishing (Articles)", font_size=12, color=COLOR_SECONDARY)
    add_para("Technical articles represent formal institutional knowledge and require pre-publication review:")
    add_bullet("Step 1 — Author: ", "Employee creates a technical article with rich-text formatting, code blocks, and tags.")
    add_bullet("Step 2 — Submit: ", "Article is marked 'PendingApproval' and queued in the Moderator's Approval Hub.")
    add_bullet("Step 3 — Moderator Review: ", "Content Moderator inspects technical accuracy, formatting, and compliance.")
    add_bullet("Step 4 — Decision: ", "Approved → Published globally and broadcast. Rejected → Returned to author with structured feedback.")

    # Workflow 3
    style_heading(doc.add_paragraph(), "5.3. Workflow 3: Approval-Gated Publishing (Wiki)", font_size=12, color=COLOR_SECONDARY)
    add_para("Corporate wikis document institutional knowledge and require verification before publication:")
    add_bullet("Step 1 — Author: ", "Employee creates a wiki page with hierarchical sections, attachments, and categories.")
    add_bullet("Step 2 — Submit: ", "Wiki is marked 'PendingApproval' and queued for Moderator review.")
    add_bullet("Step 3 — Moderator Review: ", "Content Moderator verifies accuracy, structure, and policy compliance.")
    add_bullet("Step 4 — Decision: ", "Approved → Published in Wiki Repository. Rejected → Returned to author with revision notes.")

    # Workflow 4
    style_heading(doc.add_paragraph(), "5.4. Workflow 4: Approval-Gated Publishing (Videos & Podcasts)", font_size=12, color=COLOR_SECONDARY)
    add_para("Corporate media (videos and podcasts) require quality assurance before publication:")
    add_bullet("Step 1 — Upload/Record: ", "Employee uploads a video file or records a podcast episode in-browser.")
    add_bullet("Step 2 — Submit: ", "Media is marked 'PendingApproval' and queued for Moderator review.")
    add_bullet("Step 3 — Moderator Review: ", "Content Moderator verifies brand alignment, audio/video quality, and compliance.")
    add_bullet("Step 4 — Decision: ", "Approved → Published in Media Library. Rejected → Returned to author with feedback.")

    add_callout("Articles, Wikis, Videos, and Podcasts all follow the same approval-gated pattern: Employee submits → Moderator reviews → Approved or Rejected.", "APPROVAL-GATED WORKFLOW")

    # Workflow 5
    style_heading(doc.add_paragraph(), "5.5. Workflow 5: Content Flagging & Abuse Reporting", font_size=12, color=COLOR_SECONDARY)
    add_para("When an employee encounters content that violates MPOnline community guidelines:")
    add_bullet("Step 1 — Report: ", "Any employee clicks the 'Report' flag on any Post, Clip, Article, Wiki, Video, Podcast, or Comment.")
    add_bullet("Step 2 — Evidence: ", "Reporter selects a violation category (Harassment, Spam, Copyright, Policy) and provides optional notes.")
    add_bullet("Step 3 — Database Enrichment: ", "Knome queries SQL Server to resolve real names, employee IDs, and content details of both Reporter and Content Author.")
    add_bullet("Step 4 — Moderator Action: ", "The Moderator inspects the content and takes one of three actions:")
    add_bullet("   → Dismiss: ", "Report is unsubstantiated — marked resolved, no further action.", level=1)
    add_bullet("   → Delete Content: ", "Violating content is permanently removed from the platform and database.", level=1)
    add_bullet("   → Escalate to HR: ", "If the violation is severe, Moderator submits a formal Suspension Request to HR Administrator.", level=1)

    # Workflow 6
    style_heading(doc.add_paragraph(), "5.6. Workflow 6: Two-Tier Account Suspension Governance (Moderator → HR Admin)", font_size=12, color=COLOR_SECONDARY)
    add_para("To ensure fair, compliant, and legally sound personnel administration, account suspensions follow a strict two-tier process:")
    add_bullet("Step 1 — Moderator Initiation: ", "Moderator submits a formal suspension request with: duration (1/3/7/14/30 days, Indefinite, or Custom), violation reason/category, and linked moderation evidence (Report ID / Content ID).")
    add_bullet("Step 2 — Independent Recording: ", "Each request is saved as a distinct, independent record in the SQL Server 'SuspensionRequests' table. Moderators can submit unlimited requests per employee. Requests are never overwritten.")
    add_bullet("Step 3 — HR Admin Review: ", "All pending requests appear in the HR Administrator's dedicated Suspension Requests queue with full employee details, violation reason, and an 'Inspect Content' button.")
    add_bullet("Step 4 — HR Decision: ", "The HR Administrator makes the final decision:")
    add_bullet("   → APPROVE: ", "Account is suspended immediately — login blocked, sessions revoked, employee notified. Full audit trail recorded.", level=1)
    add_bullet("   → REJECT: ", "Request is declined with mandatory recorded reason. Target employee remains active. Moderator is notified.", level=1)
    add_bullet("Step 5 — System Admin Override: ", "System Administrators hold root authority to intervene, direct-suspend, or reinstate accounts at any time, bypassing the two-tier process.")

    add_callout(
        "Immutable Audit Trail: Every content approval, deletion, suspension request, HR approval, and rejection "
        "is permanently logged in the Knome AuditLogs table with timestamp, actor user ID, target entity, and recorded rationale.",
        "COMPLIANCE & AUDIT ASSURANCE"
    )

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 6: TECHNOLOGY ARCHITECTURE
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "6. Technology Architecture & Security Foundations", font_size=16)

    tech_headers = ["Architectural Layer", "Technology Stack", "Enterprise Purpose"]
    tech_data = [
        ("Frontend UI", "React 19, Vite, Tailwind CSS", "High-performance SPA with GPU-accelerated micro-animations, responsive design."),
        ("Backend API", "ASP.NET Core 10, C# 13", "High-throughput RESTful endpoints, JWT authentication, role authorization middleware."),
        ("Database", "Microsoft SQL Server", "Relational integrity, FK cascading, ACID compliance, indexed search queries."),
        ("Real-Time", "SignalR WebSocket Hubs", "Instant notifications, comment counters, reaction updates, moderation events."),
        ("Security", "Suspension Guard Middleware", "Intercepts suspended user tokens, revokes sessions, blocks API access."),
        ("Content Safety", "Restricted Keywords & URL Blocking", "Automated filtering of profanity, sensitive terms, and malicious URLs."),
    ]

    tech_tbl = doc.add_table(rows=len(tech_data) + 1, cols=3)
    tech_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tech_tbl.autofit = True

    for i, h in enumerate(tech_headers):
        style_table_cell(tech_tbl.rows[0].cells[i], h, font_size=9, bold=True, color=COLOR_WHITE, bg="0C1838")
    for r_idx, row_data in enumerate(tech_data):
        bg = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            style_table_cell(tech_tbl.rows[r_idx + 1].cells[c_idx], val, font_size=9, bold=(c_idx == 0), color=COLOR_TEXT if c_idx > 0 else COLOR_PRIMARY, bg=bg, align=WD_ALIGN_PARAGRAPH.LEFT)

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 7: BUSINESS VALUE
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "7. Strategic Business Value for MPOnline Limited", font_size=16)
    add_bullet("Enhanced Employee Engagement: ", "Bottom-up social feeds and video reels increase employee morale and workplace connection across distributed offices.")
    add_bullet("Accelerated Technical Productivity: ", "Fast access to vetted technical articles and organizational wikis drastically reduces onboarding time and prevents redundant problem-solving.")
    add_bullet("Complete Risk Mitigation: ", "Formal multi-tier moderation prevents inappropriate content, leaks of sensitive project data, and workplace harassment.")
    add_bullet("Internal Talent Retention: ", "Transparent internal job openings encourage top performers to advance within MPOnline rather than seeking external opportunities.")
    add_bullet("Governance & Compliance: ", "Two-tier suspension governance ensures legal compliance and prevents unilateral punitive actions against employees.")

    add_divider()

    # ─────────────────────────────────────────────────────────────
    # SECTION 8: QUICK REFERENCE SUMMARY
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "8. Module → Workflow Quick Reference", font_size=16)

    ref_headers = ["Module", "Benchmark", "Publishing Model", "Workflow"]
    ref_data = [
        ("Posts", "LinkedIn", "Employee creates → Direct Publish", "Workflow 1"),
        ("Clips", "LinkedIn", "Employee creates → Direct Publish", "Workflow 1"),
        ("Articles", "Stack Overflow", "Employee creates → Moderator Approves", "Workflow 2"),
        ("Wiki", "TCS Knome", "Employee creates → Moderator Approves", "Workflow 3"),
        ("Videos", "YouTube", "Employee uploads → Moderator Approves", "Workflow 4"),
        ("Podcasts", "YouTube", "Employee records → Moderator Approves", "Workflow 4"),
        ("Openings", "Employee Hub", "HR Admin / System Admin creates", "HR Managed"),
        ("Communities", "—", "Employee creates → Admin Approval", "Admin Managed"),
    ]

    ref_tbl = doc.add_table(rows=len(ref_data) + 1, cols=4)
    ref_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    ref_tbl.autofit = True

    for i, h in enumerate(ref_headers):
        style_table_cell(ref_tbl.rows[0].cells[i], h, font_size=9, bold=True, color=COLOR_WHITE, bg="0C1838")
    for r_idx, row_data in enumerate(ref_data):
        bg = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            clr = COLOR_PRIMARY if c_idx == 0 else (COLOR_GREEN if "Direct" in val else (COLOR_AMBER if "Moderator" in val or "Admin" in val else COLOR_TEXT))
            style_table_cell(ref_tbl.rows[r_idx + 1].cells[c_idx], val, font_size=9, bold=(c_idx == 0), color=clr, bg=bg, align=WD_ALIGN_PARAGRAPH.LEFT)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # ─────────────────────────────────────────────────────────────
    # SECTION 9: ABUSE & SUSPENSION QUICK REFERENCE
    # ─────────────────────────────────────────────────────────────
    style_heading(doc.add_paragraph(), "9. Abuse & Suspension Quick Reference", font_size=16)

    abuse_headers = ["Step", "Actor", "Action"]
    abuse_data = [
        ("1", "Any Employee", "Reports inappropriate content (flag icon)"),
        ("2", "System", "Queues report in Content Moderation Console"),
        ("3", "Moderator", "Reviews report → Dismiss / Delete Content / Escalate"),
        ("4", "Moderator", "Submits Suspension Request to HR Admin (if escalated)"),
        ("5", "HR Admin", "Reviews request → Approve (suspends user) / Reject"),
        ("6", "System Admin", "Can override any action at any time"),
    ]

    abuse_tbl = doc.add_table(rows=len(abuse_data) + 1, cols=3)
    abuse_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    abuse_tbl.autofit = True

    for i, h in enumerate(abuse_headers):
        style_table_cell(abuse_tbl.rows[0].cells[i], h, font_size=9, bold=True, color=COLOR_WHITE, bg="0C1838")
    for r_idx, row_data in enumerate(abuse_data):
        bg = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_data):
            clr = COLOR_PRIMARY if c_idx == 1 else COLOR_TEXT
            style_table_cell(abuse_tbl.rows[r_idx + 1].cells[c_idx], val, font_size=9, bold=(c_idx == 1), color=clr, bg=bg, align=WD_ALIGN_PARAGRAPH.LEFT if c_idx > 0 else WD_ALIGN_PARAGRAPH.CENTER)

    # Footer
    add_divider()
    add_para("Document Version: 3.0 (Enterprise Production)", font_size=9, italic=True, color=COLOR_MUTED)
    add_para("Approved by: Enterprise Systems Engineering Group, MPOnline Limited", font_size=9, italic=True, color=COLOR_MUTED)

    doc.save(DOCX_PATH)
    print(f"[SUCCESS] Generated document via python-docx at: {DOCX_PATH}")
    
    # Also copy to public directory for frontend access
    import shutil
    try:
        os.makedirs(os.path.dirname(PUBLIC_DOCX_PATH), exist_ok=True)
        shutil.copy2(DOCX_PATH, PUBLIC_DOCX_PATH)
        print(f"[SUCCESS] Copied to public directory: {PUBLIC_DOCX_PATH}")
    except Exception as e:
        print(f"[INFO] Could not copy to public: {e}")

if __name__ == "__main__":
    try:
        generate_via_python_docx()
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
