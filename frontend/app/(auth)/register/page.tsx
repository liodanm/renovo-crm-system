'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '../../../lib/api/auth';
import { ApiError } from '../../../lib/api/api-client';
import { AuthShell, FormError, PrimaryButton, TextField } from '../../../components/auth/auth-shell';
import { GoogleLoginButton, MicrosoftLoginButton } from '../../../components/auth/oauth-buttons';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', companyName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await authApi.register(form);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a verification link to ${form.email}`}>
        <p className="text-sm text-slate-600">
          Click the link in that email to verify your address and finish setting up{' '}
          <span className="font-medium">{form.companyName}</span>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start your free trial"
      subtitle="Set up your company workspace in under a minute"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[var(--color-brand)] hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        <GoogleLoginButton />
        <MicrosoftLoginButton />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        OR
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="First name" required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
          <TextField label="Last name" required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
        </div>
        <TextField label="Company name" required value={form.companyName} onChange={(e) => update('companyName', e.target.value)} />
        <TextField label="Work email" type="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
        />
        <p className="text-xs text-slate-500">
          At least 10 characters, with an uppercase letter, a lowercase letter, and a number.
        </p>
        <PrimaryButton type="submit" isLoading={isLoading}>
          Create account
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
