-- Rekonsiliasi buku migrasi drizzle untuk 0009/0010/0011 (idempoten, aman diulang).
-- Dijalankan dalam TRANSAKSI YANG SAMA dengan berkas migrasinya (lihat
-- docs/ci/RUNBOOK-0010-0011-STAGING-2026-09-22.md):
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f 0009_romantic_red_shift.sql -f 0010_chunky_nekra.sql -f 0011_lying_monster_badoon.sql -f 0010-0011-journal-recon.sql
-- (sesuaikan: hanya berkas yang benar-benar diterapkan, lihat Langkah 2 runbook)
--
-- Nilai created_at = kolom "when" di meta/_journal.json. JANGAN pakai now():
-- baris dengan created_at lebih besar dari "when" migrasi berikutnya membuat
-- migrasi itu DILEWATI diam-diam oleh migrator (dialect.cjs: order by created_at
-- desc limit 1 — fakta terverifikasi runbook 0008).
--
-- hash = sha256 isi berkas .sql (baris LF). Migrator TIDAK pernah membandingkan
-- hash, jadi nilainya kosmetik; tetap dipakai nilai hasil hitung ulang agar buku
-- rapi (pola 0008-journal-recon.sql).
--
-- when (meta/_journal.json):
--   0009_romantic_red_shift    => 1789880679625  (hash 6cbc28f6…, diberlakukan bila
--                                                   staging ternyata belum punya 0009)
--   0010_chunky_nekra          => 1789917804146  (hash bc88c888…)
--   0011_lying_monster_badoon  => 1790016422612  (hash e07a85c7…)

-- 0009_romantic_red_shift — TERGANTUNG hasil Langkah 0: baris ini hanya
-- berguna bila 0009.sql ikut diterapkan di transaksi yang sama. Idempoten:
-- WHERE NOT EXISTS membuat insert berulang menjadi no-op.
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '6cbc28f62df9088ee120ecff3021d59f6c444354edd4ecd908b52bf6128b596b', 1789880679625
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1789880679625
);

-- 0010_chunky_nekra — wajib (reopened_until x2 + ba_pdf_archives).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'bc88c88868673aa2903b91739e70e77835600c391b44cf8670003f8d25a7b30a', 1789917804146
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1789917804146
);

-- 0011_lying_monster_badoon — wajib (ppk_emergency_aggregates).
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'e07a85c7955dc79736b69145a25ffc5c861aee9e45568aeda546090cd11be519', 1790016422612
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1790016422612
);
