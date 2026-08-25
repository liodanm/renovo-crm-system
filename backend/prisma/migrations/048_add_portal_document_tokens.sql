-- Reuses PasswordService's existing generateSecureToken()/hashToken()
-- (32 random bytes, SHA-256 hash) — the exact same primitives the
-- Redis magic-link system already uses, just persisted in Postgres
-- instead of Redis-with-a-TTL, and never deleted on use. The raw token
-- never touches this table — only its hash does.
CREATE TABLE portal_document_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES companies(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  -- Exactly one of these two is set — a document token is always for
  -- one specific Estimate or one specific Invoice, never both, never
  -- neither. Enforced below, not just documented in a comment.
  estimate_id UUID REFERENCES estimates(id),
  invoice_id UUID REFERENCES invoices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT portal_document_tokens_exactly_one_document
    CHECK ((estimate_id IS NOT NULL AND invoice_id IS NULL) OR (estimate_id IS NULL AND invoice_id IS NOT NULL))
);

CREATE INDEX idx_portal_document_tokens_company_id ON portal_document_tokens(company_id);
CREATE INDEX idx_portal_document_tokens_customer_id ON portal_document_tokens(customer_id);
CREATE INDEX idx_portal_document_tokens_estimate_id ON portal_document_tokens(estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX idx_portal_document_tokens_invoice_id ON portal_document_tokens(invoice_id) WHERE invoice_id IS NOT NULL;
-- Backs "reuse the existing active token for this document/customer
-- instead of minting a new one on every resend" — one partial unique
-- index per document type, active tokens only (a revoked token must
-- not block issuing a fresh replacement).
CREATE UNIQUE INDEX idx_portal_document_tokens_active_estimate ON portal_document_tokens(estimate_id) WHERE estimate_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX idx_portal_document_tokens_active_invoice ON portal_document_tokens(invoice_id) WHERE invoice_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE portal_document_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_document_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_portal_document_tokens ON portal_document_tokens
  USING (company_id = current_setting('app.current_company_id', true)::uuid)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);

-- Same idempotency pattern automation_log already uses (company_id +
-- dedupe_key, ON CONFLICT DO NOTHING) — not a new mechanism invented
-- for this feature. Nullable/no uniqueness on its own; the real
-- guarantee is the composite index below.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_company_dedupe ON notifications(company_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- S3-backed signature storage for NEW signatures going forward.
-- estimates.signature_data_url (existing base64 column) is
-- deliberately left untouched — every existing accepted estimate keeps
-- reading from it exactly as before. New acceptances write here
-- instead; nothing reads/writes both at once for the same row.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS signature_s3_key TEXT;

COMMENT ON COLUMN estimates.signature_s3_key IS
  'S3 object key for the customer signature, e.g. {companyId}/documents/estimates/{estimateId}/signature-{uuid}.png. Private, never publicly readable — access only via short-lived signed URLs for authorized staff. New acceptances write here; signature_data_url (base64-in-Postgres) is kept for existing rows and is not backfilled.';
