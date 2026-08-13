'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckSquare, X } from 'lucide-react';
import { customersApi, CustomerQueryParams } from '../../lib/api/customers';
import { CustomerTable } from '../../components/customers/customer-table';
import { CustomerFilters } from '../../components/customers/customer-filters';
import { CreateCustomerModal } from '../../components/customers/create-customer-modal';
import { ImportCsvModal } from '../../components/customers/import-csv-modal';
import { PermissionGate } from '../../components/auth/permission-gate';
import { CardSkeleton, CardError } from '../../components/dashboard/dashboard-card';
import { AppShell } from '../../components/layout/AppShell';
import { ActionBar, type ActionBarItem } from '../../components/action-center/ActionBar';
import { ConfirmDialog } from '../../components/action-center/ConfirmDialog';

export default function CustomersPage() {
  const [filters, setFilters] = useState<CustomerQueryParams>({ page: 1, pageSize: 25 });
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(['customers', filters], () => customersApi.list(filters));

  // Deliberate choice, not an oversight: selection clears on any filter
  // or page change, rather than persisting across a materially different
  // result set. For a destructive bulk action specifically, letting a
  // selection survive out of view risks deleting something the user no
  // longer remembers was selected once they've moved on to look at
  // something else.
  useEffect(() => {
    setSelectedIds(new Set());
    setMobileSelectionMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function handleExport() {
    setIsExporting(true);
    try {
      await customersApi.exportCsv();
    } finally {
      setIsExporting(false);
    }
  }

  function handleToggleOne(id: string, rangeSelectTo?: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (rangeSelectTo && data) {
        const ids = data.data.map((c) => c.id);
        const a = ids.indexOf(rangeSelectTo);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a];
          for (let i = start; i <= end; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "Select All" means the current page only — deliberately, not every
  // customer matching the active filter across all pages. Gmail-style
  // tools offer both levels ("Select all 50 on this page" / "Select all
  // 426 matching customers"); this CRM intentionally only offers the
  // first, safer level, since the second is exactly the kind of thing
  // that turns one accidental click into a catastrophic bulk delete.
  // data.data is already the server-paginated current-page slice (see
  // customersApi.list(filters)), not the full filtered result set, so
  // this is correct by construction, not just by convention.
  function handleToggleAll(select: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      (data?.data ?? []).forEach((c) => (select ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  }

  function cancelSelection() {
    setSelectedIds(new Set());
    setMobileSelectionMode(false);
  }

  async function handleBulkDelete() {
    setBulkDeleteError(null);
    const ids = Array.from(selectedIds);
    const result = await customersApi.bulkDelete(ids);
    if (result.failed.length > 0) {
      setBulkDeleteError(`Deleted ${result.succeeded.length} of ${ids.length}. ${result.failed.length} couldn't be deleted.`);
    }
    setSelectedIds(new Set());
    setMobileSelectionMode(false);
    mutate();
  }

  const actionBarPrimary: ActionBarItem[] = [];
  const actionBarSecondary: ActionBarItem[] = [
    { key: 'cancel', label: 'Cancel Selection', onClick: cancelSelection },
  ];
  const actionBarDanger: ActionBarItem[] = [
    { key: 'delete', label: 'Delete Selected', onClick: () => setShowDeleteConfirm(true) },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Customers</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {data ? `${data.pagination.total.toLocaleString()} total` : 'Loading…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/customers/duplicates"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
            >
              Review Duplicates
            </Link>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <PermissionGate permissions={['customers.write']}>
              <button
                onClick={() => setShowImport(true)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
              >
                Import CSV
              </button>
              {/* Mobile-only entry point into selection mode — desktop's
                  checkboxes are always visible in the table, so it never
                  needs an explicit mode toggle the way a phone-width card
                  list does. */}
              <button
                onClick={() => setMobileSelectionMode((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 lg:hidden lg:py-2 lg:text-sm"
              >
                {mobileSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                {mobileSelectionMode ? 'Cancel' : 'Select'}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)]"
              >
                + New Customer
              </button>
            </PermissionGate>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <CustomerFilters filters={filters} onChange={setFilters} />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          {isLoading && (
            <div className="p-4">
              <CardSkeleton lines={6} />
            </div>
          )}
          {error && (
            <div className="p-4">
              <CardError />
            </div>
          )}
          {!isLoading && !error && data && (
            <CustomerTable
              customers={data.data}
              selectedIds={selectedIds}
              onToggleOne={handleToggleOne}
              onToggleAll={handleToggleAll}
              selectionMode={mobileSelectionMode}
            />
          )}

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={data.pagination.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 z-10 mx-auto max-w-7xl px-4 pb-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg">
            <span className="px-2 text-sm font-medium text-slate-700 dark:text-slate-300">{selectedIds.size} selected (this page)</span>
            <ActionBar primary={actionBarPrimary} secondary={actionBarSecondary} danger={actionBarDanger} />
          </div>
        </div>
      )}

      {showCreate && (
        <CreateCustomerModal
          includeProperty
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            mutate();
          }}
        />
      )}

      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onImported={() => mutate()}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} customer${selectedIds.size === 1 ? '' : 's'} on this page?`}
          message="This can be restored by support if needed, same as deleting a single customer. Only the customers currently selected on this page are affected — nothing else matching your filters."
          confirmLabel="Delete Selected"
          danger
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={async () => {
            await handleBulkDelete();
            setShowDeleteConfirm(false);
          }}
        />
      )}

      {bulkDeleteError && (
        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300 shadow-lg">
          {bulkDeleteError}
          <button onClick={() => setBulkDeleteError(null)} className="ml-3 font-medium underline">Dismiss</button>
        </div>
      )}
    </AppShell>
  );
}
