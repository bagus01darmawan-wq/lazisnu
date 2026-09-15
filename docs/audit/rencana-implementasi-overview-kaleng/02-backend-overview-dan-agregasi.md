# 02 — Backend overview dan agregasi

## Tujuan fase

Menyediakan satu kontrak data overview yang konsisten untuk scope ranting maupun kecamatan. Semua agregasi harus difilter di SQL, memiliki definisi metrik yang sama, dan tidak bergantung pada perhitungan browser.

## Kondisi aktual yang harus diganti

- `apps/backend/src/routes/admin/dashboard.ts` menghitung `pending_tasks` tanpa scope wilayah.
- Route ranting menghitung blok kecamatan tambahan dan mengirimkannya ke admin ranting, meskipun overview role ranting seharusnya fokus pada ranting sendiri.
- `apps/backend/src/routes/admin/district.ts` mengulang latest condition, memakai `findMany().then(rows => rows.filter(...))`, dan `byBranch` memakai `c.officer.branchId`.
- `apps/backend/src/services/dashboardService.ts` sudah memiliki pola SQL yang benar untuk collection valid dan menjadi basis konsolidasi.

## Kontrak API target

Pertahankan endpoint role yang sudah ada agar migrasi UI minimal:

- `GET /admin/branch/dashboard`
- `GET /admin/district/dashboard`

Keduanya mengembalikan bentuk `OverviewResponse` yang sama. Endpoint kecamatan menerima opsional `branch_id`, tetapi server harus memvalidasi ranting itu milik kecamatan pengguna. Endpoint ranting **tidak** menerima scope pengganti.

```ts
interface OverviewResponse {
  scope: { type: 'branch' | 'district'; district_id: string; branch_id?: string; branch_name?: string };
  period: { year: number; month: number; timezone: string; generated_at: string };
  summary: {
    placement_coverage: number;
    active_cans: number;
    inactive_cans: number;
    damaged_cans: number;
    lost_cans: number;
    returned_this_month: number;
    returned_total: number;
    action_required: number;
    total_officers: number;
    collection_nominal: number;
    successful_collections: number;
    task_active: number;
    task_closed: number;
    task_completed: number;
    task_uncollected: number;
    task_total: number;
  };
  condition_breakdown: Array<{ condition: CanCondition; count: number }>;
  action_items: Array<{ can_id: string; owner_name: string; branch_id: string; branch_name: string; condition: CanCondition; proposal_id?: string; reason_code?: string; since: string; action_label: string }>;
  monthly_trend: Array<{ month: string; collected: number; empty: number; uncollected: number; task_closed: number; task_total: number; nominal: number }>;
  branch_comparison?: Array<{ branch_id: string; branch_name: string; placement_coverage: number; lost_cans: number; action_required: number; task_closed: number; task_total: number; collection_nominal: number }>;
}
```

Nilai `task_total` harus mencakup seluruh assignment scope dan periode. Jangan lagi membentuk rasio dari `month_count / active_cans` di web.

## Implementasi query

### 1. Tambah service khusus overview

Buat `apps/backend/src/services/overviewService.ts`, atau perluas `dashboardService.ts` dengan fungsi bernama jelas. Jangan meletakkan SQL agregasi baru di dua route.

Fungsi minimal:

- `getOverview(scope, period)`;
- `getConditionBreakdown(scope)`;
- `getActionItems(scope, limit)`;
- `getTaskSummary(scope, year, month)`;
- `getMonthlyOperationalTrend(scope, months)`;
- `getBranchComparison(districtId, period)`.

`scope` memuat `districtId` dan opsional `branchId`. Semua query `cans`, assignment, proposal, dan collection menerima scope ini di klausa SQL.

### 2. Collection dan nominal

Gunakan `getLatestCollectionCondition()` dari `apps/backend/src/services/collectionSubmission.ts` pada **setiap** query collection.

```ts
and(
  scopeCondition,
  eq(schema.collections.syncStatus, 'COMPLETED'),
  getLatestCollectionCondition(),
  periodCondition,
)
```

Untuk kecamatan, join `collections → cans → branches`; scope dan grouping harus memakai `cans.branchId`. Ini memperbaiki bug di `district.ts` yang saat ini memakai `officer.branchId`.

### 3. Assignment

Join `assignments → cans → branches` untuk menjaga scope berdasarkan pemilik kaleng, bukan penempatan petugas. Hitung per status di SQL lalu bentuk:

```text
task_closed = COMPLETED + UNCOLLECTED
task_total  = seluruh status assignment pada scope/periode
```

`REASSIGNED` dipaparkan terpisah bila dibutuhkan, tetapi tidak masuk `task_closed` tanpa keputusan produk berikutnya.

### 4. Kondisi dan tindakan

- Cakupan penempatan: `condition IN ('AKTIF', 'NON_AKTIF', 'RUSAK')` dan `is_active = true`.
- Hilang: `condition = 'HILANG'`.
- Dikembalikan: `condition = 'DIKEMBALIKAN'`; jumlah bulan ini memakai timestamp persetujuan/ubah kondisi yang eksplisit, bukan `cans.createdAt`.
- Perlu tindakan: kondisi `NON_AKTIF`, `RUSAK`, `HILANG` yang masih `is_active = true`; join proposal pending/approved untuk alasan dan waktu.

## Perubahan route

### `routes/admin/dashboard.ts`

Kurangi route menjadi pembaca scope ranting lalu panggil service tunggal. Hapus `district` nested response dari route ranting pada kontrak baru agar admin ranting tidak memperoleh overview kecamatan yang tidak diperlukan.

### `routes/admin/district.ts`

Ganti blok dashboard saat ini dengan service yang sama. Jangan menyalin `alias(schema.collections, 'c2')` atau `.filter()` JavaScript. Endpoint `/branches` yang sudah ada dapat dipakai web untuk daftar pemilih ranting.

## Keamanan dan performa

- Validasi `branch_id` di route kecamatan dengan `branches.districtId = user.districtId` sebelum meneruskan ke service.
- Jangan menggunakan `db.$count(assignments, status = ACTIVE)` tanpa join scope seperti implementasi route ranting sekarang.
- Batasi `action_items` (misalnya 10) dan sediakan endpoint/list terkait untuk “lihat semua”; jangan memuat seluruh daftar ke overview.
- Tambah indeks setelah pengukuran `EXPLAIN ANALYZE`, terutama kombinasi conditions yang berulang pada `cans`, `assignments`, dan `can_condition_proposals`.

## Kriteria penerimaan

- [ ] Ranting dan kecamatan memakai fungsi agregasi collection yang sama.
- [ ] Koleksi resubmit hanya dihitung sekali, dan hanya jika sync selesai.
- [ ] Perbandingan nominal per ranting benar ketika petugas menjemput lintas ranting.
- [ ] Scope ranting tidak dapat dimanipulasi dari query string.
- [ ] Angka aksi, cakupan, tugas, dan collection dapat ditelusuri ke query/list yang sama.
- [ ] Baseline nominal sebelum/sesudah refactor sama untuk scope dan waktu yang sama.
