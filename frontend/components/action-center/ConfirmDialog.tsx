'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/** Generic confirmation dialog — reused by every destructive action across the Action Bar, not one dialog per action. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={isConfirming} className="rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 lg:py-2 lg:text-sm">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`rounded-lg px-4 py-3 text-base font-medium text-white disabled:opacity-50 lg:py-2 lg:text-sm ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--color-brand)] hover:opacity-90'}`}
          >
            {isConfirming ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
