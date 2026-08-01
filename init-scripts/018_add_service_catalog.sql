-- Service Catalog. The service_type vocabulary already exists,
-- duplicated across 10 files — this table becomes its one real home.
-- Every column here is additive: estimate_line_items and job_line_items
-- gain a nullable reference to it, nothing existing changes shape.

BEGIN;

CREATE TABLE IF NOT EXISTS service_catalog_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- GENERAL
  name                  TEXT NOT NULL,
  service_type          TEXT NOT NULL CHECK (service_type IN (
                           'roof_soft_wash', 'driveway_cleaning', 'house_wash',
                           'pool_deck', 'patio', 'fence', 'gutters',
                           'screen_enclosure', 'rust_removal', 'paver_cleaning',
                           'window_cleaning', 'other'
                         )),
  -- Deliberately separate from service_type: category is the business's
  -- own free-text grouping ("Roof Services", "Hardscape") for organizing
  -- the catalog UI and future reports, while service_type stays the
  -- fixed vocabulary every existing validation path already depends on.
  category              TEXT,
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,

  -- PRICING
  default_unit_of_measure TEXT CHECK (default_unit_of_measure IN ('sq_ft', 'linear_ft', 'each', 'hours')),
  default_unit_price    NUMERIC(12, 2),
  -- A price floor regardless of quantity — the estimate builder can
  -- warn or clamp against this later; the catalog just carries the
  -- number.
  minimum_price         NUMERIC(12, 2),
  default_labor_hours   NUMERIC(10, 2),
  -- Deliberately distinct from labor hours: duration is calendar/
  -- scheduling time (what Scheduling books an arrival window against),
  -- labor hours is billable work time — multiple techs working
  -- simultaneously means these two numbers genuinely diverge.
  estimated_duration_minutes INTEGER,

  -- CHEMICALS — one JSONB array rather than three parallel columns, so
  -- a chemical's name/ratio/quantity/unit can never drift out of sync
  -- with each other. Shape: [{chemicalName, mixRatio, quantity, unit, notes}]
  default_chemicals     JSONB NOT NULL DEFAULT '[]',

  -- EQUIPMENT — kept as two separate arrays per explicit request:
  -- "default" (typical/suggested) vs "required" (the job cannot be done
  -- without it) are a real distinction a technician needs at a glance.
  -- Shape for both: [{equipmentName, notes}]
  default_equipment     JSONB NOT NULL DEFAULT '[]',
  required_equipment    JSONB NOT NULL DEFAULT '[]',

  -- CUSTOMER INFORMATION
  warranty_days         INTEGER,
  warranty_terms        TEXT,
  preparation_instructions TEXT,
  aftercare_instructions   TEXT,

  -- ESTIMATING
  default_notes         TEXT,
  default_terms         TEXT,
  -- Self-referencing suggestion arrays. Postgres can't put a real FK
  -- constraint on an array's elements, so referential integrity here is
  -- enforced at the application layer (checked on save: every id must
  -- exist and belong to the same company) rather than the database —
  -- a real, honest tradeoff worth knowing about, not hidden.
  suggested_upsell_service_ids UUID[] NOT NULL DEFAULT '{}',
  suggested_future_service_ids UUID[] NOT NULL DEFAULT '{}',

  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_items_company_id ON service_catalog_items(company_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_items_service_type ON service_catalog_items(company_id, service_type);
CREATE INDEX IF NOT EXISTS idx_service_catalog_items_active ON service_catalog_items(company_id, is_active);

ALTER TABLE service_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog_items FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_catalog_items' AND policyname = 'tenant_isolation_service_catalog_items') THEN
    CREATE POLICY tenant_isolation_service_catalog_items ON service_catalog_items
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_service_catalog_items_updated_at ON service_catalog_items;
CREATE TRIGGER trg_service_catalog_items_updated_at
  BEFORE UPDATE ON service_catalog_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- The AI/reporting foundation: both estimate_line_items and
-- job_line_items get a nullable reference back to the catalog entry
-- they came from. This is what actually makes "estimated vs actual"
-- and every reporting-by-service query possible later — without it,
-- there's no way to know which catalog baseline a completed job's real
-- numbers (already tracked: jobs.calculated_labor_hours, jobs.actual_
-- start/actual_end, job_chemical_usage) should be compared against.
-- No new "comparison" table needed — it's a join away once this exists.
-- ---------------------------------------------------------------------
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS service_catalog_item_id UUID REFERENCES service_catalog_items(id) ON DELETE SET NULL;

ALTER TABLE job_line_items
  ADD COLUMN IF NOT EXISTS service_catalog_item_id UUID REFERENCES service_catalog_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_catalog_item ON estimate_line_items(service_catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_job_line_items_catalog_item ON job_line_items(service_catalog_item_id);

COMMIT;
