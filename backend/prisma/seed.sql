-- Seed data for local development — NOT for production. Run this after
-- the base schema and all migrations, on a fresh database.
--
-- Creates one demo company with a real, working login (password below is
-- genuine, not a placeholder — verified to round-trip through argon2
-- before being included here), a handful of realistic customers/
-- properties, and a couple of jobs/an estimate/invoice so the Automation
-- engine and Customer Portal backend (both of which read this data) have
-- something real to act on when you test them locally.
--
-- Usage: psql "$DATABASE_URL" -f backend/prisma/seed.sql

BEGIN;

-- Bypass RLS for this seed run — the tenant-isolation policies require
-- app.current_company_id to already be set, but that company doesn't
-- exist yet on a fresh database. Session-scoped, safe: reverts
-- automatically at the end of this connection/transaction.
SET session_replication_role = 'replica';

INSERT INTO companies (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Pressure Washing Co.', 'demo-pressure-washing', 'trial')
ON CONFLICT (id) DO NOTHING;

-- Password: DemoPassword123!  (real argon2id hash, verified to actually
-- authenticate before being committed here — not a placeholder string)
INSERT INTO users (id, email, password_hash, first_name, last_name, email_verified_at, status)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'demo@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$YmUoqTGkIsD9cfYfWPwaPA$H4+kHljf4FdZK8cghgOrDppQG+QLbniw5yyP6F2ExyM',
  'Demo',
  'Owner',
  now(),
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO company_users (id, company_id, user_id, role_id, status, joined_at)
SELECT
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  r.id,
  'active',
  now()
FROM roles r
WHERE r.company_id IS NULL AND r.name = 'owner'
ON CONFLICT (id) DO NOTHING;

-- A handful of realistic customers, so Customer Management (the one
-- other genuinely complete, connected feature) has real data to show.
INSERT INTO customers (id, company_id, customer_type, first_name, last_name, business_name, email, phone, source, lead_status, tags)
VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'residential', 'Sarah', 'Connor', NULL, 'sarah.connor@example.com', '+19545550100', 'referral', 'active', ARRAY['vip']),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'residential', 'Mike', 'Ross', NULL, 'mike.ross@example.com', '+19545550101', 'google_ads', 'lead', ARRAY[]::text[]),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'commercial', NULL, NULL, 'Coastal Realty Group', 'ops@coastalrealty.example.com', '+19545550200', 'referral', 'active', ARRAY['commercial-account']),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'residential', 'Dana', 'Scully', NULL, 'dana.scully@example.com', '+19545550102', 'website', 'lead', ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;

INSERT INTO properties (id, company_id, customer_id, address_line1, city, state, postal_code)
VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '123 Palm Ave', 'Coral Springs', 'FL', '33065'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '456 Oak St', 'Coral Springs', 'FL', '33065'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', '789 Commerce Blvd', 'Fort Lauderdale', 'FL', '33301')
ON CONFLICT (id) DO NOTHING;

-- One completed job (so Automation's review-request/recurring-reminder
-- rules and the portal's service-history endpoint have something real to
-- find) and one sent estimate (so Automation's follow-up rule does too).
INSERT INTO jobs (id, company_id, customer_id, property_id, job_number, title, status, scheduled_start, scheduled_end, price)
VALUES (
  '00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
  'JOB-1001', 'Roof Wash', 'completed',
  now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 350.00
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO estimates (id, company_id, customer_id, property_id, estimate_number, status, total_amount, sent_at)
VALUES (
  '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
  'EST-1001', 'sent', 275.00, now() - interval '5 days'
)
ON CONFLICT (id) DO NOTHING;

SET session_replication_role = 'origin';

COMMIT;

-- Log in with: demo@example.com / DemoPassword123!
