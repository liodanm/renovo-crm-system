'use client';

import useSWR from 'swr';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null };
  outstandingBalance: number;
  openEstimatesCount: number;
  openInvoicesCount: number;
  upcomingAppointments: { id: string; title: string; startsAt: string; endsAt: string }[];
  lastCompletedService: { id: string; title: string; completedAt: string; address: string; price: number } | null;
}

const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalDashboardPage() {
  // The one and only request this page makes — every figure below comes
  // from this single composed response, never a second independent
  // fetch for balance/estimates/invoices/appointments separately.
  const { data, error, isLoading } = useSWR<DashboardResponse>('portal-dashboard', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));

  function handleLogout() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">We couldn't load your dashboard right now. Please try refreshing.</p>
        </div>
      </main>
    );
  }

  const hasBalance = data.outstandingBalance > 0;

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-white px-4 pb-6 pt-8 shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            {data.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.company.logoUrl} alt={data.company.name} className="h-8 w-auto object-contain" />
            ) : (
              <span className="text-sm font-semibold text-slate-500">{data.company.name}</span>
            )}
            <h1 className="mt-2 text-xl font-semibold text-slate-900">Welcome, {data.customer.name}</h1>
          </div>
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600">
            Sign out
          </button>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-md space-y-3 px-4">
        {/* Balance is always shown, even at $0 — the one figure a
            homeowner most wants confirmed either way. Everything else
            below only shows a card when it has something real to say. */}
        <div className={`rounded-xl p-4 shadow-sm ${hasBalance ? 'bg-amber-50' : 'bg-white'}`}>
          <p className="text-xs font-medium text-slate-500">Outstanding Balance</p>
          <p className={`mt-1 text-2xl font-bold ${hasBalance ? 'text-amber-700' : 'text-slate-900'}`}>{money(data.outstandingBalance)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Open Estimates</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{data.openEstimatesCount}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Open Invoices</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{data.openInvoicesCount}</p>
          </div>
        </div>

        {data.upcomingAppointments.length > 0 && (
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Upcoming Appointment{data.upcomingAppointments.length > 1 ? 's' : ''}</p>
            <div className="mt-2 space-y-2">
              {data.upcomingAppointments.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="font-medium text-slate-900">{a.title}</p>
                  <p className="text-slate-500">
                    {new Date(a.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
                    {new Date(a.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.lastCompletedService && (
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">Last Completed Service</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{data.lastCompletedService.title}</p>
            <p className="text-sm text-slate-500">
              {new Date(data.lastCompletedService.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Quick navigation — links only, Phase 2 builds the actual
            destination pages. Not rendered as functional buttons yet
            since those routes don't exist to send anyone to. */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {['Estimates', 'Invoices'].map((label) => (
            <div key={label} className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
              {label}
              <span className="mt-1 block text-xs">Coming soon</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
