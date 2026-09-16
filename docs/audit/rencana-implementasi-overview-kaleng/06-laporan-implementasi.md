# 06 — Laporan implementasi (bukti kode)

Laporan ini mencatat apa yang **benar-benar** dikerjakan pada kode, per fase dan per berkas,
beserta bukti (jalur berkas, nomor baris, dan hasil perintah verifikasi).

Aturan penulisan:

- Hanya menyebut yang sudah ada di disk saat laporan ditulis; tidak ada rencana yang ditulis
  seolah-olah selesai.
- Setiap entri memuat: berkas → perubahan → bukti.
- Penyimpangan dari dokumen rencana dicatat di bagian **Keputusan dan penyimpangan**.

Status per fase:

| Fase | Status | Catatan |
|---:|---|---|
| 0 — Fondasi data & status kaleng | Selesai di kode (migrasi belum dijalankan di server) | |
| 1 — Backend overview & agregasi | Selesai di kode | |
| 2 — Web overview role & UI | Selesai di kode | Build `next build` belum dijalankan (hanya typecheck) |
| 3 — Integrasi status & operasional | Selesai di backend & API mobile; UI pemilih alasan APK belum | Terbuka sesuai rencana: bagian APK menunggu rilis |
| 4 — Pengujian, rilis, rollout | Typecheck + unit test lulus; migrasi & rekonsiliasi belum | |

---

## Fase 0 — Fondasi data dan status kaleng

### `apps/backend/src/database/schema.ts`

| Perubahan | Bukti |
|---|---|
| `canConditionEnum = pgEnum('can_condition', ['AKTIF','NON_AKTIF','RUSAK','HILANG','DIKEMBALIKAN'])` | baris 9–23 |
| `cans.condition canConditionEnum default 'AKTIF' notNull`; komentar baru yang mempersempit makna `is_active` menjadi "masih dilacak atau tidak" | baris 103–110 |
| `assignments.skipReasonCode varchar(40)` (kolom `notes` dipertahankan sebagai pelengkap) | baris 129–130 |
| Tabel `can_condition_proposals` (`can_id`, `from_condition`, `to_condition`, `trigger_source`, `reason_code`, `reason_note`, `evidence_count`, `status`, `approved_by`, `approved_at`, `created_at`) + indeks `can_idx`, `status_idx` | baris 165–193 |
| Tabel `can_visits` (`can_id`, `officer_id`, `purpose`, `visited_at`, `notes`, `created_at`) + indeks `can_visited_idx` | baris 195–209 |
| Indeks tambahan `assignments_status_period_idx (status, period_year, period_month)` untuk ringkasan tugas periode | baris 136 |
| Relation Drizzle baru: `canConditionProposalsRelations`, `canVisitsRelations`; relasi `cans.conditionProposals`/`cans.visits` dan `officers.visits` | baris 285, 292–305 |

Catatan: `POSTPONED` **tidak** dihapus dari enum assignment (sesuai larangan fase ini).

### `apps/backend/src/database/migrations/0006_can_condition_status.sql` (baru)

Dibuat dengan `drizzle-kit generate --name=can_condition_status` (bukan tulis tangan), lalu
ditambah satu blok backfill yang disetujui rencana:

```sql
UPDATE "cans" SET "condition" = 'DIKEMBALIKAN' WHERE "is_active" = false;
```

| Bukti | Hasil |
|---|---|
| `meta/_journal.json` | entri `idx: 6, tag: "0006_can_condition_status"` |
| Isi migrasi | `CREATE TYPE can_condition`, `CREATE TABLE can_condition_proposals`, `CREATE TABLE can_visits`, `ALTER TABLE assignments ADD skip_reason_code`, `ALTER TABLE cans ADD condition`, FK, 4 indeks, + backfill baris 29–32 |
| Migrasi historis `0000`–`0005` | tidak diubah |

**Belum dijalankan pada database mana pun** — jalankan pada salinan produksi lebih dulu
(urutan deploy ada di dokumen 05).

### `packages/shared-types/src/index.ts`

