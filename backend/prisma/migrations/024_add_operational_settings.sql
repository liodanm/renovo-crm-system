-- Operational Settings pages (Payments/Email/SMS/Storage). Deliberately
-- small: every real secret (Stripe/Postmark/Twilio/AWS credentials)
-- already lives correctly in environment variables, checked at boot by
-- main.ts's integration-status logic — none of that gets duplicated
-- into the database here, which would just create a second, driftable
-- copy of the same secret. Only genuinely new, safe-to-store preferences
-- get columns: which payment methods to offer, and an optional reply-to
-- address distinct from the company's main contact email.

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS enabled_payment_methods TEXT[] NOT NULL DEFAULT ARRAY['card','cash','check']::TEXT[],
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT;

COMMIT;
