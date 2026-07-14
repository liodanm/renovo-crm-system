-- ============================================================================
-- RENOVO CRM — PRODUCTION POSTGRESQL SCHEMA
-- Multi-tenant SaaS CRM for pressure washing companies
-- Postgres 16+
--
-- Conventions:
--   - Every tenant-owned table carries `company_id` and is protected by RLS.
--   - Primary keys: UUID (gen_random_uuid()) — safe for client-generated IDs,
--     offline mobile sync, and no leakage of row-count/sequence info.
--   - Money: NUMERIC(12,2). Never FLOAT for currency.
--   - Timestamps: TIMESTAMPTZ everywhere, stored UTC.
--   - Status/type/role fields: TEXT + CHECK constraint rather than native
--     Postgres ENUM — enums are painful to alter in production (ADD VALUE
--     requires care with transactions); CHECK constraints are trivially
--     migrated with a single ALTER TABLE.
--   - Soft delete via `deleted_at` on customer-facing/financial records that
--     must be retained for audit/compliance; hard delete elsewhere via FK
--     ON DELETE rules.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy/ILIKE search on names, addresses
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- exclusion constraints (e.g. no double-booked crew)
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email columns

-- ============================================================================
-- 0.1 SHARED TRIGGER FUNCTION: auto-maintain updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. TENANCY ROOT: COMPANIES
-- ============================================================================

CREATE TABLE companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,               -- used for subdomain routing
  legal_name          TEXT,
  industry            TEXT NOT NULL DEFAULT 'pressure_washing',
  email               TEXT,
  phone               TEXT,
  website             TEXT,
  logo_url            TEXT,
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  state               TEXT,
  postal_code         TEXT,
  country             TEXT NOT NULL DEFAULT 'US',
  status              TEXT NOT NULL DEFAULT 'trial'
                        CHECK (status IN ('trial','active','suspended','cancelled')),
  trial_ends_at       TIMESTAMPTZ,
  stripe_customer_id  TEXT UNIQUE,                        -- Renovo's own Stripe customer (subscription billing)
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- feature flags, branding, default tax rate, etc.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_companies_status ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_slug_trgm ON companies USING gin (slug gin_trgm_ops);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2. USERS (global identity — a user MAY belong to multiple companies)
-- ============================================================================

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT NOT NULL UNIQUE,
  phone               TEXT,
  password_hash       TEXT,                                -- null if SSO-only
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  avatar_url          TEXT,
  mfa_enabled         BOOLEAN NOT NULL DEFAULT false,
  mfa_secret          TEXT,
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','disabled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. PERMISSIONS / ROLES (RBAC)
--    permissions   -> global catalog of grantable actions
--    roles         -> named bundles of permissions; system defaults (company_id
--                     NULL) plus optional per-company custom roles
--    role_permissions -> join table
--    company_users -> assigns a user a role within a specific company
-- ============================================================================

CREATE TABLE permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,        -- e.g. 'invoices.write', 'jobs.delete'
  category      TEXT NOT NULL,               -- e.g. 'billing', 'jobs', 'customers'
  description   TEXT NOT NULL
);

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = system-defined role
  name            TEXT NOT NULL,             -- 'owner','admin','dispatcher','crew_lead','crew_member','billing'
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_roles_company_id ON roles(company_id);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE company_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id             UUID NOT NULL REFERENCES roles(id),
  status              TEXT NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited','active','suspended')),
  invited_by_user_id  UUID REFERENCES users(id),
  invited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_users_company_id ON company_users(company_id);
CREATE INDEX idx_company_users_user_id ON company_users(user_id);
CREATE INDEX idx_company_users_role_id ON company_users(role_id);

CREATE TRIGGER trg_company_users_updated_at
  BEFORE UPDATE ON company_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. CREWS (needed for job/appointment/equipment assignment)
-- ============================================================================

CREATE TABLE crews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crews_company_id ON crews(company_id);

