# Analisis Menyeluruh Arsitektur Lazisnu

> Tanggal: 2026-07-21 | Scope: Kodebase + Infrastruktur + Data Flow

---

## 1. Ringkasan Eksekutif

Lazisnu adalah sistem manajemen infaq berbasis **monorepo** (pnpm workspaces) dengan tiga aplikasi utama:
- **Backend** (Fastify + TypeScript + Drizzle ORM)
- **Web Dashboard** (Next.js 16 + React 19)
- **Mobile App** (React Native 0.74, Android only)

Kodebase secara teknis sudah **matang di level aplikasi** — data model solid, offline-first diimplementasikan dengan benar, prinsip immutability terjaga. Namun, lapisan **infrastruktur dan operasional** sangat lemah untuk tahap production.

---

## 2. Struktur Monorepo

```
lazisnu/
├── apps/
│   ├── backend/          # Fastify API — lazisnu-backend
│   ├── web/              # Next.js Dashboard — web
│   └── mobile/           # React Native — lazisnu-collector-app
├── packages/
│   ├── shared-types/     # @lazisnu/shared-types — kontrak API bersama
│   └── design-tokens/    # Token desain
├── docs/                 # ADR, schema SQL, API docs
└── pnpm-workspace.yaml   # Workspace config
```

**Package manager**: `pnpm@10.33.2` dengan `node >=18`. Semua app mengacu ke `@lazisnu/shared-types` via file reference.

---

## 3. Tech Stack Aktual

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Backend | Node.js + Fastify + TypeScript | Fastify 4, TS 5.4 |
| ORM | Drizzle ORM + `drizzle-kit` | 0.45.2 / 0.31.10 |
| Database | PostgreSQL via Supabase | aws-1-ap-southeast-1 |
| Cache / Queue | Redis via Upstash + BullMQ | ioredis 5, BullMQ 5 |
| Web Dashboard | Next.js 16 + React 19 + Tailwind CSS v4 | Next 16.2.4 |
| Mobile | React Native 0.74 (Android) | RN 0.74.1 |
| State (web) | Zustand 5 + SWR 2 | — |
| State (mobile) | Zustand 4 + MMKV | react-native-mmkv 2 |
| Storage File | Cloudflare R2 (S3-compatible) | AWS SDK v3 |
| WhatsApp | Fonnte API (+ fallback Meta Graph API) | — |
| Push Notif | Firebase Cloud Messaging (FCM) | firebase-admin 13 |
| Auth | JWT access (15m) + refresh (7d), OTP via WA | @fastify/jwt 8 |
| Monitoring | Sentry (backend + web + mobile Crashlytics) | — |
| Hosting | GCP VM (34-101-78-252) | nip.io DNS |

---

## 4. Arsitektur Backend

### 4.1 Struktur

```
apps/backend/src/
├── app.ts              # Fastify setup, plugin register, error handler
├── index.ts            # Entry point, graceful shutdown
├── config/             # env.ts, database.ts, redis.ts, sentry.ts
├── database/
│   ├── schema.ts       # Seluruh tabel Drizzle ORM
│   ├── migrations/     # File migrasi
│   └── seed.ts
├── routes/
│   ├── auth.ts         # /v1/auth/*
│   ├── mobile/         # /v1/mobile/* (collections, tasks, sync, profile)
│   ├── admin/          # /v1/admin/* (10 sub-route)
│   ├── bendahara.ts    # /v1/bendahara/*
│   ├── scheduler.ts    # /v1/scheduler/*
│   ├── health.ts       # /health/*
│   └── metrics.ts      # /metrics
├── middleware/
│   ├── auth.ts         # JWT verify + RBAC
│   ├── audit-logger.ts # Audit trail setiap request
│   ├── ownership.ts    # Resource ownership check
│   └── correlationId.ts
├── services/           # 20 service files (lihat detail di bawah)
├── workers/
│   ├── whatsapp.worker.ts   # BullMQ consumer: kirim WA
│   └── scheduler.worker.ts  # BullMQ: generate assignment bulanan ⚠️ DINONAKTIFKAN
└── utils/              # AppError, errorCatalog, error-guards
```

