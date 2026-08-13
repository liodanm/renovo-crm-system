'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import type { IntegrationCard } from '../../lib/api/settings';
import { ApiError } from '../../lib/api/api-client';

interface Row {
  label: string;
  value: string;
}

interface Props {
  card: IntegrationCard;
  logoInitial: string;
  logoColorClass: string;
  docsUrl: string;
  /** Extra display rows beyond the standard Configured/Last Verified/Last Test (e.g. Mode, Phone Number, Model). Derived by the parent from `card.meta`. */
  extraRows?: Row[];
  onVerify: () => Promise<{ ok: boolean; error?: string }>;
  /** Omit for providers with no active test action (Stripe: verify only). */
  onTest?: () => Promise<{ ok: boolean; error?: string }>;
  testLabel?: string;
  /** Rendered above the Test button when a test needs input (e.g. an email/phone field) — the parent owns that input's state. */
  testInput?: React.ReactNode;
  testDisabled?: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function IntegrationProviderCard({ card, logoInitial, logoColorClass, docsUrl, extraRows = [], onVerify, onTest, testLabel = 'Send Test', testInput, testDisabled }: Props) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleVerify() {
    setIsVerifying(true);
    setMessage(null);
    try {
      const result = await onVerify();
      setMessage(result.ok ? { type: 'success', text: 'Connection verified.' } : { type: 'error', text: result.error ?? 'Verification failed.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not verify connection.' });
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleTest() {
    if (!onTest) return;
    setIsTesting(true);
    setMessage(null);
    try {
      const result = await onTest();
      setMessage(result.ok ? { type: 'success', text: 'Test succeeded.' } : { type: 'error', text: result.error ?? 'Test failed.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not run test.' });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${logoColorClass}`}>{logoInitial}</div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{card.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.feature}</p>
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${card.configured ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`}>
          {card.configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {card.configured ? 'Connected' : 'Not Connected'}
        </span>
      </div>

      {!card.configured && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Set these in your Railway environment variables: <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5">{card.missingVars.join(', ')}</code>
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {extraRows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-slate-400 dark:text-slate-500">{row.label}</dt>
            <dd className="text-right text-slate-600 dark:text-slate-400">{row.value}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-slate-400 dark:text-slate-500">Last Verification</dt>
          <dd className="text-right text-slate-600 dark:text-slate-400">{card.lastVerifiedAt ? `${timeAgo(card.lastVerifiedAt)}${card.verifyOk === false ? ' (failed)' : ''}` : 'never'}</dd>
        </div>
        <div className="contents">
          <dt className="text-slate-400 dark:text-slate-500">Last Test</dt>
          <dd className="text-right text-slate-600 dark:text-slate-400">{card.lastTestAt ? `${timeAgo(card.lastTestAt)}${card.testOk === false ? ' (failed)' : ''}` : 'never'}</dd>
        </div>
        {(card.verifyError || card.testError) && (
          <div className="contents">
            <dt className="text-slate-400 dark:text-slate-500">Last Error</dt>
            <dd className="text-right text-red-600 dark:text-red-400">{card.verifyError ?? card.testError}</dd>
          </div>
        )}
      </dl>

      {message && <p className={`mt-3 text-xs ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{message.text}</p>}

      {testInput && <div className="mt-3">{testInput}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={handleVerify} disabled={isVerifying || !card.configured} className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50">
          {isVerifying && <Loader2 className="h-3 w-3 animate-spin" />}
          Verify Connection
        </button>
        {onTest && (
          <button onClick={handleTest} disabled={isTesting || !card.configured || testDisabled} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {isTesting && <Loader2 className="h-3 w-3 animate-spin" />}
            {testLabel}
          </button>
        )}
        <a href={docsUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
          Documentation <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
