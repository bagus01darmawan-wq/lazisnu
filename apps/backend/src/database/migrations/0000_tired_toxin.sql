CREATE TYPE "public"."assignment_status" AS ENUM('ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA', 'PETUGAS');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"officer_id" uuid,
	"action_type" varchar(50) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"old_data" json,
	"new_data" json,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"can_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"backup_officer_id" uuid,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"status" "assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qr_code" varchar(50) NOT NULL,
	"branch_id" uuid NOT NULL,
	"owner_name" varchar(100) NOT NULL,
	"owner_phone" varchar(20) NOT NULL,
	"owner_address" text NOT NULL,
	"owner_whatsapp" varchar(20),
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"location_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_collected_at" timestamp,
	"total_collected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"collection_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cans_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "collection_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"district_id" uuid,
	"branch_id" uuid,
	"officer_id" uuid,
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"collection_count" integer DEFAULT 0 NOT NULL,
	"cash_count" integer DEFAULT 0 NOT NULL,
	"cash_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"transfer_count" integer DEFAULT 0 NOT NULL,
	"transfer_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"can_id" uuid NOT NULL,
	"officer_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"transfer_receipt_url" varchar(500),
	"collected_at" timestamp NOT NULL,
	"submitted_at" timestamp,
	"synced_at" timestamp,
	"sync_status" "collection_status" DEFAULT 'PENDING' NOT NULL,
	"server_timestamp" timestamp,
	"device_info" json,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"offline_id" varchar(100),
	"is_latest" boolean DEFAULT true NOT NULL,
	"submit_sequence" integer DEFAULT 1 NOT NULL,
	"alasan_resubmit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"region_code" varchar(5) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "districts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid,
	"recipient_phone" varchar(20) NOT NULL,
	"recipient_name" varchar(100),
	"message_template" varchar(50),
	"message_content" text NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp,
	"error_message" text,
	"wa_message_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "officers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_code" varchar(20) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"photo_url" varchar(500),
	"district_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"assigned_zone" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "officers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "officers_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "officers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "sync_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"officer_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_data" json NOT NULL,
	"local_id" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"role" "user_role" NOT NULL,
	"district_id" uuid,
	"branch_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_can_id_cans_id_fk" FOREIGN KEY ("can_id") REFERENCES "public"."cans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_backup_officer_id_officers_id_fk" FOREIGN KEY ("backup_officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cans" ADD CONSTRAINT "cans_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_summaries" ADD CONSTRAINT "collection_summaries_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_summaries" ADD CONSTRAINT "collection_summaries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_summaries" ADD CONSTRAINT "collection_summaries_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_can_id_cans_id_fk" FOREIGN KEY ("can_id") REFERENCES "public"."cans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officers" ADD CONSTRAINT "officers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officers" ADD CONSTRAINT "officers_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "officers" ADD CONSTRAINT "officers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_queues" ADD CONSTRAINT "sync_queues_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "can_officer_period_unq" ON "assignments" USING btree ("can_id","officer_id","period_year","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "summary_period_dist_br_off_unq" ON "collection_summaries" USING btree ("period_year","period_month","district_id","branch_id","officer_id");