CREATE TRIGGER trg_crews_updated_at
  BEFORE UPDATE ON crews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE crew_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crew_id           UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  company_user_id   UUID NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  role_in_crew      TEXT NOT NULL DEFAULT 'member' CHECK (role_in_crew IN ('lead','member')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crew_id, company_user_id)
);

CREATE INDEX idx_crew_members_company_id ON crew_members(company_id);
CREATE INDEX idx_crew_members_crew_id ON crew_members(crew_id);

-- ============================================================================
-- 5. CUSTOMERS
-- ============================================================================

CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_type     TEXT NOT NULL DEFAULT 'residential'
                       CHECK (customer_type IN ('residential','commercial')),
  first_name        TEXT,
  last_name         TEXT,
  business_name     TEXT,
  email             CITEXT,
  phone             TEXT,
  secondary_phone   TEXT,
  source            TEXT,                          -- 'google_ads','referral','website','door_hanger', etc.
  lead_status       TEXT NOT NULL DEFAULT 'lead'
                       CHECK (lead_status IN ('lead','active','inactive','churned')),
  lifetime_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT chk_customer_has_name CHECK (
    first_name IS NOT NULL OR business_name IS NOT NULL
  )
);

CREATE INDEX idx_customers_company_id ON customers(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_email ON customers(company_id, email);
CREATE INDEX idx_customers_phone ON customers(company_id, phone);
CREATE INDEX idx_customers_lead_status ON customers(company_id, lead_status);
CREATE INDEX idx_customers_name_trgm ON customers USING gin (
  (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(business_name,'')) gin_trgm_ops
);
CREATE INDEX idx_customers_tags ON customers USING gin (tags);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. PROPERTIES (serviced addresses — a customer can have multiple)
-- ============================================================================

CREATE TABLE properties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label             TEXT,                           -- 'Main House', 'Rental #2'
  address_line1     TEXT NOT NULL,
  address_line2     TEXT,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  postal_code       TEXT NOT NULL,
  country           TEXT NOT NULL DEFAULT 'US',
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  square_footage    INTEGER,
  surface_types     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ['driveway','siding','roof','deck']
  access_notes      TEXT,
  gate_code         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_properties_company_id ON properties(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_customer_id ON properties(customer_id);
CREATE INDEX idx_properties_geo ON properties(latitude, longitude);
CREATE INDEX idx_properties_postal_code ON properties(company_id, postal_code);

CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 7. EQUIPMENT
-- ============================================================================

CREATE TABLE equipment (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  equipment_type      TEXT NOT NULL
                        CHECK (equipment_type IN
                          ('pressure_washer','surface_cleaner','vehicle','generator','hose_reel','other')),
  serial_number       TEXT,
  purchase_date       DATE,
  purchase_cost       NUMERIC(12,2),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','maintenance','retired')),
  assigned_crew_id    UUID REFERENCES crews(id) ON DELETE SET NULL,
  last_service_date   DATE,
  next_service_due    DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_company_id ON equipment(company_id);
CREATE INDEX idx_equipment_crew_id ON equipment(assigned_crew_id);
CREATE INDEX idx_equipment_status ON equipment(company_id, status);
CREATE INDEX idx_equipment_next_service ON equipment(company_id, next_service_due)
  WHERE status = 'active';

CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE equipment_maintenance_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id        UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  performed_at        DATE NOT NULL,
  description         TEXT NOT NULL,
  cost                NUMERIC(12,2),
  performed_by_user_id UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equip_maint_company_id ON equipment_maintenance_logs(company_id);
CREATE INDEX idx_equip_maint_equipment_id ON equipment_maintenance_logs(equipment_id);

-- ============================================================================
-- 8. ESTIMATES (quotes) + line items
-- ============================================================================

CREATE TABLE estimates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id       UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  estimate_number   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','sent','viewed','accepted','declined','expired')),
  ai_generated      BOOLEAN NOT NULL DEFAULT false,
  ai_conversation_id UUID,                            -- FK added after ai_conversations exists
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_until       DATE,
  sent_at           TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  decline_reason    TEXT,
  notes             TEXT,
  terms             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, estimate_number)
);

CREATE INDEX idx_estimates_company_id ON estimates(company_id);
CREATE INDEX idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX idx_estimates_property_id ON estimates(property_id);
CREATE INDEX idx_estimates_status ON estimates(company_id, status);

CREATE TRIGGER trg_estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE estimate_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id   UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_estimate_line_items_estimate_id ON estimate_line_items(estimate_id);

-- ============================================================================
-- 9. JOBS + line items
-- ============================================================================

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  estimate_id         UUID REFERENCES estimates(id) ON DELETE SET NULL,
  job_number          TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  service_type        TEXT,                            -- 'driveway_wash','roof_cleaning','deck_staining'...
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','in_progress','completed','cancelled','on_hold')),
  priority            TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  scheduled_start     TIMESTAMPTZ,
  scheduled_end       TIMESTAMPTZ,
  actual_start        TIMESTAMPTZ,
  actual_end          TIMESTAMPTZ,
  assigned_crew_id    UUID REFERENCES crews(id) ON DELETE SET NULL,
  price               NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  cancellation_reason TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_number),
  CONSTRAINT chk_job_schedule CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end >= scheduled_start)
);

CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_property_id ON jobs(property_id);
CREATE INDEX idx_jobs_crew_schedule ON jobs(company_id, assigned_crew_id, scheduled_start);
CREATE INDEX idx_jobs_status ON jobs(company_id, status);
CREATE INDEX idx_jobs_scheduled_start ON jobs(company_id, scheduled_start);

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_job_line_items_job_id ON job_line_items(job_id);

-- ============================================================================
-- 10. APPOINTMENTS (calendar events: job visits, estimate visits, consults)
-- ============================================================================

CREATE TABLE appointments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_type          TEXT NOT NULL DEFAULT 'job'
                               CHECK (appointment_type IN ('job','estimate_visit','consultation','follow_up')),
  job_id                    UUID REFERENCES jobs(id) ON DELETE CASCADE,
  estimate_id               UUID REFERENCES estimates(id) ON DELETE CASCADE,
  customer_id               UUID REFERENCES customers(id) ON DELETE CASCADE,
  property_id               UUID REFERENCES properties(id) ON DELETE SET NULL,
  title                     TEXT NOT NULL,
  starts_at                 TIMESTAMPTZ NOT NULL,
  ends_at                   TIMESTAMPTZ NOT NULL,
  all_day                   BOOLEAN NOT NULL DEFAULT false,
  assigned_to_company_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  status                    TEXT NOT NULL DEFAULT 'scheduled'
                               CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  reminder_sent_at          TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_appt_time CHECK (ends_at >= starts_at)
);

CREATE INDEX idx_appointments_company_id ON appointments(company_id);
CREATE INDEX idx_appointments_job_id ON appointments(job_id);
CREATE INDEX idx_appointments_assigned_user ON appointments(assigned_to_company_user_id, starts_at);
CREATE INDEX idx_appointments_range ON appointments(company_id, starts_at, ends_at);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 11. TASKS (general to-dos, optionally linked to any entity)
-- ============================================================================