### 4.2 Route Map

| Prefix | Auth | Roles | Fungsi |
|--------|------|-------|--------|
| `/v1/auth` | Sebagian | All | Login, OTP, refresh token, logout |
| `/v1/mobile` | ✅ | PETUGAS | Collections, tasks, sync, profile |
| `/v1/admin` | ✅ | ADMIN_* | Assignments, cans, officers, districts, dukuhs, WA monitor, audit |
| `/v1/bendahara` | ✅ | BENDAHARA | Laporan koleksi |
| `/v1/scheduler` | API Key | Internal | Trigger generate assignment manual |
| `/health` | ❌ | — | `GET /live`, `GET /ready` |
| `/metrics` | ❌ | — | Prometheus endpoint (⚠️ 501 karena prom-client tidak diinstall) |
| `/docs` | ❌ | Dev only | Swagger UI (disembunyikan di production) |

### 4.3 Services Inventory (20 services)

| Service | Fungsi Utama |
|---------|-------------|
| `collectionSubmission.ts` | Submit koleksi baru, validasi, trigger WA |
| `collectionQueryService.ts` | Query koleksi dengan filter |
| `collectionReportService.ts` | Report PDF + agregasi |
| `collectionCorrectionService.ts` | Resubmit / koreksi koleksi |
| `canService.ts` | CRUD kaleng (can) + QR |
| `assignmentGenerator.ts` | Round-robin assignment bulanan |
| `dashboardService.ts` | Agregasi dashboard admin |
| `mobileSyncService.ts` | Batch sync dari mobile |
| `whatsapp.ts` | Send WA (Meta/Fonnte) + enqueue BullMQ |
| `queues.ts` | BullMQ queue definitions |
| `fcm.ts` | FCM push notification |
| `otp.ts` | Generate + verify OTP via WA |
| `r2.ts` | Cloudflare R2 file operations |
| `qrPdfService.ts` | Generate PDF berisi QR code |
| `sessionService.ts` | Manage user sessions (JTI tracking) |
| `tokenService.ts` | Verify + revoke tokens |
| `officerService.ts` | CRUD officers |
| `auditLogService.ts` | Log audit actions |
| `qr.ts` | QR code generation |
| `dashboardReportService.ts` | Dashboard report aggregation |

---

## 5. Database Schema

### 5.1 Entity Relationship

```
districts (1)──(many) branches (1)──(many) dukuhs
     │                    │
     │                    ├──(many) cans ──(1) qrCode
     │                    │               │
     │                    │           assignments ──(1) officers
     │                    │               │
     │                    │           collections ← immutable ledger
     │                    │               │
     │                    │         notifications (WA log)
     │
    users (1:1) officers ──(many) assignments [primary + backup]
                       └──(many) collections
                       └──(many) syncQueues (server-side queue)

    userSessions (per user, track JTI untuk token revocation)
    activityLogs (audit trail semua aksi)
    collectionSummaries (pre-aggregated report per period/district/branch/officer)
```

### 5.2 Tabel Kritis

**`collections`** — Immutable Append-Only Ledger:
```sql
collections (
  id UUID PK,
  assignment_id → assignments,
  can_id → cans,
  officer_id → officers,
  nominal BIGINT,           -- rupiah, bukan desimal
  offline_id VARCHAR UNIQUE, -- deduplication key dari mobile
  submit_sequence INTEGER,   -- versi: 1, 2, 3, ...
  alasan_resubmit TEXT,      -- wajib jika sequence > 1
  sync_status ENUM(PENDING, COMPLETED, FAILED, CANCELLED),
  device_info JSON,
  UNIQUE(assignment_id, can_id, submit_sequence)  -- mencegah duplikasi versi
)
```

> **Aturan bisnis kritis**: TIDAK BOLEH ada UPDATE/DELETE di `collections`. Koreksi = INSERT baru dengan `submit_sequence + 1`.

**Query "data terbaru":**
```sql
SELECT * FROM collections c1
WHERE submit_sequence = (
  SELECT MAX(submit_sequence)
  FROM collections c2
  WHERE c2.assignment_id = c1.assignment_id
  AND c2.can_id = c1.can_id
);
```

