import { SidebarItem } from './SidebarItem';
import type { NavGroup } from '../../lib/nav-config';

interface SidebarGroupProps {
  group: NavGroup;
  collapsed: boolean;
  onNavigate?: () => void;
}

export function SidebarGroup({ group, collapsed, onNavigate }: SidebarGroupProps) {
  return (
    <div role="group" aria-label={group.label} className="px-2">
      {group.label && !collapsed && (
        <p className="mb-1.5 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-text-muted)]">
          {group.label}
        </p>
      )}
      {/* A collapsed group with a label still needs visual separation
          from the one above it — a thin rule stands in for the label
          that's no longer there. */}
      {group.label && collapsed && <div className="mx-3 mb-1.5 mt-4 h-px bg-[var(--sidebar-border)]" aria-hidden="true" />}
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <li key={item.href}>
            <SidebarItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}
