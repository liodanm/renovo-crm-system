'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { FileEdit } from 'lucide-react';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../components/portal/PortalShell';
import { StatusBadge, ESTIMATE_STATUS_COLORS } from '../../../components/action-center/StatusBadge';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface EstimateListItem {
  id: string;
  estimateNumber: string;
  status: string;
  totalAmount: string;
  validUntil: string | null;
  createdAt: string;
  property: { addressLine1: string; city: string; state: string } | null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function PortalDashboardPage() {
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: estimates, error, isLoading } = useSWR<EstimateListItem[]>('portal-estimates', () => portalApiFetch<EstimateListItem[]>('/portal/estimates'));

  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const filtered = useMemo(() => {
    if (!estimates) return undefined;
    const list = statusFilter === 'all' ? estimates : estimates.filter((e) => e.status === statusFilter);
    return [...list].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? -diff : diff;
    });
  }, [estimates, statusFilter, sortOrder]);

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} primaryColor={dashboard?.company.primaryColor} secondaryColor={dashboard?.company.secondaryColor} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">
        {greeting()}{dashboard?.customer.name ? `, ${dashboard.customer.name.split(' ')[0]}` : ''}
      </h1>

      {/*
        "Get Instant Quote" removed at the owner's request — Renovo has
        no real-time self-service pricing engine, and the card was an
        honest-but-still-fake placeholder pointing at the same request
        form as "Request a Quote" below. If real instant pricing is ever
        built, a card like this belongs back here pointing at that real
        feature, not before then.
      */}
      <div className="mt-6 max-w-sm">
        <Link href="/portal/request-quote" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-[var(--color-brand)]/30 hover:bg-slate-50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)]/[0.08]">
            <FileEdit className="h-5 w-5 text-[var(--color-brand)]" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Request a Quote</span>
            <span className="block text-xs text-slate-500">Tell us what you need</span>
          </span>
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Quotes</h2>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-[#11365F] focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="viewed">Viewed</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-[#11365F] focus:outline-none"
          >
            <option value="newest">Date (newest)</option>
            <option value="oldest">Date (oldest)</option>
          </select>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {isLoading && [...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse py-3"><div className="h-full rounded-lg bg-slate-100" /></div>)}

          {error && !isLoading && <p className="py-6 text-center text-sm text-slate-500">We couldn't load your quotes right now. Please try refreshing.</p>}

          {!isLoading && !error && filtered?.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              {estimates?.length === 0 ? "You don't have any quotes yet." : 'No quotes match this filter.'}
            </p>
          )}

          {!isLoading && !error && filtered && filtered.length > 0 && filtered.map((est) => (
            <div key={est.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">{new Date(est.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="mt-0.5 flex items-center gap-2 font-semibold text-slate-900">
                  Quote #{est.estimateNumber}
                  {est.status === 'accepted' && <StatusBadge status={est.status} colorMap={ESTIMATE_STATUS_COLORS} />}
                </p>
                {est.property && <p className="mt-0.5 truncate text-sm text-slate-500">{est.property.addressLine1}, {est.property.city}</p>}
                {est.validUntil && est.status !== 'accepted' && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Expires {new Date(est.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <Link href={`/portal/estimates/${est.id}`} className="shrink-0 text-sm font-medium text-[#11365F] hover:underline">
                View →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}
