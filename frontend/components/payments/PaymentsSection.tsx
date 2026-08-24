'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { paymentsApi, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '../../lib/api/payments';
import { settingsApi } from '../../lib/api/settings';
import { jobsApi } from '../../lib/api/jobs';
import { ApiError } from '../../lib/api/api-client';
import { cn } from '../../lib/utils';

const ALL_METHODS = Object.keys(PAYMENT_METHOD_LABELS);

function formatMoney(value: string): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PaymentsSection({
  invoiceId,
  jobId,
  balanceDue,
  invoiceStatus,
  onPaymentRecorded,
}: {
  invoiceId: string;
  // Optional — an invoice can exist with no linked job. When present,
  // lets the form default Service Date from that job's real completion
  // date rather than leaving the person recording payment to guess it.
  jobId?: string | null;
  balanceDue: string;
  invoiceStatus: string;
  onPaymentRecorded: () => void;
}) {
  const { data: payments, mutate } = useSWR(['invoice-payments', invoiceId], () => paymentsApi.listByInvoice(invoiceId));
  // Real read from Payment Settings — this is what makes "which methods
  // can I record a payment as" actually configurable rather than the
  // fixed, hardcoded list this form used before that page existed.
  const { data: paymentSettings } = useSWR('payments-settings-for-form', () => settingsApi.getPaymentSettings());
  const availableMethods = paymentSettings?.enabledPaymentMethods?.length ? paymentSettings.enabledPaymentMethods : ALL_METHODS;
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [cardType, setCardType] = useState<'credit' | 'debit' | ''>('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Defaults to today, independently of paymentDate — for the ordinary
  // case (a current job, paid the day it's finished) these naturally
  // end up the same without literally being tied together, matching
  // "for a normal current job these may be the same date." Deliberately
  // never defaulted FROM paymentDate — copying payment date into
  // service date would recreate the exact bug this field exists to
  // prevent (a same-day payment on old work looking like a new
  // service).
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [serviceDateTouchedByUser, setServiceDateTouchedByUser] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If this invoice has a linked job with a real completion date, use
  // that as the Service Date default the moment the form opens — the
  // CRM already knows exactly when the work happened, so the common
  // case (a normal, current job) needs zero manual entry. Only applies
  // once, and never after the person has actually touched the field
  // themselves — correcting a historical date must stick, not get
  // silently clobbered back to the job's date on a later render.
  useEffect(() => {
    if (!showForm || !jobId || serviceDateTouchedByUser) return;
    let cancelled = false;
    jobsApi.get(jobId).then((job) => {
      if (!cancelled && job.actualEnd && !serviceDateTouchedByUser) {
        setServiceDate(job.actualEnd.slice(0, 10));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, jobId]);

  // Preview only — the exact same math the backend uses, but the
  // backend recomputes this itself from the company's live setting at
  // save time and is the only thing that actually gets stored. This
  // can never be sent as the fee; it exists purely so the person
  // recording the payment sees the right number before clicking Save.
  const feePercent = paymentSettings?.processingFeeEnabled ? Number(paymentSettings.processingFeePercent) : 0;
  const previewFee = method === 'card' && cardType === 'credit' && amount
    ? Math.round(Number(amount) * feePercent) / 100
    : 0;

  async function handleRecord() {
    setIsSaving(true);
    setError(null);
    try {
      await paymentsApi.record(invoiceId, {
        amount: Number(amount),
        method,
        cardType: method === 'card' ? (cardType as 'credit' | 'debit') : undefined,
        paymentDate,
        serviceDate,
        tipAmount: tipAmount ? Number(tipAmount) : undefined,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });
      setAmount('');
      setMethod('cash');
      setCardType('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setServiceDate(new Date().toISOString().slice(0, 10));
      setServiceDateTouchedByUser(false);
      setTipAmount('');
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
    <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Payments</h2>
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
        <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
          {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder={`Amount (max ${formatMoney(balanceDue)})`}
              inputMode="decimal"
              className="col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base sm:col-span-1 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <select
              value={method}
              onChange={(e) => { setMethod(e.target.value); setCardType(''); }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            >
              {availableMethods.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
            {method === 'card' && (
              <select
                value={cardType}
                onChange={(e) => setCardType(e.target.value as 'credit' | 'debit' | '')}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              >
                <option value="" disabled>Credit or Debit?</option>
                <option value="credit">Credit Card{feePercent > 0 ? ` — ${feePercent}% fee` : ''}</option>
                <option value="debit">Debit Card — No fee</option>
              </select>
            )}
            <input
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Tip (Optional)"
              inputMode="decimal"
              // Blank, not $0.00 — a blank field reads as "no tip
              // entered" at a glance, and blank correctly sends
              // undefined (stored as 0) rather than forcing every
              // ordinary cash payment to show a $0.00 tip value.
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference #" className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>

          {/* Service Date and Payment Date are NOT interchangeable —
              deliberately given their own labeled row, not folded into
              the compact grid above with everything else, per the
              explicit requirement that this distinction be easy to
              find, not tucked into an advanced section. This is the
              single most important pair of fields for correctly
              recording historical customers. */}
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Service Date</label>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">When was the service actually performed?</p>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => { setServiceDate(e.target.value); setServiceDateTouchedByUser(true); }}
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
              />
              {jobId && !serviceDateTouchedByUser && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Defaulted from this job&apos;s completion date — change it if that&apos;s not correct.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Payment Date</label>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">When was the payment received?</p>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                // Historical dates are the whole point of this field — a
                // job/payment from before this CRM existed. Not restricting
                // how far back it can go. Future dates are left open too
                // rather than blocked outright: a same-day payment entered
                // just after midnight, or a deliberately post-dated check,
                // are both real, ordinary cases — not something worth a
                // hard validation error for a solo owner's own bookkeeping.
                className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <p className="sm:col-span-2 text-[11px] text-slate-400 dark:text-slate-500">
              For a normal, current job these are usually the same date. For historical or manually entered work, they can differ — Service Date is what determines this customer&apos;s Last Service.
            </p>
          </div>

          {method === 'card' && cardType && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {cardType === 'credit' && feePercent > 0 ? (
                <>
                  Payment: {formatMoney(amount || '0')} · Processing Fee ({feePercent}%): {formatMoney(previewFee.toFixed(2))} · Customer Total: {formatMoney((Number(amount || 0) + previewFee).toFixed(2))}
                </>
              ) : cardType === 'credit' ? (
                'Processing fee is currently disabled in Settings — no fee will be applied.'
              ) : (
                'Debit card selected — no processing fee applied.'
              )}
            </p>
          )}
          <button
            onClick={handleRecord}
            disabled={isSaving || !amount || Number(amount) <= 0 || (method === 'card' && !cardType)}
            className="mt-2 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {payments && payments.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">No payments recorded yet.</p>}
        {payments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {formatMoney(p.amount)} <span className="font-normal text-slate-500 dark:text-slate-400">via {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {p.serviceDate ? `Serviced ${new Date(p.serviceDate).toLocaleDateString()}` : p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}
                {p.serviceDate && p.paymentDate && p.serviceDate !== p.paymentDate && ` · Paid ${new Date(p.paymentDate).toLocaleDateString()}`}
                {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                {Number(p.tipAmount) > 0 && ` · Tip: ${formatMoney(p.tipAmount)}`}
                {Number(p.processingFeeAmount) > 0 && ` · Fee: ${formatMoney(p.processingFeeAmount)}`}
                {Number(p.refundedAmount) > 0 && ` · Refunded: ${formatMoney(p.refundedAmount)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PAYMENT_STATUS_STYLES[p.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300')}>
                {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
              </span>
              {p.status === 'succeeded' && (
                <>
                  <Link href={`/payments/receipt/${p.id}`} className="text-xs text-[var(--color-brand)]">Receipt</Link>
                  <button onClick={() => handleRefund(p.id)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800">Refund</button>
                  <button onClick={() => handleVoid(p.id)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:text-red-400">Void</button>
                </>
              )}
              {p.status === 'partially_refunded' && <button onClick={() => handleRefund(p.id)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800">Refund more</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
