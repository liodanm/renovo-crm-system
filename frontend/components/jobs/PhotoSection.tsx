'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { jobsApi, PHOTO_TYPE_LABELS, type JobPhoto } from '../../lib/api/jobs';
import { useGeolocation } from '../../lib/hooks/use-geolocation';
import { cn } from '../../lib/utils';

const PHOTO_TYPES = ['before', 'during', 'after', 'damage', 'equipment', 'other'] as const;

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function PhotoSection({ jobId }: { jobId: string }) {
  const { data: photos, mutate } = useSWR(['job-photos', jobId], () => jobsApi.listPhotos(jobId));
  const [activeType, setActiveType] = useState<(typeof PHOTO_TYPES)[number]>('before');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { capture } = useGeolocation();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const gps = await capture();
      for (const file of Array.from(files)) {
        await jobsApi.uploadPhoto(jobId, file, activeType, undefined, gps);
      }
      await mutate();
    } catch {
      setError("Couldn't upload one or more photos. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(photoId: string) {
    const gps = await capture();
    await jobsApi.deletePhoto(jobId, photoId, gps);
    mutate();
  }

  const filtered = (photos ?? []).filter((p) => p.photoType === activeType);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Photos</h2>

      {/* Category tabs — large touch targets, horizontally scrollable on narrow screens */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {PHOTO_TYPES.map((type) => {
          const count = (photos ?? []).filter((p) => p.photoType === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                activeType === type ? 'bg-[var(--color-brand)] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {PHOTO_TYPE_LABELS[type]} {count > 0 && <span className="opacity-75">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Upload area — big camera button for mobile, drag-and-drop for desktop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          'mt-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors',
          isDragOver ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5' : 'border-slate-200',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand)] px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:mx-auto"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {isUploading ? 'Uploading…' : `Add ${PHOTO_TYPE_LABELS[activeType]} Photo`}
        </button>
        <p className="mt-2 hidden text-xs text-slate-400 sm:block">
          <Upload className="inline h-3 w-3" /> or drag and drop photos here
        </p>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {/* Chronological grid */}
      {filtered.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-400">No {PHOTO_TYPE_LABELS[activeType].toLowerCase()} photos yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered
            .slice()
            .sort((a, b) => new Date(a.takenAt ?? a.createdAt).getTime() - new Date(b.takenAt ?? b.createdAt).getTime())
            .map((photo: JobPhoto) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={jobsApi.photoFileUrl(jobId, photo.id)} alt={photo.caption ?? PHOTO_TYPE_LABELS[photo.photoType]} className="h-full w-full object-cover" />
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <p className="truncate text-[10px] text-white">{formatTime(photo.takenAt ?? photo.createdAt)}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
