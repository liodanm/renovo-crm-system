'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { customersApi } from '../../../lib/api/customers';
import { PermissionGate } from '../../../components/auth/permission-gate';
import { CardSkeleton, CardError } from '../../../components/dashboard/dashboard-card';
import { OverviewTab } from '../../../components/customers/tabs/overview-tab';
import { PropertiesTab } from '../../../components/customers/tabs/properties-tab';
import { ServiceHistoryTab } from '../../../components/customers/tabs/service-history-tab';
import { NotesTab } from '../../../components/customers/tabs/notes-tab';
import { PhotosTab } from '../../../components/customers/tabs/photos-tab';
import { DocumentsTab } from '../../../components/customers/tabs/documents-tab';
import { ActivityTab } from '../../../components/customers/tabs/activity-tab';
import { AppShell } from '../../../components/layout/AppShell';

const TABS = ['Overview', 'Properties', 'Service History', 'Notes', 'Photos', 'Documents', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const LEAD_STATUS_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  churned: 'bg-red-100 text-red-700',
};

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { data: customer, error, isLoading, mutate } = useSWR([`customer`, customerId], () => customersApi.get(customerId));

  async function handleDelete() {
    if (!customer) return;
    if (!confirm(`Delete ${customer.businessName ?? customer.firstName}? This can be restored by support if needed.`)) return;
    await customersApi.delete(customerId);
    router.push('/customers');
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/customers" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Customers
        </Link>

        {isLoading && <CardSkeleton lines={4} />}
        {error && <CardError message="Couldn't load this customer" />}

        {customer && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900">
                    {customer.businessName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unnamed customer'}
                  </h1>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_STYLES[customer.leadStatus] ?? 'bg-slate-100'}`}>
                    {customer.leadStatus}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.email && <span>{customer.email}</span>}
                  <span className="capitalize">{customer.customerType}</span>
                </div>
              </div>

              <PermissionGate permissions={['customers.write']}>
                <button
                  onClick={handleDelete}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete Customer
                </button>
              </PermissionGate>
            </div>

            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                    activeTab === tab
                      ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {activeTab === 'Overview' && <OverviewTab customer={customer} onUpdated={() => mutate()} />}
              {activeTab === 'Properties' && <PropertiesTab customerId={customerId} />}
              {activeTab === 'Service History' && <ServiceHistoryTab customerId={customerId} />}
              {activeTab === 'Notes' && <NotesTab customerId={customerId} />}
              {activeTab === 'Photos' && <PhotosTab customerId={customerId} />}
              {activeTab === 'Documents' && <DocumentsTab customerId={customerId} />}
              {activeTab === 'Activity' && <ActivityTab customerId={customerId} />}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
