---
name: lazisnu-debug
description: Debug error, bug, crash, build failure, TypeScript error, API error, mobile error, web error, backend error, database issue, or behavior that does not match expectation in the Lazisnu monorepo.
---

# Lazisnu Debug Skill

Use this skill when the user reports an error, stack trace, failed command, broken UI flow, failed API call, failed build, failed lint, failed test, or unexpected behavior.

## Goal

Help the user debug systematically while learning how to reason through the problem. Do not jump straight to a full patch unless the cause is already clear.

## Required Debug Flow

1. Restate the problem in simple language.
2. Identify expected behavior vs actual behavior.
3. Identify the likely area:
   - `apps/backend` for API, auth, database, queues, server errors.
   - `apps/web` for dashboard, Next.js, React, forms, tables, client API calls.
   - `apps/mobile` for Android, React Native, scan QR, offline storage, navigation.
   - `packages/shared-types` for contract/type mismatch.
4. Ask for or inspect the exact error text, command, file path, and recent change.
5. Form 2-4 hypotheses.
6. Give small verification steps before patching.
7. Patch only after the likely root cause is identified.
8. End with a Learning Checkpoint.

## Monorepo Checks

Before proposing a fix, check whether the bug crosses boundaries:

- Backend route contract changed but web/mobile still use the old shape.
- Shared type changed but app code was not updated.
- Database schema changed but validation or service logic was not updated.
- API returns a shape that does not match Zod validation or TypeScript type.
- Mobile offline data format differs from backend sync format.

## Commands to Suggest When Relevant

```bash
pnpm build:shared
pnpm build:backend
pnpm build:web
pnpm --filter lazisnu-backend lint
pnpm --filter web lint
pnpm --filter lazisnu-collector-app lint
```

Use only commands relevant to the area being debugged.

## Response Format

```md
## Debug Plan

**Masalah:**
...

**Expected vs Actual:**
- Expected:
- Actual:

**Area kemungkinan:**
- ...

**Hipotesis:**
1. ...
2. ...

**Langkah cek:**
1. ...
2. ...

**Fix yang disarankan:**
...

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
