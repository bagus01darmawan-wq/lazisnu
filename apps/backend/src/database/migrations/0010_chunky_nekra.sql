CREATE TABLE "ba_pdf_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" varchar(10) NOT NULL,
	"submission_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"pdf_key" varchar(500),
	"pdf_hash" varchar(128),
	"content_hash" varchar(128) NOT NULL,
	"status" varchar(20) NOT NULL,
	"archived_at" timestamp DEFAULT now() NOT NULL,
	"archived_by" uuid,
	"reopen_reason" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD COLUMN "reopened_until" timestamp;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD COLUMN "reopened_until" timestamp;--> statement-breakpoint
ALTER TABLE "ba_pdf_archives" ADD CONSTRAINT "ba_pdf_archives_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ba_archive_tier_submission_version_unq" ON "ba_pdf_archives" USING btree ("tier","submission_id","version");--> statement-breakpoint
CREATE INDEX "ba_archive_submission_idx" ON "ba_pdf_archives" USING btree ("tier","submission_id");