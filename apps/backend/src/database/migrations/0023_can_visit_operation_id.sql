ALTER TABLE "can_visits" ADD COLUMN IF NOT EXISTS "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "can_visits" ADD COLUMN IF NOT EXISTS "offline_id" varchar(100);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "can_visits" ADD CONSTRAINT "can_visits_assignment_id_assignments_id_fk"
    FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "can_visits_offline_id_unq" ON "can_visits" ("offline_id");
