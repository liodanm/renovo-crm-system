'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { customersApi, JOURNEY_STAGE_LABELS } from '../../../lib/api/customers';
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
import { RecordStandalonePayment } from '../../../components/customers/record-standalone-payment';
import { DeleteCustomerModal } from '../../../components/customers/delete-customer-modal';

const TABS = ['Overview', 'Properties', 'Service History', 'Notes', 'Photos', 'Documents', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const LEAD_STATUS_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  inactive: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  archived: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  churned: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { data: customer, error, isLoading, mutate } = useSWR([`customer`, customerId], () => customersApi.get(customerId));
  // Same SWR key the Service History tab itself uses — SWR dedupes
  // identical keys, so this shares one cached fetch rather than issuing
  // a second request just because the Intelligence card also needs it.
  const { data: serviceHistory, mutate: mutateServiceHistory } = useSWR([`service-history`, customerId], () => customersApi.getServiceHistory(customerId));

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/customers" className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800">
          ← Customers
        </Link>

        {isLoading && <CardSkeleton lines={4} />}
        {error && <CardError message="Couldn't load this customer" />}

        {customer && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {customer.businessName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unnamed customer'}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 dark:text-slate-500">Relationship:</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_STYLES[customer.leadStatus] ?? 'bg-slate-100 dark:bg-slate-800'}`}>
                      {customer.leadStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 dark:text-slate-500">Journey:</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {JOURNEY_STAGE_LABELS[customer.journeyStage]}
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.email && <span>{customer.email}</span>}
                  <span className="capitalize">{customer.customerType}</span>
                </div>
              </div>

              <PermissionGate permissions={['customers.write']}>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/customers/${customerId}/edit`}
                    className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
                  >
                    Edit
                  </Link>
                  <button
                    disabled
                    title="Merge already works on the backend — this button is a placeholder until the merge picker UI is built"
                    className="cursor-not-allowed rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 dark:text-slate-500"
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-950"
                  >
                    Delete Customer
                  </button>
                </div>
              </PermissionGate>
              <PermissionGate permissions={['payments.write']}>
                <div className="mt-2">
                  <RecordStandalonePayment customerId={customerId} onRecorded={() => mutateServiceHistory()} />
                </div>
              </PermissionGate>
            </div>

            {serviceHistory && (
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Customer Intelligence</h2>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Customer Since</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Journey Stage</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{JOURNEY_STAGE_LABELS[customer.journeyStage]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Last Service</dt>
                    <dd className="text-slate-800 dark:text-slate-100">
                      {serviceHistory.intelligence.lastServiceDate
                        ? new Date(serviceHistory.intelligence.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'None yet'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Lifetime Value</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{currency.format(customer.lifetimeValue)}</dd>
                  </div>
                  {customer.balanceDue && Number(customer.balanceDue) > 0 && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Balance Due</dt>
                      <dd className="font-medium text-red-600 dark:text-red-400">{currency.format(Number(customer.balanceDue))}</dd>
                    </div>
                  )}
                  {customer.openEstimatesCount > 0 && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Open Estimates</dt>
                      <dd className="text-slate-800 dark:text-slate-100">{customer.openEstimatesCount}</dd>
                    </div>
                  )}
                  {customer.openInvoicesCount > 0 && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Open Invoices</dt>
                      <dd className="text-slate-800 dark:text-slate-100">{customer.openInvoicesCount}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Jobs Completed</dt>
                    <dd className="text-slate-800 dark:text-slate-100">{serviceHistory.intelligence.jobsCompleted}</dd>
                  </div>
                  {serviceHistory.intelligence.jobsCompleted > 0 && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Average Job Value</dt>
                      <dd className="text-slate-800 dark:text-slate-100">{currency.format(serviceHistory.intelligence.averageJobValue)}</dd>
                    </div>
                  )}
                  {serviceHistory.intelligence.recommendedUpsell && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Recommended Upsell</dt>
                      <dd className="text-slate-800 dark:text-slate-100">{serviceHistory.intelligence.recommendedUpsell.name}</dd>
                    </div>
                  )}
                  {serviceHistory.intelligence.overdueForCleaning && (
                    <div>
                      <dt className="text-xs text-slate-400 dark:text-slate-500">Status</dt>
                      <dd className="font-medium text-amber-600 dark:text-amber-400">Overdue for cleaning</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-400 dark:text-slate-500">Review Status</dt>
                    <dd className="text-slate-800 dark:text-slate-100">
                      {serviceHistory.intelligence.reviewStatus === 'received' && <span className="font-medium text-emerald-600 dark:text-emerald-400">⭐ Review Received</span>}
                      {serviceHistory.intelligence.reviewStatus === 'sent' && 'Request Sent'}
                      {serviceHistory.intelligence.reviewStatus === 'failed' && <span className="text-red-600 dark:text-red-400">Request Failed</span>}
                      {serviceHistory.intelligence.reviewStatus === 'never_requested' && 'Never Requested'}
                      {serviceHistory.intelligence.reviewStatus !== 'received' && (
                        <button
                          onClick={async () => {
                            await customersApi.markReviewReceived(customerId);
                            mutateServiceHistory();
                          }}
                          className="ml-2 text-xs text-[var(--color-brand)] hover:underline"
                        >
                          Mark as Reviewed
                        </button>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                    activeTab === tab
                      ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {activeTab === 'Overview' && <OverviewTab customer={customer} onUpdated={() => mutate()} />}
              {activeTab === 'Properties' && <PropertiesTab customerId={customerId} />}
              {activeTab === 'Service History' && <ServiceHistoryTab customerId={customerId} lifetimeValue={customer.lifetimeValue} />}
              {activeTab === 'Notes' && <NotesTab customerId={customerId} />}
              {activeTab === 'Photos' && <PhotosTab customerId={customerId} />}
              {activeTab === 'Documents' && <DocumentsTab customerId={customerId} />}
              {activeTab === 'Activity' && <ActivityTab customerId={customerId} />}
            </div>
          </>
        )}
      </main>

      {showDeleteModal && customer && (
        <DeleteCustomerModal
          customerId={customerId}
          customerName={customer.businessName?.trim() || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()}
          jobsCount={serviceHistory?.jobs.length ?? 0}
          estimatesCount={serviceHistory?.estimates.length ?? 0}
          invoicesCount={serviceHistory?.invoices.length ?? 0}
          onClose={() => setShowDeleteModal(false)}
          onRemoved={() => router.push('/customers')}
        />
      )}
    </AppShell>
  );
}
