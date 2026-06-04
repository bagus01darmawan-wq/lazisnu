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

Kondisi repo saat ini masih memiliki migration legacy/manual dengan penomoran yang belum sepenuhnya rapi. Karena itu, untuk production/staging, jalankan SQL migration yang sudah direview dari folder migrations sesuai urutan yang disepakati.

Untuk development lokal yang memang butuh sinkronisasi cepat dan sadar risikonya, script saat ini masih memakai Drizzle push:

```bash
pnpm --filter lazisnu-backend migrate
# atau
pnpm --filter lazisnu-backend db:push
```

Target jangka menengah: rapikan legacy migration journal agar production bisa memakai `drizzle-kit migrate` sebagai workflow utama.

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
| `drizzle-kit migrate` | Target recommended | Perlu perapihan legacy migration journal sebelum menjadi workflow utama production. |
| `drizzle-kit push` | Dev/local only | Sinkronisasi cepat tanpa review migration; jangan dipakai sembarangan di production. |

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
