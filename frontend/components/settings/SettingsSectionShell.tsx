'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useUnsavedChangesWarning } from '../../lib/hooks/use-unsaved-changes-warning';

interface SettingsSectionShellProps {
  title: string;
  description: string;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/**
 * The one shared shell every real settings section renders through —
 * Profile, Company, Business Defaults, and Branding all use this
 * exact component rather than each building their own save bar, toast,
 * and unsaved-changes wiring. A future section (once it graduates from
 * Coming Soon) gets all of this for free by using the same shell.
 */
export function SettingsSectionShell({ title, description, hasUnsavedChanges, isSaving, error, onSave, onCancel, children }: SettingsSectionShellProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  useUnsavedChangesWarning(hasUnsavedChanges);

  // Success toast triggers from the parent finishing a save (isSaving
  // false again with no error, right after having been true) — tracked
  // here so every section doesn't need to manage its own toast timer.
  const [wasSaving, setWasSaving] = useState(false);
  useEffect(() => {
    if (wasSaving && !isSaving && !error) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(t);
    }
    setWasSaving(isSaving);
  }, [isSaving, error, wasSaving]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {showSuccess && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Saved
          </div>
        )}
      </div>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 space-y-4">{children}</div>

      {/* Sticky save bar — only appears once there's something to act
          on, so an untouched page never nags. */}
      {hasUnsavedChanges && (
        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-xs text-slate-500">You have unsaved changes.</p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={onSave} disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
