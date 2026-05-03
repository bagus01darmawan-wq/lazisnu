---
trigger: model_decision
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk tahu SEDANG ADA DI MANA dalam pengembangan
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : FASE 6 — Sprint 4: Finalisasi & Persiapan UAT
MINGGU     : 13–14
STATUS     : ✅ Modularization COMPLETE | ✅ Mobile Tunneling & Login FIXED | ✅ Mobile UX Polished | 🚀 Ready for Final UAT
```

---

## Progres & Refactor Audit (April 2026)

```
Pilar 1: Immortality & Immutability
  [x] Tabel 'collections' menggunakan tipe data BIGINT (nominal)
  [x] PostgreSQL RULES (disable_delete, disable_update_nominal) aktif
  [x] Endpoint /resubmit (Sequence++) - COMPLETED
  [x] Resubmit via mobile (POST /mobile/collections/:id/resubmit) - COMPLETED

Pilar 2: WhatsApp & Reliability
  [x] BullMQ + Redis integration - COMPLETED
  [x] WhatsApp Async Worker - COMPLETED
  [x] WhatsApp status response fix (waResult.status undefined bug) - COMPLETED

Pilar 3: Audit Trail
  [x] Global Audit Logger middleware - COMPLETED
  [x] Audit log viewer di web dashboard - COMPLETED

Pilar 4: Web Dashboard (Next.js Migration)
  [x] Migrasi dari Vite ke Next.js 14 App Router - COMPLETED
  [x] Authentication flow (login, cookie-based session) - COMPLETED
  [x] RBAC sidebar (menu per role) - COMPLETED
  [x] Halaman: Overview, Cans, Assignments, Audit Log - COMPLETED
  [x] Halaman: Reports, Resubmit, WA Monitor, Users - COMPLETED
  [x] RBAC middleware fix (Admin Kecamatan akses lintas ranting) - COMPLETED
```

---

## 🔴 Bug Kritis Yang Harus Diselesaikan Sprint Ini

```
PRIORITAS 1 — Production Blocker:
  [x] Mobile API Base URL: localhost:3000 → 10.0.2.2:3001
  [x] Field mismatch: mobile mengirim 'amount', backend expect 'nominal'
  [x] QR Token: HMAC-SHA256 signing IMPLEMENTED (utils/qr.ts)
  [x] Refresh token: Redis blacklist + endpoint /auth/logout IMPLEMENTED
  [x] WhatsApp: waResult.status undefined fix IMPLEMENTED

PRIORITAS 2 — Stabilitas:
  [x] Packages shared-types & shared-utils (INITIALIZED)
  [x] GET /assignments: filter role di DB-level (COMPLETED)
  [x] GET /bendahara/collections: pagination DB-level (COMPLETED)
  [x] Update .agents/rules agar sinkron dengan implementasi aktual (COMPLETED)
  [x] Mobile stores: ganti AsyncStorage → MMKV sepenuhnya (COMPLETED)
```

---

## Konteks untuk Agent

```
Codebase saat ini sudah terstruktur sebagai MONOREPO dengan modularisasi route.
Backend (Fastify + Drizzle) menggunakan folder structure per-domain (admin/, mobile/).
Database: PostgreSQL dengan schema aktual menggunakan nama INGGRIS (collections, cans, districts, branches).

Kesiapan Ekosistem Saat Ini:
  - Backend: 95% (Hanya sisa minor fitur opsional)
  | Fase 6 | Optimasi Performa & Refactoring | Selesai | 2026-04-22 | Perbaikan Build Android & Optimasi Dashboard |
  | Fase 7 | Persiapan UAT & Staging | Siap | 2026-04-23 | Menunggu deployment ke staging |

⚠️ PERHATIAN AGENT: Gunakan @lazisnu/shared-types untuk interface bersama.
Jangan mendefinisikan ulang User atau Collection di level app jika sudah ada di package.
```

---

## Analisis Komprehensif (22 April 2026)

```
Update Terakhir:
  - Seluruh "God Files" (admin.ts, mobile.ts) telah dimodularisasi ke folder routes/.
  - Security pilar diperkuat dengan HMAC-SHA256 QR dan Redis Refresh Token Blacklist.
  - Performa query ditingkatkan dengan DB-level filtering dan proper pagination.
  - Sinkronisasi antara mobile (MMKV) dan backend (nominal field) telah diverifikasi.
Update 29 April 2026:
  - Dukuh Management: Implementasi fitur Dukuh (sub-village) dinamis, CRUD, dan relasi database cans-dukuhs.
  - Assignment UX: Optimasi alur penugasan massal dengan deteksi ranting otomatis dan multi-select dukuh cerdas.
  - UI Standardization: Sinkronisasi layout paginasi, navigasi, dan standarisasi ikon aksi (Edit/Trash) di dashboard.
  - Routing Fix: Perbaikan bug 404 saat navigasi kembali ke Overview dari halaman lain.
  - Super Admin: Implementasi fitur reset (delete) penugasan khusus ADMIN_KECAMATAN.
Update 02 Mei 2026:
  - Adaptive Admin Actions: Implementasi tombol aksi dinamis (Re-activate/Edit & Permanent Delete/Soft Delete) berbasis status baris di Kelola Kaleng dan Manajemen User.
  - Premium UI Interaction: Migrasi konfirmasi browser standar ke Custom Interactive Toasts (react-hot-toast) dengan ikon visual dan tombol aksi bergaya modern.
  - Backend Data Restoration: Penambahan dukungan 'isActive' pada endpoint PUT /admin/cans dan /admin/officers serta perbaikan logika partial update (fallback to existing data).
  - Technical Debt: BUG FIXED. Re-aktivasi sekarang otomatis mensinkronisasi tabel users dan officers. Filter SEMUA STATUS diperbaiki untuk merender data secara akurat.
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
*Last updated: 2026-04-25*
