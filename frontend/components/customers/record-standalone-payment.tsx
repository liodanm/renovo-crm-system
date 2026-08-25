'use client';

import { useState } from 'react';
import { paymentsApi, PAYMENT_METHOD_LABELS } from '../../lib/api/payments';
import { ApiError } from '../../lib/api/api-client';

const availableMethods = ['cash', 'check', 'zelle', 'other'] as const;

/**
 * "Customer → Record Payment" — for money received with no invoice
 * involved at all (typically historical work from before this CRM
 * existed). Deliberately simpler than the invoice PaymentsSection form:
 * no balance-due cap, no invoice-status refresh, since neither concept
 * applies here.
 */
export function RecordStandalonePayment({ customerId, onRecorded }: { customerId: string; onRecorded: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Independent default from paymentDate, not copied from it — this is
  // the primary path for exactly the historical-customer scenario this
  // field exists for (no invoice, often no Job at all), so it must
  // never silently assume "paid today" means "serviced today."
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipAmount, setTipAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecord() {
    setIsSaving(true);
    setError(null);
    try {
      await paymentsApi.recordStandalone(customerId, {
        amount: Number(amount),
        method,
        paymentDate,
        serviceDate,
        tipAmount: tipAmount ? Number(tipAmount) : undefined,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });
      setAmount('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setServiceDate(new Date().toISOString().slice(0, 10));
      setTipAmount('');
      setReferenceNumber('');
      setNotes('');
      setShowForm(false);
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this payment.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800"
      >
        Record Payment
      </button>
    );
  }

  return (
    <div className="mt-4 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Record Payment</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">No invoice needed — for cash/check/Zelle received directly, including historical work</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          inputMode="decimal"
          className="col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base sm:col-span-1 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
          {availableMethods.map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
        <input
          value={tipAmount}
          onChange={(e) => setTipAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Tip (Optional)"
          inputMode="decimal"
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference #" className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
      </div>

      {/* Given this whole component's purpose is largely historical
          data entry, Service Date is arguably the single most important
          field here — clearly labeled, not tucked away, matching the
          same pattern as the invoice-based Record Payment form. */}
      <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Service Date</label>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">When was the service actually performed?</p>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Payment Date</label>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">When was the payment received?</p>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <p className="sm:col-span-2 text-[11px] text-slate-400 dark:text-slate-500">
          For historical customers, Service Date can be well before today — that&apos;s what makes their Customer profile show the correct Last Service date instead of today&apos;s data-entry date.
        </p>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleRecord}
          disabled={isSaving || !amount || Number(amount) <= 0}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save Payment'}
        </button>
        <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
          Cancel
        </button>
      </div>
    </div>
  );
}
