'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, UserPlus, FileText, CalendarPlus, AlertTriangle } from 'lucide-react';
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
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * "What do I have to do today?" — a chronological, scannable agenda,
 * not another hourly grid. Deliberately Day-view-only: Week and Month
 * (TimeGridView/MonthView) are completely untouched by this file.
 * Every derived value (progress, Up Next, overlaps, past-due) comes
 * from the same `appointments` array the page already fetched — no
 * new API call anywhere in this component.
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
  const router = useRouter();
  const now = new Date();
  const today = appointments
    .filter((a) => isSameDay(new Date(a.startsAt), date))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const viewingToday = isSameDay(date, now);
  const isPast = !viewingToday && startOfDay(date) < startOfDay(now);
  const isFuture = !viewingToday && startOfDay(date) > startOfDay(now);

  const active = today.filter((a) => a.status !== 'cancelled');
  const cancelledCount = today.length - active.length;
  const completed = active.filter((a) => a.status === 'completed');
  const current = viewingToday ? active.find((a) => new Date(a.startsAt) <= now && now <= new Date(a.endsAt) && a.status !== 'completed') : undefined;
  const upNext = viewingToday ? active.find((a) => new Date(a.startsAt) > now && a.status !== 'completed') : undefined;
  const todayIsComplete = viewingToday && active.length > 0 && !current && !upNext;

  // Overlap detection — pure visibility, no conflict resolution: any
  // two active appointments whose [start, end) ranges intersect.
  const overlapIds = new Set<string>();
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const [s1, e1] = [new Date(active[i].startsAt).getTime(), new Date(active[i].endsAt).getTime()];
      const [s2, e2] = [new Date(active[j].startsAt).getTime(), new Date(active[j].endsAt).getTime()];
      if (s1 < e2 && s2 < e1) {
        overlapIds.add(active[i].id);
        overlapIds.add(active[j].id);
      }
    }
  }

  const jobCount = today.filter((a) => a.appointmentType === 'job').length;
  const typeCounts = today.reduce<Record<string, number>>((acc, a) => {
    if (a.appointmentType !== 'job') acc[a.appointmentType] = (acc[a.appointmentType] ?? 0) + 1;
    return acc;
  }, {});
  const summaryParts = [
    `${today.length} appointment${today.length === 1 ? '' : 's'}`,
    jobCount > 0 && `${jobCount} job${jobCount === 1 ? '' : 's'}`,
    ...Object.entries(typeCounts).map(([type, count]) => `${count} ${appointmentTypeStyle(type).label.toLowerCase()}${count === 1 ? '' : 's'}`),
  ].filter(Boolean);

  // Progress only means something for today — a historical day is
  // either fully in the past (nothing left to "progress" toward) and a
  // future day hasn't started, so both get plain counts instead (see
  // the summary line below and Section 17/18 in the spec).
  const progressTotal = active.length;
  const progressPct = progressTotal > 0 ? Math.round((completed.length / progressTotal) * 100) : 0;

  return (
    <div className="mt-4 space-y-4">
      {/* ---- Header ---- */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {viewingToday && <span className="ml-2 rounded-full bg-[var(--color-brand)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-brand)] dark:text-blue-400">Today</span>}
        </h2>
        {today.length > 0 && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {summaryParts.join(' · ')}
            {cancelledCount > 0 && <span className="text-slate-400 dark:text-slate-500"> · {cancelledCount} cancelled</span>}
          </p>
        )}
      </div>

      {/* ---- Quick Actions — labels match the global Add New+ menu exactly ---- */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => router.push('/customers?new=true')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
          <UserPlus className="h-3.5 w-3.5" /> Customer
        </button>
        <button onClick={() => router.push('/estimates/new')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
          <FileText className="h-3.5 w-3.5" /> Estimate
        </button>
        <button onClick={onCreate} className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-xs font-medium text-white hover:opacity-90">
          <CalendarPlus className="h-3.5 w-3.5" /> Calendar Item
        </button>
      </div>

      {/* ---- Today's Progress — today only ---- */}
      {viewingToday && progressTotal > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <p className="font-medium text-slate-700 dark:text-slate-300">Today&apos;s Progress</p>
            <p className="text-slate-500 dark:text-slate-400">{completed.length} of {progressTotal} completed</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-[var(--color-brand)] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* ---- Empty day ---- */}
      {today.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">No appointments scheduled for {viewingToday ? 'today' : 'this day'}.</p>
          <button onClick={onCreate} className="mt-3 rounded-lg bg-[var(--color-brand)] px-3 py-2 text-xs font-medium text-white hover:opacity-90">
            + Calendar Item
          </button>
        </div>
      )}

      {/* ---- Up Next / Now / Today Complete — today only ---- */}
      {viewingToday && today.length > 0 && (
        <div className={cn('rounded-xl border p-4', current ? 'border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5' : 'border-[var(--color-brand)]/30 bg-[var(--color-brand)]/5')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)] dark:text-blue-400">{current ? 'Now' : upNext ? 'Up Next' : 'Today Complete'}</p>
          {(current ?? upNext) ? (
            <div className="mt-1.5">
              <AgendaCardContent appointment={(current ?? upNext)!} overlapping={overlapIds.has((current ?? upNext)!.id)} isToday compact />
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up.</p>
          )}
        </div>
      )}

      {/* ---- Chronological list ---- */}
      {today.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {isPast ? 'Schedule' : isFuture ? 'Scheduled Appointments' : "Today's Schedule"}
          </p>
          <div className="space-y-2">
            {today.map((a) => (
              <AgendaCard key={a.id} appointment={a} isCurrent={a.id === current?.id} isToday={viewingToday} overlapping={overlapIds.has(a.id)} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaCard({
  appointment,
  isCurrent,
  isToday,
  overlapping,
  onSelect,
}: {
  appointment: CalendarAppointment;
  isCurrent: boolean;
  isToday: boolean;
  overlapping: boolean;
  onSelect: (a: CalendarAppointment) => void;
}) {
  const isCancelled = appointment.status === 'cancelled';
  return (
    <div
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border bg-white dark:bg-slate-900 p-3.5 transition',
        isCurrent ? 'border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]' : 'border-slate-200 dark:border-slate-800',
        isCancelled && 'opacity-60',
      )}
    >
      <button onClick={() => onSelect(appointment)} className="w-16 shrink-0 pt-0.5 text-left">
        {isCurrent && <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--color-brand)] dark:text-blue-400"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] dark:bg-blue-400" /> NOW</p>}
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatTime(appointment.startsAt)}</p>
      </button>
      <button onClick={() => onSelect(appointment)} className="min-w-0 flex-1 text-left">
        <AgendaCardContent appointment={appointment} overlapping={overlapping} isToday={isToday} />
      </button>
    </div>
  );
}

