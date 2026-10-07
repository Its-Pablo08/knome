# Development Journal — Entry 174
## Wiki Module Complete Logical, Security, and Functional Hardening

### Date: October 7, 2026
### Module: Wiki (Institutional Knowledge & Living Playbooks)
### Status: Completed

---

### 1. Overview & Objective
Following a comprehensive functional, logical, security, data-flow, and UX review of the Wiki module, 24 deficiencies were cataloged across backend services, repositories, controllers, database operations, and frontend React interfaces. 

All 24 identified deficiencies have been completely remediated:
- **Critical (4)**: Stored XSS sanitization (WIKI-001), audience access enforcement on published wikis (WIKI-002), cross-wiki section hijacking prevention (WIKI-003), and multi-tier subsection hierarchy projection (WIKI-004).
- **High (8)**: Editor archive privilege escalation (WIKI-005), Global Search engine indexing (WIKI-006), atomic view count incrementing (WIKI-007), soft-delete restoration lifecycle (WIKI-008), viewer sharing restriction (WIKI-009), Department Sphere access check (WIKI-010), frontend directory pagination (WIKI-011), and database creation transactional atomicity (WIKI-012).
- **Medium (8)**: Suspension guards on all mutating operations (WIKI-013), optimistic concurrency checks (WIKI-014), case-insensitive tag deduplication (WIKI-015), section restore from deletion (WIKI-016), archived wiki readability (WIKI-017), collaboration notifications (WIKI-018), deep search across sections (WIKI-019), and custom confirmation dialogs (WIKI-020).
- **Low (4)**: Category validation (WIKI-021), version diff visualizer (WIKI-022), polymorphic share cleanup (WIKI-023), and editor autosave draft recovery (WIKI-024).

---

### 2. Implementation Architecture & Data Flow

```
[ Frontend: Wiki.jsx / WikiView.jsx / Modals ]
     │ (Input Sanitization, Autosave, Multi-Tier Outline, Pagination, Diff Viewer, useConfirm)
     ▼
[ API: WikiController / SearchController ]
     │ (Role & Suspension Guards, Restore Endpoint, Query Routing)
     ▼
[ Service: WikiService / SearchService ]
     │ (Audience Resolution, Cycle Detection, Transacted Create, Sanitizer, Concurrency Check)
     ▼
[ Repository: WikiRepository / SearchRepository ]
     │ (Atomic View Counters, Deep Section Search, Case-Insensitive Tags)
     ▼
[ Database: SQL Server (Knome) ]
```

---

### 3. Summary of Remediated Issues (WIKI-001 through WIKI-024)

