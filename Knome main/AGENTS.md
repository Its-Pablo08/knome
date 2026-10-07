# AGENTS.md — Knome (MPOnline Limited)

## Identity

Enterprise knowledge management platform (LinkedIn/Medium/YouTube hybrid) for MPOnline Limited.
Monorepo with two top-level packages: `Backend/Knome.API` (ASP.NET Core 10) + `Frontend/knome-web` (React/Vite/TypeScript).

## Existing Instruction Files

- `CLAUDE.md` — primary project instructions (read first every session)
- `Documentation/Project/PROJECT_CONTEXT.md` — current phase, architecture decisions, known issues
- `Documentation/Project/PROJECT_STATUS.md` — detailed phase-by-phase status, verification commands, test credentials

## Critical Constraints

- **Never** manually modify `Models/` or `Data/KnomeDbContext.cs` — they are scaffolded
- **Never** modify scaffolded code at all; DB schema changes originate from SQL Server only
- **Re-scaffold** whenever DB changes (`dotnet ef dbcontext scaffold ...`)
- Business logic belongs in `Services/`, repositories in `Repositories/`, controllers stay thin
- External integrations (HRMS SSO, email digests, HRMS sync) are **deferred** — no dummy implementations

## Git Operations & Approval Policy

- **MANDATORY USER APPROVAL**: Git `push` and `pull` operations must **ONLY** be performed after receiving explicit approval from the user.
- **No Autonomous Remote Git Actions**: The agent must **NEVER** run `git push`, `git pull`, `git fetch`, or any remote synchronization command automatically or autonomously.
- **Approval Flow**: When code changes are ready to be pushed or remote changes need to be pulled, the agent must present the summary of changes and ask the user for confirmation. Only execute `git push` or `git pull` if the user explicitly confirms/approves.
- Local inspection commands (`git status`, `git diff`, `git log`) may be used to verify local state without modifying the remote repository.

## Source-of-Truth Hierarchy

Functional Requirements Document (FRD) → DB schema → codebase → project docs.
If conflict exists between sources, explain before implementing.
If implementation differs from the FRD due to an approved architectural decision, **preserve the implementation** and document the reason before making changes.

## Build & Run

### Single Terminal Launcher (Recommended - One Command Runs Everything)
From the workspace root or `Knome main`:
```powershell
.\start          # (or npm start, or .\start.bat, or .\start.ps1)
```
This single command automatically clears stale ports, tests SQL connectivity, starts the Backend API (port 5096), starts the Frontend UI (port 5173), verifies IIS sites, and streams color-coded logs in real time. Pressing `Ctrl+C` cleanly shuts down all services.

### Manual Individual Commands (If running separately)
```powershell
# Backend API
cd Backend/Knome.API
dotnet build -nologo
dotnet run --launch-profile http    # → http://localhost:5096/swagger

# Frontend
cd knomeUI/frontend
npm run dev                         # → http://localhost:5173
```

## Verification (No Unit Tests)

All verification is via scratch console apps that run against **live SQL Server** (`localhost`, database `Knome`):

```powershell
# Full DI resolution check across all 14 controllers + 12 modules
dotnet run --project "Tools/VerifyDiResolvers/VerifyDiResolvers.csproj"

# Phase-specific verifications (see Documentation/Project/PROJECT_STATUS.md for full list)
dotnet run --project "Tools/VerifyPhase9/VerifyPhase9.csproj"
```

Test login credentials: `EMP001`–`EMP004` with password `Password@123` (seed script at `Documentation/Architecture/Seed_Test_Credentials.sql`).

## Authentication & Login Portal

- **Always log in through MPO Employee Hub**: [MPO Employee Hub](https://counselling-1.mponline.demo.gov.in:3001/applications)
- Whenever performing authentication workflows, guiding login steps, or handling SSO, always use and route through `https://counselling-1.mponline.demo.gov.in:3001/applications`.

## Architecture Quick Reference

| Concern | Location |
| :--- | :--- |
| DI + Auth + Swagger wiring | `Extensions/ServiceCollectionExtensions.cs` (`AddInfrastructure`) |
| Middleware pipeline | `Extensions/ApplicationBuilderExtensions.cs` (`UseInfrastructure`) |
| Entrypoint | `Program.cs` — calls `AddInfrastructure` + `UseInfrastructure` |
| Background worker | `Background/JobExpiryHostedService` (only one) |
| File storage | `Services/LocalFileStorageService` (local disk, not cloud) |
| Response envelope | `ApiResponse<T>` across all endpoints |
| Validation | FluentValidation in `Validators/` (wired via `AddFluentValidation`) |
| Mapping | AutoMapper profiles in `Mapping/` (one per module) |

## Roles (JWT HS256, BCrypt work factor 11)

- `Employee` — standard self-service, content posting
- `Community Admin` — community management
- `HR Administrator` — department/role changes, job postings, broadcasts
- `System Administrator` — audit logs, governance

## Documentation Workflow

**Before implementing:** `CLAUDE.md` → `Documentation/Project/PROJECT_CONTEXT.md` → `Documentation/Project/PROJECT_STATUS.md` → latest Dev Journal → FRD section.
**Implementation Plans:** Every implementation plan and walkthrough MUST automatically be persisted and saved into `Documentation/Development Journal/` as a numbered phase entry (e.g. `21_First_Time_Login_Default_Role_And_Email_Workflow.md`).
**After every phase:** `dotnet restore` → `dotnet build` → verify APIs → update Dev Journal in `Documentation/Development Journal/` → update API docs → update `Documentation/Project/PROJECT_STATUS.md` → update `Documentation/Project/PROJECT_CONTEXT.md`.

## Determining Completion Status

Do **not** assume the project is complete. Always determine current state by reading these sources (in order):

1. `Documentation/Project/PROJECT_STATUS.md` — authoritative task-by-task implementation tracker
2. `Documentation/Project/PROJECT_CONTEXT.md` — current phase, pending modules, external dependency status
3. Latest Development Journal (`Documentation/Development Journal/`)
4. Relevant FRD sections (if a specific feature is in question)
