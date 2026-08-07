'use client';

/**
 * The portal backend issues one long-lived (30-day) session JWT on magic
 * link verification — there's no refresh-token concept here at all
 * (confirmed directly against portal-auth.service.ts: verifyMagicLink
 * returns only { accessToken }). That's a genuinely different shape than
 * staff auth's access+refresh pair, so this is a small, separate module
 * rather than forcing the portal into staff's token-storage.ts.
 *
 * localStorage (not staff's memory+sessionStorage) is deliberate here —
 * a homeowner expects to stay logged in on their own device for the
 * full 30 days, matching the token's own lifetime, not just per-tab.
 */

const PORTAL_TOKEN_KEY = 'renovo_portal_token';
const PORTAL_SLUG_KEY = 'renovo_portal_company_slug';

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function getPortalCompanySlug(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PORTAL_SLUG_KEY);
}

export function setPortalToken(token: string, companySlug: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PORTAL_TOKEN_KEY, token);
  window.localStorage.setItem(PORTAL_SLUG_KEY, companySlug);
  // Non-httpOnly marker only, no secret — lets middleware.ts avoid
  // flashing a protected portal page before the client redirects. The
  // real authorization boundary is PortalCustomerGuard on the backend,
  // exactly as staff auth's own renovo_session cookie already works.
  document.cookie = `renovo_portal_session=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearPortalToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PORTAL_TOKEN_KEY);
  window.localStorage.removeItem(PORTAL_SLUG_KEY);
  document.cookie = 'renovo_portal_session=; path=/; max-age=0';
}