### 5.3 Enum Roles

```
user_role: ADMIN_KECAMATAN | ADMIN_RANTING | BENDAHARA | PETUGAS
```

> ⚠️ **Inkonsistensi**: `middleware/auth.ts:12` mendefinisikan `JWTPayload.role` mencakup `ADMIN_PUSAT | ADMIN_KABUPATEN` yang **tidak ada** di enum database. Ini potensi bug jika token mengandung role tersebut.

---

## 6. Alur Data: Mobile → Backend → WhatsApp

```
Petugas scan QR kaleng
  → ScanScreen.tsx (validasi QR)
  → CollectionScreen.tsx (input nominal)
  → offlineQueue.enqueue(item) [MMKV local storage]
  → syncService.autoSync() [triggered by NetInfo listener]
      → collectionService.batchSubmit(payload) [API call]
          → POST /v1/mobile/collections/batch
          → authenticate middleware (JWT)
          → mobileSyncService.batchSync()
              → loop per item: collectionSubmission.submitCollection()
                  → cek offline_id duplikasi (ALREADY_SYNCED)
                  → INSERT ke collections
                  → trigger sendWhatsAppNotification()
                      → addWhatsAppJob() [BullMQ queue]
                          → whatsapp.worker.ts consumer
                          → sendWhatsAppNotificationSync()
                          → POST Fonnte/Meta API
                          → INSERT ke notifications (log)
              → return BatchSyncResponse {results[]}
      → sync: dequeue sukses, moveToFailed permanent jika error
  → UI refresh (Zustand store update)
```

### 6.1 Offline-First Flow

```
Mobile (MMKV)
  ├── collection_queue_{userId}        — active queue
  ├── collection_queue_failed_{userId} — permanent failures
  └── offline_queue_schema_version_{userId} — migration version (current: v2)

Exponential backoff: 2^(retry_attempts-1) * 1000ms
Max retries: 3 kali per item
Deduplication: offline_id UUID unik per perangkat
```

---

## 7. Alur Auth

```
POST /v1/auth/login (email + password)
  → bcrypt verify
  → generateTokens(): accessToken (15m) + refreshToken (7d)
  → INSERT user_sessions (JTI tracking)

POST /v1/auth/otp/request (phone)
  → generate OTP
  → sendWhatsAppNotification() [OTP via WA]

POST /v1/auth/refresh
  → verify refreshToken (JTI check di user_sessions)
  → return new accessToken

Middleware authenticate():
  → jwtVerify()
  → db lookup user (isActive check)
  → attach currentUser ke request
```

---

## 8. WhatsApp Queue Architecture

```
Collection Submit
  → addWhatsAppJob(data) [BullMQ: whatsapp-notifications]
      attempts: 3
      backoff: exponential, 5000ms initial
      removeOnComplete: true
      removeOnFail: false (DLQ untuk debug)

BullMQ Worker (whatsapp.worker.ts)
  → sendWhatsAppNotificationSync()
  → WA_PROVIDER switch: fonnte | meta
  → INSERT notifications (log sukses/gagal)

Scheduler (weekly): cleanup Redis DLQ
  → queue.clean(7days, 1000, 'failed')
```

---

## 9. Scheduler Worker — Status: DINONAKTIFKAN ⚠️

File `apps/backend/src/index.ts` baris 6 dan 20-22:
```typescript
// import { schedulerWorker, registerMonthlyAssignmentCron } from './workers/scheduler.worker';
// if (config.NODE_ENV !== 'test') {
//   await registerMonthlyAssignmentCron();
// }
```

**Dampak**: Assignment bulanan tidak otomatis ter-generate. Harus di-trigger manual via `POST /v1/scheduler/generate-assignments`. Risiko: data tidak konsisten jika lupa trigger.

**Solusi**: Uncomment 3 baris di `index.ts` + uncomment `schedulerWorker.close()` di graceful shutdown.

---

## 10. Web Dashboard Architecture