| Perubahan | Bukti |
|---|---|
| `enum CanCondition` + konstanta `PLACEMENT_CONDITIONS`, `ASSIGNABLE_CONDITIONS`, `ACTION_REQUIRED_CONDITIONS` | baris 29–60 |
| Tipe kode alasan baku: `SkipReasonCode`, `InactiveReasonCode`, `ReturnedReasonCode`, `CanProposalTriggerSource`, `CanProposalStatus`, `CanVisitPurpose` | baris 62–86 |
| `Can.condition: CanCondition` + komentar makna `is_active` | baris 164–167 |
| `Assignment.skip_reason_code` | baris 186–187 |
| `CanConditionProposal`, `CanVisit` | baris 193–218 |
| Kontrak overview: `OverviewScope`, `OverviewPeriod`, `OverviewSummary`, `OverviewConditionBreakdownItem`, `OverviewActionItem`, `OverviewMonthlyTrendItem`, `OverviewBranchComparisonItem`, `OverviewResponse` | baris 570–663 |

Verifikasi: `pnpm build:shared` → sukses (tsc tanpa error).

### `apps/backend/src/services/conditionRules.ts` (baru)

Modul aturan tanpa database (dapat diuji tanpa Postgres):

- `CanConditionValue` (literal union backend; lihat bagian penyimpangan), `PLACEMENT_CONDITIONS`,
  `ASSIGNABLE_CONDITIONS`, `ACTION_REQUIRED_CONDITIONS`, `EMPTY_STREAK_THRESHOLD = 6`;
- label Indonesia: `CONDITION_LABELS`, `ACTION_LABELS`, `SKIP_REASON_LABELS`;
- predikat: `isPlacementCondition`, `isAssignableCondition`, `requiresAction`,
  `isTrackedForCondition`;
- hitungan kosong: `countTrailingEmptyCollections(nominalsNewestFirst)`;
- usulan/transisi: `shouldProposeInactive`, `shouldRestoreActive`, `ALLOWED_TRANSITIONS`,
  `isTransitionAllowed`, `proposalForSkipReason`, `conditionAfterReplacementVisit`,
  `isValidVisitPurpose`.

Bukti: berkas baris 1–166 (seluruh isi).

### `apps/backend/src/utils/operationalTimeZone.ts` (baru)

Menutup risiko #1 dokumen 00 (kebijakan zona waktu tunggal):

- `OPERATIONAL_TIMEZONE = process.env.OPERATIONAL_TIMEZONE || 'Asia/Jakarta'`;
- `operationalOffsetMinutes(at)` untuk melaporkan offset zona operasional.

Catatan penting: batas periode masih dihitung dengan waktu lokal server
(`new Date(y, m-1, 1)`) seperti perilaku lama, agar angka nominal hasil rekonsiliasi tidak
berubah. Pemindahan ke `AT TIME ZONE` menunggu kolom timestamp menjadi `timestamptz`.

### `apps/backend/src/services/canService.ts`

| Perubahan | Bukti |
|---|---|
| `UpdateCanInput` menerima `condition`, `condition_reason_code`, dan `is_active` ditandai `@deprecated` | baris 37–45 |
| Kaleng baru eksplisit `condition: 'AKTIF'`, `isActive: true` (create + bulk) | baris 219–221, 405–406 |
| Filter daftar memakai `condition`: `NON_ACTIVE/INACTIVE → NON_AKTIF`, tab baru `AKTIF/RUSAK/HILANG/DIKEMBALIKAN`, `ASSIGNED/COMPLETED/ACTIVE` memakai `ASSIGNABLE_CONDITIONS` | baris 81–133 |
| `getCans` menetapkan `orderBy` eksplisit untuk assignment periode dan mengirim `skipReasonCode` | baris 158–165 |
| `getCanDetail` memuat `conditionProposals` dan `visits` (kunjungan dipisah dari penjemputan) | baris 229–247 |
| Transisi kondisi di `updateCan`: alias `is_active` dipetakan (`false → DIKEMBALIKAN`, `true → AKTIF`), divalidasi `isTransitionAllowed`, `isActive` selalu diturunkan dari kondisi | baris 300–335 |
| Soft delete & bulk soft delete → `condition = 'DIKEMBALIKAN'` + `isActive = false` + `updatedAt` | baris 354–363, 424–453 |

