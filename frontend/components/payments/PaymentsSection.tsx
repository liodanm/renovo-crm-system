'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { paymentsApi, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '../../lib/api/payments';
import { settingsApi } from '../../lib/api/settings';
import { ApiError } from '../../lib/api/api-client';
import { cn } from '../../lib/utils';

const ALL_METHODS = Object.keys(PAYMENT_METHOD_LABELS);

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PaymentsSection({ invoiceId, balanceDue, invoiceStatus, onPaymentRecorded }: { invoiceId: string; balanceDue: string; invoiceStatus: string; onPaymentRecorded: () => void }) {
  const { data: payments, mutate } = useSWR(['invoice-payments', invoiceId], () => paymentsApi.listByInvoice(invoiceId));
  // Real read from Payment Settings — this is what makes "which methods
  // can I record a payment as" actually configurable rather than the
  // fixed, hardcoded list this form used before that page existed.
  const { data: paymentSettings } = useSWR('payments-settings-for-form', () => settingsApi.getPaymentSettings());
  const availableMethods = paymentSettings?.enabledPaymentMethods?.length ? paymentSettings.enabledPaymentMethods : ALL_METHODS;
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecord() {
    setIsSaving(true);
    setError(null);
    try {
      await paymentsApi.record(invoiceId, { amount: Number(amount), method, referenceNumber: referenceNumber || undefined, notes: notes || undefined });
      setAmount('');
      setReferenceNumber('');
      setNotes('');
      setShowForm(false);
      await mutate();
      onPaymentRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this payment.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoid(paymentId: string) {
    if (!confirm('Void this payment? This will reverse it from the invoice balance.')) return;
    await paymentsApi.void(paymentId);
    await mutate();
    onPaymentRecorded();
  }

  async function handleRefund(paymentId: string) {
    const amountStr = prompt('Refund amount (leave blank for a full refund):');
    if (amountStr === null) return;
    await paymentsApi.refund(paymentId, amountStr ? Number(amountStr) : undefined);
    await mutate();
    onPaymentRecorded();
  }

  const canRecordPayment = Number(balanceDue) > 0 && !['draft', 'void'].includes(invoiceStatus);

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Payments</h2>
        {canRecordPayment && (
          <button
            onClick={() => {
              // Opening the form pre-fills the amount with what's actually
              // owed — the CRM already knows this number, so the common
              // case (paid in full) needs zero typing. Still just a text
              // input underneath, so partial/adjusted amounts are a normal
              // edit, not a special mode.
              if (!showForm) setAmount(balanceDue);
              setShowForm((v) => !v);
            }}
            className="text-sm font-medium text-[var(--color-brand)]"
          >
            {showForm ? 'Cancel' : '+ Record Payment'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={`Amount (max ${formatMoney(balanceDue)})`}
              inputMode="decimal"
              className="col-span-2 rounded-lg border border-slate-300 px-3 py-3 text-base sm:col-span-1 lg:py-2 lg:text-sm"
            />
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-2 lg:text-sm">
              {availableMethods.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference #" className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm" />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm" />
          </div>
          <button
            onClick={handleRecord}
            disabled={isSaving || !amount || Number(amount) <= 0}
            className="mt-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {payments && payments.length === 0 && <p className="text-xs text-slate-400">No payments recorded yet.</p>}
        {payments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {formatMoney(p.amount)} <span className="font-normal text-slate-500">via {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
              </p>
              <p className="text-xs text-slate-400">
                {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}
                {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                {Number(p.refundedAmount) > 0 && ` · Refunded: ${formatMoney(p.refundedAmount)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PAYMENT_STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-700')}>
                {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
              </span>
              {p.status === 'succeeded' && (
                <>
                  <Link href={`/payments/receipt/${p.id}`} className="text-xs text-[var(--color-brand)]">Receipt</Link>
                  <button onClick={() => handleRefund(p.id)} className="text-xs text-slate-500 hover:text-slate-800">Refund</button>
                  <button onClick={() => handleVoid(p.id)} className="text-xs text-slate-500 hover:text-red-600">Void</button>
                </>
              )}
              {p.status === 'partially_refunded' && <button onClick={() => handleRefund(p.id)} className="text-xs text-slate-500 hover:text-slate-800">Refund more</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
