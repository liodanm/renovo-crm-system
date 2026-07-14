-- Customer Portal additions on top of renovo_crm_schema.sql + the modules
-- that followed it. Run after 003_add_receptionist.sql.

BEGIN;

-- Estimates: customer-portal approval needs a real signature — accepted_at
-- and declined_at already exist on this table from the base schema, reused
-- as-is rather than adding redundant approved_at/declined_at columns.
ALTER TABLE estimates ADD COLUMN signature_data_url TEXT;

-- Payments: stripe_payment_intent_id already exists on this table from the
-- base schema (with its own index) — reused as-is.

-- Service requests — a customer asking for new/recurring work, distinct
-- from a staff-created estimate: it starts as an unscoped request and a
-- human converts it into a real Estimate/Job, same human-in-the-loop
-- pattern as every other customer-initiated or AI-initiated action in
-- this system.
CREATE TABLE service_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id           UUID REFERENCES properties(id) ON DELETE SET NULL,
  description           TEXT NOT NULL,
  requested_service_type TEXT,
  is_recurring           BOOLEAN NOT NULL DEFAULT false,
  recurring_frequency    TEXT CHECK (recurring_frequency IN ('weekly', 'biweekly', 'monthly', NULL)),
  preferred_dates        TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'converted', 'declined')),
  converted_estimate_id  UUID REFERENCES estimates(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_requests_company_id ON service_requests(company_id, status);
CREATE INDEX idx_service_requests_customer_id ON service_requests(customer_id);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_service_requests ON service_requests
  USING (company_id = current_setting('app.current_company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);

COMMIT;
