-- Consent & Disclosures — Customer-level consent proof.
--
-- Deliberately real Customer columns, not JSONB — this is proof data
-- (what did we ask, when, from where, did they agree) that needs to
-- be queryable/reportable and constrained the same way every other
-- first-class Customer field already is, unlike company-level
-- disclosure TEXT (which reuses the existing companies.settings
-- JSONB — see SettingsService.getConsentDisclosures — no migration
-- needed for that half).
--
-- Transactional SMS/email consent and marketing SMS consent are
-- separate columns on purpose — the entire point of this feature is
-- that one must never imply the other.
--
-- disclosure_hash columns store a SHA-256 of the exact disclosure
-- text shown at the moment consent was given — the smallest possible
-- proof of "which version they saw", explicitly chosen over a full
-- version/history table per the task's own "do not build an
-- elaborate version-control system... a lightweight hash may be
-- sufficient" guidance.
ALTER TABLE customers
  ADD COLUMN sms_consent_at TIMESTAMPTZ,
  ADD COLUMN sms_consent_source VARCHAR(50),
  ADD COLUMN sms_disclosure_hash VARCHAR(64),
  ADD COLUMN email_consent_at TIMESTAMPTZ,
  ADD COLUMN email_consent_source VARCHAR(50),
  ADD COLUMN email_disclosure_hash VARCHAR(64),
  ADD COLUMN marketing_sms_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN marketing_sms_consent_at TIMESTAMPTZ,
  ADD COLUMN marketing_sms_consent_source VARCHAR(50),
  ADD COLUMN marketing_sms_disclosure_hash VARCHAR(64),
  ADD COLUMN marketing_sms_opted_out_at TIMESTAMPTZ;

-- Existing customers: all new columns are nullable (or default false
-- for the boolean) — no backfill needed, no existing data changes
-- meaning, no existing row is retroactively treated as having
-- consented to anything it didn't actually agree to.
