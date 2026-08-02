'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ChevronRight } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { settingsNavGroups, findSettingsNavItem } from '../../lib/settings-nav-config';
import { cn } from '../../lib/utils';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const activeKey = pathname.split('/settings/')[1]?.split('/')[0];
  const activeItem = activeKey ? findSettingsNavItem(activeKey) : undefined;

  const query = search.trim().toLowerCase();
  const filteredGroups = query
    ? settingsNavGroups
        .map((group) => ({ ...group, items: group.items.filter((i) => i.label.toLowerCase().includes(query) || i.description.toLowerCase().includes(query)) }))
        .filter((group) => group.items.length > 0)
    : settingsNavGroups;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
        {/* Left nav */}
        <aside className="shrink-0 lg:w-64">
          <div className="mb-3">
            <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
            <nav aria-label="Breadcrumb" className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Link href="/settings/profile" className="hover:text-slate-600">Settings</Link>
              {activeItem && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-slate-600">{activeItem.label}</span>
                </>
              )}
            </nav>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings"
              className="w-full rounded-lg border border-slate-300 py-3 pl-8 pr-3 text-base lg:py-2 lg:text-sm"
            />
          </div>

          <nav className="space-y-4 overflow-y-auto lg:max-h-[calc(100vh-220px)]">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const href = item.externalHref ?? `/settings/${item.key}`;
                    const isActive = activeKey === item.key;
                    return (
                      <li key={item.key}>
                        <Link
                          href={href}
                          className={cn(
                            'flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors',
                            isActive ? 'bg-[var(--color-brand)]/10 font-medium text-[var(--color-brand)]' : 'text-slate-600 hover:bg-slate-100',
                          )}
                        >
                          {item.label}
                          {item.comingSoon && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">Soon</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="px-2 text-xs text-slate-400">No settings match &ldquo;{search}&rdquo;.</p>}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AppShell>
  );
}
