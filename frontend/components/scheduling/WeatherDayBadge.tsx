'use client';

import { useEffect, useState } from 'react';
import { dashboardApi, type WeatherSnapshot } from '../../lib/api/dashboard';

const ICONS: Record<string, string> = {
  Clear: '☀️', 'Partly Cloudy': '⛅', Fog: '🌫️', Drizzle: '🌦️',
  Rain: '🌧️', 'Rain Showers': '🌧️', Snow: '❄️', 'Snow Showers': '❄️',
  Thunderstorm: '⛈️',
};

export function WeatherDayBadge({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  const [weather, setWeather] = useState<WeatherSnapshot | null | undefined>(undefined);

  useEffect(() => {
    if (latitude == null || longitude == null) {
      setWeather(null);
      return;
    }
    setWeather(undefined);
    dashboardApi.getWeather(latitude, longitude).then(setWeather).catch(() => setWeather(null));
  }, [latitude, longitude]);

  if (!weather) return null;

  const icon = ICONS[weather.current.condition] ?? '🌡️';
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500" title={weather.current.condition}>
      {icon} {Math.round(weather.current.temperatureF)}°
    </span>
  );
}
