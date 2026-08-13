'use client';

import { useState } from 'react';
import { customersApi, ImportReport } from '../../lib/api/customers';

export function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const result = await customersApi.importCsv(file);
      setReport(result);
      if (result.imported > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import Customers</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
            ✕
          </button>
        </div>

        {!report && (
          <>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
              Upload a CSV with a header row. Required: <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs">firstName</code> or{' '}
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs">businessName</code>. Optional columns:{' '}
              <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs">lastName, email, phone, customerType, leadStatus, source, tags</code>{' '}
              (tags separated by <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-xs">;</code>).
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 hover:file:bg-slate-200"
            />

            {error && <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || isUploading}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        )}

        {report && (
          <div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 p-3">
                <div className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{report.imported}</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400">Imported</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <div className="text-xl font-semibold text-slate-700 dark:text-slate-300">{report.skippedDuplicates}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Skipped (duplicate)</div>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3">
                <div className="text-xl font-semibold text-red-700 dark:text-red-300">{report.errors.length}</div>
                <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
              </div>
            </div>

            {report.errors.length > 0 && (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Row</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500 dark:text-slate-400">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{e.row}</td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
