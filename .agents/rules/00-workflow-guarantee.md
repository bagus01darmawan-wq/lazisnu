---
trigger: manual
---

# Workflow Adherence Protocol

## MANDATORY PROCEDURE
Before executing any task associated with a specific project phase (e.g., "Phase 6", "Build Web Dashboard", etc.), the agent MUST:

1. **Check Sprint Status**: Read `.agents/rules/10-sprint-aktif.md`.
2. **Identify Relevant Workflow**: Search `.agents/workflows/` for a filename that matches the current sprint or task theme.
3. **Internalize Instructions**: Read the entire workflow content before writing a single line of code or running a modification command.
4. **Strict Alignment**: If there is a discrepancy between the current codebase and the workflow (e.g., framework mismatch), the agent MUST prioritize the WORKFLOW and inform the user before proceeding with corrective migration.

## AUTOMATIC TRIGGER
Every time a new task is started, the agent should search for workflows using the search_web or ls command on the `.agents/workflows` directory.

---
*Lazisnu System Protocol — rules/00-workflow-guarantee.md*
