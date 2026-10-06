CREATE TABLE "ba_counters" (
	"scope_type" varchar(10) NOT NULL,
	"scope_id" uuid NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branch_submissions" ADD COLUMN "ba_number" varchar(40);--> statement-breakpoint
ALTER TABLE "ppk_submissions" ADD COLUMN "ba_number" varchar(40);--> statement-breakpoint
CREATE UNIQUE INDEX "ba_counter_scope_unq" ON "ba_counters" USING btree ("scope_type","scope_id");