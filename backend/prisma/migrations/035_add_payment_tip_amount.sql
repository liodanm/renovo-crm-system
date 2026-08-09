-- Adds an optional tip amount to manually-recorded offline payments
-- (cash/check/Zelle/other). Deliberately a separate column from
-- `amount`, never combined with it — `amount` continues to mean
-- exactly what it already means everywhere it's used today (invoice
-- balance/status, Customer LTV, dashboard/reports revenue), so every
-- one of those calculations is correct with zero changes, by
-- construction, not because new exclusion logic was added anywhere.

BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (tip_amount >= 0);

COMMIT;
