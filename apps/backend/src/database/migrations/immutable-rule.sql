-- PostgreSQL Rules for Immutable Koleksi (Lazisnu)
-- This file prevents direct DELETE and enforces constraints on UPDATE for the collections table.

-- Rule 1: Prevent any DELETE on collections
CREATE OR REPLACE RULE disable_delete_koleksi AS 
ON DELETE TO collections 
DO INSTEAD NOTHING;

-- Rule 2: Prevent UPDATE on collections that change nominal/amount directly
-- (Only allows updates to is_latest to false, sync_status, etc)
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS 
ON UPDATE TO collections 
WHERE NEW.amount <> OLD.amount
DO INSTEAD NOTHING;
