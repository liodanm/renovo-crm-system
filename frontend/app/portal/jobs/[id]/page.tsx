'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ImageOff, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { portalApiFetch, portalFetchImageObjectUrl } from '../../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../../components/portal/PortalShell';

interface DashboardHeader {
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface JobPhoto {
  id: string;
  photoType: 'before' | 'after';
  caption: string | null;
  takenAt: string | null;
  createdAt: string;
}

/**
 * Read-only for the customer — matches PortalDataService.getJobPhotosForCustomer's
 * server-side filter to only before/after; this page never renders an
 * upload control, and there is no upload endpoint reachable from the
 * portal for Job photos (the separate, pre-existing property-photo
 * upload feature is unrelated and unaffected).
 */
export default function PortalJobPhotosPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const { data: dashboardHeader } = useSWR<DashboardHeader>('portal-dashboard-header', () => portalApiFetch<DashboardHeader>('/portal/dashboard'));
  const { data: photos, error, isLoading } = useSWR<JobPhoto[]>(jobId ? ['job-photos', jobId] : null, () => portalApiFetch<JobPhoto[]>(`/portal/jobs/${jobId}/photos`));

  const before = (photos ?? []).filter((p) => p.photoType === 'before');
  const after = (photos ?? []).filter((p) => p.photoType === 'after');

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  return (
    <PortalShell
      companyName={dashboardHeader?.company.name ?? 'Your Service Provider'}
      logoUrl={dashboardHeader?.company.logoUrl ?? null}
      primaryColor={dashboardHeader?.company.primaryColor ?? null}
      secondaryColor={dashboardHeader?.company.secondaryColor ?? null}
      onSignOut={handleSignOut}
    >
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-900">Your Job Photos</h1>

        {isLoading && <p className="mt-6 text-sm text-slate-500">Loading photos…</p>}
        {error && <p className="mt-6 text-sm text-red-600">Couldn't load photos right now. Please try again.</p>}

        {photos && photos.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center text-slate-400">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">No photos have been added for this job yet.</p>
          </div>
        )}

        {before.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Before</h2>
            <PhotoGrid jobId={jobId} photos={before} />
          </section>
        )}

        {after.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">After</h2>
            <PhotoGrid jobId={jobId} photos={after} />
          </section>
        )}
      </div>
    </PortalShell>
  );
}

function PhotoGrid({ jobId, photos }: { jobId: string; photos: JobPhoto[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <button key={photo.id} onClick={() => setViewerIndex(i)} className="block">
            <PortalPhotoThumb jobId={jobId} photo={photo} />
          </button>
        ))}
      </div>
      {viewerIndex !== null && (
        <PortalPhotoViewer
          jobId={jobId}
          photos={photos}
          index={viewerIndex}
          onChangeIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

/**
 * A plain <img src="/portal/jobs/:id/photos/:photoId/file"> can't carry
 * the Bearer token this endpoint requires — same reason the existing
 * portal PDF viewer fetches the blob manually instead of just linking
 * to it. Fetches once per photo, revokes the object URL on unmount so
 * a gallery of 20+ photos doesn't leak memory.
 */
function PortalPhotoThumb({ jobId, photo }: { jobId: string; photo: JobPhoto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    portalFetchImageObjectUrl(`/portal/jobs/${jobId}/photos/${photo.id}/file`)
      .then((u) => {
        if (cancelled) return;
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId, photo.id]);

  return (
    <div className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageOff className="h-6 w-6" /></div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.caption ?? `${photo.photoType} photo`} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-slate-200" />
      )}
    </div>
  );
}

function PortalPhotoViewer({
  jobId,
  photos,
  index,
  onChangeIndex,
  onClose,
}: {
  jobId: string;
  photos: JobPhoto[];
  index: number;
  onChangeIndex: (i: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const [url, setUrl] = useState<string | null>(null);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    portalFetchImageObjectUrl(`/portal/jobs/${jobId}/photos/${photo.id}/file`).then((u) => {
      if (cancelled) return;
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jobId, photo.id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onChangeIndex(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onChangeIndex(index + 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, hasPrev, hasNext, onChangeIndex, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      {hasPrev && (
        <button onClick={() => onChangeIndex(index - 1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button onClick={() => onChangeIndex(index + 1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4">
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.caption ?? `${photo.photoType} photo`} className="max-h-full max-w-full rounded-lg object-contain" />
      ) : (
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
      )}
    </div>
  );
}
