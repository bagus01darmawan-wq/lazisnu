# 01 — Fondasi data dan status kaleng

## Tujuan fase

Membuat model data yang dapat membedakan lima kondisi kaleng tanpa mengubah tampilan overview lebih dahulu. Setelah selesai, sistem dapat menyimpan kondisi, usulan perubahan, alasan baku, dan kunjungan yang bukan penjemputan.

## Prasyarat

- Selesaikan kebijakan zona waktu backend dan database terlebih dahulu.
- Buat backup database dan catat baseline dashboard pada hari yang sama.
- Jangan menghapus `isActive` pada fase ini.

## Model target

Tambahkan enum berikut di `apps/backend/src/database/schema.ts`:

```ts
can_condition = 'AKTIF' | 'NON_AKTIF' | 'RUSAK' | 'HILANG' | 'DIKEMBALIKAN'
```

Tambahkan `cans.condition`, `NOT NULL`, default `AKTIF`.

| Kondisi | `isActive` target | Cakupan | Tugas bulanan | Perlakuan |
|---|---:|---|---|---|
| `AKTIF` | true | penempatan | ya | normal |
| `RUSAK` | true | penempatan | ya | ganti unit |
| `HILANG` | true | hilang terpisah | ya | beri kaleng baru |
| `NON_AKTIF` | true | penempatan | tidak | kunjungan verifikasi |
| `DIKEMBALIKAN` | false | di luar cakupan | tidak | selesai |

`isActive` dipertahankan sementara sebagai penanda apakah baris masih dilacak. Semua query operasional baru harus memakai `condition` untuk menjawab perilaku bisnis.

## Perubahan per berkas

### `apps/backend/src/database/schema.ts`

1. Tambahkan `canConditionEnum` di dekat enum yang ada.
2. Tambahkan `condition` pada tabel `cans`.
3. Tambahkan `skipReasonCode` pada `assignments`; jangan mengganti `notes`, karena `notes` tetap berguna sebagai keterangan tambahan.
4. Tambahkan `canConditionProposals`:
   - `canId`, `fromCondition`, `toCondition`;
   - `triggerSource` (`EMPTY_THRESHOLD`, `SKIP_REASON`, `MANUAL`);
   - `reasonCode`, `reasonNote`, `evidenceCount`;
   - `status` (`PENDING`, `APPROVED`, `REJECTED`), `approvedBy`, `approvedAt`, `createdAt`.
5. Tambahkan `canVisits` untuk `VERIFIKASI` dan `PENGGANTIAN`; kunjungan tidak boleh dibuat sebagai collection nominal nol.
6. Tambahkan relation Drizzle untuk tabel baru dan indeks untuk jalur baca utama (`can_id`, status proposal, waktu kunjungan).

### `apps/backend/src/database/migrations/`

Buat migrasi Drizzle baru, jangan mengubah migrasi historis `0000`–`0005`.

Urutan SQL yang harus tervalidasi:

```sql
CREATE TYPE can_condition AS ENUM
  ('AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN');
ALTER TABLE cans ADD COLUMN condition can_condition NOT NULL DEFAULT 'AKTIF';
UPDATE cans SET condition = 'DIKEMBALIKAN' WHERE is_active = false;
```

Backfill ini menjaga dashboard lama: baris yang sebelumnya tidak dihitung sebagai aktif tetap tidak masuk cakupan baru. Jangan menebak data lama sebagai `NON_AKTIF`.

### `packages/shared-types/src/index.ts`

Tambahkan `CanCondition`, tipe proposal, kunjungan, dan field `condition` pada `Can`. Gunakan nama API snake_case pada payload baru agar konsisten dengan kontrak yang sudah ada.

### `apps/backend/src/services/canService.ts`

Fase ini hanya siapkan service dan kontrak:

- perluas `CreateCanInput`/`UpdateCanInput` secara ketat;
- kaleng baru otomatis `AKTIF`;
- jangan lagi memakai perubahan `isActive` sebagai aksi bisnis “nonaktifkan”; aksi lama perlu dipetakan pada fase operasional;
- siapkan filter `condition`, tetapi pertahankan alias filter lama secara sementara agar UI lama tidak putus;
- ketika mengambil assignment bulan ini, tentukan aturan urutan eksplisit. Implementasi sekarang memakai `limit: 1` tanpa `orderBy` di `getCans`.

## Reason code target

| Peristiwa | Kode wajib |
|---|---|
| Tidak terjemput | `OWNER_ABSENT`, `OWNER_REFUSED`, `CAN_LOST`, `CAN_DAMAGED`, `ACCESS_DIFFICULT`, `OTHER` |
| Nonaktif | `MOVED_HOUSE`, `OWNER_UNABLE`, `OWNER_REFUSED_CONTINUE`, `OTHER` |
| Dikembalikan | `OWNER_REQUEST`, `CAN_INACTIVE`, `CAN_DAMAGED` |

Simpan kode; `notes` maksimal 255 karakter hanya sebagai pelengkap. Jangan menyimpan label Indonesia sebagai nilai bisnis.

## Checklist penerimaan

- [ ] Migrasi dapat dijalankan pada salinan produksi.
- [ ] Setiap kaleng baru memiliki `condition = AKTIF` dan `isActive = true`.
- [ ] Semua data `is_active = false` telah menjadi `DIKEMBALIKAN` dan `isActive = false`.
- [ ] Tidak ada perubahan nominal, jumlah row collection, atau riwayat assignment karena migrasi.
- [ ] Tabel proposal dan kunjungan dapat ditulis serta dihubungkan ke kaleng/petugas yang valid.
- [ ] Kontrak shared types berhasil dibangun sebelum backend/web dikompilasi.

## Tidak dikerjakan pada fase ini

- Tidak mengganti dashboard.
- Tidak menyalakan usulan otomatis enam kali kosong.
- Tidak menghapus `POSTPONED`.
- Tidak mengubah APK mobile.
