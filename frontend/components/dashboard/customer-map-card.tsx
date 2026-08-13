'use client';

import dynamic from 'next/dynamic';
import { useDashboardMap } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardError, CardEmpty } from './dashboard-card';

// Leaflet reads `window`/`document` at module-evaluation time, which breaks
// Next.js's server render pass even inside a 'use client' component — the
// standard fix is ssr:false via next/dynamic so it only ever loads in the browser.
const CustomerMapInner = dynamic(() => import('./customer-map-inner').then((m) => m.CustomerMapInner), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500">Loading map…</div>,
});

export function CustomerMapCard() {
  const { data, error, isLoading } = useDashboardMap();

  return (
    <DashboardCard title="Customer Map" icon={<PinIcon />} className="lg:col-span-2" padded={false}>
      <div className="h-80 w-full overflow-hidden rounded-b-xl">
        {isLoading && <div className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500">Loading…</div>}
        {error && (
          <div className="flex h-full items-center justify-center p-4">
            <CardError />
          </div>
        )}
        {!isLoading && !error && data && data.length === 0 && (
          <div className="flex h-full items-center justify-center p-4">
            <CardEmpty message="No customer addresses with coordinates yet." />
          </div>
        )}
        {!isLoading && !error && data && data.length > 0 && <CustomerMapInner properties={data} />}
      </div>
    </DashboardCard>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
