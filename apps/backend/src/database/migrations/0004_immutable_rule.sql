-- PostgreSQL Rules for Immutable Koleksi (Lazisnu)
-- Mencegah DELETE dan UPDATE nominal pada tabel collections di level database.
-- Koreksi nominal harus melalui resubmit (INSERT baru dengan submit_sequence +1).

-- Rule 1: Prevent any DELETE on collections
CREATE OR REPLACE RULE disable_delete_koleksi AS 
ON DELETE TO collections 
DO INSTEAD NOTHING;

-- Rule 2: Prevent UPDATE on collections that change nominal directly
CREATE OR REPLACE RULE disable_update_nominal_koleksi AS 
ON UPDATE TO collections 
WHERE NEW.nominal <> OLD.nominal
DO INSTEAD NOTHING;
