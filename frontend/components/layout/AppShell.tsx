'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { MobileSidebar } from './MobileSidebar';
import { CompanySwitcher } from '../auth/company-switcher';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only drawer trigger + company switcher. Desktop still
            needs a real home for this (see the audit notes delivered
            alongside this component) — CompanySwitcher already returns
            null for the common single-company case, so a permanent
            desktop bar here would show an empty strip on every page for
            the overwhelming majority of users today. Better to ship this
            honestly than force a placement that looks broken. */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <div className="flex items-center gap-3">
            <MobileSidebar />
            <span className="text-sm font-semibold tracking-tight text-slate-900">Renovo CRM</span>
          </div>
          <CompanySwitcher />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
