'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authApi, CurrentUser, LoginResult } from '../api/auth';
import { clearTokens, getRefreshToken, getSessionJti, setTokens } from './token-storage';
import { PUBLIC_PATHS } from '../../middleware';

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  // The customer portal (app/portal/...) has its own completely separate
  // auth mechanism (portal-token-storage.ts, portal-api-client.ts,
  // PortalCustomerGuard on the backend) — a different token, a different
  // secret, a different session model. This provider must never fetch
  // staff /auth/me or redirect to staff /login on a portal route; both
  // of those would be actively wrong for a homeowner who was never
  // meant to have a staff session at all. This check is deliberately
  // the very first thing this component does, before any of its
  // effects below can run.
  //
  // Two ways a portal page gets reached, and the pathname prefix alone
  // only catches one of them:
  //   1. An internal client-side push to a literal '/portal/...' path
  //      (e.g. this file's own router.push, or verify's
  //      router.replace('/portal/dashboard')) — pathname legitimately
  //      starts with '/portal/' here.
  //   2. A direct visit under the portal.* host — middleware.ts rewrites
  //      these server-side (e.g. portal.renovocrm.com/{slug}/verify ->
  //      internal /portal/{slug}/verify), but that rewrite is invisible
  //      to the browser by design: usePathname() on the client still
  //      reports the real, un-prefixed URL (e.g. '/{slug}/verify'), not
  //      the rewritten one. Every portal page reached this way — the
  //      magic-link verify page, portal login, the bare portal root —
  //      previously fell through this check as `false`, so this
  //      provider ran its own staff-session logic on top of the portal's,
  //      and its redirect-to-'/login' raced (and often won) against the
  //      portal's own verification flow, sending customers back to a
  //      "Sign in required" wall even with a valid, freshly-clicked
  //      magic link. Host detection (matching middleware.ts's own
  //      PORTAL_HOST_PREFIX check) closes that gap; the pathname check is
  //      kept too since it's still correct for case 1 and costs nothing.
  const isPortalHost = typeof window !== 'undefined' && window.location.hostname.startsWith('portal.');
  const isPortalRoute = isPortalHost || (pathname?.startsWith('/portal/') ?? false);

  const loadUser = useCallback(async () => {
    if (isPortalRoute) return;
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, [isPortalRoute]);

  // On app boot there's no access token in memory (see token-storage.ts),
  // only a possible refresh token in sessionStorage. Silently attempt a
  // refresh -> fetch /auth/me before rendering anything gated on auth.
  //
  // Critical: the `renovo_session` marker cookie (middleware.ts's only
  // signal) persists for 30 days, but the refresh token it's meant to
  // track lives in sessionStorage — cleared on tab close / new tab. Those
  // two lifetimes can and do diverge: open a new tab weeks into a 30-day
  // marker window and the marker says "logged in" while the token that
  // would prove it is already gone. Previously nothing cleared the
  // marker in that case (only explicit logout did), so middleware kept
  // believing a session existed, sent you to `/`, this component
  // correctly determined you weren't authenticated and sent you back to
  // `/login`, and middleware sent you to `/` again — an infinite loop.
  // Clearing the marker here, whenever this check lands on "not
  // authenticated" for any reason, keeps the marker honest.
  useEffect(() => {
    if (isPortalRoute) {
      setIsLoading(false);
      return;
    }
    (async () => {
      setIsLoading(true);
      if (getRefreshToken()) {
        await loadUser();
      }
      setIsLoading(false);
    })();
  }, [loadUser]);

  // Session-gap fix: clearing the stale marker cookie (above) doesn't get
  // anyone off an already-rendered protected page — middleware.ts only
  // runs on navigation, not on this client-side state change. Previously,
  // landing here on "not authenticated" (new tab / browser restart with
  // the 30-day marker cookie still valid but the actual refresh token
  // already gone from sessionStorage) left the person stranded: every
  // real API call 401s forever, nothing explains why, and nothing offers
  // a way back to /login. Redirect explicitly whenever this lands on "not
  // authenticated" on a route that actually requires it — public pages
  // (login itself, etc.) are expected to render unauthenticated and must
  // never be redirected away from, so they're excluded exactly like
  // middleware.ts excludes them.
  useEffect(() => {
    if (isPortalRoute || isLoading || user) return;
    clearTokens();
    const isPublic = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));
    if (!isPublic) {
      router.push(`/login?redirect=${encodeURIComponent(pathname ?? '/')}`);
    }
  }, [isPortalRoute, isLoading, user, pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authApi.login({ email, password });

      if (!result.requiresCompanySelection) {
        setTokens({ accessToken: result.accessToken!, refreshToken: result.refreshToken! });
        await loadUser();
      }

      return result;
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(getSessionJti());
    } finally {
      clearTokens();
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  const hasPermission = useCallback((permission: string) => !!user?.permissions.includes(permission), [user]);
  const hasAnyPermission = useCallback(
    (permissions: string[]) => !!user && permissions.some((p) => user.permissions.includes(p)),
    [user],
  );
  const hasRole = useCallback((...roles: string[]) => !!user && roles.includes(user.roleName), [user]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refetchUser: loadUser,
      hasPermission,
      hasAnyPermission,
      hasRole,
    }),
    [user, isLoading, login, logout, loadUser, hasPermission, hasAnyPermission, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
