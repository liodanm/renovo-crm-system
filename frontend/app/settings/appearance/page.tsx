'use client';

import Link from 'next/link';
import { ArrowLeft, Moon, Sun, MonitorSmartphone, Check } from 'lucide-react';
import { useTheme } from '../../../lib/theme/theme-context';

/**
 * Extended from a single Dark/Light toggle to three modes. Deliberately
 * does NOT go through SettingsSectionShell's save-bar mechanism
 * (hasUnsavedChanges/onSave/Cancel) the way Company or Branding do —
 * unchanged reasoning from before: this is localStorage-only (see
 * theme-context.tsx), applies instantly, nothing to explicitly save.
 *
 * "Auto Environment" tracks the OS/browser's prefers-color-scheme
 * LIVE (see theme-context.tsx's matchMedia change listener) — not a
 * scheduled day/night mode. If the OS switches at sunset, Renovo
 * follows immediately without a page refresh, only while this mode is
 * selected.
 */
export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();

  const options: { value: 'dark' | 'light' | 'auto'; label: string; description: string; icon: typeof Moon }[] = [
    { value: 'dark', label: 'Dark Mode', description: 'Always use Renovo\u2019s dark theme.', icon: Moon },
    { value: 'light', label: 'Light Mode', description: 'Always use Renovo\u2019s light theme.', icon: Sun },
    { value: 'auto', label: 'Auto Environment', description: 'Follow your device\u2019s light/dark setting automatically.', icon: MonitorSmartphone },
  ];

  return (
    <div>
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Appearance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">App theme and display preferences</p>
      </div>

      <div className="mt-6 space-y-2" role="radiogroup" aria-label="Theme">
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(opt.value)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition dark:border-slate-800 dark:bg-slate-900"
              style={{ borderColor: selected ? 'var(--color-brand)' : undefined }}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-[var(--color-brand)]/15' : 'bg-slate-100 dark:bg-slate-800'}`}>
                <Icon className="h-4 w-4" style={{ color: selected ? 'var(--color-brand)' : undefined }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{opt.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.description}</span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-brand)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
