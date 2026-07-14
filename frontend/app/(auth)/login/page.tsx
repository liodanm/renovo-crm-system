'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth/auth-context';
import { ApiError } from '../../../lib/api/api-client';
import { AuthShell, FormError, PrimaryButton, TextField } from '../../../components/auth/auth-shell';
import { GoogleLoginButton, MicrosoftLoginButton } from '../../../components/auth/oauth-buttons';

function LoginPageInner() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await login(email, password);

      if (result.requiresCompanySelection) {
        sessionStorage.setItem('renovo_pre_auth_token', result.preAuthToken!);
        sessionStorage.setItem('renovo_pre_auth_companies', JSON.stringify(result.companies));
        router.push('/select-company');
        return;
      }

      router.push(searchParams.get('redirect') ?? '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your Renovo CRM workspace"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-[var(--color-brand)] hover:underline">
            Start a free trial
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
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-[var(--color-brand)] hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <PrimaryButton type="submit" isLoading={isLoading}>
          Log in
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
