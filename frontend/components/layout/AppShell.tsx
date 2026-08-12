'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { CompanySwitcher } from '../auth/company-switcher';
import { GlobalSearch } from './GlobalSearch';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Previously mobile-only (lg:hidden) — desktop had no header bar
            at all, because CompanySwitcher alone (returning null for the
            common single-company case) would've meant an empty strip on
            every page for most users. Global Search is useful on every
            page for every user regardless of company count, which is
            the real, concrete reason to finally give desktop a header
            too, rather than the placeholder problem this file used to
            flag. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileSidebar />
            <span className="text-sm font-semibold tracking-tight text-slate-900">Renovo CRM</span>
          </div>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <CompanySwitcher />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
