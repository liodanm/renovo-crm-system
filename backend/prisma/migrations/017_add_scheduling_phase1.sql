-- Scheduling Phase 1. appointments (already real, already used by the
-- Receptionist and Portal chat for estimate-visit bookings) becomes the
-- single scheduling backbone per the approved architecture — this
-- migration only adds what's genuinely missing, nothing duplicated.

BEGIN;

-- Arrival window override chain, exactly as specified: an appointment's
-- own value wins if set; otherwise the company's own default; otherwise
-- a hardcoded application constant (120 minutes) is the true last
-- resort, kept in application code rather than a second DB default so
-- there's exactly one place that number lives. Neither column is
-- hardcoded to a value — both start genuinely unset.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_arrival_window_minutes INTEGER;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS arrival_window_minutes INTEGER;

-- Search/filter needs to find appointments by customer name, technician,
-- or status quickly across a date range — the existing idx_appointments_range
-- already covers the range; this adds the status dimension calendar
-- filtering will use constantly.
CREATE INDEX IF NOT EXISTS idx_appointments_company_status_range
  ON appointments(company_id, status, starts_at);

COMMIT;
