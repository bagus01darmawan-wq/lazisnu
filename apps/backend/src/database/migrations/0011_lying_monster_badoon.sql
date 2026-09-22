CREATE TABLE "ppk_emergency_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"officer_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"amount" bigint NOT NULL,
	"reason" "variance_reason" NOT NULL,
	"witness_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"note" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ppk_emergency_aggregates" ADD CONSTRAINT "ppk_emergency_aggregates_officer_id_officers_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."officers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_emergency_aggregates" ADD CONSTRAINT "ppk_emergency_aggregates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_emergency_aggregates" ADD CONSTRAINT "ppk_emergency_aggregates_witness_user_id_users_id_fk" FOREIGN KEY ("witness_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppk_emergency_aggregates" ADD CONSTRAINT "ppk_emergency_aggregates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_officer_period_unq" ON "ppk_emergency_aggregates" USING btree ("officer_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "emergency_branch_period_idx" ON "ppk_emergency_aggregates" USING btree ("branch_id","period_year","period_month");