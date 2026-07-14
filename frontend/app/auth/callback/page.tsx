'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '../../../lib/auth/token-storage';
import { useAuth } from '../../../lib/auth/auth-context';

/**
 * Lands here after GET /auth/google/callback or /auth/microsoft/callback
 * redirects the browser to:
 *   {FRONTEND_URL}/auth/callback#accessToken=...&refreshToken=...
 * Tokens are carried in the URL FRAGMENT (#), not a query string (?) —
 * fragments are never sent to the server in the request line and are
 * dropped by most analytics/proxy logging, which meaningfully reduces
 * the chance of a token leaking into a log file.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const { refetchUser } = useAuth();

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get('accessToken');
    const refreshToken = fragment.get('refreshToken');

    if (accessToken && refreshToken) {
      setTokens({ accessToken, refreshToken });
      // Clear the fragment immediately so tokens don't linger in browser
      // history / can't be re-read by a subsequent script on this page.
      window.history.replaceState(null, '', '/auth/callback');
      refetchUser().then(() => router.replace('/'));
    } else {
      router.replace('/login?error=oauth_failed');
    }
  }, [router, refetchUser]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  );
}
