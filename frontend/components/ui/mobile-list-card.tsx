'use client';

import Link from 'next/link';
import { ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The one reusable answer to "every list page still uses a desktop table
 * with no mobile fallback" — built once, used by every list page (Jobs,
 * Invoices, Estimates, Payments, Customers, Service Catalog) instead of
 * six one-off card layouts. Desktop is untouched by this component's
 * existence: each page still renders its existing <table> unchanged,
 * wrapped in `hidden lg:block`; this card renders alongside it in a
 * `lg:hidden` block, same data, different presentation.
 *
 * Shows exactly what the audit asked for — customer, status, price,
 * date, primary action — with room for a couple of secondary details.
 * Nothing is hidden, just deprioritized visually: `meta` rows still
 * render, just smaller and below the primary line.
 *
 * Selection mode (added for bulk selection): entirely optional, off by
 * default — the five pages that don't use it (Jobs, Invoices, Estimates,
 * Payments, Service Catalog) are unaffected. When `selectionMode` is on,
 * the whole card becomes the tap target for toggling selection instead
 * of navigating (matching common mobile bulk-select patterns — e.g.
 * Photos apps), rather than trying to isolate a small checkbox hit-zone
 * within a still-navigating card.
 */
export interface MobileListCardMeta {
  label: string;
  value: React.ReactNode;
}

export interface MobileListCardProps {
  href: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statusLabel?: string;
  statusClassName?: string;
  amount?: React.ReactNode;
  amountLabel?: string;
  meta?: MobileListCardMeta[];
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  /** Optional Up/Down reorder controls — off by default, no other page
      passes these. Single-tap, large touch targets, no long-press or
      drag gesture on mobile, per the Service Catalog reorder feature's
      explicit requirement to avoid gestures that are easy to fumble
      one-handed in the field. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function MobileListCard({
  href,
  title,
  subtitle,
  statusLabel,
  statusClassName,
  amount,
  amountLabel,
  meta,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
}: MobileListCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {selectionMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
              aria-label={`Select ${typeof title === 'string' ? title : 'item'}`}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {!selectionMode && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />}
      </div>

      {(statusLabel || amount) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {statusLabel && (
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize', statusClassName ?? 'bg-slate-100 text-slate-700')}>
              {statusLabel}
            </span>
          )}
          {amount && (
            <div className="text-right">
              {amountLabel && <p className="text-[11px] uppercase tracking-wide text-slate-400">{amountLabel}</p>}
              <p className="text-base font-semibold text-slate-900">{amount}</p>
            </div>
          )}
        </div>
      )}

      {meta && meta.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {meta.map((m, i) => (
            <span key={i}>
              <span className="text-slate-400">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const className = cn(
    'block rounded-xl border p-4',
    selected ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-slate-200 bg-white active:bg-slate-50',
  );

  if (selectionMode) {
    return (
      <div className={className} onClick={onToggleSelected} role="checkbox" aria-checked={selected} tabIndex={0}>
        {content}
      </div>
    );
  }

  if (onMoveUp || onMoveDown) {
    return (
      <div className="flex items-stretch gap-2">
        <Link href={href} className={cn(className, 'flex-1')}>
          {content}
        </Link>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Move up"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Move down"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
