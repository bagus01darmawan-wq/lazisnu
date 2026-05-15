---
name: lazisnu-architecture
description: Plan architecture, evaluate design decisions, map data flow, design API contracts, model data, decide service boundaries, or create ADR-style reasoning for the Lazisnu monorepo.
---

# Lazisnu Architecture Skill

Use this skill when designing new features, changing API contracts, changing database schema, introducing queues, changing offline sync, or evaluating architecture decisions.

## Goal

Help the user understand how a feature flows through the monorepo before writing code.

## Required Architecture Flow

1. Clarify the business goal.
2. Identify affected apps and packages.
3. Map the data flow end-to-end.
4. Define or inspect the API contract.
5. Define data model impact.
6. Identify validation and permission boundaries.
7. Consider offline behavior for mobile.
8. Consider queue/retry behavior if WhatsApp or async work is involved.
9. Explain trade-offs in simple language.
10. Suggest a small implementation sequence.

## Monorepo Data Flow Template

```txt
User action
  -> apps/web or apps/mobile UI
  -> API client/service
  -> apps/backend route
  -> validation/auth middleware
  -> service/business logic
  -> database or queue
  -> response
  -> UI state update
```

## Design Rules

- Put shared API-facing types in `packages/shared-types` when used by multiple apps.
- Keep app-only UI state local to the app.
- Validate external input at API boundaries.
- Keep business logic out of route handlers when it becomes complex.
- Respect immutable `collections` behavior.
- Explain every database schema change and migration risk.
- Prefer simple architecture unless complexity is justified.

## Response Format

```md
## Architecture Plan

**Business goal:**
...

**Affected areas:**
- `...`

**Data flow:**
```txt
...
```

**API contract:**
- Request:
- Response:
- Validation:

**Database impact:**
- ...

**Trade-offs:**
| Option | Pros | Cons |
|---|---|---|
| ... | ... | ... |

**Implementation sequence:**
1. ...
2. ...

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
