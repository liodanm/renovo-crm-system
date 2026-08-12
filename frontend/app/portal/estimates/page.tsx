'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
import { StatusBadge, ESTIMATE_STATUS_COLORS } from '../../../components/action-center/StatusBadge';

interface EstimateListItem {
  id: string;
  estimateNumber: string;
  status: string;
  totalAmount: string;
  validUntil: string | null;
  createdAt: string;
  property: { addressLine1: string; city: string; state: string } | null;
}

const money = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalEstimatesPage() {
  const { data, error, isLoading } = useSWR<EstimateListItem[]>('portal-estimates', () => portalApiFetch<EstimateListItem[]>('/portal/estimates'));

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-white px-4 pb-4 pt-8 shadow-sm">
        <div className="mx-auto max-w-md">
          <Link href="/portal/dashboard" className="text-xs text-slate-400 hover:text-slate-600">
            ← Back to Dashboard
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Your Estimates</h1>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-md space-y-3 px-4">
        {isLoading && (
          <>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
            ))}
          </>
        )}

        {error && !isLoading && (
          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">We couldn't load your estimates right now. Please try refreshing.</p>
          </div>
        )}

        {!isLoading && !error && data?.length === 0 && (
          <div className="rounded-xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">You don't have any estimates yet.</p>
          </div>
        )}

        {!isLoading && !error && data && data.length > 0 && data.map((est) => (
          <Link
            key={est.id}
            href={`/portal/estimates/${est.id}`}
            className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">{est.estimateNumber}</p>
                {est.property && (
                  <p className="mt-0.5 text-sm text-slate-500">{est.property.addressLine1}, {est.property.city}</p>
                )}
              </div>
              <StatusBadge status={est.status} colorMap={ESTIMATE_STATUS_COLORS} />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-lg font-bold text-slate-900">{money(est.totalAmount)}</p>
              {est.validUntil && (
                <p className="text-xs text-slate-500">
                  Valid until {new Date(est.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
