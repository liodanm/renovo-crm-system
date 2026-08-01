-- Adds 'payment_failed' as a valid automation_log.rule_type, following the
-- exact same pattern as 022/026/027: the constraint has been extended each
-- time a new event type needed a value it didn't already allow. No new
-- tables, no new columns — payment_failed events reuse automation_log
-- exactly as it already exists, same as every other rule_type here.
--
-- Needed for Stripe's payment_intent.payment_failed webhook handling: a
-- failed card payment attempt should be visible to staff the same way
-- invoice_paid already is, via the existing logAutomationEvent() path —
-- not a new notification mechanism.

BEGIN;

ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_rule_type_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_rule_type_check
  CHECK (rule_type IN (
    'estimate_followup', 'recurring_reminder', 'review_request',
    'estimate_viewed', 'estimate_approved', 'estimate_declined',
    'invoice_viewed', 'invoice_paid',
    'payment_reminder', 'estimate_expiration_reminder', 'job_thank_you',
    'estimate_expired', 'payment_failed'
  ));

COMMIT;
