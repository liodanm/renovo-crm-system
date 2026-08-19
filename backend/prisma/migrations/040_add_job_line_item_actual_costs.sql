BEGIN;

-- The core fix from the reporting-foundation audit: EstimateLineItem has
-- had full cost/profit tracking since migration 010 (estimated_labor_
-- hours, estimated_chemical_cost, estimated_equipment_cost, estimated_
-- fuel_cost, estimated_misc_cost, estimated_profit, profit_margin_
-- percent, assigned_user_id) — JobLineItem had none of it. The only
-- "profit" figure the app has ever shown anywhere (getMonthlyProfitTrend
-- in reports.service.ts) is frozen at estimate-acceptance time and never
-- reflects anything that happens after that. This closes that gap with
-- the job-side equivalent of the exact same architecture, not a new one.
--
-- Deliberately ALL NULLABLE, with NO default-0 and NO backfill from the
-- corresponding estimated_* value: at the moment a job is created from
-- an accepted estimate, no actual work has happened yet, so there is no
-- real "actual cost" to record — copying the estimate's number in here
-- and labeling it "actual" would misrepresent projected cost as real
-- cost, which the reporting-foundation audit explicitly called out as
-- something never to do. NULL means "not recorded yet"; a future report
-- must treat NULL and 0 as different, meaningful states — never coalesce
-- one into the other.
ALTER TABLE job_line_items
  ADD COLUMN actual_labor_hours NUMERIC(10,2) CHECK (actual_labor_hours IS NULL OR actual_labor_hours >= 0),
  ADD COLUMN actual_chemical_cost NUMERIC(10,2) CHECK (actual_chemical_cost IS NULL OR actual_chemical_cost >= 0),
  ADD COLUMN actual_equipment_cost NUMERIC(10,2) CHECK (actual_equipment_cost IS NULL OR actual_equipment_cost >= 0),
  ADD COLUMN actual_fuel_cost NUMERIC(10,2) CHECK (actual_fuel_cost IS NULL OR actual_fuel_cost >= 0),
  ADD COLUMN actual_misc_cost NUMERIC(10,2) CHECK (actual_misc_cost IS NULL OR actual_misc_cost >= 0),
  -- Stored, server-computed (see job-profit.util.ts) — never written
  -- directly by a client request, same trust boundary as
  -- estimate_line_items.estimated_profit.
  ADD COLUMN actual_profit NUMERIC(12,2),
  ADD COLUMN actual_profit_margin_percent NUMERIC(5,2),
  -- Mirrors estimate_line_items.assigned_user_id exactly — reuses
  -- resolveLaborRate() from estimate-profit.util.ts as-is, no second
  -- rate-resolution implementation.
  ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Same access-boundary pattern as estimates.profitability (migration
-- 010): business-sensitive cost/profit data, never customer-visible,
-- and gated behind its own permission rather than piggybacking on
-- jobs.write, so a role that can update job details doesn't
-- automatically see job-level cost and margin.
INSERT INTO permissions (key, category, description) VALUES
  ('jobs.profitability', 'jobs', 'View actual cost and profit margin on jobs')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'jobs.profitability'
ON CONFLICT DO NOTHING;

COMMIT;
