# Development Journal — Entry 180: Wiki Pending Approval Filter Enforcement & Section-Scoped Governance Approval Logs

## Date & Author
- **Date**: 2026-10-22
- **Author**: Antigravity Pair Programmer
- **Scope**: Backend API & Frontend UI Content Moderation Governance & Audit Logs

---

## 1. Objectives & Executive Summary
1. **Fix Wiki Pending Approval Leak**: Ensure wikis with `PendingApproval` and `Rejected` status never display in the public Enterprise Wiki Library (`/wiki`) or recently updated listings, regardless of the logged-in user's role (including Moderators).
2. **Remove Content & Community Approval Switch**: Eliminate the redundant top toolbar toggle switch (`Content & Community Approval ON/OFF`) from the Admin Console.
3. **Add Section-Scoped Approval Logs**: In place of the toggle switch, integrate an enterprise-grade **Approval Logs** button that dynamically reflects the count and active section (`Media Approvals`, `Community Approvals`, `Content Moderation`, or `Role Approvals`). When clicked, it opens a dedicated, interactive **Approval Logs Modal** with section-based navigation, media sub-filters (Articles, Wikis, Videos, Podcasts), outcome filters (Approved / Rejected), keyword search, and CSV export.

---

## 2. Technical Root Cause & Remediation

### A. Wiki Pending Approval Visibility Fix
- **Backend Query Leak (`WikiRepository.cs`)**:
  - Previously, `GetWikisPagedAsync` relaxed status checks when `isAdministrator` was true (which included users with Moderator privileges like `Deepak Simrodia`). This caused unapproved pending submissions to be returned in the public catalog.
  - **Resolution**:
    - Updated base query in `GetWikisPagedAsync` with strict exclusion:
      ```csharp
      .Where(w => !w.IsDeleted && w.Status != "PendingApproval" && w.Status != "Rejected")
      ```
    - For the `"all"` tab and general catalog queries, strictly enforced `query = query.Where(w => w.Status == "Published");`.
    - In `GetRecentlyUpdatedWikisAsync`, enforced `.Where(w => !w.IsDeleted && w.Status == "Published")`.
- **Frontend Defensive Filtering (`Wiki.jsx` & `WikiView.jsx`)**:
  - In `Wiki.jsx` (`loadWikis`), added defense-in-depth filtering: `rawItems.filter(w => w.status !== 'PendingApproval' && w.status !== 'Rejected')` across both the standard catalog and "Recently Updated" tabs.
  - In `WikiView.jsx` (`loadWikiData`), added an unauthorized route guard that redirects non-privileged users with a warning if a direct link to a pending or rejected wiki is requested.

---

### B. Admin Console Toolbar & Section-Scoped Approval Logs
- **Removal of Policy Switch (`AdminConsole.jsx`)**:
  - Removed the `Content & Community Approval` ON/OFF toggle switch from the primary toolbar.
  - Retained the underlying security configuration (`requireContentAndCommunityApproval: true`) as a persistent policy standard.
- **Approval Logs Toolbar Button**:
  - Replaced the toggle with an interactive **Approval Logs** button:
    - Left icon: `receipt_long` inside an indigo badge.
    - Title: **Approval Logs** with dynamic pill badge showing the log count for the active console section.
    - Subtitle: Dynamically displays the current module name (`Media Approvals`, `Community Approvals`, `Content Moderation`, etc.).
    - External indicator icon (`open_in_new`) signalling interactive modal launch.
- **Governance Approval Logs Modal (`createPortal`)**:
  - Pre-scopes its view to the section selected in the console when opened.
  - **Tier 1 Section Tabs**:
    1. `All Sections`
    2. `Media Approvals` (Articles, Wikis, Videos, Podcasts)
    3. `Community Approvals`
    4. `Content Moderation`
    5. `Role Approvals`
  - **Tier 2 Media Sub-Chips & Filters**:
    - Media sub-filters: `All Media`, `Articles`, `Wikis`, `Videos`, `Podcasts`.
    - Outcome filters: `All Outcomes`, `Approved`, `Rejected / Action Taken`.
    - Real-time search: Filters target titles, author names, moderators, and descriptions.
    - Export action: Downloads structured CSV (`ApprovalLogs_<section>_<timestamp>.csv`).
  - **Structured Audit Logging**:
    - Enhanced `handleApproveMedia`, `handleRejectMedia`, `handleBatchApproveMedia`, `handleApproveCommunity`, and `handleRejectCommunity` to persist structured audit records to both component state and `localStorage` (`knome_audit_trail`).
    - Seeded comprehensive historical entries for Articles, Wikis, Videos, Podcasts, and Communities so the log viewer displays immediately.
