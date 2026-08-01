BEGIN;

-- Service-specific details: a single JSONB column rather than a dozen
-- mostly-NULL columns for every possible service's unique attributes
-- (roof pitch means nothing for a driveway, oil-stain presence means
-- nothing for a roof). Validated per service_type at the application
-- layer (see dto/service-details/ — a discriminated DTO per service
-- type), not by the database — Postgres can check that this column IS
-- valid JSON, but not that a 'roof_soft_wash' row's JSON has the right
-- shape for roofs specifically. This is the same "stable key now, room
-- to grow later without a migration" principle already used for
-- service_type itself.
ALTER TABLE estimate_line_items
  ADD COLUMN service_details JSONB,
  ADD COLUMN estimated_labor_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_labor_hours >= 0),
  ADD COLUMN estimated_chemical_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_chemical_cost >= 0),
  ADD COLUMN estimated_equipment_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_equipment_cost >= 0),
  ADD COLUMN estimated_fuel_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_fuel_cost >= 0),
  ADD COLUMN estimated_misc_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (estimated_misc_cost >= 0),
  -- Stored, server-computed results (see estimate-profit.util.ts) — never
  -- written directly by a client request, same trust boundary as
  -- estimates.total_amount.
  ADD COLUMN estimated_profit NUMERIC(12,2),
  ADD COLUMN profit_margin_percent NUMERIC(5,2),
  -- The future-readiness piece the rate-override architecture actually
  -- depends on: without SOMEWHERE to record which employee is doing a
  -- line item's labor, "use their rate if assigned" has no way to ever
  -- be invoked. Nullable, unused today, zero UI — exactly the
  -- design-for-it-don't-build-it-yet pattern applied to service_type.
  ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- The employee-specific rate this whole architecture is designed around:
-- lives on users (not on estimate_line_items, not on a new table) because
-- an hourly rate is a property of the EMPLOYEE, not of any single line
-- item they might someday be assigned to. NULL means "this person has no
-- override — fall back to the company default," which is the correct
-- default state for every existing user today, and requires no data
-- backfill.
ALTER TABLE users
  ADD COLUMN hourly_labor_rate NUMERIC(10,2) CHECK (hourly_labor_rate IS NULL OR hourly_labor_rate >= 0);

-- The fallback rate every line item without an assigned (or rateless)
-- employee uses. Lives directly on companies rather than a dedicated
-- settings table — unlike automation_settings/receptionist_settings
-- (each backing a genuinely multi-field feature), this is one scalar
-- value with no natural home of its own yet.
ALTER TABLE companies
  ADD COLUMN default_labor_rate NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (default_labor_rate >= 0);

-- Profitability is real business-sensitive data — explicitly NOT for
-- customer eyes (the portal's estimate view is an entirely separate code
-- path and was never going to see this regardless), and per this
-- feature's own requirement, not for every staff role either. A real
-- permission, not a role-name check, consistent with how every other
-- access boundary in this app works — and specific enough that a
-- dispatcher (who already has estimates.write) does NOT get it, since
-- dispatcher's grant below is an explicit whitelist that doesn't include it.
INSERT INTO permissions (key, category, description) VALUES
  ('estimates.profitability', 'estimates', 'View estimated cost and profit margin on estimates')
ON CONFLICT (key) DO NOTHING;

-- owner and admin's existing grants (migration 001) were a snapshot at
-- that point in time — a permission created now doesn't retroactively
-- appear on roles whose grants were already inserted. Re-running the same
-- CROSS JOIN logic, scoped to just this one new permission, is what
-- actually gets it onto those two roles; every other existing role
-- (dispatcher, crew_lead, etc.) correctly does NOT receive it, since
-- their own grants list specific permission keys that this isn't part of.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'estimates.profitability'
ON CONFLICT DO NOTHING;

COMMIT;
