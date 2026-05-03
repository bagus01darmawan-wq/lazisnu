CREATE TABLE "dukuhs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "qr_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "owner_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "owner_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "owner_whatsapp" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "total_collected" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "cans" ALTER COLUMN "total_collected" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "total_amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "total_amount" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "cash_amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "cash_amount" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "transfer_amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "collection_summaries" ALTER COLUMN "transfer_amount" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN "dukuh_id" uuid;--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN "dukuh" varchar(100);--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN "rt" varchar(10);--> statement-breakpoint
ALTER TABLE "cans" ADD COLUMN "rw" varchar(10);--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "nominal" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "dukuhs" ADD CONSTRAINT "dukuhs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cans" ADD CONSTRAINT "cans_dukuh_id_dukuhs_id_fk" FOREIGN KEY ("dukuh_id") REFERENCES "public"."dukuhs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_offline_id_unique" UNIQUE("offline_id");