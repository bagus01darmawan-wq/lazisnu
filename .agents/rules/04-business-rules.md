---
trigger: manual
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

## BR-02: QR Code — Authenticated Exact Match

```typescript
// VALIDATION (when officer scans QR — GET /v1/mobile/scan/:qrCode):
1. Validate raw qr_code without trim/case conversion       → if failed: QR_INVALID
2. Authenticate officer via JWT                            → if failed: UNAUTHORIZED
3. Check can.is_active = true                              → if false: QR_INVALID
4. Check active assignment for this officer/current period → if none: QR_NOT_ASSIGNED
5. Check no collection with isLatest=true                  → if exists: QR_ALREADY_SUBMITTED
6. All pass → return assignment-shaped task details
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

## BR-04: Offline Queue & Sync Batch Contract

```typescript
// 1. Local Queue item (stored in MMKV):
interface QueuedCollection {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  // Local metadata:
  retry_attempts: number;
  error_type?: string;
  error_message?: string;
}

// 2. Batch Sync Request payload item (sent to API - strict validation):
interface BatchCollectionRequestItem {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: DeviceInfo;
  // Note: payment_method and transfer_receipt_url are rejected in batch sync!
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
