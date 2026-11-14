-- 0020_can_state_history.sql
-- Pisahkan status operasional dari kondisi fisik kaleng, tambahkan ledger
-- append-only patch per dimensi, backfill dari enum legacy, lalu buat satu
-- baseline cutover untuk setiap kaleng yang sudah ada.
--
-- Cutover: migrasi ini mengasumsikan mutasi dijeda (backend lama hanya menulis
-- `condition`). Runbook ada di docs/rencana-pemisahan-status-kondisi-kaleng-periode-2026-11-13.md
-- Task 2. Jangan jalankan di produksi tanpa write-pause + izin terpisah.

-- Enum baru (idempoten agar aman dijalankan ulang di test/staging).
DO $$ BEGIN
  CREATE TYPE "can_lifecycle_status" AS ENUM ('AKTIF', 'NON_AKTIF', 'DIKEMBALIKAN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "can_physical_condition" AS ENUM ('BAIK', 'RUSAK', 'HILANG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "can_physical_condition_source" AS ENUM ('OBSERVED', 'LEGACY_ASSUMPTION_BAIK', 'CUTOVER_BASELINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Kolom additive. NULL dulu agar backfill bisa memakai data riwayat.
ALTER TABLE "cans" ADD COLUMN IF NOT EXISTS "lifecycle_status" "can_lifecycle_status";--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN IF NOT EXISTS "physical_condition" "can_physical_condition";--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN IF NOT EXISTS "physical_condition_source" "can_physical_condition_source";--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN IF NOT EXISTS "can_version" integer NOT NULL DEFAULT 1;--> statement-breakpoint

-- Backfill. Bukti kondisi fisik terakhir diambil hanya dari jejak yang dapat
-- diverifikasi: can_visits (kondisi saat kunjungan) dan proposal APPROVED.
-- NON_AKTIF/DIKEMBALIKAN tanpa bukti diisi BAIK dengan provenance asumsi.
WITH last_visit AS (
  SELECT DISTINCT ON (cv."can_id")
    cv."can_id",
    CASE cv."condition"
      WHEN 'AKTIF' THEN 'BAIK'::"can_physical_condition"
      WHEN 'RUSAK' THEN 'RUSAK'::"can_physical_condition"
      WHEN 'HILANG' THEN 'HILANG'::"can_physical_condition"
    END AS "physical_condition"
  FROM "can_visits" cv
  WHERE cv."condition" IN ('AKTIF', 'RUSAK', 'HILANG')
  ORDER BY cv."can_id", cv."visited_at" DESC, cv."created_at" DESC
),
last_proposal AS (
  SELECT DISTINCT ON (p."can_id")
    p."can_id",
    CASE p."to_condition"
      WHEN 'RUSAK' THEN 'RUSAK'::"can_physical_condition"
      WHEN 'HILANG' THEN 'HILANG'::"can_physical_condition"
      ELSE 'BAIK'::"can_physical_condition"
    END AS "physical_condition"
  FROM "can_condition_proposals" p
  WHERE p."status" = 'APPROVED'
    AND p."to_condition" IN ('AKTIF', 'RUSAK', 'HILANG')
  ORDER BY p."can_id", p."approved_at" DESC NULLS LAST, p."created_at" DESC
),
proven AS (
  SELECT
    c."id",
    COALESCE(lv."physical_condition", lp."physical_condition") AS "physical_condition"
  FROM "cans" c
  LEFT JOIN last_visit lv ON lv."can_id" = c."id"
  LEFT JOIN last_proposal lp ON lp."can_id" = c."id"
)
UPDATE "cans" c
SET
  "lifecycle_status" = CASE c."condition"
    WHEN 'NON_AKTIF' THEN 'NON_AKTIF'::"can_lifecycle_status"
    WHEN 'DIKEMBALIKAN' THEN 'DIKEMBALIKAN'::"can_lifecycle_status"
    ELSE 'AKTIF'::"can_lifecycle_status"
  END,
  "physical_condition" = CASE c."condition"
    WHEN 'AKTIF' THEN 'BAIK'::"can_physical_condition"
    WHEN 'RUSAK' THEN 'RUSAK'::"can_physical_condition"
    WHEN 'HILANG' THEN 'HILANG'::"can_physical_condition"
    ELSE COALESCE(p."physical_condition", 'BAIK'::"can_physical_condition")
  END,
  "physical_condition_source" = CASE
    WHEN c."condition" IN ('AKTIF', 'RUSAK', 'HILANG') THEN 'OBSERVED'::"can_physical_condition_source"
    WHEN p."physical_condition" IS NOT NULL THEN 'OBSERVED'::"can_physical_condition_source"
    ELSE 'LEGACY_ASSUMPTION_BAIK'::"can_physical_condition_source"
  END
FROM proven p
WHERE c."id" = p."id";--> statement-breakpoint

ALTER TABLE "cans" ALTER COLUMN "lifecycle_status" SET DEFAULT 'AKTIF';--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "lifecycle_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "physical_condition" SET DEFAULT 'BAIK';--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "physical_condition" SET NOT NULL;--> statement-breakpoint

-- Ledger patch per dimensi.
CREATE TABLE IF NOT EXISTS "can_state_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "can_id" uuid NOT NULL REFERENCES "cans"("id") ON DELETE CASCADE,
  "lifecycle_status" "can_lifecycle_status",
  "physical_condition" "can_physical_condition",
  "physical_condition_source" "can_physical_condition_source",
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE RESTRICT,
  "effective_at" timestamp NOT NULL,
  "recorded_at" timestamp DEFAULT now() NOT NULL,
  "can_version" integer NOT NULL,
  "source_type" varchar(40) NOT NULL,
  "source_id" varchar(120) NOT NULL,
  "actor_id" uuid REFERENCES "users"("id"),
  "reason_code" varchar(40)
);--> statement-breakpoint

ALTER TABLE "can_state_history" DROP CONSTRAINT IF EXISTS "can_state_history_dimension_check";--> statement-breakpoint
ALTER TABLE "can_state_history"
  ADD CONSTRAINT "can_state_history_dimension_check"
  CHECK ("lifecycle_status" IS NOT NULL OR "physical_condition" IS NOT NULL OR "branch_id" IS NOT NULL);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "can_state_history_source_unq"
  ON "can_state_history" USING btree ("source_type", "source_id", "can_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "can_state_history_can_order_idx"
  ON "can_state_history" USING btree ("can_id", "effective_at", "can_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "can_state_history_branch_effective_idx"
  ON "can_state_history" USING btree ("branch_id", "effective_at");--> statement-breakpoint

-- Baseline cutover: SATU baris per kaleng existing pada satu timestamp.
-- Baseline bukan event bisnis dan TIDAK memakai cans.created_at.
WITH cutover AS (
  SELECT date_trunc('second', now()) AS "cutover_at"
)
INSERT INTO "can_state_history" (
  "can_id", "lifecycle_status", "physical_condition", "physical_condition_source",
  "branch_id", "effective_at", "recorded_at", "can_version", "source_type", "source_id"
)
SELECT
  c."id",
  c."lifecycle_status",
  c."physical_condition",
  COALESCE(c."physical_condition_source", 'CUTOVER_BASELINE'::"can_physical_condition_source"),
  c."branch_id",
  cutover."cutover_at",
  now(),
  0,
  'CUTOVER_BASELINE',
  c."id"::text
FROM "cans" c
CROSS JOIN cutover
ON CONFLICT ("source_type", "source_id", "can_id") DO NOTHING;--> statement-breakpoint

-- Rekonsiliasi sebelum ledger boleh dibaca. Gagal = batalkan cutover:
-- jumlah baseline harus sama dengan jumlah kaleng, state harus sama, dan
-- proyeksi legacy harus konsisten dengan pasangan baru.
DO $$
DECLARE
  mismatch_count bigint;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM "cans" c
  LEFT JOIN "can_state_history" h
    ON h."can_id" = c."id" AND h."source_type" = 'CUTOVER_BASELINE'
  WHERE h."id" IS NULL
     OR h."branch_id" IS DISTINCT FROM c."branch_id"
     OR h."lifecycle_status" IS DISTINCT FROM c."lifecycle_status"
     OR h."physical_condition" IS DISTINCT FROM c."physical_condition"
     OR CASE
          WHEN c."condition" = 'NON_AKTIF' THEN h."lifecycle_status" <> 'NON_AKTIF'
          WHEN c."condition" = 'DIKEMBALIKAN' THEN h."lifecycle_status" <> 'DIKEMBALIKAN'
          WHEN c."condition" IN ('AKTIF', 'RUSAK', 'HILANG') THEN h."lifecycle_status" <> 'AKTIF'
          ELSE TRUE
        END
     OR CASE
          WHEN c."condition" = 'AKTIF' THEN h."physical_condition" <> 'BAIK'
          WHEN c."condition" = 'RUSAK' THEN h."physical_condition" <> 'RUSAK'
          WHEN c."condition" = 'HILANG' THEN h."physical_condition" <> 'HILANG'
          ELSE FALSE
        END;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Cutover can_state_history gagal: % kaleng tidak konsisten dengan baseline/proyeksi legacy',
      mismatch_count;
  END IF;
END $$;
