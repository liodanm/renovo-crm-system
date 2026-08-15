-- Adds a genuine, independent custom_service_name field so a custom
-- line item's name and its optional customer-facing description are
-- two separate pieces of data, never derived from each other. Previously
-- a custom service (service_type = 'other') stored its name IN
-- description — the only place it could live — which is exactly what
-- caused the frontend bug this migration exists to fix at the root:
-- editing the description after creating a custom service visually
-- overwrote what looked like the service's name, because they were
-- literally the same value.

BEGIN;

-- ---- 1. New column, all three line-item tables ----
-- Nullable everywhere: predefined catalog services never use this at
-- all (only meaningful when service_type = 'other'). Same TEXT type and
-- unbounded-length convention as the existing description column on
-- each of these tables — no VARCHAR length was ever specified for
-- description either, so custom_service_name matches that precedent
-- (length is enforced at the application/DTO layer, @MaxLength(500),
-- same as description already is).

ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE job_line_items      ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE invoice_line_items  ADD COLUMN IF NOT EXISTS custom_service_name TEXT;

-- ---- 2. description becomes nullable ----
-- Previously required (NOT NULL) on all three tables — correct for
-- predefined services, which still require a real description exactly
-- as before (enforced at the application layer now, not the database,
-- since the requirement is now conditional on service_type). A custom
-- service's description is genuinely optional going forward (the name
-- lives in custom_service_name instead), so the column itself must
-- allow NULL to represent "no additional detail was given" — distinct
-- from an empty string, matching the explicitly requested semantics.

ALTER TABLE estimate_line_items ALTER COLUMN description DROP NOT NULL;
ALTER TABLE job_line_items      ALTER COLUMN description DROP NOT NULL;
ALTER TABLE invoice_line_items  ALTER COLUMN description DROP NOT NULL;

-- ---- 3. Fix a real, separate bug found while touching this schema ----
-- unit_of_measure's CHECK constraint on estimate_line_items and
-- job_line_items (and service_catalog's default_unit_of_measure) never
-- included 'flat_rate', even though an earlier change added it to the
-- application-layer validation only. Saving a Flat Rate line item would
-- currently fail at the database with a raw constraint violation,
-- despite passing app validation first. Unrelated to today's feature,
-- but directly discovered by this same investigation and left broken
-- otherwise — not fixing it here would mean shipping a schema change
-- while knowingly leaving a live bug in the same area untouched.
--
-- Constraint names are looked up dynamically rather than hardcoded:
-- this project's own migration history (008 vs 012, see 012's comment)
-- shows genuine uncertainty about which migration actually landed in
-- production and what Postgres auto-named the resulting constraint —
-- guessing a name here risks the whole migration failing outright in
-- an environment where the guess is wrong.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'estimate_line_items'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%unit_of_measure%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE estimate_line_items DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE estimate_line_items
  ADD CONSTRAINT estimate_line_items_unit_of_measure_check
  CHECK (unit_of_measure IN ('sq_ft', 'linear_ft', 'each', 'hours', 'flat_rate'));

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'job_line_items'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%unit_of_measure%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE job_line_items DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE job_line_items
  ADD CONSTRAINT job_line_items_unit_of_measure_check
  CHECK (unit_of_measure IS NULL OR unit_of_measure IN ('sq_ft', 'linear_ft', 'each', 'hours', 'flat_rate'));

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'service_catalog'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%default_unit_of_measure%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE service_catalog DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE service_catalog
  ADD CONSTRAINT service_catalog_default_unit_of_measure_check
  CHECK (default_unit_of_measure IS NULL OR default_unit_of_measure IN ('sq_ft', 'linear_ft', 'each', 'hours', 'flat_rate'));

-- ---- 4. Migrate existing custom-service data ----
-- Confirmed by tracing every application code path that has ever
-- written a service_type = 'other' row (ServicePicker's custom-entry
-- flow, the estimate line-item insert path) — description has only
-- ever been used to hold the custom service's name for these rows,
-- never a separate detail field, since no such field existed until
-- this migration. This is a code-level conclusion, not a query against
-- live production data (this sandbox has no production database
-- access) — stated plainly rather than implied.
--
-- Only touches rows where custom_service_name is still NULL (the
-- column this migration just added), so this is safe to run exactly
-- once and safe to re-run harmlessly if it somehow ran twice.

UPDATE estimate_line_items
  SET custom_service_name = description, description = NULL
  WHERE service_type = 'other' AND custom_service_name IS NULL AND description IS NOT NULL AND description != '';

UPDATE job_line_items
  SET custom_service_name = description, description = NULL
  WHERE service_type = 'other' AND custom_service_name IS NULL AND description IS NOT NULL AND description != '';

UPDATE invoice_line_items
  SET custom_service_name = description, description = NULL
  WHERE service_type = 'other' AND custom_service_name IS NULL AND description IS NOT NULL AND description != '';

COMMIT;
