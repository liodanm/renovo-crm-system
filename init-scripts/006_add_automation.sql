-- Real, server-side automation — replaces the client-side-only rule
-- evaluation from the earlier prototype (which could only run while a
-- browser tab was open). See automation/automation.service.ts.

BEGIN;

CREATE TABLE automation_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  estimate_followup_enabled BOOLEAN NOT NULL DEFAULT true,
  estimate_followup_after_days INTEGER NOT NULL DEFAULT 3,
  recurring_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  recurring_reminder_interval_months INTEGER NOT NULL DEFAULT 12,
  review_request_enabled     BOOLEAN NOT NULL DEFAULT true,
  review_request_delay_days  INTEGER NOT NULL DEFAULT 1,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One real, persisted log of what actually went out — a solo operator
-- reviews this after the fact rather than approving every message before
-- it sends (see automation.service.ts for why: requiring manual approval
-- of routine reminders is exactly the admin overhead this feature exists
-- to remove for a one-person shop).
CREATE TABLE automation_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('estimate_followup', 'recurring_reminder', 'review_request')),
  dedupe_key    TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  message_body  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_detail  TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The dedupe key is what actually prevents double-sending the same
-- reminder across daily cron runs — enforced at the database level, not
-- just in application logic, so a race between two overlapping runs can't
-- slip through.
CREATE UNIQUE INDEX idx_automation_log_dedupe ON automation_log(company_id, dedupe_key);
CREATE INDEX idx_automation_log_company_id ON automation_log(company_id, sent_at DESC);

ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_automation_settings ON automation_settings
  USING (company_id = current_setting('app.current_company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);

ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_automation_log ON automation_log
  USING (company_id = current_setting('app.current_company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);

COMMIT;
