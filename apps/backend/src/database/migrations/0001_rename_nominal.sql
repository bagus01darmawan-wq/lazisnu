-- Migration: 0001_rename_nominal.sql
-- Goal: Rename amount to nominal, change types to bigint, and add PostgreSQL RULES.

-- Change collections.amount to collections.nominal (BIGINT)
ALTER TABLE "collections" RENAME COLUMN "amount" TO "nominal";
ALTER TABLE "collections" ALTER COLUMN "nominal" TYPE bigint USING "nominal"::bigint;

-- Change cans.total_collected to BIGINT
ALTER TABLE "cans" ALTER COLUMN "total_collected" TYPE bigint USING "total_collected"::bigint;

-- Change collection_summaries fields to BIGINT
ALTER TABLE "collection_summaries" ALTER COLUMN "total_amount" TYPE bigint USING "total_amount"::bigint;
ALTER TABLE "collection_summaries" ALTER COLUMN "cash_amount" TYPE bigint USING "cash_amount"::bigint;
ALTER TABLE "collection_summaries" ALTER COLUMN "transfer_amount" TYPE bigint USING "transfer_amount"::bigint;

-- PostgreSQL Rules for Immutable Koleksi (Lazisnu)
-- Prevent DELETE
CREATE OR REPLACE RULE disable_delete_koleksi AS 
ON DELETE TO collections 
DO INSTEAD NOTHING;

-- Prevent UPDATE on nominal
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS 
ON UPDATE TO collections 
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
