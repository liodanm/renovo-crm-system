/**
 * Deliberately NOT the same shape as the staff AccessTokenPayload (see
 * auth/interfaces/jwt-payload.interface.ts) — a customer portal token
 * should be structurally incapable of being mistaken for (or reused as) a
 * staff token. Signed with its own secret (PORTAL_JWT_SECRET), never the
 * staff JWT_ACCESS_SECRET, so a leak of one credential type can't be
 * replayed against the other surface.
 */
export interface PortalTokenPayload {
  sub: string; // customer id — NOT a user id; customers aren't `users` in this system
  companyId: string;
  email: string;
  type: 'portal';
}

export interface AuthenticatedPortalCustomer {
  customerId: string;
  companyId: string;
  email: string;
}
