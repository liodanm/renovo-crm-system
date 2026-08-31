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
  onComplete,
  onCancel,
}: {
  latitude: number;
  longitude: number;
  onComplete: (areaSqFt: number, points: LatLon[]) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<LatLon[]>([]);
  const area = polygonAreaSqFt(points);
  const canFinish = points.length >= 3;

  return (
    <div>
      <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 sm:h-96">
        <MapContainer center={[latitude, longitude]} zoom={20} maxZoom={21} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution="Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
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
        {points.length === 0 && <p className="text-sm text-slate-500">Tap each corner of the area you&apos;d like cleaned.</p>}
        {points.length > 0 && points.length < 3 && (
          <p className="text-sm text-slate-500">Tap {3 - points.length} more corner{3 - points.length === 1 ? '' : 's'}.</p>
        )}
        {canFinish && (
          <p className="text-sm font-medium text-slate-700">
            Estimated area: <span className="font-semibold">{Math.round(area).toLocaleString()} sq ft</span>
          </p>
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
          disabled={!canFinish}
          className="ml-auto rounded-lg bg-[var(--color-brand,#0f766e)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Finish Measuring
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">Satellite measurement is approximate.</p>
    </div>
  );
}
