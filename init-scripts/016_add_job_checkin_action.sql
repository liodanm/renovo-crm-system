-- Adds the one new action type "Check In" needs. Reuses job_audit_log
-- (built in migration 015) rather than a new table or column — a
-- check-in is exactly "an actor did something, at a place, at a time,"
-- which is precisely what that table already models.

BEGIN;

ALTER TABLE job_audit_log DROP CONSTRAINT IF EXISTS job_audit_log_action_type_check;
ALTER TABLE job_audit_log ADD CONSTRAINT job_audit_log_action_type_check
  CHECK (action_type IN (
    'photo_added', 'photo_deleted',
    'chemical_added', 'chemical_updated', 'chemical_removed',
    'equipment_added', 'equipment_removed',
    'signature_captured', 'completion_notes_updated',
    'location_checkin'
  ));

COMMIT;
