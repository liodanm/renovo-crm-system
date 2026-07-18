-- Phase 1 of the Job Management module. Every ALTER uses IF NOT EXISTS —
-- learned the hard way across the Estimates rollout, where migrations
-- landing only partially on the real production database (never fully
-- reproducible locally, since this sandbox has no access to that
-- database) caused three separate rounds of "column does not exist"
-- errors. Idempotent from the start this time, not patched after.

BEGIN;

-- 'unscheduled' (the placeholder status convertToJob previously used)
-- is being retired in favor of 'draft', which now has a real meaning in
-- this module's status workflow (draft -> scheduled -> in_progress ->
-- completed, with paused/cancelled as real branches). Any existing rows
-- get migrated forward before the constraint changes under them.
UPDATE jobs SET status = 'draft' WHERE status = 'unscheduled';

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled', 'on_hold'));

ALTER TABLE jobs
  -- Individual-technician assignment, live today. Deliberately a
  -- separate column from assigned_crew_id (which already exists and
  -- stays untouched) rather than replacing it — the day crew assignment
  -- is needed, it's already there with zero migration required. A job
  -- is expected to use exactly one of the two in practice, enforced at
  -- the application layer rather than a DB constraint, since "assigned
  -- to nobody yet" (both null) is a completely valid, common state for
  -- a freshly-converted draft job.
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Two distinct numbers by design, per explicit decision: the system's
  -- own math (actual_end - actual_start) is never silently overwritten
  -- by a manual adjustment — it stays the honest record of what the
  -- clock actually measured, while billable_labor_hours is what
  -- actually goes on an invoice. Editing billable never touches
  -- calculated, and vice versa.
  ADD COLUMN IF NOT EXISTS calculated_labor_hours NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS billable_labor_hours NUMERIC(10, 2),

  -- jobs.notes already exists and is customer-facing (matches the
  -- portal and estimate pattern elsewhere in this schema). This is the
  -- one genuinely new column Phase 1 needs alongside it.
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_assigned_user_id ON jobs(assigned_user_id);

-- job_line_items currently has only description/quantity/unit_price —
-- meaningfully less than estimate_line_items. "Preserve all Estimate
-- line items" (the stated top-level goal, not just a Phase 1 item) means
-- a lossy copy that drops which service each line was and its
-- service-specific details isn't actually preserving them. Extended to
-- match the fields that describe WHAT the line item is; deliberately
-- NOT extending it with estimate_line_items' cost/profitability columns
-- (estimated_labor_hours, estimated_chemical_cost, etc.) — those were
-- always speculative pre-job estimates, and a job's real costs belong in
-- the field-operations tables Phase 2 adds (actual chemical usage,
-- actual equipment used), not a blind copy of a guess.
ALTER TABLE job_line_items
  ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'other' CHECK (service_type IN (
    'roof_soft_wash', 'driveway_cleaning', 'house_wash',
    'pool_deck', 'patio', 'fence', 'gutters',
    'screen_enclosure', 'rust_removal', 'paver_cleaning',
    'window_cleaning', 'other'
  )),
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT DEFAULT 'each' CHECK (unit_of_measure IN (
    'sq_ft', 'linear_ft', 'each', 'hours'
  )),
  ADD COLUMN IF NOT EXISTS service_details JSONB,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- "Track the entire job lifecycle" is an audit-trail requirement, not
-- just a single current-status field — this is what actually answers
-- "who paused this job, when, and why" later, which the status column
-- alone can never do once it's overwritten by the next transition.
CREATE TABLE IF NOT EXISTS job_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status        TEXT,
  to_status          TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  note               TEXT,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_status_history_job_id ON job_status_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_status_history_company_id ON job_status_history(company_id);

ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status_history FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_status_history' AND policyname = 'tenant_isolation_job_status_history'
  ) THEN
    CREATE POLICY tenant_isolation_job_status_history ON job_status_history
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

COMMIT;
