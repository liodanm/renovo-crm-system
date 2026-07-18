'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Printer } from 'lucide-react';
import { AppShell } from '../../../../components/layout/AppShell';
import { paymentsApi, PAYMENT_METHOD_LABELS, invoiceCustomerNameFromReceipt } from '../../../../lib/api/payments';

function formatMoney(value: string | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const { data: receipt, error, isLoading } = useSWR(['receipt', params.id], () => paymentsApi.getReceipt(params.id));

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8 print:px-0 print:py-0">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-800">← Back</Link>
          {receipt && (
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" /> Print
            </button>
          )}
        </div>

        {isLoading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {error && <p className="mt-6 text-sm text-red-600">Couldn't load this receipt.</p>}

        {receipt && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
            {/* Branding rendered dynamically from Settings at view time — never a stored copy on the payment itself */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-6">
              <div>
                {receipt.branding.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={receipt.branding.logoUrl} alt={receipt.companyName} className="h-10" />
                )}
                <h1 className="mt-2 text-lg font-semibold text-slate-900">{receipt.companyDba ?? receipt.companyName}</h1>
                <p className="text-xs text-slate-500">{receipt.companyAddressLine1}, {receipt.companyCity}, {receipt.companyState}</p>
                <p className="text-xs text-slate-500">{receipt.companyPhone} · {receipt.companyEmail}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-700">Payment Receipt</p>
                <p className="text-xs text-slate-400">{receipt.receiptNumber}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500">Received From</p>
                <p className="mt-0.5 text-slate-900">{invoiceCustomerNameFromReceipt(receipt)}</p>
                {receipt.propertyAddressLine1 && <p className="text-xs text-slate-500">{receipt.propertyAddressLine1}, {receipt.propertyCity}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">For Invoice</p>
                <p className="mt-0.5 text-slate-900">{receipt.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Payment Method</p>
                <p className="mt-0.5 text-slate-900">{PAYMENT_METHOD_LABELS[receipt.method] ?? receipt.method}</p>
                {receipt.referenceNumber && <p className="text-xs text-slate-500">Ref: {receipt.referenceNumber}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">Date</p>
                <p className="mt-0.5 text-slate-900">{receipt.paymentDate ? new Date(receipt.paymentDate).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-center">
              <p className="text-xs font-medium text-emerald-700">Amount Paid</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{formatMoney(receipt.amount)}</p>
              {Number(receipt.invoiceBalanceDue) > 0 && (
                <p className="mt-1 text-xs text-emerald-700">Remaining balance on invoice: {formatMoney(receipt.invoiceBalanceDue)}</p>
              )}
            </div>

            {receipt.googleReviewUrl && (
              <div className="mt-6 text-center print:hidden">
                <a href={receipt.googleReviewUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-[var(--color-brand)]">
                  Enjoyed our service? Leave us a review →
                </a>
              </div>
            )}

            {receipt.branding.footerMessage && <p className="mt-6 text-center text-xs text-slate-400">{receipt.branding.footerMessage}</p>}
          </div>
        )}
      </main>
    </AppShell>
  );
}
