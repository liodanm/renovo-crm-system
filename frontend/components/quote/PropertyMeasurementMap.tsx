'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { polygonAreaSqFt, type LatLon } from '../../lib/geometry';

/**
 * The actual root cause of the blank-tile problem — confirmed by two
 * screenshots showing the identical initial state blank one minute and
 * fully populated the next, which ruled out a wrong maxNativeZoom value
 * (a config problem fails the same way every time, not intermittently).
 * This is a well-known Leaflet-in-React issue: Leaflet calculates its
 * tile grid from the container's size at the exact moment it
 * initializes. This map mounts via next/dynamic (ssr:false) inside a
 * conditionally-rendered step, so the container isn't guaranteed to
 * have its final size yet at that instant.
 *
 * Upgraded from a timeout-based guess to a ResizeObserver: the
 * rAF/timeout version (this component's first attempt) fired
 * invalidateSize() after a *guessed* delay, which is still a race
 * against however long the container actually takes to settle — on a
 * slower device or a longer transition, that guess could still lose.
 * ResizeObserver instead fires exactly when the container's real size
 * changes, with no timing assumption at all — this is the fully
 * deterministic fix, not a better-tuned guess.
 */
function MapReadyFixer() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // Real, concrete hypothesis being tested here, not another guess:
    // this component was previously declared BEFORE <TileLayer> in the
    // JSX below, meaning invalidateSize() could fire before Leaflet had
    // actually attached the tile layer internally (react-leaflet adds
    // layers to the map via their own effect, not synchronously during
    // render). Moved to render AFTER <TileLayer> instead, so this
    // effect only runs once the tile layer is already attached.
    // ResizeObserver fires once immediately on observe() per spec (in
    // every modern browser) plus again on any real size change — no
    // separate manual invalidateSize() call is needed alongside it,
    // and having both was a possible source of the exact race being
    // fixed here.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function ClickCapture({ onPoint }: { onPoint: (p: LatLon) => void }) {
  useMapEvents({
    click: (e) => onPoint({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

/**
 * Polygon-only for this phase, per the approved plan — linear/point
 * measurement modes are a future extension of this same component, not
 * built yet. Renders on top of Mapbox Satellite imagery (switched from
 * Esri World Imagery after repeated real-world testing confirmed the
 * intermittent blank-tile problem persisted even with the container-
 * sizing race fixed — see this task's own report for the full
 * before/after evidence), not the OSM street tiles Scheduling's map
 * uses, since a homeowner needs to visually recognize their
 * driveway/patio/pool deck, which a street map can't show.
 *
 * ONE reusable component for driveway/concrete/patio/pool-deck/pavers/
 * pool-cage — not six separate implementations. Which service is being
 * measured is the caller's concern (see QuoteWidgetClient), not this
 * component's.
 */
export function PropertyMeasurementMap({
  latitude,
  longitude,
  initialPoints,
  onComplete,
  onCancel,
}: {
  latitude: number;
  longitude: number;
  // Lets "Edit Measurement" on Review reopen the map with the
  // customer's prior outline already in place, rather than forcing a
  // full redraw — existing React state is enough for this, no new
  // persistence needed.
  initialPoints?: LatLon[];
  onComplete: (areaSqFt: number, points: LatLon[]) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<LatLon[]>(initialPoints ?? []);
  const area = polygonAreaSqFt(points);
  const canFinish = points.length >= 3;
  // A genuine floor, not an arbitrary one — a real residential surface
  // (even a small walkway segment) is comfortably above this; anything
  // below it is almost always an accidental cluster of taps rather than
  // a real outline. Deliberately generous, per "don't over-restrict
  // legitimate small residential surfaces."
  const tooSmall = canFinish && area < 20;

  // Public (client-safe) token — per Mapbox's own model, this is
  // exactly what public tokens are for, same reasoning documented in
  // .env.local.example. Read once, not on every render.
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    // Never a blank/broken map with no explanation — same principle
    // this component already follows for a failed property lookup.
    // The existing Request-Only path ("Not sure how to measure?") is
    // reused here rather than inventing a second fallback mechanism.
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-600">Satellite imagery is temporarily unavailable. You can still request a quote and we&apos;ll verify the measurements.</p>
        <button onClick={onCancel} className="mt-3 rounded-lg bg-[var(--color-brand,#0f766e)] px-4 py-2.5 text-sm font-semibold text-white">
          Request a Quote Instead
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950">
      {/* Full-viewport overlay, not an inline box — per Leo's request to
          match the immersive, edge-to-edge measurement experience (e.g.
          Lavo CRM) instead of a small embedded box. The map itself,
          MapReadyFixer, ClickCapture, and all measurement state below
          are UNCHANGED from the inline version — this is purely a
          layout/positioning change, not a rework of the measurement
          logic or the tile config currently being diagnosed. */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md"
      >
        ✕
      </button>

      <div className="relative flex-1">
        {/* zoom=19 is deliberately the STARTING point, not the ceiling
            — "highest RELIABLE property-level zoom," not maximum.
            maxZoom={21} still lets the customer zoom in further
            themselves. */}
        {/* zoomAnimation left at Leaflet's default (enabled). A prior
            version of this file disabled it, based on a theory that
            was later disproven live (see git history / prior delivery
            notes) — re-enabling it did NOT fix the blank-tile bug
            either. That theory is now ruled out, not just untested. */}
        <MapContainer center={[latitude, longitude]} zoom={19} maxZoom={21} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            // Mapbox's v4 Raster Tiles API — the correct, documented
            // format for a plain Leaflet TileLayer (not the newer GL JS
            // vector-style API, which this app deliberately does NOT
            // adopt).
            //
            // detectRetina removed: makes Leaflet request Mapbox's @2x
            // tile variant on high-DPI displays; removed along with
            // {r} in the URL since it has no effect without it.
            //
            // maxNativeZoom=18: caps which zoom Leaflet treats as
            // "real" tiles vs. client-side-scaled.
            //
            // maxZoom={21} — REQUIRED HERE, not just on MapContainer
            // above. This was the actual root cause of the blank-on-
            // zoom bug, confirmed by the exact symptom: blank
            // immediately at the default zoom (19), fine after
            // zooming OUT to 18 (= maxNativeZoom), blank again at the
            // very next zoom step in (19) — a hard cliff exactly at
            // maxNativeZoom+1, not a gradual falloff. That precise
            // pattern matches a documented Leaflet gotcha
            // (Leaflet/Leaflet#4034): maxNativeZoom tells Leaflet
            // which zoom has real tiles, but Leaflet will NOT
            // autoscale that tile for deeper zooms unless maxZoom is
            // ALSO set on the TileLayer itself — setting it only on
            // MapContainer (as this file did before) is not enough,
            // and produces exactly this cliff-edge blank. This also
            // explains why MinimalMapDiagnostic.tsx was blank on
            // load too — same missing prop, same bug, independent of
            // the container-sizing and zoomAnimation theories tried
            // earlier, both of which were real but not sufficient.
            //
            // maxNativeZoom TEMPORARILY raised 18 -> 20 to test real
            // coverage for actual customer addresses now that the
            // render bug above is fixed — this is safe to test now:
            // worst case Leaflet just re-serves/scales the z18 tile
            // (blurry, like before), it can no longer go blank. If
            // Network tab shows real sharper 200 responses at z19/20
            // for real addresses, keep this value. If it's mostly
            // 404s/re-served z18 data, revert to 18 — don't leave this
            // at 20 without checking real results first.
            url={`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=${mapboxToken}`}
            maxZoom={21}
            maxNativeZoom={20}
          />
          <MapReadyFixer />
          <ClickCapture onPoint={(p) => setPoints((prev) => [...prev, p])} />
          {points.map((p, i) => (
            <CircleMarker key={i} center={[p.lat, p.lon]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0f766e', fillOpacity: 1 }} />
          ))}
          {points.length >= 2 && (
            <Polygon positions={points.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: '#0f766e', weight: 3, fillOpacity: 0.25 }} />
          )}
        </MapContainer>

        {/* Floating instruction banner — same copy as before, now
            overlaid on the map itself (matches the reference UX)
            instead of living below it. Only shown before any points
            are placed, same condition as before. */}
        {points.length === 0 && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
            Tap around the edges of the area you&apos;d like cleaned
          </div>
        )}
        {points.length > 0 && points.length < 3 && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
            Add at least {3 - points.length} more point{3 - points.length === 1 ? '' : 's'} to close the shape
          </div>
        )}
      </div>

      {/* Bottom control panel — floats over the map like the reference
          UX, rather than sitting in normal document flow below a small
          box. Same buttons/handlers/state as before, just repositioned. */}
      <div className="border-t border-slate-800 bg-white px-4 py-3 sm:px-6 sm:py-4">
        {canFinish && !tooSmall && (
          <p className="text-sm font-medium text-slate-700">
            Approximate area: <span className="font-semibold">{Math.round(area).toLocaleString()} sq ft</span>
          </p>
        )}
        {tooSmall && (
          <p className="text-sm text-amber-600">That area looks too small — please check your outline, or add a couple more points to capture the full area.</p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPoints((prev) => prev.slice(0, -1))}
            disabled={points.length === 0}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-40"
          >
            Clear
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600">
            Not sure how to measure?
          </button>
          <button
            type="button"
            onClick={() => onComplete(Math.round(area), points)}
            disabled={!canFinish || tooSmall}
            className="ml-auto rounded-lg bg-[var(--color-brand,#0f766e)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Use This Measurement
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-400">This measurement is approximate.</p>
      </div>
    </div>
  );
}
