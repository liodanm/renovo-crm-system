'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { IntegrationStatusCard } from '../../../components/settings/IntegrationStatusCard';
import { ApiError } from '../../../lib/api/api-client';

const ALL_METHODS = [
  { key: 'card', label: 'Card (Stripe)' },
  { key: 'ach', label: 'ACH' },
  { key: 'cash', label: 'Cash' },
  { key: 'check', label: 'Check' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'other', label: 'Other' },
];

export default function PaymentSettingsPage() {
  const { data, mutate } = useSWR('settings-payments', () => settingsApi.getPaymentSettings());
  const [enabledMethods, setEnabledMethods] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabledMethods(data.enabledPaymentMethods);
      setHasChanges(false);
    }
  }, [data]);

  function toggle(method: string) {
    setEnabledMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
    setHasChanges(true);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updatePaymentSettings({ enabledPaymentMethods: enabledMethods });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) setEnabledMethods(data.enabledPaymentMethods);
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell title="Payments" description="Stripe connection status and which payment methods you accept." hasUnsavedChanges={hasChanges} isSaving={isSaving} error={error} onSave={handleSave} onCancel={handleCancel}>
      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <IntegrationStatusCard status={data.stripe} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Accepted Payment Methods</h2>
            <p className="mt-1 text-xs text-slate-500">Which methods show up when recording a payment on an invoice.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_METHODS.map((m) => (
                <label key={m.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={enabledMethods.includes(m.key)} onChange={() => toggle(m.key)} className="rounded border-slate-300" />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Invoice Defaults</h2>
            <p className="mt-1 text-xs text-slate-500">
              Default due date and tax rate live in{' '}
              <Link href="/settings/business-defaults" className="text-[var(--color-brand)] underline">Business Defaults</Link> — not duplicated here.
            </p>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}
