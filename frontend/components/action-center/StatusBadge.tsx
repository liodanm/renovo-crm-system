import { cn } from '../../lib/utils';

/**
 * Generic, entity-agnostic status badge — takes a status string and a
 * color map, not an Estimate. The same component is meant to back
 * Jobs/Invoices/Work Orders later with their own maps, not a copy of
 * this file per entity.
 */
export interface StatusColorMap {
  [status: string]: { label: string; className: string; borderClassName?: string };
}

export function StatusBadge({ status, colorMap }: { status: string; colorMap: StatusColorMap }) {
  const entry = colorMap[status] ?? { label: status, className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-medium', entry.className)}>
      {entry.label}
    </span>
  );
}

export const ESTIMATE_STATUS_COLORS: StatusColorMap = {
  draft: { label: 'Draft', className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400', borderClassName: 'border-slate-300 dark:border-slate-700' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', borderClassName: 'border-blue-300 dark:border-blue-700' },
  viewed: { label: 'Viewed', className: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300', borderClassName: 'border-blue-300 dark:border-blue-700' },
  accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', borderClassName: 'border-emerald-400 dark:border-emerald-600' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', borderClassName: 'border-red-400 dark:border-red-600' },
  expired: { label: 'Expired', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', borderClassName: 'border-orange-400 dark:border-orange-600' },
  converted: { label: 'Converted to Job', className: 'bg-emerald-900 text-white dark:bg-emerald-800', borderClassName: 'border-emerald-400 dark:border-emerald-600' },
};
