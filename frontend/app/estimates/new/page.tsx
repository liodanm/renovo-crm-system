'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { estimatesApi, CreateLineItemInput, SERVICE_TYPES, UNITS_OF_MEASURE } from '../../../lib/api/estimates';
import { ApiError } from '../../../lib/api/api-client';

type DraftLineItem = CreateLineItemInput & { key: string };

function emptyLineItem(): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    serviceType: 'roof_soft_wash',
    description: '',
    unitOfMeasure: 'sq_ft',
    quantity: 0,
    unitPrice: 0,
  };
}

// Mirrors estimate-totals.util.ts exactly — this is a live preview only;
// the real, authoritative totals are always recomputed server-side on
// save, never trusted from this calculation.
function previewTotals(items: DraftLineItem[], discountType: string, discountValue: number, taxRatePercent: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  let discountAmount = 0;
  if (discountType && discountValue) {
    discountAmount = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
    discountAmount = Math.min(discountAmount, subtotal);
  }
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRatePercent / 100);
  const total = taxableAmount + taxAmount;
  return { subtotal, discountAmount, taxAmount, total };
}

export default function NewEstimatePage() {
  const router = useRouter();
  const { data: customers } = useSWR('customers-for-estimate', () => customersApi.list({ pageSize: 200 }));

  const [customerId, setCustomerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const { data: properties } = useSWR(customerId ? ['properties', customerId] : null, () => customersApi.listProperties(customerId));

  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = previewTotals(lineItems, discountType, discountValue, taxRatePercent);

  function updateLineItem(key: string, patch: Partial<DraftLineItem>) {
    setLineItems((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeLineItem(key: string) {
    setLineItems((items) => (items.length > 1 ? items.filter((item) => item.key !== key) : items));
  }

  async function handleSave(andSend: boolean) {
    setError(null);
    if (!customerId || !propertyId) {
      setError('Choose a customer and property first.');
      return;
    }
    if (lineItems.some((item) => !item.description || item.quantity <= 0 || item.unitPrice < 0)) {
      setError('Every line item needs a description, a quantity greater than zero, and a valid price.');
      return;
    }

    setIsSaving(true);
    try {
      const estimate = await estimatesApi.create({
        customerId,
        propertyId,
        lineItems: lineItems.map(({ key, ...rest }) => rest),
        discountType: discountType || undefined,
        discountValue: discountType ? discountValue : undefined,
        taxRatePercent: taxRatePercent || undefined,
        notes: notes || undefined,
      });
      if (andSend) {
        await estimatesApi.send(estimate.id);
      }
      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create estimate.');
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-[var(--color-brand)]">Renovo CRM</Link>
          <nav className="hidden gap-4 text-sm font-medium text-slate-500 sm:flex">
            <Link href="/" className="hover:text-slate-800">Dashboard</Link>
            <Link href="/customers" className="hover:text-slate-800">Customers</Link>
            <Link href="/estimates" className="text-slate-900">Estimates</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/estimates" className="text-sm text-slate-500 hover:text-slate-800">← Back to Estimates</Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">New Estimate</h1>

        {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Customer</label>
            <select
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPropertyId(''); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Property</label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={!customerId}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Select a property…</option>
              {properties?.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.city}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Line Items</h2>
            <button
              onClick={() => setLineItems((items) => [...items, emptyLineItem()])}
              className="text-sm font-medium text-[var(--color-brand)]"
            >
              + Add service
            </button>
          </div>

          {lineItems.map((item) => (
            <LineItemRow key={item.key} item={item} onChange={(patch) => updateLineItem(item.key, patch)} onRemove={() => removeLineItem(item.key)} canRemove={lineItems.length > 1} />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Discount type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">None</option>
              <option value="fixed">Fixed ($)</option>
              <option value="percentage">Percentage (%)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Discount value</label>
            <input
              type="number"
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(Number(e.target.value))}
              disabled={!discountType}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tax rate (%)</label>
            <input
              type="number"
              value={taxRatePercent || ''}
              onChange={(e) => setTaxRatePercent(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            {totals.discountAmount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span>−${totals.discountAmount.toFixed(2)}</span></div>}
            {totals.taxAmount > 0 && <div className="flex justify-between text-slate-600"><span>Tax</span><span>${totals.taxAmount.toFixed(2)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
          </div>
          <p className="mt-2 text-right text-xs text-slate-400">Final totals are always recalculated when you save.</p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => handleSave(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save as Draft'}
          </button>
          <button onClick={() => handleSave(true)} disabled={isSaving} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save & Send'}
          </button>
        </div>
      </main>
    </div>
  );
}

function LineItemRow({ item, onChange, onRemove, canRemove }: { item: DraftLineItem; onChange: (patch: Partial<DraftLineItem>) => void; onRemove: () => void; canRemove: boolean }) {
  const lineTotal = item.quantity * item.unitPrice;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className="text-xs font-medium text-slate-500">Service</label>
          <select value={item.serviceType} onChange={(e) => onChange({ serviceType: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-5">
          <label className="text-xs font-medium text-slate-500">Description</label>
          <input value={item.description} onChange={(e) => onChange({ description: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-500">Unit</label>
          <select value={item.unitOfMeasure} onChange={(e) => onChange({ unitOfMeasure: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-xs font-medium text-slate-500">Qty</label>
          <input type="number" value={item.quantity || ''} onChange={(e) => onChange({ quantity: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="col-span-1">
          <label className="text-xs font-medium text-slate-500">Price</label>
          <input type="number" value={item.unitPrice || ''} onChange={(e) => onChange({ unitPrice: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      <ServiceDetailFields item={item} onChange={onChange} />

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-medium text-slate-700">Line total: ${lineTotal.toFixed(2)}</span>
        {canRemove && <button onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-700">Remove</button>}
      </div>
    </div>
  );
}

// Only the three service types with a real, validated shape on the
// backend get dedicated fields here — matching dto/service-details/
// exactly. Every other service type has no known-correct shape yet, same
// reasoning as the backend, so no fields render for them.
function ServiceDetailFields({ item, onChange }: { item: DraftLineItem; onChange: (patch: Partial<DraftLineItem>) => void }) {
  const details = item.serviceDetails ?? {};
  function setDetail(key: string, value: unknown) {
    onChange({ serviceDetails: { ...details, [key]: value } });
  }

  if (item.serviceType === 'roof_soft_wash') {
    return (
      <div className="mt-3 grid grid-cols-4 gap-3 border-t border-slate-100 pt-3">
        <input type="number" placeholder="Roof sq ft" value={(details.roofSquareFootage as number) || ''} onChange={(e) => setDetail('roofSquareFootage', Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={(details.roofType as string) || ''} onChange={(e) => setDetail('roofType', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Roof type…</option>
          <option value="tile">Tile</option><option value="shingle">Shingle</option><option value="metal">Metal</option>
        </select>
        <input type="number" placeholder="Stories" value={(details.stories as number) || ''} onChange={(e) => setDetail('stories', Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={(details.pitch as string) || ''} onChange={(e) => setDetail('pitch', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Pitch…</option>
          <option value="low">Low</option><option value="medium">Medium</option><option value="steep">Steep</option>
        </select>
      </div>
    );
  }

  if (item.serviceType === 'driveway_cleaning') {
    return (
      <div className="mt-3 grid grid-cols-4 gap-3 border-t border-slate-100 pt-3">
        <input type="number" placeholder="Sq ft" value={(details.squareFootage as number) || ''} onChange={(e) => setDetail('squareFootage', Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={(details.surfaceMaterial as string) || ''} onChange={(e) => setDetail('surfaceMaterial', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Surface…</option>
          <option value="concrete">Concrete</option><option value="pavers">Pavers</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!details.hasOilStains} onChange={(e) => setDetail('hasOilStains', e.target.checked)} /> Oil stains
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!details.hasRustStains} onChange={(e) => setDetail('hasRustStains', e.target.checked)} /> Rust stains
        </label>
      </div>
    );
  }

  if (item.serviceType === 'house_wash') {
    return (
      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
        <input type="number" placeholder="Stories" value={(details.stories as number) || ''} onChange={(e) => setDetail('stories', Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={(details.exteriorMaterial as string) || ''} onChange={(e) => setDetail('exteriorMaterial', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Exterior material…</option>
          <option value="vinyl">Vinyl</option><option value="brick">Brick</option><option value="stucco">Stucco</option>
          <option value="wood">Wood</option><option value="fiber_cement">Fiber cement</option><option value="other">Other</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!details.oxidationPresent} onChange={(e) => setDetail('oxidationPresent', e.target.checked)} /> Oxidation present
        </label>
      </div>
    );
  }

  return null;
}
