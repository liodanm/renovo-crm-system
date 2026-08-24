-- General-purpose Calendar Items reuse the existing appointments table
-- rather than a second calendar/event system — job_id, estimate_id,
-- customer_id, and property_id are already all nullable, so an
-- appointment with none of them was already a representable state; it
-- just wasn't reachable from any UI path. This migration only widens
-- what already exists: more appointment_type values, plus two fields
-- (location, notes) appointments never had at all.
--
-- Widening the CHECK constraint (drop + re-add with a superset of the
-- original values) is non-destructive: every existing row's
-- appointment_type ('job', 'estimate_visit', 'consultation',
-- 'follow_up') remains valid under the new constraint unchanged.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type IN (
    'job', 'estimate_visit', 'consultation', 'follow_up',
    'customer_meeting', 'property_inspection', 'job_check', 'pickup_delivery', 'other'
  ));

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN appointments.location IS
  'Free-text location for general Calendar Items not tied to a customer property (e.g. "meet at the job site", a supplier address for pickup/delivery). When a property_id is set, the property''s own address is typically shown instead; this is the fallback for when there is no property to point to.';
COMMENT ON COLUMN appointments.notes IS
  'Free-text notes for the appointment, e.g. "customer wants an estimate for roof cleaning." Independent of job_line_items/estimate notes — this is about the appointment itself, not the work.';
