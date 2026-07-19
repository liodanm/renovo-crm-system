'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { estimatesApi, SERVICE_TYPES } from '../../../lib/api/estimates';
import { PermissionGate } from '../../../components/auth/permission-gate';
import { ApiError } from '../../../lib/api/api-client';
import { AppShell } from '../../../components/layout/AppShell';
import { DocumentEmailSection } from '../../../components/documents/DocumentEmailSection';

function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string | number | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function serviceLabel(value: string): string {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: estimate, error, isLoading, mutate } = useSWR(['estimate', params.id], () => estimatesApi.get(params.id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  async function handleConvertToJob() {
    setIsActing(true);
    setActionError(null);
    try {
      const job = await estimatesApi.convertToJob(params.id);
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to convert estimate to a job.');
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/estimates" className="text-sm text-slate-500 hover:text-slate-800">← Back to Estimates</Link>

        {isLoading && <div className="mt-6 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-6 text-sm text-red-600">Couldn't load this estimate.</div>}

        {estimate && (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{estimate.estimateNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {customerName(estimate.customer)} · {estimate.property.addressLine1}, {estimate.property.city}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium capitalize text-slate-700">
                {estimate.status}
              </span>
            </div>

            {actionError && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {estimate.status === 'accepted' && (
                <button
                  onClick={handleConvertToJob}
                  disabled={isActing}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isActing ? 'Converting…' : 'Convert to Job'}
                </button>
              )}
            </div>

            <DocumentEmailSection
              documentLabel="Estimate"
              customerEmail={estimate.customer.email}
              hasBeenSent={estimate.status !== 'draft'}
              pdfPath={estimatesApi.pdfPath(estimate.id)}
              onSendEmail={(toEmail) => estimatesApi.sendEmail(estimate.id, toEmail).then(async (r) => { await mutate(); return r; })}
              onGetHistory={() => estimatesApi.getEmailHistory(estimate.id)}
              historyKey={`estimate-email-history-${estimate.id}`}
            />

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <PermissionGate permissions={['estimates.profitability']}>
                      <th className="px-4 py-3 text-right">Est. Profit</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                    </PermissionGate>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {estimate.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-slate-700">{serviceLabel(item.serviceType)}</td>
                      <td className="px-4 py-3 text-slate-500">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity} {item.unitOfMeasure.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total)}</td>
                      <PermissionGate permissions={['estimates.profitability']}>
                        <td className={`px-4 py-3 text-right font-medium ${Number(item.estimatedProfit) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {item.estimatedProfit !== undefined ? formatMoney(item.estimatedProfit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {item.profitMarginPercent !== undefined ? `${Number(item.profitMarginPercent).toFixed(1)}%` : '—'}
                        </td>
                      </PermissionGate>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-200 px-4 py-4">
                <div className="ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatMoney(estimate.subtotal)}</span>
                  </div>
                  {Number(estimate.discountAmount) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount {estimate.discountType === 'percentage' ? '(%)' : '(flat)'}</span>
                      <span>−{formatMoney(estimate.discountAmount)}</span>
                    </div>
                  )}
                  {Number(estimate.taxAmount) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({(Number(estimate.taxRate) * 100).toFixed(2)}%)</span>
                      <span>{formatMoney(estimate.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{formatMoney(estimate.totalAmount)}</span>
                  </div>
                </div>

                <PermissionGate permissions={['estimates.profitability']}>
                  {estimate.totalEstimatedProfit !== undefined && (
                    <div className="ml-auto mt-3 max-w-xs rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex justify-between font-medium text-slate-700">
                        <span>Est. Profit</span>
                        <span className={estimate.totalEstimatedProfit < 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {formatMoney(estimate.totalEstimatedProfit)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Margin</span>
                        <span>{estimate.overallProfitMarginPercent?.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                </PermissionGate>
              </div>
            </div>

            {estimate.notes && (
              <div className="mt-6">
                <h2 className="text-sm font-medium text-slate-700">Notes</h2>
                <p className="mt-1 text-sm text-slate-600">{estimate.notes}</p>
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
