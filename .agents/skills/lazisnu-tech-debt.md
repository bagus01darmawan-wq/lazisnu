---
name: lazisnu-tech-debt
description: Identify and prioritize technical debt, refactor targets, code health issues, dependency risks, documentation gaps, architecture debt, and maintenance backlog in the Lazisnu monorepo.
---

# Lazisnu Tech Debt Skill

Use this skill when the user asks what to refactor, how to clean up the project, what debt to fix before launch, or how to prioritize remaining work.

## Goal

Help the user improve code health without derailing feature completion.

## Debt Categories

1. Code debt
   - duplicated logic;
   - large files;
   - unclear naming;
   - mixed UI and business logic.

2. Contract debt
   - backend response does not match frontend/mobile assumptions;
   - missing shared types;
   - duplicated types across apps.

3. Test debt
   - missing tests for critical flows;
   - no regression checklist;
   - manual-only testing.

4. Database debt
   - unclear schema ownership;
   - missing indexes;
   - risky mutation of important records;
   - migration not documented.

5. Documentation debt
   - outdated README;
   - missing setup notes;
   - missing runbook;
   - unclear environment variables.

6. Dependency debt
   - unused dependencies;
   - outdated packages;
   - inconsistent versions across apps.

7. UX debt
   - missing loading, empty, error, success states;
   - unclear validation messages;
   - inconsistent design system.

## Prioritization Score

Use this scoring:

```txt
Priority = (Impact + Risk) x (6 - Effort)
```

Each value is 1-5:

- Impact: how much it slows development or hurts users.
- Risk: how dangerous if ignored.
- Effort: how hard to fix.

## Response Format

```md
## Tech Debt Audit

### Top Priorities
| Priority | Area | Debt | Impact | Risk | Effort | Why now |
|---|---|---|---:|---:|---:|---|
| ... | ... | ... | ... | ... | ... | ... |

### Safe Refactor Plan
1. ...
2. ...

### Do Not Touch Yet
- ...

### Quick Wins
- ...

## Learning Checkpoint

**Konsep yang dipakai:**
- ...

**File yang perlu kamu pahami:**
- `...`

**Cara mengetes:**
- ...

**Latihan kecil:**
- ...
```
