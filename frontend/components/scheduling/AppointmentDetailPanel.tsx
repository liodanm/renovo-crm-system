'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Phone, Navigation, Play, CalendarClock, CalendarX, ExternalLink } from 'lucide-react';
import { dashboardApi, type WeatherSnapshot } from '../../lib/api/dashboard';
import { jobsApi, RECOMMENDABLE_SERVICE_LABELS } from '../../lib/api/jobs';
import {
  appointmentCustomerName,
  schedulingApi,
  APPOINTMENT_STATUS_LABELS,
  type CalendarAppointment,
} from '../../lib/api/scheduling';
import { ConfirmDialog } from '../action-center/ConfirmDialog';

interface AppointmentDetailPanelProps {
  appointment: CalendarAppointment;
  onClose: () => void;
  onChanged: () => void;
  onOpenReschedule: () => void;
}

function formatMoney(value: string | null): string {
  if (!value) return '—';
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWindow(startsAt: string, minutes: number): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function AppointmentDetailPanel({ appointment, onClose, onChanged, onOpenReschedule }: AppointmentDetailPanelProps) {
  const [weather, setWeather] = useState<WeatherSnapshot | null | undefined>(undefined);
  const [isActing, setIsActing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    setWeather(undefined);
    if (appointment.propertyLatitude && appointment.propertyLongitude) {
      dashboardApi
        .getWeather(Number(appointment.propertyLatitude), Number(appointment.propertyLongitude))
        .then(setWeather)
        .catch(() => setWeather(null));
    } else {
      setWeather(null);
    }
  }, [appointment.id, appointment.propertyLatitude, appointment.propertyLongitude]);

  const technicianName = appointment.technicianFirstName ? `${appointment.technicianFirstName} ${appointment.technicianLastName ?? ''}`.trim() : 'Unassigned';
  const navigateUrl = appointment.propertyLatitude && appointment.propertyLongitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${appointment.propertyLatitude},${appointment.propertyLongitude}`
    : appointment.propertyAddressLine1
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${appointment.propertyAddressLine1}, ${appointment.propertyCity}, ${appointment.propertyState}`)}`
      : null;

  async function handleStartJob() {
    if (!appointment.jobId) return;
    setIsActing(true);
    try {
      const gps: { latitude?: number; longitude?: number } = {};
      await jobsApi.start(appointment.jobId, gps);
      onChanged();
    } finally {
      setIsActing(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{appointment.jobNumber ?? appointment.title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {/* Quick actions — large, thumb-friendly, at the top */}
          <div className="grid grid-cols-3 gap-2">
            {appointment.jobId && (
              <Link href={`/jobs/${appointment.jobId}`} className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200">
                <ExternalLink className="h-4 w-4" /> View Job
              </Link>
            )}
            {appointment.estimateId && (
              <Link href={`/estimates/${appointment.estimateId}`} className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200">
                <ExternalLink className="h-4 w-4" /> View Estimate
              </Link>
            )}
            {appointment.customerPhone && (
              <a href={`tel:${appointment.customerPhone}`} className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200">
                <Phone className="h-4 w-4" /> Call
              </a>
            )}
            {navigateUrl && (
              <a href={navigateUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200">
                <Navigation className="h-4 w-4" /> Navigate
              </a>
            )}
            {appointment.jobId && appointment.jobStatus && ['draft', 'scheduled'].includes(appointment.jobStatus) && (
              <button onClick={handleStartJob} disabled={isActing} className="flex flex-col items-center gap-1 rounded-xl bg-[var(--color-brand)] px-2 py-3 text-xs font-medium text-white disabled:opacity-50">
                <Play className="h-4 w-4" /> {isActing ? 'Starting…' : 'Start Job'}
              </button>
            )}
            <button onClick={onOpenReschedule} className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200">
              <CalendarClock className="h-4 w-4" /> Reschedule
            </button>
            {!['cancelled', 'completed'].includes(appointment.status) && appointment.jobStatus !== 'completed' && (
              <button onClick={() => setShowCancelDialog(true)} className="flex flex-col items-center gap-1 rounded-xl bg-red-50 dark:bg-red-950 px-2 py-3 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100">
                <CalendarX className="h-4 w-4" /> Cancel
              </button>
            )}
          </div>

          {/* Operational-center info */}
          <dl className="mt-5 space-y-3 text-sm">
            <Row label="Customer" value={appointmentCustomerName(appointment)} />
            <Row label="Property" value={appointment.propertyAddressLine1 ? `${appointment.propertyAddressLine1}, ${appointment.propertyCity}` : '—'} />
            <Row label="Services" value={appointment.services.length > 0 ? appointment.services.map((s) => RECOMMENDABLE_SERVICE_LABELS[s] ?? s).join(', ') : '—'} />
            <Row label="Status" value={APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status} />
            {appointment.status === 'cancelled' && appointment.cancellationReason && (
              <Row label="Cancellation Reason" value={appointment.cancellationReason} />
            )}
            <Row label="Technician" value={technicianName} />
            <Row label="Arrival Window" value={formatWindow(appointment.startsAt, appointment.resolvedArrivalWindowMinutes)} />
            <Row label="Estimated Revenue" value={formatMoney(appointment.jobPrice)} />
            <Row
              label="Weather"
              value={
                weather === undefined ? 'Loading…' : weather === null ? 'Not available' : `${Math.round(weather.current.temperatureF)}°F, ${weather.current.condition}`
              }
            />
            {/* Drive time is deliberately shown as unavailable rather than
                a fake number — no routing provider is configured yet
                (Phase 2 scope). Honest empty state, not a guess. */}
            <Row label="Drive Time" value="Connect a routing provider to see drive time" muted />
          </dl>
        </div>
      </div>
    </div>

      {showCancelDialog && (
        <ConfirmDialog
          title="Cancel this appointment?"
          message="This keeps a record of the appointment and why it was cancelled — it isn't deleted. A job that was only scheduled because of this appointment reverts to needing a new one."
          confirmLabel="Cancel Appointment"
          danger
          onClose={() => setShowCancelDialog(false)}
          onConfirm={async () => {
            await schedulingApi.cancel(appointment.id, cancelReason || undefined);
            setShowCancelDialog(false);
            onChanged();
            onClose();
          }}
        >
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional) — e.g. weather, customer rescheduled…"
            rows={2}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
        </ConfirmDialog>
      )}
    </>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={muted ? 'text-right text-xs text-slate-400 dark:text-slate-500' : 'text-right font-medium text-slate-900 dark:text-slate-100'}>{value}</dd>
    </div>
  );
}
