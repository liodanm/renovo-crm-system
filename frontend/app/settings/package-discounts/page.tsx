'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Plus } from 'lucide-react';
import { settingsApi, type PackageDiscountSettings, type PackageDiscountTier } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

export default function PackageDiscountsSettingsPage() {
  const { data, mutate } = useSWR('settings-package-discounts', () => settingsApi.getPackageDiscounts());

  const [form, setForm] = useState<PackageDiscountSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setHasChanges(false);
    }
  }, [data]);

  function update(patch: Partial<PackageDiscountSettings>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setHasChanges(true);
  }

  function updateTier(index: number, patch: Partial<PackageDiscountTier>) {
    if (!form) return;
    const tiers = form.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
    update({ tiers });
  }

  function removeTier(index: number) {
    if (!form) return;
    update({ tiers: form.tiers.filter((_, i) => i !== index) });
  }

  function addTier() {
    if (!form) return;
    const nextMin = (form.tiers[form.tiers.length - 1]?.minServices ?? 1) + 1;
    update({ tiers: [...form.tiers, { minServices: nextMin, percent: 0 }] });
  }

  async function handleSave() {
    if (!form) return;
    setIsSaving(true);
    setError(null);
    try {
      // Tiers should apply in order of highest threshold first — the
      // Estimate Builder picks the first tier whose minServices the
      // current line-item count meets, so a sorted list (highest
      // minServices first) is what makes "5+ Services -> 10%" correctly
      // beat "2 Services -> 3%" once you're at 5, not the other way
      // around.
      const sortedTiers = [...form.tiers].sort((a, b) => b.minServices - a.minServices);
      await settingsApi.updatePackageDiscounts({ ...form, tiers: sortedTiers });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving package discounts.');
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
      title="Package Discounts"
      description="Automatically discount an estimate based on how many services are on it. Applies only while you haven't manually set your own discount on that estimate."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!form ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Enable Package Discounts
          </label>

          {form.enabled && (
            <>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={form.mode === 'tiered'} onChange={() => update({ mode: 'tiered' })} />
                  Tiered by service count
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={form.mode === 'fixed'} onChange={() => update({ mode: 'fixed' })} />
                  Fixed percentage
                </label>
              </div>

              {form.mode === 'fixed' ? (
                <label className="block max-w-[160px]">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Discount when 2+ services</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.fixedPercent}
                      onChange={(e) => update({ fixedPercent: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </label>
              ) : (
                <div className="space-y-2">
                  {[...form.tiers].sort((a, b) => a.minServices - b.minServices).map((tier) => {
                    const index = form.tiers.indexOf(tier);
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={tier.minServices}
                          onChange={(e) => updateTier(index, { minServices: Number(e.target.value.replace(/[^0-9]/g, '')) || 2 })}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-2 lg:text-sm"
                        />
                        <span className="text-sm text-slate-500">services or more →</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={tier.percent}
                          onChange={(e) => updateTier(index, { percent: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-2 lg:text-sm"
                        />
                        <span className="text-sm text-slate-500">%</span>
                        <button type="button" onClick={() => removeTier(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
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
            </>
          )}
        </div>
      )}
    </SettingsSectionShell>
  );
}
