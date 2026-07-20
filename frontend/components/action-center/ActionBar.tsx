'use client';

import { cn } from '../../lib/utils';

export interface ActionBarItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  loading?: boolean;
}

/**
 * Generic Primary/Secondary/Danger action bar — takes arrays of
 * ActionBarItem, nothing Estimate-specific. Meant to back
 * Jobs/Invoices/Work Orders/Purchase Orders later with their own item
 * lists against this same component, not a copy of it per entity.
 */
export function ActionBar({
  primary,
  secondary,
  danger,
}: {
  primary: ActionBarItem[];
  secondary: ActionBarItem[];
  danger: ActionBarItem[];
}) {
  const visiblePrimary = primary.filter((a) => !a.hidden);
  const visibleSecondary = secondary.filter((a) => !a.hidden);
  const visibleDanger = danger.filter((a) => !a.hidden);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      {visiblePrimary.map((a) => (
        <button
          key={a.key}
          onClick={a.onClick}
          disabled={a.disabled || a.loading}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {a.icon}
          {a.loading ? 'Working…' : a.label}
        </button>
      ))}

      {visibleSecondary.length > 0 && <div className="mx-1 h-6 w-px bg-slate-200" />}
      {visibleSecondary.map((a) => (
        <button
          key={a.key}
          onClick={a.onClick}
          disabled={a.disabled || a.loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {a.icon}
          {a.loading ? 'Working…' : a.label}
        </button>
      ))}

      {visibleDanger.length > 0 && (
        <>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <div className="flex flex-wrap items-center gap-2">
            {visibleDanger.map((a) => (
              <button
                key={a.key}
                onClick={a.onClick}
                disabled={a.disabled || a.loading}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium disabled:opacity-50',
                  'border-red-200 text-red-600 hover:bg-red-50',
                )}
              >
                {a.icon}
                {a.loading ? 'Working…' : a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
