'use client';

import { useAuth } from '../lib/auth/auth-context';
import { AppShell } from '../components/layout/AppShell';
import { SummaryStats } from '../components/dashboard/summary-stats';
import { TodaysJobsListCard } from '../components/dashboard/todays-jobs-list-card';
import { JobCalendarCard } from '../components/dashboard/job-calendar-card';
import { CustomerMapCard } from '../components/dashboard/customer-map-card';
import { WeatherCard } from '../components/dashboard/weather-card';
import { RecentPaymentsCard } from '../components/dashboard/recent-payments-card';
import { AiSuggestionsCard } from '../components/dashboard/ai-suggestions-card';
import { NotificationsCard } from '../components/dashboard/notifications-card';

export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  if (!user) {
    // middleware.ts should already have redirected unauthenticated requests
    // to /login; this is a defensive fallback for client-side navigation
    // (e.g. token expired mid-session, before the next refresh cycle runs).
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Redirecting to login…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Good {timeOfDayGreeting()}
          {user.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening across your business today.</p>

        <div className="mt-6 space-y-4">
          <SummaryStats />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TodaysJobsListCard />
            <div className="lg:col-span-2">
              <JobCalendarCard />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CustomerMapCard />
            <WeatherCard />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RecentPaymentsCard />
            <AiSuggestionsCard />
            <NotificationsCard />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
