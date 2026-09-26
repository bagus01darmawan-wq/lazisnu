-- Relasi petugas ke dukuh.
-- Officer sebelumnya hanya punya `assigned_zone` (varchar) berisi nama dusun
-- seperti 'kajen'/'krajan', yang TIDAK cocok dengan nama dukuh di tabel `dukuhs`.
-- Kolom ini yang dipakai untuk mengelompokkan petugas per dukuh di layer kartu.
--
-- Nullable: petugas yang belum dipetakan ke dukuh tetap valid. Keterangan
-- "wilayah tanpa petugas" adalah informasi yang dicari admin, jadi ketidakmapped
-- tidak boleh diblokir oleh kolom ini.
--
-- Idempotent: aman dijalankan ulang ketika journal belum pernah diterapkan.

ALTER TABLE "officers"
  ADD COLUMN IF NOT EXISTS "dukuh_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'officers_dukuh_id_fk'
  ) THEN
    ALTER TABLE "officers"
      ADD CONSTRAINT "officers_dukuh_id_fk"
      FOREIGN KEY ("dukuh_id") REFERENCES "dukuhs"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "officers_dukuh_id_idx" ON "officers" ("dukuh_id");
