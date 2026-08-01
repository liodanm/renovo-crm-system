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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
