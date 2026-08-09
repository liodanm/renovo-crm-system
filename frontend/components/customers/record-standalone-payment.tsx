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
        tipAmount: tipAmount ? Number(tipAmount) : undefined,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });
      setAmount('');
      setPaymentDate(new Date().toISOString().slice(0, 10));
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
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Record Payment
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">Record Payment</p>
        <p className="text-xs text-slate-400">No invoice needed — for cash/check/Zelle received directly, including historical work</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          inputMode="decimal"
          className="col-span-2 rounded-lg border border-slate-300 px-3 py-3 text-base sm:col-span-1 lg:py-2 lg:text-sm"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-2 lg:text-sm">
          {availableMethods.map((m) => (
            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
          ))}
        </select>
        <input
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
        />
        <input
          value={tipAmount}
          onChange={(e) => setTipAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Tip (Optional)"
          inputMode="decimal"
          className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
        />
        <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Reference #" className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm" />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm" />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleRecord}
          disabled={isSaving || !amount || Number(amount) <= 0}
          className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save Payment'}
        </button>
        <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
