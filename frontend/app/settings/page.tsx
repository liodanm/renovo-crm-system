'use client';

import Link from 'next/link';
import { ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import { settingsNavGroups } from '../../lib/settings-nav-config';
import { useAuth } from '../../lib/auth/auth-context';

/**
 * The Settings hub — previously this route just redirected straight to
 * /settings/profile, so there was never an actual landing page. Every
 * category card below reuses the exact same settingsNavGroups data the
 * old persistent sidebar rendered; only the presentation changed, not
 * the underlying structure or which sections exist.
 *
 * Deliberately does NOT wrap itself in AppShell or its own width
 * container — layout.tsx (the parent of every /settings/* route,
 * including this one) already supplies both. Adding them again here
 * would double-wrap AppShell.
 */
export default function SettingsRootPage() {
  const { hasRole } = useAuth();
  const visibleGroups = settingsNavGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || hasRole('owner')) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      </div>

      <div className="space-y-8">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{group.label}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((item) => {
                const href = item.externalHref ?? `/settings/${item.key}`;
                const Icon = item.icon ?? SettingsIcon;
                return (
                  <Link
                    key={item.key}
                    href={href}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-[var(--color-brand)]/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[var(--color-brand)]/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)]/10">
                      <Icon className="h-5 w-5 text-[var(--color-brand)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                        {item.comingSoon && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-800 dark:text-slate-500">Soon</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
