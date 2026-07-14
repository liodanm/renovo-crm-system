'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { CardSkeleton, CardError, CardEmpty } from '../../dashboard/dashboard-card';

export function PhotosTab({ customerId }: { customerId: string }) {
  const { data: photos, error, isLoading, mutate } = useSWR([`photos`, customerId], () => customersApi.listPhotos(customerId));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      // Two-step direct-to-S3 upload: (1) get a presigned PUT URL from our
      // API, (2) PUT the raw bytes straight to S3 — the file never passes
      // through our API server, (3) tell our API the key so it can record
      // the metadata row.
      const { uploadUrl, key } = await customersApi.presignPhotoUpload(customerId, {
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putResponse.ok) throw new Error('Upload to storage failed');
      await customersApi.confirmPhotoUpload(customerId, { key, mimeType: file.type, fileSizeBytes: file.size });
      mutate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(photoId: string) {
    if (!confirm('Delete this photo?')) return;
    await customersApi.deletePhoto(customerId, photoId);
    mutate();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Photos</h3>
        <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          {isUploading ? 'Uploading…' : '+ Upload Photo'}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} disabled={isUploading} className="hidden" />
        </label>
      </div>

      {uploadError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{uploadError}</div>}

      {isLoading && <CardSkeleton lines={3} />}
      {error && <CardError />}
      {!isLoading && !error && photos && photos.length === 0 && <CardEmpty message="No photos uploaded yet." />}

      {!isLoading && !error && photos && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.photoType} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-2 py-1 opacity-0 transition group-hover:opacity-100">
                <span className="text-[11px] capitalize text-white">{p.photoType}</span>
                <button onClick={() => handleDelete(p.id)} className="text-[11px] text-white hover:text-red-300">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
