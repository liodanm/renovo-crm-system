-- Additive: the actual date a service was performed, distinct from
-- payment_date (when money was received). Nullable — existing rows are
-- untouched, no backfill. NULL means "no override; fall back to the
-- linked completed Job's actual_end" in the Last Service calculation,
-- never "no service ever happened."
ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_date DATE;

COMMENT ON COLUMN payments.service_date IS
  'The date the service was actually performed, as distinct from payment_date (when the payment was received). Used to correctly compute Customer.lastServiceDate for historical/manually-entered payments that predate or have no linked completed Job. NULL means no override — the Last Service calculation falls back to any linked completed Job''s actual_end.';
