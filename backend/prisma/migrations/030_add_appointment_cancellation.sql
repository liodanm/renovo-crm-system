-- Two additive changes, both needed for appointment cancellation:
--
-- 1. appointments has no free-text field to store why an appointment was
--    cancelled — nothing to reuse, so a new nullable column is required.
--
-- 2. appointment_status_history didn't exist at all. job_status_history,
--    payment_status_history, and estimate_status_history all already
--    exist with an identical shape (id, company_id, <entity>_id,
--    from_status, to_status, changed_by_user_id, note, changed_at) —
--    mirrored exactly here, same as payment_status_history's own
--    migration comment says it mirrors job_status_history. Not inventing
--    a new pattern.

BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id     UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status        TEXT,
  to_status          TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  note               TEXT,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_status_history_appointment_id ON appointment_status_history(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_status_history_company_id ON appointment_status_history(company_id);

ALTER TABLE appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_status_history FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'appointment_status_history' AND policyname = 'tenant_isolation_appointment_status_history') THEN
    CREATE POLICY tenant_isolation_appointment_status_history ON appointment_status_history
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

COMMIT;
