---
trigger: model_decision
---

# Rule: Critical Business Rules
# Scope: All agents — READ THIS before writing any logic touching collections, QR, WA, or roles

---

## BR-01: Immutable Collections

```
FORBIDDEN:
  DELETE FROM collections WHERE ...
  UPDATE collections SET nominal = ...
  UPDATE collections SET payment_method = ...
  UPDATE collections SET officer_id = ...

ALLOWED (only exception):
  UPDATE collections SET is_latest = false ...
  (only for versioning flag during re-submit)

REASON: Collection data is financial proof that must be fully auditable.
```

---

## BR-02: QR Token — HMAC-SHA256

```typescript
// VALIDATION (when officer scans QR — GET /v1/mobile/scan/:qrCode):
1. Verify HMAC signature token (if implemented) → if failed: QR_INVALID
2. Check can.is_active = true                   → if false: QR_INVALID
3. Check active assignment for this officer     → if none: QR_NOT_ASSIGNED
4. Check no collection with isLatest=true       → if exists: QR_ALREADY_SUBMITTED
5. All pass → return can details
```

---

## BR-03: WhatsApp Notification — Mandatory After Submit

```
RULE: Every successful collections INSERT MUST trigger a WA job to BullMQ.
WA must not be blocking — should be async via queue.

FLOW:
  POST /v1/mobile/collections
    → DB INSERT success
    → push job { collectionId } to queue 'whatsapp-notifications'
    → return 201 to client (don't wait for WA sent)

  Worker whatsapp.worker.ts:
    → take job from queue
    → query collection + can details
    → send WA via Meta Graph API
    → log to notifications table
```

---

## BR-04: Offline Queue in Mobile

```typescript
// Structure for offline record (stored in MMKV):
interface OfflineRecord {
  offline_id       : string   // Local UUID for tracking/dedup
  can_id           : string
  assignment_id    : string
  nominal          : number
  payment_method   : 'CASH' | 'TRANSFER'
  collected_at     : string   // ISO 8601 timestamp
}
```

---

## BR-05: Role Filtering — Mandatory

```typescript
// ADMIN_RANTING → filter by branch_id:
if (user.role === 'ADMIN_RANTING') {
  query = query.where(eq(table.branchId, user.branchId))
}

// PETUGAS → only their own data:
if (user.role === 'PETUGAS') {
  query = query.where(eq(table.officerId, user.id))
}
```

---

*Lazisnu Infaq Collection System — rules/04-business-rules.md*
