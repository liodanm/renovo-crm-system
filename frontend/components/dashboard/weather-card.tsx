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
                  {/* Root cause, confirmed by tracing this exact line:
                      d.date is a bare YYYY-MM-DD string, already
                      correctly localized to the property's own
                      timezone server-side (weather.service.ts sends
                      timezone=auto to Open-Meteo). But `new Date('2026-09-04')`
                      — a date-only ISO string with no time component —
                      is parsed as UTC MIDNIGHT per the ECMAScript spec,
                      not local midnight. toLocaleDateString() then
                      converts that UTC instant back to the BROWSER's
                      local zone for display — for any US timezone
                      (all negative UTC offsets), UTC midnight on a
                      given date is still the PREVIOUS day locally,
                      which is exactly the reported "shows yesterday"
                      symptom. Appending a literal local-time component
                      (T00:00:00, no Z) makes the same constructor
                      parse it as LOCAL midnight instead — the
                      standard, minimal fix for this exact class of
                      bug. No backend change needed; the date string
                      itself was already correct. */}
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="mt-1 flex justify-center" title={d.condition}>
                  <ConditionIcon condition={d.condition} />
                </div>
                <div className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">{d.highF}°</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">{d.lowF}°</div>
                {d.precipitationProbabilityPct > 0 && (
                  <div className="mt-0.5 text-[11px] font-medium text-blue-500 dark:text-blue-400">{d.precipitationProbabilityPct}%</div>
                )}
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

// Matches the exact condition strings WeatherService.describeWeatherCode
// returns (Clear/Partly Cloudy/Fog/Drizzle/Rain/Snow/Rain Showers/Snow
// Showers/Thunderstorm/Unknown) — not a separate condition vocabulary.
function ConditionIcon({ condition }: { condition: string }) {
  const stroke = 'currentColor';
  const cls = 'text-slate-400 dark:text-slate-500';
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2, className: cls, 'aria-hidden': true } as const;

  if (condition === 'Clear') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (condition === 'Thunderstorm') {
    return (
      <svg {...props}>
        <path d="M17 15.5A4.5 4.5 0 0016.5 7a5.5 5.5 0 00-10.7 1.7A4 4 0 007 16.5" />
        <path d="M13 12l-3 4h3l-2 4" />
      </svg>
    );
  }
  if (condition === 'Rain' || condition === 'Rain Showers' || condition === 'Drizzle') {
    return (
      <svg {...props}>
        <path d="M17 15.5A4.5 4.5 0 0016.5 7a5.5 5.5 0 00-10.7 1.7A4 4 0 007 16.5" />
        <path d="M8 17v2M12 17v2M16 17v2" />
      </svg>
    );
  }
  if (condition === 'Snow' || condition === 'Snow Showers') {
    return (
      <svg {...props}>
        <path d="M17 15.5A4.5 4.5 0 0016.5 7a5.5 5.5 0 00-10.7 1.7A4 4 0 007 16.5" />
        <path d="M8 18l.01.01M12 18l.01.01M16 18l.01.01" strokeLinecap="round" />
      </svg>
    );
  }
  if (condition === 'Fog') {
    return (
      <svg {...props}>
        <path d="M5 10h14M3 14h18M6 18h12" strokeLinecap="round" />
      </svg>
    );
  }
  // Partly Cloudy / Unknown — the safe, neutral default
  return (
    <svg {...props}>
      <path d="M17 15.5A4.5 4.5 0 0016.5 7a5.5 5.5 0 00-10.7 1.7A4 4 0 007 16.5" />
    </svg>
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