CREATE TABLE tasks (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                       TEXT NOT NULL,
  description                 TEXT,
  related_entity_type         TEXT CHECK (related_entity_type IN
                                 ('job','customer','estimate','invoice','general')),
  related_entity_id           UUID,                     -- polymorphic; validated at app layer
  assigned_to_company_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  due_date                    DATE,
  priority                    TEXT NOT NULL DEFAULT 'normal'
                                 CHECK (priority IN ('low','normal','high','urgent')),
  status                      TEXT NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','in_progress','completed','cancelled')),
  completed_at                TIMESTAMPTZ,
  created_by                  UUID REFERENCES users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_company_id ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_user ON tasks(assigned_to_company_user_id, status);
CREATE INDEX idx_tasks_related_entity ON tasks(related_entity_type, related_entity_id);
CREATE INDEX idx_tasks_due_date ON tasks(company_id, due_date) WHERE status NOT IN ('completed','cancelled');

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 12. INVOICES + line items + PAYMENTS
-- ============================================================================

CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
  estimate_id       UUID REFERENCES estimates(id) ON DELETE SET NULL,
  invoice_number    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','sent','partial','paid','overdue','void')),
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  due_date          DATE,
  sent_at           TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  notes             TEXT,
  terms             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_job_id ON invoices(job_id);
CREATE INDEX idx_invoices_status ON invoices(company_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(company_id, due_date) WHERE status IN ('sent','partial','overdue');

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);

CREATE TABLE payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id                UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id               UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount                    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method                    TEXT NOT NULL CHECK (method IN ('card','ach','cash','check','other')),
  status                    TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  stripe_payment_intent_id  TEXT,
  stripe_charge_id          TEXT,
  refunded_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  processed_at              TIMESTAMPTZ,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_company_id ON payments(company_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_stripe_pi ON payments(stripe_payment_intent_id);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 13. PHOTOS (media assets — before/after, damage, equipment)
-- ============================================================================

CREATE TABLE photos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id              UUID REFERENCES jobs(id) ON DELETE CASCADE,
  property_id         UUID REFERENCES properties(id) ON DELETE CASCADE,
  estimate_id         UUID REFERENCES estimates(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id),
  photo_type          TEXT NOT NULL DEFAULT 'other'
                        CHECK (photo_type IN ('before','after','during','damage','equipment','other')),
  s3_key_original     TEXT NOT NULL,
  s3_key_thumbnail    TEXT,
  s3_key_web          TEXT,
  file_size_bytes     BIGINT,
  mime_type           TEXT,
  width               INTEGER,
  height              INTEGER,
  ai_analysis         JSONB,                      -- vision model output: surface condition, tags, quality score
  is_public_showcase  BOOLEAN NOT NULL DEFAULT false,
  taken_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_photo_parent CHECK (
    job_id IS NOT NULL OR property_id IS NOT NULL OR estimate_id IS NOT NULL
  )
);

CREATE INDEX idx_photos_company_id ON photos(company_id);
CREATE INDEX idx_photos_job_id ON photos(job_id);
CREATE INDEX idx_photos_property_id ON photos(property_id);
CREATE INDEX idx_photos_showcase ON photos(company_id) WHERE is_public_showcase = true;
CREATE INDEX idx_photos_ai_analysis_gin ON photos USING gin (ai_analysis);

-- ============================================================================
-- 14. AI CONVERSATIONS + messages
-- ============================================================================

CREATE TABLE ai_conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
  context_type          TEXT NOT NULL DEFAULT 'general'
                           CHECK (context_type IN
                             ('general','quote_generation','customer_support','lead_scoring','review_response')),
  related_entity_type   TEXT CHECK (related_entity_type IN ('job','estimate','customer','review')),
  related_entity_id     UUID,
  title                 TEXT,
  model                 TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_conversations_company_id ON ai_conversations(company_id);
CREATE INDEX idx_ai_conversations_related_entity ON ai_conversations(related_entity_type, related_entity_id);

CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- backfill the FK from estimates -> ai_conversations now that the table exists
ALTER TABLE estimates
  ADD CONSTRAINT fk_estimates_ai_conversation
  FOREIGN KEY (ai_conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL;

CREATE TABLE ai_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content          TEXT NOT NULL,
  tool_calls       JSONB,
  tokens_used      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id, created_at);

-- ============================================================================
-- 15. MESSAGES (customer-facing threads: SMS/email/in-app)
-- ============================================================================

CREATE TABLE message_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('sms','email','in_app')),
  subject         TEXT,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_threads_company_id ON message_threads(company_id);
