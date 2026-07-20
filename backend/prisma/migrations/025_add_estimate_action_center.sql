-- Estimate Action Center. estimate_status_history is deliberately
-- identical in shape to job_status_history/payment_status_history —
-- reusing the exact same audit pattern rather than inventing a third
-- one for the same concept.

BEGIN;

CREATE TABLE IF NOT EXISTS estimate_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id        UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  from_status        TEXT,
  to_status          TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES users(id),
  -- NULL for a portal-initiated change (the customer isn't a `users`
  -- row) — source below is what actually distinguishes who/what acted,
  -- changed_by_user_id is only ever populated for staff-initiated ones.
  source             TEXT NOT NULL CHECK (source IN ('portal', 'staff', 'manual', 'automation')),
  note               TEXT,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_status_history_estimate_id ON estimate_status_history(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_status_history_company_id ON estimate_status_history(company_id);

ALTER TABLE estimate_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_status_history FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estimate_status_history' AND policyname = 'tenant_isolation_estimate_status_history') THEN
    CREATE POLICY tenant_isolation_estimate_status_history ON estimate_status_history
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- estimates: who/how it was accepted, a separate free-text decline
-- comment field (decline_reason already existed — kept as the
-- selectable-reason field, this is additive), and Internal Notes —
-- staff-only, never rendered on a PDF or exposed to the portal.
-- ---------------------------------------------------------------------
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS accepted_via TEXT CHECK (accepted_via IN ('portal', 'staff', 'manual')),
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS decline_comments TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- ---------------------------------------------------------------------
-- The new estimates.reopen permission. migration 001 (which does the
-- initial owner/admin wildcard grants) already ran in production, so a
-- brand new permission added after the fact needs its own explicit
-- grant — this mirrors that same wildcard intent for exactly these two
-- roles, not a new access pattern.
-- ---------------------------------------------------------------------
INSERT INTO permissions (key, category, description)
VALUES ('estimates.reopen', 'estimates', 'Reopen an accepted estimate back to draft')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'estimates.reopen'
ON CONFLICT DO NOTHING;

COMMIT;
