'use client';

import { useState } from 'react';
import { schedulingApi } from '../../lib/api/scheduling';
import { ApiError } from '../../lib/api/api-client';

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleJobModal({ jobId, onClose, onScheduled }: { jobId: string; onClose: () => void; onScheduled: () => void }) {
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [durationHours, setDurationHours] = useState('2');
  const [arrivalWindow, setArrivalWindow] = useState(''); // blank = use company default / fallback
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + Number(durationHours) * 60 * 60 * 1000);
      await schedulingApi.scheduleJob(jobId, {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        arrivalWindowMinutes: arrivalWindow ? Number(arrivalWindow) : undefined,
      });
      onScheduled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't schedule this job — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Schedule This Job</h2>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Date &amp; Time</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Estimated Duration (hours)</label>
            <input type="text" inputMode="decimal" value={durationHours} onChange={(e) => setDurationHours(e.target.value.replace(/[^0-9.]/g, ''))} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Arrival Window (minutes, optional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={arrivalWindow}
              onChange={(e) => setArrivalWindow(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Leave blank to use your business default"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleSave} disabled={isSaving} className="flex-1 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {isSaving ? 'Scheduling…' : 'Schedule'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
