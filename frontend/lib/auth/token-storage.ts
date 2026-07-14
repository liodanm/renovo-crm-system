'use client';

/**
 * Access token: kept in memory only (a module-level variable), NEVER in
 * localStorage — this closes off the most common XSS-driven token theft
 * vector (a compromised third-party script reading localStorage). It's
 * lost on hard refresh by design; `initializeAuth()` (called once on app
 * boot) silently calls /auth/refresh using the refresh token to repopulate
 * it.
 *
 * Refresh token: also avoided in localStorage. In this reference
 * implementation it's kept in memory alongside the access token AND
 * mirrored to sessionStorage so a refresh doesn't force a full re-login
 * during local development. For production, prefer having the backend set
 * the refresh token as an httpOnly, Secure, SameSite=Strict cookie instead
 * (see the commented alternative in api-client.ts) — that removes it from
 * JS-reachable storage entirely, which is strictly stronger against XSS.
 */

let accessToken: string | null = null;
let refreshToken: string | null = null;
let currentSessionJti: string | null = null;

const REFRESH_TOKEN_STORAGE_KEY = 'renovo_refresh_token_dev_only';

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  if (refreshToken) return refreshToken;
  if (typeof window !== 'undefined') {
    refreshToken = window.sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }
  return refreshToken;
}

export function getSessionJti() {
  return currentSessionJti;
}

export function setTokens(next: { accessToken: string; refreshToken: string }) {
  accessToken = next.accessToken;
  refreshToken = next.refreshToken;
  currentSessionJti = decodeJtiFromRefreshToken(next.refreshToken);

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, next.refreshToken);
    // Non-httpOnly marker ONLY — carries no secret, just lets middleware.ts
    // avoid flashing protected pages before the client redirects. Expires
    // in line with the refresh token TTL; the real auth check is server-side.
    document.cookie = `renovo_session=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  currentSessionJti = null;
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    document.cookie = 'renovo_session=; path=/; max-age=0';
  }
}

function decodeJtiFromRefreshToken(token: string): string | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.jti ?? null;
  } catch {
    return null;
  }
}
