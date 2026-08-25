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
  // Nullable: a permanent document token (see PortalAuthService.
  // getOrCreateDocumentToken) can legitimately belong to a customer with
  // no email on file, sent only via SMS — unlike the original
  // requestMagicLink()/generatePortalLink() login flow, which always
  // required an email before ever generating a link. Widened here to
  // reflect that real, valid scenario rather than pretending it can't
  // happen.
  email: string | null;
  type: 'portal';
}

export interface AuthenticatedPortalCustomer {
  customerId: string;
  companyId: string;
  email: string | null;
}