Verifikasi: `tsc --noEmit` pada `apps/backend` → `exit=0`.

### `apps/backend/src/routes/admin/schemas.ts`

`updateCanSchema` menerima `condition` (enum 5 nilai) dan `condition_reason_code`
(`z.string().max(40).optional().nullable()`); `is_active` dipertahankan sebagai alias lama yang
ditandai `@deprecated` — baris 20–26.

---

## Fase 1 — Backend overview dan agregasi

### `apps/backend/src/services/overviewService.ts` (baru, ±540 baris)

Fungsi publik (semua memakai `scopeCondition()` + periode di klausa SQL):

| Fungsi | Definisi yang dipakai |
|---|---|
| `getOverview(scope, period, options)` | perakit `OverviewResponse` |
| `getConditionBreakdown(scope)` | jumlah per kondisi (termasuk DIKEMBALIKAN) |
| `getCoverageCounts(scope)` | cakupan penempatan/hilang/perlu tindakan lewat `count(*) filter` |
| `getOfficerCount(scope)` | petugas aktif pada scope |
| `getCollectionSummary(scope, period)` | nominal + jumlah penjemputan berhasil (COMPLETED + latest condition + periode) |
| `getReturnedCounts(scope, period)` | DIKEMBALIKAN total & bulan ini (memakai `cans.updated_at` sebagai waktu ubah kondisi) |
| `getTaskSummary(scope, period)` | `task_closed = COMPLETED + UNCOLLECTED`, `task_total = seluruh status` |
| `getAssignableCanCount(scope)` | kaleng yang boleh menerima tugas |
| `getMonthlyOperationalTrend(scope, period, months = 6)` | dua agregat: penjemputan (isi/kosong/nominal) & siklus tugas |
| `getActionItems(scope, limit = 10)` | NON_AKTIF+RUSAK+HILANG, urut HILANG→RUSAK→NON_AKTIF lalu kasus terlama, dilengkapi usulan pending/approved |
| `getBranchComparison(districtId, period)` | perbandingan ranting memakai `cans.branch_id` |

Bukti keputusan penting:

- Scope: `scopeCondition()` memakai `eq(cans.branchId, branchId)` untuk ranting, dan subquery
  `cans.branchId IN (select id from branches where district_id = ...)` untuk kecamatan — satu
  definisi untuk semua query, tidak ada filter wilayah di JavaScript.
- Nominal: setiap query collection menyertakan `eq(collections.syncStatus, 'COMPLETED')` **dan**
  `getLatestCollectionCondition()` (lihat `getCollectionSummary`, `getMonthlyOperationalTrend`,
  `getBranchComparison`).
- Perbaikan bug: `getBranchComparison` dan `getCoverageCounts` mengelompokkan per
  `cans.branch_id`, bukan `officer.branch_id`.

### `apps/backend/src/routes/admin/dashboard.ts`

Ditulis ulang (46 baris). Sekarang:

- hanya membaca scope dari token (`user.branchId` + `user.districtId`), **tidak** menerima `branch_id`;
- memvalidasi ranting pada token memang milik kecamatan pada token (403 bila tidak);
- memanggil `getOverview()` sekali;
- **tidak lagi** mengirim blok `district` maupun `pending_tasks` yang dihitung tanpa scope.

### `apps/backend/src/routes/admin/district.ts`

Handler `GET /district/dashboard` diganti dengan pemanggil `getOverview()`:

- `branch_id` opsional; divalidasi ke tabel `branches` (`districtId` harus sama dengan token)
  sebelum diteruskan ke service — di luar itu 403 `FORBIDDEN_SCOPE`;
- agregat kecamatan memakai `includeBranchComparison: true`, penyaringan satu ranting tidak;
- blok lama (`alias(schema.collections, 'c2')`, `findMany().then(rows => rows.filter(...))`,
  `by_branch` dari `officer.branchId`) dihapus seluruhnya;
- impor yang tidak lagi terpakai (`alias`, `gte`, `lt`, `desc`, `sql`) dibersihkan.

Verifikasi fase 1: `apps/backend` `tsc --noEmit` → `exit=0`.

---

## Keputusan dan penyimpangan

