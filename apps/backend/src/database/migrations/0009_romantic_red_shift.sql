CREATE TYPE "public"."draft_status" AS ENUM('DRAFT', 'APPROVED');--> statement-breakpoint
CREATE TABLE "period_draft_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"can_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"backup_officer_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"branch_id" uuid NOT NULL,
	"district_id" uuid NOT NULL,
	"status" "draft_status" DEFAULT 'DRAFT' NOT NULL,
	"prepared_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" uuid,
	"approved_by_role" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "period_draft_items" ADD CONSTRAINT "period_draft_items_draft_id_period_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."period_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_draft_items" ADD CONSTRAINT "period_draft_items_can_id_cans_id_fk" FOREIGN KEY ("can_id") REFERENCES "public"."cans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_draft_items" ADD CONSTRAINT "period_draft_items_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_draft_items" ADD CONSTRAINT "period_draft_items_backup_officer_id_officers_id_fk" FOREIGN KEY ("backup_officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_drafts" ADD CONSTRAINT "period_drafts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_drafts" ADD CONSTRAINT "period_drafts_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_drafts" ADD CONSTRAINT "period_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "period_draft_item_draft_can_unq" ON "period_draft_items" USING btree ("draft_id","can_id");--> statement-breakpoint
CREATE INDEX "period_draft_items_draft_idx" ON "period_draft_items" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "period_draft_period_branch_unq" ON "period_drafts" USING btree ("period_year","period_month","branch_id");--> statement-breakpoint
CREATE INDEX "period_drafts_district_period_status_idx" ON "period_drafts" USING btree ("district_id","period_year","period_month","status");