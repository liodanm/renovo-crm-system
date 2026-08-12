-- Adds credit-card processing fee support to manually-recorded Card
-- payments. Deliberately two separate additive columns, matching the
-- proven tip_amount/refunded_amount pattern already on this table —
-- processing_fee_amount is a historical dollar snapshot (never
-- recalculated if the company's configured percentage later changes),
-- card_type records which selection the staff member made at the time,
-- since a manually recorded Card payment has no real Stripe metadata
-- to determine this automatically.
--
-- This does NOT touch payments.amount, invoices, or Stripe in any way.

BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS processing_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (processing_fee_amount >= 0);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS card_type TEXT
    CHECK (card_type IS NULL OR card_type IN ('credit', 'debit'));

COMMIT;
