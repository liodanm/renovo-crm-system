'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { AppointmentDetailPanel } from '../../components/scheduling/AppointmentDetailPanel';
import { RescheduleModal } from '../../components/scheduling/RescheduleModal';
import { TimeGridView } from '../../components/scheduling/TimeGridView';
import { DayAgendaView } from '../../components/scheduling/DayAgendaView';
import { CalendarItemModal } from '../../components/scheduling/CalendarItemModal';
import {
  schedulingApi,
  appointmentCustomerName,
  APPOINTMENT_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  type CalendarAppointment,
} from '../../lib/api/scheduling';
import { cn } from '../../lib/utils';

// Leaflet touches `window` at import time — ssr:false is required the
// same way the dashboard's customer map already handles this.
const ScheduleMapInner = dynamic(() => import('../../components/scheduling/ScheduleMapInner').then((m) => m.ScheduleMapInner), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-slate-400 dark:text-slate-500">Loading map…</div>,
});

type ViewMode = 'day' | 'week' | 'month' | 'map';

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function rangeForView(anchor: Date, view: ViewMode): { start: Date; end: Date } {
  if (view === 'day') return { start: startOfDay(anchor), end: addDays(startOfDay(anchor), 1) };
  if (view === 'week') return { start: startOfWeek(anchor), end: addDays(startOfWeek(anchor), 7) };
  if (view === 'month') {
    const monthStart = startOfMonth(anchor);
    const gridStart = startOfWeek(monthStart);
    return { start: gridStart, end: addDays(gridStart, 42) };
  }
  // Map view: current week's worth of appointments, a reasonable default
  // scope for "what's on the map right now" without pulling the entire
  // history.
  return { start: startOfWeek(anchor), end: addDays(startOfWeek(anchor), 7) };
}

export default function SchedulingPage() {
  return (
    <Suspense fallback={null}>
      <SchedulingPageInner />
    </Suspense>
  );
}

