'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { portalApiFetch, portalFetchPdfObjectUrl, PortalApiError } from '../../../../lib/portal/portal-api-client';
import { darkenHex } from '../../../../lib/theme/brand-theme-injector';
import { StatusBadge, INVOICE_STATUS_COLORS } from '../../../../components/action-center/StatusBadge';

interface InvoiceLineItem {
  description: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  total: string;
}

interface InvoicePayment {
  amount: string;
  method: string;
  date: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: string;
  createdAt: string;
  dueDate: string | null;
  notes: string | null;
  subtotal: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: number;
  lineItems: InvoiceLineItem[];
  payments: InvoicePayment[];
  customer: { name: string; email: string | null; phone: string | null };
  property: { addressLine1: string; city: string; state: string; postalCode: string } | null;
  branding: { logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

const money = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// An invoice can only genuinely be paid while it still has a real
// balance and isn't void — mirrors the backend's own
// computeInvoiceStatusAfterPayment() guard, not a second copy of that
// logic, just the UI reflecting when the button makes sense to show.
const PAYABLE_STATUSES = new Set(['sent', 'partial']);

let stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : null;
  }
  return stripePromise;
}

export default function PortalInvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  const { data: invoice, error, isLoading, mutate } = useSWR<InvoiceDetail>(
    ['portal-invoice', invoiceId],
    () => portalApiFetch<InvoiceDetail>(`/portal/invoices/${invoiceId}`),
  );

  // Same per-tenant color-override technique as the Estimate portal
  // page and the staff app's BrandThemeInjector.
  useEffect(() => {
    const root = document.documentElement;
    if (invoice?.branding?.primaryColor) {
      root.style.setProperty('--color-brand', invoice.branding.primaryColor);
      root.style.setProperty('--color-brand-dark', darkenHex(invoice.branding.primaryColor));
    }
    if (invoice?.branding?.secondaryColor) {
      root.style.setProperty('--color-brand-secondary', invoice.branding.secondaryColor);
    }
    return () => {
      root.style.removeProperty('--color-brand');
      root.style.removeProperty('--color-brand-dark');
      root.style.removeProperty('--color-brand-secondary');
    };
  }, [invoice?.branding?.primaryColor, invoice?.branding?.secondaryColor]);

  const [showPayModal, setShowPayModal] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleViewPdf() {
    setPdfState('loading');
    try {
      const url = await portalFetchPdfObjectUrl(`/portal/invoices/${invoiceId}/view`);
      window.open(url, '_blank');
      setPdfState('idle');
    } catch {
      setPdfState('error');
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

  if (error || !invoice) {
    // Same honest generic message as the Estimate page — the backend
    // returns a plain 404 either way, never distinguishing "doesn't
    // exist" from "not yours."
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">We couldn't find that invoice.</p>
          <Link href="/portal/estimates" className="mt-3 inline-block text-sm font-medium text-[var(--color-brand)]">
            Back to Portal
          </Link>
        </div>
      </main>
    );
  }

  const canPay = PAYABLE_STATUSES.has(invoice.status) && invoice.balanceDue > 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-28 pt-8">
      <div className="mx-auto max-w-md">
        {invoice.branding.logoUrl && (
          <div className="mb-4 flex justify-center">
            <img
              src={invoice.branding.logoUrl}
              alt=""
              className="max-h-16 w-auto max-w-full object-contain"
            />
          </div>
        )}
        <Link href="/portal/estimates" className="text-xs text-slate-400 hover:text-slate-600">
          ← Back to Portal
        </Link>

        {successMessage && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{successMessage}</div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="break-words text-2xl font-bold leading-tight text-slate-900">{invoice.invoiceNumber}</h1>
              <div className="shrink-0 pt-1">
                <StatusBadge status={invoice.status} colorMap={INVOICE_STATUS_COLORS} />
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Date: {new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Bill To</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{invoice.customer.name}</p>
            {invoice.customer.email && <p className="mt-0.5 truncate text-sm text-slate-500">{invoice.customer.email}</p>}
            {invoice.customer.phone && <p className="mt-0.5 text-sm text-slate-500">{invoice.customer.phone}</p>}
          </div>

          {invoice.property && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service Address</p>
              <p className="mt-2 break-words text-sm text-slate-700">
                {invoice.property.addressLine1}, {invoice.property.city}, {invoice.property.state} {invoice.property.postalCode}
              </p>
            </div>
          )}

          {invoice.dueDate && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due Date</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}

          <div className="border-t border-slate-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
            <div className="mt-3 divide-y divide-slate-100">
              {invoice.lineItems.map((li, i) => (
                <div key={i} className="py-3 first:pt-0 last:pb-0 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-medium text-slate-900">{li.description || 'Service'}</span>
                    <span className="shrink-0 font-medium text-slate-900">{money(li.total)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{li.quantity} {li.unitOfMeasure} × {money(li.unitPrice)}</p>
                </div>
              ))}
            </div>
          </div>

          {invoice.notes && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-2 text-sm text-slate-700">{invoice.notes}</p>
            </div>
          )}

          {/* Every figure below comes straight from the backend response —
              nothing here is added, subtracted, or recalculated. */}
          <div className="border-t border-slate-100 p-5">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              {Number(invoice.discountAmount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>−{money(invoice.discountAmount)}</span>
                </div>
              )}
              {Number(invoice.taxAmount) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>{money(invoice.taxAmount)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-base font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-slate-900">{money(invoice.totalAmount)}</span>
            </div>
            {Number(invoice.amountPaid) > 0 && (
              <>
                <div className="mt-2 flex justify-between text-sm text-slate-600">
                  <span>Paid</span>
                  <span>−{money(invoice.amountPaid)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm font-semibold text-slate-900">
                  <span>Balance Due</span>
                  <span>{money(invoice.balanceDue)}</span>
                </div>
              </>
            )}
          </div>

          {invoice.payments.length > 0 && (
            <div className="border-t border-slate-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment History</p>
              <div className="mt-2 space-y-1.5">
                {invoice.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-600">
                    <span>{new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {p.method}</span>
                    <span className="font-medium text-slate-900">{money(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {canPay ? (
            <button
              onClick={() => setShowPayModal(true)}
              className="w-full rounded-xl bg-[var(--color-brand)] px-4 py-4 text-base font-semibold text-white shadow-sm"
            >
              Pay Invoice
            </button>
          ) : invoice.status === 'paid' ? (
            <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center text-base font-semibold text-emerald-700">
              Paid
            </div>
          ) : null}
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
            {pdfState === 'loading' ? 'Opening…' : 'Download Invoice PDF'}
          </button>
        </div>
        {pdfState === 'error' && <p className="mt-2 text-center text-xs text-red-600">Couldn't open the PDF. Please try again.</p>}
      </div>

      {showPayModal && (
        <PayInvoiceModal
          invoiceId={invoiceId}
          onClose={() => setShowPayModal(false)}
          onSuccess={async () => {
            setShowPayModal(false);
            setSuccessMessage('Payment received — thank you!');
            await mutate();
          }}
        />
      )}
    </main>
  );
}

/**
 * Connects to the existing, already-built backend payment flow —
 * POST /portal/invoices/:id/pay-intent (StripePaymentService) — this
 * component only adds the client-side counterpart that flow always
 * needed. Card details never reach Renovo's own backend; Stripe.js
 * handles that directly with Stripe, which is what keeps this out of
 * PCI SAQ D scope, matching the backend's own existing design intent.
 */
function PayInvoiceModal({ invoiceId, onClose, onSuccess }: { invoiceId: string; onClose: () => void; onSuccess: () => void }) {
  // Plain async-function + useState mutation, matching handleApprove/
  // handleDecline in the Estimate portal — deliberately NOT useSWR.
  // POST /pay-intent creates a real, non-idempotent Stripe object; it
  // must run exactly once per genuine modal open, never re-fire from a
  // re-render, tab focus, reconnect, or stale-cache revalidation the
  // way SWR's default behavior previously allowed.
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable' | 'error'; clientSecret?: string; message?: string }>({ status: 'loading' });
  const stripe = getStripe();

  useEffect(() => {
    let cancelled = false;
    async function createIntent() {
      try {
        const result = await portalApiFetch<{ available: boolean; clientSecret?: string; message?: string }>(`/portal/invoices/${invoiceId}/pay-intent`, { method: 'POST' });
        if (cancelled) return;
        if (result.available && result.clientSecret) {
          setState({ status: 'ready', clientSecret: result.clientSecret });
        } else {
          setState({ status: 'unavailable', message: result.message });
        }
      } catch (err) {
        if (cancelled) return;
        setState({ status: 'error', message: err instanceof PortalApiError ? err.message : 'Something went wrong setting up payment.' });
      }
    }
    createIntent();
    // Empty dependency array is deliberate: this must run exactly once
    // for the lifetime of this component instance (i.e. once per
    // genuine modal mount). invoiceId is stable for the page's whole
    // lifetime, so it's correct to omit — including it would add no
    // real re-run trigger, only an easy-to-misread lint suggestion to
    // add one that shouldn't exist here.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-900">Pay Invoice</h2>
        {state.status === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading payment form…</p>}
        {(state.status === 'unavailable' || state.status === 'error') && (
          <p className="mt-4 text-sm text-red-600">{state.message || "Online payment isn't available right now — please contact us."}</p>
        )}
        {state.status === 'ready' && state.clientSecret && stripe && (
          <Elements stripe={stripe} options={{ clientSecret: state.clientSecret }}>
            <StripePaymentForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}
        {state.status === 'ready' && !stripe && (
          <p className="mt-4 text-sm text-red-600">Online payment isn't configured for this app right now — please contact us.</p>
        )}
      </div>
    </div>
  );
}

function StripePaymentForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!stripe || !elements) return;
    setIsSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (result.error) {
      setError(result.error.message ?? 'Payment failed. Please try again.');
      setIsSubmitting(false);
      return;
    }
    onSuccess();
  }

  return (
    <div className="mt-4">
      <PaymentElement />
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={!stripe || isSubmitting} className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
          {isSubmitting ? 'Processing…' : 'Pay Now'}
        </button>
      </div>
    </div>
  );
}
