# Development Journal — Entry 179: Articles & Wiki Moderation Approval Workflow Integration

## Date & Author
- **Date**: 2026-10-22
- **Author**: Antigravity Pair Programmer
- **Scope**: Backend API & Frontend UI Content Moderation Governance

---

## 1. Objectives & Executive Summary
The goal was to enhance the content governance workflow so that all Articles and Wiki documentation submitted by non-privileged employees are intercepted, marked as `PendingApproval`, and queued for Moderator inspection in **Admin Console → Moderation & Content Safety → Media Approvals**.
Moderators can preview, approve (transitioning content to `Published`, releasing it to the catalog, and awarding karma points to the author), or reject submissions. The existing video and podcast upload workflows remain completely intact.

---

## 2. Architecture & Design Decisions

### A. Non-Breaking Status Extensions
- **Articles**: Added `PendingApproval` and `Rejected` to `ArticleStatuses` (`PostArticleConstants.cs`) and validator checks. Existing database queries in `ArticleRepository.GetArticlesAsync` default to `a.Status == "Published" || (a.Status == "Scheduled" && a.AuthorUserId == currentUserId)`, ensuring pending/rejected articles are naturally excluded from public listings until moderator approval.
- **Wikis**: Added `PendingApproval` and `Rejected` to `CreateWikiValidator` and `UpdateWikiValidator` to prevent FluentValidation 400 Bad Request responses. In `WikiRepository.GetWikisPagedAsync`, default tab `"all"` only lists `Published` and `Archived` wikis for non-administrators, preventing unapproved drafts from displaying publicly.

### B. Media Controller Multi-Type Approvals
- Extended `MediaController.cs` (`GetPendingMedia`, `AddPendingMedia`, `RemovePendingMedia`):
  - Handled `mediaType == "article"` and `mediaType == "wiki"` in `GetPendingMedia` with independent checks against `EnableArticles` and `EnableWiki` flags so that article/wiki approval items are not filtered out when videos or podcasts are toggled.
  - Added feature verification in `AddPendingMedia` using `EnableArticlesKey` and `EnableWikiKey` and routed approval checks to `GetRequireContentAndCommunityApprovalAsync()`.
  - Upgraded `RemovePendingMedia(string id)` with type-safe string and numeric token parsing so items with numeric IDs or string prefix IDs (`pending_article_123`, `pending_wiki_456`) are cleanly removed upon approval or rejection.

### C. Frontend Employee Submission Interception
- **Article Creation** (`CreateArticleModal.jsx` & `Articles.jsx`):
  - When submitted by standard employees (non-admin / non-moderator), status transitions to `PendingApproval`.
  - Registered with `mediaApi.addPendingApproval` and synchronized to `localStorage` (`knome_pending_media_approvals`).
  - Dispatched `pending-media-updated` and added notification for moderators.
  - Displayed informative toast: `"Article submitted successfully! It has been sent to the Moderator for approval before going live. 📝"`.
- **Wiki Creation** (`CreateWikiModal.jsx`):
  - When submitted by standard employees, status transitions to `PendingApproval`.
  - Registered with `mediaApi.addPendingApproval` and synchronized with `localStorage`.
  - Dispatched `pending-media-updated` and added notification for moderators.
  - Displayed informative toast: `"Wiki submitted successfully! It has been sent to the Moderator for approval before going live. 📝"`.

### D. Admin Console Media Approvals Queue Upgrade
- **Metric & Filter Cards** (`AdminConsole.jsx`):
  - Expanded top metric row into 6 responsive cards:
    1. `ALL PENDING MEDIA` (Rose badge)
    2. `VIDEOS ONLY` (Cyan badge)
    3. `PODCASTS ONLY` (Pink badge)
    4. `ARTICLES ONLY` (Violet badge, `article` icon)
    5. `WIKIS ONLY` (Amber badge, `auto_stories` icon)
    6. `Approve All` (Emerald badge, one-click batch release)
- **Preview Modal**:
  - Added rich previews for Articles and Wikis in the `previewingMedia` modal, rendering HTML content, cover/thumbnail image or document icon, author attribution, and categories/tags.
- **Approve / Reject Handlers**:
  - `handleApproveMedia`: Updates article status to `Published` via `apiClient.put(/articles/{id})` or wiki status to `Published` via `wikiApi.updateWiki(id)`, removes item from pending queue, dispatches events (`article-published`, `wiki-published`), awards karma (+8 points) to the author, and logs the action to the governance audit trail.
  - `handleRejectMedia`: Updates status to `Rejected`, removes item from pending queue, and notifies the author.
  - `handleBatchApproveMedia`: Iterates through all queued media items, publishing articles and wikis alongside videos and podcasts.

---

- **Moderator Submission Enforcement**: Updated `CreateArticleModal.jsx`, `Articles.jsx`, `CreateWikiModal.jsx`, `UploadVideoModal.jsx`, and `UploadPodcastModal.jsx` to enforce that Moderators (`MOD` / `Moderator`) cannot bypass the approval gate when creating or uploading content. All Article, Wiki, Video, and Podcast submissions created by Moderators transition to `PendingApproval` and are routed to the Media Approvals queue in the Admin Console. Only approved submissions are published to their respective catalogs.
- Privileged direct publishing without approval is restricted strictly to System Administrators (`SYSADM`).
