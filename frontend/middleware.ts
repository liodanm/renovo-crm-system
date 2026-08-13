import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware can't read the in-memory access token (it lives in JS memory
 * in the browser tab, not a cookie), so it can only make a coarse call
 * based on the presence of a lightweight "logged in" marker cookie that
 * the frontend sets alongside the tokens (see auth-context.tsx — set a
 * non-httpOnly `renovo_session=1` cookie on login/refresh, cleared on
 * logout). This is NOT a security boundary by itself — it just avoids an
 * authenticated-looking flash of a protected page before the client-side
 * AuthProvider redirects. The real authorization boundary is the backend's
 * guards (JwtAuthGuard / RolesGuard / PermissionsGuard), which is where
 * this MUST be enforced regardless of what the frontend does.
 */

export const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/select-company',
  '/accept-invite',
  '/auth/callback',
];

// The customer portal's own public paths — deliberately a separate list,
// never merged with PUBLIC_PATHS above. Login/verify are dynamic,
// per-company routes (/portal/:companySlug/login, .../verify) — checked
// by pattern, not exact match, since the slug varies per company.
function isPortalPublicPath(pathname: string): boolean {
  return /^\/portal\/[^/]+\/(login|verify)/.test(pathname);
}

const PORTAL_HOST_PREFIX = 'portal.';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Host-based routing for the customer portal — portal.renovocrm.com
  // rewrites internally to the real /portal/... path segment (see
  // app/portal/), while the exact same deployment continues serving
  // renovocrm.com as the staff app untouched. This is a rewrite (the
  // URL the customer sees stays clean, e.g. portal.renovocrm.com/dashboard),
  // not a redirect.
  if (host.startsWith(PORTAL_HOST_PREFIX)) {
    // The bare '/portal' path needs the same no-op handling '/' already
    // gets — without it, a request for exactly '/portal' computes
    // '/portal' + '/portal' = '/portal/portal' (a route that doesn't
    // exist), and worse, the redirect guard below was comparing against
    // that already-double-prefixed value instead of the raw incoming
    // pathname, so it could never detect "we're already at the
    // destination" and would redirect forever — this is what caused a
    // real ERR_TOO_MANY_REDIRECTS in production for any unauthenticated
    // visit that landed on /portal.
    const rewrittenPathname = pathname.startsWith('/portal/') || pathname === '/portal'
      ? pathname
      : `/portal${pathname === '/' ? '' : pathname}`;

    // Portal's own lightweight route protection — same "marker cookie,
    // not a real security boundary" reasoning as staff, using its own
    // separate renovo_portal_session cookie (set by
    // portal-token-storage.ts), never renovo_session. Login/verify
    // pages are always allowed through unauthenticated; a bare
    // portal.renovocrm.com/ with no session redirects to a neutral
    // landing rather than guessing which company's login to show,
    // since the host alone doesn't carry a company slug in this
    // single-portal-domain design.
    //
    // Compares against the raw `pathname`, not `rewrittenPathname` —
    // this is the fix. The guard's intent has always been "don't
    // redirect again if the browser is already asking for /portal
    // directly"; comparing against the prefixed value defeated that
    // intent for exactly this one path.
    const hasPortalSession = request.cookies.get('renovo_portal_session')?.value === '1';
    if (!isPortalPublicPath(rewrittenPathname) && !hasPortalSession && pathname !== '/portal') {
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = rewrittenPathname;
    return NextResponse.rewrite(url);
  }

  // Staff app — unchanged from before host-based routing was added.
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const hasSessionMarker = request.cookies.get('renovo_session')?.value === '1';

  if (!isPublic && !hasSessionMarker) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublic && pathname === '/login' && hasSessionMarker) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
