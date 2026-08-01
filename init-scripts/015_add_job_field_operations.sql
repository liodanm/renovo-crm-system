-- Phase 2 of the Job Management module: Field Operations + Completion.
-- Continues on existing architecture rather than duplicating it — see
-- notes below on exactly what's reused vs. genuinely new.

BEGIN;

-- ---------------------------------------------------------------------
-- Photos: the `photos` table already exists with job_id and a
-- photo_type CHECK that already includes before/during/after/damage/
-- equipment — built in the original schema, reused as-is here. The one
-- real gap is captions, which the table never had.
-- ---------------------------------------------------------------------
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- ---------------------------------------------------------------------
-- GPS: tied to the existing actual_start/actual_end timestamps rather
-- than introducing separate "checkin/checkout" timestamp columns — the
-- job already records exactly when Start and Complete happened; this
-- just adds where.
-- ---------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS start_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS start_longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS end_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS end_longitude NUMERIC(10, 7),

  -- Completion fields
  ADD COLUMN IF NOT EXISTS customer_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_unavailable_reason TEXT CHECK (
    signature_unavailable_reason IN ('customer_not_home', 'commercial_property', 'signature_declined')
  ),
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  -- Reuses the same service_type vocabulary as estimate_line_items /
  -- job_line_items (validated at the application layer, same pattern as
  -- service_details elsewhere in this schema) rather than inventing a
  -- separate list — a recommendation is meant to become a future
  -- estimate line item, so it has to speak the same vocabulary.
  ADD COLUMN IF NOT EXISTS recommended_future_services TEXT[];

-- job_status_history (Phase 1) already tracks Started/Paused/Resumed/
-- Completed with a from_status/to_status shape. GPS on those specific
-- transitions belongs there, not duplicated into a new table.
ALTER TABLE job_status_history
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);

-- ---------------------------------------------------------------------
-- Chemical usage: free-text name + quantity today. Deliberately no FK
-- to an inventory table, since none exists yet — the future path is
-- additive (a future migration adds a nullable chemical_inventory_id
-- column alongside chemical_name, the same pattern already proven by
-- jobs.assigned_user_id sitting next to assigned_crew_id), not a
-- redesign of this table.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_chemical_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  chemical_name     TEXT NOT NULL,
  quantity          NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit              TEXT NOT NULL CHECK (unit IN ('oz', 'gallons', 'liters', 'ml', 'lbs', 'kg')),
  notes             TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_chemical_usage_job_id ON job_chemical_usage(job_id);
CREATE INDEX IF NOT EXISTS idx_job_chemical_usage_company_id ON job_chemical_usage(company_id);

ALTER TABLE job_chemical_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_chemical_usage FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_chemical_usage' AND policyname = 'tenant_isolation_job_chemical_usage') THEN
    CREATE POLICY tenant_isolation_job_chemical_usage ON job_chemical_usage
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Equipment used: same reasoning as chemical usage — free-text today,
-- additive path to a real Equipment Inventory module later.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_equipment_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  equipment_name    TEXT NOT NULL,
  notes             TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_equipment_usage_job_id ON job_equipment_usage(job_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_usage_company_id ON job_equipment_usage(company_id);

ALTER TABLE job_equipment_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_equipment_usage FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_equipment_usage' AND policyname = 'tenant_isolation_job_equipment_usage') THEN
    CREATE POLICY tenant_isolation_job_equipment_usage ON job_equipment_usage
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- General field-operations audit log. Deliberately separate from
-- job_status_history rather than overloading it: status_history has a
-- specific from_status/to_status shape that fits a lifecycle
-- transition, but doesn't fit "a caption was edited on photo X" or "this
-- chemical's quantity changed from 32oz to 40oz" — those are field-level
-- previous/new value pairs on arbitrary entities, a genuinely different
-- shape of record. Both tables together are "the audit trail"; this
-- isn't a duplicate system, it's the complementary other half.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  action_type         TEXT NOT NULL CHECK (action_type IN (
    'photo_added', 'photo_deleted',
    'chemical_added', 'chemical_updated', 'chemical_removed',
    'equipment_added', 'equipment_removed',
    'signature_captured', 'completion_notes_updated'
  )),
  performed_by_user_id UUID REFERENCES users(id),
  latitude            NUMERIC(10, 7),
  longitude           NUMERIC(10, 7),
  previous_value      JSONB,
  new_value           JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_audit_log_job_id ON job_audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_job_audit_log_company_id ON job_audit_log(company_id);

ALTER TABLE job_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_audit_log FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_audit_log' AND policyname = 'tenant_isolation_job_audit_log') THEN
    CREATE POLICY tenant_isolation_job_audit_log ON job_audit_log
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

COMMIT;
