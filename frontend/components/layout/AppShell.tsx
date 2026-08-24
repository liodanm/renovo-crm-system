'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { CompanySwitcher } from '../auth/company-switcher';
import { GlobalSearch } from './GlobalSearch';
import { AddNewMenu } from './AddNewMenu';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Previously mobile-only (lg:hidden) — desktop had no header bar
            at all, because CompanySwitcher alone (returning null for the
            common single-company case) would've meant an empty strip on
            every page for most users. Global Search is useful on every
            page for every user regardless of company count, which is
            the real, concrete reason to finally give desktop a header
            too, rather than the placeholder problem this file used to
            flag.

            "Renovo CRM" text replaced with the Add New quick-action menu
            — the brand name stays everywhere else (login screen, page
            title, sidebar), this was specifically the one spot where a
            fast, in-context action is more useful than a static label,
            per the explicit request to speed up in-the-field workflow. */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:gap-3">
          <div className="lg:hidden">
            <MobileSidebar />
          </div>
          <AddNewMenu />
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