function SchedulingPageInner() {
  const searchParams = useSearchParams();
  // Customer context fix: Customer Detail's "Schedule Appointment" link
  // now passes ?customerId=..., and this page reads it once on mount so
  // the create-appointment flow opens with that customer already
  // selected — the user should never have to search for the same
  // customer again right after leaving their profile.
  const contextCustomerId = searchParams.get('customerId');

  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [rescheduling, setRescheduling] = useState<CalendarAppointment | null>(null);
  // Root-cause fix: this is the state that was always missing. Nothing
  // on the calendar previously had anywhere to write a "the user wants
  // to create something starting around this date/time" intent to —
  // every click handler that existed only ever opened an EXISTING
  // appointment. This holds that intent until the create form opens.
  const [creatingAt, setCreatingAt] = useState<{ date: Date; hour?: number } | null>(null);

  // Mobile improvement: a 7-column week grid or 42-cell month grid is
  // genuinely hard to use on a phone-width screen. Day view — one column,
  // full width, real touch targets — is what the calendar actually opens
  // to below the sm breakpoint, without removing the other views for
  // anyone who wants them.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setView('day');
    }
  }, []);

  const { start, end } = rangeForView(anchor, view);
  const { data: appointments, mutate, error, isLoading } = useSWR(
    ['calendar', start.toISOString(), end.toISOString(), statusFilter, search],
    () => schedulingApi.getCalendar({ start: start.toISOString(), end: end.toISOString(), status: statusFilter || undefined, search: search || undefined }),
  );

  function navigate(direction: -1 | 1) {
    if (view === 'day') setAnchor((a) => addDays(a, direction));
    else if (view === 'month') setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + direction, 1));
    else setAnchor((a) => addDays(a, direction * 7));
  }

  const rangeLabel = useMemo(() => {
    if (view === 'day') return anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (view === 'month') return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(start, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }, [anchor, view, start]);

  function refreshAfterChange() {
    mutate();
    setSelected(null);
    setRescheduling(null);
    setCreatingAt(null);
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Schedule</h1>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            {(['day', 'week', 'month', 'map'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn('shrink-0 rounded-md px-3 py-1.5 text-sm font-medium capitalize', view === v ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-lg border border-slate-300 dark:border-slate-700 p-2 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800" aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[180px] text-sm font-medium text-slate-700 dark:text-slate-300">{rangeLabel}</span>
            <button onClick={() => navigate(1)} className="rounded-lg border border-slate-300 dark:border-slate-700 p-2 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800" aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
              Today
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer or address"
                className="rounded-lg border border-slate-300 dark:border-slate-700 py-3 pl-8 pr-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
              <option value="">All statuses</option>
              {Object.entries(APPOINTMENT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>}
        {error && <div className="mt-8 text-center text-sm text-red-600 dark:text-red-400">Couldn't load the calendar.</div>}

        {appointments && view === 'day' && (
          <DayAgendaView date={anchor} appointments={appointments} onSelect={setSelected} onCreate={() => setCreatingAt({ date: anchor, hour: 9 })} onViewMap={() => setView('map')} />
        )}
        {appointments && view === 'week' && <TimeGridView appointments={appointments} days={Array.from({ length: 7 }, (_, i) => addDays(start, i))} onSelect={setSelected} onRescheduled={refreshAfterChange} onCreateAt={(date, hour) => setCreatingAt({ date, hour })} />}
        {appointments && view === 'month' && <MonthView appointments={appointments} gridStart={start} monthAnchor={anchor} onSelect={setSelected} onCreateAt={(date) => setCreatingAt({ date })} />}
        {appointments && view === 'map' && (
          <div className="mt-4 h-[600px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <ScheduleMapInner appointments={appointments} onSelect={setSelected} />
          </div>
        )}
      </main>

      {selected && (
        <AppointmentDetailPanel
          appointment={selected}
          onClose={() => setSelected(null)}
          onChanged={refreshAfterChange}
          onOpenReschedule={() => setRescheduling(selected)}
        />
      )}
      {rescheduling && <RescheduleModal appointment={rescheduling} onClose={() => setRescheduling(null)} onRescheduled={refreshAfterChange} />}
      {creatingAt && (
        <CalendarItemModal
          initialDate={creatingAt.date}
          initialHour={creatingAt.hour}
          initialCustomerId={contextCustomerId ?? undefined}
          onClose={() => setCreatingAt(null)}
          onSaved={refreshAfterChange}
        />
      )}
    </AppShell>
  );
}

function AppointmentChip({ appointment, onSelect, compact }: { appointment: CalendarAppointment; onSelect: (a: CalendarAppointment) => void; compact?: boolean }) {
  const time = new Date(appointment.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const isCalendarItem = appointment.appointmentType !== 'job';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(appointment); }}
      className={cn('flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-xs hover:opacity-90', isCalendarItem && 'border-l-2 border-dashed border-slate-300 dark:border-slate-600')}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', APPOINTMENT_STATUS_COLORS[appointment.status] ?? 'bg-slate-400')} />
      {!compact && <span className="shrink-0 text-slate-500 dark:text-slate-400">{time}</span>}
      <span className="truncate font-medium text-slate-800 dark:text-slate-100">{isCalendarItem ? appointment.title : appointmentCustomerName(appointment)}</span>
    </button>
  );
}

function MonthView({
  appointments,
  gridStart,
  monthAnchor,
  onSelect,
  onCreateAt,
}: {
  appointments: CalendarAppointment[];
  gridStart: Date;
  monthAnchor: Date;
  onSelect: (a: CalendarAppointment) => void;
  onCreateAt: (date: Date) => void;
}) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const currentMonth = monthAnchor.getMonth();

  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="px-1 text-xs font-medium text-slate-400 dark:text-slate-500">{d}</div>
      ))}
      {days.map((day) => {
        const dayAppointments = appointments.filter((a) => startOfDay(new Date(a.startsAt)).getTime() === startOfDay(day).getTime());
        const inMonth = day.getMonth() === currentMonth;
        return (
          <div
            key={day.toISOString()}
            onClick={() => onCreateAt(day)}
            className={cn('min-h-[90px] cursor-pointer rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 hover:border-[var(--color-brand)]/40', !inMonth && 'bg-slate-50 dark:bg-slate-800')}
          >
            <p className={cn('text-xs', inMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600')}>{day.getDate()}</p>
            <div className="mt-1 space-y-0.5">
              {dayAppointments.slice(0, 3).map((a) => (
                <AppointmentChip key={a.id} appointment={a} onSelect={onSelect} compact />
              ))}
              {dayAppointments.length > 3 && <p className="pl-1.5 text-[10px] text-slate-400 dark:text-slate-500">+{dayAppointments.length - 3} more</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
