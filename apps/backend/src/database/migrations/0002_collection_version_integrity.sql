-- Migration: 0002_collection_version_integrity.sql
-- Goal: enforce immutable collection versioning using submit_sequence as latest source.

-- Latest collection is defined as MAX(submit_sequence) per assignment_id + can_id.
COMMENT ON COLUMN "collections"."submit_sequence" IS
  'Immutable version number. Latest collection is MAX(submit_sequence) per assignment_id + can_id.';

-- Prevent duplicate first-submit/resubmit sequence rows, including race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS "collection_assignment_can_sequence_unq"
ON "collections" ("assignment_id", "can_id", "submit_sequence");

-- Re-apply immutable transaction rule using current column names after amount -> nominal rename.
-- Re-submit corrections must INSERT a new version row. UPDATE is only allowed for legacy
-- versioning flags that are not part of the immutable financial transaction payload.
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS
ON UPDATE TO collections
WHERE
  NEW.id IS DISTINCT FROM OLD.id OR
  NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR
  NEW.can_id IS DISTINCT FROM OLD.can_id OR
  NEW.officer_id IS DISTINCT FROM OLD.officer_id OR
  NEW.nominal IS DISTINCT FROM OLD.nominal OR
  NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
  NEW.transfer_receipt_url IS DISTINCT FROM OLD.transfer_receipt_url OR
  NEW.collected_at IS DISTINCT FROM OLD.collected_at OR
  NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR
  NEW.synced_at IS DISTINCT FROM OLD.synced_at OR
  NEW.sync_status IS DISTINCT FROM OLD.sync_status OR
  NEW.server_timestamp IS DISTINCT FROM OLD.server_timestamp OR
  to_jsonb(NEW.device_info) IS DISTINCT FROM to_jsonb(OLD.device_info) OR
  NEW.latitude IS DISTINCT FROM OLD.latitude OR
  NEW.longitude IS DISTINCT FROM OLD.longitude OR
  NEW.offline_id IS DISTINCT FROM OLD.offline_id OR
  NEW.submit_sequence IS DISTINCT FROM OLD.submit_sequence OR
  NEW.alasan_resubmit IS DISTINCT FROM OLD.alasan_resubmit OR
  NEW.created_at IS DISTINCT FROM OLD.created_at OR
  NEW.updated_at IS DISTINCT FROM OLD.updated_at
DO INSTEAD NOTHING;
