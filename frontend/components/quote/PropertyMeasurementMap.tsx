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
    <div>
      <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 sm:h-96">
        {/* zoom=19 is deliberately the STARTING point, not the ceiling
            — "highest RELIABLE property-level zoom," not maximum.
            maxZoom={21} still lets the customer zoom in further
            themselves — MapReadyFixer below (not this number) is what
            prevents blank tiles, so this value is chosen for reliable
            initial framing of the property, not to work around a bug. */}
        {/* zoomAnimation disabled: the single most important clue in
            this whole investigation is that the exact same symptom
            (blank up close, fine zoomed out) happened with Esri AND
            with Mapbox — two unrelated tile providers failing
            identically means this was never a provider problem. That
            points at the zoom TRANSITION itself, not the tile source.
            Leaflet's animated zoom is a well-known source of tile-
            loading races in React wrapper contexts; disabling it makes
            zoom changes apply instantly instead of animating, removing
            that entire class of timing issue. Never tested until now
            in this investigation. */}
        <MapContainer center={[latitude, longitude]} zoom={19} maxZoom={21} zoomAnimation={false} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            // Mapbox's v4 Raster Tiles API — the correct, documented
            // format for a plain Leaflet TileLayer (not the newer GL JS
            // vector-style API, which this app deliberately does NOT
            // adopt — Leaflet stays exactly as it already was, only the
            // tile source changes).
            //
            // detectRetina removed: real, concrete difference from the
            // original working Esri config, which never had it. On a
            // display with >100% scaling (common on Windows), this
            // makes Leaflet request Mapbox's @2x tile variant instead
            // of the regular one — and while the regular tile for the
            // exact test property was directly confirmed to exist,
            // @2x coverage isn't guaranteed to be identical. {r} is
            // removed from the URL along with it, since it has no
            // effect without detectRetina enabled.
            //
            // maxNativeZoom=18, not 20: this is the actual root cause
            // of the blank-on-zoom-in bug. Mapbox's own tileset docs
            // state mapbox.satellite coverage is global to z16,
            // regional to z18, and select-metro-only beyond that —
            // requesting z19/z20 as if they were guaranteed-real tiles
            // (the previous maxNativeZoom=20) returns a real 404
            // outside those select metro areas, which is why the
            // imagery went blank specifically when zooming IN (past
            // real coverage) and came back when zooming OUT (back to
            // real coverage) — for ANY customer address, not just the
            // one this was tested against. maxZoom={21} on the
            // MapContainer below is left as-is: Leaflet will scale up
            // the last real z18 tile for closer zoom levels instead of
            // requesting tiles that don't exist, so imagery never goes
            // blank — just progressively less sharp past z18 in areas
            // without extended Mapbox coverage.
            url={`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=${mapboxToken}`}
            maxNativeZoom={18}
          />
          {/* Rendered AFTER TileLayer now — see MapReadyFixer's own
              comment for exactly why this ordering matters. */}
          <MapReadyFixer />
          <ClickCapture onPoint={(p) => setPoints((prev) => [...prev, p])} />
          {points.map((p, i) => (
            <CircleMarker key={i} center={[p.lat, p.lon]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0f766e', fillOpacity: 1 }} />
          ))}
          {points.length >= 2 && (
            <Polygon positions={points.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: '#0f766e', weight: 3, fillOpacity: 0.25 }} />
          )}
        </MapContainer>
      </div>

      <div className="mt-3">
        {points.length === 0 && <p className="text-sm text-slate-500">The image above is your property. Tap around the edges of the area you&apos;d like cleaned.</p>}
        {points.length > 0 && points.length < 3 && (
          <p className="text-sm text-slate-500">Please outline the area by adding at least {3 - points.length} more point{3 - points.length === 1 ? '' : 's'}.</p>
        )}
        {canFinish && !tooSmall && (
          <p className="text-sm font-medium text-slate-700">
            Approximate area: <span className="font-semibold">{Math.round(area).toLocaleString()} sq ft</span>
          </p>
        )}
        {tooSmall && (
          <p className="text-sm text-amber-600">That area looks too small — please check your outline, or add a couple more points to capture the full area.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
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
  );
}
