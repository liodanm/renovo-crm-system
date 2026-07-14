-- AI Receptionist tables on top of renovo_crm_schema.sql + the modules that
-- followed it. See ai-receptionist-architecture.md for the full design.

BEGIN;

CREATE TABLE calls (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id          UUID REFERENCES customers(id) ON DELETE SET NULL,
  twilio_call_sid      TEXT NOT NULL UNIQUE,
  direction            TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  from_number          TEXT NOT NULL,
  to_number            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'in_progress'
                          CHECK (status IN ('in_progress', 'completed', 'voicemail', 'transferred', 'missed')),
  outcome              TEXT CHECK (outcome IN ('estimate_scheduled', 'job_rescheduled', 'faq_answered', 'transferred', 'voicemail', 'no_action')),
  transcript           JSONB,
  summary              TEXT,
  summary_structured   JSONB,
  recording_url        TEXT,
  recording_sid        TEXT,
  duration_seconds     INTEGER,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calls_company_id ON calls(company_id, started_at DESC);
CREATE INDEX idx_calls_customer_id ON calls(customer_id);
CREATE INDEX idx_calls_twilio_sid ON calls(twilio_call_sid);

CREATE TABLE faq_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_faq_entries_company_id ON faq_entries(company_id) WHERE is_active = true;

CREATE TABLE receptionist_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  is_enabled             BOOLEAN NOT NULL DEFAULT false,
  greeting               TEXT NOT NULL DEFAULT 'Thanks for calling! How can I help you today?',
  recording_disclosure   TEXT NOT NULL DEFAULT 'This call may be recorded for quality and training purposes.',
  transfer_phone_number  TEXT,
  business_hours         JSONB NOT NULL DEFAULT '{"timezone":"America/New_York","mon":{"open":"08:00","close":"17:00"},"tue":{"open":"08:00","close":"17:00"},"wed":{"open":"08:00","close":"17:00"},"thu":{"open":"08:00","close":"17:00"},"fri":{"open":"08:00","close":"17:00"},"sat":null,"sun":null}',
  voicemail_enabled      BOOLEAN NOT NULL DEFAULT true,
  twilio_phone_number    TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS — same tenant-isolation pattern as every other table.
DO $$
DECLARE
  t TEXT;
  new_tables TEXT[] := ARRAY['calls', 'faq_entries', 'receptionist_settings'];
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