```
apps/web/src/
├── app/
│   ├── (auth)/           # Login page
│   ├── api/              # Next.js API routes (proxy atau BFF)
│   ├── dashboard/        # Protected routes
│   │   ├── overview/     # Dashboard utama
│   │   ├── assignments/  # Manajemen penugasan
│   │   ├── cans/         # Manajemen kaleng
│   │   ├── users/        # Manajemen user
│   │   ├── master/       # Data master (district, branch)
│   │   ├── reports/      # Laporan
│   │   ├── resubmit/     # Koreksi koleksi
│   │   ├── audit-log/    # Audit trail
│   │   └── wa-monitor/   # WhatsApp notification monitor
│   └── layout.tsx        # Root layout
├── components/           # Shared UI components
├── lib/                  # API client, utils
├── store/                # Zustand stores
└── middleware.ts         # Auth middleware (jose JWT verify)
```

**Stack**: Next.js 16 App Router, React 19, Tailwind CSS v4, TanStack Table, Recharts, SWR, Zustand 5, react-hook-form + Zod, Sentry.

---

## 11. Mobile App Architecture

```
apps/mobile/src/
├── screens/
│   ├── LoginScreen.tsx     # Email + password
│   ├── OTPScreen.tsx       # OTP via WA
│   ├── DashboardScreen.tsx # Ringkasan tugas
│   ├── TasksScreen.tsx     # Daftar penugasan
│   ├── ScanScreen.tsx      # QR scanner + geo
│   ├── CollectionScreen.tsx # Input nominal + submit
│   ├── HistoryScreen.tsx   # Riwayat koleksi
│   └── ProfileScreen.tsx
├── services/
│   ├── api.ts              # Axios client (hardcode https://api.lazisnu.app)
│   ├── offline/
│   │   ├── queue.ts        # MMKV queue management
│   │   ├── sync.ts         # AutoSync + network listener
│   │   ├── cache.ts        # Cache manajemen
│   │   └── tasks.ts        # Offline tasks
│   ├── secureStorage.ts    # Keychain storage
│   └── security.ts        # App integrity checks
├── stores/                 # Zustand stores (auth, sync, etc)
├── navigation/            # React Navigation (stack + bottom tabs)
└── theme/                 # Design tokens
```

**Dependencies kritis**:
- `react-native-mmkv` — offline queue storage
- `@react-native-community/netinfo` — network change detection
- `react-native-camera-kit` — QR scanning
- `react-native-keychain` — secure token storage
- Firebase Crashlytics — crash reporting

---

## 12. `packages/shared-types`

Satu file `src/index.ts` (~12KB) berisi semua TypeScript type yang digunakan oleh backend, web, dan mobile:
- API request/response types
- Enums (roles, status)
- `BatchCollectionRequestItem`, `BatchSyncResponse`

**Pola yang benar**: Perubahan kontrak API harus selalu diupdate di sini terlebih dahulu sebelum diimplementasikan di app.

---

## 13. Temuan Kritis (Prioritized)

### P0 — Harus Diperbaiki Sekarang

| # | Temuan | Lokasi | Dampak |
|---|--------|--------|--------|
| 1 | **Scheduler worker dinonaktifkan** | `index.ts:6,20-22` | Assignment bulanan tidak auto-generate |
| 2 | **Tidak ada Docker/containerization** | Seluruh repo | Environment drift, rollback impossible |
| 3 | **Test tidak jalan di CI** | `.github/workflows/ci.yml` | Bug lolos ke production |
| 4 | **Backup database tidak dikonfigurasi** | Supabase config | Risiko data loss permanen |
| 5 | **Deploy masih manual via SSH** | — | Human error, downtime tidak terkontrol |

### P1 — Perbaiki Bulan Ini

| # | Temuan | Lokasi | Dampak |
|---|--------|--------|--------|
| 6 | **Inkonsistensi role enum** | `middleware/auth.ts:12` | Potential auth bypass jika ADMIN_PUSAT digunakan |
| 7 | **`/metrics` return 501** | `routes/metrics.ts` | Tidak bisa monitoring |
| 8 | **JWT single secret** | `config/env.ts` | Satu secret bocor = semua token rentan |
| 9 | **Migration manual** | `drizzle-kit push` | Schema drift dev vs production |
| 10 | **No health check monitoring** | `/health/ready` | Tidak tahu jika service mati |
| 11 | **CORS origin: `true`** | `app.ts:35` | Menerima request dari semua origin di production |

