-- Tindakan NON_AKTIF dan metadata penerimaan pengembalian.
-- Kolom dibuat idempotent agar aman ketika journal belum pernah diterapkan.

ALTER TABLE "can_visits"
  ADD COLUMN IF NOT EXISTS "outcome" varchar(20) NOT NULL DEFAULT 'TIDAK_DIKUNJUNGI',
  ADD COLUMN IF NOT EXISTS "condition" varchar(20),
  ADD COLUMN IF NOT EXISTS "received_at" timestamp,
  ADD COLUMN IF NOT EXISTS "received_by" uuid;

CREATE INDEX IF NOT EXISTS "can_visits_return_pending_idx"
  ON "can_visits" ("can_id", "visited_at")
  WHERE "outcome" = 'DIKEMBALIKAN' AND "received_at" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'can_visits_received_by_users_fk'
  ) THEN
    ALTER TABLE "can_visits"
      ADD CONSTRAINT "can_visits_received_by_users_fk"
      FOREIGN KEY ("received_by") REFERENCES "users"("id");
  END IF;
END $$;
