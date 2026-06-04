-- Migration: 0003_collection_query_indexes.sql
-- Goal: speed up common collection history/recent queries by officer and sync status.

CREATE INDEX IF NOT EXISTS "collections_officer_status_collected_idx"
ON "collections" ("officer_id", "sync_status", "collected_at" DESC);
