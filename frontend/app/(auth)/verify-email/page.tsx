'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '../../../lib/api/auth';
import { ApiError } from '../../../lib/api/api-client';
import { AuthShell } from '../../../components/auth/auth-shell';

type Status = 'verifying' | 'success' | 'error';

function VerifyEmailPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
      });
  }, [token]);

  return (
    <AuthShell title="Email verification">
      {status === 'verifying' && <p className="text-sm text-slate-600">Verifying your email…</p>}

      {status === 'success' && (
        <div>
          <p className="text-sm text-slate-600">Your email has been verified. You can now log in.</p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)]"
          >
            Go to login
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-red-600">{message}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--color-brand)] hover:underline">
            Back to log in
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}
