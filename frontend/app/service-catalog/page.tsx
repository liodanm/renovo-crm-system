'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Plus } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { serviceCatalogApi, SERVICE_TYPE_LABELS } from '../../lib/api/service-catalog';

function formatMoney(value: string | null): string {
  if (!value) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ServiceCatalogPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data: items, error, isLoading, mutate } = useSWR(['service-catalog', showInactive], () => serviceCatalogApi.list(!showInactive));

  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archive "${name}"? It'll stay linked to past estimates and jobs, but won't show up for new ones.`)) return;
    await serviceCatalogApi.archive(id);
    mutate();
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Service Catalog</h1>
            <p className="mt-1 text-sm text-slate-500">The single source of truth for every service you offer.</p>
          </div>
          <Link href="/service-catalog/new" className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> New Service
          </Link>
        </div>

        <label className="mt-4 flex w-fit items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-slate-300" />
          Show inactive services
        </label>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load the catalog.</div>}
          {items && items.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No services yet. <Link href="/service-catalog/new" className="text-[var(--color-brand)]">Add your first one</Link>.
            </div>
          )}
          {items && items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Default Price</th>
                  <th className="px-4 py-3 text-right">Labor Hours</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className={!item.isActive ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <Link href={`/service-catalog/${item.id}`} className="font-medium text-[var(--color-brand)]">
                        {item.name}
                      </Link>
                      <p className="text-xs text-slate-400">{SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatMoney(item.defaultUnitPrice)}
                      {item.defaultUnitOfMeasure && <span className="text-slate-400"> /{item.defaultUnitOfMeasure.replace('_', ' ')}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{item.defaultLaborHours ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {item.isActive && (
                        <button onClick={() => handleArchive(item.id, item.name)} className="text-xs text-slate-400 hover:text-red-600">
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AppShell>
  );
}
