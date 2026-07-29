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
  → Input nominal received (Cash or Transfer - Note: offline sync only supports CASH)
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

## Auth & Session Architecture

| Layer | Detail |
|---|---|
| Access Token | JWT, TTL 15 menit, signed with `JWT_ACCESS_SECRET` |
| Refresh Token | JWT, TTL 365 hari (semua role), signed with `JWT_REFRESH_SECRET` |
| Session Model | Multi-device — login ulang di perangkat sama menimpa key lama |
| Revocation | Per-device via Redis key + `revokedAt` di `user_sessions` |
| Redis Fallback | Fail-closed di production (503); fallback + warning di dev |
| Biometrik Mobile | Opsional — sidik jari sebagai gate ke refresh token di Keystore |
| OTP Login | Dikirim via WhatsApp (Fonnte/Meta API) |
| Blacklist AT | Tidak digunakan — terima window revoke 15 menit (D-07) |

## Container Architecture

| Service | Port | Deskripsi |
|---|---|---|
| `redis` | 6379 | Cache & queue (Redis 7-alpine, `volatile-lru`) |
| `backend` | 3001 | Fastify API server |
| `worker` | — | WhatsApp worker (BullMQ, proses terpisah) |
| `web` | 3000 | Next.js dashboard |
| `nginx` | 80/443 | Reverse proxy + SSL termination |

**Environments:**
- **Staging**: auto-deploy dari push main (`docker-compose.staging.yml`, port 4000/4001)
- **Production**: deploy via tag `v*` (docker-compose.yml, port 80/443)

**Mobile build profiles** (`eas.json`):
- `development`: API → `http://10.0.2.2:3001`
- `preview`: API → `https://staging-api.lazisnu.site`
- `production`: API → `https://api.lazisnu.site`

## User Roles

| Role | Platform | Access |
|---|---|---|
| `ADMIN_KECAMATAN` | Web | Super admin — all data across all branches |
| `ADMIN_RANTING` | Web | Data for their own branch only |
| `PETUGAS` | Mobile App | Tasks assigned to them only |
| `BENDAHARA` | Web Dashboard | Read-only reports + operational data |

---
*Lazisnu Infaq Collection System — rules/00-project-overview.md*