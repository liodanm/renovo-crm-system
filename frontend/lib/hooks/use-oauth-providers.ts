'use client';

import useSWR from 'swr';
import { apiFetch } from '../api/api-client';

interface OAuthProviders {
  google: boolean;
  microsoft: boolean;
}

/**
 * One shared SWR key — login and register pages both use this, but SWR
 * dedupes identical keys, so this is one real network request regardless
 * of how many components ask for it. Reuses the exact env-var signal
 * the backend already uses to decide whether to construct each OAuth
 * strategy at all (auth.module.ts) — not a second, independently
 * invented source of truth.
 */
export function useOAuthProviders() {
  const { data, isLoading } = useSWR<OAuthProviders>('oauth-providers', () =>
    apiFetch<OAuthProviders>('/auth/oauth-providers', { skipAuth: true }),
  );
  // Fail closed while loading or on error — better to briefly show
  // neither OAuth button than to show one that's guaranteed to fail.
  return { google: data?.google ?? false, microsoft: data?.microsoft ?? false, isLoading };
}
