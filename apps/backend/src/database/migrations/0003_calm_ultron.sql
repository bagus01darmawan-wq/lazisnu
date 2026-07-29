DROP TABLE "sync_queues" CASCADE;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_id" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fcm_token" varchar(255);