| # | Hal | Keputusan di kode | Alasan |
|---|---|---|---|
| 1 | Tipe kondisi di backend | literal union `CanConditionValue` di `conditionRules.ts`, bukan enum `CanCondition` dari shared-types | Backend berjalan sebagai CommonJS dan selama ini hanya memakai `import type` dari shared-types; memakai enum sebagai nilai menambah ketergantungan runtime. Nilai stringnya identik dengan kontrak API. Enum di shared-types tetap dipakai web. |
| 2 | Status `POSTPONED` | tetap dihitung pada `task_total` | Larangan fase 0/1 menghapus nilai enum; total harus tetap konsisten dengan data lama sampai dipetakan di fase 4. |
| 3 | `returned_this_month` | memakai `cans.updated_at` | Semua jalur penarikan menulis `updated_at` saat transisi terjadi, termasuk data lama hasil backfill yang tidak punya baris usulan. Bukan `cans.created_at` (dilarang rencana). |
| 4 | Tren bulanan | grouping `to_char(collected_at, 'YYYY-MM')` | Konsisten dengan batas periode lokal server yang sudah dipakai aplikasi; perubahan ke `AT TIME ZONE` menunggu kolom menjadi `timestamptz` (dicatat di `operationalTimeZone.ts`). |
| 5 | `actionWorklistService.ts` terpisah | tidak dibuat; daftar kerja ada di `getActionItems()` `overviewService.ts` | Dokumen 02 mensyaratkan fungsi `getActionItems` di service overview; dua rumah untuk satu daftar akan menciptakan dua definisi. |
| 6 | Indeks | ditambah `assignments_status_period_idx`, `can_condition_proposals_can_idx`, `can_condition_proposals_status_idx`, `can_visits_can_visited_idx` | Jalur baca utama fungsi baru; pengukuran `EXPLAIN ANALYZE` di server tetap perlu sebelum/sesudah deploy. |

## Langkah berikutnya yang belum dikerjakan

- ~~Fase 2~~ → selesai, lihat bagian Fase 2 di bawah.
- ~~Fase 3 (backend & API mobile)~~ → selesai; UI pemilih alasan di APK belum dibuat.
- Fase 4: eksekusi migrasi di server, rekonsiliasi angka, `next build`, rollout.

---

## Fase 2 — Web overview berbasis role dan UI

Berkas komponen baru di `apps/web/src/components/overview/` (semua menerima data siap tampil;
query API dan scope tetap di halaman):

| Berkas | Isi | Bukti |
|---|---|---|
| `format.ts` | fungsi murni: `formatRupiah`, `formatPeriod`, `formatMonthKey`, `formatUpdatedAt`, `formatCaseAge`, `taskProgressLabel`, `taskSupportLabel`, `taskClosedRate`, `trendTotals`, `CONDITION_LABEL`, `CONDITION_BADGE_CLASS` | berkas 1–115 |
| `OverviewHeader.tsx` | judul tugas "Overview kaleng", scope + periode + zona + waktu pembaruan; pemilih ranting HANYA bila prop `branches` diberikan (admin kecamatan) | berkas 1–80 |
| `OperationalSummary.tsx` | 4 kartu (Cakupan penempatan, Tugas periode ini, Perlu tindakan, Infaq bulan ini) — tiap kartu: angka dari server, kalimat pendukung, **definisi metrik dalam teks**, tautan drill-down | berkas 1–110 |
| `ActionRequiredList.tsx` | tab Semua/Hilang/Rusak/Nonaktif (memfilter daftar dari server), baris kasus dengan badge teks + tindakan + umur kasus + alasan; state kosong "Tidak ada kaleng yang perlu ditindak saat ini" + tautan daftar kaleng | berkas 1–140 |
| `CollectionTrendChart.tsx` | batang bertumpuk 6 bulan (Berisi/Kosong/Tidak terjemput) dengan animasi mati, legend berlabel, dan **tabel fallback** yang bisa dibaca keyboard/screen reader | berkas 1–130 |
| `ConditionBreakdown.tsx` | batang per kondisi + persentase, badge teks (bukan warna saja), `role="img"` berlabel | berkas 1–70 |
| `BranchComparisonList.tsx` | perbandingan ranting hanya untuk agregat kecamatan (`hidden` saat satu ranting difilter), tiap baris menyetel filter | berkas 1–85 |

