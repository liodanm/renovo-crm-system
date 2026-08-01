-- Automation Settings module. Extends the existing automation_settings
-- table with the new rule types (payment reminder, estimate expiration
-- reminder, job thank-you) using the identical enabled/timing column
-- pattern the three existing rules already use — not a new shape.
-- Template overrides go in one JSONB column, matching the precedent
-- already set by companies.settings.branding, rather than 12 new TEXT
-- columns for something that's genuinely optional, sparse data (most
-- companies will never touch most of these).

BEGIN;

ALTER TABLE automation_settings
  ADD COLUMN IF NOT EXISTS payment_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_reminder_days_after_due INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS estimate_expiration_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS estimate_expiration_reminder_days_before INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS job_thank_you_enabled BOOLEAN NOT NULL DEFAULT true,
  -- { "estimate_followup": {"subject": "...", "body": "..."}, "recurring_reminder": {...}, ... }
  -- Any rule not present here uses its existing hardcoded default —
  -- this is override-only storage, not a second source of truth for
  -- the default text.
  ADD COLUMN IF NOT EXISTS templates JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The 3 new rule types this module adds — extending the same constraint
-- migration 022 already extended once, not a second parallel list.
ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_rule_type_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_rule_type_check
  CHECK (rule_type IN (
    'estimate_followup', 'recurring_reminder', 'review_request',
    'estimate_viewed', 'estimate_approved', 'estimate_declined',
    'invoice_viewed', 'invoice_paid',
    'payment_reminder', 'estimate_expiration_reminder', 'job_thank_you'
  ));

COMMIT;
