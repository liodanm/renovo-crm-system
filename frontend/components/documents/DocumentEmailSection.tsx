'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Mail, MessageSquare, Eye, Loader2 } from 'lucide-react';
import { fetchPdfObjectUrl, ApiError } from '../../lib/api/api-client';
import { settingsApi } from '../../lib/api/settings';
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
  // Both optional, and both required together — SMS sending is only
  // offered when a caller actually wires it up (currently just the
  // Estimate detail page; Invoices don't have a backend sendSms yet).
  // No prop, no button — never a disabled/fake control implying a
  // capability that isn't real for that document type.
  customerPhone?: string | null;
  onSendSms?: (toPhone?: string) => Promise<{ success: boolean; logId: string; recipientPhone: string }>;
}

/**
 * One shared component behind both the Estimate and Invoice detail
 * pages — the send/resend/preview/history UI is identical for both
 * document types, so this is built once rather than copy-pasted twice.
 */
export function DocumentEmailSection({
  documentLabel,
  customerEmail,
  hasBeenSent,
  pdfPath,
  onSendEmail,
  onGetHistory,
  historyKey,
  customerPhone,
  onSendSms,
}: DocumentEmailSectionProps) {
  const { data: history, mutate } = useSWR(historyKey, onGetHistory);
  // Informational only — reminds whoever's sending what disclosure
  // applies to this channel, per this company's own configured text
  // (Settings → Consent & Disclosures). Deliberately NOT a consent
  // gate: no existing customer has ever had a chance to grant the new
  // service-SMS/email consent fields (the only UI that could set them
  // doesn't exist yet), so blocking sends on that state would silently
  // break appointment reminders and estimate/invoice communication for
  // every current customer. This is staff-facing awareness, not
  // enforcement.
  const { data: disclosures } = useSWR('doc-email-section-disclosures', () => settingsApi.getConsentDisclosures());
  const [showOverride, setShowOverride] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [showPhoneOverride, setShowPhoneOverride] = useState(false);
  const [overridePhone, setOverridePhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
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

  async function handleSendSms() {
    if (!onSendSms) return;
    setIsSendingSms(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await onSendSms(overridePhone || undefined);
      setSuccessMessage(`${documentLabel} texted to ${result.recipientPhone}.`);
      setShowPhoneOverride(false);
      setOverridePhone('');
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Couldn't text this ${documentLabel.toLowerCase()}.`);
    } finally {
      setIsSendingSms(false);
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
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{onSendSms ? 'Email, Text & PDF' : 'Email & PDF'}</h2>
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

      {disclosures?.email && (
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{disclosures.email}</p>
      )}

      {showOverride && (
        <div className="mt-2 flex gap-2">
          <input
            value={overrideEmail}
            onChange={(e) => setOverrideEmail(e.target.value)}
            placeholder={customerEmail ?? 'customer@example.com'}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
        </div>
      )}

      {!customerEmail && !showOverride && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">This customer has no email on file — use &ldquo;Send to a different address&rdquo; above.</p>
      )}

      {onSendSms && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <button
              onClick={handleSendSms}
              disabled={isSendingSms || (!customerPhone && !overridePhone)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] disabled:opacity-50"
            >
              {isSendingSms ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {isSendingSms ? 'Sending…' : hasBeenSent ? `Resend ${documentLabel} by Text` : `Send ${documentLabel} by Text`}
            </button>
            <button onClick={() => setShowPhoneOverride((v) => !v)} className="text-xs text-slate-500 dark:text-slate-400 underline">
              {showPhoneOverride ? 'Cancel' : 'Send to a different number'}
            </button>
          </div>

          {disclosures?.sms && (
            <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">{disclosures.sms}</p>
          )}

          {showPhoneOverride && (
            <div className="mt-2 flex gap-2">
              <input
                value={overridePhone}
                onChange={(e) => setOverridePhone(e.target.value)}
                placeholder={customerPhone ?? '(555) 555-5555'}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>
          )}

          {!customerPhone && !showPhoneOverride && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">This customer has no phone number on file — use &ldquo;Send to a different number&rdquo; above.</p>
          )}
        </>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{onSendSms ? 'Send History' : 'Email History'}</p>
        {history && history.length === 0 && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Nothing sent yet.</p>}
        <div className="mt-1.5 space-y-1.5">
          {history?.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  {entry.channel === 'sms' ? <MessageSquare className="h-3 w-3 text-slate-400" /> : <Mail className="h-3 w-3 text-slate-400" />}
                  {entry.channel === 'sms' ? entry.recipientPhone : entry.recipientEmail}
                </p>
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
