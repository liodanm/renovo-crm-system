'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CustomerSummary, JOURNEY_STAGE_LABELS } from '../../lib/api/customers';
import { MobileListCard } from '../ui/mobile-list-card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

const LEAD_STATUS_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  inactive: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  archived: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  churned: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export interface CustomerTableProps {
  customers: CustomerSummary[];
  /** Bulk-selection props — all optional. When omitted entirely, the
      table renders exactly as it did before selection existed: no
      checkboxes, cards navigate on tap. Desktop checkboxes are always
      visible once selectedIds is provided (Gmail-style); mobile only
      switches into tap-to-select via the explicit selectionMode flag,
      since always-visible checkboxes on a phone-width card would clutter
      the common case of just browsing the list. */
  selectedIds?: Set<string>;
  onToggleOne?: (id: string, rangeSelectTo?: string) => void;
  onToggleAll?: (select: boolean) => void;
  selectionMode?: boolean;
}

export function CustomerTable({ customers, selectedIds, onToggleOne, onToggleAll, selectionMode }: CustomerTableProps) {
  const router = useRouter();
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No customers found</p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const allOnPageSelected = selectedIds ? customers.every((c) => selectedIds.has(c.id)) : false;
  const someOnPageSelected = selectedIds ? customers.some((c) => selectedIds.has(c.id)) : false;

  function handleRowCheckboxClick(id: string, e: React.MouseEvent) {
    if (!onToggleOne) return;
    if (e.shiftKey && lastClickedId) {
      onToggleOne(id, lastClickedId);
    } else {
      onToggleOne(id);
    }
    setLastClickedId(id);
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {selectedIds && (
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                    aria-label="Select all on this page"
                    title="Selects only the customers on this page, not everyone matching your filters"
                  />
                </th>
              )}
              <th className="py-2.5 pl-4 pr-3 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-3 py-2.5 text-right font-medium">Lifetime Value</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              <th className="px-3 py-2.5 font-medium">Last Service</th>
              <th className="w-10 py-2.5 pr-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {customers.map((c) => {
              // Row-level secondary line reads "Residential · Google"
              // when a lead source is on file, "Residential" alone
              // otherwise — never a fabricated "· Unknown" or similar.
              const meta = [c.customerType, c.source].filter(Boolean).join(' · ');
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/customers/${c.id}`)}
                  className={cn('cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60', selectedIds?.has(c.id) && 'bg-[var(--color-brand)]/5')}
                >
                  {selectedIds && (
                    <td className="py-3 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onClick={(e) => handleRowCheckboxClick(c.id, e)}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                        aria-label={`Select ${c.displayName || 'customer'}`}
                      />
                    </td>
                  )}
                  <td className="py-2.5 pl-4 pr-3">
                    <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 dark:text-slate-100 hover:text-[var(--color-brand)]">
                      {c.displayName || 'Unnamed customer'}
                    </Link>
                    <div className="text-xs capitalize text-slate-400 dark:text-slate-500">{meta}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400" onClick={(e) => e.stopPropagation()}>
                    {c.phone && <a href={`tel:${c.phone}`} className="block hover:text-[var(--color-brand)]">{c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="block truncate text-xs text-slate-400 dark:text-slate-500 hover:text-[var(--color-brand)]">{c.email}</a>}
                    {!c.phone && !c.email && <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {/* Journey stage carries the primary weight now — it's
                        the more operationally specific of the two ("Estimate
                        Sent" tells you exactly where things stand); lead
                        status is the subtler, secondary signal, reversing
                        today's visual weighting rather than showing two
                        equally large, competing badges. */}
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{JOURNEY_STAGE_LABELS[c.journeyStage]}</span>
                    <div className="mt-0.5">
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize', LEAD_STATUS_STYLES[c.leadStatus] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400')}>
                        {c.leadStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{c.primaryLocation ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">{currency.format(c.lifetimeValue)}</td>
                  <td className={cn('px-3 py-2.5 text-right font-semibold', Number(c.balanceDue) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>
                    {Number(c.balanceDue) > 0 ? `${currency.format(Number(c.balanceDue))} Due` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                    {c.lastServiceDate ? new Date(c.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-500" aria-label={`Actions for ${c.displayName || 'customer'}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/customers/${c.id}`}>View Customer</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/customers/${c.id}/edit`}>Edit Customer</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/estimates/new?customerId=${c.id}`}>New Estimate</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href="/scheduling">Schedule Job</Link></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Every column from the desktop table is still here — Contact,
          Location, and Lifetime Value move into the meta row rather
          than disappearing, matching "never remove information." Tags
          are intentionally omitted here too, per the explicit
          instruction to drop the dedicated column while leaving tag
          functionality itself untouched (still fully available on
          Customer Detail). */}
      <div className="space-y-2 p-3 lg:hidden">
        {customers.map((c) => {
          const meta = [c.customerType, c.source].filter(Boolean).join(' · ');
          return (
            <MobileListCard
              key={c.id}
              href={`/customers/${c.id}`}
              title={c.displayName || 'Unnamed customer'}
              subtitle={<span className="capitalize">{meta}</span>}
              statusLabel={JOURNEY_STAGE_LABELS[c.journeyStage]}
              statusClassName={LEAD_STATUS_STYLES[c.leadStatus]}
              amount={Number(c.balanceDue) > 0 ? currency.format(Number(c.balanceDue)) : '—'}
              amountLabel="Balance"
              selectionMode={selectionMode}
              selected={selectedIds?.has(c.id)}
              onToggleSelected={() => onToggleOne?.(c.id)}
              meta={[
                { label: 'Phone', value: c.phone ?? '—' },
                { label: 'Location', value: c.primaryLocation ?? '—' },
                { label: 'Lifetime Value', value: currency.format(c.lifetimeValue) },
                {
                  label: 'Last Service',
                  value: c.lastServiceDate ? new Date(c.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
                },
              ]}
            />
          );
        })}
      </div>
    </>
  );
}
