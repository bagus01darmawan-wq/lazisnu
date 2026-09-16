-- Snapshot pra-migrasi 0007 (read-only, tidak mengubah apa pun).
SELECT 'baris_total' AS metrik, count(*)::text AS nilai FROM assignments;
SELECT 'baris_postponed' AS metrik, count(*)::text AS nilai FROM assignments WHERE status = 'POSTPONED';
SELECT 'enum_sekarang' AS metrik, string_agg(enumlabel, ',') AS nilai
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'assignment_status';
SELECT 'index_assignments' AS metrik, count(*)::text AS nilai FROM pg_indexes WHERE tablename = 'assignments';
SELECT 'migrasi_tercatat' AS metrik, count(*)::text AS nilai FROM drizzle.__drizzle_migrations;
