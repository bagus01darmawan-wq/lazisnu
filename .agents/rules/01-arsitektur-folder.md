---
trigger: model_decision
---

# Rule: Arsitektur Folder Project
# Scope: Semua agent — referensi saat membuat file baru atau navigasi kode

---

## Struktur Monorepo

```
lazisnu-infaq-system/           ← root project
├── apps/
│   ├── mobile/                 ← React Native (Android)
│   ├── web/                    ← Next.js Web Dashboard
│   └── backend/                ← Fastify API Server
├── packages/
│   ├── shared-types/           ← TypeScript types bersama
│   └── shared-utils/           ← Fungsi utility bersama
├── .agents/
│   └── rules/                  ← File rules ini
├── .github/workflows/          ← CI/CD GitHub Actions
├── docker-compose.yml          ← Local dev (PostgreSQL + Redis)
└── GEMINI.md                   ← Entry point ringkas untuk AI
```

---

## apps/mobile/ — React Native

```
apps/mobile/src/
├── screens/
│   ├── auth/           ← SplashScreen, LoginScreen
│   ├── dashboard/      ← DashboardScreen (list task + progress)
│   ├── scanner/        ← QRScannerScreen
│   ├── collection/     ← InputNominalScreen, KonfirmasiScreen, SuksesScreen
│   └── resubmit/       ← ResubmitFormScreen
├── navigation/         ← AuthStack, MainStack, RootNavigator
├── services/           ← API calls: authService, koleksiService, taskService
├── store/              ← MMKV wrappers: authStore, offlineQueueStore
├── hooks/              ← useMyTasks, useNetworkStatus, useOfflineSync
├── components/         ← Shared UI: Button, Card, Badge, LoadingOverlay
└── utils/              ← formatRupiah, dateHelpers, errorMessages
```

**Aturan mobile:**
- MMKV hanya boleh diakses via `store/` layer, tidak langsung dari screen atau komponen
- API call hanya boleh dari `services/` layer
- Logic bisnis offline queue hanya di `store/offlineQueueStore.ts`

---

## apps/web/ — Next.js Dashboard

```
apps/web/
├── app/
│   ├── (auth)/
│   │   └── login/              ← Halaman login
│   ├── (dashboard)/            ← Protected routes
│   │   ├── overview/           ← Statistik utama
│   │   ├── kaleng/             ← Manajemen kaleng + generate & cetak QR
│   │   ├── users/              ← Manajemen pengguna
│   │   ├── assignments/        ← Manajemen assignment
│   │   ├── laporan/            ← Laporan keuangan + export CSV
│   │   ├── resubmit/           ← Re-submit tracker
│   │   └── audit-log/          ← Log aktivitas admin
│   └── api/                    ← Next.js API routes (proxy ke backend)
├── components/
│   ├── ui/                     ← Design system: Button, Input, Card, Table, Badge, Modal
│   └── shared/                 ← Business components: KalengCard, KoleksiTable
├── lib/
│   ├── api.ts                  ← Axios/fetch client
│   ├── auth.ts                 ← Token helpers (get, set, clear)
│   └── utils.ts                ← formatRupiah, formatTanggal
└── middleware.ts                ← Auth check + role-based route protection
```

**Aturan web:**
- Gunakan Server Components untuk halaman read-only (laporan, list)
- Gunakan `'use client'` hanya untuk form dan komponen interaktif
- Sidebar menu berbeda per role — generate dari konfigurasi, bukan hardcode

---

## apps/backend/ — Fastify API

```
apps/backend/src/
├── routes/             ← Definisi routing (grouping endpoint per domain)
│   ├── auth.routes.ts
│   ├── kaleng.routes.ts
│   ├── assignments.routes.ts
│   ├── koleksi.routes.ts
│   ├── laporan.routes.ts
│   └── users.routes.ts
├── handlers/           ← Request handlers (tipis — parse + delegate ke service)
├── services/           ← Business logic (tebal — semua logika di sini)
├── database/
│   ├── schema/         ← Drizzle schema per tabel
│   └── migrations/     ← SQL migration files (001_, 002_, ...)
├── middleware/
│   ├── jwt-auth.ts     ← JWT validation
│   ├── role-guard.ts   ← Role-based access control
│   └── audit-logger.ts ← Otomatis catat aksi ke audit_logs
├── workers/
│   └── wa-sender.ts    ← BullMQ worker kirim WhatsApp
├── jobs/
│   └── assignment-generator.ts  ← node-cron tiap tanggal 1
└── utils/
    ├── hmac-qr.ts      ← Generate & validasi QR token
    ├── validators.ts   ← Zod schemas bersama
    └── response.ts     ← Helper format response sukses/error
```

**Aturan backend:**
- Handler harus tipis: hanya parse input + call service + return response
- Semua business logic ada di service layer
- Jangan tulis query SQL langsung di handler atau route

---

## packages/ — Shared

```
packages/
├── shared-types/
│   ├── user.types.ts       ← User, Role, JwtPayload
│   ├── kaleng.types.ts     ← Kaleng, QrToken
│   ├── koleksi.types.ts    ← Koleksi, OfflineRecord, ResubmitDto
│   └── api.types.ts        ← ApiResponse<T>, ApiError
└── shared-utils/
    ├── format.ts           ← formatRupiah, formatTanggal
    └── validators.ts       ← Zod schemas yang dipakai mobile + backend
```

---

*Lazisnu Infaq Collection System — rules/01-arsitektur-folder.md*
