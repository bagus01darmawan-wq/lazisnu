# Implementasi Tugas Kunjungan NON_AKTIF (Opsi A)

> **Tanggal:** 8 November 2026
> **Status:** diimplementasikan di branch `staging`
> **Keputusan produk:** tugas kunjungan bulanan per petugas; tombol kunjungan
> hanya **Kosong** dan **Dikembalikan** (plus **Kaleng Isi**), sementara
> **Tidak Dikunjungi** menjadi `UNCOLLECTED` otomatis di akhir periode.

---

## 1. Ringkasan

Kaleng `NON_AKTIF` tidak lagi menjadi pool bebas seluruh ranting. Ia menjadi
**tugas bulanan per petugas**, sejajar dengan tugas penjemputan:

- `assignments.kind = PICKUP` → kaleng `AKTIF`/`RUSAK`/`HILANG`.
- `assignments.kind = VISIT` → kaleng `NON_AKTIF`.
- Satu kaleng hanya boleh punya **satu tugas VISIT per periode**.
- APK memisahkan tab berdasarkan `kind`, bukan hanya `condition`.
- Kunjungan **Kosong** menyelesaikan tugas bulan itu, kaleng tetap `NON_AKTIF`,
  dan bulan berikutnya dibuat tugas VISIT baru.
- Kunjungan **Dikembalikan** mengeluarkan kaleng dari sistem.
- **Kaleng Isi** membuat collection, mengubah condition menjadi
  `AKTIF`/`RUSAK`/`HILANG`, lalu menyelesaikan tugas.
- Tugas VISIT yang tidak dikunjungi sampai periode selesai menjadi
  `UNCOLLECTED` (bukan `COMPLETED`).
- Auto `NON_AKTIF` dari 6x kosong **hanya berlaku untuk `AKTIF`**.
  `RUSAK`/`HILANG` tetap sebagai label kondisi fisik.

---

## 2. Skema database

Migration: `apps/backend/src/database/migrations/0018_assignment_kind.sql`.

```sql
CREATE TYPE assignment_kind AS ENUM ('PICKUP', 'VISIT');

ALTER TABLE assignments
  ADD COLUMN kind assignment_kind DEFAULT 'PICKUP' NOT NULL;

ALTER TABLE period_draft_items
  ADD COLUMN kind assignment_kind DEFAULT 'PICKUP' NOT NULL;

CREATE UNIQUE INDEX assignments_visit_period_unq
  ON assignments (can_id, period_year, period_month)
  WHERE kind = 'VISIT';

CREATE INDEX assignments_kind_period_idx
  ON assignments (kind, period_year, period_month, status);
```

Drizzle schema:

- `assignmentKindEnum` — `apps/backend/src/database/schema.ts`.
- `assignments.kind` dan `periodDraftItems.kind`.
- Partial unique index `assignments_visit_period_unq`.

---

## 3. Alur backend

### 3.1 Kaleng menjadi NON_AKTIF

1. Admin menekan **Jadikan Non-Aktif** di Kelola Kaleng.
2. `PUT /admin/cans/:id` dengan `{ condition: 'NON_AKTIF' }`.
3. `canService.updateCan` menjalankan transaksi:
   - update `cans.condition`;
   - `syncActiveAssignmentKindForCan` mengubah tugas `PICKUP` yang masih
     `ACTIVE` menjadi `VISIT` (atau menandai `REASSIGNED` bila sudah ada
     tugas VISIT untuk periode yang sama).
4. Tugas `COMPLETED`/`UNCOLLECTED` tidak diubah — periode itu sudah selesai.

Jalur lain yang tetap didukung:

- proposal kondisi (`conditionProposalService`) — memanggil helper yang sama;
- auto 6x kosong (`evaluateEmptyStreakForCan`) — hanya untuk `AKTIF`.

### 3.2 Pembuatan tugas bulanan

- Generator periode (`assignmentGenerator.findCansWithoutAssignment`)
  mengembalikan dua kandidat:
  - `cansToAssign` → PICKUP (`AKTIF/RUSAK/HILANG`);
  - `visitCansToAssign` → VISIT (`NON_AKTIF`).
