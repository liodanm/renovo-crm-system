'use client';

import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { CardSkeleton, CardError, CardEmpty } from '../../dashboard/dashboard-card';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function ServiceHistoryTab({ customerId, lifetimeValue }: { customerId: string; lifetimeValue: number }) {
  const { data, error, isLoading } = useSWR([`service-history`, customerId], () => customersApi.getServiceHistory(customerId));

  if (isLoading) return <CardSkeleton lines={6} />;
  if (error || !data) return <CardError />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Jobs" value={String(data.summary.totalJobs)} />
        <Stat label="Completed" value={String(data.summary.completedJobs)} />
        <Stat label="Lifetime Value" value={currency.format(lifetimeValue)} accent="success" />
        <Stat
          label="Outstanding"
          value={currency.format(data.summary.outstandingBalance)}
          accent={data.summary.outstandingBalance > 0 ? 'warning' : 'default'}
        />
      </div>

      <Section title="Jobs">
        {data.jobs.length === 0 && <CardEmpty message="No jobs yet." />}
        {data.jobs.map((j) => (
          <Row key={j.id} left={j.title} mid={j.address} right={currency.format(j.price)} status={j.status} date={j.scheduledStart} />
        ))}
      </Section>

      <Section title="Estimates">
        {data.estimates.length === 0 && <CardEmpty message="No estimates yet." />}
        {data.estimates.map((e) => (
          <Row key={e.id} left={`Estimate`} right={currency.format(e.totalAmount)} status={e.status} date={e.sentAt ?? e.createdAt} />
        ))}
      </Section>

      <Section title="Invoices">
        {data.invoices.length === 0 && <CardEmpty message="No invoices yet." />}
        {data.invoices.map((i) => (
          <Row
            key={i.id}
            left={i.invoiceNumber}
            mid={`${currency.format(i.amountPaid)} of ${currency.format(i.totalAmount)} paid`}
            right={i.dueDate ? `Due ${new Date(i.dueDate).toLocaleDateString()}` : ''}
            status={i.status}
          />
        ))}
      </Section>

      <Section title="Payments">
        {data.payments.length === 0 && <CardEmpty message="No payments yet." />}
        {data.payments.map((p) => (
          <Row key={p.id} left={p.method} right={currency.format(p.amount)} status={p.status} date={p.processedAt} />
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, accent = 'default' }: { label: string; value: string; accent?: 'default' | 'success' | 'warning' }) {
  const color = { default: 'text-slate-900 dark:text-slate-100', success: 'text-emerald-600 dark:text-emerald-400', warning: 'text-amber-600 dark:text-amber-400' }[accent];
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function Row({
  left,
  mid,
  right,
  status,
  date,
}: {
  left: string;
  mid?: string;
  right?: string;
  status?: string;
  date?: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
      <div>
        <div className="font-medium text-slate-800">{left}</div>
        {mid && <div className="text-xs text-slate-500 dark:text-slate-400">{mid}</div>}
        {date && <div className="text-xs text-slate-400 dark:text-slate-500">{new Date(date).toLocaleDateString()}</div>}
      </div>
      <div className="flex items-center gap-2">
        {status && <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-600 dark:text-slate-400">{status}</span>}
        {right && <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{right}</span>}
      </div>
    </div>
  );
}
