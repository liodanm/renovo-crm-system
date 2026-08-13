'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, Droplets } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';
import { navGroups, utilityNavItems } from '../../lib/nav-config';
import { SidebarGroup } from './SidebarGroup';
import { SidebarItem } from './SidebarItem';
import { UserProfileMenu } from './UserProfileMenu';

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent className="bg-[var(--sidebar-bg)]" aria-describedby={undefined}>
        <SheetTitle>Renovo CRM navigation</SheetTitle>

        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-accent-glow)]">
            <Droplets className="h-[18px] w-[18px] text-[var(--sidebar-accent)]" aria-hidden="true" />
          </span>
          <Link href="/" onClick={() => setOpen(false)} className="text-[15px] font-semibold tracking-tight text-[var(--sidebar-text-active)]">
            Renovo CRM
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3" aria-label="Primary">
          {navGroups.map((group, i) => (
            <SidebarGroup key={group.label ?? `group-${i}`} group={group} collapsed={false} onNavigate={() => setOpen(false)} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--sidebar-border)] p-2">
          <ul className="mb-1 space-y-0.5">
            {utilityNavItems.map((item) => (
              <li key={item.href}>
                <SidebarItem item={item} collapsed={false} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
          <div className="my-1 h-px bg-[var(--sidebar-border)]" aria-hidden="true" />
          <UserProfileMenu collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
