CREATE TYPE "public"."branch_kind" AS ENUM('RANTING', 'PROGRAM_MWC');--> statement-breakpoint
CREATE TYPE "public"."branch_submission_status" AS ENUM('DRAFT', 'FINAL', 'FINAL_NOL');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('OPEN', 'TOLERANCE', 'LOCKED', 'DIBUKA_SEBAGIAN');--> statement-breakpoint
CREATE TYPE "public"."ppk_submission_status" AS ENUM('DRAFT', 'PPK_SIGNED', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."variance_reason" AS ENUM('KURANG_BAYAR', 'LEBIH_BAYAR', 'GABUNG_PERIODE', 'KOREKSI_ADMIN', 'HP_HILANG');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'STAF_PENGUMPULAN';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'STAF_KEUANGAN';--> statement-breakpoint
CREATE TABLE "branch_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"district_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"bisyaroh_total" bigint DEFAULT 0 NOT NULL,
	"share_mwc" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"expected_share" bigint DEFAULT 0 NOT NULL,
	"share_variance" bigint DEFAULT 0 NOT NULL,
	"variance_reason" "variance_reason",
	"linked_periods" json,
	"collection_count" integer DEFAULT 0 NOT NULL,
	"can_total" integer DEFAULT 0 NOT NULL,
	"can_aktif" integer DEFAULT 0 NOT NULL,
	"can_nonaktif" integer DEFAULT 0 NOT NULL,
	"can_rusak" integer DEFAULT 0 NOT NULL,
	"can_hilang" integer DEFAULT 0 NOT NULL,
	"can_dikembalikan" integer DEFAULT 0 NOT NULL,
	"formula_snapshot" json,
	"status" "branch_submission_status" DEFAULT 'DRAFT' NOT NULL,
	"finalized_at" timestamp,
	"finalized_by" uuid,
	"ranting_signer_id" uuid,
	"ranting_signed_at" timestamp,
	"ranting_signature_url" varchar(500),
	"mwc_bendahara_signer_id" uuid,
	"mwc_bendahara_signed_at" timestamp,
	"mwc_bendahara_signature_url" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"pdf_url" varchar(500),
	"pdf_hash" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"assign_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"tolerance_end" timestamp NOT NULL,
	"status" "period_status" DEFAULT 'OPEN' NOT NULL,
	"locked_at" timestamp,
	"locked_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppk_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"officer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"collection_count" integer DEFAULT 0 NOT NULL,
	"bisyaroh_amount" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint DEFAULT 0 NOT NULL,
	"formula_snapshot" json,
	"status" "ppk_submission_status" DEFAULT 'DRAFT' NOT NULL,
	"finalized_at" timestamp,
	"finalized_by" uuid,
	"ppk_signer_id" uuid,
	"ppk_signed_at" timestamp,
	"ppk_signature_url" varchar(500),
	"bendahara_signer_id" uuid,
	"bendahara_signed_at" timestamp,
	"bendahara_signature_url" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"pdf_url" varchar(500),
	"pdf_hash" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "kind" "branch_kind" DEFAULT 'RANTING' NOT NULL;--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_submissions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_submissions_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_submissions_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_submissions_ranting_signer_id_users_id_fk" FOREIGN KEY ("ranting_signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_submissions_mwc_bendahara_signer_id_users_id_fk" FOREIGN KEY ("mwc_bendahara_signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_calendar" ADD CONSTRAINT "period_calendar_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_submissions_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_submissions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_submissions_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_submissions_ppk_signer_id_users_id_fk" FOREIGN KEY ("ppk_signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_submissions_bendahara_signer_id_users_id_fk" FOREIGN KEY ("bendahara_signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_period_unq" ON "branch_submissions" USING btree ("branch_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "branch_district_period_status_idx" ON "branch_submissions" USING btree ("district_id","period_year","period_month","status");--> statement-breakpoint
CREATE UNIQUE INDEX "period_calendar_year_month_unq" ON "period_calendar" USING btree ("period_year","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "ppk_officer_period_unq" ON "ppk_submissions" USING btree ("officer_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "ppk_branch_period_status_idx" ON "ppk_submissions" USING btree ("branch_id","period_year","period_month","status");--> statement-breakpoint
-- C1-T0 §14.6/C-3: dua TTD wajib beda orang (PPK vs bendahara; ranting vs bendahara MWC).
-- Dicek aplikasi + CHECK DB agar tak bisa dilewati dari SQL langsung.
ALTER TABLE "ppk_submissions" ADD CONSTRAINT "ppk_signers_different_chk" CHECK ("ppk_signer_id" IS NULL OR "bendahara_signer_id" IS NULL OR "ppk_signer_id" <> "bendahara_signer_id");--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD CONSTRAINT "branch_signers_different_chk" CHECK ("ranting_signer_id" IS NULL OR "mwc_bendahara_signer_id" IS NULL OR "ranting_signer_id" <> "mwc_bendahara_signer_id");--> statement-breakpoint
-- C1-T0 §8b: filter laporan RANTING vs Program MWC butuh index kind.
CREATE INDEX "branches_kind_idx" ON "branches" USING btree ("kind");--> statement-breakpoint
-- C1-T0 §8b opsi 1: backfill Koin Taqwa (program MWC langsung, bukan ranting).
-- Idempoten: bila baris Taqwa belum ada (mis. seed dev), UPDATE = 0 baris, aman.
-- Kolom kind sudah DEFAULT 'RANTING' sehingga data lama otomatis jadi ranting.
UPDATE "branches" SET "kind" = 'PROGRAM_MWC' WHERE lower("name") LIKE '%taqwa%' OR lower("code") LIKE '%taqwa%';