'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapProperty } from '../../lib/api/dashboard';

// react-leaflet's default marker icon references image paths that don't
// survive Next.js's bundler resolution. Using CircleMarker (pure SVG, no
// image asset) sidesteps that entirely rather than patching L.Icon.Default,
// which is why `leaflet` itself is never imported here.

const LEAD_STATUS_COLOR: Record<string, string> = {
  lead: '#f59e0b', // amber — needs attention
  active: '#0e7490', // brand teal
  inactive: '#94a3b8',
  churned: '#ef4444',
};

export function CustomerMapInner({ properties }: { properties: MapProperty[] }) {
  const center: [number, number] =
    properties.length > 0
      ? [
          properties.reduce((s, p) => s + p.latitude, 0) / properties.length,
          properties.reduce((s, p) => s + p.longitude, 0) / properties.length,
        ]
      : [39.8283, -98.5795]; // geographic center of the contiguous US — only used when there's no data to center on

  return (
    <MapContainer center={center} zoom={properties.length > 0 ? 11 : 4} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {properties.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={7}
          pathOptions={{
            color: LEAD_STATUS_COLOR[p.leadStatus] ?? '#0e7490',
            fillColor: LEAD_STATUS_COLOR[p.leadStatus] ?? '#0e7490',
            fillOpacity: 0.75,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-medium">{p.customerName}</div>
              <div className="text-slate-500">{p.address}</div>
              {p.lastJobStatus && (
                <div className="mt-1 text-xs text-slate-400">Last job: {p.lastJobStatus.replace('_', ' ')}</div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
