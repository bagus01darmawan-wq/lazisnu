# Database Schema Audit Notes — Lazisnu

Catatan ini mencatat keputusan schema yang perlu diketahui developer sebelum mengubah database.

## Collections

- `collections` adalah tabel finansial immutable.
- Koreksi dilakukan dengan insert row baru, bukan update row lama.
- Latest row ditentukan oleh `MAX(submit_sequence)` untuk `assignment_id + can_id`.
- Index penting:
  - `collection_assignment_can_sequence_unq` untuk menjaga versi unik.
  - `collections_officer_status_collected_idx` untuk query history petugas dan recent collection.

## Coordinates

Saat ini `latitude` dan `longitude` memakai `decimal`.

Keputusan saat ini:

- Cukup untuk menyimpan dan menampilkan titik lokasi.
- Belum perlu PostGIS selama belum ada fitur radius, nearest can, polygon wilayah, atau geospatial analytics.

## updated_at

`updated_at` saat ini memakai `defaultNow()` untuk waktu insert dan di-update manual pada beberapa operasi.

Risiko:

- Jika developer lupa set `updatedAt` saat update, timestamp tidak berubah.

Rekomendasi berikutnya:

- Tambahkan helper update per service, atau
- Tambahkan trigger database `updated_at` untuk table non-immutable.

## Cans QR Code

`cans.qr_code` saat ini nullable di schema karena ada alur generate QR otomatis/terpisah.

Hal yang harus dijaga:

- Kaleng aktif yang siap ditugaskan harus punya QR valid.
- Jika nanti business rule mewajibkan semua cans punya QR sejak awal, lakukan migration data dulu sebelum menambahkan `NOT NULL`.

## owner_address

`owner_address` di-normalisasi di validation boundary agar input kosong/null menjadi string kosong untuk menjaga kompatibilitas environment lama yang pernah memiliki constraint `NOT NULL`.
