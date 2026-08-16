'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { portalApiFetch } from '../../../../lib/portal/portal-api-client';
import { setPortalToken } from '../../../../lib/portal/portal-token-storage';

export default function PortalVerifyPage() {
  const params = useParams<{ companySlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'error'>('verifying');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }
    portalApiFetch<{ accessToken: string; redirectTo: string | null }>('/portal/auth/verify', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        setPortalToken(result.accessToken, params.companySlug);
        router.replace(result.redirectTo || '/portal/dashboard');
      })
      .catch(() => {
        setStatus('error');
      });
    // Runs once on mount — re-verifying on every searchParams identity
    // change isn't the intent here, and the token is single-use anyway
    // (a second call would just fail).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">⚠️</div>
          <h1 className="text-lg font-semibold text-slate-900">This link isn't working</h1>
          <p className="mt-2 text-sm text-slate-600">It may have expired or already been used — sign-in links are only valid for a few minutes and can only be used once.</p>
          <a href={`/portal/${params.companySlug}/login`} className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white">
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-600">Signing you in…</p>
      </div>
    </main>
  );
}
