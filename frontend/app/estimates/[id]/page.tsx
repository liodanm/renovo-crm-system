'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Pencil, CheckCircle2, Briefcase, Mail, FileDown, Printer, XCircle, Clock, Trash2, RotateCcw } from 'lucide-react';
import { estimatesApi, SERVICE_TYPES } from '../../../lib/api/estimates';
import { PermissionGate } from '../../../components/auth/permission-gate';
import { useAuth } from '../../../lib/auth/auth-context';
import { ApiError, fetchPdfObjectUrl } from '../../../lib/api/api-client';
import { AppShell } from '../../../components/layout/AppShell';
import { DocumentEmailSection } from '../../../components/documents/DocumentEmailSection';
import { ActionBar, type ActionBarItem } from '../../../components/action-center/ActionBar';
import { ConfirmDialog } from '../../../components/action-center/ConfirmDialog';
import { StatusBadge, ESTIMATE_STATUS_COLORS } from '../../../components/action-center/StatusBadge';
import { StatusTimeline } from '../../../components/action-center/StatusTimeline';
import { CustomerActivity } from '../../../components/action-center/CustomerActivity';

function customerName(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

function formatMoney(value: string | number | undefined): string {
  return `$${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function serviceLabel(value: string): string {
  return SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;
}

const DECLINE_REASONS = ['Price too high', 'Chose another company', 'No longer needed', 'Timing not right', 'Other'];

type DialogType = 'accept' | 'decline' | 'delete' | 'markExpired' | 'reopen' | null;

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { data: estimate, error, isLoading, mutate } = useSWR(['estimate', params.id], () => estimatesApi.get(params.id));
  const { data: statusHistory } = useSWR(estimate ? ['estimate-history', params.id] : null, () => estimatesApi.getStatusHistory(params.id));
  const { data: emailHistory } = useSWR(estimate ? ['estimate-email-history', params.id] : null, () => estimatesApi.getEmailHistory(params.id));

  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [openDialog, setOpenDialog] = useState<DialogType>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineComments, setDeclineComments] = useState('');

  if (isLoading) {
    return <AppShell><main className="mx-auto max-w-5xl px-4 py-6"><p className="text-sm text-slate-500">Loading…</p></main></AppShell>;
  }
  if (error || !estimate) {
    return <AppShell><main className="mx-auto max-w-5xl px-4 py-6"><p className="text-sm text-red-600">Couldn't load this estimate.</p></main></AppShell>;
  }

  const hasBeenConverted = statusHistory?.some((h) => h.note?.toLowerCase().includes('convert')) ?? false;
  const displayStatus = hasBeenConverted && estimate.status === 'accepted' ? 'converted' : estimate.status;

  async function handleConvertToJob() {
    setIsActing(true);
    setActionError(null);
    try {
      const job = await estimatesApi.convertToJob(params.id);
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to convert estimate to a job.');
      setIsActing(false);
    }
  }

  async function handlePrint() {
    setIsPreviewing(true);
    setActionError(null);
    try {
      const url = await fetchPdfObjectUrl(estimatesApi.pdfPath(estimate!.id));
      const win = window.open(url, '_blank');
      win?.addEventListener('load', () => win.print());
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't load the PDF to print.");
    } finally {
      setIsPreviewing(false);
    }
  }

  const [flashEmailSection, setFlashEmailSection] = useState(false);

  function handleJumpToEmail() {
    document.getElementById('email-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // scrollIntoView is a no-op when the target is already fully on
    // screen (common on shorter estimates like this one) — the click
    // otherwise looks like it did nothing. This flash gives visible
    // feedback every time, regardless of scroll position.
    setFlashEmailSection(true);
    setTimeout(() => setFlashEmailSection(false), 1200);
  }

  const isDraft = estimate.status === 'draft';
  const isAccepted = estimate.status === 'accepted';
  const canReopen = hasPermission('estimates.reopen');

  const primary: ActionBarItem[] = [
    { key: 'edit', label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => router.push(`/estimates/${estimate.id}/edit`), hidden: !isDraft },
    { key: 'accept', label: 'Accept', icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => setOpenDialog('accept'), hidden: ['accepted', 'declined', 'expired'].includes(estimate.status) },
    // Job creation now happens automatically on acceptance — this button
    // is a navigation shortcut to that job, not a separate creation
    // step. It still calls the same (now-idempotent) endpoint rather
    // than assuming a job ID, which is what keeps this safe for
    // estimates accepted before this change shipped, before any job
    // existed for them yet.
    { key: 'convert', label: 'View Job', icon: <Briefcase className="h-4 w-4" />, onClick: handleConvertToJob, hidden: !isAccepted, loading: isActing },
  ];

  const secondary: ActionBarItem[] = [
    { key: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, onClick: handleJumpToEmail },
    { key: 'pdf', label: 'Generate PDF', icon: <FileDown className="h-4 w-4" />, onClick: async () => { const url = await fetchPdfObjectUrl(estimatesApi.pdfPath(estimate.id)); window.open(url, '_blank'); } },
    { key: 'print', label: 'Print', icon: <Printer className="h-4 w-4" />, onClick: handlePrint, loading: isPreviewing },
  ];

  const danger: ActionBarItem[] = [
    { key: 'decline', label: 'Decline', icon: <XCircle className="h-4 w-4" />, onClick: () => setOpenDialog('decline'), hidden: ['declined', 'accepted', 'expired'].includes(estimate.status) },
    { key: 'markExpired', label: 'Mark Expired', icon: <Clock className="h-4 w-4" />, onClick: () => setOpenDialog('markExpired'), hidden: ['accepted', 'declined', 'expired'].includes(estimate.status) },
    { key: 'delete', label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setOpenDialog('delete'), hidden: !isDraft },
    { key: 'reopen', label: 'Reopen', icon: <RotateCcw className="h-4 w-4" />, onClick: () => setOpenDialog('reopen'), hidden: isDraft || !canReopen },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/estimates" className="text-sm text-slate-500 hover:text-slate-800">← Back to Estimates</Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{estimate.estimateNumber}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {customerName(estimate.customer)} · {estimate.property.addressLine1}, {estimate.property.city}
            </p>
          </div>
          <StatusBadge status={displayStatus} colorMap={ESTIMATE_STATUS_COLORS} />
        </div>

        {actionError && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

        <div className="mt-4">
          <ActionBar primary={primary} secondary={secondary} danger={danger} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <PermissionGate permissions={['estimates.profitability']}>
                      <th className="px-4 py-3 text-right">Est. Profit</th>
                      <th className="px-4 py-3 text-right">Margin</th>
                    </PermissionGate>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {estimate.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-slate-700">{serviceLabel(item.serviceType)}</td>
                      <td className="px-4 py-3 text-slate-500">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity} {item.unitOfMeasure.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.total)}</td>
                      <PermissionGate permissions={['estimates.profitability']}>
                        <td className={`px-4 py-3 text-right font-medium ${Number(item.estimatedProfit) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {item.estimatedProfit !== undefined ? formatMoney(item.estimatedProfit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {item.profitMarginPercent !== undefined ? `${Number(item.profitMarginPercent).toFixed(1)}%` : '—'}
                        </td>
                      </PermissionGate>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-200 px-4 py-4">
                <div className="ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(estimate.subtotal)}</span></div>
                  {Number(estimate.discountAmount) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount {estimate.discountType === 'percentage' ? '(%)' : '(flat)'}</span>
                      <span>−{formatMoney(estimate.discountAmount)}</span>
                    </div>
                  )}
                  {Number(estimate.taxAmount) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({(Number(estimate.taxRate) * 100).toFixed(2)}%)</span>
                      <span>{formatMoney(estimate.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
                    <span>Total</span><span>{formatMoney(estimate.totalAmount)}</span>
                  </div>
                </div>

                <PermissionGate permissions={['estimates.profitability']}>
                  {estimate.totalEstimatedProfit !== undefined && (
                    <div className="ml-auto mt-3 max-w-xs rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex justify-between font-medium text-slate-700">
                        <span>Est. Profit</span>
                        <span className={estimate.totalEstimatedProfit < 0 ? 'text-red-600' : 'text-emerald-600'}>{formatMoney(estimate.totalEstimatedProfit)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Margin</span><span>{estimate.overallProfitMarginPercent?.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                </PermissionGate>
              </div>
            </div>

            {estimate.notes && (
              <div>
                <h2 className="text-sm font-medium text-slate-700">Notes</h2>
                <p className="mt-1 text-sm text-slate-600">{estimate.notes}</p>
              </div>
            )}

            {estimate.declineReason && (
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">Decline reason: {estimate.declineReason}</p>
                {estimate.declineComments && <p className="mt-1 text-sm text-red-700">{estimate.declineComments}</p>}
              </div>
            )}

            {estimate.status === 'expired' && (
              <div className="rounded-lg bg-orange-50 px-4 py-3">
                <p className="text-sm font-medium text-orange-800">This estimate expired automatically and can no longer be accepted or converted to a job.</p>
                <p className="mt-1 text-sm text-orange-700">
                  {canReopen ? 'Use Reopen in the Danger Zone below to send it back to Draft, update pricing if needed, and resend it.' : 'An Owner or Admin can reopen it to send a fresh quote.'}
                </p>
              </div>
            )}

            {estimate.internalNotes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Internal Notes — staff only, never shown to the customer</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{estimate.internalNotes}</p>
              </div>
            )}

            <div id="email-section" className={`rounded-lg transition-shadow duration-300 ${flashEmailSection ? 'ring-2 ring-[var(--color-brand)] ring-offset-2' : ''}`}>
              <DocumentEmailSection
                documentLabel="Estimate"
                customerEmail={estimate.customer.email}
                hasBeenSent={estimate.status !== 'draft'}
                pdfPath={estimatesApi.pdfPath(estimate.id)}
                onSendEmail={(toEmail) => estimatesApi.sendEmail(estimate.id, toEmail).then(async (r) => { await mutate(); return r; })}
                onGetHistory={() => estimatesApi.getEmailHistory(estimate.id)}
                historyKey={`estimate-email-history-${estimate.id}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700">Timeline</h2>
              <div className="mt-3">
                <StatusTimeline entries={statusHistory ?? []} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700">Customer Activity</h2>
              <div className="mt-3">
                <CustomerActivity statusHistory={statusHistory ?? []} emailHistory={emailHistory ?? []} />
              </div>
            </div>
          </div>
        </div>

        {openDialog === 'accept' && (
          <ConfirmDialog
            title="Accept this estimate?"
            message="This records office-staff acceptance and automatically creates a Job, ready to be scheduled. This can't be undone unless it's reopened by an Owner or Admin."
            confirmLabel="Accept Estimate"
            onClose={() => setOpenDialog(null)}
            onConfirm={async () => { await estimatesApi.acceptManually(estimate.id); await mutate(); }}
          />
        )}

        {openDialog === 'decline' && (
          <ConfirmDialog
            title="Decline this estimate?"
            message="Select a reason and add any optional details."
            confirmLabel="Decline Estimate"
            danger
            onClose={() => setOpenDialog(null)}
            onConfirm={async () => { await estimatesApi.declineManually(estimate.id, declineReason || undefined, declineComments || undefined); await mutate(); }}
          >
            <div className="space-y-2">
              <select value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select a reason…</option>
                {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <textarea value={declineComments} onChange={(e) => setDeclineComments(e.target.value)} placeholder="Optional comments…" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </ConfirmDialog>
        )}

        {openDialog === 'delete' && (
          <ConfirmDialog
            title="Delete this draft estimate?"
            message="This permanently deletes the estimate. Only draft estimates can be deleted — this can't be undone."
            confirmLabel="Delete Estimate"
            danger
            onClose={() => setOpenDialog(null)}
            onConfirm={async () => { await estimatesApi.remove(estimate.id); router.push('/estimates'); }}
          />
        )}

        {openDialog === 'markExpired' && (
          <ConfirmDialog
            title="Mark this estimate as expired?"
            message="The customer will no longer be able to accept it from the portal."
            confirmLabel="Mark Expired"
            danger
            onClose={() => setOpenDialog(null)}
            onConfirm={async () => { await estimatesApi.markExpired(estimate.id); await mutate(); }}
          />
        )}

        {openDialog === 'reopen' && (
          <ConfirmDialog
            title="Reopen this estimate?"
            message="This reverts the estimate to Draft so it can be edited again — clearing its accepted/declined status. Only Owners and Admins can do this."
            confirmLabel="Reopen Estimate"
            danger
            onClose={() => setOpenDialog(null)}
            onConfirm={async () => { await estimatesApi.reopen(estimate.id); await mutate(); }}
          />
        )}
      </main>
    </AppShell>
  );
}
