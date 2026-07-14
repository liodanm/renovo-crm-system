'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../../../lib/api/auth';
import { ApiError } from '../../../lib/api/api-client';
import { AuthShell, FormError, PrimaryButton, TextField } from '../../../components/auth/auth-shell';

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('This reset link is missing its token. Please request a new one.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      router.push('/login?reset=success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you haven't used before">
      <FormError message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <PrimaryButton type="submit" isLoading={isLoading}>
          Reset password
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
