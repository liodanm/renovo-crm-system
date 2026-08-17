'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi, type EstimateSettings } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

export default function EstimateSettingsPage() {
  const { data, mutate } = useSWR('settings-estimates', () => settingsApi.getEstimateSettings());

  const [form, setForm] = useState<EstimateSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setHasChanges(false);
    }
  }, [data]);

  function update(patch: Partial<EstimateSettings>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setHasChanges(true);
  }

  async function handleSave() {
    if (!form) return;
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateEstimateSettings(form);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving Estimate settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) setForm(data);
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Estimates"
      description="Control what the Estimate form shows by default. Existing estimates that already have a tax rate, discount, or expiration date are never affected by these settings — they always show and keep their own real values."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!form ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.enableTax}
              onChange={(e) => update({ enableTax: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
            />
            Enable Tax on Estimates
          </label>
          <p className="pl-6 text-xs text-slate-500 dark:text-slate-400">
            When enabled, new estimates show the Tax Rate field, pre-filled from your{' '}
            <a href="/settings/business-defaults" className="text-[var(--color-brand)] hover:underline">Business Defaults</a> default tax rate. When disabled, new estimates default to 0% tax and the field stays hidden.
          </p>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.enableExpiration}
                onChange={(e) => update({ enableExpiration: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
              />
              Enable Estimate Expiration
            </label>
            <p className="pl-6 text-xs text-slate-500 dark:text-slate-400">
              When enabled, new estimates automatically get a Valid Until date, this many days out. When disabled, new estimates have no expiration date and won&apos;t appear in expiration reminders.
            </p>

            {form.enableExpiration && (
              <div className="mt-3 pl-6">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Default Valid Until (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.defaultValidUntilDays}
                  onChange={(e) => update({ defaultValidUntilDays: Number(e.target.value) || 1 })}
                  className="mt-1 w-32 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}
