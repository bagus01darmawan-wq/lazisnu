# Runbook: Rekonsiliasi Journal + Rollout Migrasi 0008 (Opsi B) — prasyarat T12

> Disusun hasil review C1-T0 (20 Sep 2026). Prasyarat: commit yang membawa
> `0008_blue_proteus.sql`, `meta/0008_snapshot.json`, `meta/_journal.json` —
> CI `test-backend` membuktikan 0000→0008 apply bersih di Postgres 16 kosong
> sebelum berkas ini dieksekusi ke DB nyata.

## Fakta kunci (terverifikasi dari source, bukan asumsi)

1. **Migrator tidak membandingkan hash.** `drizzle-orm@0.45.2` `pg-core/dialect.cjs`
   → `migrate()` mengambil `select … order by created_at desc limit 1`, lalu
   menjalankan migrasi yang `folderMillis > created_at`. Baris journal 0006 yang
   hilang di produksi **tidak menghalangi 0008**; sisipannya hanya kerapian buku.
2. **Deploy produksi default melewati migrasi.** `scripts/deploy-blue-green.sh:460`
   → `RUN_MIGRATIONS:-0`. Komentar lama "mengaktifkannya akan mengulang dari 0000"
   sudah usang — replay hanya terjadi bila journal kosong (`!lastDbMigration`).
3. **`.env` produksi di VM tidak punya `DIRECT_URL`** → `migrate-cli.ts` akan jatuh
   ke pooler `:6543` yang (per komentar migrate-cli.ts sendiri) tidak mendukung
   prepared statement migrator — jalur belum terbukti di produksi. Karena itu
   rollout 0008 memakai psql (Opsi B), preseden 0007 (0,19 dtk, sukses).
4. **Aman satu transaksi.** Label enum baru (`STAF_*`) tidak dipakai statement lain
   di 0008 (bebas larangan *unsafe use of new value*); backfill
   `kind='PROGRAM_MWC'` same-transaction aman karena **PostgreSQL ≥ 12**
   (Supabase menjalankan PG 15+). Tidak ada `BEGIN/COMMIT/VACUUM/CONCURRENTLY`
   di dalam 0008.

## Eksekusi (staging dulu sebagai rehearsal, lalu produksi)

0. Commit 0008 + snapshot + journal (lihat prasyarat di atas).
1. **Backup kilat** (read-only, dari VM atau mesin dengan kredensial sehat):
   ```bash
   pg_dump "$URL" -t public.branches -t drizzle.__drizzle_migrations -f backup-pre-0008.sql
   ```
2. **Terapkan satu transaksi** (staging dulu, lalu produksi setelah verifikasi):
   ```bash
   psql "$URL" -1 -v ON_ERROR_STOP=1 \
     -f apps/backend/src/database/migrations/0008_blue_proteus.sql \
     -f apps/backend/scripts/0008-journal-recon.sql
   ```
3. **Verifikasi read-only — kriteria lulus:**
   - `branches` punya kolom `kind`; **PNG-25 (KOTAK TAQWA) = `PROGRAM_MWC`**, 7 lainnya `RANTING`
   - 3 tabel baru ada: `ppk_submissions`, `branch_submissions`, `period_calendar`
   - `user_role` bertambah `STAF_PENGUMPULAN` & `STAF_KEUANGAN`
   - CHECK `ppk_signers_different_chk` & `branch_signers_different_chk` ada
   - unique idx `ppk_officer_period_unq`, `branch_period_unq`, `period_calendar_year_month_unq` ada
   - **Journal: staging 8 → 9 baris; produksi 7 → 9 baris; kedua DB berakhir IDENTIK**
     (`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;`
     — dump sebelum & sesudah untuk perbandingan)
4. Health check + smoke endpoint setelah deploy image yang memuat 0008 —
   `migrate-cli` akan melihat journal mutakhir dan **no-op** (aman).

SQL verifikasi siap-pakai:
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='branches' AND column_name='kind';
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN ('ppk_submissions','branch_submissions','period_calendar') ORDER BY 1;
SELECT unnest(enum_range(NULL::user_role))::text AS role ORDER BY 1;
SELECT name, kind FROM branches ORDER BY name;
SELECT conname FROM pg_constraint WHERE conname IN
  ('ppk_signers_different_chk','branch_signers_different_chk');
SELECT indexname FROM pg_indexes WHERE indexname IN
  ('ppk_officer_period_unq','branch_period_unq','period_calendar_year_month_unq');
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
```

## Disiplin selama rollout

- **Tetap `RUN_MIGRATIONS=0`** sampai jalan migrasi terbukti (bagian bawah).
- **Jangan** menjalankan `drizzle-kit migrate`/`push` dari laptop —
  `drizzle.config.ts` memakai `DIRECT_URL || DATABASE_URL` dan `DIRECT_URL` di
  `.env` lokal mengarah ke project Supabase **produksi** (`yuhedftrrbitmxcyhfgp`).
  Guard laptop belum ada (backlog kecil); sampai ada, migrate hanya dari VM/dengan
  override URL eksplisit.
- **Jangan pakai `now()`** untuk `created_at` journal: nilai lebih besar dari
  `"when"` migrasi berikutnya membuat migrasi itu **dilewati diam-diam** oleh
  migrator. `0008-journal-recon.sql` sudah memakai nilai `when` yang benar dan
  idempoten (`WHERE NOT EXISTS`) — satu berkas sama untuk staging & produksi.

## Jalan menuju `RUN_MIGRATIONS=1` (terpisah, SETELAH rollout 0008)

a. Tambah `DIRECT_URL` mode sesi `:5432` ke `.env` produksi di VM (seperti staging).
b. Uji jalur migrator dengan **probe no-op** (journal mutakhir → tidak ada yang dijalankan).
c. Baru set `RUN_MIGRATIONS=1` di pipeline produksi.
