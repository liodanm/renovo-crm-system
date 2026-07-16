'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { customersApi, CustomerQueryParams } from '../../lib/api/customers';
import { CustomerTable } from '../../components/customers/customer-table';
import { CustomerFilters } from '../../components/customers/customer-filters';
import { CreateCustomerModal } from '../../components/customers/create-customer-modal';
import { ImportCsvModal } from '../../components/customers/import-csv-modal';
import { PermissionGate } from '../../components/auth/permission-gate';
import { CardSkeleton, CardError } from '../../components/dashboard/dashboard-card';

export default function CustomersPage() {
  const [filters, setFilters] = useState<CustomerQueryParams>({ page: 1, pageSize: 25 });
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(['customers', filters], () => customersApi.list(filters));

  async function handleExport() {
    setIsExporting(true);
    try {
      await customersApi.exportCsv();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-brand)]">
            Renovo CRM
          </Link>
          <nav className="hidden gap-4 text-sm font-medium text-slate-500 sm:flex">
            <Link href="/" className="hover:text-slate-800">Dashboard</Link>
            <Link href="/customers" className="text-slate-900">Customers</Link>
            <Link href="/estimates" className="hover:text-slate-800">Estimates</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data ? `${data.pagination.total.toLocaleString()} total` : 'Loading…'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/customers/duplicates"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Review Duplicates
            </Link>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <PermissionGate permissions={['customers.write']}>
              <button
                onClick={() => setShowImport(true)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Import CSV
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

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <CustomerFilters filters={filters} onChange={setFilters} />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
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
          {!isLoading && !error && data && <CustomerTable customers={data.data} />}

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <span className="text-xs text-slate-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={data.pagination.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <CreateCustomerModal
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
    </div>
  );
}
