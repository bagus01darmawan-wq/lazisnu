-- Migration: 0004_reapply_collection_immutable_rule.sql
-- Goal: forward-only repair for databases that already applied 0002 before the
-- immutable UPDATE rule was expanded beyond nominal.
--
-- Do not rely on edits to 0002 for staging/production: applied migrations are
-- not re-run, so this migration explicitly re-applies the stronger rule.

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
