---
trigger: manual
---

# Rule: Project Overview
# Scope: All agents / all tasks
# Read this file first before other rules files.

---

## Project Identity

**Name**: Lazisnu Infaq Collection System
**Goal**: Digital system for infaq/sodaqoh collection for Lazisnu institution.
**Main Users**: ~100 field officers who collect money from infaq cans/boxes at donor homes.

---

## Three Main Pillars — Never Violate

```
1. IMMUTABLE AUDIT TRAIL
   Collection data cannot be deleted or changed.
   Corrections only via re-submit (INSERT new record with flag).

2. WHATSAPP AS EXTERNAL VERIFICATION
   Every collection submission MUST trigger a WA notification to the can owner
   containing the actual nominal. This is the primary anti-fraud mechanism.

3. OFFLINE-FIRST
   Officers operate in areas without signal.
   All operations must work offline and sync automatically when connected.
```

---

## Core Workflow (Happy Path)

```
Officer opens app
  → Tap can task from list
  → Scan QR code on the can
  → System validates QR (valid can? active assignment? not submitted this period?)
  → Input nominal received (Cash or Transfer)
  → Review & confirm (cannot be cancelled after this)
  → Submit → WA sent automatically to can owner
  → Task marked as completed
```

---

## Compact Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + TypeScript (Android priority) |
| Web Dashboard | Next.js 14 App Router + TypeScript + Tailwind |
| Backend API | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 16 |
| Cache & Queue | Redis 7 + BullMQ |
| Storage | Cloudflare R2 (QR PDF) |
| Push Notif | Firebase Cloud Messaging |
| WhatsApp | Meta WhatsApp Business API |

---

## User Roles

| Role | Platform | Access |
|---|---|---|
| `ADMIN_KECAMATAN` | Web | Super admin — all data across all branches |
| `ADMIN_RANTING` | Web | Data for their own branch only |
| `PETUGAS` | Mobile App | Tasks assigned to them only |
| `BENDAHARA` | Web Dashboard | Read-only reports + operational data |

---

*Lazisnu Infaq Collection System — rules/00-project-overview.md*