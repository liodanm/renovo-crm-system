-- Allows a payment to be recorded directly against a customer with no
-- invoice (e.g. a job completed months before this CRM existed, with
-- no invoice ever created for it). invoice_id remains a real foreign
-- key with ON DELETE CASCADE when it IS set — a NULL foreign key value
-- is always valid in Postgres regardless of the CASCADE rule, since
-- cascade only ever fires when the *referenced* row is deleted.
--
-- customer_id remains NOT NULL and is unaffected — every payment,
-- standalone or invoice-linked, has always required a real customer.

BEGIN;

ALTER TABLE payments ALTER COLUMN invoice_id DROP NOT NULL;

COMMIT;
