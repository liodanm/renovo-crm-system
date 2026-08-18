-- Owner-only permanent data deletion (Settings -> Data Management).
-- data_deletion_log deliberately has NO foreign key to the entity it
-- describes (entity_id is a plain UUID column) -- the whole point of
-- this table is to survive the deletion of the row it's about, so a
-- real FK (which would either block the delete or cascade the audit
-- record away with it) would defeat the purpose. company_id keeps a
-- real FK for RLS/tenant scoping, same as every other tenant-scoped
-- table in this schema.

BEGIN;

CREATE TABLE IF NOT EXISTS data_deletion_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  performed_by_user_id UUID REFERENCES users(id),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('estimate', 'job', 'invoice', 'payment')),
  entity_id       UUID NOT NULL,
  succeeded       BOOLEAN NOT NULL,
  error_message   TEXT,
  -- Free-form summary of what else was pulled in by this deletion (e.g.
  -- { "deletedInvoiceIds": [...], "deletedPaymentIds": [...],
  -- "deletedAppointmentIds": [...] }) -- not sensitive data, just record
  -- counts/ids of what else was removed, for later investigation.
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_log_company_id ON data_deletion_log(company_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_log_entity ON data_deletion_log(entity_type, entity_id);

ALTER TABLE data_deletion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_deletion_log FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'data_deletion_log' AND policyname = 'tenant_isolation_data_deletion_log') THEN
    CREATE POLICY tenant_isolation_data_deletion_log ON data_deletion_log
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

COMMIT;
