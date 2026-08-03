'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Plus, GripVertical } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { MobileListCard } from '../../components/ui/mobile-list-card';
import { serviceCatalogApi, SERVICE_TYPE_LABELS, type ServiceCatalogItem } from '../../lib/api/service-catalog';

function formatMoney(value: string | null): string {
  if (!value) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ServiceCatalogPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data, error, isLoading, mutate } = useSWR(['service-catalog', showInactive], () => serviceCatalogApi.list(!showInactive));

  // Local, orderable copy of the list — needed so drag can move a row
  // immediately (smooth animation, no waiting on a round trip) while the
  // API call happens in the background. Reset whenever fresh server data
  // arrives, so the two never drift out of sync for long.
  const [items, setItems] = useState<ServiceCatalogItem[]>([]);
  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archive "${name}"? It'll stay linked to past estimates and jobs, but won't show up for new ones.`)) return;
    await serviceCatalogApi.archive(id);
    mutate();
  }

  // The one reorder path — desktop drag and mobile Up/Down both end here
  // with a full ordered array of ids, not deltas. Same function, same
  // API call either way; only how the array gets produced differs.
  const [reorderError, setReorderError] = useState<string | null>(null);

  async function commitOrder(newOrder: ServiceCatalogItem[]) {
    const previous = items;
    setItems(newOrder);
    setReorderError(null);
    try {
      await serviceCatalogApi.reorder(newOrder.map((i) => i.id));
      mutate();
    } catch {
      setItems(previous);
      setReorderError("Couldn't save the new order. Please try again.");
    }
  }

  function moveItem(id: string, direction: -1 | 1) {
    const index = items.findIndex((i) => i.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    commitOrder(next);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const fromIndex = items.findIndex((i) => i.id === draggedId);
    const toIndex = items.findIndex((i) => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDraggedId(null);
    setDragOverId(null);
    commitOrder(next);
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

        {reorderError && <p className="mt-2 text-sm text-red-600">{reorderError}</p>}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {isLoading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {error && <div className="p-8 text-center text-sm text-red-600">Couldn't load the catalog.</div>}
          {items.length === 0 && !isLoading && !error && (
            <div className="p-8 text-center text-sm text-slate-500">
              No services yet. <Link href="/service-catalog/new" className="text-[var(--color-brand)]">Add your first one</Link>.
            </div>
          )}
          {items.length > 0 && (
            <>
              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Default Price</th>
                    <th className="px-4 py-3 text-right">Labor Hours</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      draggable
                      onDragStart={() => setDraggedId(item.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverId !== item.id) setDragOverId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(item.id);
                      }}
                      className={`transition-colors duration-150 ${!item.isActive ? 'opacity-50' : ''} ${
                        draggedId === item.id ? 'opacity-40' : ''
                      } ${dragOverId === item.id && draggedId !== item.id ? 'bg-[var(--color-brand)]/5 border-t-2 border-t-[var(--color-brand)]' : ''}`}
                    >
                      <td className="cursor-grab px-2 py-3 text-slate-300 hover:text-slate-500 active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </td>
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

              <div className="space-y-3 p-3 lg:hidden">
                {items.map((item, index) => (
                  <MobileListCard
                    key={item.id}
                    href={`/service-catalog/${item.id}`}
                    title={item.name}
                    subtitle={SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType}
                    amount={`${formatMoney(item.defaultUnitPrice)}${item.defaultUnitOfMeasure ? ` /${item.defaultUnitOfMeasure.replace('_', ' ')}` : ''}`}
                    amountLabel="Default Price"
                    onMoveUp={() => moveItem(item.id, -1)}
                    onMoveDown={() => moveItem(item.id, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < items.length - 1}
                    meta={[
                      { label: 'Category', value: item.category ?? '—' },
                      { label: 'Labor Hours', value: item.defaultLaborHours ?? '—' },
                      ...(item.isActive ? [] : [{ label: 'Status', value: 'Inactive' }]),
                    ]}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