- Draft periode menyimpan `kind` pada `period_draft_items`.
- Approve draft membuat assignment dengan `kind` yang sama.
- Scheduler `POST /scheduler/generate-tasks` juga membuat kedua jenis tugas.
- `bulk-branch` dan `bulk-cans` menerima parameter `kind` (default `PICKUP`).
  Untuk VISIT, kandidat difilter `condition = NON_AKTIF`.
- `POST /admin/assignments` (manual satu kaleng) memvalidasi condition sesuai
  `kind`; kalau `kind` tidak dikirim, diturunkan dari condition.

### 3.3 Antrean kunjungan web

Endpoint baru:

```http
GET /v1/admin/assignments/visit-queue?branch_id=&year=&month=&dukuh_id=
```

Mengembalikan kaleng NON_AKTIF yang **belum punya penugasan jenis apa pun**
pada periode tersebut, dikelompokkan per Dukuh, agar antrean konsisten dengan
validasi `bulk-cans`:

- `total_visit_cans`
- `assigned_visit_cans`
- `assigned_period_cans` (penugasan jenis apa pun; kaleng yang sudah punya
  tugas pada periode tidak ditampilkan di antrean)
- `unassigned_visit_cans`
- `groups[].can_ids`
- `officers`

Web menampilkan panel **Kunjungan Non-Aktif** di halaman Penugasan.

### 3.4 Aksi kunjungan mobile

`POST /v1/mobile/cans/:canId/visits` menerima `assignment_id` opsional.

- `KOSONG`:
  - insert `can_visits` outcome `KOSONG`;
  - condition tetap `NON_AKTIF`, `is_active = true`;
  - assignment VISIT menjadi `COMPLETED` + `completed_at`.
- `DIKEMBALIKAN`:
  - condition `DIKEMBALIKAN`, `is_active = false`;
  - semua assignment ACTIVE untuk kaleng itu menjadi `COMPLETED`.
- `TIDAK_DIKUNJUNGI`:
  - assignment menjadi `UNCOLLECTED` (kompatibilitas APK lama; APK baru tidak
    menampilkan tombol ini).
- Validasi `assignment_id`:
  - harus milik petugas yang login;
  - harus `kind = VISIT`;
  - harus `status = ACTIVE`;
  - selain itu → `403 ASSIGNMENT_INVALID`.

### 3.5 Kaleng Isi

`CollectionScreen` mengirim collection dengan `visit_outcome: 'ISI'` melalui
queue offline/batch yang sudah ada. `submitCollection`:

- membuat collection;
- mengubah condition ke `AKTIF`/`RUSAK`/`HILANG`;
- menyelesaikan assignment VISIT.

Tidak ada perubahan pada alur collection biasa.

### 3.6 Akhir periode

`completeOfficerPeriod` menutup semua assignment `ACTIVE` — termasuk VISIT —
menjadi `UNCOLLECTED` dengan `completed_at`. Jadi tugas kunjungan yang tidak
dikerjakan otomatis menjadi TERLEWAT.

---

## 4. Perubahan mobile APK

### 4.1 Tab tugas

- `TasksScreen` tidak lagi memanggil `/mobile/cans/visit-required`.
- Sumber kedua tab adalah `GET /mobile/tasks` yang sekarang mengirim `kind`.
- Tab **Aktif** = `kind !== 'VISIT'` dan condition bukan `NON_AKTIF`.
- Tab **Non-Aktif** = `kind === 'VISIT'` (fallback condition `NON_AKTIF`).

### 4.2 Kartu dan detail

- Kartu VISIT memakai `TaskItem` dengan badge status dan periode assignment.
- `TaskDetailScreen` mendeteksi `kind === 'VISIT'` (atau condition
  `NON_AKTIF`) dan menampilkan:
  - **Kaleng Isi** → CollectionScreen;
  - **Kaleng Kosong**;
  - **Kaleng Dikembalikan**.
- Tombol **Tidak Dikunjungi** dihapus dari alur VISIT.
- `KalengInfoCard` tetap menampilkan alamat Dukuh + RT/RW.

