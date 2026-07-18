-- Settings Framework. Reuses more than it adds: companies.settings JSONB
-- already existed in the original base schema ("feature flags, branding,
-- default tax rate, etc.") and was never used — Branding lives there now,
-- finally serving its designed purpose. users.phone/avatar_url and
-- estimates.valid_until already existed too. Only genuinely new values
-- get new columns.

BEGIN;

-- ---------------------------------------------------------------------
-- Profile (users) — timezone/date format/language are genuinely new.
-- phone and avatar_url already exist; name/email are the existing
-- first_name/last_name/email columns.
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY'
    CHECK (date_format IN ('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  -- Future-ready per explicit request — no i18n exists yet, but the
  -- column means adding it later never touches this table again.
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- ---------------------------------------------------------------------
-- Company + Business Defaults (companies) — dba/tax_id/license_number/
-- business_hours are Company fields; the default_* and unit/currency
-- fields are Business Defaults, extending the pattern already proven
-- by default_labor_rate (migration 010) and default_arrival_window_
-- minutes (migration 017) rather than introducing a second storage
-- strategy for equivalent data.
-- ---------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dba TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS license_number TEXT,
  -- Structured per-day schedule: {"monday": {"open": "08:00", "close":
  -- "17:00", "closed": false}, ...} — validated at the application
  -- layer (a fixed 7-key shape checked in the service), not the
  -- database, matching how service_details is already handled elsewhere.
  ADD COLUMN IF NOT EXISTS business_hours JSONB,

  ADD COLUMN IF NOT EXISTS default_tax_rate_percent NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS default_estimate_expiration_days INTEGER,
  -- Forward-ready for the Invoices module — no redesign needed the day
  -- it exists, per explicit instruction.
  ADD COLUMN IF NOT EXISTS default_invoice_due_days INTEGER,

  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS measurement_unit_system TEXT NOT NULL DEFAULT 'imperial'
    CHECK (measurement_unit_system IN ('imperial', 'metric')),
  ADD COLUMN IF NOT EXISTS distance_unit TEXT NOT NULL DEFAULT 'miles'
    CHECK (distance_unit IN ('miles', 'km'));

COMMIT;
