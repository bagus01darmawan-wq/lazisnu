---
name: lazisnu-testing
description: Design test strategy, regression checks, validation plans, and testing priorities for backend, web, mobile, API contracts, offline sync, and shared types in the Lazisnu monorepo.
---

# Lazisnu Testing Skill

Use this skill when discussing testing, QA, validation, regression prevention, deploy confidence, or test coverage.

## Goal

Help the user design practical tests that improve confidence without overwhelming a beginner developer.

## Testing Priorities

Prioritize these areas first:

1. Authentication and authorization.
2. Shared API contracts.
3. Collection transaction flow.
4. Offline sync and retry.
5. WhatsApp queue and retry behavior.
6. Form validation.
7. Data integrity around immutable collections.
8. Build and deployment safety.

## Suggested Test Layers

### Backend

- Service logic tests.
- API route integration tests.
- Validation tests.
- Queue/retry behavior tests.
- Database integrity tests.

### Web Dashboard

- Form validation.
- Table filtering/search behavior.
- API loading/error/success states.
- Role-based access.

### Mobile

- Offline storage behavior.
- Sync retry flow.
- QR scan flow.
- Network reconnect behavior.
- Navigation edge cases.

### Shared Types

- Contract consistency.
- API response shape alignment.
- Breaking-change detection.

## Minimum Safety Checklist Before Merge

- Relevant app builds successfully.
- Lint passes.
- No shared-type mismatch.
- Critical flow manually tested.
- Error state manually tested.
- Loading and empty states checked.

## Response Format

```md
## Testing Strategy

**Area:**
- ...

### What to Test
| Area | Test Type | Why |
|---|---|---|
| ... | ... | ... |

### Highest Priority Checks
1. ...
2. ...

### Manual Regression Checklist
- [ ] ...
- [ ] ...

### Suggested Commands
```bash
...
```

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
