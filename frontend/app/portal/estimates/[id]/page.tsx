'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { portalApiFetch, portalFetchPdfObjectUrl, PortalApiError } from '../../../../lib/portal/portal-api-client';
import { StatusBadge, ESTIMATE_STATUS_COLORS } from '../../../../components/action-center/StatusBadge';
import { SignaturePad } from '../../../../components/jobs/SignaturePad';
import { SERVICE_TYPE_ICONS } from '../../../../lib/api/service-catalog';

interface EstimateLineItem {
  description: string | null;
  serviceType?: string | null;
  customServiceName?: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  total: string;
}

interface EstimateDetail {
  id: string;
  estimateNumber: string;
  status: string;
  createdAt: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  lineItems: EstimateLineItem[];
  customer: { name: string };
  property: { addressLine1: string; city: string; state: string };
}

const money = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Statuses where re-approving genuinely makes no sense — mirrors the
// backend's own precondition in approveEstimate() (accepted/declined/
// expired all throw there); this just keeps the button from being
// offered in the first place rather than letting a customer tap it
// and see a rejection. Not a second copy of that rule — a UI
// reflection of it, so it stays consistent with whatever the backend
// actually enforces.
const APPROVE_BLOCKED_STATUSES = new Set(['accepted', 'declined', 'expired', 'converted']);
// Declining an already-accepted estimate doesn't make real-world sense
// (a job may already exist from it), and declining an already-declined
// one is a no-op — hidden for clarity, not because the backend forbids
// either.
const DECLINE_BLOCKED_STATUSES = new Set(['accepted', 'declined', 'converted']);

export default function PortalEstimateDetailPage() {
  const params = useParams();
  const estimateId = params.id as string;

  const { data: estimate, error, isLoading, mutate } = useSWR<EstimateDetail>(
    ['portal-estimate', estimateId],
    () => portalApiFetch<EstimateDetail>(`/portal/estimates/${estimateId}`),
  );

  const [approveStep, setApproveStep] = useState<'none' | 'confirm' | 'sign'>('none');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleViewPdf() {
    setPdfState('loading');
    try {
      const url = await portalFetchPdfObjectUrl(`/portal/estimates/${estimateId}/view`);
      window.open(url, '_blank');
      setPdfState('idle');
    } catch {
      setPdfState('error');
    }
  }

  async function handleApprove() {
    if (!signatureDataUrl) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await portalApiFetch(`/portal/estimates/${estimateId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ signatureDataUrl }),
      });
      setApproveStep('none');
      setSuccessMessage('Estimate approved — thank you! We\u2019ll be in touch to schedule the work.');
      await mutate();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : 'Could not approve this estimate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDecline() {
    setIsSubmitting(true);
    setActionError(null);
    try {
      await portalApiFetch(`/portal/estimates/${estimateId}/decline`, { method: 'POST' });
      setShowDeclineConfirm(false);
      setSuccessMessage('Estimate declined.');
      await mutate();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : 'Could not decline this estimate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !estimate) {
    // A wrong/foreign estimate ID lands here too — the backend returns
    // a plain 404 either way (never distinguishing "doesn't exist" from
    // "not yours"), so this generic message is the correct, honest
    // response rather than something more specific we don't actually
    // know.
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">We couldn't find that estimate.</p>
          <Link href="/portal/estimates" className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)]">
            Back to Estimates
          </Link>
        </div>
      </main>
    );
  }

  const canApprove = !APPROVE_BLOCKED_STATUSES.has(estimate.status);
  const canDecline = !DECLINE_BLOCKED_STATUSES.has(estimate.status);

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="bg-white px-4 pb-4 pt-8 shadow-sm">
        <div className="mx-auto max-w-md">
          <Link href="/portal/estimates" className="text-xs text-slate-400 hover:text-slate-600">
            ← Back to Estimates
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-slate-900">{estimate.estimateNumber}</h1>
            <StatusBadge status={estimate.status} colorMap={ESTIMATE_STATUS_COLORS} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{estimate.property.addressLine1}, {estimate.property.city}, {estimate.property.state}</p>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-md space-y-3 px-4">
        {successMessage && (
          <div className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{successMessage}</div>
        )}

        {estimate.validUntil && (
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Valid Until</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {new Date(estimate.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Services</p>
          <div className="mt-2 divide-y divide-slate-100">
            {estimate.lineItems.map((li, i) => {
              const Icon = li.serviceType ? SERVICE_TYPE_ICONS[li.serviceType] ?? SERVICE_TYPE_ICONS.other : null;
              const primaryText = li.customServiceName || li.description;
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
                      {primaryText}
                    </p>
                    {li.customServiceName && li.description && <p className="text-xs text-slate-500">{li.description}</p>}
                    <p className="text-xs text-slate-500">{li.quantity} {li.unitOfMeasure} × {money(li.unitPrice)}</p>
                  </div>
                  <p className="shrink-0 font-medium text-slate-900">{money(li.total)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Every figure below comes straight from the backend response —
            nothing here is added, subtracted, or recalculated. */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{money(estimate.subtotal)}</span>
            </div>
            {Number(estimate.discountAmount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Discount</span>
                <span>−{money(estimate.discountAmount)}</span>
              </div>
            )}
            {Number(estimate.taxAmount) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span>{money(estimate.taxAmount)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-lg font-bold text-slate-900">{money(estimate.totalAmount)}</span>
          </div>
        </div>

        {estimate.notes && (
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Notes</p>
            <p className="mt-1 text-sm text-slate-700">{estimate.notes}</p>
          </div>
        )}

        <button
          onClick={handleViewPdf}
          disabled={pdfState === 'loading'}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50"
        >
          {pdfState === 'loading' ? 'Opening…' : 'Download PDF'}
        </button>
        {pdfState === 'error' && <p className="text-center text-xs text-red-600">Couldn't open the PDF. Please try again.</p>}

        {actionError && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}

        {(canApprove || canDecline) && (
          <div className="flex gap-3 pt-2">
            {canDecline && (
              <button
                onClick={() => setShowDeclineConfirm(true)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
              >
                Decline Quote
              </button>
            )}
            {canApprove && (
              <button
                onClick={() => setApproveStep('confirm')}
                className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white shadow-sm"
              >
                Accept Quote
              </button>
            )}
          </div>
        )}
      </div>

      {approveStep === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setApproveStep('none')}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Accept Quote?</h2>
            <p className="mt-2 text-sm text-slate-600">This will confirm that you approve this estimate and allow us to move forward with the work.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setApproveStep('none')} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button onClick={() => setApproveStep('sign')} className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white">
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {approveStep === 'sign' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Sign to Approve</h2>
            <p className="mt-1 text-sm text-slate-600">Please sign below to confirm your approval.</p>
            <div className="mt-4">
              <SignaturePad onCapture={setSignatureDataUrl} />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setApproveStep('none'); setSignatureDataUrl(''); }}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={!signatureDataUrl || isSubmitting}
                className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSubmitting ? 'Approving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => (isSubmitting ? undefined : setShowDeclineConfirm(false))}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900">Decline Estimate?</h2>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to decline this estimate?</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setShowDeclineConfirm(false)} disabled={isSubmitting} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDecline} disabled={isSubmitting} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                {isSubmitting ? 'Declining…' : 'Decline Estimate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
