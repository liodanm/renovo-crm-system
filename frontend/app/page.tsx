'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '../lib/auth/auth-context';
import { AppShell } from '../components/layout/AppShell';
import { DayAgendaView } from '../components/scheduling/DayAgendaView';
import { AppointmentDetailPanel } from '../components/scheduling/AppointmentDetailPanel';
import { schedulingApi, type CalendarAppointment } from '../lib/api/scheduling';
import { dashboardApi } from '../lib/api/dashboard';
import { WeatherCard } from '../components/dashboard/weather-card';
import { RecentPaymentsCard } from '../components/dashboard/recent-payments-card';
import { AiSuggestionsCard } from '../components/dashboard/ai-suggestions-card';
import { NotificationsCard } from '../components/dashboard/notifications-card';
import { GoogleReviewsCard } from '../components/dashboard/google-reviews-card';
import { DashboardReportWidgets } from '../components/dashboard/DashboardReportWidgets';
import { MoneyCenter, QuotePipeline, CustomerFollowUp, NeedsAttention } from '../components/dashboard/DashboardMoneyAndPipeline';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() + 1); return x; }

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  const today = new Date();
  // Same unified Jobs + Calendar Items source DayAgendaView already
  // uses on the Scheduling page — deliberately NOT
  // DashboardService.getTodaysJobs (Job-table-only, confirmed during
  // the audit), so a Calendar Item scheduled for today shows up here
  // exactly as it does in Scheduling, not just Jobs.
  const { data: appointments, mutate: mutateAppointments } = useSWR(
    user ? ['dashboard-today', today.toDateString()] : null,
    () => schedulingApi.getCalendar({ start: startOfDay(today).toISOString(), end: endOfDay(today).toISOString() }),
  );
  const { data: summary } = useSWR(user ? 'dashboard-summary' : null, () => dashboardApi.getSummary());

  const [selected, setSelected] = useState<CalendarAppointment | null>(null);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Good {timeOfDayGreeting()}
          {user.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here&apos;s what&apos;s happening across your business today.</p>

        <div className="mt-6 space-y-4">
          {/* ---- Today's Command Center — the exact same DayAgendaView
                already built and proven for Scheduling → Day, not a
                second "today" implementation. Customer Map intentionally
                no longer rendered here (see final report) — files and
                Scheduling's own Map View are both untouched. ---- */}
          {appointments ? (
            <DayAgendaView
              date={today}
              appointments={appointments}
              onSelect={setSelected}
              onCreate={() => router.push('/scheduling')}
            />
          ) : (
            <div className="h-40 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900" />
          )}

          {summary && (
            <>
              <NeedsAttention summary={summary} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MoneyCenter summary={summary} />
                <QuotePipeline summary={summary} />
              </div>

              <CustomerFollowUp summary={summary} />
            </>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <WeatherCard />
            <RecentPaymentsCard />
            <AiSuggestionsCard />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <NotificationsCard />
            <GoogleReviewsCard />
          </div>

          {/* Business Performance preview — the existing report widgets
              already link into the full Reports Center; not duplicated
              here. */}
          <DashboardReportWidgets />
        </div>
      </div>

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { mutateAppointments(); setSelected(null); }}
          onOpenReschedule={() => router.push('/scheduling')}
        />
      )}
    </AppShell>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
