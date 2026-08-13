'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { CardSkeleton, CardError, CardEmpty } from '../../dashboard/dashboard-card';

export function DocumentsTab({ customerId }: { customerId: string }) {
  const { data: documents, error, isLoading, mutate } = useSWR([`documents`, customerId], () => customersApi.listDocuments(customerId));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const { uploadUrl, key } = await customersApi.presignDocumentUpload(customerId, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSizeBytes: file.size,
      });
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putResponse.ok) throw new Error('Upload to storage failed');
      await customersApi.confirmDocumentUpload(customerId, {
        key,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      mutate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(documentId: string) {
    if (!confirm('Delete this document?')) return;
    await customersApi.deleteDocument(customerId, documentId);
    mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Documents</h3>
        <label className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800">
          {isUploading ? 'Uploading…' : '+ Upload Document'}
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} disabled={isUploading} className="hidden" />
        </label>
      </div>

      {uploadError && <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-400">{uploadError}</div>}

      {isLoading && <CardSkeleton lines={3} />}
      {error && <CardError />}
      {!isLoading && !error && documents && documents.length === 0 && <CardEmpty message="No documents uploaded yet." />}

      {!isLoading && !error && documents && documents.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 hover:text-[var(--color-brand)]">
                <FileIcon />
                <span className="truncate">{d.fileName}</span>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] capitalize text-slate-500 dark:text-slate-400">{d.documentType.replace('_', ' ')}</span>
              </a>
              <button onClick={() => handleDelete(d.id)} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0 text-slate-400 dark:text-slate-500">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
