-- Customer Management module additions on top of renovo_crm_schema.sql +
-- 000_add_oauth_accounts.sql. Run after both.

BEGIN;

-- ============================================================================
-- CUSTOMER NOTES — free-text notes on a customer profile, distinct from
-- `tasks` (which are actionable to-dos) and `audit_log` (system-generated,
-- immutable). Notes are human-authored, editable, and pinnable.
-- ============================================================================

CREATE TABLE customer_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_customer_notes_customer_id ON customer_notes(customer_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_notes_company_id ON customer_notes(company_id);

CREATE TRIGGER trg_customer_notes_updated_at
  BEFORE UPDATE ON customer_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- DOCUMENTS — generic file attachments (contracts, permits, ID scans),
-- distinct from `photos` (which are job-site before/after imagery with
-- vision-model analysis). Same direct-to-S3 upload pattern as photos.
-- ============================================================================

CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id) ON DELETE CASCADE,
  job_id            UUID REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name         TEXT NOT NULL,
  document_type     TEXT NOT NULL DEFAULT 'other'
                       CHECK (document_type IN ('contract', 'permit', 'id_verification', 'insurance', 'other')),
  s3_key            TEXT NOT NULL,
  mime_type         TEXT,
  file_size_bytes   BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_document_parent CHECK (customer_id IS NOT NULL OR job_id IS NOT NULL)
);

CREATE INDEX idx_documents_company_id ON documents(company_id);
CREATE INDEX idx_documents_customer_id ON documents(customer_id);
CREATE INDEX idx_documents_job_id ON documents(job_id);

-- ============================================================================
-- PHOTOS — extend to allow direct customer-level uploads (e.g. an intake
-- photo of the property taken before any job exists), not just job/
-- property/estimate-scoped ones.
-- ============================================================================

ALTER TABLE photos ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
CREATE INDEX idx_photos_customer_id ON photos(customer_id);

ALTER TABLE photos DROP CONSTRAINT chk_photo_parent;
ALTER TABLE photos ADD CONSTRAINT chk_photo_parent CHECK (
  job_id IS NOT NULL OR property_id IS NOT NULL OR estimate_id IS NOT NULL OR customer_id IS NOT NULL
);

-- ============================================================================
-- CUSTOM FIELDS — company-defined fields on customers (e.g. "Gate code",
-- "Referral source detail", "Preferred contact time"). Definitions are
-- per-company; values are per-entity. `entity_type` is included on both
-- tables so this same pattern can extend to jobs/properties later without
-- a new set of tables.
-- ============================================================================

CREATE TABLE custom_field_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL DEFAULT 'customer' CHECK (entity_type IN ('customer', 'property', 'job')),
  field_key     TEXT NOT NULL,             -- machine key, e.g. 'gate_code'
  label         TEXT NOT NULL,             -- display label, e.g. 'Gate Code'
  field_type    TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select')),
  options       JSONB,                     -- for field_type='select': ['Option A','Option B']
  is_required   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity_type, field_key)
);

CREATE INDEX idx_custom_field_definitions_company ON custom_field_definitions(company_id, entity_type);

CREATE TRIGGER trg_custom_field_definitions_updated_at
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE custom_field_values (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field_definition_id     UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_id               UUID NOT NULL,   -- polymorphic: customers.id / properties.id / jobs.id depending on the definition's entity_type
  value                   JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_definition_id, entity_id)
);

CREATE INDEX idx_custom_field_values_entity ON custom_field_values(entity_id);
CREATE INDEX idx_custom_field_values_company ON custom_field_values(company_id);

CREATE TRIGGER trg_custom_field_values_updated_at
  BEFORE UPDATE ON custom_field_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RLS for the new tables — same tenant-isolation pattern as everything else.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY['customer_notes', 'documents', 'custom_field_definitions', 'custom_field_values'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%1$s ON %1$I
         USING (company_id = current_setting(''app.current_company_id'', true)::uuid)
         WITH CHECK (company_id = current_setting(''app.current_company_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

COMMIT;
