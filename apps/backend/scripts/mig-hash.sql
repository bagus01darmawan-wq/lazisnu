-- Daftar hash migrasi Drizzle yang tercatat di produksi.
SELECT id, hash, to_timestamp(created_at)::date AS dibuat
FROM drizzle.__drizzle_migrations
ORDER BY id;
