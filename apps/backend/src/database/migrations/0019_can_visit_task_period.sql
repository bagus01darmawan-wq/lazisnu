ALTER TABLE "can_visits" ADD COLUMN IF NOT EXISTS "period_year" integer;--> statement-breakpoint
ALTER TABLE "can_visits" ADD COLUMN IF NOT EXISTS "period_month" integer;--> statement-breakpoint

-- Link legacy visit timestamps to the closest completed VISIT assignment when
-- possible. The assignment is closed in the same request as the visit, so its
-- completed_at is a better period source than visited_at around month rollover.
WITH ranked_assignments AS (
  SELECT
    cv."id" AS "visit_id",
    a."period_year",
    a."period_month",
    ROW_NUMBER() OVER (
      PARTITION BY cv."id"
      ORDER BY
        (a."completed_at" IS NULL) ASC,
        ABS(EXTRACT(EPOCH FROM (COALESCE(a."completed_at", a."updated_at") - cv."visited_at"))) ASC,
        a."created_at" DESC
    ) AS "assignment_rank"
  FROM "can_visits" cv
  JOIN "assignments" a
    ON a."can_id" = cv."can_id"
   AND a."officer_id" = cv."officer_id"
   AND a."kind" = 'VISIT'
)
UPDATE "can_visits" cv
SET
  "period_year" = ranked."period_year",
  "period_month" = ranked."period_month"
FROM ranked_assignments ranked
WHERE cv."id" = ranked."visit_id"
  AND ranked."assignment_rank" = 1;--> statement-breakpoint

-- Keep standalone legacy visits queryable by their recorded calendar month.
UPDATE "can_visits"
SET
  "period_year" = EXTRACT(YEAR FROM "visited_at")::integer,
  "period_month" = EXTRACT(MONTH FROM "visited_at")::integer
WHERE "period_year" IS NULL OR "period_month" IS NULL;--> statement-breakpoint

ALTER TABLE "can_visits" ALTER COLUMN "period_year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "can_visits" ALTER COLUMN "period_month" SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "can_visits_officer_period_idx"
  ON "can_visits" USING btree ("officer_id", "period_year", "period_month");
