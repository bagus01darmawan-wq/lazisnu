ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "offline_payload_hash" varchar(64);
