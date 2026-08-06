-- Distinguishes WHY a discount exists (package-applied vs manually
-- typed), not HOW it's calculated (discount_type already covers that).
-- Nullable — most historical estimates have no discount at all, and
-- even discounted ones predate this field entirely, so NULL correctly
-- means "unknown/pre-existing," not "manual" by default assumption.
ALTER TABLE estimates ADD COLUMN discount_source TEXT;
ALTER TABLE estimates ADD CONSTRAINT estimates_discount_source_check
  CHECK (discount_source IS NULL OR discount_source IN ('package', 'manual'));

-- Invoices snapshot the estimate's discount at generation time (see
-- migration/fix from the Invoice Generation Financial Integrity work) —
-- discount_source needs to travel through that exact same snapshot, or
-- it would reproduce the identical bug that fix already closed once.
ALTER TABLE invoices ADD COLUMN discount_source TEXT;
ALTER TABLE invoices ADD CONSTRAINT invoices_discount_source_check
  CHECK (discount_source IS NULL OR discount_source IN ('package', 'manual'));
