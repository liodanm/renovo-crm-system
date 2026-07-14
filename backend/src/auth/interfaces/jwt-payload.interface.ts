/**
 * Claims embedded in the ACCESS token.
 * The token is always scoped to a single active company — a user who
 * belongs to multiple companies must call POST /auth/switch-company to
 * get a new token pair scoped to a different company. This keeps every
 * downstream permission check a simple claim read, with no per-request
 * DB lookup required.
 */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  companyId: string;
  companyUserId: string; // row id in company_users — used for assignment lookups
  roleId: string;
  roleName: string; // 'owner' | 'admin' | 'dispatcher' | 'crew_lead' | 'crew_member' | 'billing'
  permissions: string[]; // flattened permission keys, e.g. 'invoices.write'
  type: 'access';
  // standard JWT claims (iat/exp/jti) added by the signer
}

/**
 * Refresh tokens intentionally carry almost no data — they are opaque
 * bearer credentials. The server looks up the session by `jti` in Redis
 * to get the associated user/company/device, so a refresh token can be
 * revoked instantly without needing to wait for expiry.
 */
export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // session id — key into Redis session store
  type: 'refresh';
}

export interface AuthenticatedRequestUser {
  userId: string;
  email: string;
  companyId: string;
  companyUserId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}
