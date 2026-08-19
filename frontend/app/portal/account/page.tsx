'use client';

import useSWR from 'swr';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
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

export default function PortalAccountPage() {
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: account, error, isLoading } = useSWR<Account>('portal-account', () => portalApiFetch<Account>('/portal/account'));

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  const displayName = account ? (account.businessName || [account.firstName, account.lastName].filter(Boolean).join(' ')) : null;

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} primaryColor={dashboard?.company.primaryColor} secondaryColor={dashboard?.company.secondaryColor} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">Account</h1>

      <div className="mt-6 max-w-md rounded-xl border border-slate-200 bg-white p-5">
        {isLoading && <div className="h-32 animate-pulse rounded-lg bg-slate-100" />}

        {error && !isLoading && <p className="text-sm text-slate-500">We couldn't load your account info right now. Please try refreshing.</p>}

        {!isLoading && !error && account && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Name</p>
              <p className="mt-0.5 text-sm text-slate-900">{displayName || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Email</p>
              <p className="mt-0.5 text-sm text-slate-900">{account.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Phone</p>
              <p className="mt-0.5 text-sm text-slate-900">{account.phone || '—'}</p>
            </div>
            {/* Editable contact info and password/notification preferences
                are real follow-up work, not built in this pass — this is
                a read-only view for now, matching the scope of the visual
                redesign this page was part of. */}
            <p className="pt-2 text-xs text-slate-400">
              To update your contact information, please reach out to {dashboard?.company.name ?? 'us'} directly.
            </p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
