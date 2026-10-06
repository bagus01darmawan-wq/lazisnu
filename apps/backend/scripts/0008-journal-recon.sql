-- Rekonsiliasi buku migrasi drizzle (idempoten, aman diulang).
-- Dijalankan dalam TRANSAKSI YANG SAMA dengan 0008_blue_proteus.sql:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f 0008_blue_proteus.sql -f 0008-journal-recon.sql
--
-- Nilai created_at = kolom "when" di meta/_journal.json. JANGAN pakai now():
-- baris dengan created_at lebih besar dari "when" migrasi berikutnya membuat
-- migrasi itu DILEWATI diam-diam oleh migrator (dialect.cjs: order by created_at desc limit 1).
--
-- hash = sha256 isi berkas .sql (baris LF). Migrator TIDAK pernah membandingkan hash,
-- jadi nilainya kosmetik — tetapi dipakai nilai yang persis sama dengan yang tercatat
-- di staging (0006) dan isi berkas apa adanya (0008).

-- 0006_can_condition_status — objeknya sudah ada di produksi, barisnya hilang dari journal.
-- Sudah tercatat di staging dengan hash & created_at yang sama.
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '216e60eaa525ad408cc171c3ec81c872e312db33b2d32e7b3529221568f4c5e9', 1789416996689
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1789416996689
);

-- 0008_blue_proteus — baris penanda untuk migrasi yang baru diterapkan di transaksi ini.
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '871cf183252729df39e3f7ab9bc47b2982b3b00efd3792c225d92354a39d0ae7', 1789845665545
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1789845665545
);
