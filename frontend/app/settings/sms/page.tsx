'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { IntegrationStatusCard } from '../../../components/settings/IntegrationStatusCard';
import { ApiError } from '../../../lib/api/api-client';

export default function SmsSettingsPage() {
  const { data } = useSWR('settings-sms', () => settingsApi.getSmsSettings());
  const [toPhone, setToPhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSend() {
    setIsSending(true);
    setMessage(null);
    try {
      const result = await settingsApi.sendTestSms(toPhone);
      setMessage(result.sent ? { type: 'success', text: `Sent to ${toPhone}.` } : { type: 'error', text: result.error === 'twilio_not_configured' ? 'Twilio is not configured — nothing was sent.' : `Failed: ${result.error}` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not send the test message.' });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SettingsSectionShell title="SMS" description="Twilio connection status and a real test message." hasUnsavedChanges={false} isSaving={false} error={null} onSave={() => {}} onCancel={() => {}}>
      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <IntegrationStatusCard status={data.twilio} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Send Test SMS</h2>
            <p className="mt-1 text-xs text-slate-500">Uses the exact same Twilio path Automation's reminders use — not a separate check.</p>
            {message && <p className={`mt-2 text-xs ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>{message.text}</p>}
            <div className="mt-3 flex gap-2">
              <input value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="+1 555 123 4567" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button onClick={handleSend} disabled={isSending || !toPhone} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {isSending ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Reminder Timing</h2>
            <p className="mt-1 text-xs text-slate-500">Follow-up/reminder/review-request timing and toggles live in Automation settings, not duplicated here.</p>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}
