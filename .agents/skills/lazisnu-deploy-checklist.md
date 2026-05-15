---
name: lazisnu-deploy-checklist
description: Prepare deployment, release readiness, pre-merge validation, staging checks, production checklist, rollback planning, and final verification for Lazisnu backend, web, mobile, database, and queues.
---

# Lazisnu Deploy Checklist Skill

Use this skill before merging, deploying, releasing, or finishing a milestone.

## Goal

Prevent avoidable release issues and teach the user how to think before shipping.

## Pre-Deploy Checklist

### Repository

- Correct branch selected.
- Latest `main` pulled.
- No accidental local changes.
- Relevant files reviewed.

### Build and Lint

Run only relevant commands:

```bash
pnpm build:shared
pnpm build:backend
pnpm build:web
pnpm --filter lazisnu-backend lint
pnpm --filter web lint
pnpm --filter lazisnu-collector-app lint
```

### Backend

- Environment variables checked.
- Database connection checked.
- Migrations reviewed.
- Auth and role checks verified.
- Queue and retry behavior checked for WhatsApp-related features.

### Web

- Main admin/bendahara flows checked.
- Forms handle loading, error, empty, success states.
- API error messages are readable.
- Role-based access works.

### Mobile Android

- App starts on Android.
- Login works.
- Offline behavior checked.
- Reconnect/sync behavior checked.
- QR scan flow checked if relevant.

### Shared Types

- Shared package builds.
- Backend response shape matches web/mobile usage.
- No duplicated incompatible types.

### Rollback Plan

- Know which commit to revert.
- Know how to disable risky feature if possible.
- Know which environment variables changed.
- Know whether database migration is reversible.

## Response Format

```md
## Deploy Readiness Checklist

**Scope:**
- ...

### Must Pass Before Deploy
- [ ] ...

### Manual Smoke Test
- [ ] ...

### Risk Areas
| Risk | Why | Mitigation |
|---|---|---|
| ... | ... | ... |

### Rollback Plan
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
