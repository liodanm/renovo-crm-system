'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Plus } from 'lucide-react';
import { settingsApi, type EstimateSettings, type PackageDiscountSettings, type PackageDiscountTier } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

/**
 * Combines two genuinely separate backend resources (Estimate Settings
 * and Package Discounts) into one page for organizational purposes only
 * — per the explicit instruction not to create a second Package
 * Discount system, both settingsApi.getEstimateSettings()/
 * getPackageDiscounts() and their update counterparts are completely
 * unchanged, still their own companies.settings JSONB keys, still their
 * own endpoints. This page just fetches, edits, and saves both at once
 * instead of living on two separate pages.
 */
export default function EstimateSettingsPage() {
  const { data: estimateData, mutate: mutateEstimate } = useSWR('settings-estimates', () => settingsApi.getEstimateSettings());
  const { data: packageData, mutate: mutatePackage } = useSWR('settings-package-discounts', () => settingsApi.getPackageDiscounts());

  const [estimateForm, setEstimateForm] = useState<EstimateSettings | null>(null);
  const [packageForm, setPackageForm] = useState<PackageDiscountSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (estimateData) setEstimateForm(estimateData);
  }, [estimateData]);

  useEffect(() => {
    if (packageData) setPackageForm(packageData);
  }, [packageData]);

  function updateEstimate(patch: Partial<EstimateSettings>) {
    setEstimateForm((f) => (f ? { ...f, ...patch } : f));
    setHasChanges(true);
  }

  function updatePackage(patch: Partial<PackageDiscountSettings>) {
    setPackageForm((f) => (f ? { ...f, ...patch } : f));
    setHasChanges(true);
  }

  function updateTier(index: number, patch: Partial<PackageDiscountTier>) {
    if (!packageForm) return;
    const tiers = packageForm.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
    updatePackage({ tiers });
  }

  function removeTier(index: number) {
    if (!packageForm) return;
    updatePackage({ tiers: packageForm.tiers.filter((_, i) => i !== index) });
  }

  function addTier() {
    if (!packageForm) return;
    const nextMin = (packageForm.tiers[packageForm.tiers.length - 1]?.minServices ?? 1) + 1;
    updatePackage({ tiers: [...packageForm.tiers, { minServices: nextMin, percent: 0 }] });
  }

  async function handleSave() {
    if (!estimateForm || !packageForm) return;
    setIsSaving(true);
    setError(null);
    try {
      // Tiers should apply in order of highest threshold first — the
      // Estimate Builder picks the first tier whose minServices the
      // current line-item count meets, so a sorted list (highest
      // minServices first) is what makes "5+ Services -> 10%" correctly
      // beat "2 Services -> 3%" once you're at 5, not the other way
      // around.
      const sortedTiers = [...packageForm.tiers].sort((a, b) => b.minServices - a.minServices);
      await Promise.all([
        settingsApi.updateEstimateSettings(estimateForm),
        settingsApi.updatePackageDiscounts({ ...packageForm, tiers: sortedTiers }),
      ]);
      await Promise.all([mutateEstimate(), mutatePackage()]);
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving Estimate settings.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (estimateData) setEstimateForm(estimateData);
    if (packageData) setPackageForm(packageData);
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Estimate Settings"
      description="Control what the Estimate form shows by default. Existing estimates that already have a tax rate, discount, or expiration date are never affected by these settings — they always show and keep their own real values."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!estimateForm || !packageForm ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tax</h2>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={estimateForm.enableTax}
                onChange={(e) => updateEstimate({ enableTax: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
              />
              Enable Tax on Estimates
            </label>
            <p className="pl-6 text-xs text-slate-500 dark:text-slate-400">
              When enabled, new estimates show the Tax Rate field, pre-filled from your{' '}
              <a href="/settings/business-defaults" className="text-[var(--color-brand)] hover:underline">Business Defaults</a> default tax rate. When disabled, new estimates default to 0% tax and the field stays hidden.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estimate Expiration</h2>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={estimateForm.enableExpiration}
                onChange={(e) => updateEstimate({ enableExpiration: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
              />
              Enable Estimate Expiration
            </label>
            <p className="pl-6 text-xs text-slate-500 dark:text-slate-400">
              When enabled, new estimates automatically get a Valid Until date, this many days out. When disabled, new estimates have no expiration date and won&apos;t appear in expiration reminders.
            </p>

            {estimateForm.enableExpiration && (
              <div className="mt-3 pl-6">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Default Valid Until (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={estimateForm.defaultValidUntilDays}
                  onChange={(e) => updateEstimate({ defaultValidUntilDays: Number(e.target.value) || 1 })}
                  className="mt-1 w-32 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Discounts</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Automatically discount an estimate based on how many services are on it. Applies only while you haven&apos;t manually set your own discount on that estimate.</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={packageForm.enabled} onChange={(e) => updatePackage({ enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
              Enable Package Discounts
            </label>

            {packageForm.enabled && (
              <div className="mt-3 pl-6">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={packageForm.mode === 'tiered'} onChange={() => updatePackage({ mode: 'tiered' })} />
                    Tiered by service count
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={packageForm.mode === 'fixed'} onChange={() => updatePackage({ mode: 'fixed' })} />
                    Fixed percentage
                  </label>
                </div>

                {packageForm.mode === 'fixed' ? (
                  <label className="mt-3 block max-w-[160px]">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Discount when 2+ services</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={packageForm.fixedPercent}
                        onChange={(e) => updatePackage({ fixedPercent: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                      />
                      <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                    </div>
                  </label>
                ) : (
                  <div className="mt-3 space-y-2">
                    {[...packageForm.tiers].sort((a, b) => a.minServices - b.minServices).map((tier) => {
                      const index = packageForm.tiers.indexOf(tier);
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tier.minServices}
                            onChange={(e) => updateTier(index, { minServices: Number(e.target.value.replace(/[^0-9]/g, '')) || 2 })}
                            className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                          />
                          <span className="text-sm text-slate-500 dark:text-slate-400">services or more →</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={tier.percent}
                            onChange={(e) => updateTier(index, { percent: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                            className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                          />
                          <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
                          <button type="button" onClick={() => removeTier(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-950 hover:text-red-600 dark:text-red-400">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" onClick={addTier} className="flex items-center gap-1 text-sm font-medium text-[var(--color-brand)]">
                      <Plus className="h-4 w-4" /> Add tier
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}
