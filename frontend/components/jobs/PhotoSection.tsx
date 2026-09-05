'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Camera, Upload, X, Loader2, RotateCcw, ChevronLeft, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { jobsApi, PHOTO_TYPE_LABELS, type JobPhoto } from '../../lib/api/jobs';
import { useGeolocation } from '../../lib/hooks/use-geolocation';
import { cn } from '../../lib/utils';

const PHOTO_TYPES = ['before', 'during', 'after', 'damage', 'equipment', 'other'] as const;

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

// One entry per file the user selected in this batch — tracked from
// the moment they're chosen (before any network request) through
// upload completion, so a partial failure can be shown and retried
// without re-selecting the files that already succeeded.
interface PendingUpload {
  id: string; // client-only id (crypto.randomUUID), never sent to the server
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  errorMessage?: string;
}

export function PhotoSection({ jobId, jobNumber }: { jobId: string; jobNumber?: string }) {
  const { data: photos, mutate } = useSWR(['job-photos', jobId], () => jobsApi.listPhotos(jobId));
  const [activeType, setActiveType] = useState<(typeof PHOTO_TYPES)[number]>('before');
  const [isDragOver, setIsDragOver] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<JobPhoto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { capture } = useGeolocation();

  // Object URLs are only useful client-side and must be released or
  // they leak memory for the life of the page — revoked whenever the
  // pending batch is cleared or replaced.
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: PendingUpload[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
    }));
    setPending((prev) => [...prev, ...next]);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  // Uploads whichever items are passed in, one at a time (matches the
  // existing single-file upload endpoint — no backend change needed
  // for "batch" upload, this just calls it once per file). A failure
  // on one file never stops the rest, and only failed items report an
  // error — successful ones flip to 'success' immediately and stay
  // that way even if a later file in the same batch fails.
  async function runUploads(items: PendingUpload[]) {
    if (items.length === 0) return;
    const ids = new Set(items.map((i) => i.id));
    setPending((prev) => prev.map((p) => (ids.has(p.id) ? { ...p, status: 'uploading', errorMessage: undefined } : p)));

    const gps = await capture();
    for (const item of items) {
      try {
        await jobsApi.uploadPhoto(jobId, item.file, activeType, undefined, gps);
        setPending((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'success' } : p)));
      } catch {
        setPending((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'failed', errorMessage: "Couldn't upload" } : p)));
      }
    }
    await mutate();
  }

  function retryFailed() {
    const failed = pending.filter((p) => p.status === 'failed');
    runUploads(failed);
  }

  function clearCompletedBatch() {
    // Only clears once EVERY item succeeded — a batch with any
    // failures stays visible until the user explicitly retries or
    // dismisses it, so a failed photo is never silently lost from view.
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPending([]);
  }

  const hasPending = pending.length > 0;
  const allDone = hasPending && pending.every((p) => p.status === 'success' || p.status === 'failed');
  const anyFailed = pending.some((p) => p.status === 'failed');
  const isUploading = pending.some((p) => p.status === 'uploading');

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const gps = await capture();
      await jobsApi.deletePhoto(jobId, deleteTarget.id, gps);
      await mutate();
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  const filtered = (photos ?? [])
    .filter((p) => p.photoType === activeType)
    .slice()
    .sort((a, b) => new Date(a.takenAt ?? a.createdAt).getTime() - new Date(b.takenAt ?? b.createdAt).getTime());

  const activeViewerPhoto = viewerIndex !== null ? filtered[viewerIndex] : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Photos</h2>

      {/* Category tabs — unchanged, already solid */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {PHOTO_TYPES.map((type) => {
          const count = (photos ?? []).filter((p) => p.photoType === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                activeType === type ? 'bg-[var(--color-brand)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200',
              )}
            >
              {PHOTO_TYPE_LABELS[type]} {count > 0 && <span className="opacity-75">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Upload area — same native multi-select + drag-and-drop as
          before; the only change is selecting files now populates the
          preview batch below instead of uploading immediately. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); selectFiles(e.dataTransfer.files); }}
        className={cn(
          'mt-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors',
          isDragOver ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-slate-200 dark:border-slate-800',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => { selectFiles(e.target.files); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white sm:w-auto sm:mx-auto"
        >
          <Camera className="h-4 w-4" />
          {`Add ${PHOTO_TYPE_LABELS[activeType]} Photos`}
        </button>
        <p className="mt-2 hidden text-xs text-slate-400 dark:text-slate-500 sm:block">
          <Upload className="inline h-3 w-3" /> or drag and drop photos here
        </p>
      </div>

      {/* Pre-upload preview — the customer-visible gallery below is
          untouched until Upload is actually pressed. */}
      {hasPending && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {pending.length} photo{pending.length === 1 ? '' : 's'} selected
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {pending.map((item) => (
              <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                {item.status === 'pending' && (
                  <button
                    onClick={() => removePending(item.id)}
                    aria-label="Remove photo from selection"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {item.status === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                {item.status === 'success' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/30">
                    <span className="rounded-full bg-emerald-500 p-1"><Check className="h-3 w-3 text-white" /></span>
                  </div>
                )}
                {item.status === 'failed' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/50 p-1 text-center">
                    <AlertCircle className="h-4 w-4 text-red-200" />
                    <span className="text-[10px] leading-tight text-red-100">{item.errorMessage}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {!hasPending || (!allDone && !isUploading) ? (
              <>
                <button
                  onClick={() => runUploads(pending.filter((p) => p.status === 'pending'))}
                  className="flex-1 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white sm:flex-none"
                >
                  Upload {pending.length} Photo{pending.length === 1 ? '' : 's'}
                </button>
                <button onClick={clearCompletedBatch} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Cancel
                </button>
              </>
            ) : isUploading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading {pending.filter((p) => p.status === 'success').length} of {pending.length} uploaded
              </p>
            ) : (
              <>
                {anyFailed && (
                  <button onClick={retryFailed} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white">
                    <RotateCcw className="h-3.5 w-3.5" /> Retry Failed
                  </button>
                )}
                <button onClick={clearCompletedBatch} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                  {anyFailed ? 'Dismiss' : 'Done'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Gallery */}
      {filtered.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">No {PHOTO_TYPE_LABELS[activeType].toLowerCase()} photos yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered.map((photo: JobPhoto, i) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
              <button onClick={() => setViewerIndex(i)} className="block h-full w-full" aria-label={`View ${PHOTO_TYPE_LABELS[photo.photoType].toLowerCase()} photo ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={jobsApi.photoFileUrl(jobId, photo.id)}
                  alt={photo.caption ?? `${PHOTO_TYPE_LABELS[photo.photoType]} photo for Job ${jobNumber ?? jobId}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                onClick={() => setDeleteTarget(photo)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Delete photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <p className="truncate text-[10px] text-white">{formatTime(photo.takenAt ?? photo.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delete this photo?</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              This photo will be removed from this job and will no longer be visible to the customer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={isDeleting} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewer — prev/next/close, keyboard accessible */}
      {activeViewerPhoto && viewerIndex !== null && (
        <PhotoViewer
          photo={activeViewerPhoto}
          jobId={jobId}
          jobNumber={jobNumber}
          hasPrev={viewerIndex > 0}
          hasNext={viewerIndex < filtered.length - 1}
          onPrev={() => setViewerIndex((i) => (i !== null ? i - 1 : i))}
          onNext={() => setViewerIndex((i) => (i !== null ? i + 1 : i))}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}

function PhotoViewer({
  photo,
  jobId,
  jobNumber,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  photo: JobPhoto;
  jobId: string;
  jobNumber?: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasPrev, hasNext, onPrev, onNext, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button onClick={onClose} aria-label="Close viewer" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      {hasPrev && (
        <button onClick={onPrev} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button onClick={onNext} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={jobsApi.photoFileUrl(jobId, photo.id)}
        alt={photo.caption ?? `${PHOTO_TYPE_LABELS[photo.photoType]} photo for Job ${jobNumber ?? jobId}`}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