CREATE INDEX idx_message_threads_customer_id ON message_threads(customer_id);
CREATE INDEX idx_message_threads_last_message ON message_threads(company_id, last_message_at DESC);

CREATE TRIGGER trg_message_threads_updated_at
  BEFORE UPDATE ON message_threads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  thread_id            UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_type          TEXT NOT NULL CHECK (sender_type IN ('user','customer','system','ai')),
  sender_user_id       UUID REFERENCES users(id),
  sender_customer_id   UUID REFERENCES customers(id),
  body                 TEXT NOT NULL,
  attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT NOT NULL DEFAULT 'queued'
                          CHECK (status IN ('queued','sent','delivered','failed','read')),
  external_message_id  TEXT,                      -- Twilio SID / provider message id
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_company_id ON messages(company_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id, created_at);

-- ============================================================================
-- 16. NOTIFICATIONS (in-app/email/sms/push to internal users)
-- ============================================================================

CREATE TABLE notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type     TEXT NOT NULL,             -- 'job_assigned','invoice_overdue','review_received', ...
  title                 TEXT NOT NULL,
  body                  TEXT,
  related_entity_type   TEXT,
  related_entity_id     UUID,
  channel               TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','sms','push')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','read')),
  read_at               TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE status != 'read';
CREATE INDEX idx_notifications_company_id ON notifications(company_id);

-- ============================================================================
-- 17. AUTOMATIONS (workflow engine)
-- ============================================================================