### 4.3 Offline

- Task VISIT ikut tersimpan di `taskCache` karena berasal dari `/tasks`.
- `actionQueue` menyimpan `assignment_id` untuk aksi VISIT.
- Aksi Kosong/Dikembalikan dari TaskDetail dan Scan dapat diantrekan offline.
- Sync mengirim `assignment_id` ke endpoint visits.
- Setelah sync, `fetchTasks('ACTIVE')` memperbarui tab Non-Aktif.

### 4.4 Scan

`GET /mobile/scan/:qrCode` sekarang mengirim `kind` dan `condition`.
`ScanResultCard` menampilkan aksi kunjungan untuk VISIT/NON_AKTIF.

---

## 5. Perubahan web

- **Kelola Kaleng**:
  - tombol **Jadikan Non-Aktif** untuk kaleng yang masih dilacak;
  - tombol **Aktifkan Kaleng** untuk condition `NON_AKTIF`;
  - tombol lama **Aktifkan Kembali** tetap untuk `DIKEMBALIKAN`.
- **Penugasan**:
  - panel **Kunjungan Non-Aktif**;
  - ringkasan total/sudah/belum ditugaskan;
  - pilih grup Dukuh + petugas → `POST /admin/assignments/bulk-cans` dengan
    `kind: 'VISIT'`.
- **Region card / work queue**:
  - metrik assignment PICKUP tidak lagi menghitung VISIT;
  - kaleng NON_AKTIF tetap dihitung di `total` dan `nonActive`.

---

## 6. Dampak ke laporan

Metrik berikut sekarang memfilter `assignments.kind = 'PICKUP'`:

- `assignmentWorkQueueService` (coverage, status, beban petugas);
- `regionCardService` (`assignmentTotal`, completed, uncollected);
- `overviewService` (`getTaskSummary`, tren assignment, perbandingan ranting);
- `collectionReportService` (`total_assignments`, uncollected);
- `productivityService` (tugas per petugas).

Collection/uang **tidak** difilter — collection dari kunjungan ISI adalah uang
nyata dan tetap dihitung.

---

## 7. Test yang ditambahkan/diperbarui

- `assignmentGenerator.test.ts` — kind PICKUP/VISIT.
- `conditionRules.test.ts` — auto NON_AKTIF hanya untuk AKTIF.
- `periodDrafts.integration.test.ts` — draft memuat item VISIT.
- `regionCardService.integration.test.ts` — metrik assignment tetap PICKUP.
- `assignmentWorkQueueService.integration.test.ts` — PICKUP saja.
- `assignments-bulk-cans.integration.test.ts` — bulk VISIT.
- `nonaktif-visit.integration.test.ts` — KOSONG, DIKEMBALIKAN, kepemilikan.
- `assignmentKindService.integration.test.ts` — konversi jenis tugas.
- Mobile: `sync.test.ts` memastikan `assignment_id` ikut dikirim.

---

## 8. Catatan operasional

- Migration `0018` dijalankan otomatis oleh deploy staging sebelum container
  baru naik.
- APK lama tetap bisa memakai `/mobile/cans/visit-required`; APK baru memakai
  `/mobile/tasks` dan `kind`.
- `Tidak Dikunjungi` bukan tombol di APK baru; statusnya muncul sebagai
  `UNCOLLECTED` setelah periode selesai.
- Kalau setelah kunjungan Kosong pemilik mengisi kaleng di bulan yang sama,
  penjemputan baru terjadi pada kunjungan bulan berikutnya (keputusan produk).

### Tindak lanjut yang masih terbuka

1. UI penerimaan `DIKEMBALIKAN` di web (`return-receipt` masih backend-only).
2. `deleteBulkCans` soft delete belum memanggil helper konversi jenis tugas.
3. Metrik dashboard mobile masih mencampur PICKUP+VISIT pada `task_total`;
   bila ingin dipisah, tambahkan `kind` pada agregat `month_stats`.
4. APK lama masih melihat pool `/visit-required` (branch-wide) sampai semua
   perangkat diperbarui.
