'use client';

import { useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Play, Pause, Check, Camera, FlaskConical, MapPin, Loader2 } from 'lucide-react';
import { jobsApi, type Job } from '../../lib/api/jobs';
import { useGeolocation } from '../../lib/hooks/use-geolocation';
import { cn } from '../../lib/utils';

interface FieldActionBarProps {
  job: Job;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onOpenComplete: () => void;
  isActing: boolean;
}

const CHEMICAL_UNITS = ['oz', 'gallons', 'liters', 'ml', 'lbs', 'kg'];

/**
 * The one thing this bar is FOR: on a job site, the buttons a tech
 * reaches for over and over (Start, a quick before-photo, logging a
 * chemical, checking in, pausing, finishing up) shouldn't require
 * scrolling past customer details, line items, or notes to reach. That
 * information still exists — it's just not what your thumb needs first.
 * Everything below this bar is the same detail page as before.
 */
export function FieldActionBar({ job, onStart, onPause, onResume, onOpenComplete, isActing }: FieldActionBarProps) {
  const { mutate } = useSWRConfig();
  const { capture, isCapturing } = useGeolocation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showChemicalForm, setShowChemicalForm] = useState(false);
  const [chemicalName, setChemicalName] = useState('');
  const [chemicalQty, setChemicalQty] = useState('');
  const [chemicalUnit, setChemicalUnit] = useState('oz');
  const [isSavingChemical, setIsSavingChemical] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleBeforePhoto(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    try {
      const gps = await capture();
      for (const file of Array.from(files)) {
        await jobsApi.uploadPhoto(job.id, file, 'before', undefined, gps);
      }
      await mutate(['job-photos', job.id]);
      showToast('Before photo added');
    } catch {
      showToast("Couldn't upload — try again");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleSaveChemical() {
    if (!chemicalName.trim() || !chemicalQty || Number(chemicalQty) <= 0) return;
    setIsSavingChemical(true);
    try {
      const gps = await capture();
      await jobsApi.addChemical(job.id, { chemicalName: chemicalName.trim(), quantity: Number(chemicalQty), unit: chemicalUnit, ...gps });
      await mutate(['job-chemicals', job.id]);
      setChemicalName('');
      setChemicalQty('');
      setShowChemicalForm(false);
      showToast('Chemical logged');
    } catch {
      showToast("Couldn't save — try again");
    } finally {
      setIsSavingChemical(false);
    }
  }

  async function handleCheckIn() {
    setIsCheckingIn(true);
    try {
      const gps = await capture();
      const result = await jobsApi.checkIn(job.id, gps);
      showToast(result.latitude != null ? 'Checked in with location' : 'Checked in (no location available)');
    } catch {
      showToast("Couldn't check in — try again");
    } finally {
      setIsCheckingIn(false);
    }
  }

  const canStart = job.status === 'draft' || job.status === 'scheduled';
  const canPauseOrComplete = job.status === 'in_progress';
  const canResume = job.status === 'paused';
  const isDone = job.status === 'completed' || job.status === 'cancelled';

  if (isDone) return null;

  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {toast && (
        <div className="mb-2 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-medium text-white">{toast}</div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {canStart && (
          <button
            onClick={onStart}
            disabled={isActing || isCapturing}
            className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-4 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-50 sm:col-span-3"
          >
            <Play className="h-5 w-5" /> {isCapturing ? 'Getting location…' : isActing ? 'Starting…' : 'Start Job'}
          </button>
        )}

        {canPauseOrComplete && (
          <>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => handleBeforePhoto(e.target.files)} />
            <FieldButton icon={<Camera className="h-5 w-5" />} label={isUploadingPhoto ? 'Uploading…' : 'Before Photo'} onClick={() => photoInputRef.current?.click()} disabled={isUploadingPhoto} />
            <FieldButton icon={<FlaskConical className="h-5 w-5" />} label="Log Chemicals" onClick={() => setShowChemicalForm((v) => !v)} active={showChemicalForm} />
            <FieldButton icon={isCheckingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />} label="Check In" onClick={handleCheckIn} disabled={isCheckingIn} />
            <FieldButton icon={<Pause className="h-5 w-5" />} label="Pause" onClick={onPause} disabled={isActing} tone="neutral" />
            <FieldButton icon={<Check className="h-5 w-5" />} label="Complete Job" onClick={onOpenComplete} disabled={isActing} tone="success" className="col-span-2 sm:col-span-1" />
          </>
        )}

        {canResume && (
          <>
            <button
              onClick={onResume}
              disabled={isActing}
              className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-brand)] px-4 py-4 text-base font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              <Play className="h-5 w-5" /> {isActing ? 'Resuming…' : 'Resume Job'}
            </button>
            <FieldButton icon={isCheckingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />} label="Check In" onClick={handleCheckIn} disabled={isCheckingIn} />
          </>
        )}
      </div>

      {/* Inline quick-add — expands in place, never requires scrolling to the full Chemical Usage section below */}
      {showChemicalForm && (
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5">
          <input
            value={chemicalName}
            onChange={(e) => setChemicalName(e.target.value)}
            placeholder="Chemical name"
            autoFocus
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2.5 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <input
            type="text"
            inputMode="decimal"
            value={chemicalQty}
            onChange={(e) => setChemicalQty(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="Qty"
            className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2.5 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <select value={chemicalUnit} onChange={(e) => setChemicalUnit(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-1 py-3 text-base lg:py-2.5 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
            {CHEMICAL_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button
            onClick={handleSaveChemical}
            disabled={isSavingChemical || !chemicalName.trim() || !chemicalQty}
            className="col-span-3 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {isSavingChemical ? 'Saving…' : 'Save Chemical'}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  tone = 'default',
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'neutral' | 'success';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3.5 text-xs font-semibold active:scale-[0.98] disabled:opacity-50',
        tone === 'success' ? 'bg-emerald-600 text-white' : tone === 'neutral' ? 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
        active && 'ring-2 ring-[var(--color-brand)]',
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
