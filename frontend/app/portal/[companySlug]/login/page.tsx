'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { portalApiFetch } from '../../../../lib/portal/portal-api-client';

export default function PortalLoginPage() {
  const params = useParams<{ companySlug: string }>();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await portalApiFetch(`/portal/${params.companySlug}/auth/request-link`, {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ email }),
      });
      // The backend deliberately returns the exact same message whether
      // the email matched a real customer or not (enumeration-safe) —
      // this page shows one calm confirmation either way, never a
      // "we couldn't find that email" error.
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">✉️</div>
          <h1 className="text-lg font-semibold text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-600">
            If that email is on file, we just sent a secure sign-in link to <strong>{email}</strong>. It'll expire soon, so use it within a few minutes.
          </p>
          <button onClick={() => setSent(false)} className="mt-5 text-sm font-medium text-teal-700 hover:underline">
            Use a different email
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Enter your email and we'll send you a secure link — no password needed.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-teal-700 px-3 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      </div>
    </main>
  );
}
