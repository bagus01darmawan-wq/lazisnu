# Implementation Plan — Tema 4: Business Logic & Services

Tanggal: 2026-06-07
Tujuan: rencana eksekusi terkurasi dari review Tema 4 (Business Logic & Services). File ini untuk **ditinjau dulu** oleh user sebelum dijalankan. Setiap fase bisa dieksekusi terpisah dengan diff kecil sehingga developer pemula bisa mengikuti dan belajar di setiap langkah.

> **Prinsip AGENTS.md yang wajib dipatuhi saat eksekusi plan ini:**
> - `collections` immutable → koreksi selalu INSERT baru + `submitSequence+1`.
> - Naming code/DB/API: Inggris (`collections`, `submitSequence`, `alasanResubmit`, `can_id`, `assignment_id`).
> - Label UI boleh Indonesia ("Kaleng", "Koreksi").
> - Setiap perubahan besar wajib baca `.agents/rules/00-workflow-guarantee.md` + rule area terkait (untuk plan ini: `02-arsitektur-database.md`, `03-api-conventions.md`, `04-business-rules.md`, `05-konvensi-kode.md`, `08-pedoman-backend.md`).

---

## Ringkasan Eksekutif

Status fondasi service layer: **cukup baik pada 3 service** (`collectionSubmission`, `assignmentGenerator`, dan service infrastruktur `r2/otp/fcm/queues`), tetapi **belum konsisten** di 5 area route-heavy (cans, dashboard, officers, district, mobile sync).

Risiko tertinggi bukan hanya kebersihan kode, tapi **bug performa nyata** di dashboard (filter branch dilakukan di JavaScript setelah menarik semua row) dan **error classification rapuh** di mobile sync (string matching ke `error.message`).

**Koreksi terhadap review itu sendiri**: klaim "`reportService.ts` sangat besar" dan "`resubmit` core logic hampir identik antara admin dan mobile" **tidak akurat**. Review ini sudah dikoreksi — lihat tabel "Status Temuan" di bawah.

**Urutan eksekusi (7 fase)**:

| # | Fase | Dampak | Risiko | Bisa Paralel? |
|---|---|---|---|---|
| 1 | AppError & error taxonomy | Tinggi (fondasi untuk fase lain) | Rendah | Ya (terpisah) |
| 2 | Fix dashboard performance bug | **KRITIS** | Rendah | Tidak (blokir F3) |
| 3 | Extract `mobileSyncService` | Tinggi | Sedang | Tidak (butuh F1) |
| 4 | Unit test `collectionSubmission` | Tinggi (keamanan finansial) | Rendah | Ya |
| 5 | `collectionCorrectionService` (orchestration resubmit) | Sedang | Sedang | Tidak (butuh F1) |
| 6 | Pecah `reportService.ts` per concern | Sedang | Sedang | Ya |
| 7 | Refactor `admin/cans.ts` bertahap | Sedang | Tinggi | Tidak (akhir) |

---

## Status Temuan Review (Koreksi)

