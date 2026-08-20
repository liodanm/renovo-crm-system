'use client';

import useSWR from 'swr';
import { CalendarDays } from 'lucide-react';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../components/portal/PortalShell';
import { SERVICE_TYPE_LABELS } from '../../../lib/api/service-catalog';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface AppointmentService {
  serviceType: string | null;
  customServiceName: string | null;
}

interface Appointment {
  id: string;
  jobId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  services: AppointmentService[];
}

/** Same fallback order as every other line-item label resolution in the
 * portal (Quote/Invoice detail): custom name first, then the real
 * predefined label, joined with a comma when a job has more than one
 * service. Falls back to the appointment's own title only if no line
 * items resolved to anything — keeps a real heading either way instead
 * of an empty one. */
function resolveServiceNames(services: AppointmentService[], fallbackTitle: string): string {
  const names = services
    .map((s) => s.customServiceName || (s.serviceType ? SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType : null))
    .filter((n): n is string => !!n);
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique.join(', ') : fallbackTitle;
}

export default function PortalAppointmentsPage() {
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: appointments, error, isLoading } = useSWR<Appointment[]>('portal-appointments', () => portalApiFetch<Appointment[]>('/portal/appointments'));

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} primaryColor={dashboard?.company.primaryColor} secondaryColor={dashboard?.company.secondaryColor} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        )}

        {error && !isLoading && <p className="py-10 text-center text-sm text-slate-500">We couldn't load your appointments right now. Please try refreshing.</p>}

        {!isLoading && !error && appointments?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 py-16 text-center">
            <CalendarDays className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold text-slate-900">No Visits Scheduled</p>
            <p className="mt-1 text-sm text-slate-500">You don't have any visits scheduled at this time.</p>
          </div>
        )}

        {!isLoading && !error && appointments && appointments.length > 0 && (
          <div className="divide-y divide-slate-100">
            {appointments.map((a) => {
              const serviceNames = resolveServiceNames(a.services, a.title);
              const showTitleBelow = serviceNames !== a.title;
              return (
                <div key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-semibold text-slate-900">{serviceNames}</p>
                  {showTitleBelow && <p className="mt-0.5 text-sm text-slate-500">{a.title}</p>}
                  <p className="mt-1 text-sm text-slate-500">
                    {new Date(a.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ·{' '}
                    {new Date(a.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} –{' '}
                    {new Date(a.endsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
