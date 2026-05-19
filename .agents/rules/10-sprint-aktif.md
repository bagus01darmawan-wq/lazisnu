---
trigger: manual
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk memahami posisi pengembangan saat ini
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : Finalization & Learning-Assisted Completion
STATUS     : ESLint web (0 error, 0 warning) ✅, ESLint mobile (0 error, 0 warning) ✅, tsconfig.json mobile dibuat ✅, typecheck jalan ✅, pre-commit hook terpasang ✅. Fokus beralih ke regression test dan commit ke GitHub.
FOKUS      : Regression test backend, validasi shared-types contract, commit semua perubahan ke GitHub.
```

Catatan untuk agent:
- Jangan menganggap semua modul sudah final hanya karena ada checklist lama yang selesai.
- Verifikasi kondisi aktual codebase sebelum menyimpulkan fitur sudah lengkap.
- Untuk task kecil, jangan memaksa workflow besar. Untuk task lintas modul atau berisiko, ikuti `00-workflow-guarantee.md`.
- Developer adalah pemula yang sedang belajar dari project ini. Sertakan penjelasan singkat dan latihan kecil setelah perubahan penting.

---

## Progress Terakhir (Updated: 2026-05-19)

### ✅ Selesai — Tech Debt Refactor Backend

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Password hash petugas baru | ✅ Selesai | `hashPassword` ada di `auth.ts` dan `officers.ts` |
| Ekstrak `latestCollectionCondition` | ✅ Selesai | Fungsi ditemukan di `reportService.ts` dan dipakai di beberapa route |
| Hapus Nodemailer | ✅ Selesai | Tidak ada referensi di `src/` (hanya di `node_modules/.ignored`) |
| Standarisasi response API | ✅ Selesai | `sendSuccess`/`sendError`/`sendInternalError` di `utils/response.ts` |
| Error category di response (backend) | ✅ Selesai | Error pakai `code` string standar (`INTERNAL_ERROR`, dll.) di `sendError` |
| Tampilkan error type di mobile | ✅ Selesai | `permanentFailedCount` dari `useSyncStore()` ditampilkan sebagai banner merah di `DashboardScreen.tsx` (baris 54–68), lengkap dengan navigasi ke History |
| Ganti `tx: any` (type safety transaction) | ✅ Selesai | Tidak ada `tx: any` di `src/` backend |
| Sinkronisasi scheduler route & worker | ✅ Selesai | `scheduler.ts` (route) dan `scheduler.worker.ts` (worker) sudah terpisah |
| Pisah `bendahara.ts` — route & service | ✅ Selesai | `bendahara.ts` = 118 baris (routing saja), logic ada di `reportService.ts` |

### ✅ Selesai — ESLint Cleanup Web — Total (2026-05-19)

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Perbaiki `set-state-in-effect` (3 file) | ✅ Selesai | `DropdownFilter.tsx`, `GlassDatePicker.tsx`, `GlassSelect.tsx` |
| Bersihkan `unused-vars` (16 file) | ✅ Selesai | ~36 warning dihapus |
| Tambah `eslint-disable` untuk `incompatible-library` (2 file) | ✅ Selesai | `Table.tsx`, `users/page.tsx` |
| Perbaiki 7 error tersisa (master, overview, ExportButton, reports, audit-log) | ✅ Selesai | `set-state-in-effect` inline async, purity lazy init, error-boundaries restruktur, Database import |
| Tambah `eslint-disable-line` untuk 5x exhaustive-deps + incompatible-library + no-img-element | ✅ Selesai | 8 warning dicegah dengan inline disable |

**Hasil:** `pnpm --filter web lint` → **0 error, 0 warning** ✅

### ✅ Selesai — Mobile ESLint + TypeScript Setup (2026-05-19)

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Fix 14 warning ESLint mobile (auto-fix) | ✅ Selesai | `pnpm --filter lazisnu-collector-app lint --fix` → 0 warning |
| Buat `tsconfig.json` mobile | ✅ Selesai | File dibuat di `apps/mobile/tsconfig.json`, extends `@react-native/typescript-config` |
| Tambah script `typecheck` | ✅ Selesai | `pnpm --filter lazisnu-collector-app typecheck` |
| Fix 12 type errors mobile (OTPScreen, ProfileScreen, api.ts, stores) | ✅ Selesai | Style string, HeadersInit, field name sinkronisasi shared-types, mock data lengkap, enum |
| Bonus fix: `notes` field di mock Collection | ✅ Selesai | Hapus field yang tidak ada di shared-types |

**Hasil:** `pnpm --filter lazisnu-collector-app typecheck` → **0 error, 0 warning** ✅

### ✅ Selesai — Infrastruktur Development (2026-05-19)

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Pre-commit hook untuk validasi otomatis | ✅ Selesai | `.git/hooks/pre-commit` — jalankan web lint + mobile lint + mobile typecheck tiap `git commit` |
| Perbaiki deskripsi skill code-review | ✅ Selesai | Sinkronisasi frontmatter `description` dengan 8 review dimensions aktual |

---

## Prioritas Sprint Saat Ini

### P0 — Stabilitas dan Bugfix

- Pastikan project bisa dijalankan, dibuild, dan dilint untuk area yang sedang dikerjakan.
- Perbaiki error yang memblokir login, dashboard, submit collection, sync mobile, laporan, atau build.
- Jangan melakukan refactor besar tanpa alasan kuat dan tanpa rencana test.

### P1 — Contract Consistency

- Pastikan `packages/shared-types` menjadi acuan kontrak lintas app.
- Pastikan perubahan backend response/request dicek dampaknya ke `apps/web` dan `apps/mobile`.
- Hindari duplikasi type yang bisa membuat web/mobile berbeda dari backend.

### P2 — Testing dan Deploy Readiness

- Buat test plan untuk flow kritis.
- Tambahkan regression checklist sebelum merge/deploy.
- Siapkan rollback plan untuk perubahan database, auth, API contract, dan deploy.

### P3 — Learning-Oriented Maintenance

- Setiap bantuan agent harus membantu user memahami minimal satu konsep baru.
- Prioritaskan task kecil yang bisa dikerjakan user sendiri dengan review AI.
- Gunakan skill `.agents/skills/` sesuai konteks: debug, code review, testing, architecture, tech debt, deploy checklist.

---

## Konteks Teknis Aktual yang Harus Diingat

```
Repo      : lazisnu
Monorepo  : PNPM workspace apps/* dan packages/*
Backend   : Fastify + TypeScript + Drizzle ORM + PostgreSQL + Redis/BullMQ + Zod
Web       : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4
Mobile    : React Native Android-first + MMKV + offline-first
Shared    : packages/shared-types untuk kontrak data lintas app
```

---

## Aturan Domain Paling Penting

### Collections Immutable

- `collections` adalah data finansial/audit.
- Jangan UPDATE/DELETE data transaksi untuk mengubah nominal, metode bayar, petugas, atau identitas transaksi.
- Koreksi dilakukan dengan re-submit: INSERT record baru + sequence bertambah + flag latest/versioning yang diizinkan.

### WhatsApp Async

- Notifikasi WhatsApp setelah submit collection harus diproses async melalui queue.
- Kegagalan WhatsApp tidak boleh membatalkan collection yang sudah valid tersimpan.

### Mobile Offline-first

- Mobile fokus Android.
- Gunakan MMKV/offline queue untuk data yang perlu bertahan saat sinyal buruk.
- Sync harus aman terhadap retry dan duplikasi.

---

## Checklist untuk Agent Sebelum Mengubah Kode

```txt
1. Apakah task ini kecil atau lintas modul?
2. File/folder mana yang terdampak?
3. Apakah shared-types perlu dicek?
4. Apakah API contract berubah?
5. Apakah mobile/web/backend ikut terdampak?
6. Apakah ada risiko database atau data finansial?
7. Command test/build/lint apa yang relevan?
8. Learning checkpoint apa yang akan diberikan ke user?
```

---

## Riwayat Penting yang Masih Relevan

```
- Project sudah memakai monorepo PNPM.
- Database menggunakan nama domain Inggris seperti collections, cans, assignments, districts, branches.
- Rule visual dashboard memakai tema Earthy & Premium.
- Agent rules dan skills mulai difokuskan untuk mentor-mode agar developer pemula ikut berkembang.
```

Detail historis lama boleh dijadikan referensi, tetapi jangan dianggap sebagai kondisi final tanpa verifikasi codebase aktual.

---

## Konteks Teknis UI

```css
/* Acuan Warna Utama Dashboard: */
/* Layout Header/Bg : #2C473E (Deep Green) */
/* Card & Sidebar   : #F4F1EA (Warm Beige) */
/* Title & Icon     : #EAD19B (Muted Sand) */
/* Brand Positive   : #1F8243 (Emerald) */
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
*Last updated: 2026-05-19*