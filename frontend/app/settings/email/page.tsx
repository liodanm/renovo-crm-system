'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { IntegrationStatusCard } from '../../../components/settings/IntegrationStatusCard';
import { ApiError } from '../../../lib/api/api-client';

export default function EmailSettingsPage() {
  const { data, mutate } = useSWR('settings-email', () => settingsApi.getEmailSettings());
  const [replyToEmail, setReplyToEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setReplyToEmail(data.replyToEmail ?? '');
      setHasChanges(false);
    }
  }, [data]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateEmailSettings({ replyToEmail: replyToEmail || undefined });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) setReplyToEmail(data.replyToEmail ?? '');
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell title="Email" description="Postmark connection status, sender identity, and a real test send." hasUnsavedChanges={hasChanges} isSaving={isSaving} error={error} onSave={handleSave} onCancel={handleCancel}>
      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <IntegrationStatusCard status={data.postmark} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Sender Identity</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">From Name</label>
                <input value={data.fromName ?? ''} disabled className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-400" />
                <p className="mt-1 text-[11px] text-slate-400">From your Company settings — edit it there, not here.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Reply-To Email</label>
                <input
                  value={replyToEmail}
                  onChange={(e) => { setReplyToEmail(e.target.value); setHasChanges(true); }}
                  placeholder="support@yourcompany.com"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
                />
              </div>
            </div>
          </div>

          <TestEmailCard />
        </>
      )}
    </SettingsSectionShell>
  );
}

function TestEmailCard() {
  const [toEmail, setToEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSend() {
    setIsSending(true);
    setMessage(null);
    try {
      const result = await settingsApi.sendTestEmail(toEmail);
      setMessage({
        type: result.postmarkConfigured ? 'success' : 'error',
        text: result.postmarkConfigured ? `Queued to ${toEmail} — check your inbox in a minute.` : 'Queued, but Postmark is not configured, so it will not actually arrive.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not send the test email.' });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Send Test Email</h2>
      <p className="mt-1 text-xs text-slate-500">Goes through the exact same queue as every real email this app sends.</p>
      {message && <p className={`mt-2 text-xs ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>}
      <div className="mt-3 flex gap-2">
        <input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="you@example.com" className="flex-1 rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm" />
        <button onClick={handleSend} disabled={isSending || !toEmail} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {isSending ? 'Sending…' : 'Send Test'}
        </button>
      </div>
    </div>
  );
}
