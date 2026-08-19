'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { portalApiFetch, PortalApiError } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../components/portal/PortalShell';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface Account {
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string;
  phone: string | null;
}

interface Property {
  id: string;
  label: string | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

const OTHER_ADDRESS = '__other__';

/**
 * The reference form asks for name/email/phone/company as if this were
 * a first-contact public form — but a portal customer is already
 * authenticated, and CreateServiceRequestDto (backend) has no fields for
 * any of that; it only accepts propertyId and description. Rather than
 * add editable inputs that silently go nowhere, contact info below is
 * shown read-only, pulled from the real /portal/account data — visually
 * present, honestly non-functional as an edit surface. Service Address
 * IS a real, wired field (propertyId); "different address" is folded
 * into the description text sent to the backend rather than dropped,
 * since there's no separate new-address field on the real DTO to put it in.
 */
export default function PortalRequestQuotePage() {
  const router = useRouter();
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: account } = useSWR<Account>('portal-account', () => portalApiFetch<Account>('/portal/account'));
  const { data: properties } = useSWR<Property[]>('portal-properties', () => portalApiFetch<Property[]>('/portal/properties'));

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [otherAddress, setOtherAddress] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Defaults to the first property once the list loads — a real
  // selection, not a placeholder — matching the reference's own
  // pre-selected "Main (Primary)" behavior.
  const selectedPropertyId = propertyId ?? properties?.[0]?.id ?? null;
  const selectedProperty = useMemo(() => properties?.find((p) => p.id === selectedPropertyId) ?? null, [properties, selectedPropertyId]);
  const displayName = account ? (account.businessName || [account.firstName, account.lastName].filter(Boolean).join(' ')) : null;

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (description.trim().length < 5) {
      setFormError('Please add a few more details so we know what you need.');
      return;
    }
    if (selectedPropertyId === OTHER_ADDRESS && otherAddress.trim().length < 5) {
      setFormError('Please enter the service address.');
      return;
    }

    setSubmitting(true);
    try {
      const usingOther = selectedPropertyId === OTHER_ADDRESS;
      await portalApiFetch('/portal/service-requests', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: usingOther ? undefined : selectedPropertyId ?? undefined,
          // Folded in, not dropped — the real DTO has no separate
          // new-address field, so this is the honest way to carry it
          // through to staff rather than silently discarding it.
          description: usingOther ? `Service address: ${otherAddress.trim()}\n\n${description.trim()}` : description.trim(),
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof PortalApiError ? err.message : 'Something went wrong sending your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} primaryColor={dashboard?.company.primaryColor} secondaryColor={dashboard?.company.secondaryColor} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">Request a Quote</h1>
      <p className="mt-1 text-sm text-slate-500">Tell us what you need and {dashboard?.company.name ?? 'we'} will follow up with pricing.</p>

      <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        {submitted ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold text-slate-900">Request sent</p>
            <p className="mt-1 text-sm text-slate-500">Thanks — we'll be in touch shortly with a quote.</p>
            <button onClick={() => router.push('/portal/dashboard')} className="mt-5 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Back to Quotes
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">Service Address</label>
              <select
                value={selectedPropertyId ?? OTHER_ADDRESS}
                onChange={(e) => setPropertyId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[var(--color-brand)] focus:outline-none"
              >
                {properties?.map((p) => (
                  <option key={p.id} value={p.id}>{p.label || 'Property'} — {p.addressLine1}</option>
                ))}
                <option value={OTHER_ADDRESS}>A different address</option>
              </select>
              {selectedProperty && selectedPropertyId !== OTHER_ADDRESS && (
                <p className="mt-1 text-xs text-slate-500">{selectedProperty.addressLine1}, {selectedProperty.city}, {selectedProperty.state} {selectedProperty.postalCode}</p>
              )}
              {selectedPropertyId === OTHER_ADDRESS && (
                <input
                  value={otherAddress}
                  onChange={(e) => setOtherAddress(e.target.value)}
                  placeholder="Start typing your address…"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[var(--color-brand)] focus:outline-none"
                />
              )}
            </div>

            {/* Read-only — pulled from the authenticated account, not a
                second identity form. See this component's own top comment
                for why these aren't editable inputs. */}
            {account && (
              <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">Name</p>
                  <p className="mt-0.5 text-sm text-slate-900">{displayName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Email</p>
                  <p className="mt-0.5 truncate text-sm text-slate-900">{account.email}</p>
                </div>
                {account.phone && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">Phone</p>
                    <p className="mt-0.5 text-sm text-slate-900">{account.phone}</p>
                  </div>
                )}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Tell us about your project</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="What services are you interested in?"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[var(--color-brand)] focus:outline-none"
              />
            </label>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit Request'}
            </button>
          </form>
        )}
      </div>
    </PortalShell>
  );
}
