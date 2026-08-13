'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { appointmentCustomerName, APPOINTMENT_STATUS_COLORS, type CalendarAppointment } from '../../lib/api/scheduling';

export function ScheduleMapInner({ appointments, onSelect }: { appointments: CalendarAppointment[]; onSelect: (a: CalendarAppointment) => void }) {
  const withCoords = appointments.filter((a) => a.propertyLatitude && a.propertyLongitude);

  const center: [number, number] =
    withCoords.length > 0
      ? [
          withCoords.reduce((s, a) => s + Number(a.propertyLatitude), 0) / withCoords.length,
          withCoords.reduce((s, a) => s + Number(a.propertyLongitude), 0) / withCoords.length,
        ]
      : [39.8283, -98.5795];

  return (
    <MapContainer center={center} zoom={withCoords.length > 0 ? 11 : 4} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {withCoords.map((a) => {
        // Convert Tailwind's bg-* class to a real hex value Leaflet can
        // use directly — the calendar chips already carry this mapping,
        // this just needs the actual color rather than a class name.
        const colorClass = APPOINTMENT_STATUS_COLORS[a.status] ?? 'bg-slate-400';
        const hex = STATUS_HEX[colorClass] ?? '#94a3b8';
        return (
          <CircleMarker
            key={a.id}
            center={[Number(a.propertyLatitude), Number(a.propertyLongitude)]}
            radius={8}
            pathOptions={{ color: hex, fillColor: hex, fillOpacity: 0.8, weight: 2 }}
            eventHandlers={{ click: () => onSelect(a) }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{appointmentCustomerName(a)}</div>
                <div className="text-slate-500 dark:text-slate-400">{a.propertyAddressLine1}, {a.propertyCity}</div>
                <div className="text-slate-500 dark:text-slate-400">{new Date(a.startsAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

const STATUS_HEX: Record<string, string> = {
  'bg-blue-500': '#3b82f6',
  'bg-cyan-500': '#06b6d4',
  'bg-emerald-500': '#10b981',
  'bg-red-400': '#f87171',
  'bg-amber-500': '#f59e0b',
};
