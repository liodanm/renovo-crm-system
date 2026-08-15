BEGIN;

ALTER TABLE estimate_line_items ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE job_line_items      ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE invoice_line_items  ADD COLUMN IF NOT EXISTS custom_service_name TEXT;

ALTER TABLE estimate_line_items ALTER COLUMN description DROP NOT NULL;
ALTER TABLE job_line_items      ALTER COLUMN description DROP NOT NULL;
ALTER TABLE invoice_line_items  ALTER COLUMN description DROP NOT NULL;

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
