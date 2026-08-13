'use client';

import { useTheme } from '../../../lib/theme/theme-context';

/**
 * The Appearance section's first real content — previously a
 * "Coming Soon" placeholder with no functionality behind it at all.
 *
 * Deliberately does NOT go through SettingsSectionShell's save-bar
 * mechanism (hasUnsavedChanges/onSave/Cancel) the way Company or
 * Branding do. Those pages hold a draft and require an explicit Save
 * because they're writing to the backend. Dark Mode has no backend
 * step — it's localStorage-only (see theme-context.tsx for why) and
 * is expected to apply the instant you toggle it, the same as every
 * dark-mode switch anywhere else. Forcing a "Save Changes" click for
 * a purely visual preference would be worse UX, not more consistent
 * UX — there's nothing to save.
 */
export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Appearance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">App theme and display preferences</p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Dark Mode</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Use Dark Mode throughout Renovo CRM.</p>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              checked={isDark}
              onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
              className="peer sr-only"
              aria-label="Dark Mode"
            />
            <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-[var(--color-brand)] peer-focus:outline-none after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white dark:bg-slate-900 after:transition-all peer-checked:after:translate-x-5 dark:bg-slate-700" />
          </label>
        </div>
      </div>
    </div>
  );
}
