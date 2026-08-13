'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';
import { settingsApi, type LeadSourceOption } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `source_${Date.now()}`;
}

export default function LeadSourcesSettingsPage() {
  const { data, mutate } = useSWR('settings-lead-sources', () => settingsApi.getLeadSources());

  const [options, setOptions] = useState<LeadSourceOption[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data) {
      setOptions(data.options);
      setHasChanges(false);
    }
  }, [data]);

  function update(next: LeadSourceOption[]) {
    setOptions(next);
    setHasChanges(true);
  }

  function toggleEnabled(key: string) {
    update(options.map((o) => (o.key === key ? { ...o, enabled: !o.enabled } : o)));
  }

  function rename(key: string, label: string) {
    update(options.map((o) => (o.key === key ? { ...o, label } : o)));
  }

  function remove(key: string) {
    // Removing an option here only removes it from the dropdown going
    // forward — it never touches any customer record. A customer whose
    // source was this value keeps that exact text on their own record
    // regardless of what happens to this list later; there's no
    // reference from Customer.source back to this settings blob at all,
    // so there's nothing that could be silently lost.
    update(options.filter((o) => o.key !== key));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  }

  function addSource() {
    const label = newLabel.trim();
    if (!label) return;
    update([...options, { key: slugify(label), label, enabled: true }]);
    setNewLabel('');
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateLeadSources(options);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving your lead sources.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) setOptions(data.options);
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell
      title="Lead Sources"
      description="Shown as a dropdown when creating or editing a customer. Removing an option here never changes any existing customer's stored source — it only affects what shows up as a choice going forward."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!data ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.key} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} className="flex h-6 w-6 items-center justify-center text-slate-400 dark:text-slate-500 disabled:opacity-25">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveItem(index, 1)} disabled={index === options.length - 1} className="flex h-6 w-6 items-center justify-center text-slate-400 dark:text-slate-500 disabled:opacity-25">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={option.label}
                  onChange={(e) => rename(option.key, e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-1.5 lg:text-sm"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <input type="checkbox" checked={option.enabled} onChange={() => toggleEnabled(option.key)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700" />
                  Enabled
                </label>
                <button type="button" onClick={() => remove(option.key)} aria-label={`Remove ${option.label}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-950 hover:text-red-600 dark:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
              placeholder="Add a new source…"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-1.5 lg:text-sm"
            />
            <button type="button" onClick={addSource} className="flex items-center gap-1 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}
