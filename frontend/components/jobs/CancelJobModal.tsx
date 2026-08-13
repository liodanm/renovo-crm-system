'use client';

import { useState } from 'react';
import { jobsApi } from '../../lib/api/jobs';
import { ApiError } from '../../lib/api/api-client';

const REASON_OPTIONS = [
  'Customer Cancelled',
  'Weather',
  'Rescheduled',
  'Customer No Longer Needs Service',
  'Other',
];

interface CancelJobModalProps {
  jobId: string;
  customerName: string;
  propertyAddress: string;
  scheduledStart: string | null;
  jobTotal: number | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelJobModal({ jobId, customerName, propertyAddress, scheduledStart, jobTotal, onClose, onCancelled }: CancelJobModalProps) {
  const [reasonOption, setReasonOption] = useState(REASON_OPTIONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalReason = reasonOption === 'Other' ? customReason.trim() : reasonOption;
  const isValid = finalReason.length > 0;

  async function handleConfirm() {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await jobsApi.cancel(jobId, finalReason);
      onCancelled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this job. Check your connection and try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={isSubmitting ? undefined : onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">⚠️</div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cancel Job?</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to cancel this job? The job will no longer be treated as an active/upcoming job, but its history will be preserved.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm">
          <p><span className="text-slate-500 dark:text-slate-400">Customer: </span><span className="font-medium text-slate-800">{customerName}</span></p>
          <p><span className="text-slate-500 dark:text-slate-400">Property: </span><span className="font-medium text-slate-800">{propertyAddress}</span></p>
          {scheduledStart && (
            <p><span className="text-slate-500 dark:text-slate-400">Scheduled: </span><span className="font-medium text-slate-800">{new Date(scheduledStart).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></p>
          )}
          {jobTotal !== null && (
            <p><span className="text-slate-500 dark:text-slate-400">Job Total: </span><span className="font-medium text-slate-800">${jobTotal.toFixed(2)}</span></p>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">This changes the job's status to Cancelled. There's no direct "undo" button for this in the app today.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">Cancellation reason</label>
        <select
          value={reasonOption}
          onChange={(e) => setReasonOption(e.target.value)}
          disabled={isSubmitting}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:bg-slate-50 dark:bg-slate-900 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
        >
          {REASON_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {reasonOption === 'Other' && (
          <input
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            disabled={isSubmitting}
            autoFocus
            placeholder="Describe the reason"
            maxLength={500}
            className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm disabled:bg-slate-50 dark:bg-slate-900 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Keep Job
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isSubmitting ? 'Cancelling…' : 'Cancel Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
