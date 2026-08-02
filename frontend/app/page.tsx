'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  useEffect(() => {
    // Some mobile browsers restore the previous scroll position on this
    // exact URL when landing here right after login, even though this is
    // a fresh client-side navigation that should start at the top —
    // observed as the page opening already scrolled past the header and
    // greeting. Next.js's own router already tries to reset scroll on
    // push(), but that doesn't override the browser's own native
    // scroll-restoration behavior, so it's forced explicitly here instead.
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    // middleware.ts is the primary guard and normally catches this
    // server-side before this component ever renders. This is the real
    // fallback for the case middleware can't cover — a session that goes
    // stale mid-visit (token expired, cookie cleared) during client-side
    // navigation, where no new server request happens for middleware to
    // intercept. Previously this branch only displayed text describing a
    // redirect without ever performing one, silently stranding the user
    // here — found via a real report, not assumed.
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
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
