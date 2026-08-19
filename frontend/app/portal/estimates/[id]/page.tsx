'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { portalApiFetch, portalFetchPdfObjectUrl, PortalApiError } from '../../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../../lib/portal/portal-token-storage';
import { darkenHex } from '../../../../lib/theme/brand-theme-injector';
import { StatusBadge, ESTIMATE_STATUS_COLORS } from '../../../../components/action-center/StatusBadge';
import { SignaturePad } from '../../../../components/jobs/SignaturePad';
import { SERVICE_TYPE_ICONS, SERVICE_TYPE_LABELS } from '../../../../lib/api/service-catalog';
import { PortalShell } from '../../../../components/portal/PortalShell';

interface DashboardHeader {
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

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
  customer: { name: string; email: string | null; phone: string | null };
  property: { addressLine1: string; city: string; state: string; postalCode: string };
  branding: { logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
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

  // Same shared SWR key every other portal page already uses for the
  // shell's company name/logo — this fetch is deduped against those,
  // not a new independent request every time a customer navigates here.
  const { data: dashboardHeader } = useSWR<DashboardHeader>('portal-dashboard-header', () => portalApiFetch<DashboardHeader>('/portal/dashboard'));

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  // Same per-tenant color-override technique as the staff app's
  // BrandThemeInjector — this page has no staff auth to source
  // branding from, so it uses the branding already included in its own
  // fetched estimate response instead of a separate fetch.
  useEffect(() => {
    const root = document.documentElement;
    if (estimate?.branding?.primaryColor) {
      root.style.setProperty('--color-brand', estimate.branding.primaryColor);
      root.style.setProperty('--color-brand-dark', darkenHex(estimate.branding.primaryColor));
    }
    if (estimate?.branding?.secondaryColor) {
      root.style.setProperty('--color-brand-secondary', estimate.branding.secondaryColor);
    }
    return () => {
      root.style.removeProperty('--color-brand');
      root.style.removeProperty('--color-brand-dark');
      root.style.removeProperty('--color-brand-secondary');
    };
  }, [estimate?.branding?.primaryColor, estimate?.branding?.secondaryColor]);

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
      <PortalShell companyName={dashboardHeader?.company.name} logoUrl={dashboardHeader?.company.logoUrl} primaryColor={dashboardHeader?.company.primaryColor} secondaryColor={dashboardHeader?.company.secondaryColor} onSignOut={handleSignOut}>
        <div className="mx-auto max-w-2xl space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </PortalShell>
    );
  }

  if (error || !estimate) {
    // A wrong/foreign estimate ID lands here too — the backend returns
    // a plain 404 either way (never distinguishing "doesn't exist" from
    // "not yours"), so this generic message is the correct, honest
    // response rather than something more specific we don't actually
    // know.
    return (
      <PortalShell companyName={dashboardHeader?.company.name} logoUrl={dashboardHeader?.company.logoUrl} primaryColor={dashboardHeader?.company.primaryColor} secondaryColor={dashboardHeader?.company.secondaryColor} onSignOut={handleSignOut}>
        <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">We couldn't find that quote.</p>
          <Link href="/portal/dashboard" className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)]">
            Back to Quotes
          </Link>
        </div>
      </PortalShell>
    );
  }

  const canApprove = !APPROVE_BLOCKED_STATUSES.has(estimate.status);
  const canDecline = !DECLINE_BLOCKED_STATUSES.has(estimate.status);

  return (
    <PortalShell companyName={dashboardHeader?.company.name} logoUrl={dashboardHeader?.company.logoUrl} primaryColor={dashboardHeader?.company.primaryColor} secondaryColor={dashboardHeader?.company.secondaryColor} onSignOut={handleSignOut}>
      <div className="mx-auto max-w-2xl">
        <Link href="/portal/dashboard" className="text-xs text-slate-400 hover:text-slate-600">
          ← Back to Quotes
        </Link>

        {successMessage && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{successMessage}</div>
        )}

        {/* One unified card, matching the reference layout — every section
            below is a division within this same card (a border-top +
            padding, not a separate shadowed box), so the whole quote reads
            as one continuous document rather than a stack of fragments. */}
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="break-words text-2xl font-bold leading-tight text-slate-900">{estimate.estimateNumber}</h1>
              <div className="shrink-0 pt-1">
                <StatusBadge status={estimate.status} colorMap={ESTIMATE_STATUS_COLORS} />
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Date: {new Date(estimate.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Quote For</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{estimate.customer.name}</p>
            {estimate.customer.email && <p className="mt-0.5 truncate text-sm text-slate-500">{estimate.customer.email}</p>}
            {estimate.customer.phone && <p className="mt-0.5 text-sm text-slate-500">{estimate.customer.phone}</p>}
          </div>

          <div className="border-t border-slate-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service Address</p>
            <p className="mt-2 break-words text-sm text-slate-700">
              {estimate.property.addressLine1}, {estimate.property.city}, {estimate.property.state} {estimate.property.postalCode}
            </p>
          </div>

          {estimate.validUntil && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valid Until</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {new Date(estimate.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}

          <div className="border-t border-slate-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services Included</p>
            <div className="mt-3 divide-y divide-slate-100">
              {estimate.lineItems.map((li, i) => {
                const Icon = li.serviceType ? SERVICE_TYPE_ICONS[li.serviceType] ?? SERVICE_TYPE_ICONS.other : null;
                // Custom service name first, then the real predefined
                // label (e.g. "Roof Soft Wash") — description alone was
                // never the service's name, just optional extra detail.
                // Falling back to description only if genuinely nothing
                // else is available (defensive, shouldn't normally happen).
                const serviceLabel = li.customServiceName || (li.serviceType ? SERVICE_TYPE_LABELS[li.serviceType] ?? li.serviceType : null);
                const primaryText = serviceLabel || li.description || 'Service';
                const showDescriptionBelow = !!li.description && li.description !== primaryText;
                return (
                  <div key={i} className="py-3 first:pt-0 last:pb-0 text-sm">
                    <p className="flex items-start gap-2.5 font-semibold text-slate-900">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-600 text-[11px] font-bold text-emerald-600">✓</span>
                      <span className="flex min-w-0 items-center gap-1.5 break-words pt-0.5">
                        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
                        {primaryText}
                      </span>
                    </p>
                    {showDescriptionBelow && (
                      <p className="mt-1 pl-[30px] text-sm leading-relaxed text-slate-500">{li.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {estimate.notes && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-2 text-sm text-slate-700">{estimate.notes}</p>
            </div>
          )}

          {/* Every figure below comes straight from the backend response —
              nothing here is added, subtracted, or recalculated. Total
              uses the same ink color as everything else on the page —
              size alone creates the prominence, matching the reference's
              restrained, single-color-family look rather than an
              artificially highlighted figure. */}
          <div className="border-t border-slate-100 p-5">
            {(Number(estimate.discountAmount) > 0 || Number(estimate.taxAmount) > 0) && (
              <div className="mb-3 space-y-1 text-sm">
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
            )}
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">{money(estimate.totalAmount)}</span>
            </div>
          </div>
        </div>

        {actionError && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}

        {/* Actions — three full-width rows stacked, matching the
            reference exactly: Accept as the solid primary CTA, Decline
            and Download as equal-weight outlined buttons beneath it. */}
        <div className="mt-4 space-y-2">
          {canApprove && (
            <button
              onClick={() => setApproveStep('confirm')}
              className="w-full rounded-xl bg-[var(--color-brand)] px-4 py-4 text-base font-semibold text-white shadow-sm"
            >
              Accept Quote
            </button>
          )}
          {canDecline && (
            <button
              onClick={() => setShowDeclineConfirm(true)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-medium text-slate-700 shadow-sm"
            >
              Decline
            </button>
          )}
          <button
            onClick={handleViewPdf}
            disabled={pdfState === 'loading'}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-medium text-slate-700 shadow-sm disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {pdfState === 'loading' ? 'Opening…' : 'Download'}
          </button>
        </div>
        {pdfState === 'error' && <p className="mt-2 text-center text-xs text-red-600">Couldn't open the PDF. Please try again.</p>}
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
    </PortalShell>
  );
}
