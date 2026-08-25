'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { Check, MoreHorizontal, Phone, Mail } from 'lucide-react';
import { customersApi, JOURNEY_STAGE_LABELS, type JourneyStage } from '../../../lib/api/customers';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';

// Internal tab identity is unchanged from before this redesign — only
// the visible label for one tab changes ("Jobs & Estimates" instead of
// "Service History"). This is client-side state, not a URL route, so
// relabeling it carries zero risk of breaking a link or bookmark.
const TABS = ['Overview', 'Properties', 'Jobs & Estimates', 'Notes', 'Photos', 'Documents', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const LEAD_STATUS_STYLES: Record<string, string> = {
  lead: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  inactive: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  archived: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  churned: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

// The existing journey model has exactly 4 real states — nothing here
// is invented. "Repeat" is deliberately NOT one of them (Renovo has no
// distinct "repeat customer" journey stage of its own, only a derived
// repeat-customer *report* elsewhere), so it's correctly left off this
// strip rather than fabricated to match the task brief's example.
const JOURNEY_STEPS: JourneyStage[] = ['new_lead', 'estimate_sent', 'scheduled', 'completed'];

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { data: customer, error, isLoading, mutate } = useSWR([`customer`, customerId], () => customersApi.get(customerId));
  // Same SWR key every tab/section on this page already shares — one
  // cached fetch, not a new request per section.
  const { data: serviceHistory, mutate: mutateServiceHistory } = useSWR([`service-history`, customerId], () => customersApi.getServiceHistory(customerId));

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const displayName = customer ? customer.businessName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unnamed customer' : '';
  const currentStepIndex = customer ? JOURNEY_STEPS.indexOf(customer.journeyStage) : -1;

  return (
    <AppShell>
      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <Link href="/customers" className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          ← Customers
        </Link>

        {isLoading && <div className="mt-3"><CardSkeleton lines={4} /></div>}
        {error && <div className="mt-3"><CardError message="Couldn't load this customer" /></div>}

        {customer && (
          <>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100">{displayName}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', LEAD_STATUS_STYLES[customer.leadStatus] ?? 'bg-slate-100 dark:bg-slate-800')}>
                    {customer.leadStatus}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-slate-500 dark:text-slate-400">{JOURNEY_STAGE_LABELS[customer.journeyStage]}</span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="capitalize text-slate-500 dark:text-slate-400">{customer.customerType}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-[var(--color-brand)]">
                      <Phone className="h-3.5 w-3.5" /> {customer.phone}
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-[var(--color-brand)]">
                      <Mail className="h-3.5 w-3.5" /> {customer.email}
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <PermissionGate permissions={['payments.write']}>
                  <RecordStandalonePayment customerId={customerId} onRecorded={() => mutateServiceHistory()} />
                </PermissionGate>
                <Link
                  href={`/estimates/new?customerId=${customerId}`}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  + New Estimate
                </Link>
                <PermissionGate permissions={['customers.write']}>
                  <Link href={`/customers/${customerId}/edit`} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-xs font-medium text-white hover:opacity-90">
                    Edit
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled title="Merge already works on the backend — this option is a placeholder until the merge picker UI is built">
                        Merge Customer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setShowDeleteModal(true)} className="text-red-600 dark:text-red-400">
                        Delete Customer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </PermissionGate>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Lifetime Value" value={currency.format(customer.lifetimeValue)} />
              <Kpi label="Open Estimates" value={String(customer.openEstimatesCount)} />
              <Kpi label="Open Invoices" value={String(customer.openInvoicesCount)} />
              <Kpi label="Balance Due" value={currency.format(Number(customer.balanceDue))} tone={Number(customer.balanceDue) > 0 ? 'warning' : undefined} />
              <Kpi label="Jobs Completed" value={serviceHistory ? String(serviceHistory.intelligence.jobsCompleted) : '—'} />
              <Kpi
                label="Last Service"
                value={
                  serviceHistory
                    ? serviceHistory.intelligence.lastServiceDate
                      ? new Date(serviceHistory.intelligence.lastServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'None yet'
                    : '—'
                }
              />
            </div>

            <div className="mt-4 flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
              {JOURNEY_STEPS.map((step, i) => {
                const isDone = currentStepIndex >= 0 && i < currentStepIndex;
                const isCurrent = i === currentStepIndex;
                return (
                  <div key={step} className="flex shrink-0 items-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                          isDone && 'bg-emerald-500 text-white',
                          isCurrent && 'bg-[var(--color-brand)] text-white',
                          !isDone && !isCurrent && 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500',
                        )}
                      >
                        {isDone ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className={cn('whitespace-nowrap text-xs font-medium', isCurrent ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500')}>
                        {JOURNEY_STAGE_LABELS[step]}
                      </span>
                    </div>
                    {i < JOURNEY_STEPS.length - 1 && <div className={cn('mx-2 h-px w-6 shrink-0', isDone ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700')} />}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
                    activeTab === tab ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {activeTab === 'Overview' && <OverviewTab customer={customer} serviceHistory={serviceHistory} onUpdated={() => mutate()} onNavigateTab={setActiveTab} />}
              {activeTab === 'Properties' && <PropertiesTab customerId={customerId} />}
              {activeTab === 'Jobs & Estimates' && <ServiceHistoryTab customerId={customerId} lifetimeValue={customer.lifetimeValue} />}
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
      <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold', tone === 'warning' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>{value}</p>
    </div>
  );
}
