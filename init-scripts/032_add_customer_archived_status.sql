-- Customer Status Workflow (Feature 3) requires 'archived' as a real,
-- storable relationship state alongside the existing lead/active/
-- inactive/churned. This constraint has existed since the original base
-- schema (init-scripts/00-schema.sql, inline on the column definition,
-- not a later migration) — found only by testing the approved
-- architecture against a real database, which silently rejected
-- 'archived' even though it was explicitly part of the approved design.
-- Replaced, not added alongside: no existing customer currently has (or
-- could have had) 'archived' as a value, since the database has never
-- allowed it — there's no data to preserve through this change.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_lead_status_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_lead_status_check
  CHECK (lead_status IN ('lead', 'active', 'inactive', 'archived', 'churned'));
