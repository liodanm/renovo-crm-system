-- Fixes a real bug found during audit: roles.company_id is intentionally
-- nullable (NULL = a shared system role like 'owner'/'admin', visible to
-- every company; non-NULL = a company's own custom role). The original RLS
-- policy `company_id = current_setting(...)::uuid` can never match a NULL
-- company_id — SQL's NULL comparison semantics mean this excluded every
-- system role from every query, for every tenant, always. Verified against
-- a live Postgres instance with a non-superuser role and a correctly-set
-- tenant context: the 'owner' role was invisible, which would break
-- registration, login, and every permission check in the application.

BEGIN;

DROP POLICY IF EXISTS tenant_isolation_roles ON roles;

CREATE POLICY tenant_isolation_roles ON roles
  USING (company_id = current_setting('app.current_company_id', true)::uuid OR company_id IS NULL)
  WITH CHECK (company_id = current_setting('app.current_company_id', true)::uuid);
  -- WITH CHECK intentionally does NOT allow NULL — application code should
  -- never be able to INSERT/UPDATE a row into shared system-role space;
  -- only the read side needs the OR company_id IS NULL branch.

COMMIT;
