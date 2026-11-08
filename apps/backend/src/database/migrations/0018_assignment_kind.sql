-- Jenis tugas bulanan: PICKUP (penjemputan) dan VISIT (kunjungan NON_AKTIF).
-- Idempotent agar aman ketika journal belum pernah diterapkan.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_kind') THEN
    CREATE TYPE "public"."assignment_kind" AS ENUM ('PICKUP', 'VISIT');
  END IF;
END $$;

ALTER TABLE "assignments"
  ADD COLUMN IF NOT EXISTS "kind" "assignment_kind" DEFAULT 'PICKUP' NOT NULL;

ALTER TABLE "period_draft_items"
  ADD COLUMN IF NOT EXISTS "kind" "assignment_kind" DEFAULT 'PICKUP' NOT NULL;

-- Satu kaleng hanya boleh punya satu tugas kunjungan per periode.
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_visit_period_unq"
  ON "assignments" ("can_id", "period_year", "period_month")
  WHERE "kind" = 'VISIT';

CREATE INDEX IF NOT EXISTS "assignments_kind_period_idx"
  ON "assignments" ("kind", "period_year", "period_month", "status");
