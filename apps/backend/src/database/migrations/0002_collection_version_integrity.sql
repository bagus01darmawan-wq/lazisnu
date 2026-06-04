-- Migration: 0002_collection_version_integrity.sql
-- Goal: enforce immutable collection versioning using submit_sequence as latest source.

-- Latest collection is defined as MAX(submit_sequence) per assignment_id + can_id.
COMMENT ON COLUMN "collections"."submit_sequence" IS
  'Immutable version number. Latest collection is MAX(submit_sequence) per assignment_id + can_id.';

-- Prevent duplicate first-submit/resubmit sequence rows, including race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS "collection_assignment_can_sequence_unq"
ON "collections" ("assignment_id", "can_id", "submit_sequence");

-- Re-apply immutable nominal rule using the current column name after amount -> nominal rename.
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS
ON UPDATE TO collections
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
