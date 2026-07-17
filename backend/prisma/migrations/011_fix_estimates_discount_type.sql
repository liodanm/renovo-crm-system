-- Migration 010 was applied piecemeal across earlier attempts (confirmed
-- by directly inspecting the live database): estimate_line_items, users,
-- and companies already have every column that migration added. Only
-- estimates.discount_type never landed, and since 010 is one all-or-
-- nothing transaction, re-running it in full kept failing on columns
-- that already existed elsewhere before it ever reached this one.
--
-- IF NOT EXISTS makes this specific fix safe to run any number of
-- times, regardless of what state the database is actually in — the
-- guarantee the original migration should have had from the start.

BEGIN;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('fixed', 'percentage'));

-- Also re-run idempotently, in case the permission itself didn't survive
-- the same partial-application history — ON CONFLICT DO NOTHING was
-- already correct here, just confirming it stays that way.
INSERT INTO permissions (key, category, description) VALUES
  ('estimates.profitability', 'estimates', 'View estimated cost and profit margin on estimates')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'estimates.profitability'
ON CONFLICT DO NOTHING;

COMMIT;
