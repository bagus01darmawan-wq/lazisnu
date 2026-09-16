# Rencana implementasi overview kaleng

## Tujuan

Menerapkan kondisi kaleng dan halaman overview operasional yang memungkinkan:

- `ADMIN_RANTING` memantau **hanya** data rantingnya;
- `ADMIN_KECAMATAN` memantau agregat kecamatan serta membandingkan dan menyaring per ranting;
- admin menemukan tindakan yang perlu dilakukan, bukan hanya melihat angka;
- nominal keuangan tetap memakai collection `COMPLETED` dan versi submit terbaru.

Dokumen ini adalah peta eksekusi. Detail setiap tahap ada di file bernomor berikutnya.

## Kondisi kode yang diverifikasi

| Area | Kondisi saat ini |
|---|---|
| Skema kaleng | `apps/backend/src/database/schema.ts` hanya memiliki `cans.isActive`; belum ada `condition`. |
| Status assignment | Enum masih `ACTIVE`, `COMPLETED`, `POSTPONED`, `REASSIGNED`, `UNCOLLECTED`. |
| Dashboard ranting | `apps/backend/src/routes/admin/dashboard.ts` memakai `dashboardService.ts`, tetapi juga mengirim blok `district` ke admin ranting. |
| Dashboard kecamatan | `apps/backend/src/routes/admin/district.ts` masih membuat kondisi latest collection inline, memuat collection lalu memfilter wilayah di JavaScript, dan mengelompokkan `by_branch` berdasarkan `officer.branchId`. |
| Overview web | `apps/web/src/app/dashboard/overview/page.tsx` memilih endpoint berdasarkan role; label dan rumus masih berpusat pada `is_active` dan `month_count`. |
| Tugas bulanan | `services/assignmentGenerator.ts` hanya menyaring `cans.isActive = true`. |

## Definisi metrik tunggal

| Nama di UI | Definisi target | Bukan |
|---|---|---|
| Cakupan penempatan | `AKTIF + NON_AKTIF + RUSAK` | seluruh baris `cans` |
| Cakupan hilang | `HILANG` | bagian dari cakupan penempatan |
| Perlu tindakan | `NON_AKTIF + RUSAK + HILANG` | jumlah tugas aktif |
| Tugas ditutup | assignment `COMPLETED + UNCOLLECTED` pada periode | jumlah collection |
| Tugas belum | assignment `ACTIVE` pada periode | kaleng belum dijemput sepanjang masa |
| Penjemputan berhasil | collection dengan `sync_status = COMPLETED`, berada pada periode/rentang, dan lolos `getLatestCollectionCondition()` | semua submit/resubmit |
| Dikembalikan | `condition = DIKEMBALIKAN`; tampilkan bulan berjalan dan total | kaleng nonaktif lama |

`REASSIGNED` tidak masuk tugas selesai, tugas aktif, maupun penjemputan berhasil.

## Urutan dan batas deploy

| Fase | Dokumen | Dapat dideploy sendiri | Ketergantungan |
|---:|---|---|---|
| 0 | `01-fondasi-data-status-kaleng.md` | Ya, setelah migrasi dan backfill | Tidak ada |
| 1 | `02-backend-overview-dan-agregasi.md` | Ya, API baru dipasang paralel | Fase 0 |
| 2 | `03-web-overview-role-dan-ui.md` | Ya, setelah API stabil | Fase 1 |
| 3 | `04-integrasi-status-dan-operasional.md` | Bertahap per alur | Fase 0; beberapa bagian menunggu APK mobile |
| 4 | `05-pengujian-rilis-dan-rollout.md` | Wajib pada tiap fase | Semua fase |

Jangan mencampur migrasi skema, perubahan query, dan redesign UI dalam satu deploy. Setiap perubahan harus dapat dibandingkan dengan angka produksi sebelum perubahan berikutnya dinyalakan.

## Keputusan scope dan otorisasi

- Scope data ditentukan server dari `request.currentUser`, bukan dari filter klien.
- `ADMIN_RANTING` tidak menerima pemilih ranting dan tidak boleh meminta `branch_id` di luar `user.branchId`.
- `ADMIN_KECAMATAN` hanya boleh menggunakan ranting yang bergabung pada `user.districtId`.
- Aksi persetujuan proposal dan perubahan kondisi harus memeriksa kepemilikan kaleng dengan pola `canService.checkAccess`/`getRoleScope`; jangan hanya menyembunyikan tombol di web.

## Risiko yang harus ditutup sebelum UI baru

1. Tanggal server saat ini memakai `new Date()` tanpa kebijakan zona waktu eksplisit pada dashboard. Selesaikan zona waktu operasional sebelum ambang enam kali kosong dipakai.
2. Backfill `is_active = false` harus menjadi `DIKEMBALIKAN`, bukan `NON_AKTIF`, agar cakupan tidak melonjak saat migrasi.
3. Pengelompokan nominal kecamatan harus menggunakan `cans.branchId`, bukan ranting petugas.
4. `POSTPONED` tidak boleh dihapus dari enum sebelum data lama dipetakan.
5. Overview tidak boleh mengubah angka nominal tanpa tetap memakai `getLatestCollectionCondition()`.

## Berkas rencana

1. [Fondasi data dan status](01-fondasi-data-status-kaleng.md)
2. [Backend overview dan agregasi](02-backend-overview-dan-agregasi.md)
3. [Web overview berbasis role dan UI](03-web-overview-role-dan-ui.md)
4. [Integrasi status dan operasional](04-integrasi-status-dan-operasional.md)
5. [Pengujian, rilis, dan rollout](05-pengujian-rilis-dan-rollout.md)
