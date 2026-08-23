'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { DASHBOARD_WIDGETS, WIDGET_CATEGORIES } from '../../lib/dashboard-widgets-registry';

export function CustomizeDashboardModal({
  isEnabled,
  onToggle,
  onClose,
}: {
  isEnabled: (id: string) => boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const matches = (label: string) => label.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Customize Dashboard</h2>
            {/* Explicit, per this feature's own instruction to make the
                save behavior unambiguous — this is a lightweight
                preference toggle, not a form, so it saves immediately
                rather than needing a separate Save step. */}
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Changes save automatically.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {WIDGET_CATEGORIES.map((category) => {
            const widgets = DASHBOARD_WIDGETS.filter((w) => w.category === category && matches(w.label));
            if (widgets.length === 0) return null;
            return (
              <div key={category} className="mb-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{category}</p>
                <div className="mt-1.5 space-y-0.5">
                  {widgets.map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={isEnabled(w.id)}
                        onChange={() => onToggle(w.id)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{w.label}</span>
                        <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{w.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {DASHBOARD_WIDGETS.every((w) => !matches(w.label)) && (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No reports match &ldquo;{search}&rdquo;.</p>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3">
          <button onClick={onClose} className="w-full rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
