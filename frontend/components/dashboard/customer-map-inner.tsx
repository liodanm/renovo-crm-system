'use client';

import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapProperty } from '../../lib/api/dashboard';
import { JOB_PRIORITY_LABELS, JOB_PRIORITY_COLORS } from '../../lib/api/jobs';

// react-leaflet's default marker icon references image paths that don't
// survive Next.js's bundler resolution. Using CircleMarker (pure SVG, no
// image asset) sidesteps that entirely rather than patching L.Icon.Default,
// which is why `leaflet` itself is never imported here.

const LEAD_STATUS_COLOR: Record<string, string> = {
  lead: '#f59e0b', // amber — needs attention
  active: '#11365F', // brand navy
  inactive: '#94a3b8',
  churned: '#ef4444',
};

// Priority takes visual precedence over lead status when a property's
// most recent job actually has one set — that's the whole point of the
// feature (making priority jobs visually obvious on the map). Lead
// status remains the fallback coloring for everything else, unchanged
// from before this feature existed.
function pinColor(p: MapProperty): string {
  if (p.lastJobPriority && p.lastJobPriority !== 'normal') return JOB_PRIORITY_COLORS[p.lastJobPriority].dot;
  return LEAD_STATUS_COLOR[p.leadStatus] ?? '#11365F';
}

export function CustomerMapInner({ properties }: { properties: MapProperty[] }) {
  const router = useRouter();

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
      {properties.map((p) => {
        const isUrgent = p.lastJobPriority === 'emergency' || p.lastJobPriority === 'high';
        return (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={isUrgent ? 9 : 7}
            pathOptions={{
              color: pinColor(p),
              fillColor: pinColor(p),
              fillOpacity: 0.75,
              weight: isUrgent ? 3 : 2,
            }}
            eventHandlers={{ click: () => router.push(`/customers/${p.customerId}`) }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{p.customerName}</div>
                <div className="text-slate-500 dark:text-slate-400">{p.address}</div>
                {p.lastJobPriority && p.lastJobPriority !== 'normal' && (
                  <div className="mt-1 text-xs font-medium" style={{ color: JOB_PRIORITY_COLORS[p.lastJobPriority].dot }}>
                    {JOB_PRIORITY_LABELS[p.lastJobPriority]}
                  </div>
                )}
                {p.lastJobStatus && (
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Last job: {p.lastJobStatus.replace('_', ' ')}</div>
                )}
                <div className="mt-1.5 text-xs text-[var(--color-brand)]">Click to view customer →</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
