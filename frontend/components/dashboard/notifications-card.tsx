'use client';

import { useDashboardNotifications } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError, CardEmpty } from './dashboard-card';

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export function NotificationsCard() {
  const { data, error, isLoading } = useDashboardNotifications();

  return (
    <DashboardCard
      title="Notifications"
      icon={<BellIcon />}
      headerRight={
        data && data.unreadCount > 0 ? (
          <span className="rounded-full bg-[var(--color-brand)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {data.unreadCount}
          </span>
        ) : undefined
      }
    >
      {isLoading && <CardSkeleton lines={3} />}
      {error && <CardError />}
      {!isLoading && !error && data && data.notifications.length === 0 && (
        <CardEmpty message="You're all caught up." />
      )}
      {!isLoading && !error && data && data.notifications.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.notifications.slice(0, 6).map((n) => (
            <li key={n.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />}
              <div className={`min-w-0 ${n.readAt ? 'pl-3.5' : ''}`}>
                <div className="truncate text-sm text-slate-800 dark:text-slate-100">{n.title}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{formatRelative(n.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
