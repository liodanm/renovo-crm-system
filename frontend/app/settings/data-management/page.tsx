'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle } from 'lucide-react';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ConfirmDialog } from '../../../components/action-center/ConfirmDialog';
import { estimatesApi, type Estimate } from '../../../lib/api/estimates';
import { jobsApi, type JobListItem } from '../../../lib/api/jobs';
import { invoicesApi, type InvoiceListItem } from '../../../lib/api/invoices';
import { paymentsApi, type PaymentListItem } from '../../../lib/api/payments';
import { adminDataApi } from '../../../lib/api/admin-data';
import { ApiError } from '../../../lib/api/api-client';

type EntityType = 'estimate' | 'job' | 'invoice' | 'payment';

function money(v: string | number) {
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

/**
 * Owner-only permanent data deletion, for test-data cleanup. Every
 * search here reuses the existing list() endpoints already used
 * throughout the app — no new backend search endpoints, since this is
 * an occasional cleanup tool used by one person, not something that
 * needs to scale to a large filtered search UI.
 */
export default function DataManagementPage() {
  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Data Management"
      description=""
      hasUnsavedChanges={false}
      isSaving={false}
      error={null}
      onSave={() => undefined}
      onCancel={() => undefined}
    >
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          This area is intended for permanent cleanup of test data. Deletions here cannot be undone and cannot be recovered through the application — there is no recycle bin or backup for anything deleted here.
        </p>
      </div>

      <div className="space-y-8">
        <EstimatesSection />
        <JobsSection />
        <InvoicesSection />
        <PaymentsSection />
      </div>
    </SettingsSectionShell>
  );
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mb-3 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
    />
  );
}

function ResultRow({ label, sub, right, onDelete }: { label: string; sub: string; right: string; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{right}</span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EstimatesSection() {
  const { data, mutate } = useSWR('admin-data-estimates', () => estimatesApi.list());
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Estimate | null>(null);

  const filtered = (data ?? []).filter((e) => e.estimateNumber.toLowerCase().includes(search.toLowerCase()));

  return (
    <SectionShell title="Estimates">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by estimate number…" />
      <div className="space-y-2">
        {filtered.slice(0, 20).map((e) => (
          <ResultRow
            key={e.id}
            label={e.estimateNumber}
            sub={`${e.customer.businessName || `${e.customer.firstName ?? ''} ${e.customer.lastName ?? ''}`.trim()} · ${e.status}`}
            right={money(e.totalAmount)}
            onDelete={() => setTarget(e)}
          />
        ))}
        {search && filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No matching estimates.</p>}
      </div>
      {target && <DeleteEstimateDialog estimate={target} onClose={() => setTarget(null)} onDeleted={() => mutate()} />}
    </SectionShell>
  );
}

function DeleteEstimateDialog({ estimate, onClose, onDeleted }: { estimate: Estimate; onClose: () => void; onDeleted: () => void }) {
  const { data: preview } = useSWR(`admin-data-estimate-preview-${estimate.id}`, () => adminDataApi.previewEstimateDeletion(estimate.id));

  if (!preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
        <div className="rounded-xl bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-400">Loading…</div>
      </div>
    );
  }

  const hasDownstream = preview.invoiceCount > 0;
  const message = hasDownstream
    ? `⚠️ This action is permanent.\n\nThis Estimate has ${preview.invoiceCount} associated Invoice${preview.invoiceCount === 1 ? '' : 's'}${preview.paymentCount > 0 ? ` and ${preview.paymentCount} Payment${preview.paymentCount === 1 ? '' : 's'}` : ''}.\n\nDeleting the Estimate will also permanently delete ${preview.invoiceCount === 1 ? 'that Invoice' : 'those Invoices'}${preview.paymentCount > 0 ? ' and its Payment(s)' : ''} from this application.\n\nThis action cannot be undone.`
    : `This will permanently delete Estimate ${estimate.estimateNumber} and its line items and history. This action cannot be undone.`;

  return (
    <ConfirmDialog
      title={`Delete Estimate ${estimate.estimateNumber}?`}
      message={message}
      confirmLabel="Delete Permanently"
      danger
      requireTypedConfirmation="DELETE"
      onConfirm={async () => { await adminDataApi.deleteEstimate(estimate.id); onDeleted(); }}
      onClose={onClose}
    />
  );
}

function JobsSection() {
  const { data, mutate } = useSWR('admin-data-jobs', () => jobsApi.list());
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<JobListItem | null>(null);

  const filtered = (data ?? []).filter((j) => j.jobNumber.toLowerCase().includes(search.toLowerCase()) || j.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <SectionShell title="Jobs">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by job number or title…" />
      <div className="space-y-2">
        {filtered.slice(0, 20).map((j) => (
          <ResultRow key={j.id} label={j.jobNumber} sub={`${j.title} · ${j.status}`} right={money(j.price)} onDelete={() => setTarget(j)} />
        ))}
        {search && filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No matching jobs.</p>}
      </div>
      {target && <DeleteJobDialog job={target} onClose={() => setTarget(null)} onDeleted={() => mutate()} />}
    </SectionShell>
  );
}

function DeleteJobDialog({ job, onClose, onDeleted }: { job: JobListItem; onClose: () => void; onDeleted: () => void }) {
  const { data: preview } = useSWR(`admin-data-job-preview-${job.id}`, () => adminDataApi.previewJobDeletion(job.id));

  if (!preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
        <div className="rounded-xl bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-400">Loading…</div>
      </div>
    );
  }

  const hasDownstream = preview.invoiceCount > 0 || preview.appointmentCount > 0;
  const parts: string[] = [];
  if (preview.invoiceCount > 0) parts.push(`${preview.invoiceCount} associated Invoice${preview.invoiceCount === 1 ? '' : 's'}`);
  if (preview.paymentCount > 0) parts.push(`${preview.paymentCount} Payment${preview.paymentCount === 1 ? '' : 's'}`);
  if (preview.appointmentCount > 0) parts.push(`${preview.appointmentCount} scheduled appointment${preview.appointmentCount === 1 ? '' : 's'}`);

  const message = hasDownstream
    ? `⚠️ This action is permanent.\n\nThis Job has ${parts.join(', ')}.\n\nDeleting the Job will also permanently delete all of the above from this application.\n\nThis action cannot be undone.`
    : `This will permanently delete Job ${job.jobNumber} and its line items, photos, and history. This action cannot be undone.`;

  return (
    <ConfirmDialog
      title={`Delete Job ${job.jobNumber}?`}
      message={message}
      confirmLabel="Delete Permanently"
      danger
      requireTypedConfirmation="DELETE"
      onConfirm={async () => { await adminDataApi.deleteJob(job.id); onDeleted(); }}
      onClose={onClose}
    />
  );
}

