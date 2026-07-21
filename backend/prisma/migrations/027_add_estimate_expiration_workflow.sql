-- Estimate Expiration as a first-class workflow. Only schema change
-- needed: the automation_log rule_type constraint has been extended
-- twice before (022, 026) for exactly this reason — a new event type
-- needs a value the CHECK constraint allows. No new tables, no new
-- columns; expiration reuses estimates.status, estimate_status_history,
-- and automation_log exactly as they already exist.

BEGIN;

ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_rule_type_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_rule_type_check
  CHECK (rule_type IN (
    'estimate_followup', 'recurring_reminder', 'review_request',
    'estimate_viewed', 'estimate_approved', 'estimate_declined',
    'invoice_viewed', 'invoice_paid',
    'payment_reminder', 'estimate_expiration_reminder', 'job_thank_you',
    'estimate_expired'
  ));

COMMIT;
