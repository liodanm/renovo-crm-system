'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { customersApi, Property } from '../../../lib/api/customers';
import { CardSkeleton, CardEmpty, CardError } from '../../dashboard/dashboard-card';

export function PropertiesTab({ customerId }: { customerId: string }) {
  const { data: properties, error, isLoading, mutate } = useSWR(
    [`properties`, customerId],
    () => customersApi.listProperties(customerId),
  );
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Properties</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
        >
          + Add Property
        </button>
      </div>

      {isLoading && <CardSkeleton lines={3} />}
      {error && <CardError />}
      {!isLoading && !error && properties && properties.length === 0 && <CardEmpty message="No properties on file yet." />}

      {!isLoading && !error && properties && properties.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} customerId={customerId} onChanged={() => mutate()} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddPropertyForm
          customerId={customerId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function PropertyCard({ property, customerId, onChanged }: { property: Property; customerId: string; onChanged: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm('Remove this property? Historical jobs and photos tied to it are kept.')) return;
    setIsDeleting(true);
    try {
      await customersApi.deleteProperty(customerId, property.id);
      onChanged();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-start justify-between">
        <div>
          {property.label && <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{property.label}</div>}
          <div className="text-sm text-slate-800 dark:text-slate-100">{property.addressLine1}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {property.city}, {property.state} {property.postalCode}
          </div>
        </div>
        <button onClick={handleDelete} disabled={isDeleting} className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-600 dark:text-red-400">
          Remove
        </button>
      </div>
    </div>
  );
}

export interface PropertyFormValues {
  label: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

export const EMPTY_PROPERTY_FORM_VALUES: PropertyFormValues = { label: '', addressLine1: '', city: '', state: '', postalCode: '' };

/**
 * Extracted from AddPropertyForm below so the combined Customer+Property
 * creation flow (create-customer-modal.tsx) can reuse the exact same
 * fields without nesting AddPropertyForm's own standalone modal+<form>
 * inside another form (invalid HTML, and a confusing double-overlay UI).
 * AddPropertyForm still owns its own chrome/submit/API-call — this only
 * extracted the field markup, not the surrounding behavior.
 *
 * `required` defaults to true, matching AddPropertyForm's existing
 * behavior exactly. The combined-creation flow sets it to false, since
 * leaving property fields blank there means "skip the property," not
 * "block the whole form" — native HTML `required` would otherwise block
 * customer creation too, which is explicitly not the intended behavior.
 */
export function PropertyFields({
  values,
  onChange,
  required = true,
}: {
  values: PropertyFormValues;
  onChange: (values: PropertyFormValues) => void;
  required?: boolean;
}) {
  return (
    <>
      <input
        placeholder="Label (e.g. Main House)"
        value={values.label}
        onChange={(e) => onChange({ ...values, label: e.target.value })}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      <input
        required={required}
        placeholder="Address"
        value={values.addressLine1}
        onChange={(e) => onChange({ ...values, addressLine1: e.target.value })}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          required={required}
          placeholder="City"
          value={values.city}
          onChange={(e) => onChange({ ...values, city: e.target.value })}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <input
          required={required}
          placeholder="State"
          value={values.state}
          onChange={(e) => onChange({ ...values, state: e.target.value })}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
        <input
          required={required}
          placeholder="ZIP"
          value={values.postalCode}
          onChange={(e) => onChange({ ...values, postalCode: e.target.value })}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>
    </>
  );
}

export function AddPropertyForm({ customerId, onClose, onAdded }: { customerId: string; onClose: () => void; onAdded: (property: Property) => void }) {
  const [form, setForm] = useState<PropertyFormValues>(EMPTY_PROPERTY_FORM_VALUES);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const created = await customersApi.createProperty(customerId, form as any);
      onAdded(created);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-6 sm:items-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-3 rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add Property</h3>
          <button type="button" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
            ✕
          </button>
        </div>
        <PropertyFields values={form} onChange={setForm} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)]"
          >
            {isSaving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
