'use client';

import { useState } from 'react';
import { appointmentCustomerName, APPOINTMENT_STATUS_COLORS, schedulingApi, type CalendarAppointment } from '../../lib/api/scheduling';
import { WeatherDayBadge } from './WeatherDayBadge';
import { cn } from '../../lib/utils';

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 19; // 7am - 7pm, the real working window most pressure-washing jobs fall inside
const HOUR_HEIGHT_PX = 56;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

interface TimeGridViewProps {
  appointments: CalendarAppointment[];
  days: Date[]; // 1 day for Day view, 7 for Week view
  onSelect: (a: CalendarAppointment) => void;
  onRescheduled: () => void;
}

/**
 * Shared by both Day and Week views — the only real difference between
 * them is how many day columns render. Drag-and-drop is desktop-first by
 * design: native HTML5 DnD doesn't fire reliably from touch, and faking
 * it well is real, separate engineering. On a phone, tapping an
 * appointment opens the detail panel where Reschedule is already a big,
 * one-tap action — that's the mobile-appropriate equivalent, not a
 * degraded drag experience.
 */
export function TimeGridView({ appointments, days, onSelect, onRescheduled }: TimeGridViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: string; hour: number } | null>(null);
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const today = startOfDay(new Date()).getTime();

  async function handleDrop(day: Date, hour: number) {
    setDropTarget(null);
    if (!draggingId) return;
    const appointment = appointments.find((a) => a.id === draggingId);
    setDraggingId(null);
    if (!appointment) return;

    const originalStart = new Date(appointment.startsAt);
    const originalEnd = new Date(appointment.endsAt);
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(day);
    newStart.setHours(hour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Optimistic-feeling: fire the request, then refresh from the server
    // rather than guessing the merged shape — a reschedule can also
    // touch the linked job, so re-fetching is the honest source of truth.
    await schedulingApi.reschedule(appointment.id, { startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() });
    onRescheduled();
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex min-w-[600px]">
        {/* Hour labels column */}
        <div className="w-14 shrink-0 border-r border-slate-100 dark:border-slate-800 pt-8">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_HEIGHT_PX }} className="pr-2 text-right text-[11px] text-slate-400 dark:text-slate-500">
              {h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'am' : 'pm'}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayKey = day.toISOString();
          const isToday = startOfDay(day).getTime() === today;
          const dayAppointments = appointments.filter((a) => startOfDay(new Date(a.startsAt)).getTime() === startOfDay(day).getTime());
          const primaryProperty = dayAppointments.find((a) => a.propertyLatitude);

          return (
            <div key={dayKey} className="relative flex-1 border-r border-slate-100 dark:border-slate-800 last:border-r-0">
              <div className={cn('flex h-8 items-center justify-center gap-1.5 border-b border-slate-100 dark:border-slate-800 text-xs font-medium', isToday ? 'text-[var(--color-brand)]' : 'text-slate-600 dark:text-slate-400')}>
                <span>{day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                {primaryProperty && <WeatherDayBadge latitude={Number(primaryProperty.propertyLatitude)} longitude={Number(primaryProperty.propertyLongitude)} />}
              </div>

              <div className="relative">
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT_PX }}
                    className={cn('border-b border-slate-50', dropTarget?.day === dayKey && dropTarget.hour === h && 'bg-[var(--color-brand)]/10')}
                    onDragOver={(e) => { e.preventDefault(); setDropTarget({ day: dayKey, hour: h }); }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => { e.preventDefault(); handleDrop(day, h); }}
                  />
                ))}

                {dayAppointments.map((a) => {
                  const start = new Date(a.startsAt);
                  const end = new Date(a.endsAt);
                  const startOffset = Math.max(0, (start.getHours() - GRID_START_HOUR) * 60 + start.getMinutes());
                  const durationMin = Math.max(30, (end.getTime() - start.getTime()) / 60000);
                  const top = (startOffset / 60) * HOUR_HEIGHT_PX;
                  const height = (durationMin / 60) * HOUR_HEIGHT_PX;

                  const isCalendarItem = a.appointmentType !== 'job';
                  return (
                    <button
                      key={a.id}
                      draggable
                      onDragStart={() => setDraggingId(a.id)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => onSelect(a)}
                      style={{ top, height: Math.max(height, 24), left: 2, right: 2 }}
                      className={cn(
                        'absolute z-[1] cursor-grab overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] text-white shadow-sm active:cursor-grabbing',
                        APPOINTMENT_STATUS_COLORS[a.status] ?? 'bg-slate-400',
                        // Calendar Items get a dashed left edge — visually
                        // distinct from a solid-bordered Job at a glance,
                        // without introducing a whole second color scheme
                        // that would compete with the existing
                        // status-based coloring this calendar already
                        // relies on.
                        isCalendarItem && 'border-l-2 border-dashed border-white/70',
                        draggingId === a.id && 'opacity-50',
                      )}
                    >
                      <p className="truncate font-medium">{isCalendarItem ? a.title : appointmentCustomerName(a)}</p>
                      <p className="truncate opacity-90">
                        {isCalendarItem && a.customerId ? appointmentCustomerName(a) + ' · ' : ''}
                        {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
