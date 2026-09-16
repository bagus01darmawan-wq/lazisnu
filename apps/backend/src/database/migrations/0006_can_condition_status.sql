CREATE TYPE "public"."can_condition" AS ENUM('AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN');--> statement-breakpoint
CREATE TABLE "can_condition_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"can_id" uuid NOT NULL,
	"from_condition" "can_condition" NOT NULL,
	"to_condition" "can_condition" NOT NULL,
	"trigger_source" varchar(30) NOT NULL,
	"reason_code" varchar(40) NOT NULL,
	"reason_note" text,
	"evidence_count" integer,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "can_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"can_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"visited_at" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "skip_reason_code" varchar(40);--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN "condition" "can_condition" DEFAULT 'AKTIF' NOT NULL;--> statement-breakpoint
-- Backfill yang disetujui (01-fondasi §Migrasi): baris yang sebelumnya tidak dihitung
-- sebagai aktif tidak boleh masuk cakupan baru. `is_active = false` → DIKEMBALIKAN,
-- BUKAN NON_AKTIF, agar cakupan penempatan tidak melonjak saat migrasi.
UPDATE "cans" SET "condition" = 'DIKEMBALIKAN' WHERE "is_active" = false;--> statement-breakpoint
ALTER TABLE "can_condition_proposals" ADD CONSTRAINT "can_condition_proposals_can_id_cans_id_fk" FOREIGN KEY ("can_id") REFERENCES "public"."cans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_condition_proposals" ADD CONSTRAINT "can_condition_proposals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_visits" ADD CONSTRAINT "can_visits_can_id_cans_id_fk" FOREIGN KEY ("can_id") REFERENCES "public"."cans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_visits" ADD CONSTRAINT "can_visits_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "can_condition_proposals_can_idx" ON "can_condition_proposals" USING btree ("can_id","created_at");--> statement-breakpoint
CREATE INDEX "can_condition_proposals_status_idx" ON "can_condition_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "can_visits_can_visited_idx" ON "can_visits" USING btree ("can_id","visited_at");--> statement-breakpoint
CREATE INDEX "assignments_status_period_idx" ON "assignments" USING btree ("status","period_year","period_month");