'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { customersApi, DuplicateCandidate } from '../../lib/api/customers';
import { settingsApi } from '../../lib/api/settings';
import { ApiError } from '../../lib/api/api-client';

const MATCH_LABELS: Record<string, string> = {
  exact_email: 'Same email address',
  exact_phone: 'Same phone number',
  similar_name: 'Similar name',
};

export interface CustomerFormValues {
  customerType: 'residential' | 'commercial';
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  secondaryPhone: string;
  leadStatus: string;
  source: string;
}

export const EMPTY_CUSTOMER_FORM_VALUES: CustomerFormValues = {
  customerType: 'residential',
  firstName: '',
  lastName: '',
  businessName: '',
  email: '',
  phone: '',
  secondaryPhone: '',
  leadStatus: 'lead',
  source: '',
};

/**
 * The one Customer form — used by CreateCustomerModal (wrapped in modal
 * chrome) and the Edit Customer page (wrapped in page chrome). Neither
 * duplicates this field-rendering/validation logic; both call this
 * unchanged. See PROJECT_CONTEXT.md's audit notes on why this extraction
 * happened before Edit was built, not after.
 *
 * Live duplicate-check only runs in 'create' mode — the duplicate-check
 * endpoint has no way to exclude the record being edited, and detecting
 * duplicates is inherently a create-time concern (nothing new is being
 * created on an edit), so it's simply not run there rather than papering
 * over a mismatch with a backend change that wasn't otherwise needed.
 */
export function CustomerForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  submittingLabel,
  showLeadStatusAndSecondaryPhone = false,
  onDirtyChange,
  hideActions = false,
  formRef,
  children,
}: {
  mode: 'create' | 'edit';
  initialValues: CustomerFormValues;
  onSubmit: (values: CustomerFormValues, acknowledgedDuplicateWarning: boolean) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  submittingLabel: string;
  showLeadStatusAndSecondaryPhone?: boolean;
  /** Fires whenever the form's values differ from initialValues — lets a
      caller (the Edit page) drive an unsaved-changes warning and a
      disabled/hidden Save button without CustomerForm needing to know
      why. Create doesn't pass this; nothing changes for it. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** When an external action bar (e.g. SettingsSectionShell's sticky
      Save/Cancel) already drives submission, hide this form's own
      inline buttons instead of showing two Save/Cancel pairs. Create
      doesn't set this — its inline buttons remain the only ones. */
  hideActions?: boolean;
  /** Lets an external Save button trigger this form's own submit path
      (formRef.current.requestSubmit()) instead of a second submit
      implementation. */
  formRef?: React.RefObject<HTMLFormElement>;
  /** Optional extra content rendered inside the same <form>, after the
      core fields, before the duplicate-warning/error/buttons — used by
      the combined Customer+Property flow to inline property fields
      without a second <form> tag. No existing caller passes this. */
  children?: React.ReactNode;
}) {
  const [form, setForm] = useState<CustomerFormValues>(initialValues);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const { data: leadSources } = useSWR('settings-lead-sources', () => settingsApi.getLeadSources());
  const enabledSources = (leadSources?.options ?? []).filter((o) => o.enabled);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(form) !== JSON.stringify(initialValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  useEffect(() => {
    if (mode !== 'create') return;
    if (!form.email && !form.phone && !form.firstName && !form.lastName && !form.businessName) {
      setDuplicates([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const candidates = await customersApi.checkDuplicate({
          email: form.email || undefined,
          phone: form.phone || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          businessName: form.businessName || undefined,
        });
        setDuplicates(candidates);
        setAcknowledged(false);
      } catch {
        // Duplicate check failing silently shouldn't block the form — the
        // backend still enforces the exact-email hard-stop on submit.
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, form.email, form.phone, form.firstName, form.lastName, form.businessName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(form, acknowledged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-4 text-base lg:text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={form.customerType === 'residential'}
            onChange={() => setForm((f) => ({ ...f, customerType: 'residential' }))}
          />
          Residential
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={form.customerType === 'commercial'}
            onChange={() => setForm((f) => ({ ...f, customerType: 'commercial' }))}
          />
          Commercial
        </label>
      </div>

      {form.customerType === 'commercial' && (
        <Field label="Business name" value={form.businessName} onChange={(v) => setForm((f) => ({ ...f, businessName: v }))} />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
        <Field label="Last name" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">How did they find you?</span>
        <select
          value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
          className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        >
          <option value="">Not specified</option>
          {enabledSources.map((o) => (
            <option key={o.key} value={o.label}>
              {o.label}
            </option>
          ))}
          {/* The customer's current value, even if it's since been
              disabled or removed from Settings (or is a historical
              value like "csv_import"/"website" that was never a
              curated option to begin with) — editing this customer's
              other fields should never silently drop or change what
              their source already was. */}
          {form.source && !enabledSources.some((o) => o.label === form.source) && (
            <option value={form.source}>{form.source}</option>
          )}
        </select>
      </label>

      {showLeadStatusAndSecondaryPhone && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Secondary phone" value={form.secondaryPhone} onChange={(v) => setForm((f) => ({ ...f, secondaryPhone: v }))} />
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Lead status</span>
            <select
              value={form.leadStatus}
              onChange={(e) => setForm((f) => ({ ...f, leadStatus: e.target.value }))}
              className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            >
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
              <option value="churned">Churned</option>
            </select>
          </div>
        </div>
      )}

      {children}

      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 p-3">
          <div className="text-xs font-semibold text-amber-800">Possible duplicate{duplicates.length > 1 ? 's' : ''} found</div>
          <ul className="mt-1.5 space-y-1">
            {duplicates.slice(0, 3).map((d) => (
              <li key={d.id} className="text-xs text-amber-700 dark:text-amber-300">
                <span className="font-medium">{d.displayName}</span> — {MATCH_LABELS[d.matchReason]}
                {d.email ? ` (${d.email})` : d.phone ? ` (${d.phone})` : ''}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            This is a different customer — create anyway
          </label>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {!hideActions && (
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-3 text-base font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 lg:py-2 lg:text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (duplicates.some((d) => d.matchReason === 'exact_email') && !acknowledged)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-4 py-3 text-base font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50 lg:py-2 lg:text-sm"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
    </label>
  );
}