| # | Temuan Review | Status Verifikasi | Catatan Koreksi |
|---|---|---|---|
| A | Fat route lebih dominan | ✅ Valid | `admin/cans.ts` ~710 baris, `dashboard.ts` query+filter, `sync.ts` batch+classify |
| B | `reportService.ts` perlu dipecah | ⚠️ Valid sebagian | 262 baris bukan masalah, **cohesion** yang jadi masalah (6 concern berbeda dalam 1 file). Jangan refactor karena "besar". |
| C | Duplikasi resubmit | ❌ Tidak akurat untuk core | Core `resubmitCollection()` **sudah identik** di [collectionSubmission.ts:150-208](file:///home/bagus01darmawan/lazisnu/apps/backend/src/services/collectionSubmission.ts#L150-L208). Yang duplikat hanya **orchestration** (tx wrapper, audit, error mapping, notification). |
| D | `mobile/sync.ts` perlu service layer | ✅ Valid | String-matching `errorMessage.includes('tidak valid')` di [sync.ts:56-65](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/mobile/sync.ts#L56-L65) rapuh. |
| E | Error taxonomy belum rapi | ✅ Valid | 5 tempat `throw new Error('CODE')` di `collectionSubmission.ts` (line 61, 85, 110, 160, 188) + `whatsapp.ts:141`. Pola campuran: ada code, ada human message saja. |
| F | Performance bug di dashboard | ✅ **KRITIS** | 4 query `findMany().then(cols => cols.filter(c => c.can?.branchId === branchId))` di [dashboard.ts:55,63,72,83](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/admin/dashboard.ts#L55). Akan meledak saat data membesar. |
| G | Service layer belum konsisten | ✅ Valid | `cans`, `officers`, `district`, `dashboard` masih route-heavy. `bendahara.ts` & `admin/collections.ts` jadi contoh baik. |
| H | Testing service kritis lemah | ✅ Valid (dengan koreksi) | `services/__tests__/` hanya `assignmentGenerator.test.ts`. `collectionSubmission`, `reportService`, mobile sync belum punya test perilaku nyata. Beberapa P0/P1 regression berisi konstanta `const verified = true` (bukan behavior test) — di [p0-regression.test.ts:176](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p0-regression.test.ts#L176) dan [p1-regression.test.ts:57](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p1-regression.test.ts#L57). |

---

## Fase 1 — AppError & Error Taxonomy (Fondasi)

**Tujuan**: mengganti semua `throw new Error('CODE')` dengan domain error yang membawa `code`, `statusCode`, `isRetryable`, dan `message`. Ini fondasi untuk Fase 3, 4, 5.

**Dampak**: Tinggi — fase lain bergantung pada ini.
**Risiko**: Rendah (refactor mekanis, behavior tidak berubah).

### File yang akan dibuat

- `apps/backend/src/utils/AppError.ts` — kelas `AppError extends Error` dengan field: `code: string`, `statusCode: number`, `isRetryable: boolean`, `details?: unknown`. Constructor menerima ke-4 field. Tambah `fromUnknown(err)` untuk normalisasi.
- `apps/backend/src/utils/errorCatalog.ts` — daftar konstanta `ErrorCode` (`QR_ALREADY_SUBMITTED`, `COLLECTION_NOT_FOUND`, `NOT_LATEST`, `FORBIDDEN`, `ASSIGNMENT_INVALID`, `CAN_ID_MISMATCH`, `OFFLINE_ID_DUPLICATE`, dll) plus `toAppError(code, message?, statusCode?)` factory.

### File yang akan diubah

- [services/collectionSubmission.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/services/collectionSubmission.ts): 5 lokasi `throw new Error(...)` di line 61, 85, 110, 160, 188 → `throw new AppError(code, statusCode, message)`. Tambah `paymentMethod` validation: `throw new AppError('PAYMENT_METHOD_INVALID', 400, 'Metode pembayaran tidak valid')` jika `!['CASH', 'TRANSFER'].includes(input.paymentMethod)`.
- [services/whatsapp.ts:141](file:///home/bagus01darmawan/lazisnu/apps/backend/src/services/whatsapp.ts#L141): `throw new Error(...)` → `throw new AppError('WA_SEND_FAILED', 502, message, true)` (retryable).
- [routes/mobile/collections.ts:79, 213, 215, 220](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/mobile/collections.ts): ganti `error.message === 'QR_ALREADY_SUBMITTED'` jadi `error.code === 'QR_ALREADY_SUBMITTED'` (cek `instanceof AppError`).
- [routes/admin/collections.ts:42, 46, 50](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/admin/collections.ts): pola sama.

### Test plan

- Unit test `AppError` (constructor, instanceof Error, JSON serialize, `fromUnknown` mapping unknown error → generic).
- Update `collectionSubmission.test.ts` (jika ada) atau tulis baru: pastikan `validateAssignmentForSubmit` melempar `AppError` dengan code yang benar, bukan `Error` polos.

### Learning checkpoint

- **Konsep**: `instanceof AppError` vs duck-typing `error.code`. Pilih instanceof untuk type safety.
- **Risiko**: route lama yang handle `error.message` string akan break — harus diganti `error.code`.
- **Cara test**: jalankan `pnpm --filter backend test services/__tests__/collectionSubmission.test.ts`.
- **Latihan kecil**: buat 1 test case yang melempar `new AppError('QR_ALREADY_SUBMITTED', 409, 'Kaleng ini sudah pernah di-submit')` lalu tangkap dengan `try/catch` dan verifikasi `err.code === 'QR_ALREADY_SUBMITTED'`.

---

## Fase 2 — Fix Performance Bug Dashboard (KRITIS)

**Tujuan**: hilangkan filter JavaScript setelah `findMany()`. Pindahkan filter branch/district ke SQL join.

**Dampak**: **KRITIS** — saat data collections >10k row, dashboard akan timeout.
**Risiko**: Rendah (perubahan query, tidak mengubah API contract).

### File yang akan dibuat

- `apps/backend/src/services/dashboardService.ts` — fungsi `getBranchDashboard(branchId, districtId?)` yang melakukan query agregasi langsung dengan `innerJoin(cans).innerJoin(branches)` dan filter di `WHERE`.

### File yang akan diubah

- [routes/admin/dashboard.ts:34-115](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/admin/dashboard.ts#L34-L115): ganti 4 pola `.then(cols => cols.filter(...))` dengan query service baru. Perhatikan ada query `db.$count` yang menghitung branch-level count — ini bisa salah jika branch_id di-scope di level application. Konfirmasi dengan mobile/web yang consume.
- [services/reportService.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/services/reportService.ts) (`getDashboardData`): tidak berubah strukturnya, tapi rename ke `dashboardReportService` (lihat Fase 6).

### Pola SQL yang benar (referensi untuk `dashboardService`)

```ts
// Contoh untuk "month collection" yang di-scope by branchId:
const monthCollections = await db.select({...})
  .from(schema.collections)
  .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
  .where(and(
    eq(schema.cans.branchId, branchId),          // ← filter di SQL
    gte(schema.collections.collectedAt, monthStart),
    eq(schema.collections.syncStatus, 'COMPLETED'),
    latestCollectionCondition
  ));
```

### Test plan

- **Performance test**: jalankan `EXPLAIN ANALYZE` pada query sebelum/sesudah untuk row count 50k+ (generate dummy data via script).
- **Behavior test**: buat snapshot response dashboard dengan branch A (hanya 5 kaleng) — pastikan hasilnya sama persis sebelum/sesudah refactor.

### Learning checkpoint

- **Konsep**: `N+1` vs single query with `innerJoin`. Filter di JS setelah `findMany()` memuat semua row ke memori — disebut "client-side filtering" dan anti-pattern untuk data besar.
- **Risiko**: jika ada bug di query baru (mis. salah join), dashboard bisa return data kosong tanpa error → silent failure. Test snapshot wajib.
- **Cara test**: tambahkan `await db.execute(sql\`EXPLAIN ANALYZE ${query}\`)` saat dev.
- **Latihan kecil**: tulis query yang mengambil `total_nominal` per officer untuk satu branch dalam 1 SQL — tanpa `.filter()` JS.

---

## Fase 3 — Extract `mobileSyncService`

**Tujuan**: pindahkan batch sync logic ke service, hilangkan string-matching error classification.

**Dampak**: Tinggi — service ini dipanggil dari route mobile yang paling sering hit saat device online dari mode offline.
**Risiko**: Sedang (logic kompleks, banyak branch). Harus ada test perilaku nyata.

### File yang akan dibuat

- `apps/backend/src/services/mobileSyncService.ts`:
  - `syncCollectionsBatch(input: BatchCollectionInput): Promise<BatchResult>`
  - `classifySyncError(err: unknown): { isRetryable: boolean; code: string }` — menggunakan `instanceof AppError` dan ZodError (bukan string matching).
- `apps/backend/src/services/__tests__/mobileSyncService.test.ts` — test minimal 5 skenario:
  1. Semua item baru, semua berhasil.
  2. 1 item duplicate `offline_id` → status `ALREADY_SYNCED`, bukan error.
  3. 1 item invalid assignment → status `FAILED` + `can_retry: false`, code `ASSIGNMENT_INVALID`.
  4. 1 item server error transient (DB timeout) → status `FAILED` + `can_retry: true`, code `INTERNAL_ERROR`.
  5. Mixed batch (5 item, 2 ALREADY_SYNCED, 2 COMPLETED, 1 FAILED retryable).

### File yang akan diubah

- [routes/mobile/sync.ts:13-83](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/mobile/sync.ts#L13-L83): route hanya parse body via Zod, panggil `syncCollectionsBatch()`, kirim response. Semua loop + classification dihapus.

### Test plan

- Integration test: hit endpoint `POST /v1/mobile/collections/batch` dengan mock DB berisi 1 assignment valid + 1 duplicate + 1 invalid. Verifikasi response shape dan `can_retry` per item.
- Regression: jalankan mobile offline-sync dari device/emulator, pastikan response format identik.

### Learning checkpoint

- **Konsep**: `classifySyncError()` adalah **domain error mapper**. Peta: `AppError.code` → `{ isRetryable, httpStatus }`. Bukan string matching yang rapuh.
- **Risiko**: jika classifier salah, mobile akan retry item yang sebenarnya permanent fail (boros baterai + kuota) atau gagal retry yang seharusnya transient (data hilang).
- **Cara test**: di mobile, sengaja buat 1 record invalid, lalu sync — pastikan UI menampilkan toast yang benar (retry vs perlu koreksi manual).
- **Latihan kecil**: tambahkan test case di mana error message berubah (mis. dari "Assignment tidak valid" jadi "Assignment sudah kadaluarsa") — pastikan classifier masih benar via `error.code`, bukan message.

---

## Fase 4 — Unit Test untuk `collectionSubmission`

**Tujuan**: tambah test perilaku nyata untuk `submitCollection` & `resubmitCollection` (financial-critical path).

**Dampak**: Tinggi — service ini menggerakkan data koleksi immutable. Bug di sini = data finansial rusak.
**Risiko**: Rendah (tambah test, tidak ubah production code).

### File yang akan dibuat

- `apps/backend/src/services/__tests__/collectionSubmission.test.ts` (saat ini belum ada). Test wajib:
  1. `submitCollection` insert dengan `submitSequence = 1` (bukan 0, bukan 2).
  2. `submitCollection` insert kedua untuk `assignment+can` yang sama → lempar `AppError('QR_ALREADY_SUBMITTED', 409)`.
  3. `resubmitCollection` insert baru dengan `submitSequence = old + 1`.
  4. `resubmitCollection` dengan `submitSequence` lama (bukan MAX) → lempar `AppError('NOT_LATEST', 400)`.
  5. `resubmitCollection` oleh officer berbeda → lempar `AppError('COLLECTION_NOT_FOUND', 404)` (security: jangan bocorkan data).
  6. `resubmitCollection` dengan nominal baru: `can.totalCollected` di-update dengan diff, bukan replace. Test dengan nominal lama 100, baru 150, expect totalCollected += 50.
  7. Ownership check: `requiredOfficerId` tidak cocok → error.
  8. Branch ownership check: `requiredBranchId` tidak cocok → `AppError('FORBIDDEN', 403)`.

### File yang akan di-refactor (test-only, bukan production)

- [routes/__tests__/p0-regression.test.ts:176](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p0-regression.test.ts#L176) dan [p1-regression.test.ts:57](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p1-regression.test.ts#L57): tandai `@deprecated` atau hapus assertions `const verified = true` yang tidak benar-benar menjalankan behavior. Ganti dengan test fungsional yang ekuivalen.

### Test plan

- Coverage target: `collectionSubmission.ts` line coverage > 80% setelah fase ini.
- Setup test DB: gunakan test database dengan data fixture (1 officer, 1 branch, 1 assignment, 1 can).
- Jalankan `pnpm --filter backend test` dan verifikasi semua test hijau.

### Learning checkpoint

- **Konsep**: test financial path **wajib** mencakup invariant (sequence increment, immutable, aggregate diff) — bukan hanya "fungsi return sesuatu".
- **Risiko**: tanpa test, refactor Fase 5 (`collectionCorrectionService`) bisa re-regress behavior.
- **Cara test**: gunakan `jest.spyOn(db, 'transaction')` untuk mock, atau pakai test DB in-memory.
- **Latihan kecil**: tambahkan test untuk skenario `paymentMethod` undefined — pastikan default fallback aman atau error eksplisit.

---

## Fase 5 — `collectionCorrectionService` (Orchestration Resubmit)

**Tujuan**: ekstrak duplikasi orchestration resubmit antara mobile & admin ke satu service.

**Dampak**: Sedang — mengurangi ~30 baris duplikasi di 2 route, plus konsistensi error mapping.
**Risiko**: Sedang — ubah flow resubmit yang sudah jadi production. Wajib jalankan test Fase 4 dulu.

### File yang akan dibuat

- `apps/backend/src/services/collectionCorrectionService.ts`:
  - `correctCollection(ctx, input): Promise<{ oldCollection, newCollection, activityLogId }>`
  - Handle di dalam service: `db.transaction`, panggil `resubmitCollection`, insert `activityLogs`, return.
  - Optional notification via callback (mobile butuh WA, admin tidak) — terima `{ sendNotification?: (data) => Promise<void> }` di input.

### File yang akan diubah

- [routes/mobile/collections.ts:155-217](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/mobile/collections.ts#L155-L217): route panggil `correctCollection(ctx, { ..., sendNotification: sendWhatsAppOnResubmit })`. Hapus manual tx + activityLog insert.
- [routes/admin/collections.ts:18-44](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/admin/collections.ts#L18-L44): route panggil `correctCollection(ctx, { ... })` tanpa notification. Hapus duplikasi.

### Test plan

- Re-run semua test dari Fase 4 — harus tetap hijau (orchestration di-extract, core tidak berubah).
- Tambah 1 test untuk `correctCollection`: pass mock notification, pastikan terpanggil dengan payload benar.

### Learning checkpoint

- **Konsep**: **orchestration vs core**. Core `resubmitCollection()` tidak berubah (immutable insert, sequence). Orchestration (tx wrapper, audit, notification) yang duplikat dan bisa di-ekstrak.
- **Risiko**: jika notification dipindah ke service, lupa handle `failed` status akan bocor ke user (mobile menampilkan "berhasil" padahal WA tidak terkirim). Pakai try/catch eksplisit di service.
- **Cara test**: spy pada `sendWhatsAppNotification` di route, panggil service, verifikasi mock dipanggil.
- **Latihan kecil**: tambahkan test `correctCollection` dengan notification yang throw — pastikan `activityLog` tetap tercatat, error dilempar ke caller.

---

## Fase 6 — Pecah `reportService.ts` per Concern

**Tujuan**: pisahkan 6 concern dalam `reportService.ts` ke file sesuai domain. **Jangan lakukan sebelum Fase 1 & 2 stabil.**

**Dampak**: Sedang — readability & testability. Tidak mengubah API.
**Risiko**: Sedang — banyak import. `bendahara.ts` jadi konsumen utama, pastikan test integrasi tetap jalan.

### File yang akan dibuat

- `apps/backend/src/services/collectionQueryService.ts` — pindahkan `buildCollectionsQuery`, `getCollectionsList`, `getCanIdsByBranch`, `getCanIdsByDistrict`.
- `apps/backend/src/services/collectionReportService.ts` — pindahkan `getCollectionDetail`, `getReportSummary`.
- `apps/backend/src/services/dashboardReportService.ts` — pindahkan `getDashboardData` (renamed ke `getBendaharaDashboard` untuk membedakan dengan `getBranchDashboard` Fase 2).
- `apps/backend/src/utils/roleScope.ts` (atau tetap di `utils/`): pindahkan `getCollectionScope` ke sini (bukan service, lebih cocok utility).

### File yang akan diubah

- `apps/backend/src/services/reportService.ts` → **dihapus** setelah semua import di-update. (Atau dijadikan barrel `export * from ...` sementara, baru hapus di fase berikutnya.)
- [routes/bendahara.ts:3](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/bendahara.ts#L3): update import.

### Test plan

- Re-run `pnpm --filter backend test` — pastikan semua import ter-resolve.
- Tambah 1 test per service baru: `buildCollectionsQuery` dengan scope `branchId` saja, `districtId` saja, no scope (admin global).

### Learning checkpoint

- **Konsep**: **Cohesion > Size**. File 262 baris tidak masalah kalau fokus. Masalahnya saat 1 file berisi 6 concern — saat baca, harus scroll mental 6 domain sekaligus.
- **Risiko**: refactor ini tidak menambah fitur, hanya reorganisasi. Jika test Fase 4 hijau, refactor ini seharusnya netral.
- **Cara test**: `git diff --stat` harus menunjukkan hanya perpindahan kode (rename + move), bukan perubahan logic.
- **Latihan kecil**: setelah pecah, coba tambah 1 fitur kecil (mis. filter `payment_method` di `getCollectionsList`) dan rasakan perbedaannya — di file mana letak perubahannya?

---

## Fase 7 — Refactor `admin/cans.ts` Bertahap (Akhir)

**Tujuan**: kurangi 710 baris `admin/cans.ts` dengan ekstrak QR PDF generation, bulk operation, dan CRUD logic ke service.

**Dampak**: Sedang — readability untuk semua developer yang pegang `cans` domain.
**Risiko**: Tinggi — ini domain paling kompleks (CRUD + PDF + R2 + bulk + audit). **Jalankan terakhir.**

### Sub-fase 7.1 — Ekstrak `canService`

- `apps/backend/src/services/canService.ts`:
  - `createCan(input, user)`, `updateCan(id, input, user)`, `softDeleteCan(id)`, `permanentDeleteCan(id)` — semua validasi ownership + audit context.
  - Route hanya panggil service + format response.

### Sub-fase 7.2 — Ekstrak `qrPdfService`

- `apps/backend/src/services/qrPdfService.ts`:
  - `generateCanQRPDF(cans)`, `uploadToR2(pdf, filename)`, `getSignedDownloadUrl(key)`.
  - Pindahkan `pdf-lib` import & `QRCode` import dari `cans.ts`.

### Sub-fase 7.3 — Ekstrak `canBulkService`

- `apps/backend/src/services/canBulkService.ts`:
  - `bulkCreate()`, `bulkUpdate()`, `bulkDelete()`.

### Test plan

- Snapshot test untuk response `POST /admin/cans`, `PUT /admin/cans/:id`, `DELETE /admin/cans/:id?permanent=true` (cek rule permanen delete ditolak jika ada collection history).
- Test ownership: ADMIN_RANTING tidak bisa edit kaleng branch lain (cek dari snapshot 403).

### Learning checkpoint

- **Konsep**: **Ekstrak per concern, bukan per baris**. Jangan coba satu PR besar untuk 710 baris → 200 baris. Lakukan per concern (CRUD, PDF, bulk) dengan PR kecil.
- **Risiko**: route `cans.ts` sudah jadi andalan banyak developer. Refactor besar = regression tinggi. **Pastikan test ada dulu.**
- **Cara test**: jalankan regression checklist `docs/regression-checklist.md` sebelum & sesudah refactor.
- **Latihan kecil**: refactor **hanya** `POST /admin/cans/:id` ke `canService.createCan()` di PR terpisah. Setelah merge & test hijau, baru refactor endpoint lain.

---

## Strategi Eksekusi

### Pre-flight checklist (sebelum mulai fase apa pun)

- [ ] Baca `.agents/rules/00-workflow-guarantee.md`
- [ ] Baca `.agents/rules/08-pedoman-backend.md`
- [ ] Baca `.agents/rules/05-konvensi-kode.md`
- [ ] Baca `.agents/rules/04-business-rules.md` (penting untuk invariant `collections` immutable)
- [ ] Pastikan branch baru: `git checkout -b refactor/tema4-business-logic`
- [ ] Backup branch `main` reference: `git tag before-tema4`

### Urutan eksekusi yang disarankan

```
Fase 1 (AppError) ─┬─→ Fase 4 (test collectionSubmission) ─→ Fase 5 (correctionService)
                   │
                   └─→ Fase 2 (fix dashboard) ─→ Fase 3 (mobileSyncService)
                                                │
                                                └─→ Fase 6 (pecah reportService)
                                                     │
                                                     └─→ Fase 7 (refactor cans.ts)
```

Fase 1 harus duluan. Fase 2 & 4 bisa paralel setelah Fase 1. Fase 5 butuh Fase 4 hijau. Fase 6 & 7 di akhir.

### Pull request kecil per fase

Setiap fase = 1 PR (atau 1 patch besar). Jangan gabung Fase 1 + Fase 3 dalam 1 PR — susah di-review dan rollback.

### Rollback plan

- Setiap fase berdiri sendiri dan bisa di-revert dengan `git revert <commit>`.
- **Jangan merge** fase yang belum punya test passing.

---

## Validasi Akhir (Setelah Semua Fase)

- [x] `pnpm --filter backend test` hijau. (205 tests, 14 suites, all PASS)
- [ ] `pnpm --filter backend lint` (atau eslint) hijau.
- [x] `pnpm --filter backend build` sukses. (tsc --noEmit 0 errors)
- [ ] Mobile offline-sync dari device nyata: 1 batch berisi 5 item, 2 duplicate, 1 invalid, 2 valid → response sesuai ekspektasi.
- [ ] Dashboard branch besar (10k+ kaleng) load time < 2 detik.
- [ ] `apps/backend/src/services/__tests__/` minimal berisi: `assignmentGenerator.test.ts` (eksisting), `collectionSubmission.test.ts` (baru), `mobileSyncService.test.ts` (baru), `dashboardService.test.ts` (baru).
- [ ] Tidak ada lagi `throw new Error('CODE_STRING')` di service layer (cari dengan grep).
- [ ] Tidak ada lagi `errorMessage.includes('...')` di route (cari dengan grep).
- [ ] Tidak ada lagi `.then(cols => cols.filter(c => c.can?.branchId === ...))` di route (cari dengan grep).

---

## Catatan Belajar (Wajib Dibaca Developer Pemula)

> Dari `AGENTS.md` Mode Belajar Developer Pemula: setiap bantuan harus tinggalkan minimal satu pemahaman baru.

**Mengapa urutan ini penting?**

1. **AppError dulu** karena semua fase lain butuh error code yang konsisten. Tanpa fondasi ini, refactor lain akan banyak string matching yang harus di-update.
2. **Fix dashboard performance dulu** karena itu **bug nyata** yang akan meledak saat data produksi. Bukan sekadar "rapikan kode".
3. **Test sebelum refactor orchestration**: tanpa test Fase 4, Fase 5 bisa re-regress behavior financial tanpa terdeteksi.
4. **Refactor cans.ts di akhir** karena domain ini paling kompleks (CRUD + PDF + R2 + bulk + audit). Butuh fondasi dari fase lain dulu.

**Konsep yang akan Anda pelajari selama eksekusi plan ini**:
- Domain error taxonomy (`AppError` pattern).
- SQL-first filtering (hindari client-side filter untuk data besar).
- Cohesion-driven file split (bukan size-driven).
- Orchestration vs core service separation.
- Test invariant untuk data finansial (sequence, immutable, aggregate diff).

**Risiko yang harus diwaspadai**:
- Refactor tanpa test = regresi silent di production.
- Bulk refactor = susah rollback. Selalu PR kecil.
- Mobile sync error classification salah = user data hilang atau retry sia-sia.

**Cara validasi belajar Anda**:
- Tahu bedanya `throw new Error('CODE')` vs `throw new AppError(code, status, message)`.
- Bisa jelaskan kenapa `.then(cols => cols.filter(...))` bermasalah untuk data besar.
- Bisa baca test di `collectionSubmission.test.ts` dan jelaskan kenapa sequence increment diuji.
- Bisa refactor 1 route ke service secara mandiri (Fase 7 latihan kecil).

---

## Status

- [x] Fase 1: AppError & Error Taxonomy
- [x] Fase 2: Fix Performance Bug Dashboard
- [x] Fase 3: Extract `mobileSyncService`
- [x] Fase 4: Unit Test `collectionSubmission`
- [x] Fase 5: `collectionCorrectionService`
- [x] Fase 6: Pecah `reportService.ts`
- [x] Fase 7: Refactor `admin/cans.ts` bertahap

**Semua 7 fase selesai — 2026-06-07**