### P2 — Sprint Berikutnya

| # | Temuan | Lokasi | Dampak |
|---|--------|--------|--------|
| 12 | **API URL hardcoded di mobile** | `services/api.ts:42` | Tidak bisa ganti tanpa rebuild |
| 13 | **No structured logging** | Semua console.log | Sulit debug saat insiden |
| 14 | **DB connection pool rendah** | `database.ts max:10` | Timeout saat peak |
| 15 | **Sentry sampling 10%** | Backend Sentry config | Error kritis bisa tidak ter-capture |

---

## 14. Kekuatan Arsitektur yang Sudah Baik

✅ **Immutable ledger pattern** — `collections` tidak bisa diubah, resubmit via INSERT baru  
✅ **Offline-first yang solid** — MMKV queue + exponential backoff + deduplication via `offline_id`  
✅ **RBAC yang granular** — 4 role dengan middleware `authorize()` per route  
✅ **Shared types** — satu sumber kebenaran untuk kontrak API  
✅ **Error handling terpusat** — `setErrorHandler()` di `app.ts` menangani semua error type  
✅ **Audit trail lengkap** — `activityLogs` + audit middleware  
✅ **Session management** — JTI tracking di `user_sessions` untuk token revocation  
✅ **WA Queue async** — BullMQ prevent blocking API response saat WA lambat  
✅ **Schema migration tracking** — MMKV schema version `v2` dengan recovery logic  
✅ **Correlation ID** — setiap request punya ID untuk tracing  

---

## 15. Roadmap Rekomendasi

### Minggu Ini (Biaya Rp0)

```
1. Uncomment scheduler worker di index.ts (10 menit)
2. Perbaiki CORS — ganti origin: true → parse CORS_ORIGINS dari env
3. Perbaiki role enum inconsistency di middleware/auth.ts
4. Install prom-client → route /metrics berfungsi
5. Tambah `pnpm test` ke CI workflow
```

### Bulan Ini

```
6. Buat Dockerfile multi-stage untuk backend + web
7. Buat docker-compose.yml untuk dev environment
8. Setup nginx reverse proxy + HTTPS via Let's Encrypt
9. Pisahkan JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET (wajib, bukan optional)
10. Setup Supabase automated backup (cek Pro plan)
11. Upgrade ke pino structured logging
```

### 1–3 Bulan

```
12. Auto-deploy via GitHub Actions → Docker → GCP
13. Setup Grafana + Prometheus monitoring
14. Database connection pool tuning + PgBouncer
15. Infrastructure as Code (Terraform untuk GCP resources)
16. Blue-green deployment untuk zero-downtime
```

---

## 16. Learning Checkpoint

**Konsep kunci yang dipakai:**
- **Append-only ledger** — data keuangan tidak boleh di-mutate, hanya di-append
- **Offline-first with idempotency** — `offline_id` sebagai natural deduplication key
- **CQRS lite** — command (submit) dan query terpisah di service layer
- **Saga pattern sederhana** — submit koleksi → queue WA → worker → log notifikasi
- **BullMQ job deduplication** — `jobId: collection-{id}` mencegah duplicate job

**File yang perlu dipahami:**
- [`schema.ts`](file:///c:/Users/user/Documents/lazisnu/apps/backend/src/database/schema.ts) — seluruh model data
- [`app.ts`](file:///c:/Users/user/Documents/lazisnu/apps/backend/src/app.ts) — bootstrap server
- [`middleware/auth.ts`](file:///c:/Users/user/Documents/lazisnu/apps/backend/src/middleware/auth.ts) — RBAC
- [`offline/queue.ts`](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/services/offline/queue.ts) — offline queue MMKV
- [`offline/sync.ts`](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/services/offline/sync.ts) — sync logic

**Cara mengetes:**
- Backend: `pnpm --filter lazisnu-backend test:all`
- Integration test: `pnpm --filter lazisnu-backend test:integration`
- Mobile: `pnpm --filter lazisnu-collector-app test`
