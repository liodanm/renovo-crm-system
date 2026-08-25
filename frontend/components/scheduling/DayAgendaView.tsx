'use client';

import { MapPin, Plus } from 'lucide-react';
import {
  appointmentCustomerName,
  appointmentTypeStyle,
  APPOINTMENT_STATUS_LABELS,
  type CalendarAppointment,
} from '../../lib/api/scheduling';
import { WeatherDayBadge } from './WeatherDayBadge';
import { cn } from '../../lib/utils';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * "What do I have to do today?" — a chronological, scannable agenda,
 * not another hourly grid. Deliberately Day-view-only: Week and Month
 * keep TimeGridView/MonthView exactly as they were, per the explicit
 * instruction not to redesign those. Every piece of data here comes
 * from the same `appointments` array the page already fetched for
 * Day view — no new API call, all derivation happens client-side.
 */
export function DayAgendaView({
  date,
  appointments,
  onSelect,
  onCreate,
}: {
  date: Date;
  appointments: CalendarAppointment[];
  onSelect: (a: CalendarAppointment) => void;
  onCreate: () => void;
}) {
  const now = new Date();
  const today = appointments
    .filter((a) => isSameDay(new Date(a.startsAt), date))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const viewingToday = isSameDay(date, now);
  // "Cancelled appointments remain visibly identifiable... should not
  // be treated as upcoming" — excluded from Up Next/Now, never from
  // the list itself.
  const active = today.filter((a) => a.status !== 'cancelled');
  const current = viewingToday ? active.find((a) => new Date(a.startsAt) <= now && now <= new Date(a.endsAt) && a.status !== 'completed') : undefined;
  const upNext = viewingToday ? active.find((a) => new Date(a.startsAt) > now) : undefined;

  const jobCount = today.filter((a) => a.appointmentType === 'job').length;
  const typeCounts = today.reduce<Record<string, number>>((acc, a) => {
    if (a.appointmentType !== 'job') acc[a.appointmentType] = (acc[a.appointmentType] ?? 0) + 1;
    return acc;
  }, {});
  const summaryParts = [
    `${today.length} Appointment${today.length === 1 ? '' : 's'}`,
    jobCount > 0 && `${jobCount} Job${jobCount === 1 ? '' : 's'}`,
    ...Object.entries(typeCounts).map(([type, count]) => `${count} ${appointmentTypeStyle(type).label}${count === 1 ? '' : 's'}`),
  ].filter(Boolean);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {viewingToday && <span className="ml-2 rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-brand)]">Today</span>}
          </h2>
          {today.length > 0 && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{summaryParts.join(' • ')}</p>}
        </div>
        <button onClick={onCreate} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Calendar Item
        </button>
      </div>

      {today.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">No appointments scheduled for {viewingToday ? 'today' : 'this day'}.</p>
        </div>
      )}

      {viewingToday && today.length > 0 && (
        <div className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand)]/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)]">Up Next</p>
          {upNext ? (
            <div className="mt-1.5">
              <AgendaCardContent appointment={upNext} compact />
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up for today.</p>
          )}
        </div>
      )}

      {today.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Today&apos;s Schedule</p>
          <div className="space-y-2">
            {today.map((a) => (
              <AgendaCard key={a.id} appointment={a} isCurrent={a.id === current?.id} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaCard({ appointment, isCurrent, onSelect }: { appointment: CalendarAppointment; isCurrent: boolean; onSelect: (a: CalendarAppointment) => void }) {
  const isCancelled = appointment.status === 'cancelled';
  return (
    <button
      onClick={() => onSelect(appointment)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-white dark:bg-slate-900 p-3.5 text-left transition hover:border-[var(--color-brand)]/40',
        isCurrent ? 'border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]' : 'border-slate-200 dark:border-slate-800',
        isCancelled && 'opacity-60',
      )}
    >
      <div className="w-16 shrink-0 pt-0.5">
        {isCurrent && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--color-brand)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" /> NOW</p>}
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatTime(appointment.startsAt)}</p>
      </div>
      <AgendaCardContent appointment={appointment} />
    </button>
  );
}

/**
 * The actual content row — shared between the full list card and the
 * Up Next card so the two never drift into two different layouts for
 * the same data.
 */
function AgendaCardContent({ appointment, compact }: { appointment: CalendarAppointment; compact?: boolean }) {
  const style = appointmentTypeStyle(appointment.appointmentType);
  const isJob = appointment.appointmentType === 'job';
  const customerLine = isJob ? null : appointment.customerId ? appointmentCustomerName(appointment) : null;
  const address = appointment.propertyAddressLine1 ? `${appointment.propertyAddressLine1}, ${appointment.propertyCity}` : appointment.location;
  const showWeather = isJob && appointment.propertyLatitude && appointment.propertyLongitude;
  const isCancelled = appointment.status === 'cancelled';

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 truncate font-medium text-slate-900 dark:text-slate-100">
          <span aria-hidden>{style.icon}</span>
          {isJob ? appointment.title : style.label}
        </p>
        {showWeather && (
          <div className="shrink-0">
            <WeatherDayBadge latitude={Number(appointment.propertyLatitude)} longitude={Number(appointment.propertyLongitude)} />
          </div>
        )}
      </div>
      {customerLine && <p className="truncate text-sm text-slate-600 dark:text-slate-400">{customerLine}</p>}
      {isJob && <p className="truncate text-sm text-slate-600 dark:text-slate-400">{appointmentCustomerName(appointment)}</p>}
      {address && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400 dark:text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" /> {address}
        </p>
      )}
      {!compact && (
        <p className={cn('mt-1 text-xs font-medium', isCancelled ? 'text-red-500' : 'text-slate-400 dark:text-slate-500')}>
          {APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status}
        </p>
      )}
    </div>
  );
}
