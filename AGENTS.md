# AGENTS.md — Knome (MPOnline Limited)

## Workspace Rules & Instructions

All primary Knome project instructions are maintained in [`Knome main/AGENTS.md`](file:///d:/Knome_Complete_Project/Knome%20main/AGENTS.md).

## Git Operations & Approval Policy

- **MANDATORY USER APPROVAL**: Git `push` and `pull` operations must **ONLY** be performed after receiving explicit approval from the user.
- **No Autonomous Remote Git Actions**: The agent must **NEVER** run `git push`, `git pull`, `git fetch`, or any remote synchronization command automatically or autonomously.
- **Approval Flow**: When code changes are ready to be pushed or remote changes need to be pulled, the agent must present the summary of changes and ask the user for confirmation. Only execute `git push` or `git pull` if the user explicitly confirms/approves.
- Local inspection commands (`git status`, `git diff`, `git log`) may be used to verify local state without modifying the remote repository.
