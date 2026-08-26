-- Additive, default-safe: every existing service catalog item gets
-- 'instant' automatically (NOT NULL with a DEFAULT, not a nullable
-- column requiring a backfill decision) — matches today's actual
-- behavior exactly, since every service is instant-priced today.
-- Nothing about existing pricing, estimate creation, or the public
-- quote flow changes for a company that never touches this new field.
ALTER TABLE service_catalog_items ADD COLUMN IF NOT EXISTS online_quote_mode TEXT NOT NULL DEFAULT 'instant'
  CHECK (online_quote_mode IN ('instant', 'request'));

COMMENT ON COLUMN service_catalog_items.online_quote_mode IS
  'Controls the public Quote Tool only — staff-side estimate creation is completely unaffected either way. instant = customer receives a calculated price and Estimate immediately. request = customer submits a request; no Estimate is created, no price is shown, staff follow up manually.';
