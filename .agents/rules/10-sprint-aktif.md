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
STATUS     : 117 unit test PASS (8 suite), regression checklist 19/28 [x] + 9/28 sisa [ ] (4 perlu device, 4 perlu browser, 1 perlu integration mock), audit logger middleware + test selesai, POST CREATE audit fix selesai.
FOKUS      : Sisa test case yang butuh device Android (TC-MOB-01/03/04) dan browser (TC-WEB-01/02/03/05), integrasi WhatsApp end-to-end (TC-WA-01).
```

Catatan untuk agent:
- Jangan menganggap semua modul sudah final hanya karena ada checklist lama yang selesai.
- Verifikasi kondisi aktual codebase sebelum menyimpulkan fitur sudah lengkap.
- Untuk task kecil, jangan memaksa workflow besar. Untuk task lintas modul atau berisiko, ikuti `00-workflow-guarantee.md`.
- Developer adalah pemula yang sedang belajar dari project ini. Sertakan penjelasan singkat dan latihan kecil setelah perubahan penting.

---

## Progress Terbaru — Sprint 2026-05-21

### ✅ Selesai — Regression Checklist Check & New Unit Tests

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Validasi shared-types contract | ✅ Selesai | `npx ts-node scripts/validate-shared-types.ts` dijalankan, diff report dianalisis (false positives dari regex, not real issues) |
| Update checklist: TC-AUTH-05, TC-AUTH-06, TC-DB-01..05 | ✅ Selesai | Semua `[ ]` → `[x]` di `regression-checklist.md`, total 14 item |
| TC-AUDIT-01: Fix POST CREATE audit | ✅ Selesai | 8 handler POST CREATE (cans, bulk cans, officers, branches, dukuhs, assignments, bulk assignments) kini set `request.auditContext = { newData }` |
| Unit test: `audit-logger.test.ts` | ✅ Selesai | 20 test case PASS |
| Unit test: `scan-qr.test.ts` (TC-QR-01/02) | ✅ Selesai | 13 test case PASS — verifikasi data pemilik bocor/tidak |
| Unit test: `sync-errors.test.ts` (TC-MOB-06) | ✅ Selesai | 16 test case PASS — validation error `can_retry=false`, server error `can_retry=true` |
| Unit test: `whatsapp-queue.test.ts` (TC-WA-02/03) | ✅ Selesai | 13 test case PASS — exponential backoff 3 attempts, DLQ config |
| Assigned TC-MOB-02 checklist | ✅ Selesai | `qr.test.ts` (6) + `scan-qr.test.ts` (8) = QR invalid + bukan penugasan |
| Assigned TC-WEB-04 checklist | ✅ Selesai | `assignmentGenerator.test.ts` sudah ada (10 test PASS) — Round-Robin verified |
| **Total unit test** | **117 PASS** | **8 suite, 100% PASS** |

### ⬜ Pending — Perlu Device / Browser / Integration

| Item | Alasan |
|---|---|
| TC-MOB-01 (mobile buka offline) | Perlu device Android + MMKV |
| TC-MOB-03 (simpan ke queue offline) | Perlu mode pesawat + MMKV |
| TC-MOB-04 (auto-sync saat online) | Perlu network toggle |
| TC-WEB-01 (CRUD Master) | Perlu supertest / browser test |
| TC-WEB-02 (date picker) | Perlu browser |
| TC-WEB-03 (UI konsistensi) | Perlu browser |
| TC-WEB-05 (pagination state) | Perlu browser |
| TC-WA-01 (WA worker kirim) | Perlu mock WA API + integration test |

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

### ✅ Selesai — ESLint & TypeScript — Semua App (2026-05-19)

| App | Lint | TypeCheck | Catatan |
|---|---|---|---|
| **Web** | 0 error, 0 warning ✅ | 0 error ✅ | Fix 7 error + 8 warning; tambah `typecheck` script |
| **Mobile** | 0 error, 0 warning ✅ | 0 error ✅ | Auto-fix 14 warning; buat `tsconfig.json`; fix 12 type errors |
| **Backend** | — | 0 error ✅ | Tambah `typecheck` script |

### ✅ Selesai — Regression Testing Backend (2026-05-19)

| Prioritas | File | Tests | Status |
|---|---|---|---|
| P0 | [p0-regression.test.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p0-regression.test.ts) | 19 | ✅ PASS |
| P1 | [p1-regression.test.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p1-regression.test.ts) | 14 | ✅ PASS |
| Existing | auth, schemas, assignment generator, qr, serializer | 75 | ✅ PASS |
| **Total** | **9 suites** | **108** | **100% PASS** |

**P0 Covered:** TC-AUTH-06 (403 petugas), TC-AUTH-05 (role-scope), TC-DB-01 (INSERT + increment), TC-DB-02 (resubmit INSERT + sequence)  
**P1 Covered:** TC-DB-04 (latestCollectionCondition), TC-DB-05 (can delete guard), TC-MOB-05 (offline_id idempotency), TC-DB-03 (activity log)

### ✅ Selesai — Infrastruktur Development (2026-05-19)

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Pre-commit hook 5 langkah (web lint + typecheck + backend typecheck + mobile lint + typecheck) | ✅ Selesai | `.git/hooks/pre-commit` — seluruh validasi lulus otomatis tiap `git commit` |
| Perbaiki deskripsi skill code-review | ✅ Selesai | Sinkronisasi frontmatter `description` dengan 8 review dimensions aktual |
| Perbaiki GlassDatePicker props (min/max) untuk web typecheck | ✅ Selesai | `GlassDatePickerProps` ditambah `min?: string; max?: string;` + logic disable di DayPicker |
| Regression checklist 28 test case | ✅ Selesai | 6 section, tambah TC-QR-01, TC-QR-02, TC-AUDIT-01 |
| Commit ke GitHub | ✅ Selesai | `git push origin main` — commit `ee8e764` |

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