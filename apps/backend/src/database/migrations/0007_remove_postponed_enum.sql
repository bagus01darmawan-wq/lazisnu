ALTER TABLE "assignments" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::text;--> statement-breakpoint
DROP TYPE "public"."assignment_status";--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('ACTIVE', 'COMPLETED', 'REASSIGNED', 'UNCOLLECTED');--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignments" ALTER COLUMN "status" SET DATA TYPE "public"."assignment_status" USING "status"::"public"."assignment_status";