# Git Remote Operations Policy

## Approval Requirement for Push and Pull

- **Explicit Approval Required**: The agent must obtain explicit user approval before executing any `git push` or `git pull` operation.
- **Prohibited Autonomous Actions**:
  - Do NOT execute `git push` autonomously.
  - Do NOT execute `git pull` autonomously.
  - Do NOT execute `git fetch` or branch merges to/from remote autonomously.
- **Workflow**:
  1. Complete local implementation, verification, and local commits if needed.
  2. Ask the user clearly: "Would you like me to push/pull these changes to/from the repository?"
  3. Wait for the user's explicit confirmation before running `git push` or `git pull`.
