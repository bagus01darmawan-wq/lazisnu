# Database Migration Strategy — Lazisnu

Dokumen ini menjelaskan cara aman mengubah schema database Lazisnu, terutama karena tabel `collections` menyimpan data finansial yang harus auditable.

## Prinsip Utama

1. **`schema.ts` adalah sumber kebenaran struktur aplikasi.**
   - Tabel, kolom, enum, relasi, dan index yang bisa dimodelkan oleh Drizzle harus ditulis di `apps/backend/src/database/schema.ts`.
2. **Migration resmi berada di `apps/backend/src/database/migrations/`.**
   - Perubahan schema baru harus punya file migration bernomor urut jelas.
3. **Custom PostgreSQL SQL boleh dipakai hanya untuk fitur database-specific.**
   - Contoh: `CREATE RULE` untuk menjaga immutability tabel `collections`.
   - Custom SQL tetap harus masuk file migration resmi, bukan hanya script manual.
4. **Jangan menjalankan reset database di production.**
   - `reset.ts` hanya untuk development lokal yang benar-benar boleh kehilangan data.

## Workflow Perubahan Schema

### 1. Ubah Drizzle schema

Edit:

```txt
apps/backend/src/database/schema.ts
```

Gunakan nama kolom aktual berbahasa Inggris, misalnya `collections`, `submitSequence`, `alasanResubmit`, `paymentMethod`, dan `nominal`.

### 2. Generate migration

Untuk perubahan table/column/index/enum yang bisa di-generate Drizzle:

```bash
pnpm --filter lazisnu-backend generate
```

Review file SQL yang muncul di:

```txt
apps/backend/src/database/migrations/
```

### 3. Tambahkan custom SQL jika perlu

Jika perubahan membutuhkan fitur PostgreSQL yang tidak nyaman dimodelkan di Drizzle, seperti `CREATE RULE`, tambahkan SQL manual di file migration bernomor urut berikutnya.

Contoh yang diperbolehkan:

```sql
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS
ON UPDATE TO collections
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
```

### 4. Jalankan migration

Production/staging harus memakai migration journal Drizzle agar file SQL custom yang sudah direview ikut dieksekusi dan tercatat di `drizzle.__drizzle_migrations`:

```bash
pnpm --filter lazisnu-backend migrate
```

Perintah `migrate` menjalankan dua tahap:

1. `migrate:baseline` mengecek apakah database sudah punya schema Lazisnu lengkap setelah `0003_collection_query_indexes` dari workflow lama (`drizzle-kit push` + SQL manual) tetapi belum punya row migration Drizzle. Validasi ini mencakup tabel/kolom penting seperti `dukuhs`, `cans.dukuh_id`, `cans.owner_whatsapp`, `collections.nominal`, constraint, dan index query collection. Jika lengkap, script ini hanya melakukan backfill metadata migration sampai `0003_collection_query_indexes` supaya `drizzle-kit migrate` tidak mencoba membuat ulang tabel yang sudah ada.
2. `drizzle-kit migrate` menjalankan migration journal yang lebih baru, termasuk repair forward-only seperti `0004_reapply_collection_immutable_rule`.

Untuk database kosong, baseline tidak mengisi row apa pun sehingga semua migration `0000` dan seterusnya tetap berjalan normal. Untuk database yang bentuknya tidak dikenali, baseline akan berhenti daripada menebak dan berisiko melewati migration yang masih dibutuhkan.

Untuk development lokal yang memang butuh sinkronisasi cepat dan sadar risikonya, gunakan Drizzle push secara eksplisit:

```bash
pnpm --filter lazisnu-backend db:push
# atau
pnpm --filter lazisnu-backend migrate:push
```

Catatan penting: custom PostgreSQL SQL seperti `CREATE RULE` tidak berasal dari diff schema otomatis, jadi file tersebut harus terdaftar di `src/database/migrations/meta/_journal.json`. Tanpa entry journal, `drizzle-kit migrate` tidak akan membaca atau mencatat file SQL itu.

## Rollback Strategy

Project ini memakai strategi **forward-only corrective migration**:

- Jangan edit migration lama setelah pernah diterapkan ke staging/production.
- Jika ada migration salah, buat migration baru untuk memperbaiki kondisi database.
- Untuk perubahan berisiko, ambil backup database sebelum migration.
- Untuk data finansial, jangan rollback dengan menghapus/mengubah row transaksi `collections`.

Contoh rollback aman untuk index:

```sql
DROP INDEX IF EXISTS collections_officer_status_collected_idx;
```

Contoh rollback aman untuk rule:

```sql
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS
ON UPDATE TO collections
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
```

## Script Manual dan Batasannya

| Script | Status | Catatan |
|---|---|---|
| `manual_migrate.ts` | Emergency/dev only | Untuk re-apply rule tertentu secara manual. Jangan jadi workflow utama production. |
| `reset.ts` | Local development only | Melakukan `DROP SCHEMA public CASCADE`; dilarang untuk staging/production. |
| `drizzle-kit generate` | Recommended | Membuat migration dari `schema.ts`. |
| `migrate:baseline` | One-time production/staging safety step | Backfill row migration Drizzle sampai `0003` hanya untuk database lama yang schema-nya sudah ada tetapi belum punya `drizzle.__drizzle_migrations`; tidak mengubah data transaksi `collections`. |
| `drizzle-kit migrate` | Recommended production/staging | Membaca `meta/_journal.json`, menjalankan SQL migration berurutan, dan mencatatnya di `drizzle.__drizzle_migrations`. |
| `drizzle-kit push` | Dev/local only | Sinkronisasi cepat tanpa review migration dan tidak menjalankan custom SQL migration journal; jangan dipakai di production untuk perubahan auditable. |

## Collections Immutability

Untuk koreksi nominal collection:

1. Jangan `UPDATE collections SET nominal = ...`.
2. Insert row baru dengan `submit_sequence + 1`.
3. Latest collection adalah row dengan `MAX(submit_sequence)` untuk pasangan `assignment_id + can_id`.
4. Database menjaga versi unik memakai index `(assignment_id, can_id, submit_sequence)`.

## Checklist Sebelum Merge Migration

- [ ] `schema.ts` sudah sesuai migration.
- [ ] Migration SQL sudah direview manual.
- [ ] Tidak ada referensi kolom legacy seperti `amount` untuk `collections.nominal`.
- [ ] Ada rencana rollback/forward-fix.
- [ ] Typecheck backend lulus.
- [ ] Regression test flow collection/resubmit lulus.
