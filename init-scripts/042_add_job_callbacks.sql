BEGIN;

-- Did not exist at all before this migration — confirmed directly
-- against schema.prisma during the reporting-foundation audit, the
-- cleanest, lowest-ambiguity gap found in that whole pass. Deliberately
-- small per the approval doc's explicit scope limit: identifies
-- return/rework work and its cost, nothing more — not a customer-
-- support ticketing system.
CREATE TABLE job_callbacks (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  original_job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  -- Optional: not every callback becomes its own schedulable Job record
  -- (some are resolved as a note on the same visit, or a quick
  -- unscheduled fix) — see the schema comment for the full reasoning.
  new_job_id                UUID REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id                UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reason                     TEXT NOT NULL CHECK (reason IN ('callback', 're_clean', 'warranty', 'complaint', 'customer_requested_return', 'internal_qc_return')),
  status                     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  resolution                 TEXT,
  -- Snapshotted dollar amounts — a callback's true cost is whatever it
  -- actually took to make right, never recomputed later. All nullable:
  -- a callback can exist (and be reported on for rate purposes) before
  -- its cost is known, and a callback resolved with no extra cost at
  -- all is a genuinely different, valid state from "cost not yet known."
  additional_labor_cost      NUMERIC(10,2) CHECK (additional_labor_cost IS NULL OR additional_labor_cost >= 0),
  additional_material_cost   NUMERIC(10,2) CHECK (additional_material_cost IS NULL OR additional_material_cost >= 0),
  refund_amount               NUMERIC(10,2) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  notes                       TEXT,
  created_by_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_callbacks_original_job_id ON job_callbacks(original_job_id);
CREATE INDEX idx_job_callbacks_customer_id ON job_callbacks(customer_id);
-- The Callback Rate query (Callback Jobs / Completed Jobs, grouped by
-- company and date range) filters on company_id + created_at together
-- far more often than either alone — matches the same composite-index
-- reasoning already applied to jobs/invoices/payments elsewhere in this
-- schema for their own date-range reporting queries.
CREATE INDEX idx_job_callbacks_company_created ON job_callbacks(company_id, created_at);

ALTER TABLE job_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_callbacks FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_callbacks' AND policyname = 'tenant_isolation_job_callbacks') THEN
    CREATE POLICY tenant_isolation_job_callbacks ON job_callbacks
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

INSERT INTO permissions (key, category, description) VALUES
  ('jobs.callbacks', 'jobs', 'Create and manage job callbacks/rework')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'jobs.callbacks'
ON CONFLICT DO NOTHING;

COMMIT;
