-- Payments completes the financial workflow on top of the payments
-- table that already existed in the original base schema — extending
-- its vocabulary and filling real gaps, not replacing it.

BEGIN;

-- Zelle and Void were both real requirements the original method/status
-- vocabularies didn't cover yet.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('card', 'ach', 'cash', 'check', 'zelle', 'other'));

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'void'));

ALTER TABLE payments
  -- Denormalized from the invoice at recording time, same reasoning as
  -- every other module here (Jobs/Estimates/Invoices all carry
  -- property_id directly rather than forcing a join for something this
  -- commonly displayed).
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id),
  -- Check number, Zelle confirmation, ACH trace number, etc. — a real,
  -- distinct field from any internal ID.
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  -- Distinct from processed_at (a system/processor timestamp) — the
  -- date the business considers the payment to have happened, which
  -- for cash/check is often entered a day or more after the fact.
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  -- Stored, sequential, and stable — the same reasoning as
  -- invoice_number: generated once at creation, never recomputed, so a
  -- receipt reference never silently changes later.
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_property_id ON payments(property_id);

-- Track every status transition (recorded -> void, succeeded -> refunded,
-- etc.) — a payment's current status alone can't answer "who voided
-- this and why," which real accounting needs to be able to answer.
-- Mirrors job_status_history's shape exactly rather than inventing a
-- new one.
CREATE TABLE IF NOT EXISTS payment_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payment_id         UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  from_status        TEXT,
  to_status          TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  note               TEXT,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_status_history_payment_id ON payment_status_history(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_history_company_id ON payment_status_history(company_id);

ALTER TABLE payment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_status_history FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_status_history' AND policyname = 'tenant_isolation_payment_status_history') THEN
    CREATE POLICY tenant_isolation_payment_status_history ON payment_status_history
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

COMMIT;
