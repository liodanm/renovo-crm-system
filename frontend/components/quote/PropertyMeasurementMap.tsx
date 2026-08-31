'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { polygonAreaSqFt, type LatLon } from '../../lib/geometry';

function ClickCapture({ onPoint }: { onPoint: (p: LatLon) => void }) {
  useMapEvents({
    click: (e) => onPoint({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

/**
 * Polygon-only for this phase, per the approved plan — linear/point
 * measurement modes are a future extension of this same component, not
 * built yet. Renders on top of Esri World Imagery (free, no API key —
 * see the final report for the licensing check performed before using
 * it here), not the OSM street tiles Scheduling's map uses, since a
 * homeowner needs to visually recognize their driveway/patio/pool deck,
 * which a street map can't show.
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

  return (
    <div>
      <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 sm:h-96">
        <MapContainer center={[latitude, longitude]} zoom={19} maxZoom={21} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution="Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            // Real bug this fixes: Esri's free World Imagery tiles only
            // have actual image data up to roughly this zoom level for
            // most residential areas — zooming in further (which the
            // map's own maxZoom={21} above still allows, for a bigger
            // on-screen view while outlining) was requesting tiles that
            // don't exist, rendering blank/gray. maxNativeZoom tells
            // Leaflet to stop fetching past this level and instead
            // stretch the last real tile it has, so the customer always
            // sees imagery — just less sharp past this point — never a
            // blank map.
            maxNativeZoom={19}
          />
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
