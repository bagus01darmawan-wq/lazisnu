---
name: lazisnu-code-review
description: Review code changes, PRs, diffs, files, or implementation plans in the Lazisnu monorepo for correctness, security, performance, maintainability, type safety, and learning value.
---

# Lazisnu Code Review Skill

Use this skill when the user asks to review code, review a PR, check a diff, inspect a file, verify a feature before merge, or evaluate whether an implementation is safe.

## Goal

Review the change like a senior engineer while keeping the feedback understandable for a beginner developer.

## Review Dimensions

1. Correctness
   - Does the code solve the intended problem?
   - Are edge cases handled?
   - Is error handling clear?

2. Type Safety
   - Are TypeScript types accurate?
   - Should a type live in `packages/shared-types` or only inside one app?
   - Are nullable, optional, and union states handled safely?

3. Monorepo Contract
   - If backend response changed, are web and mobile updated?
   - If shared type changed, are all consumers updated?
   - If validation changed, does the API contract still match the frontend form?

4. Security
   - Auth and role checks.
   - Input validation with Zod or equivalent boundary validation.
   - No secrets or credentials in code.
   - No unsafe direct database operations.

5. Database and Data Integrity
   - Do not UPDATE or DELETE immutable `collections` records.
   - Prefer append/re-submit pattern when relevant.
   - Check migrations, indexes, and relation assumptions.

6. Mobile Offline-first
   - Is Android behavior considered?
   - Is MMKV/offline cache format stable?
   - Is sync conflict or retry behavior considered?

7. Maintainability
   - Is naming clear?
   - Is logic duplicated?
   - Is the code understandable for a beginner maintaining this project?

8. Testability
   - What test should prevent regression?
   - Is the logic isolated enough to test?

## Response Rules

- Prioritize the 3 most important issues first.
- Do not overwhelm the user with too many minor comments.
- Include what looks good, not only problems.
- For every major issue, explain the reason and a beginner-friendly fix direction.
- End with a Learning Checkpoint.

## Response Format

```md
## Code Review

**Scope:**
- ...

**Summary:**
...

### Must Fix
| Area | Issue | Why it matters | Suggested fix |
|---|---|---|---|
| ... | ... | ... | ... |

### Should Improve
| Area | Suggestion | Benefit |
|---|---|---|
| ... | ... | ... |

### What Looks Good
- ...

### Verdict
Approve / Needs changes / Needs more context

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
