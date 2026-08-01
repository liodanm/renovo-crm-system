-- Production PDF & Email System. Extends real, already-existing
-- infrastructure rather than duplicating it: the mail queue (MailService/
-- MailProcessor/BullMQ), the Customer Portal (magic-link auth, approve/
-- decline, Stripe payment), and estimates/invoices' own status lifecycle
-- (sent_at/viewed_at/accepted_at/declined_at already existed on
-- estimates; invoices only had sent_at — the one real gap filled here).

BEGIN;

-- The one genuinely missing timestamp — estimates already had viewed_at,
-- invoices never did.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- Real, persistent delivery tracking — separate from BullMQ's own job
-- state (which is transient Redis data, cleared on completion/restart
-- and never queryable as "email history" from the app). This is what
-- "save email history" and "save delivery status" actually require: a
-- durable row that survives a queue restart and can be listed on an
-- estimate/invoice's detail page.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_type        TEXT NOT NULL CHECK (related_type IN ('estimate', 'invoice')),
  related_id          UUID NOT NULL,
  recipient_email     TEXT NOT NULL,
  subject             TEXT NOT NULL,
  template            TEXT NOT NULL,
  -- queued -> sent (Postmark accepted it) -> failed (provider rejected
  -- or not configured). 'delivered'/'bounced' are real, future states
  -- once Postmark's own delivery webhooks are wired in — that's a
  -- genuinely separate integration (inbound webhook endpoint) from
  -- sending itself, not built in this pass, but the column already
  -- supports it without a future migration.
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'bounced')),
  provider_message_id TEXT,
  error_message       TEXT,
  sent_by_user_id     UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_related ON email_log(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_email_log_company_id ON email_log(company_id);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_log' AND policyname = 'tenant_isolation_email_log') THEN
    CREATE POLICY tenant_isolation_email_log ON email_log
      USING (company_id = current_setting('app.current_company_id', true)::uuid)
      WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- The dormant automations/automation_steps rules engine (unused today —
-- AutomationSettings/AutomationLog is what actually runs) still has a
-- real trigger_type vocabulary on it. Extended for consistency and so a
-- future real rule-builder UI never has to touch this constraint again
-- — but nothing in this migration wires execution logic to it, since
-- that engine was never wired up to begin with and building it out is
-- real, separate scope from this feature.
-- ---------------------------------------------------------------------
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN (
    'job_completed', 'estimate_sent', 'invoice_overdue', 'customer_created',
    'review_received', 'schedule_based', 'manual',
    'estimate_viewed', 'estimate_approved', 'estimate_declined',
    'invoice_sent', 'invoice_viewed', 'invoice_paid'
  ));

-- ---------------------------------------------------------------------
-- automation_log.channel only allowed 'sms'/'email' — both are real
-- delivery channels for a message that went out. The new lifecycle
-- events this feature logs (viewed/approved/declined/paid) aren't a
-- delivery at all; they're a system-recorded fact about something a
-- customer did or a webhook reported. 'system' is a genuinely new,
-- correct third category, not a workaround for the other two.
-- ---------------------------------------------------------------------
ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_channel_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_channel_check
  CHECK (channel IN ('sms', 'email', 'system'));

ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_rule_type_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_rule_type_check
  CHECK (rule_type IN (
    'estimate_followup', 'recurring_reminder', 'review_request',
    'estimate_viewed', 'estimate_approved', 'estimate_declined',
    'invoice_viewed', 'invoice_paid'
  ));

COMMIT;
