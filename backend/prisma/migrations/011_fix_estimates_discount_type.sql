BEGIN;

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('fixed', 'percentage'));

INSERT INTO permissions (key, category, description) VALUES
  ('estimates.profitability', 'estimates', 'View estimated cost and profit margin on estimates')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name IN ('owner', 'admin') AND p.key = 'estimates.profitability'
ON CONFLICT DO NOTHING;

COMMIT;