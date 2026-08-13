'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { NavItem } from '../../lib/nav-config';

interface SidebarItemProps {
  item: NavItem;
  collapsed: boolean;
  /** Called after navigation — MobileSidebar uses this to close the drawer on selection. */
  onNavigate?: () => void;
}

// A route is "active" if it's an exact match, or the current path is a
// real sub-page of it (e.g. /estimates/abc123 keeps Estimates
// highlighted) — except for Dashboard at "/", which would otherwise
// match everything.
function isActiveRoute(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarItem({ item, collapsed, onNavigate }: SidebarItemProps) {
  const pathname = usePathname();
  const active = isActiveRoute(pathname, item.href);
  const Icon = item.icon;

  const content = (
    <Link
      href={item.comingSoon ? '#' : item.href}
      aria-current={active ? 'page' : undefined}
      aria-disabled={item.comingSoon || undefined}
      onClick={(e) => {
        if (item.comingSoon) {
          e.preventDefault();
          return;
        }
        onNavigate?.();
      }}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar-bg)]',
        collapsed && 'justify-center px-0',
        item.comingSoon
          ? 'cursor-default text-[var(--sidebar-text-muted)] opacity-60'
          : active
            ? 'bg-[var(--sidebar-accent-glow)] text-[var(--sidebar-text-active)]'
            : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--sidebar-text-active)]',
      )}
    >
      {/* The signature detail: a soft accent bar that eases in on the
          active item, echoing the brand's water motif without slowing
          anyone down — pure CSS transition, no JS animation library. */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--sidebar-accent)] transition-all duration-200',
          active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0',
        )}
        aria-hidden="true"
      />
      <Icon
        className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active && 'text-[var(--sidebar-accent)]')}
        aria-hidden="true"
      />
      {!collapsed && (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {!collapsed && item.comingSoon && (
        <span className="rounded-full bg-[var(--sidebar-bg-hover)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--sidebar-text-muted)]">
          Soon
        </span>
      )}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {item.comingSoon && <span className="ml-1.5 text-slate-400">· Coming soon</span>}
      </TooltipContent>
    </Tooltip>
  );
}
