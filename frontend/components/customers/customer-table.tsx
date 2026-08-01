import Link from 'next/link';
import { CustomerSummary } from '../../lib/api/customers';
import { MobileListCard } from '../ui/mobile-list-card';

const LEAD_STATUS_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  churned: 'bg-red-100 text-red-700',
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function CustomerTable({ customers }: { customers: CustomerSummary[] }) {
  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-slate-600">No customers match your filters.</p>
        <p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pl-4 pr-3 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-3 py-2.5 font-medium">Tags</th>
              <th className="px-3 py-2.5 text-right font-medium">Lifetime Value</th>
              <th className="px-3 py-2.5 text-right font-medium">Balance Due</th>
              <th className="px-3 py-2.5 font-medium">Last Service</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="py-3 pl-4 pr-3">
                  <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:text-[var(--color-brand)]">
                    {c.displayName || 'Unnamed customer'}
                  </Link>
                  <div className="text-xs text-slate-400 capitalize">{c.customerType}</div>
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {c.email && <div className="truncate">{c.email}</div>}
                  {c.phone && <div className="text-xs text-slate-400">{c.phone}</div>}
                  {!c.email && !c.phone && <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_STYLES[c.leadStatus] ?? 'bg-slate-100 text-slate-600'}`}>
                    {c.leadStatus}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-500">{c.primaryLocation ?? '—'}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        {tag}
                      </span>
                    ))}
                    {c.tags.length > 2 && <span className="text-[11px] text-slate-400">+{c.tags.length - 2}</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-medium text-slate-700">{currency.format(c.lifetimeValue)}</td>
                <td className={`px-3 py-3 text-right font-medium ${Number(c.balanceDue) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {Number(c.balanceDue) > 0 ? currency.format(Number(c.balanceDue)) : '—'}
                </td>
                <td className="px-3 py-3 text-slate-500">
                  {c.lastServiceDate ? new Date(c.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Every column from the desktop table is still here — Contact,
          Location, Tags, and Lifetime Value move into the meta row rather
          than disappearing, matching "never remove information." */}
      <div className="space-y-3 p-3 lg:hidden">
        {customers.map((c) => (
          <MobileListCard
            key={c.id}
            href={`/customers/${c.id}`}
            title={c.displayName || 'Unnamed customer'}
            subtitle={c.email || c.phone || c.customerType}
            statusLabel={c.leadStatus}
            statusClassName={LEAD_STATUS_STYLES[c.leadStatus]}
            amount={Number(c.balanceDue) > 0 ? currency.format(Number(c.balanceDue)) : '—'}
            amountLabel="Balance Due"
            meta={[
              { label: 'Lifetime Value', value: currency.format(c.lifetimeValue) },
              { label: 'Location', value: c.primaryLocation ?? '—' },
              {
                label: 'Last Service',
                value: c.lastServiceDate
                  ? new Date(c.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—',
              },
              ...(c.tags.length > 0 ? [{ label: 'Tags', value: c.tags.join(', ') }] : []),
            ]}
          />
        ))}
      </div>
    </>
  );
}
