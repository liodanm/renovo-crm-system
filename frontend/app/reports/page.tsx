'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { AppShell } from '../../components/layout/AppShell';
import { reportsApi, resolvePreset, exportToCsv, DATE_PRESETS, type DatePreset } from '../../lib/api/reports';
import { cn } from '../../lib/utils';

const SOURCE_COLORS = ['#0e7490', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#84cc16'];

/** Reshapes [{month, source, leadCount}] rows into one row per month with
    a key per source — the shape recharts' stacked BarChart needs, not
    a second query (the trend endpoint already returns the raw grouped
    rows; this is pure client-side pivoting of data that already exists). */
function pivotTrendByMonth(rows: { month: string; source: string; leadCount: string }[]) {
  const byMonth = new Map<string, any>();
  for (const row of rows) {
    const label = new Date(row.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!byMonth.has(label)) byMonth.set(label, { month: label });
    byMonth.get(label)[row.source] = Number(row.leadCount);
  }
  return Array.from(byMonth.values());
}

function money(value: string | number | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<DatePreset>('Last 30 Days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const { start, end } = resolvePreset(preset, customStart ? new Date(customStart) : undefined, customEnd ? new Date(customEnd) : undefined);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { data: snapshot } = useSWR('reports-snapshot', () => reportsApi.getSnapshot());
  const { data: periodKpis } = useSWR(['reports-period', startIso, endIso], () => reportsApi.getPeriodKpis(startIso, endIso));
  const { data: revenueTrend } = useSWR(['reports-revenue-trend', startIso, endIso], () => reportsApi.getRevenueTrend(startIso, endIso));
  const { data: paymentTrend } = useSWR(['reports-payment-trend', startIso, endIso], () => reportsApi.getPaymentTrend(startIso, endIso));
  const { data: jobTrend } = useSWR(['reports-job-trend', startIso, endIso], () => reportsApi.getJobCompletionTrend(startIso, endIso));
  const { data: revenueByService } = useSWR(['reports-by-service', startIso, endIso], () => reportsApi.getRevenueByService(startIso, endIso));
  const { data: revenueByCustomer } = useSWR(['reports-by-customer', startIso, endIso], () => reportsApi.getRevenueByCustomer(startIso, endIso));
  const { data: pipeline } = useSWR('reports-pipeline', () => reportsApi.getEstimatePipeline());
  const { data: customerAnalytics } = useSWR('reports-customer-analytics', () => reportsApi.getCustomerAnalytics());
  const { data: techPerformance } = useSWR(['reports-tech', startIso, endIso], () => reportsApi.getTechnicianPerformance(startIso, endIso));
  const { data: chemicalUsage } = useSWR(['reports-chemicals', startIso, endIso], () => reportsApi.getChemicalUsage(startIso, endIso));
  const { data: equipmentUsage } = useSWR(['reports-equipment', startIso, endIso], () => reportsApi.getEquipmentUsage(startIso, endIso));
  const { data: aging } = useSWR('reports-aging', () => reportsApi.getReceivablesAging());
  const { data: monthlyProfit } = useSWR(['reports-monthly-profit', startIso, endIso], () => reportsApi.getMonthlyProfitTrend(startIso, endIso));
  const { data: leadSourceAnalytics } = useSWR(['reports-lead-source', startIso, endIso], () => reportsApi.getLeadSourceAnalytics(startIso, endIso));
  const { data: leadSourceTrend } = useSWR(['reports-lead-source-trend', startIso, endIso], () => reportsApi.getLeadSourceTrend(startIso, endIso));

  const agingData = aging?.[0];

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  {p}
                </button>
              ))}
            </div>
            {preset === 'Custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
              </div>
            )}
          </div>
        </div>

        {/* Always-current snapshot — independent of the period selector above */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Revenue Today" value={money(snapshot?.revenueToday)} />
          <KpiCard label="Revenue This Week" value={money(snapshot?.revenueThisWeek)} />
          <KpiCard label="Revenue This Month" value={money(snapshot?.revenueThisMonth)} />
          <KpiCard label="Revenue This Year" value={money(snapshot?.revenueThisYear)} />
          <KpiCard label="Outstanding Invoices" value={money(snapshot?.outstandingInvoices)} tone="warning" />
          <KpiCard label="Overdue Invoices" value={`${money(snapshot?.overdueInvoices)} (${snapshot?.overdueInvoiceCount ?? 0})`} tone="danger" />
          <KpiCard label="Payments This Month" value={money(snapshot?.paymentsReceivedThisMonth)} tone="success" />
          <KpiCard label="Taxes Collected This Month" value={money(snapshot?.taxesCollectedThisMonth)} />
          {snapshot?.profit && (
            <KpiCard
              label="Est. Profit This Month"
              value={money(snapshot.profit.estimatedProfitThisMonth)}
              sublabel={snapshot.profit.profitMarginPercent != null ? `${snapshot.profit.profitMarginPercent}% margin` : undefined}
            />
          )}
        </div>

        {/* Period-scoped KPIs — respect the selector above */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Estimate Conversion" value={periodKpis?.estimateConversionRatePercent != null ? `${periodKpis.estimateConversionRatePercent}%` : '—'} />
          <KpiCard label="Average Ticket" value={money(periodKpis?.averageTicket)} />
          <KpiCard label="Jobs Completed" value={periodKpis?.jobsCompleted ?? '—'} />
          <KpiCard label="Jobs Scheduled" value={periodKpis?.jobsScheduled ?? '—'} />
          <KpiCard label="Avg Job Duration" value={periodKpis ? `${Number(periodKpis.averageJobDurationHours).toFixed(1)} hrs` : '—'} />
          <KpiCard label="Total Labor Hours" value={periodKpis?.totalLaborHours ?? '—'} />
          {customerAnalytics && (
            <>
              <KpiCard label="Repeat Customer Rate" value={customerAnalytics.repeatCustomerRatePercent != null ? `${customerAnalytics.repeatCustomerRatePercent}%` : '—'} />
              <KpiCard label="Avg Customer LTV" value={money(customerAnalytics.averageLifetimeValue)} />
            </>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Revenue Trend" onExport={revenueTrend ? () => exportToCsv('revenue-trend', revenueTrend) : undefined}>
            {revenueTrend && revenueTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueTrend.map((p) => ({ date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: Number(p.revenue ?? 0) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => money(v as number)} />
                  <Line type="monotone" dataKey="revenue" stroke="#0e7490" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="Payment Trend" onExport={paymentTrend ? () => exportToCsv('payment-trend', paymentTrend) : undefined}>
            {paymentTrend && paymentTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={paymentTrend.map((p) => ({ date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amount: Number(p.amount ?? 0) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => money(v as number)} />
                  <Line type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="Revenue by Service" onExport={revenueByService ? () => exportToCsv('revenue-by-service', revenueByService) : undefined}>
            {revenueByService && revenueByService.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueByService.map((s) => ({ name: s.serviceName, revenue: Number(s.revenue) }))} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => money(v as number)} />
                  <Bar dataKey="revenue" fill="#0e7490" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          <ChartCard title="Job Completion Trend" onExport={jobTrend ? () => exportToCsv('job-completion-trend', jobTrend) : undefined}>
            {jobTrend && jobTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={jobTrend.map((p) => ({ date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), jobs: Number(p.jobsCompleted ?? 0) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="jobs" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          {monthlyProfit && monthlyProfit.length > 0 && (
            <ChartCard title="Monthly Profit" onExport={() => exportToCsv('monthly-profit', monthlyProfit)}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyProfit.map((p) => ({ month: new Date(p.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), profit: Number(p.profit) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => money(v as number)} />
                  <Bar dataKey="profit" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {agingData && (
            <ChartCard title="Outstanding Receivables Aging">
              <div className="grid grid-cols-4 gap-2 py-4">
                <AgingBucket label="Current" value={money(agingData.current)} />
                <AgingBucket label="1–30 Days" value={money(agingData.days1To30)} tone="warning" />
                <AgingBucket label="31–60 Days" value={money(agingData.days31To60)} tone="warning" />
                <AgingBucket label="60+ Days" value={money(agingData.days60Plus)} tone="danger" />
              </div>
            </ChartCard>
          )}
        </div>

        <ChartCard title="Estimate Pipeline" className="mt-4">
          {pipeline && pipeline.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {pipeline.map((stage) => (
                <div key={stage.status} className="flex-1 min-w-[120px] rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium capitalize text-slate-500">{stage.status}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{stage.count}</p>
                  <p className="text-xs text-slate-400">{money(stage.totalValue)}</p>
                </div>
              ))}
            </div>
          ) : <EmptyChart />}
        </ChartCard>

        <h2 className="mt-6 text-base font-semibold text-slate-800">Marketing Analytics</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Pie — proportional share is the actual question ("what % of my leads come from where"), which a pie communicates more directly than a bar for a modest number of categories. */}
          <ChartCard title="Leads by Source" onExport={leadSourceAnalytics ? () => exportToCsv('leads-by-source', leadSourceAnalytics) : undefined}>
            {leadSourceAnalytics && leadSourceAnalytics.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={leadSourceAnalytics.map((s) => ({ name: s.source, value: Number(s.leadCount) }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(d) => `${d.name}: ${d.value}`}>
                    {leadSourceAnalytics.map((_, i) => (
                      <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>

          {/* Bar, not pie — comparing dollar magnitudes across sources is
              clearer as bar length than as pie-slice angle, especially
              once sources have noticeably different revenue scales. */}
          <ChartCard title="Revenue by Source" onExport={leadSourceAnalytics ? () => exportToCsv('revenue-by-source', leadSourceAnalytics) : undefined}>
            {leadSourceAnalytics && leadSourceAnalytics.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={leadSourceAnalytics.map((s) => ({ name: s.source, revenue: Number(s.totalRevenue) }))} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v) => money(v as number)} />
                  <Bar dataKey="revenue" fill="#0e7490" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </ChartCard>
        </div>

        {/* Stacked bar — the one visualization that shows both total
            monthly lead volume AND source composition at once, without
            the visual noise of one line per source. */}
        <ChartCard title="Monthly Lead Trends" className="mt-4" onExport={leadSourceTrend ? () => exportToCsv('monthly-lead-trends', leadSourceTrend) : undefined}>
          {leadSourceTrend && leadSourceTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pivotTrendByMonth(leadSourceTrend)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Array.from(new Set(leadSourceTrend.map((p) => p.source))).map((source, i) => (
                  <Bar key={source} dataKey={source} stackId="leads" fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <div className="mt-4">
          <TableCard
            title="Source Performance"
            subtitle="Conversion = at least one succeeded payment. Lifetime Value reuses the same maintained figure shown everywhere else in the CRM, not a separate calculation."
            rows={leadSourceAnalytics}
            onExport={leadSourceAnalytics ? () => exportToCsv('source-performance', leadSourceAnalytics) : undefined}
            columns={[
              { key: 'source', label: 'Source' },
              { key: 'leadCount', label: 'Leads' },
              { key: 'convertedCount', label: 'Converted', render: (r) => `${r.convertedCount} (${r.leadCount > 0 ? Math.round((Number(r.convertedCount) / Number(r.leadCount)) * 100) : 0}%)` },
              { key: 'totalRevenue', label: 'Revenue', format: money },
              { key: 'averageTicket', label: 'Avg Ticket', format: money },
              { key: 'averageLifetimeValue', label: 'Avg LTV', format: money },
              { key: 'repeatCustomerCount', label: 'Repeat Customers' },
            ]}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TableCard title="Top Customers" rows={revenueByCustomer} onExport={revenueByCustomer ? () => exportToCsv('top-customers', revenueByCustomer) : undefined}
            columns={[{ key: 'customerName', label: 'Customer' }, { key: 'invoiceCount', label: 'Invoices' }, { key: 'revenue', label: 'Revenue', format: money }]} />

          <TableCard title="Technician Performance" rows={techPerformance} onExport={techPerformance ? () => exportToCsv('technician-performance', techPerformance) : undefined}
            columns={[
              { key: 'name', label: 'Technician', render: (r: any) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() },
              { key: 'jobsCompleted', label: 'Jobs' },
              { key: 'averageJobDurationHours', label: 'Avg Hrs', format: (v: any) => Number(v).toFixed(1) },
              { key: 'totalLaborHours', label: 'Total Hrs' },
            ]} />

          <TableCard title="Chemical Usage" subtitle="By quantity — no per-unit cost is tracked yet" rows={chemicalUsage} onExport={chemicalUsage ? () => exportToCsv('chemical-usage', chemicalUsage) : undefined}
            columns={[{ key: 'chemicalName', label: 'Chemical' }, { key: 'totalQuantity', label: 'Qty' }, { key: 'unit', label: 'Unit' }, { key: 'jobCount', label: 'Jobs' }]} />

          <TableCard title="Equipment Usage" rows={equipmentUsage} onExport={equipmentUsage ? () => exportToCsv('equipment-usage', equipmentUsage) : undefined}
            columns={[{ key: 'equipmentName', label: 'Equipment' }, { key: 'usageCount', label: 'Times Used' }, { key: 'jobCount', label: 'Jobs' }]} />
        </div>
      </main>
    </AppShell>
  );
}

function KpiCard({ label, value, sublabel, tone }: { label: string; value: React.ReactNode; sublabel?: string; tone?: 'warning' | 'danger' | 'success' }) {
  const toneClass = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold', toneClass)}>{value}</p>
      {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}
    </div>
  );
}

function ChartCard({ title, children, className, onExport }: { title: string; children: React.ReactNode; className?: string; onExport?: () => void }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {onExport && (
          <button onClick={onExport} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function AgingBucket({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'danger' }) {
  const toneClass = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-base font-semibold', toneClass)}>{value}</p>
    </div>
  );
}

function TableCard({ title, subtitle, rows, columns, onExport }: { title: string; subtitle?: string; rows: any[] | undefined; columns: { key: string; label: string; format?: (v: any) => string; render?: (row: any) => string }[]; onExport?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        {onExport && (
          <button onClick={onExport} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        )}
      </div>
      <div className="mt-3">
        {!rows || rows.length === 0 ? (
          <EmptyChart />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr>{columns.map((c) => <th key={c.key} className="pb-1.5 text-left font-medium">{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 8).map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="py-1.5 text-slate-700">
                      {c.render ? c.render(row) : c.format ? c.format(row[c.key]) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">No data for this period yet.</div>;
}
