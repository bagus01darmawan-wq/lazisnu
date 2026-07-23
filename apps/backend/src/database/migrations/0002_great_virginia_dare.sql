ALTER TYPE "public"."assignment_status" ADD VALUE 'UNCOLLECTED';--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jti" varchar(255) NOT NULL,
	"device_label" varchar(100),
	"user_agent" text,
	"ip_address" varchar(45),
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "user_sessions_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "request_id" varchar(100);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_assignment_can_sequence_unq" ON "collections" USING btree ("assignment_id","can_id","submit_sequence");--> statement-breakpoint
CREATE INDEX "collections_officer_status_collected_idx" ON "collections" USING btree ("officer_id","sync_status","collected_at");--> statement-breakpoint
ALTER TABLE "collection_summaries" DROP COLUMN "cash_count";--> statement-breakpoint
ALTER TABLE "collection_summaries" DROP COLUMN "cash_amount";--> statement-breakpoint
ALTER TABLE "collection_summaries" DROP COLUMN "transfer_count";--> statement-breakpoint
ALTER TABLE "collection_summaries" DROP COLUMN "transfer_amount";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "payment_method";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "transfer_receipt_url";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "is_latest";--> statement-breakpoint
DROP TYPE "public"."payment_method";