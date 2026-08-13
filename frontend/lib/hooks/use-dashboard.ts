'use client';

import useSWR from 'swr';
import { dashboardApi } from '../api/dashboard';

/** Refresh cadence per widget — balances "feels live" against hammering the API. */
const SUMMARY_REFRESH_MS = 60_000; // jobs/revenue/leads change throughout the day
const CALENDAR_REFRESH_MS = 5 * 60_000;
const MAP_REFRESH_MS = 5 * 60_000;
const WEATHER_REFRESH_MS = 15 * 60_000; // backend caches 30 min anyway
const NOTIFICATIONS_REFRESH_MS = 30_000;
const AI_SUGGESTIONS_REFRESH_MS = 5 * 60_000; // backend caches 30 min anyway
const GOOGLE_REVIEWS_REFRESH_MS = 15 * 60_000; // real Places API call — avoid hammering it

export function useDashboardSummary() {
  return useSWR('dashboard-summary', dashboardApi.getSummary, { refreshInterval: SUMMARY_REFRESH_MS });
}

export function useDashboardCalendar(start: Date, end: Date) {
  const key = `dashboard-calendar-${start.toISOString()}-${end.toISOString()}`;
  return useSWR(key, () => dashboardApi.getCalendar(start, end), { refreshInterval: CALENDAR_REFRESH_MS });
}

export function useDashboardMap() {
  return useSWR('dashboard-map', dashboardApi.getMap, { refreshInterval: MAP_REFRESH_MS });
}

export function useDashboardWeather(lat: number | null, lng: number | null) {
  const key = lat !== null && lng !== null ? `dashboard-weather-${lat}-${lng}` : null;
  return useSWR(key, () => dashboardApi.getWeather(lat!, lng!), { refreshInterval: WEATHER_REFRESH_MS });
}

export function useDashboardNotifications() {
  return useSWR('dashboard-notifications', dashboardApi.getNotifications, {
    refreshInterval: NOTIFICATIONS_REFRESH_MS,
  });
}

export function useDashboardAiSuggestions() {
  return useSWR('dashboard-ai-suggestions', dashboardApi.getAiSuggestions, {
    refreshInterval: AI_SUGGESTIONS_REFRESH_MS,
  });
}

export function useDashboardGoogleReviews() {
  return useSWR('dashboard-google-reviews', dashboardApi.getGoogleReviews, {
    refreshInterval: GOOGLE_REVIEWS_REFRESH_MS,
  });
}
