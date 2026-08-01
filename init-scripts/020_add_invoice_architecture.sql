-- Financial System foundation, built on the invoices/invoice_line_items/
-- payments tables that already existed in the original base schema
-- (complete with a real status lifecycle and Stripe fields) — this only
-- adds what's genuinely missing, per the approved plan.

BEGIN;

-- ---------------------------------------------------------------------
-- invoices: property_id (approved) + discount_type. discount_amount
-- already existed as a stored NUMERIC; discount_type mirrors estimates'
-- already-proven fixed/percentage pattern (migration 011) rather than
-- inventing a second discount model for the same concept.
-- ---------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id),
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('fixed', 'percentage'));

CREATE INDEX IF NOT EXISTS idx_invoices_property_id ON invoices(property_id);

-- ---------------------------------------------------------------------
-- invoice_line_items: the same three columns already added to
-- estimate_line_items and job_line_items, keeping the Service Catalog
-- relationship intact across the whole Estimate -> Job -> Invoice chain.
-- Tax and discount stay at the invoice level (matching how Estimates
-- already works) rather than per-line — "Line Items: Discounts, Tax" in
-- the requirements describes how each line contributes to the
-- document-level totals, not a second calculation model.
-- ---------------------------------------------------------------------
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS service_catalog_item_id UUID REFERENCES service_catalog_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_catalog_item ON invoice_line_items(service_catalog_item_id);

-- ---------------------------------------------------------------------
-- One small Company Settings addition: a Google review link is the one
-- genuinely new piece of data the "QR Code for Google Review" CX
-- requirement needs. Everything else on that list (warranty info,
-- recommended future services, before/after photos) already exists
-- elsewhere (service_catalog_items, jobs.recommended_future_services,
-- photos) and needs no new schema — just a join at render time.
-- ---------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;

COMMIT;
