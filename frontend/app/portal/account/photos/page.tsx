'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ImageOff, X, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { portalApiFetch, portalFetchImageObjectUrl } from '../../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../../components/portal/PortalShell';

interface DashboardResponse {
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface CustomerPhoto {
  id: string;
  photoType: string;
  caption: string | null;
  createdAt: string;
}

export default function PortalAccountPhotosPage() {
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: photos, error, isLoading } = useSWR<CustomerPhoto[]>('portal-account-photos', () => portalApiFetch<CustomerPhoto[]>('/portal/account/photos'));
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  return (
    <PortalShell
      companyName={dashboard?.company.name}
      logoUrl={dashboard?.company.logoUrl}
      primaryColor={dashboard?.company.primaryColor}
      secondaryColor={dashboard?.company.secondaryColor}
      onSignOut={handleSignOut}
    >
      <Link href="/portal/account" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Account
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-slate-900">My Photos</h1>
      <p className="mt-1 text-sm text-slate-500">Photos from your service history and visits.</p>

      {isLoading && (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {error && !isLoading && <p className="mt-6 text-sm text-slate-500">Unable to load photos. Please try again.</p>}

      {photos && photos.length === 0 && !isLoading && !error && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-400">
          <ImageOff className="h-8 w-8" />
          <p className="text-sm font-medium text-slate-500">No photos yet</p>
          <p className="text-xs text-slate-400">Photos uploaded by your service provider will appear here.</p>
        </div>
      )}

      {photos && photos.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <button key={photo.id} onClick={() => setViewerIndex(i)} className="block">
              <PhotoThumb photo={photo} />
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && photos && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onChangeIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </PortalShell>
  );
}

/**
 * Same reasoning as the Job Photos portal page: a plain <img src> can't
 * carry the Bearer token /portal/account/photos/:photoId/file requires,
 * so the blob is fetched manually and handed to <img> as an object URL.
 */
function PhotoThumb({ photo }: { photo: CustomerPhoto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    portalFetchImageObjectUrl(`/portal/account/photos/${photo.id}/file`)
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
  }, [photo.id]);

  return (
    <div className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {failed ? (
        <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageOff className="h-6 w-6" /></div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.caption ?? 'Photo'} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-slate-200" />
      )}
    </div>
  );
}

function PhotoViewer({
  photos,
  index,
  onChangeIndex,
  onClose,
}: {
  photos: CustomerPhoto[];
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
    portalFetchImageObjectUrl(`/portal/account/photos/${photo.id}/file`).then((u) => {
      if (cancelled) return;
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);

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
        <img src={url} alt={photo.caption ?? 'Photo'} className="max-h-full max-w-full rounded-lg object-contain" />
      ) : (
        <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
      )}
    </div>
  );
}
