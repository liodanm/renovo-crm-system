'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { invoicesApi, invoiceCustomerName, INVOICE_STATUS_LABELS } from '../../../lib/api/invoices';
import { AppShell } from '../../../components/layout/AppShell';
import { ApiError } from '../../../lib/api/api-client';
import { PaymentsSection } from '../../../components/payments/PaymentsSection';
import { DocumentEmailSection } from '../../../components/documents/DocumentEmailSection';

function formatMoney(value: string | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: invoice, error, isLoading, mutate } = useSWR(['invoice', params.id], () => invoicesApi.get(params.id));
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleVoid() {
    if (!confirm('Void this invoice? This cannot be undone.')) return;
    setIsActing(true);
    setActionError(null);
    try {
      await invoicesApi.void(params.id);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-800">← Back to Invoices</Link>

        {isLoading && <div className="mt-6 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-6 text-sm text-red-600">Couldn't load this invoice.</div>}

        {invoice && (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{invoice.invoiceNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">{invoiceCustomerName(invoice)} · {invoice.propertyAddressLine1}, {invoice.propertyCity}</p>
                <div className="mt-1 flex gap-3 text-xs">
                  {invoice.jobId && <Link href={`/jobs/${invoice.jobId}`} className="text-[var(--color-brand)]">View Job →</Link>}
                  {invoice.estimateId && <Link href={`/estimates/${invoice.estimateId}`} className="text-[var(--color-brand)]">View Estimate →</Link>}
                </div>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
            </div>

            {actionError && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!['paid', 'void', 'partial'].includes(invoice.status) && (
                <button onClick={handleVoid} disabled={isActing} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
                  Void
                </button>
              )}
              {invoice.status === 'partial' && (
                <p className="text-xs text-slate-500">
                  This invoice has active payments and can't be voided yet — void or fully refund the payment(s) below first.
                </p>
              )}
            </div>

            <DocumentEmailSection
              documentLabel="Invoice"
              customerEmail={invoice.customerEmail}
              hasBeenSent={invoice.status !== 'draft'}
              pdfPath={invoicesApi.pdfPath(invoice.id)}
              onSendEmail={(toEmail) => invoicesApi.sendEmail(invoice.id, toEmail).then(async (r) => { await mutate(); return r; })}
              onGetHistory={() => invoicesApi.getEmailHistory(invoice.id)}
              historyKey={`invoice-email-history-${invoice.id}`}
            />

            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Issue Date</p>
                <p className="mt-0.5 text-sm text-slate-900">{formatDate(invoice.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Due Date</p>
                <p className="mt-0.5 text-sm text-slate-900">{formatDate(invoice.dueDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Sent</p>
                <p className="mt-0.5 text-sm text-slate-900">{invoice.sentAt ? formatDate(invoice.sentAt) : 'Not sent'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Paid</p>
                <p className="mt-0.5 text-sm text-slate-900">{invoice.paidAt ? formatDate(invoice.paidAt) : 'Not paid'}</p>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="divide-y divide-slate-100 lg:hidden">
                {invoice.lineItems.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium text-slate-900">{item.description}</span>
                      <span className="shrink-0 font-medium text-slate-900">{formatMoney(item.total)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.quantity} {item.unitOfMeasure?.replace('_', ' ')} × {formatMoney(item.unitPrice)}</p>
                  </div>
                ))}
              </div>

              <table className="hidden w-full text-sm lg:table">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-slate-700">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity} {item.unitOfMeasure?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-1 border-t border-slate-200 px-4 py-3 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(invoice.subtotal)}</span></div>
                {Number(invoice.discountAmount) > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{formatMoney(invoice.discountAmount)}</span></div>}
                <div className="flex justify-between text-slate-500"><span>Tax ({(Number(invoice.taxRate) * 100).toFixed(2)}%)</span><span>{formatMoney(invoice.taxAmount)}</span></div>
                <div className="flex justify-between text-base font-semibold text-slate-900"><span>Total</span><span>{formatMoney(invoice.totalAmount)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Amount Paid</span><span>{formatMoney(invoice.amountPaid)}</span></div>
                <div className="flex justify-between text-base font-semibold text-slate-900"><span>Balance Due</span><span>{formatMoney(invoice.balanceDue)}</span></div>
              </div>
            </div>

            <PaymentsSection invoiceId={invoice.id} balanceDue={invoice.balanceDue} invoiceStatus={invoice.status} onPaymentRecorded={() => mutate()} />

            {(invoice.notes || invoice.terms) && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {invoice.notes && (
                  <div>
                    <h2 className="text-sm font-medium text-slate-700">Notes</h2>
                    <p className="mt-1 text-sm text-slate-600">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <h2 className="text-sm font-medium text-slate-700">Terms</h2>
                    <p className="mt-1 text-sm text-slate-600">{invoice.terms}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
