-- Remove the discontinued payment-method feature from the development schema.
-- This migration is forward-only and intentionally does not mutate collection rows.

ALTER TABLE "collection_summaries" DROP COLUMN IF EXISTS "cash_count";
ALTER TABLE "collection_summaries" DROP COLUMN IF EXISTS "cash_amount";
ALTER TABLE "collection_summaries" DROP COLUMN IF EXISTS "transfer_count";
ALTER TABLE "collection_summaries" DROP COLUMN IF EXISTS "transfer_amount";

ALTER TABLE "collections" DROP COLUMN IF EXISTS "transfer_receipt_url";
ALTER TABLE "collections" DROP COLUMN IF EXISTS "payment_method";

DROP TYPE IF EXISTS "public"."payment_method";