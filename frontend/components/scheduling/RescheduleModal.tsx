'use client';

import { useState } from 'react';
import { schedulingApi, type CalendarAppointment } from '../../lib/api/scheduling';

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleModal({ appointment, onClose, onRescheduled }: { appointment: CalendarAppointment; onClose: () => void; onRescheduled: () => void }) {
  const [startsAt, setStartsAt] = useState(toLocalInputValue(appointment.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(appointment.endsAt));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await schedulingApi.reschedule(appointment.id, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      onRescheduled();
    } catch {
      setError("Couldn't reschedule — check the times and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900">Reschedule {appointment.jobNumber ?? appointment.title}</h2>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Start</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">End</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
