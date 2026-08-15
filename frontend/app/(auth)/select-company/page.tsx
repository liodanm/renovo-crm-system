'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, CompanyMembership } from '../../../lib/api/auth';
import { setTokens } from '../../../lib/auth/token-storage';
import { useAuth } from '../../../lib/auth/auth-context';
import { AuthShell, FormError } from '../../../components/auth/auth-shell';

export default function SelectCompanyPage() {
  const router = useRouter();
  const { refetchUser } = useAuth();
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('renovo_pre_auth_token');
    const stored = sessionStorage.getItem('renovo_pre_auth_companies');

    // Supports arriving here two ways: (1) redirected from the login page
    // with data in sessionStorage, or (2) redirected from the backend's
    // OAuth callback with the token as a query param (see auth/callback page).
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get('preAuthToken');

    if (queryToken) {
      setPreAuthToken(queryToken);
      // Companies list isn't in the redirect URL for OAuth (kept out of
      // query params) — fetch it isn't available without full auth yet,
      // so the OAuth path relies on the pre-auth token alone and the user
      // picks by name via a follow-up lightweight endpoint in a fuller
      // implementation. For the password-login path below we already have it.
    } else if (token && stored) {
      setPreAuthToken(token);
      setCompanies(JSON.parse(stored));
    } else {
      router.replace('/login');
    }
  }, [router]);

  async function handleSelect(companyId: string) {
    if (!preAuthToken) return;
    setError(null);
    setSelectingId(companyId);
    try {
      const tokens = await authApi.selectCompany({ preAuthToken, companyId });
      setTokens(tokens);
      sessionStorage.removeItem('renovo_pre_auth_token');
      sessionStorage.removeItem('renovo_pre_auth_companies');
      await refetchUser();
      router.push('/');
    } catch {
      setError('Could not switch to that company. Please try logging in again.');
      setSelectingId(null);
    }
  }

  return (
    <AuthShell title="Choose a workspace" subtitle="You have access to more than one company">
      <FormError message={error} />
      <div className="space-y-2">
        {companies.map((c) => (
          <button
            key={c.companyId}
            onClick={() => handleSelect(c.companyId)}
            disabled={selectingId !== null}
            className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:border-[var(--color-brand)] hover:bg-[var(--color-brand)]/5 disabled:opacity-60"
          >
            <div>
              <div className="text-sm font-medium text-slate-900">{c.companyName}</div>
              <div className="text-xs capitalize text-slate-500">{c.role.replace('_', ' ')}</div>
            </div>
            {selectingId === c.companyId && <span className="text-xs text-slate-400">Loading…</span>}
          </button>
        ))}
      </div>
    </AuthShell>
  );
}