function InvoicesSection() {
  const { data, mutate } = useSWR('admin-data-invoices', () => invoicesApi.list());
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<InvoiceListItem | null>(null);

  const filtered = (data ?? []).filter((i) => i.invoiceNumber.toLowerCase().includes(search.toLowerCase()));

  return (
    <SectionShell title="Invoices">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by invoice number…" />
      <div className="space-y-2">
        {filtered.slice(0, 20).map((i) => (
          <ResultRow key={i.id} label={i.invoiceNumber} sub={i.status} right={money(i.totalAmount)} onDelete={() => setTarget(i)} />
        ))}
        {search && filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No matching invoices.</p>}
      </div>
      {target && <DeleteInvoiceDialog invoice={target} onClose={() => setTarget(null)} onDeleted={() => mutate()} />}
    </SectionShell>
  );
}

function DeleteInvoiceDialog({ invoice, onClose, onDeleted }: { invoice: InvoiceListItem; onClose: () => void; onDeleted: () => void }) {
  const { data: preview } = useSWR(`admin-data-invoice-preview-${invoice.id}`, () => adminDataApi.previewInvoiceDeletion(invoice.id));

  if (!preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
        <div className="rounded-xl bg-white dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-400">Loading…</div>
      </div>
    );
  }

  const message = preview.paymentCount > 0
    ? `⚠️ This action is permanent.\n\nThis Invoice has ${preview.paymentCount} associated Payment${preview.paymentCount === 1 ? '' : 's'}.\n\nDeleting the Invoice will also permanently delete ${preview.paymentCount === 1 ? 'that Payment' : 'those Payments'} from this application.\n\nThis action cannot be undone.`
    : `This will permanently delete Invoice ${invoice.invoiceNumber} and its line items. This action cannot be undone.`;

  return (
    <ConfirmDialog
      title={`Delete Invoice ${invoice.invoiceNumber}?`}
      message={message}
      confirmLabel="Delete Permanently"
      danger
      requireTypedConfirmation="DELETE"
      onConfirm={async () => { await adminDataApi.deleteInvoice(invoice.id); onDeleted(); }}
      onClose={onClose}
    />
  );
}

function PaymentsSection() {
  const { data, mutate } = useSWR('admin-data-payments', () => paymentsApi.list());
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<PaymentListItem | null>(null);

  const filtered = (data ?? []).filter((p) =>
    p.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    `${p.customerFirstName ?? ''} ${p.customerLastName ?? ''} ${p.customerBusinessName ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SectionShell title="Payments">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by invoice number or customer name…" />
      <div className="space-y-2">
        {filtered.slice(0, 20).map((p) => (
          <ResultRow
            key={p.id}
            label={`${money(p.amount)} · ${p.method}`}
            sub={`${p.customerBusinessName || `${p.customerFirstName ?? ''} ${p.customerLastName ?? ''}`.trim()} · Invoice ${p.invoiceNumber}`}
            right={p.status}
            onDelete={() => setTarget(p)}
          />
        ))}
        {search && filtered.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No matching payments.</p>}
      </div>
      {target && (
        <ConfirmDialog
          title="Delete Payment?"
          message={`This will permanently delete this ${money(target.amount)} payment from this application. This does NOT contact Stripe or affect any external transaction — it only removes the local record. This action cannot be undone.`}
          confirmLabel="Delete Permanently"
          danger
          requireTypedConfirmation="DELETE"
          onConfirm={async () => { await adminDataApi.deletePayment(target.id); mutate(); }}
          onClose={() => setTarget(null)}
        />
      )}
    </SectionShell>
  );
}
