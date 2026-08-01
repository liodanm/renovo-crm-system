-- The base schema (renovo_crm_schema.sql) already defines
-- estimate_line_items (description, quantity, unit_price, a GENERATED
-- total column, sort_order, RLS via the tenant_tables loop) and most of
-- estimates' pricing fields (subtotal, tax_rate, tax_amount,
-- discount_amount, notes) — this was discovered by actually running this
-- migration against a fresh database and hitting a real "already exists"
-- error, not assumed. This migration adds only what's genuinely still
-- missing, rather than duplicating what's already there.

BEGIN;

-- service_type: a stable, well-known string key, not open free text —
-- this is the actual future-proofing for reusable service templates
-- (explicitly requested for later, not built now): when that table
-- exists, ServiceTemplate.serviceType can match this column by value
-- with zero migration needed here. A free-text field would let the two
-- drift apart before that feature ever gets built.
ALTER TABLE estimate_line_items
  ADD COLUMN service_type TEXT NOT NULL DEFAULT 'other' CHECK (service_type IN (
    'roof_soft_wash', 'driveway_cleaning', 'house_wash',
    'pool_deck', 'patio', 'fence', 'gutters',
    'screen_enclosure', 'rust_removal', 'paver_cleaning',
    'window_cleaning', 'other'
  )),
  ADD COLUMN unit_of_measure TEXT NOT NULL DEFAULT 'each' CHECK (unit_of_measure IN (
    'sq_ft', 'linear_ft', 'each', 'hours'
  )),
  ADD COLUMN notes TEXT,
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- The one genuine gap in estimates' existing pricing fields: discount_amount
-- exists but has no way to say whether it's a flat dollar amount or a
-- percentage of the subtotal — both are explicitly required.
ALTER TABLE estimates
  ADD COLUMN discount_type TEXT CHECK (discount_type IN ('fixed', 'percentage'));

COMMIT;
