-- Adds Google/Microsoft OAuth account linking on top of renovo_crm_schema.sql.
-- Run this AFTER the base schema has been applied.

BEGIN;

CREATE TABLE oauth_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_account_id   TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);

-- Users created purely via OAuth have no password_hash; make that explicit
-- (already nullable in the base schema, this just documents the intent).
COMMENT ON COLUMN users.password_hash IS
  'Null when the user has only ever authenticated via OAuth (Google/Microsoft). '
  'A user can add a password later via "Set password" in account settings.';

COMMIT;
