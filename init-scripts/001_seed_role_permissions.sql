-- Binds the six system roles (seeded in renovo_crm_schema.sql) to actual
-- permissions (also seeded there, but never bound to a role). Without this,
-- every access token's `permissions[]` claim is empty regardless of role,
-- and every @RequirePermissions() guard in the app rejects everyone but
-- would-be superusers. Run after renovo_crm_schema.sql.

BEGIN;

-- owner: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- admin: everything except billing.manage (Renovo's own subscription billing
-- is owner-only; customer invoicing/payments are NOT gated by that permission)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'admin' AND p.key != 'billing.manage'
ON CONFLICT DO NOTHING;

-- dispatcher: customers, jobs, estimates, crew scheduling — no financials, no admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'dispatcher'
  AND p.key IN ('customers.read', 'customers.write', 'jobs.read', 'jobs.write',
                'estimates.read', 'estimates.write', 'crews.manage')
ON CONFLICT DO NOTHING;

-- crew_lead: sees their jobs and the customer context, can update job status/notes
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'crew_lead'
  AND p.key IN ('jobs.read', 'jobs.write', 'customers.read')
ON CONFLICT DO NOTHING;

-- crew_member: read-only access to their assigned jobs
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'crew_member'
  AND p.key IN ('jobs.read')
ON CONFLICT DO NOTHING;

-- billing: invoices, payments, estimates, and read-only customer lookup
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.company_id IS NULL AND r.name = 'billing'
  AND p.key IN ('invoices.read', 'invoices.write', 'payments.write',
                'estimates.read', 'customers.read')
ON CONFLICT DO NOTHING;

COMMIT;
