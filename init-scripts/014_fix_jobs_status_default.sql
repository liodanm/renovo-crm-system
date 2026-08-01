-- Small, standalone fix requested before Phase 2: the jobs.status column
-- still carried its original DEFAULT 'scheduled' from the base schema.
-- Harmless today since every application code path explicitly sets
-- status on insert, but leaving it mismatched is exactly the kind of
-- drift that causes a confusing bug later (e.g. a future raw INSERT or
-- admin tool that omits status and silently gets 'scheduled' instead of
-- 'draft'). Bringing the two back into agreement now, while it's simple.

BEGIN;

ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'draft';

COMMIT;
