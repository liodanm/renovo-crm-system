'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { reportsApi, resolvePreset, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function RevenueReportInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const [preset, setPreset] = useState<DatePreset>(urlStart ? 'Custom' : 'This Month');
  const resolved = resolvePreset(preset);
  const start = urlStart && preset === 'Custom' ? new Date(urlStart) : resolved.start;
  const end = urlEnd && preset === 'Custom' ? new Date(urlEnd) : resolved.end;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { data: kpis } = useSWR(['revenue-kpis', startIso, endIso], () => reportsApi.getPeriodKpis(startIso, endIso));
  const { data: collectedTrend } = useSWR(['revenue-collected', startIso, endIso], () => reportsApi.getPaymentTrend(startIso, endIso));
  const { data: invoicedTrend } = useSWR(['revenue-invoiced', startIso, endIso], () => reportsApi.getRevenueTrend(startIso, endIso));
  const { data: byService } = useSWR(['revenue-service', startIso, endIso], () => reportsApi.getRevenueByService(startIso, endIso));
  const { data: byTechnician } = useSWR(['revenue-tech', startIso, endIso], () => reportsApi.getRevenueByTechnician(startIso, endIso));
  const { data: byCustomer } = useSWR(['revenue-customer', startIso, endIso], () => reportsApi.getRevenueByCustomer(startIso, endIso));
  const { data: byLeadSource } = useSWR(['revenue-lead', startIso, endIso], () => reportsApi.getLeadSourceAnalytics(startIso, endIso));

  const collectedRevenue = collectedTrend?.reduce((sum, p) => sum + Number(p.amount ?? 0), 0) ?? null;
  const invoicedRevenue = invoicedTrend?.reduce((sum, p) => sum + Number(p.revenue ?? 0), 0) ?? null;

  const [breakdownTab, setBreakdownTab] = useState<'service' | 'technician' | 'customer' | 'leadSource'>('service');

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">← Owner Scorecard</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Revenue & Sales Performance</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">How much business did we generate and collect?</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button key={p} onClick={() => { setPreset(p); router.replace('/reports/revenue'); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Six distinct KPIs, each labeled with its own real definition — never a generic "Revenue" that could mean any of these. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Collected Revenue" value={money(collectedRevenue)} sub="Successful payments" />
        <Kpi label="Invoiced Revenue" value={money(invoicedRevenue)} sub="Invoice totals" />
        <Kpi label="Accepted Estimate Value" value={money(kpis?.acceptedEstimateValue)} sub="Accepted estimates" />
        <Kpi label="Completed Jobs" value={kpis?.jobsCompleted ?? '—'} />
        <Kpi label="Average Ticket" value={money(kpis?.averageTicket)} sub="Completed job revenue ÷ jobs" />
        <Kpi label="Won Estimates" value={kpis?.estimatesAccepted ?? '—'} sub="Accepted this period" />
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Breakdown</h2>
        <div className="mt-2 flex gap-1 border-b border-slate-100 dark:border-slate-800">
          {([['service', 'Service'], ['technician', 'Technician'], ['customer', 'Customer'], ['leadSource', 'Lead Source']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setBreakdownTab(key)}
              className={cn('border-b-2 px-3 py-2 text-xs font-medium', breakdownTab === key ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-slate-400 dark:text-slate-500')}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto">
          {breakdownTab === 'service' && (
            <BreakdownTable rows={byService} columns={[{ key: 'serviceName', label: 'Service' }, { key: 'invoiceCount', label: 'Invoices', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right', money: true }]} emptyText="No invoiced revenue in this period." />
          )}
          {breakdownTab === 'technician' && (
            <BreakdownTable rows={byTechnician?.map((t) => ({ ...t, name: `${t.firstName} ${t.lastName}` }))} columns={[{ key: 'name', label: 'Technician' }, { key: 'jobsCompleted', label: 'Jobs', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right', money: true }, { key: 'averageTicket', label: 'Avg Ticket', align: 'right', money: true }]} emptyText="No completed jobs with an assigned technician in this period." />
          )}
          {breakdownTab === 'customer' && (
            <BreakdownTable rows={byCustomer} columns={[{ key: 'customerName', label: 'Customer' }, { key: 'invoiceCount', label: 'Invoices', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right', money: true }]} emptyText="No invoiced revenue in this period." />
          )}
          {breakdownTab === 'leadSource' && (
            <BreakdownTable rows={byLeadSource} columns={[{ key: 'source', label: 'Lead Source' }, { key: 'convertedCount', label: 'Converted', align: 'right' }, { key: 'totalRevenue', label: 'Revenue', align: 'right', money: true }]} emptyText="No lead source data in this period." />
          )}
        </div>
      </div>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

function BreakdownTable<T extends Record<string, any>>({
  rows,
  columns,
  emptyText,
}: {
  rows: T[] | undefined;
  columns: { key: string; label: string; align?: 'right'; money?: boolean }[];
  emptyText: string;
}) {
  if (!rows) return <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-400 dark:text-slate-500">
        <tr>{columns.map((c) => <th key={c.key} className={cn('pb-1.5 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key} className={cn('py-1.5 text-slate-700 dark:text-slate-300', c.align === 'right' && 'text-right')}>
                {c.money ? money(row[c.key]) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RevenueReportPage() {
  return (
    <Suspense fallback={null}>
      <RevenueReportInner />
    </Suspense>
  );
}
