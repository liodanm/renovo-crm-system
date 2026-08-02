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
        <h3 className="text-sm font-semibold text-slate-800">Properties</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
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
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div>
          {property.label && <div className="text-xs font-medium text-slate-500">{property.label}</div>}
          <div className="text-sm text-slate-800">{property.addressLine1}</div>
          <div className="text-xs text-slate-500">
            {property.city}, {property.state} {property.postalCode}
          </div>
        </div>
        <button onClick={handleDelete} disabled={isDeleting} className="text-xs text-slate-400 hover:text-red-600">
          Remove
        </button>
      </div>
    </div>
  );
}

export function AddPropertyForm({ customerId, onClose, onAdded }: { customerId: string; onClose: () => void; onAdded: (property: Property) => void }) {
  const [form, setForm] = useState({ label: '', addressLine1: '', city: '', state: '', postalCode: '' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Add Property</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <input
          placeholder="Label (e.g. Main House)"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
        />
        <input
          required
          placeholder="Address"
          value={form.addressLine1}
          onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            required
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
          />
          <input
            required
            placeholder="State"
            value={form.state}
            onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
          />
          <input
            required
            placeholder="ZIP"
            value={form.postalCode}
            onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
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
