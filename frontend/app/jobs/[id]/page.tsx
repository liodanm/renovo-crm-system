'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { jobsApi, JOB_STATUS_LABELS, SIGNATURE_UNAVAILABLE_LABELS, RECOMMENDABLE_SERVICE_LABELS, type CompleteJobInput } from '../../../lib/api/jobs';
import { AppShell } from '../../../components/layout/AppShell';
import { PhotoSection } from '../../../components/jobs/PhotoSection';
import { ChemicalSection } from '../../../components/jobs/ChemicalSection';
import { EquipmentSection } from '../../../components/jobs/EquipmentSection';
import { CompletionFlow } from '../../../components/jobs/CompletionFlow';
import { FieldActionBar } from '../../../components/jobs/FieldActionBar';
import { ScheduleJobModal } from '../../../components/scheduling/ScheduleJobModal';
import { invoicesApi } from '../../../lib/api/invoices';
import { useGeolocation } from '../../../lib/hooks/use-geolocation';
import { ApiError } from '../../../lib/api/api-client';

function customerName(job: { customerBusinessName: string | null; customerFirstName: string | null; customerLastName: string | null }): string {
  return job.customerBusinessName ?? (`${job.customerFirstName ?? ''} ${job.customerLastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string | number | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function mapLink(lat: string | null, lng: string | null): string | null {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: job, error, isLoading, mutate } = useSWR(['job', params.id], () => jobsApi.get(params.id));
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [showCompleteFlow, setShowCompleteFlow] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const { capture, isCapturing } = useGeolocation();

  async function handleStart() {
    setIsActing(true);
    setActionError(null);
    try {
      const gps = await capture();
      await jobsApi.start(params.id, gps);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsActing(false);
    }
  }

  async function handlePause() {
    setIsActing(true);
    setActionError(null);
    try {
      await jobsApi.pause(params.id);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsActing(false);
    }
  }

  async function handleResume() {
    setIsActing(true);
    setActionError(null);
    try {
      await jobsApi.resume(params.id);
      await mutate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsActing(false);
    }
  }

  async function handleComplete(input: CompleteJobInput) {
    setIsActing(true);
    setActionError(null);
    try {
      const gps = await capture();
      await jobsApi.complete(params.id, { ...input, ...gps });
      await mutate();
      setShowCompleteFlow(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/jobs" className="text-sm text-slate-500 hover:text-slate-800">← Back to Jobs</Link>

        {isLoading && <div className="mt-6 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-6 text-sm text-red-600">Couldn't load this job.</div>}

        {job && (
          <>
            <FieldActionBar job={job} onStart={handleStart} onPause={handlePause} onResume={handleResume} onOpenComplete={() => setShowCompleteFlow(true)} isActing={isActing} />

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{job.jobNumber}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {customerName(job)} · {job.propertyAddressLine1}, {job.propertyCity}
                </p>
                {job.estimateId && (
                  <Link href={`/estimates/${job.estimateId}`} className="mt-1 inline-block text-xs text-[var(--color-brand)]">
                    View originating estimate →
                  </Link>
                )}
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {JOB_STATUS_LABELS[job.status] ?? job.status}
              </span>
            </div>

            {job.status === 'draft' && (
              <button onClick={() => setShowScheduleModal(true)} className="mt-3 rounded-lg border border-[var(--color-brand)] px-4 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5">
                Schedule This Job
              </button>
            )}
            {job.scheduledStart && job.status !== 'draft' && (
              <p className="mt-2 text-sm text-slate-600">
                Scheduled for {formatDateTime(job.scheduledStart)}
                {job.status === 'scheduled' && (
                  <button onClick={() => setShowScheduleModal(true)} className="ml-2 text-xs text-[var(--color-brand)] underline">
                    change
                  </button>
                )}
              </p>
            )}

            {showScheduleModal && (
              <ScheduleJobModal jobId={job.id} onClose={() => setShowScheduleModal(false)} onScheduled={() => { setShowScheduleModal(false); mutate(); }} />
            )}

            {actionError && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

            {showCompleteFlow && <CompletionFlow onSubmit={handleComplete} onCancel={() => setShowCompleteFlow(false)} isSubmitting={isActing || isCapturing} />}

            {/* Line items */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {job.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-slate-700">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity} {item.unitOfMeasure?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end border-t border-slate-200 px-4 py-3 text-base font-semibold text-slate-900">
                Total: {formatMoney(job.price)}
              </div>
            </div>

            {/* Timing, labor, and GPS */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Started</p>
                <p className="mt-0.5 text-sm text-slate-900">{formatDateTime(job.actualStart)}</p>
                {mapLink(job.startLatitude, job.startLongitude) && (
                  <a href={mapLink(job.startLatitude, job.startLongitude)!} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-brand)]">
                    View check-in location →
                  </a>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Finished</p>
                <p className="mt-0.5 text-sm text-slate-900">{formatDateTime(job.actualEnd)}</p>
                {mapLink(job.endLatitude, job.endLongitude) && (
                  <a href={mapLink(job.endLatitude, job.endLongitude)!} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-brand)]">
                    View check-out location →
                  </a>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Calculated hours</p>
                <p className="mt-0.5 text-sm text-slate-900">{job.calculatedLaborHours ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Billable hours</p>
                <p className="mt-0.5 text-sm text-slate-900">{job.billableLaborHours ?? '—'}</p>
              </div>
            </div>

            {job.status === 'completed' && <GenerateInvoiceCard jobId={job.id} />}

            {/* Completion summary — only shown once actually completed */}
            {job.status === 'completed' && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-700">Completion</h2>
                <div className="mt-2 space-y-2 text-sm">
                  <p>
                    <span className="text-slate-500">Signature: </span>
                    {job.customerSignatureDataUrl ? (
                      <span className="text-emerald-700">Captured</span>
                    ) : job.signatureUnavailableReason ? (
                      <span className="text-slate-700">{SIGNATURE_UNAVAILABLE_LABELS[job.signatureUnavailableReason as keyof typeof SIGNATURE_UNAVAILABLE_LABELS] ?? job.signatureUnavailableReason}</span>
                    ) : (
                      <span className="text-slate-400">Not recorded</span>
                    )}
                  </p>
                  {job.customerSignatureDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.customerSignatureDataUrl} alt="Customer signature" className="h-20 rounded border border-slate-200 bg-white" />
                  )}
                  {job.completionNotes && (
                    <p>
                      <span className="text-slate-500">Notes: </span>
                      {job.completionNotes}
                    </p>
                  )}
                  {job.recommendedFutureServices && job.recommendedFutureServices.length > 0 && (
                    <div>
                      <span className="text-slate-500">Recommended: </span>
                      {job.recommendedFutureServices.map((s) => RECOMMENDABLE_SERVICE_LABELS[s] ?? s).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 2: Field operations */}
            <div className="mt-6 space-y-4">
              <PhotoSection jobId={job.id} />
              <ChemicalSection jobId={job.id} />
              <EquipmentSection jobId={job.id} />
            </div>

            {(job.notes || job.internalNotes) && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {job.notes && (
                  <div>
                    <h2 className="text-sm font-medium text-slate-700">Customer Notes</h2>
                    <p className="mt-1 text-sm text-slate-600">{job.notes}</p>
                  </div>
                )}
                {job.internalNotes && (
                  <div>
                    <h2 className="text-sm font-medium text-slate-700">Internal Notes <span className="text-xs font-normal text-slate-400">(staff only)</span></h2>
                    <p className="mt-1 text-sm text-slate-600">{job.internalNotes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Real lifecycle audit trail */}
            {job.statusHistory && job.statusHistory.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-medium text-slate-700">Activity</h2>
                <ul className="mt-2 space-y-1.5">
                  {job.statusHistory.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-2 text-xs text-slate-500">
                      <span className="w-36 shrink-0 text-slate-400">{formatDateTime(entry.changedAt)}</span>
                      <span>
                        {entry.fromStatus ? `${JOB_STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus} → ` : ''}
                        <span className="font-medium text-slate-700">{JOB_STATUS_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                        {entry.note && <span className="text-slate-400"> — {entry.note}</span>}
                        {mapLink(entry.latitude, entry.longitude) && (
                          <a href={mapLink(entry.latitude, entry.longitude)!} target="_blank" rel="noreferrer" className="ml-1.5 text-[var(--color-brand)]">
                            (location)
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

function GenerateInvoiceCard({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      // Idempotent on the backend — if an invoice already exists for
      // this job, this returns that one rather than creating a
      // duplicate, so clicking twice (or a retry after a network blip)
      // is always safe.
      const invoice = await invoicesApi.generateFromJob(jobId);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate an invoice for this job.');
      setIsGenerating(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--color-brand)] bg-[var(--color-brand)]/5 p-4">
      <h2 className="text-sm font-semibold text-slate-800">Ready to Invoice</h2>
      <p className="mt-1 text-xs text-slate-600">This job is complete — generate an invoice using its real line items, current tax rate, and due date defaults.</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button onClick={handleGenerate} disabled={isGenerating} className="mt-3 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {isGenerating ? 'Generating…' : 'Generate Invoice'}
      </button>
    </div>
  );
}
