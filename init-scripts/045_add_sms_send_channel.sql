BEGIN;

-- Extends the existing document-send log to cover SMS, rather than
-- building a parallel sms_log table for what's conceptually the same
-- thing: "we sent this document to this customer through some channel,
-- here's whether it worked." recipient_email is relaxed to nullable
-- (an SMS send has no email recipient) and recipient_phone added as
-- its counterpart. subject/template stay NOT NULL and get populated
-- for SMS sends too (e.g. template='estimate-send-sms') — they still
-- describe what was sent, just not literally an email subject line, so
-- there's no real reason to make them nullable as well.
ALTER TABLE email_log
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  ADD COLUMN recipient_phone TEXT;

ALTER TABLE email_log ALTER COLUMN recipient_email DROP NOT NULL;

-- A row must have a recipient appropriate to its own channel — catches
-- a future bug (e.g. an SMS send accidentally logged with no phone)
-- at the database layer, not just relying on application code to get
-- it right every time.
ALTER TABLE email_log ADD CONSTRAINT email_log_recipient_matches_channel CHECK (
  (channel = 'email' AND recipient_email IS NOT NULL) OR
  (channel = 'sms' AND recipient_phone IS NOT NULL)
);

COMMIT;
