import { cn } from '../../lib/utils';

/**
 * Generic, entity-agnostic status badge — takes a status string and a
 * color map, not an Estimate. The same component is meant to back
 * Jobs/Invoices/Work Orders later with their own maps, not a copy of
 * this file per entity.
 */
export interface StatusColorMap {
  [status: string]: { label: string; className: string };
}

export function StatusBadge({ status, colorMap }: { status: string; colorMap: StatusColorMap }) {
  const entry = colorMap[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-medium', entry.className)}>
      {entry.label}
    </span>
  );
}

export const ESTIMATE_STATUS_COLORS: StatusColorMap = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Viewed', className: 'bg-purple-100 text-purple-700' },
  accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', className: 'bg-orange-100 text-orange-700' },
  converted: { label: 'Converted to Job', className: 'bg-emerald-900 text-white' },
};
