ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "correction_operation_id" varchar(100);--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "correction_source_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collections_correction_operation_unq" ON "collections" ("correction_operation_id");