### `apps/web/src/app/dashboard/overview/page.tsx`

Ditulis ulang (241 baris). Perubahan kunci:

1. Tipe data memakai `OverviewResponse` dari `@lazisnu/shared-types` — `DashboardStatsData`
   lokal, rumus `month_count / active_cans`, `inactiveCans`, dan tren berpenyebut bulan ini
   **dihapus**.
2. Admin ranting memanggil `/admin/branch/dashboard` **tanpa** filter ranting; blok
   `data.district` milik respons lama tidak dirender lagi.
3. Admin kecamatan memanggil `/admin/district/dashboard?branch_id=...`; daftar ranting
   diambil dari `GET /admin/branches`; filter satu sumber state (`handleBranchChange`) yang
   menyegarkan seluruh section.
4. State khusus: skeleton struktur-akhir saat muat pertama, data lama + indikator kecil saat
   berganti filter, pesan penyebab + tombol "Coba lagi" saat gagal, pesan periode kosong,
   dan pesan sesi hilang tanpa menampilkan data scope lama.
5. Kontrol sentuh `min-h-11` (44px), jarak antar target ≥8px, `transition-[…]` terbatas
   (`opacity,transform,color`) ≤200ms, `active:scale-[.96/.99]`, fokus terlihat
   (`focus-visible:ring`), tidak ada informasi yang hanya tersedia lewat hover/warna.
6. Fitur backup admin kecamatan dipertahankan sebagai kartu terpisah.

Verifikasi: `tsc --noEmit` pada `apps/web` → hanya 3 error **pra-ada** pada berkas yang tidak
disentuh (`dashboard/reports/page.tsx`, `dashboard/users/[id]/page.tsx`, `MonthlyChart.tsx`
— diverifikasi lewat `git status` bahwa berkas itu tidak berubah). `next build` belum
dijalankan.

---

## Fase 3 — Integrasi status dan operasional

| Berkas | Perubahan | Bukti |
|---|---|---|
| `services/conditionRules.ts` | `SKIP_REASON_CODES`, `ALL_REASON_CODES` sebagai sumber validasi kode alasan | baris 66–89 |
| `services/assignmentGenerator.ts` | `findCansWithoutAssignment` menyaring `condition IN (AKTIF, RUSAK, HILANG)` — NON_AKTIF dan DIKEMBALIKAN tidak pernah menerima tugas | baris 1–35 |
| `routes/admin/assignments.ts` | (1) `bulk-branch` memakai saringan kondisi yang sama; (2) `PUT /assignments/:id` menolak penggantian petugas (`USE_TRANSFER_ENDPOINT`) agar tidak menimpa laporan petugas lama; (3) endpoint baru `POST /assignments/:id/transfer` yang atomik: lama → REASSIGNED (petugas tidak diganti), baru → ACTIVE untuk petugas pengganti, collection tidak dipindah, validasi duplikat (can, officer, periode) | baris 13, 172–175, 257–267, 279–371 |
| `services/conditionProposalService.ts` (baru, ±316 baris) | `createConditionProposal` idempoten (usulan pending untuk transisi sama tidak dibuat dua kali), `createProposalFromSkipReason` (CAN_LOST→HILANG, CAN_DAMAGED→RUSAK), `approveConditionProposal` (kepemilikan via `assertCanAccess`, transaksional: ubah kondisi + `isActive` diturunkan + tutup usulan pending lain), `rejectConditionProposal`, `getValidCollectionNominals` (COMPLETED + versi terbaru saja), `evaluateEmptyStreakForCan` (NON_AKTIF berisi → otomatis AKTIF; 6× kosong → **mengusulkan**, tidak mengubah), `evaluateEmptyStreakForScope` | berkas 1–316 |
| `routes/admin/canProposals.ts` (baru) + registrasi di `routes/admin/index.ts` | `GET /can-proposals` (list, scope peran lewat `getRoleScope` pada `cans`), `POST /can-proposals` (MANUAL, scope dicek), `POST /can-proposals/:id/approve|reject`, `POST /can-proposals/evaluate-empty-streak` (dipicu manual; penjadwalan otomatis belum dinyalakan) | berkas 1–239; index baris 14, 24 |
| `services/canService.ts` | `assertCanAccess` (wrapper publik dari `checkAccess`) agar usulan & kunjungan memakai pemeriksaan kepemilikan yang sama | baris 59–70 |
| `routes/mobile/schemas.ts` | `skipAssignmentSchema` menerima `reason_code` (enum 6 kode, opsional selama transisi); schema baru `canVisitSchema` | baris 45–67 |
| `routes/mobile/tasks.ts` | `/assignments/:id/skip`: menyimpan `skipReasonCode`, APK lama dipetakan ke `OTHER` + ditandai di `notes`, CAN_LOST/CAN_DAMAGED memicu usulan (kegagalan usulan tidak menggagalkan penutupan tugas); endpoint baru `POST /mobile/cans/:canId/visits` (VERIFIKASI/PENGGANTIAN) menulis `can_visits` — bukan collection; PENGGANTIAN menutup kasus RUSAK/HILANG → kembali AKTIF | baris 5, 8–16, 413–415, 416–452, 516–583 |
| `services/mobileSyncService.ts` | setelah transaksi submit commit → `evaluateEmptyStreakForCan` (best effort): NON_AKTIF berisi otomatis AKTIF, ambang kosong mengusulkan NON_AKTIF | baris 12, 114–123 |
| `apps/mobile/src/services/api.ts` | `skipAssignment` mendukung `reason_code` (urutan argumen lama `skipAssignment(id, notes)` tetap didukung), helper baru `recordCanVisit` | baris 643–683 |

