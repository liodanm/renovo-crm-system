BEGIN;

-- The "chemical/product master" the reporting audit asked for — a
-- maintained, per-company reference of current cost-per-unit. Its own
-- table (not a companies.settings JSONB key like leadSources) because
-- this is genuinely structured, queryable data with a natural identity
-- (name + unit), and future rows will regularly be looked up by that
-- identity from job_chemical_usage inserts, which JSONB doesn't serve
-- well. Deliberately minimal: no history of its own — the CURRENT rate
-- only. History lives in job_chemical_usage.unit_cost_snapshot below,
-- one per usage record, which is where it actually needs to live.
CREATE TABLE chemical_cost_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chemical_name  TEXT NOT NULL,
  unit           TEXT NOT NULL,
  cost_per_unit  NUMERIC(10,4) NOT NULL CHECK (cost_per_unit >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, chemical_name, unit)
);

ALTER TABLE chemical_cost_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemical_cost_rates FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chemical_cost_rates' AND policyname = 'tenant_isolation_chemical_cost_rates') THEN
    CREATE POLICY tenant_isolation_chemical_cost_rates ON chemical_cost_rates
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- The snapshot half of "Quantity Used x Cost Per Unit = Actual Chemical
-- Cost" — captured once, at the moment a usage record is created, from
-- whatever chemical_cost_rates row matches (chemical_name, unit) for
-- that company AT THAT TIME. Deliberately never recalculated if the
-- master rate later changes: if sodium hypochlorite costs $2.10/gallon
-- today and $2.40/gallon six months from now, a job recorded today keeps
-- $2.10 forever. Both columns are nullable and BOTH null (not 0) when no
-- matching cost rate exists yet for that chemical/unit at record time —
-- never fabricated by defaulting to $0, which would silently understate
-- real cost in every report built on this data.
ALTER TABLE job_chemical_usage
  ADD COLUMN unit_cost_snapshot NUMERIC(10,4) CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
  ADD COLUMN total_cost NUMERIC(10,2) CHECK (total_cost IS NULL OR total_cost >= 0);

COMMIT;
