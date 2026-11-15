-- 0021_can_state_history_task_period.sql
-- Atribusi periode tugas pada ledger keadaan kaleng.
--
-- Periode rekap berasal dari periode tugas (assignment/kunjungan), BUKAN bulan
-- kalender tindakan. Kolom ini diisi eksplisit oleh setiap penulis event;
-- baris lama COLLECTION/CAN_VISIT di-backfill dari relasi sumbernya. Event
-- manual/otomatis lama yang tidak menyimpan pemicu dibiarkan NULL — jangan
-- menebak dari tanggal tindakan.

ALTER TABLE "can_state_history" ADD COLUMN IF NOT EXISTS "period_year" integer;--> statement-breakpoint
ALTER TABLE "can_state_history" ADD COLUMN IF NOT EXISTS "period_month" integer;--> statement-breakpoint
ALTER TABLE "can_state_history"
  ADD COLUMN IF NOT EXISTS "trigger_collection_id" uuid
  REFERENCES "collections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "can_state_history"
  ADD COLUMN IF NOT EXISTS "trigger_assignment_id" uuid
  REFERENCES "assignments"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "can_state_history_period_idx"
  ON "can_state_history" USING btree ("period_year", "period_month", "can_id");--> statement-breakpoint

-- Backfill event COLLECTION dari koleksi asal → assignment periode.
UPDATE "can_state_history" h
SET
  "period_year" = a."period_year",
  "period_month" = a."period_month",
  "trigger_collection_id" = c."id",
  "trigger_assignment_id" = a."id"
FROM "collections" c
JOIN "assignments" a ON a."id" = c."assignment_id"
WHERE h."source_type" = 'COLLECTION'
  AND h."source_id" = c."id"::text;--> statement-breakpoint

-- Backfill event CAN_VISIT dari record kunjungan (periode tugas tersimpan).
UPDATE "can_state_history" h
SET
  "period_year" = cv."period_year",
  "period_month" = cv."period_month"
FROM "can_visits" cv
WHERE h."source_type" = 'CAN_VISIT'
  AND h."source_id" = cv."id"::text;--> statement-breakpoint

-- AUTO_EMPTY_STREAK lama menyimpan source_id = proposal id, bukan koleksi
-- pemicu; AUTO_RESTORE_ACTIVE lama memakai UUID acak. Keduanya tetap NULL
-- (tidak dapat dibuktikan) dan akan dihitung sebagai data belum teratribusi.
