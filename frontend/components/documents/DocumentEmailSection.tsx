'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Mail, Eye, Loader2 } from 'lucide-react';
import { fetchPdfObjectUrl, ApiError } from '../../lib/api/api-client';
import type { EmailLogEntry } from '../../lib/api/estimates';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  sent: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:text-red-300',
  bounced: 'bg-red-100 text-red-700 dark:text-red-300',
};

interface DocumentEmailSectionProps {
  documentLabel: string; // "Estimate" | "Invoice"
  customerEmail: string | null;
  hasBeenSent: boolean;
  pdfPath: string;
  onSendEmail: (toEmail?: string) => Promise<{ success: boolean; emailLogId: string; recipientEmail: string }>;
  onGetHistory: () => Promise<EmailLogEntry[]>;
  historyKey: string;
}

/**
 * One shared component behind both the Estimate and Invoice detail
 * pages — the send/resend/preview/history UI is identical for both
 * document types, so this is built once rather than copy-pasted twice.
 */
export function DocumentEmailSection({ documentLabel, customerEmail, hasBeenSent, pdfPath, onSendEmail, onGetHistory, historyKey }: DocumentEmailSectionProps) {
  const { data: history, mutate } = useSWR(historyKey, onGetHistory);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSend() {
    setIsSending(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await onSendEmail(overrideEmail || undefined);
      setSuccessMessage(`${documentLabel} emailed to ${result.recipientEmail}.`);
      setShowOverride(false);
      setOverrideEmail('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Couldn't send this ${documentLabel.toLowerCase()}.`);
    } finally {
      setIsSending(false);
    }
  }

  async function handlePreview() {
    setIsPreviewing(true);
    setError(null);
    try {
      const url = await fetchPdfObjectUrl(pdfPath);
      window.open(url, '_blank');
      // Intentionally not revoked immediately — the new tab needs the
      // object URL to remain valid while it's open. The browser cleans
      // these up when the tab/document is closed.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the PDF.");
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email &amp; PDF</h2>
        <div className="flex gap-2">
          <button onClick={handlePreview} disabled={isPreviewing} className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50">
            {isPreviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Preview PDF
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {successMessage && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{successMessage}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSend}
          disabled={isSending || (!customerEmail && !overrideEmail)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {isSending ? 'Sending…' : hasBeenSent ? `Resend ${documentLabel}` : `Send ${documentLabel}`}
        </button>
        <button onClick={() => setShowOverride((v) => !v)} className="text-xs text-slate-500 dark:text-slate-400 underline">
          {showOverride ? 'Cancel' : 'Send to a different address'}
        </button>
      </div>

      {showOverride && (
        <div className="mt-2 flex gap-2">
          <input
            value={overrideEmail}
            onChange={(e) => setOverrideEmail(e.target.value)}
            placeholder={customerEmail ?? 'customer@example.com'}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-1.5 lg:text-sm"
          />
        </div>
      )}

      {!customerEmail && !showOverride && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">This customer has no email on file — use &ldquo;Send to a different address&rdquo; above.</p>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Email History</p>
        {history && history.length === 0 && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">No emails sent yet.</p>}
        <div className="mt-1.5 space-y-1.5">
          {history?.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">{entry.recipientEmail}</p>
                <p className="text-slate-400 dark:text-slate-500">{new Date(entry.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                {entry.errorMessage && <p className="text-red-500">{entry.errorMessage}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[entry.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{entry.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
