'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { customersApi } from '../../lib/api/customers';
import { ApiError } from '../../lib/api/api-client';

const CONFIRM_TEXT = 'Delete';

interface DeleteCustomerModalProps {
  customerId: string;
  customerName: string;
  // Jobs/estimates/invoices are already loaded by the customer page via
  // getServiceHistory() — passed in rather than re-fetched, so this
  // modal adds zero new queries for those three.
  jobsCount: number;
  estimatesCount: number;
  invoicesCount: number;
  onClose: () => void;
  onRemoved: () => void;
}

export function DeleteCustomerModal({ customerId, customerName, jobsCount, estimatesCount, invoicesCount, onClose, onRemoved }: DeleteCustomerModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Properties aren't loaded until the Properties tab is clicked, so
  // this is a genuinely new fetch the first time — but it's the exact
  // same customersApi.listProperties() call and the exact same SWR key
  // that tab already uses, so if it's already cached (tab was visited
  // this session) this costs nothing extra at all.
  const { data: properties, isLoading: propertiesLoading } = useSWR([`properties`, customerId], () => customersApi.listProperties(customerId));

  const isConfirmed = confirmText === CONFIRM_TEXT;

  async function handleConfirm() {
    if (!isConfirmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await customersApi.delete(customerId);
      onRemoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this customer. Check your connection and try again.');
      setIsSubmitting(false);
    }
  }

  const counts = [
    { label: 'Properties', value: propertiesLoading ? null : (properties?.length ?? 0) },
    { label: 'Estimates', value: estimatesCount },
    { label: 'Jobs', value: jobsCount },
    { label: 'Invoices', value: invoicesCount },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center" onClick={isSubmitting ? undefined : onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">⚠️</div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Remove Customer</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              This will remove <strong>{customerName}</strong> from your active customer list. Their properties, estimates, jobs, and invoices aren't deleted — but there's currently no way to restore this customer to your active list yourself. If you need it back, you'd have to contact support.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
          {counts.map((c) => (
            <div key={c.label} className="text-sm">
              <span className="text-slate-500 dark:text-slate-400">{c.label}: </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{c.value === null ? '…' : c.value}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-300">This action removes the customer from the active list.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Type <span className="font-mono font-semibold">Delete</span> to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={isSubmitting}
          autoFocus
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:bg-slate-50 dark:bg-slate-900 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          placeholder="Delete"
        />

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmed || isSubmitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isSubmitting ? 'Removing…' : 'Remove Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
