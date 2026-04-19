---
trigger: model_decision
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk tahu SEDANG ADA DI MANA dalam pengembangan
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : FASE 6 — Sprint 3: Bug Fixes & Stabilisasi Production
MINGGU     : 13–14
STATUS     : ✅ Web Dashboard Next.js Migration COMPLETE | 🔧 Critical Bug Fixes Pending
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
  [ ] WhatsApp status response fix (waResult.status undefined bug) - PENDING

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
  [ ] Mobile API Base URL: localhost:3000 → 10.0.2.2:3001
  [ ] Field mismatch: mobile mengirim 'amount', backend expect 'nominal'
  [ ] QR Token: HMAC-SHA256 signing BELUM diimplementasikan (fraud risk!)
  [ ] Refresh token: BELUM ada blacklist Redis + endpoint /auth/logout
  [ ] WhatsApp: waResult.status undefined di mobile.ts route

PRIORITAS 2 — Stabilitas:
  [ ] Packages shared-types & shared-utils masih kosong
  [ ] GET /assignments: filter role di JS bukan DB-level (performance)
  [ ] GET /bendahara/collections: pagination manual setelah filter JS
  [ ] Update .agents/rules agar sinkron dengan implementasi aktual
  [ ] Mobile stores: ganti AsyncStorage → MMKV sepenuhnya
```

---

## Konteks untuk Agent

```
Codebase saat ini sudah terstruktur sebagai MONOREPO (apps/backend, apps/web, apps/mobile).
Backend (Fastify + Drizzle) berjalan di port 3001.
Database: PostgreSQL dengan schema aktual menggunakan nama INGGRIS:
  - 'collections' (bukan 'koleksi')
  - 'cans' (bukan 'kaleng')
  - 'branches' (bukan 'ranting')
  - 'districts' (bukan 'kecamatan')

Role enum di DB: ADMIN_KECAMATAN, ADMIN_RANTING, BENDAHARA, PETUGAS (UPPERCASE)

Status Service:
  - PostgreSQL: Aktif
  - Redis: Aktif (Digunakan oleh BullMQ)
  - WhatsApp: Async Worker dengan BullMQ enabled
  - Web Dashboard: Next.js 14 berjalan di port 3000

⚠️ PERHATIAN AGENT: Rules di .agents/rules/ menggunakan nama tabel/field
BAHASA INDONESIA yang BERBEDA dari implementasi aktual. Selalu cek schema.ts
sebagai sumber kebenaran, bukan rules dokumentasi untuk nama field/tabel.
```

---

## Analisis Komprehensif (18 April 2026)

```
Analisis menyeluruh telah dilakukan mencakup:
  - Ketidaksinkronan rules vs implementasi (KRITIS)
  - 5 production-blocker bugs teridentifikasi
  - Kesiapan ekosistem: Backend 65%, Web 55%, Mobile 50%, Packages 0%
  - 20 item perbaikan berprioritas (lihat analisis_project_lazisnu.md)
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
*Last updated: 2026-04-19*
