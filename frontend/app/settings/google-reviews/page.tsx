'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Star } from 'lucide-react';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

/**
 * Configures the live Google Places API integration that powers the
 * Dashboard's Google Reviews card. Deliberately separate from the
 * existing "Google Review URL" field on Settings > Integrations —
 * that's a static outbound link used on payment receipts; this is a
 * different thing (a Place ID + an enable toggle that pulls real review
 * content), correctly modeled as its own settings section rather than
 * folded into Business Links.
 *
 * The "Test" button makes a real call to Google's Places API — it is
 * NOT a format check. It requires GOOGLE_PLACES_API_KEY to be set as a
 * Railway env var (same pattern as every other provider's credential;
 * see ADR-011 — no provider secret is ever stored in Postgres).
 */
export default function GoogleReviewsSettingsPage() {
  const { data, mutate } = useSWR('settings-google-reviews', () => settingsApi.getGoogleReviewsConfig());

  const [placeId, setPlaceId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; meta?: { name?: string; rating?: number; userRatingsTotal?: number } } | null>(null);

  useEffect(() => {
    if (data) {
      setPlaceId(data.googlePlaceId ?? '');
      setEnabled(data.googleReviewsEnabled);
    }
  }, [data]);

  function track<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setHasChanges(true);
      setTestResult(null);
    };
  }

  async function handleTest() {
    if (!placeId.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await settingsApi.testGoogleReviewsPlaceId(placeId.trim());
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof ApiError ? err.message : 'Could not reach the server.' });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateGoogleReviewsConfig({ googlePlaceId: placeId.trim() || null, googleReviewsEnabled: enabled });
      await mutate();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) {
      setPlaceId(data.googlePlaceId ?? '');
      setEnabled(data.googleReviewsEnabled);
    }
    setHasChanges(false);
    setTestResult(null);
    setError(null);
  }

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Google Reviews"
      description="Show your real Google reviews on the Dashboard."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!data ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Configuration</h2>
            </div>

            <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
              Connect your Google Business Profile to display up to 5 recent reviews on your dashboard. This uses the Google Places API and provides read-only access.
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Google Place ID</label>
              <div className="mt-1 flex gap-2">
                <input
                  value={placeId}
                  onChange={(e) => track(setPlaceId)(e.target.value)}
                  placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
                <button
                  onClick={handleTest}
                  disabled={isTesting || !placeId.trim()}
                  className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {isTesting ? 'Testing…' : 'Test'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Find your Place ID using the{' '}
                <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" className="font-medium text-[var(--color-brand)] hover:underline">
                  Place ID Finder
                </a>
              </p>

              {testResult && (
                <p className={`mt-2 text-xs ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {testResult.ok
                    ? `✓ ${testResult.meta?.name ?? 'Found'} — ${testResult.meta?.rating ?? '—'}★ (${testResult.meta?.userRatingsTotal ?? 0} reviews)`
                    : testResult.error}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enable Google Reviews</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Show reviews on your dashboard</p>
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => track(setEnabled)(e.target.checked)}
                  className="peer sr-only"
                  aria-label="Enable Google Reviews"
                />
                <div className="h-6 w-11 rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:bg-[var(--color-brand)] peer-focus:outline-none after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">About Google Places API</h2>
            <dl className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div><dt className="inline font-medium text-slate-600 dark:text-slate-300">What you&apos;ll see: </dt><dd className="inline">Average rating, total review count, and up to 5 most recent/helpful reviews</dd></div>
              <div><dt className="inline font-medium text-slate-600 dark:text-slate-300">Limitations: </dt><dd className="inline">Google Places API only provides access to a selection of reviews (typically 5), not all reviews</dd></div>
              <div><dt className="inline font-medium text-slate-600 dark:text-slate-300">Privacy: </dt><dd className="inline">Only publicly available review data is displayed</dd></div>
              <div><dt className="inline font-medium text-slate-600 dark:text-slate-300">Updates: </dt><dd className="inline">Reviews are fetched fresh each time you view the dashboard</dd></div>
              <div><dt className="inline font-medium text-slate-600 dark:text-slate-300">Place ID Expiration: </dt><dd className="inline">Google Place IDs can occasionally change. If your reviews stop showing, use the &ldquo;Test&rdquo; button to verify your Place ID is still valid.</dd></div>
            </dl>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}
