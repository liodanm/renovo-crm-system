'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { portalApiFetch, PortalApiError } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../components/portal/PortalShell';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null };
}

export default function PortalRequestQuotePage() {
  const router = useRouter();
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    setSubmitting(true);
    try {
      await portalApiFetch('/portal/service-requests', { method: 'POST', body: JSON.stringify({ description: description.trim() }) });
      setSubmitted(true);
    } catch (err) {
      setFormError(err instanceof PortalApiError ? err.message : 'Something went wrong sending your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">Request a Quote</h1>
      <p className="mt-1 text-sm text-slate-500">Tell us what you need and {dashboard?.company.name ?? 'we'} will follow up with pricing.</p>

      <div className="mt-6 max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        {submitted ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold text-slate-900">Request sent</p>
            <p className="mt-1 text-sm text-slate-500">Thanks — we'll be in touch shortly with a quote.</p>
            <button onClick={() => router.push('/portal/dashboard')} className="mt-5 rounded-lg bg-[#11365F] px-4 py-2 text-sm font-medium text-white hover:bg-[#11365F]/90">
              Back to Quotes
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">What do you need?</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="E.g. Driveway and walkway pressure washing, front and back of the house."
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#11365F] focus:outline-none"
              />
            </label>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-lg bg-[#11365F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#11365F]/90 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send Request'}
            </button>
          </form>
        )}
      </div>
    </PortalShell>
  );
}
