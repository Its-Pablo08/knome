# Development Journal — Entry 176
## Update EmployeeId from MPO103 to EMP052 for Sourabh Sahu

### Date: October 7, 2026
### Target: Knome Platform (Frontend Roster + Database Schema Alignment)
### Employee: Sourabh Sahu (`UserId: 3`, HR Administrator)
### Scope: Update Canonical Employee ID from `MPO103` to `EMP052`
### Status: Successfully Executed & Verified (100% Data Integrity Achieved)

---

### 1. Context & Rationale
In earlier Knome seed/demo data, **Sourabh Sahu** was designated with employee ID `MPO103`. In the official MPOnline Employee Hub system, his real canonical employee identifier is `EMP052`.

When `EMP052` previously logged in via MPO Hub SSO, an auto-provisioned shell record (`UserId: 1102`) was generated. To reconcile and consolidate the data:
- The auto-provisioned shell user `1102` was cleanly merged into canonical `UserId: 3` (reassigning any messages/interactions).
- Sourabh Sahu's `UserId: 3` record was updated to `EmployeeId = 'EMP052'`.
- Frontend demo user roster, employee mappings, and fallback resolution dictionaries were updated to recognize `EMP052` as Sourabh Sahu's primary employee ID.

---

### 2. Frontend Modifications
The following frontend components were updated:

1. **[`UserContext.jsx`](file:///d:/knome%20new/knome/Knome%20main/knomeUI/frontend/src/components/contexts/UserContext.jsx)**:
   - Added `'EMP052': 'Sourabh Sahu'` to `KNOWN_ROSTER_NAMES`.
   - Updated `INITIAL_USERS` entry for `userId: 3` to `employeeId: 'EMP052'`.
   - Added backward compatibility for `savedEmpId === 'MPO103'` in local session restoration.

2. **[`Network.jsx`](file:///d:/knome%20new/knome/Knome%20main/knomeUI/frontend/src/pages/Network.jsx)**:
   - Added `'EMP052': 'Sourabh Sahu'` in `KNOWN_ROSTER_NAMES`.
   - Added `'EMP052': { role: 'HR Admin', designation: 'Talent Acquisition Manager' }` in `KNOWN_ROSTER_ROLES`.

3. **[`PeopleYouMayKnowWidget.jsx`](file:///d:/knome%20new/knome/Knome%20main/knomeUI/frontend/src/components/widgets/PeopleYouMayKnowWidget.jsx)**:
   - Added `'EMP052': 'Sourabh Sahu'` to `knownRoster`.

4. **[`Cleanup_Non_Whitelisted_Users_And_Data.sql`](file:///d:/knome%20new/knome/Knome%20main/Documentation/Database/Cleanup_Non_Whitelisted_Users_And_Data.sql)**:
   - Updated canonical whitelist record for `UserId: 3` to `EMP052`.

---

### 3. Database Execution & Audit Results
On October 7, 2026, upon user confirmation, [`Documentation/Database/Update_EmployeeId_MPO103_To_EMP052.sql`](file:///d:/knome%20new/knome/Knome%20main/Documentation/Database/Update_EmployeeId_MPO103_To_EMP052.sql) was executed against SQL Server database `[Knome]` on `LAPTOP-458`.

#### Execution Telemetry:
```text
KNOME: UPDATE EMPLOYEE ID FROM MPO103 TO EMP052 (SOURABH SAHU)
Found auto-provisioned shell user record with EmployeeId EMP052 (UserId: 1102). Merging into canonical User 3...
Shell user 1102 safely merged and removed.
Step 2: Temporarily disabling self-referential manager constraint...
Step 3: Updating User 3 (Sourabh Sahu) EmployeeId to EMP052...
        Rows updated in [Users]: 1
Step 4: Updating any [ManagerEmployeeId] references from MPO103 to EMP052...
        Manager references updated: 0
Step 5: Updating [RoleRequests] if any exist...
        RoleRequests updated: 2
Step 6: Re-enabling and validating [FK_Users_Manager] constraint...

SUCCESS: Sourabh Sahu (UserId: 3) EmployeeId updated to EMP052 successfully!
```

#### Final Database State:
| Field | Value |
|:---|:---|
| **UserId** | `3` |
| **EmployeeId** | `EMP052` |
| **FullName** | `Sourabh Sahu` |
| **Email** | `sourabhsahu45@gmail.com` |
| **Designation** | `Talent Acquisition Manager` |
| **DepartmentId** | `2` |
| **IsActive** | `1` |
| **PostCount** | `13` |
| **MessageCount** | `9` |
| **Remaining MPO103 in DB** | `0` |
