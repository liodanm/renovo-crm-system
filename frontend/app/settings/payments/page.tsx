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
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feePercent, setFeePercent] = useState('3');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabledMethods(data.enabledPaymentMethods);
      setFeeEnabled(data.processingFeeEnabled);
      setFeePercent(String(data.processingFeePercent));
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
      await settingsApi.updatePaymentSettings({
        enabledPaymentMethods: enabledMethods,
        processingFeeEnabled: feeEnabled,
        processingFeePercent: Number(feePercent),
      });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) {
      setEnabledMethods(data.enabledPaymentMethods);
      setFeeEnabled(data.processingFeeEnabled);
      setFeePercent(String(data.processingFeePercent));
    }
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell title="Payments" description="Stripe connection status and which payment methods you accept." hasUnsavedChanges={hasChanges} isSaving={isSaving} error={error} onSave={handleSave} onCancel={handleCancel}>
      {!data ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <IntegrationStatusCard status={data.stripe} />

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Accepted Payment Methods</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Which methods show up when recording a payment on an invoice.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_METHODS.map((m) => (
                <label key={m.key} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm">
                  <input type="checkbox" checked={enabledMethods.includes(m.key)} onChange={() => toggle(m.key)} className="rounded border-slate-300 dark:border-slate-700" />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Credit Card Processing Fee</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Applied only to credit card payments — never to debit cards, cash, check, Zelle, or tips.</p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={feeEnabled}
                onChange={(e) => { setFeeEnabled(e.target.checked); setHasChanges(true); }}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              Enable Credit Card Processing Fee
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={feePercent}
                onChange={(e) => { setFeePercent(e.target.value.replace(/[^0-9.]/g, '')); setHasChanges(true); }}
                disabled={!feeEnabled}
                inputMode="decimal"
                className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:bg-slate-50 dark:bg-slate-900 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">%</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Invoice Defaults</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Default due date and tax rate live in{' '}
              <Link href="/settings/business-defaults" className="text-[var(--color-brand)] underline">Business Defaults</Link> — not duplicated here.
            </p>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}
