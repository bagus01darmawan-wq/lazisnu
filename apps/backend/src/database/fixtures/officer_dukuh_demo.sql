-- =====================================================================
--  FIXTURE — BUKAN FAKTA OPERASIONAL
--  HANYA UNTUK DEMO STAGING. JANGAN PERNAH DIJALANKAN DI PRODUKSI.
-- =====================================================================
-- 8 officer di staging tidak punya relasi ke Dukuh. Kolom `officers.dukuh_id`
-- sengaja nullable: memaksa officer ke Dukuh yang tidak dipilih oleh manusia
-- akan menciptakan data palsu.
--
-- Isi skrip ini HANYA untuk membuat demo kartu wilayah punya isi, dan
-- hanya untuk dua kasus yang tidak ambigu:
--
--   * lalalu -> KEMBANG   (ranting SAWANGAN punya tepat 1 Dukuh: KEMBANG)
--   * lalal  -> JALADARA  (ranting KALIOMBO punya tepat 1 Dukuh: JALADARA)
--
-- YANG SENGAJA DIKOSONGKAN:
--   * lele   (ranting PANINGGARAN TIMUR punya 3 Dukuh: DUKUH TEST,
--     KAUMAN ATAS, PESANTREN). Tiga kandidat, tidak ada dasar memilih,
--     jadi dibiarkan NULL dan ditampilkan sebagai "belum ter-mapping".
--   * Sisanya (6 officer) rantingnya tidak punya record Dukuh sama sekali.
--
-- Untuk membatalkan: jalankan bagian ROLLBACK di bawah.
-- =====================================================================

BEGIN;

-- PETA FIXTURE ------------------------------------------------------------
UPDATE officers o
SET dukuh_id = d.id
FROM dukuhs d
WHERE o.employee_code = 'PNG-02-0002'   -- lalalu
  AND d.name = 'KEMBANG'
  AND d.branch_id = o.branch_id
  AND o.dukuh_id IS NULL;

UPDATE officers o
SET dukuh_id = d.id
FROM dukuhs d
WHERE o.employee_code = 'PNG-04-0002'   -- lalal
  AND d.name = 'JALADARA'
  AND d.branch_id = o.branch_id
  AND o.dukuh_id IS NULL;

COMMIT;

-- ROLLBACK (jangan dijalankan sekarang) -----------------------------------
-- UPDATE officers SET dukuh_id = NULL
-- WHERE employee_code IN ('PNG-02-0002', 'PNG-04-0002');

-- VERIFIKASI ---------------------------------------------------------------
SELECT o.employee_code, u.full_name, b.name AS ranting, d.name AS dukuh_fixture
FROM officers o
LEFT JOIN users u    ON u.id = o.user_id
LEFT JOIN branches b ON b.id = o.branch_id
LEFT JOIN dukuhs d   ON d.id = o.dukuh_id
ORDER BY o.employee_code;
