'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen, Droplets } from 'lucide-react';
import { cn } from '../../lib/utils';
import { navGroups, utilityNavItems } from '../../lib/nav-config';
import { SidebarGroup } from './SidebarGroup';
import { SidebarItem } from './SidebarItem';
import { UserProfileMenu } from './UserProfileMenu';
import { TooltipProvider } from '../ui/tooltip';

const COLLAPSE_STORAGE_KEY = 'renovo-sidebar-collapsed';

export function Sidebar() {
  // Starts expanded on the server and every first client render, then
  // syncs to the real stored preference immediately after mount. This
  // avoids a server/client markup mismatch (Next.js has no access to
  // localStorage during the server render) at the cost of one harmless
  // frame at expanded width before snapping to the remembered state —
  // preferable to fighting hydration for a purely cosmetic preference.
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] lg:flex',
          hydrated && 'transition-[width] duration-200 ease-in-out',
        )}
        style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
        aria-label="Main navigation"
      >
        {/* Logo + product name */}
        <div className={cn('flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--sidebar-border)] px-4', collapsed && 'justify-center px-0')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sidebar-accent-glow)]">
            <Droplets className="h-[18px] w-[18px] text-[var(--sidebar-accent)]" aria-hidden="true" />
          </span>
          {!collapsed && (
            <Link href="/" className="text-[15px] font-semibold tracking-tight text-[var(--sidebar-text-active)]">
              Renovo CRM
            </Link>
          )}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto py-3" aria-label="Primary">
          {navGroups.map((group, i) => (
            <SidebarGroup key={group.label ?? `group-${i}`} group={group} collapsed={collapsed} />
          ))}
        </nav>

        {/* Pinned utility items + user + collapse toggle */}
        <div className="shrink-0 border-t border-[var(--sidebar-border)] p-2">
          <ul className="mb-1 space-y-0.5">
            {utilityNavItems.map((item) => (
              <li key={item.href}>
                <SidebarItem item={item} collapsed={collapsed} />
              </li>
            ))}
          </ul>

          <div className="my-1 h-px bg-[var(--sidebar-border)]" aria-hidden="true" />

          <UserProfileMenu collapsed={collapsed} />

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            className={cn(
              'mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[var(--sidebar-text-muted)] outline-none transition-colors',
              'hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--sidebar-text-active)] focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar-bg)]',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
