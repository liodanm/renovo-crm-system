'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '../../../lib/api/auth';
import { AuthShell, FormSuccess, PrimaryButton, TextField } from '../../../components/auth/auth-shell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      // The backend intentionally returns the same generic message whether
      // or not the email exists — do not attempt to differentiate here.
      setMessage(res.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
      footer={
        <Link href="/login" className="font-medium text-[var(--color-brand)] hover:underline">
          Back to log in
        </Link>
      }
    >
      <FormSuccess message={message} />
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PrimaryButton type="submit" isLoading={isLoading}>
            Send reset link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