| ID | Issue Description | Fix Summary | Modified Files |
|---|---|---|---|
| **WIKI-001** | Stored XSS via raw HTML rendering | Added `HtmlSanitizerHelper.cs` (server) & `sanitizeHtml.js` (client DOMParser) | `HtmlSanitizerHelper.cs`, `WikiService.cs`, `sanitizeHtml.js`, `WikiView.jsx`, `WikiVersionHistoryModal.jsx` |
| **WIKI-002** | Blanket fallback bypassed audience restrictions | Removed `if (wiki.Status == "Published") return;`, enforce restricted shares strictly | `WikiService.cs` (`EnsureCanViewWikiAsync`) |
| **WIKI-003** | Cross-wiki section grafting & circular trees | Validated `ParentSectionId` belongs to same `wikiId` and added cycle detection | `WikiService.cs` (`CreateSectionAsync`, `UpdateSectionAsync`) |
| **WIKI-004** | Subsections beyond depth 2 dropped | Implemented recursive section tree projection and recursive UI outline rendering | `WikiService.cs` (`BuildHierarchicalSections`), `WikiView.jsx` (`OutlineSectionItem`) |
| **WIKI-005** | Editors could archive wikis via PUT endpoint | Enforced `EnsureCanManageWikiAsync` on `"Archived"` status transitions in `UpdateWikiAsync` | `WikiService.cs` (`UpdateWikiAsync`) |
| **WIKI-006** | Wikis missing from platform global search | Added `QueryWikis` indexing title, description, contentHtml, tags, and sections | `SearchRepository.cs`, `SearchService.cs` |
| **WIKI-007** | Non-atomic view increment & missing auth | Added `EnsureCanViewWikiAsync` check and atomic SQL `ExecuteUpdateAsync` | `WikiService.cs`, `WikiRepository.cs` |
| **WIKI-008** | Soft-deleted wikis could not be restored | Added `POST /api/wikis/{id}/restore` endpoint and repository restore logic | `WikiController.cs`, `WikiService.cs`, `WikiRepository.cs`, `wikiService.js` |
| **WIKI-009** | Regular viewers could grant shares | Barred non-editors/non-owners from sharing with `ForbiddenException` | `WikiService.cs` (`ShareWikiAsync`) |
| **WIKI-010** | Department Sphere shares ignored in auth | Added `ShareType == "Group"` checking matching user's `DepartmentId` | `WikiService.cs`, `WikiRepository.cs` |
| **WIKI-011** | No pagination in Wiki library | Added interactive page controls, item counters, and filter resets | `Wiki.jsx` |
| **WIKI-012** | Non-transactional Wiki creation | Wrapped creation, initial version, collaborator, and shares in DB transaction | `WikiService.cs` (`CreateWikiAsync`) |
| **WIKI-013** | Suspended users could delete, share, reorder | Added `_suspensionGuard.EnsureNotSuspendedAsync` to all mutating operations | `WikiService.cs` |
| **WIKI-014** | Blind last-write-wins concurrency loss | Added `ExpectedUpdatedDate` concurrency token, throwing 409 Conflict on staleness | `UpdateWikiDto.cs`, `CreateWikiSectionDto.cs`, `WikiService.cs`, `CreateWikiModal.jsx`, `WikiSectionModal.jsx` |
| **WIKI-015** | Tag casing collision SQL Server crashes | Deduplicated tags with `Distinct(StringComparer.OrdinalIgnoreCase)` | `WikiRepository.cs` |
| **WIKI-016** | Soft-deleted sections unrestorable | Allowed `GetSectionByIdAsync` to retrieve deleted sections and undelete on restore | `WikiRepository.cs`, `WikiService.cs` (`RestoreVersionAsync`) |
| **WIKI-017** | Archived wikis blocked legitimate viewers | Permitted view access on `Status == "Archived"` for permitted readers | `WikiService.cs` (`EnsureCanViewWikiAsync`) |
| **WIKI-018** | Collaborators received "Community" notification | Defined `NotificationTypes.Wiki` and updated dispatch calls | `NotificationTypes.cs`, `WikiService.cs` |
| **WIKI-019** | Wiki search ignored sections and ContentHtml | Expanded `GetWikisPagedAsync` search filter to `ContentHtml` and sections | `WikiRepository.cs` |
| **WIKI-020** | Native window.confirm broke design system | Replaced all native alerts with `useConfirm()` styled modal dialogs | `WikiShareModal.jsx`, `WikiCollaboratorsModal.jsx`, `WikiVersionHistoryModal.jsx` |
| **WIKI-021** | Invalid CategoryId triggered 500 error | Validated CategoryId existence against `_db.Categories`, throwing 400 | `CreateWikiValidator.cs`, `UpdateWikiValidator.cs`, `WikiService.cs` |
| **WIKI-022** | Version history lacked visual diffing | Added side-by-side snapshot comparison view in version modal | `WikiVersionHistoryModal.jsx` |
| **WIKI-023** | Polymorphic share orphans and duplicates | Validated target existence before sharing, upserted existing, filtered orphans | `WikiService.cs` (`ShareWikiAsync`, `GetSharesAsync`, `GetWikiDetailAsync`) |
| **WIKI-024** | Unsaved editor content lost on accident | Implemented periodic 3-second `localStorage` autosave and draft recovery | `CreateWikiModal.jsx`, `WikiSectionModal.jsx` |