**Belum dikerjakan (sesuai rencana, menunggu rilis APK):** layar pemilih alasan berlabel di
`CollectionScreen.tsx` — layar itu saat ini tidak memiliki input skip sama sekali; penambahan
UI-nya bersamaan dengan rilis APK. APK lama tetap berjalan karena backend memetakan kiriman
tanpa kode → `OTHER`.

`POSTPONED` belum dihapus dari enum (mengikuti urutan: hapus setelah data lama dipetakan).

---

## Fase 4 — Pengujian dan verifikasi yang sudah dijalankan

| Verifikasi | Perintah | Hasil |
|---|---|---|
| Kontrak shared types | `pnpm build:shared` | sukses (tsc tanpa error) |
| Typecheck backend | `apps/backend` `node_modules\.bin\tsc --noEmit` | `exit=0` |
| Typecheck web | `apps/web` `node_modules\.bin\tsc --noEmit` | hanya 3 error pra-ada pada berkas yang tidak disentuh |
| Unit test aturan kondisi (baru) | `jest --testPathPatterns=conditionRules.test.ts` | **14/14 lulus** |
| Unit test generator tugas | `jest --testPathPatterns=assignmentGenerator.test.ts` | **9/9 lulus** (tidak ada regresi) |
| Regression kontrak P1 | `jest --testPathPatterns=p1-regression.test.ts --forceExit` | **14/14 lulus** |
| Unit test helper overview web (baru) | `vitest run src/components/__tests__/overview-format.test.ts` | **10/10 lulus** |

Berkas tes baru:

- `apps/backend/src/services/__tests__/conditionRules.test.ts` — cakupan kondisi, hitungan
  kosong berturut-turut (berhenti pada nominal positif, nominal 0 tetap dihitung), usulan
  ambang, transisi yang diizinkan (DIKEMBALIKAN hanya bisa kembali ke AKTIF), label Indonesia.
- `apps/web/src/components/__tests__/overview-format.test.ts` — pemformatan rupiah/periode,
  umur kasus, label tugas (bahasa manusia, bukan nama field), penjumlahan tren, label kondisi.

**Belum dikerjakan:** eksekusi migrasi `0006` pada database (perlu backup + baseline angka
produksi lebih dulu), rekonsiliasi nominal sebelum/sesudah, `pnpm build:web` / `next build`,
dan fixture data uji end-to-end per dokumen 05. Semua itu menuntut akses database/CI yang
tidak tersedia di lingkungan kerja ini (Docker tidak berjalan, tidak ada koneksi ke DB).