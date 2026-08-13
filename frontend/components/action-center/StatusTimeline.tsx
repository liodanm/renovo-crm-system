import { Circle } from 'lucide-react';

export interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: string;
  note: string | null;
  changedAt: string;
  userFirstName: string | null;
  userLastName: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  portal: 'Customer Portal',
  staff: 'Office Staff',
  manual: 'Manual Entry',
  automation: 'Automation',
};

/**
 * Generic status-history timeline — takes any array shaped like
 * job_status_history/payment_status_history/estimate_status_history
 * (they're all the same shape on purpose). Not Estimate-specific, so
 * the same component can back Jobs/Invoices later against their own
 * history tables.
 */
export function StatusTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">No status changes recorded yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Circle className="h-3 w-3 shrink-0 fill-[var(--color-brand)] text-[var(--color-brand)]" />
            {i < entries.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-200" />}
          </div>
          <div className="pb-4">
            <p className="text-sm font-medium capitalize text-slate-800">{entry.toStatus.replace(/_/g, ' ')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(entry.changedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              {' · '}
              {entry.userFirstName ? `${entry.userFirstName} ${entry.userLastName ?? ''}`.trim() : SOURCE_LABELS[entry.source] ?? entry.source}
              {entry.userFirstName && ` (${SOURCE_LABELS[entry.source] ?? entry.source})`}
            </p>
            {entry.note && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{entry.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
