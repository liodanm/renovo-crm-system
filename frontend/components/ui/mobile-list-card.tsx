'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
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
}

export function MobileListCard({ href, title, subtitle, statusLabel, statusClassName, amount, amountLabel, meta }: MobileListCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-slate-900">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
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
    </Link>
  );
}