CREATE TABLE automations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  trigger_type   TEXT NOT NULL CHECK (trigger_type IN
                    ('job_completed','estimate_sent','invoice_overdue','customer_created',
                     'review_received','schedule_based','manual')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_company_id ON automations(company_id);
CREATE INDEX idx_automations_trigger_type ON automations(company_id, trigger_type) WHERE is_active = true;

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE automation_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  automation_id  UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  action_type    TEXT NOT NULL CHECK (action_type IN
                    ('send_email','send_sms','create_task','update_status','ai_generate','webhook')),
  action_config  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_automation_steps_automation_id ON automation_steps(automation_id, sort_order);

CREATE TABLE automation_runs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  automation_id             UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  triggered_by_entity_type  TEXT,
  triggered_by_entity_id    UUID,
  status                    TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','running','completed','failed')),
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  error_message             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_company_id ON automation_runs(company_id);
CREATE INDEX idx_automation_runs_automation_id ON automation_runs(automation_id, created_at DESC);

-- ============================================================================
-- 18. REVIEWS + review requests
-- ============================================================================

CREATE TABLE reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  job_id              UUID REFERENCES jobs(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL CHECK (platform IN ('google','yelp','facebook','internal')),
  rating              SMALLINT CHECK (rating BETWEEN 1 AND 5),
  review_text         TEXT,
  reviewer_name       TEXT,
  platform_review_id  TEXT,
  ai_draft_response   TEXT,
  response_text       TEXT,
  responded_at        TIMESTAMPTZ,
  review_date         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_company_id ON reviews(company_id);
CREATE INDEX idx_reviews_rating ON reviews(company_id, rating);
CREATE INDEX idx_reviews_platform ON reviews(company_id, platform);
CREATE UNIQUE INDEX uq_reviews_platform_review_id ON reviews(company_id, platform, platform_review_id)
  WHERE platform_review_id IS NOT NULL;

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE review_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('sms','email')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','clicked','completed')),
  sent_at      TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_requests_company_id ON review_requests(company_id);
CREATE INDEX idx_review_requests_customer_id ON review_requests(customer_id);

-- ============================================================================
-- 19. MARKETING CAMPAIGNS + recipients
-- ============================================================================

CREATE TABLE marketing_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  campaign_type    TEXT NOT NULL CHECK (campaign_type IN ('email','sms')),
  status           TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  subject          TEXT,
  content          TEXT NOT NULL,
  target_segment   JSONB NOT NULL DEFAULT '{}'::jsonb,   -- filter definition, e.g. {"lead_status":"inactive"}
  scheduled_at     TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketing_campaigns_company_id ON marketing_campaigns(company_id);
CREATE INDEX idx_marketing_campaigns_status ON marketing_campaigns(company_id, status);

CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sent','delivered','opened','clicked','failed','unsubscribed')),
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_customer_id ON campaign_recipients(customer_id);

-- ============================================================================
-- 20. SUBSCRIPTIONS (Renovo's own billing of the tenant company)
-- ============================================================================

CREATE TABLE subscription_plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL UNIQUE,          -- 'Starter','Growth','Pro'
  stripe_price_id        TEXT UNIQUE,
  price_monthly          NUMERIC(10,2) NOT NULL,
  price_annual           NUMERIC(10,2),
  max_users              INTEGER,
  max_jobs_per_month     INTEGER,
  features               JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  stripe_subscription_id  TEXT UNIQUE,
  status                  TEXT NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing','active','past_due','canceled','unpaid')),
  seats                   INTEGER NOT NULL DEFAULT 1,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  canceled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_subscriptions_active_company ON subscriptions(company_id)
  WHERE status IN ('trialing','active','past_due');
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 21. AUDIT LOG
-- ============================================================================

CREATE TABLE audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,               -- 'create','update','delete','send','void', ...
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  diff           JSONB,
  ip_address     INET,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_company_id ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- ============================================================================
-- 22. ROW LEVEL SECURITY — tenant isolation on every company-owned table
--     App sets: SET LOCAL app.current_company_id = '<uuid>'; per request/txn.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'roles','company_users','crews','crew_members',
    'customers','properties','equipment','equipment_maintenance_logs',
    'estimates','estimate_line_items','jobs','job_line_items',
    'appointments','tasks','invoices','invoice_line_items','payments',
    'photos','ai_conversations','ai_messages','message_threads','messages',
    'notifications','automations','automation_steps','automation_runs',
    'reviews','review_requests','marketing_campaigns','campaign_recipients',
    'subscriptions','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
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

-- The `companies` table itself is the tenant root: application-layer scoping
-- (a user may only ever query companies they belong to via company_users)
-- rather than RLS on company_id, since companies has no company_id column.

-- ============================================================================
-- 23. SEED: system default roles + baseline permission catalog
-- ============================================================================

INSERT INTO permissions (key, category, description) VALUES
  ('customers.read',   'customers', 'View customers'),
  ('customers.write',  'customers', 'Create/edit customers'),
  ('jobs.read',        'jobs',      'View jobs'),
  ('jobs.write',       'jobs',      'Create/edit jobs'),
  ('jobs.delete',      'jobs',      'Delete/cancel jobs'),
  ('estimates.read',   'estimates', 'View estimates'),
  ('estimates.write',  'estimates', 'Create/edit/send estimates'),
  ('invoices.read',    'billing',   'View invoices'),
  ('invoices.write',   'billing',   'Create/edit/send invoices'),
  ('payments.write',   'billing',   'Record/refund payments'),
  ('crews.manage',     'crews',     'Manage crews and assignments'),
  ('settings.manage',  'settings',  'Manage company settings'),
  ('billing.manage',   'settings',  'Manage Renovo subscription/billing'),
  ('users.manage',     'settings',  'Invite/manage team members and roles');

INSERT INTO roles (company_id, name, description, is_system_role) VALUES
  (NULL, 'owner',       'Full access including billing and tenant settings', true),
  (NULL, 'admin',       'Full operational access, no billing/tenant deletion', true),
  (NULL, 'dispatcher',  'Jobs, scheduling, customers — no financials', true),
  (NULL, 'crew_lead',   'Assigned jobs, photo upload, timeclock, limited customer view', true),
  (NULL, 'crew_member', 'Assigned jobs, photo upload, timeclock only', true),
  (NULL, 'billing',     'Invoices, payments, subscription — read-only elsewhere', true);

COMMIT;
