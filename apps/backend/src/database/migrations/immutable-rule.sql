-- PostgreSQL Rules for Immutable Koleksi (Lazisnu)
-- This file prevents direct DELETE and enforces constraints on UPDATE for the collections table.

-- Rule 1: Prevent any DELETE on collections
CREATE OR REPLACE RULE disable_delete_koleksi AS 
ON DELETE TO collections 
DO INSTEAD NOTHING;

-- Rule 2: Prevent UPDATE on collections that change nominal directly
-- Re-submit corrections must INSERT a new row; latest is MAX(submit_sequence).
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS 
ON UPDATE TO collections 
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