/**
 * The actual content — shared between the Up Next card and every list
 * card, so both stay in sync automatically rather than drifting into
 * two layouts for the same data. Time is deliberately NOT rendered
 * here (the parent renders it once, differently, for the list vs the
 * Up Next card) to avoid a duplicated time label in Up Next.
 */
function AgendaCardContent({ appointment, overlapping, isToday, compact }: { appointment: CalendarAppointment; overlapping: boolean; isToday: boolean; compact?: boolean }) {
  const style = appointmentTypeStyle(appointment.appointmentType);
  const isJob = appointment.appointmentType === 'job';
  const isCancelled = appointment.status === 'cancelled';
  const isCompleted = appointment.status === 'completed';
  const customerLine = isJob ? null : appointment.customerId ? appointmentCustomerName(appointment) : null;
  const address = appointment.propertyAddressLine1 ? `${appointment.propertyAddressLine1}, ${appointment.propertyCity}` : appointment.location;
  const showWeather = isJob && appointment.propertyLatitude && appointment.propertyLongitude;
  // Past-due is display-only, today-only — never touches actual status.
  const isPastDue = isToday && !isCancelled && !isCompleted && new Date(appointment.endsAt) < new Date();

  return (
    <div>
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
      {customerLine && (
        <Link href={`/customers/${appointment.customerId}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm text-slate-600 dark:text-slate-400 hover:text-[var(--color-brand)] dark:hover:text-blue-400">
          {customerLine}
        </Link>
      )}
      {isJob && appointment.customerId && (
        <Link href={`/customers/${appointment.customerId}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm text-slate-600 dark:text-slate-400 hover:text-[var(--color-brand)] dark:hover:text-blue-400">
          {appointmentCustomerName(appointment)}
        </Link>
      )}
      {address && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400 dark:text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" /> {address}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('text-xs font-medium', isCancelled ? 'text-red-500' : isPastDue ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500')}>
          {isPastDue ? 'Running late' : APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status}
        </span>
        {overlapping && (
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Overlaps with another appointment
          </span>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex gap-3">
          {isJob && appointment.jobId && (
            <Link href={`/jobs/${appointment.jobId}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-[var(--color-brand)] dark:text-blue-400 hover:underline">
              View Job
            </Link>
          )}
          {!isJob && appointment.estimateId && (
            <Link href={`/estimates/${appointment.estimateId}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-[var(--color-brand)] dark:text-blue-400 hover:underline">
              View Estimate
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
