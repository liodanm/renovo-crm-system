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
  /** Optional override for the card's border color — generic, not tied
      to any one entity. A caller with its own status-to-color mapping
      (e.g. ESTIMATE_STATUS_COLORS' borderClassName) passes the resolved
      class string directly; this component has no opinion on what a
      status means. Ignored while selected, since the selection-state
      border already communicates something more immediately relevant
      in that moment. */
  borderClassName?: string;
  // Left-only colored rail, distinct from borderClassName's all-sides
  // outline above (which existing callers may already rely on
  // unchanged) — a genuinely different visual, added as a new optional
  // prop rather than repurposing the existing one, so no existing
  // caller's appearance changes. Applied via inline style, not a
  // Tailwind class, since this needs to work for arbitrary hex values
  // resolved at runtime.
  railColorHex?: string;
  // Small status dot rendered before the status label — entirely
  // optional, off by default. Added for the Jobs redesign specifically
  // (dark-mode status badges shouldn't rely on color alone), as a
  // Tailwind background-color class (e.g. 'bg-emerald-400'), not a raw
  // hex, to match the same dark-tinted-badge system the desktop table
  // uses. The five other pages using this component (Invoices,
  // Estimates, Payments, Customers, Service Catalog) don't pass this
  // and are visually unchanged.
  statusDotClassName?: string;
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
  borderClassName,
  railColorHex,
  statusDotClassName,
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
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-[var(--color-brand)] focus:ring-[var(--color-brand)] dark:border-slate-600"
              aria-label={`Select ${typeof title === 'string' ? title : 'item'}`}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {!selectionMode && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />}
      </div>

      {(statusLabel || amount) && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {statusLabel && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize', statusClassName ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}>
              {statusDotClassName && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDotClassName)} aria-hidden="true" />}
              {statusLabel}
            </span>
          )}
          {amount && (
            <div className="text-right">
              {amountLabel && <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{amountLabel}</p>}
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{amount}</p>
            </div>
          )}
        </div>
      )}

      {meta && meta.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {meta.map((m, i) => (
            <span key={i}>
              <span className="text-slate-400 dark:text-slate-500">{m.label}:</span> {m.value}
            </span>
          ))}
        </div>
      )}
    </>
  );

  const className = cn(
    borderClassName ? 'block rounded-xl border-2 p-4' : 'block rounded-xl border p-4',
    selected
      ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5'
      : borderClassName
        ? `${borderClassName} bg-white active:bg-slate-50 dark:bg-slate-900 dark:active:bg-slate-800`
        : 'border-slate-200 bg-white active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800',
  );
  const railStyle: React.CSSProperties | undefined = railColorHex ? { borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: railColorHex } : undefined;

  if (selectionMode) {
    return (
      <div className={className} style={railStyle} onClick={onToggleSelected} role="checkbox" aria-checked={selected} tabIndex={0}>
        {content}
      </div>
    );
  }

  if (onMoveUp || onMoveDown) {
    return (
      <div className="flex items-stretch gap-2">
        <Link href={href} className={cn(className, 'flex-1')} style={railStyle}>
          {content}
        </Link>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Move up"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Move down"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link href={href} className={className} style={railStyle}>
      {content}
    </Link>
  );
}
