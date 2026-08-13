'use client';

import { useEffect, useState } from 'react';
import { useDashboardMap } from '../../lib/hooks/use-dashboard';
import { useDashboardWeather } from '../../lib/hooks/use-dashboard';
import { DashboardCard, CardSkeleton, CardEmpty } from './dashboard-card';

/**
 * The weather widget needs a lat/lng to query, but Renovo doesn't yet have
 * a "company service area" setting exposed via the API. Rather than
 * hardcoding a placeholder city, this derives a real coordinate from the
 * company's own data — the average location of their serviced properties —
 * and falls back to the browser's geolocation, and only shows an empty
 * state (never a fake forecast) if neither is available.
 */
function useInferredLocation(): { lat: number | null; lng: number | null; source: 'properties' | 'browser' | null } {
  const { data: properties } = useDashboardMap();
  const [browserCoords, setBrowserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (properties && properties.length > 0) return; // already have a source, don't bother asking
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => setBrowserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silently ignore — the card just shows its empty state
      { timeout: 5000 },
    );
  }, [properties]);

  if (properties && properties.length > 0) {
    const avgLat = properties.reduce((sum, p) => sum + p.latitude, 0) / properties.length;
    const avgLng = properties.reduce((sum, p) => sum + p.longitude, 0) / properties.length;
    return { lat: avgLat, lng: avgLng, source: 'properties' };
  }

  if (browserCoords) return { lat: browserCoords.lat, lng: browserCoords.lng, source: 'browser' };

  return { lat: null, lng: null, source: null };
}

export function WeatherCard() {
  const { lat, lng } = useInferredLocation();
  const { data, isLoading } = useDashboardWeather(lat, lng);

  return (
    <DashboardCard title="Weather" icon={<SunIcon />}>
      {lat === null && <CardEmpty message="Add a customer address to see local weather." />}
      {lat !== null && isLoading && <CardSkeleton lines={3} />}
      {lat !== null && !isLoading && !data && <CardEmpty message="Weather is temporarily unavailable." />}

      {data && (
        <div>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{data.current.temperatureF}°</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <div>{data.current.condition}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Wind {data.current.windSpeedMph} mph</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1 border-t border-slate-100 dark:border-slate-800 pt-3">
            {data.daily.map((d) => (
              <div key={d.date} className="text-center">
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">{d.highF}°</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">{d.lowF}°</div>
              </div>
            ))}
          </div>

          {data.workAdvisory.isRisky && (
            <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              ⚠ {data.workAdvisory.reason}
            </div>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
