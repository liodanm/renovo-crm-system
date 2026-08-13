'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { useDashboardGoogleReviews } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardError, CardEmpty } from './dashboard-card';

/**
 * Only renders anything once the company has actually enabled Google
 * Reviews with a working Place ID — an unconfigured/disabled state
 * shows a single CardEmpty pointing at the settings page, not an error
 * or a permanently-visible blank card. Data comes from a real Google
 * Places API call (see IntegrationsService.getGoogleReviews on the
 * backend) — this component only renders whatever the backend returns.
 */
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
      ))}
    </div>
  );
}

export function GoogleReviewsCard() {
  const { data, error, isLoading } = useDashboardGoogleReviews();

  return (
    <DashboardCard title="Google Reviews" icon={<Star className="h-4 w-4" />}>
      {isLoading && <CardSkeleton lines={4} />}
      {error && <CardError />}

      {!isLoading && !error && data && !data.enabled && (
        <CardEmpty
          message="Google Reviews isn't set up yet."
          action={
            <Link href="/settings/google-reviews" className="text-xs font-medium text-[var(--color-brand)] hover:underline">
              Set up in Settings →
            </Link>
          }
        />
      )}

      {!isLoading && !error && data?.enabled && data.error && <CardError message={data.error} />}

      {!isLoading && !error && data?.enabled && !data.error && data.reviews && data.reviews.length === 0 && (
        <CardEmpty message="No reviews yet." />
      )}

      {!isLoading && !error && data?.enabled && !data.error && data.reviews && data.reviews.length > 0 && (
        <div>
          {data.rating !== null && (
            <div className="mb-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.rating.toFixed(1)}</span>
              <div>
                <Stars rating={data.rating} />
                <p className="text-xs text-slate-500 dark:text-slate-400">{data.userRatingsTotal ?? 0} reviews</p>
              </div>
            </div>
          )}
          <ul className="space-y-3">
            {data.reviews.map((r, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{r.author}</span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{r.relativeTime}</span>
                </div>
                <Stars rating={r.rating} />
                {r.text && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{r.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
