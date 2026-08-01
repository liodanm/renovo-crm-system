-- Stabilization sprint: infrastructure cleanup found during a full
-- architecture audit. Small, additive, no behavior change — fixes a
-- genuine missing index found by checking every existing index against
-- every foreign key column, not assumed.

BEGIN;

-- invoices.job_id and invoices.property_id were both indexed when added;
-- invoices.estimate_id (present since the original base schema) never
-- was — a real gap, not a new column.
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON invoices(estimate_id);

COMMIT;
