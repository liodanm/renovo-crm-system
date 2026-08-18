'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Generic confirmation dialog — reused by every destructive action across the Action Bar, not one dialog per action. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  requireTypedConfirmation,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the user types
      this exact phrase (e.g. "DELETE") into a field shown above it —
      an extra deliberate step for especially destructive actions. */
  requireTypedConfirmation?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const typedConfirmationMismatch = !!requireTypedConfirmation && typedConfirmation !== requireTypedConfirmation;

  async function handleConfirm() {
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setIsConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 dark:bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{message}</p>
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {requireTypedConfirmation && (
          <div className="mt-4">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Type <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{requireTypedConfirmation}</span> to continue
            </label>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={isConfirming} className="rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 lg:py-2 lg:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || typedConfirmationMismatch}
            className={`rounded-lg px-4 py-3 text-base font-medium text-white disabled:opacity-50 lg:py-2 lg:text-sm ${danger ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600' : 'bg-[var(--color-brand)] hover:opacity-90'}`}
          >
            {isConfirming ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
