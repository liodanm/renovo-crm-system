-- Job.priority already existed with a CHECK constraint of its own
-- (low/normal/high) — found only by testing this migration against a
-- real database, not caught by the earlier schema/code audit alone.
-- Replaced, not added alongside: the column has zero real usage
-- anywhere in the app (confirmed by exhaustive search — every row is
-- still sitting at the schema default), so there's no existing data to
-- preserve, and the requested 4-level taxonomy (Normal/Follow-up/
-- High/Emergency, mapped to Green/Yellow/Orange/Red) doesn't map onto
-- the old 3-value set cleanly enough to keep both.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_priority_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_priority_check
  CHECK (priority IN ('normal', 'follow_up', 'high', 'emergency'));

CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs (company_id, priority) WHERE priority != 'normal';
