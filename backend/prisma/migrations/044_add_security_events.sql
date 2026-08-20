BEGIN;

-- Generic security/audit event log — deliberately one table for every
-- event type (login, lockout, registration, invites), not a
-- login-specific table, per the explicit architectural instruction for
-- this feature. company_id is NULLABLE on purpose: a failed login
-- against an email that doesn't match any real user (the common case
-- for random/bot credential-stuffing attempts) can't be attributed to
-- any company, and there is genuinely no tenant to show it to — RLS
-- below naturally excludes NULL-company rows from every per-tenant
-- query without any special-case logic, which is exactly the desired
-- behavior. Those rows are retained anyway (not discarded) so a future
-- platform-level admin view could still see them, per this feature's
-- own "design for future platform support, don't build it yet"
-- instruction.
CREATE TABLE security_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL CHECK (event_type IN (
                      'login_success', 'login_failure', 'account_locked', 'logout',
                      'password_reset_request', 'password_reset_completed',
                      'registration_success', 'registration_duplicate_attempt',
                      'invitation_sent', 'invitation_accepted'
                    )),
  success          BOOLEAN NOT NULL,
  -- A masked representation only (e.g. "j***@example.com"), never the
  -- raw email — see SecurityEventsService.maskIdentifier's own comment
  -- for the full reasoning. NULL when the event has no meaningful
  -- identifier of its own (e.g. a successful login already has user_id).
  identifier_masked TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  -- Short, safe, pre-defined reason codes only (e.g. 'invalid_credentials',
  -- 'account_locked') — never a raw exception message or stack trace,
  -- which could leak internal details. Enforced at the application layer
  -- (SecurityEventsService only ever passes its own fixed strings), not
  -- re-validated here with a CHECK constraint, since new safe reason
  -- codes should be addable without a migration.
  reason            TEXT,
  -- Small, structured, non-sensitive extra context only (e.g. lockout
  -- duration in seconds, invited role name) — never credentials, tokens,
  -- or full request bodies. Same trust boundary as `reason` above.
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index matches this feature's two real query shapes: "recent
-- activity for my company" (company_id + created_at DESC) and "filtered
-- activity for my company" (adds event_type). A separate single-column
-- event_type index would rarely be used alone — nobody queries "every
-- login_failure across all companies" from the product UI — so it's
-- deliberately not created, per the "avoid excessive indexing" instruction.
CREATE INDEX idx_security_events_company_created ON security_events(company_id, created_at DESC);
CREATE INDEX idx_security_events_company_type_created ON security_events(company_id, event_type, created_at DESC);
CREATE INDEX idx_security_events_user_id ON security_events(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'security_events' AND policyname = 'tenant_isolation_security_events') THEN
    -- USING and WITH CHECK are deliberately different expressions here,
    -- not the same one reused (unlike every other tenant_isolation
    -- policy in this schema). USING (the read/update/delete side) stays
    -- strict — company_id = current_setting(...) — which naturally
    -- excludes NULL-company rows from every ordinary tenant query
    -- (NULL never equals a real UUID), exactly as intended: no company
    -- should ever see another company's or nobody's unattributed
    -- events. WITH CHECK (the insert side) explicitly allows
    -- company_id IS NULL as well — without that OR, FORCE RLS would
    -- reject every insert of a genuinely unattributable event (e.g. a
    -- failed login against an email matching no real user), since
    -- `NULL = current_setting(...)` evaluates to unknown, not true, and
    -- an unknown WITH CHECK result blocks the write. This was caught
    -- and fixed during this feature's own implementation, not
    -- discovered later.
    CREATE POLICY tenant_isolation_security_events ON security_events
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id IS NULL OR company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- Owner AND admin, matching this feature's explicit access requirement
-- ("Owner/admin can identify suspicious activity. Not: every staff
-- member") — same owner/admin-only grant shape as migration 010's
-- estimates.profitability, not a new pattern invented here. Nav
-- visibility on the Settings landing page is owner-only for now (see
-- frontend), a narrower, cosmetic-only choice noted in this feature's
-- final report — the real boundary is this permission, enforced on
-- every backend endpoint regardless of what the nav shows.
INSERT INTO permissions (key, category, description) VALUES
  ('security.activity', 'security', 'View company security activity (logins, lockouts, registrations, staff access changes)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'security.activity'
ON CONFLICT DO NOTHING;

COMMIT;
