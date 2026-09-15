# 04 — Integrasi status dan operasional

## Tujuan fase

Menghubungkan fondasi kondisi kaleng dengan penugasan, daftar kaleng, aplikasi mobile, dan aksi admin. Kerjakan per alur agar overview tidak menampilkan kondisi yang belum dapat dikelola dengan aman.

## 1. Pembuatan tugas bulanan

### Berkas aktual

- `apps/backend/src/services/assignmentGenerator.ts`
- `apps/backend/src/routes/admin/assignments.ts`

Keduanya saat ini hanya memakai `cans.isActive = true`. Setelah fase fondasi, aturan target:

```ts
isActive = true
AND condition IN ('AKTIF', 'RUSAK', 'HILANG')
```

`NON_AKTIF` tidak boleh dibuat assignment penjemputan. Ia dapat masuk daftar kunjungan verifikasi terpisah. `DIKEMBALIKAN` tidak masuk kedua daftar.

Periksa kedua jalur: generator otomatis `findCansWithoutAssignment()` dan endpoint manual `POST /admin/assignments/bulk-branch`. Jangan hanya memperbaiki salah satunya.

## 2. Daftar dan detail kaleng

### Berkas aktual

- `apps/backend/src/services/canService.ts`
- `apps/backend/src/routes/admin/cans.ts`
- `apps/web/src/app/dashboard/cans/page.tsx`

Pekerjaan:

1. Ganti filter daftar dari `isActive` menjadi `condition` untuk kondisi bisnis.
2. Tampilkan `AKTIF`, `RUSAK`, `HILANG`, `NON_AKTIF`, dan `DIKEMBALIKAN` secara eksplisit; status assignment periode dapat menjadi kolom/label sekunder, bukan pengganti kondisi.
3. Tetapkan `orderBy` untuk assignment periode ketika respons perlu menampilkan satu assignment; implementasi aktual memakai `limit: 1` tanpa urutan.
4. Detail kaleng perlu memuat kondisi kini, alasan/riwayat proposal, riwayat collection, dan kunjungan. Pisahkan “penjemputan” dari “kunjungan verifikasi/penggantian”.
5. Ubah aksi soft-delete lama. `DELETE /admin/cans/:id` tanpa `permanent` saat ini hanya menyetel `isActive = false`; sesudah skema baru aksi bisnis harus menjadi transition yang jelas menuju `DIKEMBALIKAN` dengan reason code dan audit trail. Jangan menyediakan aksi yang dapat menciptakan `isActive = false` tetapi `condition != DIKEMBALIKAN`.

## 3. Usulan dan perubahan kondisi

Buat `conditionProposalService.ts` dengan fungsi idempoten:

- membuat proposal bila belum ada proposal pending untuk transisi sama;
- menyetujui/menolak setelah pemeriksaan ownership;
- memperbarui `cans.condition` dan `isActive` secara atomik;
- mencatat `activityLogs` melalui konteks route yang sudah dipakai aplikasi;
- menutup/mengganti proposal yang tidak relevan setelah kondisi berubah.

Transition target:

| Pemicu | Usulan/transisi |
|---|---|
| enam collection valid nominal nol berturut-turut | usulkan `→ NON_AKTIF`; admin menyetujui |
| reason `CAN_DAMAGED` | usulkan `→ RUSAK`; admin menyetujui |
| reason `CAN_LOST` | usulkan `→ HILANG`; admin menyetujui |
| collection valid nominal positif pada `NON_AKTIF` | otomatis `NON_AKTIF → AKTIF`, reset hitungan secara turunan dari riwayat |
| kaleng baru diberikan ke rumah hilang | `HILANG → AKTIF` |
| kaleng ditarik | `→ DIKEMBALIKAN`, `isActive = false` |

Penghitung kosong harus membaca collection valid terbaru dari riwayat dengan `getLatestCollectionCondition()`, mengurutkan `collectedAt`, berhenti pada nominal positif terbaru, dan tidak menghitung `UNCOLLECTED` atau `canVisits`.

## 4. Mobile skip dan kunjungan

### Berkas aktual

- `apps/backend/src/routes/mobile/schemas.ts`
- `apps/backend/src/routes/mobile/tasks.ts`
- `apps/mobile/src/screens/CollectionScreen.tsx`

Route `POST /mobile/assignments/:id/skip` sekarang menerima `notes` opsional lalu mengubah status ke `UNCOLLECTED`. Ubah bertahap:

1. Backend menerima `reason_code` wajib untuk APK baru; selama masa transisi, APK lama tanpa kode dipetakan ke `OTHER` dan ditandai untuk audit.
2. Simpan `skipReasonCode`, pertahankan `notes` untuk detail.
3. Reason `CAN_LOST` atau `CAN_DAMAGED` memanggil pembuat proposal sesudah assignment berhasil ditutup.
4. UI mobile mengganti input teks utama menjadi pilihan alasan berlabel; catatan tetap opsional.
5. Tambahkan endpoint khusus untuk mencatat `canVisits`; jangan gunakan endpoint collection untuk verifikasi/penggantian.

## 5. Reassignment dan POSTPONED

### Berkas aktual

`apps/backend/src/routes/admin/assignments.ts` saat ini menerima `PUT /assignments/:id` dengan `officer_id` dan `status = REASSIGNED` pada baris yang sama. Ini dapat menimpa petugas lama dan membuat tugas tidak muncul di mobile, karena mobile hanya memuat `ACTIVE`.

Buat service/endpoint transfer yang melakukan transaksi:

1. validasi assignment lama masih dapat dipindahkan;
2. set assignment lama menjadi `REASSIGNED` tanpa mengganti `officerId`;
3. buat assignment baru untuk petugas pengganti dengan status `ACTIVE`, periode dan can yang sama;
4. jangan pindahkan collection lama;
5. jaga unique index saat ini (`can_officer_period_unq`) dan validasi agar tidak ada dua assignment aktif untuk kaleng/periode.

Setelah data lama dipetakan, hapus `POSTPONED` berurutan dari schema, validasi route, web, shared types, query, dan mobile. Jangan menghapus enum pada migrasi awal.

## Kriteria penerimaan

- [ ] Hanya `AKTIF`, `RUSAK`, dan `HILANG` menerima assignment penjemputan.
- [ ] Kunjungan nonaktif tidak menambah collection kosong.
- [ ] Proposal tidak dapat disetujui di luar scope admin.
- [ ] Kaleng hilang yang ditemukan/diganti mengurangi angka hilang sesuai transition yang dicatat.
- [ ] Reassignment memisahkan laporan collection petugas lama dan pengganti.
- [ ] Tidak ada jalur baru yang menghasilkan atau mengandalkan `POSTPONED`.
