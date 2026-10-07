# Development Journal — Entry 175
## Safely Delete Specific Employee Users and All Related Data

### Date: October 7, 2026
### Target Database: `[Knome]` (SQL Server on `LAPTOP-458`)
### Scope: Deletion of 5 Specific Employees / Users and All Associated Relational Data
### Status: Successfully Executed & Verified (100% Deletion Integrity Achieved)

---

### 1. Target Users Identification
The deletion operation is strictly constrained to the following five (5) user records:

| UserId | EmployeeId | Email | Initial Status | Final Status |
|:---:|:---:|:---|:---|:---|
| **1093** | `EMP100` | `EMP100@mponline.gov.in` | Active | **Permanently Removed** |
| **1094** | `EMP052` | `EMP052@mponline.gov.in` | Active | **Permanently Removed** |
| **1095** | `EMP001` | `EMP001@mponline.gov.in` | Active | **Permanently Removed** |
| **1096** | `EMP003` | `EMP003@mponline.gov.in` | Active | **Permanently Removed** |
| **1097** | `EMP101` | `EMP101@mponline.gov.in` | Active | **Permanently Removed** |

No other users, master data, departments, roles, categories, or shared configuration will be modified or removed.

---

### 2. Complete Relational Dependency Mapping
A thorough schema and Entity Framework model audit was conducted across `KnomeDbContext.cs`, `KnomeDbContext.Wiki.cs`, and `KnomeDbContext.UserMessages.cs`.

The dependencies are mapped into distinct dependency tiers:

```
[Level 0: Pointer Nulling]
  • Users.ManagerEmployeeId (reports to target EmployeeId)
  • CommunityMembers.ApprovedByUserId
  • Abbreviations.CreatedBy
  • ModerationReports.ModeratorUserId
         │
[Level 1: Leaf Interactions & Direct User Tables]
  • UserCredentials, UserRoles, UserSkills, UserInterests
  • NotificationPreferences, Notifications
  • KarmaBalances, KarmaTransactions
  • SearchHistory, AuditLog, RoleRequests
  • Followers, ConnectionRequests, Bookmarks, Reactions, Shares, ContentViews
  • ModerationReports (ReporterUserId)
  • CommunityMembers, CommunityAdmins
         │
[Level 2: Direct Messaging Tables]
  • UserMessageReactions (UserId or MessageId)
  • UserMessages (ParentMessageId self-reference breaking)
  • UserMessages (SenderId / ReceiverId)
         │
[Level 3: Content Authored by Target Users]
  • Posts (PostMentions, PostAudienceUsers, PostAudienceCommunities, CommunityPosts, PostAttachments, HotPostsScoreCache, Comments, Reactions, Bookmarks, Shares, Views -> Posts)
  • Articles (ArticleAttachments, ArticleTags, ArticleVersions, Comments, Reactions, Bookmarks, Shares, Views -> Articles)
  • Media (VideoTags, Comments, Reactions, Bookmarks -> Videos; Comments, Reactions, Bookmarks -> Podcasts)
  • Jobs (PostedByUserId)
  • Communities (CommunityPosts, CommunityMembers, CommunityAdmins, PostAudienceCommunities -> Communities)
         │
[Level 4: Wiki Knowledge Module]
  • WikiCollaborators (UserId / AddedByUserId / SectionId / WikiId)
  • WikiShares (SharedByUserId / TargetId / WikiId)
  • WikiVersions (CreatedByUserId / SectionId / WikiId)
  • WikiSections (ParentSectionId breaking -> WikiSections)
  • Wikis (WikiTags, Shares, Collaborators, Versions, Sections -> Wikis)
         │
[Level 5: Core User Entity]
  • Users (UserId IN (1093, 1094, 1095, 1096, 1097))
```

---

### 3. Deletion Scripts & Artifacts Created
Two production-grade SQL scripts were engineered:
1. [`Documentation/Database/Inspect_Target_Users_Data_Count.sql`](file:///d:/knome%20new/knome/Knome%20main/Documentation/Database/Inspect_Target_Users_Data_Count.sql):
   - Non-destructive, read-only script querying all 35+ tables and returning the exact count of records matching the 5 target users.
2. [`Documentation/Database/Safely_Delete_Target_Users_And_Data.sql`](file:///d:/knome%20new/knome/Knome%20main/Documentation/Database/Safely_Delete_Target_Users_And_Data.sql):
   - Fully atomic transaction wrapped in `BEGIN TRY ... BEGIN TRANSACTION ... COMMIT ... END TRY BEGIN CATCH ... ROLLBACK ... END CATCH`.
   - Executes deletions in strict foreign-key order without disabling constraints.
   - Includes post-deletion integrity assertions checking that zero records remain for the 5 target IDs.

---

### 4. Execution & Post-Verification Audit Results
On October 7, 2026, upon user command, [`Safely_Delete_Target_Users_And_Data.sql`](file:///d:/knome%20new/knome/Knome%20main/Documentation/Database/Safely_Delete_Target_Users_And_Data.sql) was executed against SQL Server database `[Knome]` (`LAPTOP-458`).

#### Execution Telemetry:
```text
Target users found in [Users] table to delete: 5
Step 1: Clearing nullable foreign keys and manager references...
Step 2: Deleting user message reactions and direct messages...
Step 3: Deleting reactions, bookmarks, comments, views, and shares...
Step 4: Deleting credentials, roles, skills, interests, notifications...
Step 5: Deleting posts, articles, videos, podcasts, and jobs authored by target users...
Step 6: Cleaning community memberships and user-owned communities...
Step 7: Cleaning Wiki collaborators, shares, versions, sections, and wikis...
Step 8: Deleting the 5 target users from [Users] table...
Step 9: Executing post-deletion integrity assertions...
SUCCESS: All 5 target users and their related data safely deleted!
Transaction committed successfully.
```

#### Independent Post-Verification Database Assertions:
| Metric / Integrity Check | Result | Expected | Status |
|:---|:---:|:---:|:---:|
| Target Deleted Users Remaining | **0** | `0` | Verified Clean |
| Dangling `UserCredentials` | **0** | `0` | Verified Clean |
| Dangling `UserMessages` | **0** | `0` | Verified Clean |
| Dangling `CommunityMembers` | **0** | `0` | Verified Clean |
| Remaining Valid Canonical Users | **7** | `7` | Verified Intact |
| Foreign Key Violations / Rollbacks | **0** | `0` | Verified Clean |
