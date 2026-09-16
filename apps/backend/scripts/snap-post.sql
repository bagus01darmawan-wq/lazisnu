-- Verifikasi pasca-0007 (read-only).
SELECT 'enum_sesudah' AS metrik, string_agg(enumlabel, ',') AS nilai
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'assignment_status';
-- Catatan: pengecekan POSTPONED dibatalkan — enum sudah tidak punya nilai itu,
-- jadi query WHERE status='POSTPONED' pasti error (itulah buktinya). Lihat
-- 'baris_di_luar_enum' sebagai pengganti.
SELECT 'baris_total' AS metrik, count(*)::text AS nilai FROM assignments;
SELECT 'baris_di_luar_enum' AS metrik, count(*)::text AS nilai FROM assignments
WHERE status NOT IN ('ACTIVE','COMPLETED','REASSIGNED','UNCOLLECTED');
SELECT 'distribusi_status' AS metrik, string_agg(x.s, ', ') AS nilai
FROM (SELECT status || '=' || count(*)::text AS s FROM assignments GROUP BY status) x;
SELECT 'index_assignments' AS metrik, string_agg(indexname, ',') AS nilai
FROM pg_indexes WHERE tablename = 'assignments';
SELECT 'tipe_kolom_status' AS metrik, format_type(atttypid, atttypmod) AS nilai
FROM pg_attribute WHERE attrelid = 'assignments'::regclass AND attname = 'status';
