'use client';

import { useEffect, useRef, useState } from 'react';
import { customersApi, CustomerProfile, DuplicateCandidate } from '../../lib/api/customers';
import { ApiError } from '../../lib/api/api-client';

const MATCH_LABELS: Record<string, string> = {
  exact_email: 'Same email address',
  exact_phone: 'Same phone number',
  similar_name: 'Similar name',
};

export function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: CustomerProfile) => void }) {
  const [form, setForm] = useState({
    customerType: 'residential',
    firstName: '',
    lastName: '',
    businessName: '',
    email: '',
    phone: '',
  });
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Live duplicate check as the user types — debounced so we're not firing
  // a request on every keystroke.
  useEffect(() => {
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
  }, [form.email, form.phone, form.firstName, form.lastName, form.businessName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await customersApi.create({
        ...form,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        businessName: form.businessName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        acknowledgedDuplicateWarning: acknowledged,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4 text-sm">
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
            <Field label="Last name" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-800">Possible duplicate{duplicates.length > 1 ? 's' : ''} found</div>
              <ul className="mt-1.5 space-y-1">
                {duplicates.slice(0, 3).map((d) => (
                  <li key={d.id} className="text-xs text-amber-700">
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

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (duplicates.some((d) => d.matchReason === 'exact_email') && !acknowledged)}
              className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
      />
    </label>
  );
}
