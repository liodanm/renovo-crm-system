'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { estimatesApi, SERVICE_TYPES, UNITS_OF_MEASURE } from '../../../lib/api/estimates';
import { ApiError } from '../../../lib/api/api-client';

// Kept as strings for the whole time they're being edited — this is
// deliberate, not an oversight. A controlled <input> whose value is
// derived from a number breaks the moment someone types a trailing
// decimal point ("12." immediately re-renders as "12", so the "." can
// never actually be typed). Parsed to real numbers only at calculation
// time (computeTotals below) and at submit time (handleSave) — never
// held as numbers in between.
interface DraftLineItem {
  key: string;
  serviceType: string;
  description: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  notes?: string;
  serviceDetails?: Record<string, unknown>;
}

function emptyLineItem(): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    serviceType: 'roof_soft_wash',
    description: '',
    unitOfMeasure: 'sq_ft',
    quantity: '',
    unitPrice: '',
  };
}

// Allows only digits and a single decimal point — typed naturally,
// nothing coerced mid-keystroke. Never rejects an intermediate state
// like "12." or "" (both valid while typing), only strips characters
// that could never be part of a valid number.
function sanitizeNumericInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

// Mirrors estimate-totals.util.ts exactly — this is a live preview only;
// the real, authoritative totals are always recomputed server-side on
// save, never trusted from this calculation. Recomputed on every render,
// which is what makes it update live as the person types — no debounce,
// no separate "calculate" step.
function computeTotals(items: DraftLineItem[], discountType: string, discountValueRaw: string, taxRatePercentRaw: string) {
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unitPrice), 0);
  const discountValue = toNumber(discountValueRaw);
  let discountAmount = 0;
  if (discountType && discountValue) {
    discountAmount = discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue;
    discountAmount = Math.min(discountAmount, subtotal);
  }
  const taxRatePercent = toNumber(taxRatePercentRaw);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRatePercent / 100);
  const total = taxableAmount + taxAmount;
  return { subtotal, discountAmount, taxAmount, total };
}

// A small, known list of service-detail keys that must be real numbers
// on submit (validated as such by the backend's per-service-type DTOs)
// but are edited as strings for the same reason quantity/unitPrice are —
// so a trailing decimal point can actually be typed.
const NUMERIC_DETAIL_KEYS = new Set(['roofSquareFootage', 'stories', 'squareFootage']);
function normalizeServiceDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return details;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    normalized[key] = NUMERIC_DETAIL_KEYS.has(key) && typeof value === 'string' ? toNumber(value) : value;
  }
  return normalized;
}

export default function NewEstimatePage() {
  const router = useRouter();

  // Root-caused: the backend caps pageSize at 100 (a real, validated
  // limit — see backend/src/customers/dto/query-customers.dto.ts). This
  // page was requesting 200, which class-validator rejects outright with
  // a 400 before the request ever reaches the database — not silently
  // capped. Every single load of this page has been failing this exact
  // request the whole time, which is the actual reason the dropdown was
  // empty. Confirmed by directly running the same validation this
  // endpoint runs, not assumed.
  const { data: customers, error: customersError, isLoading: customersLoading } = useSWR('customers-for-estimate', () =>
    customersApi.list({ pageSize: 100, sortBy: 'name', sortDir: 'asc' }),
  );

  const [customerId, setCustomerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const {
    data: properties,
    error: propertiesError,
    isLoading: propertiesLoading,
  } = useSWR(customerId ? ['properties', customerId] : null, () => customersApi.listProperties(customerId));

  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRatePercent, setTaxRatePercent] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const totals = computeTotals(lineItems, discountType, discountValue, taxRatePercent);

  function updateLineItem(key: string, patch: Partial<DraftLineItem>) {
    setLineItems((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeLineItem(key: string) {
    setLineItems((items) => (items.length > 1 ? items.filter((item) => item.key !== key) : items));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!customerId) errors.customer = 'Choose a customer.';
    if (!propertyId) errors.property = 'Choose a property.';
    if (lineItems.length === 0) errors.lineItems = 'Add at least one service.';

    lineItems.forEach((item, i) => {
      if (!item.description.trim()) errors[`item-${i}-description`] = 'Missing description';
      if (toNumber(item.quantity) <= 0) errors[`item-${i}-quantity`] = 'Quantity must be greater than 0';
      if (toNumber(item.unitPrice) <= 0) errors[`item-${i}-unitPrice`] = 'Unit price must be greater than 0';
    });

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return false;
    }
    setError(null);
    return true;
  }

  async function handleSave(andSend: boolean) {
    if (!validate()) return;

    setIsSaving(true);
    try {
      const estimate = await estimatesApi.create({
        customerId,
        propertyId,
        lineItems: lineItems.map(({ key, quantity, unitPrice, serviceDetails, ...rest }) => ({
          ...rest,
          quantity: toNumber(quantity),
          unitPrice: toNumber(unitPrice),
          serviceDetails: normalizeServiceDetails(serviceDetails),
        })),
        discountType: discountType || undefined,
        discountValue: discountType ? toNumber(discountValue) : undefined,
        taxRatePercent: taxRatePercent ? toNumber(taxRatePercent) : undefined,
        notes: notes || undefined,
      });
      if (andSend) {
        await estimatesApi.send(estimate.id);
      }
      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create estimate. Check your connection and try again.');
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
            {customersError ? (
              <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Couldn't load customers. <button onClick={() => window.location.reload()} className="underline">Retry</button>
              </div>
            ) : customersLoading ? (
              <div className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-400">Loading customers…</div>
            ) : customers && customers.data.length === 0 ? (
              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No customers found. <Link href="/customers" className="underline">Create a customer first</Link>.
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setPropertyId(''); setFieldErrors((f) => ({ ...f, customer: '' })); }}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${fieldErrors.customer ? 'border-red-400' : 'border-slate-300'}`}
              >
                <option value="">Select a customer…</option>
                {customers?.data.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
            )}
            {fieldErrors.customer && <p className="mt-1 text-xs text-red-600">{fieldErrors.customer}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Property</label>
            {!customerId ? (
              <select disabled className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-400">
                <option>Select a customer first…</option>
              </select>
            ) : propertiesError ? (
              <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Couldn't load properties.</div>
            ) : propertiesLoading ? (
              <div className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-400">Loading properties…</div>
            ) : properties && properties.length === 0 ? (
              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This customer has no properties yet.
              </div>
            ) : (
              <select
                value={propertyId}
                onChange={(e) => { setPropertyId(e.target.value); setFieldErrors((f) => ({ ...f, property: '' })); }}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${fieldErrors.property ? 'border-red-400' : 'border-slate-300'}`}
              >
                <option value="">Select a property…</option>
                {properties?.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.city}</option>)}
              </select>
            )}
            {fieldErrors.property && <p className="mt-1 text-xs text-red-600">{fieldErrors.property}</p>}
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

          {lineItems.map((item, i) => (
            <LineItemRow
              key={item.key}
              item={item}
              index={i}
              errors={fieldErrors}
              onChange={(patch) => updateLineItem(item.key, patch)}
              onRemove={() => removeLineItem(item.key)}
              canRemove={lineItems.length > 1}
            />
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
              type="text"
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(sanitizeNumericInput(e.target.value))}
              disabled={!discountType}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tax rate (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={taxRatePercent}
              onChange={(e) => setTaxRatePercent(sanitizeNumericInput(e.target.value))}
              placeholder="0.00"
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
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {totals.discountAmount > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span>−{formatCurrency(totals.discountAmount)}</span></div>}
            {totals.taxAmount > 0 && <div className="flex justify-between text-slate-600"><span>Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
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

function LineItemRow({
  item,
  index,
  errors,
  onChange,
  onRemove,
  canRemove,
}: {
  item: DraftLineItem;
  index: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<DraftLineItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const lineTotal = toNumber(item.quantity) * toNumber(item.unitPrice);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);

  function focusOnEnter(next: React.RefObject<HTMLInputElement | null>) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next.current?.focus();
      }
    };
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3">
          <label className="text-xs font-medium text-slate-500">Service</label>
          <select
            value={item.serviceType}
            onChange={(e) => {
              onChange({ serviceType: e.target.value });
              // Auto-focus Description right after picking a service —
              // the next thing anyone building an estimate actually
              // types, so the cursor should already be waiting there.
              requestAnimationFrame(() => descriptionRef.current?.focus());
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-5">
          <label className="text-xs font-medium text-slate-500">Description</label>
          <input
            ref={descriptionRef}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            onKeyDown={focusOnEnter(quantityRef)}
            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm ${errors[`item-${index}-description`] ? 'border-red-400' : 'border-slate-300'}`}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-500">Unit Type</label>
          <select value={item.unitOfMeasure} onChange={(e) => onChange({ unitOfMeasure: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-xs font-medium text-slate-500">Qty</label>
          <input
            ref={quantityRef}
            type="text"
            inputMode="decimal"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: sanitizeNumericInput(e.target.value) })}
            onKeyDown={focusOnEnter(unitPriceRef)}
            placeholder="0"
            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm ${errors[`item-${index}-quantity`] ? 'border-red-400' : 'border-slate-300'}`}
          />
        </div>
        <div className="col-span-1">
          <label className="text-xs font-medium text-slate-500">Unit Price</label>
          <input
            ref={unitPriceRef}
            type="text"
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(e) => onChange({ unitPrice: sanitizeNumericInput(e.target.value) })}
            placeholder="0.00"
            className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm ${errors[`item-${index}-unitPrice`] ? 'border-red-400' : 'border-slate-300'}`}
          />
        </div>
      </div>

      <ServiceDetailFields item={item} onChange={onChange} />

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-medium text-slate-700">Line total: {formatCurrency(lineTotal)}</span>
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
        <input type="text" inputMode="decimal" placeholder="Roof sq ft" value={(details.roofSquareFootage as string) ?? ''} onChange={(e) => setDetail('roofSquareFootage', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <select value={(details.roofType as string) || ''} onChange={(e) => setDetail('roofType', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Roof type…</option>
          <option value="tile">Tile</option><option value="shingle">Shingle</option><option value="metal">Metal</option>
        </select>
        <input type="text" inputMode="decimal" placeholder="Stories" value={(details.stories as string) ?? ''} onChange={(e) => setDetail('stories', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
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
        <input type="text" inputMode="decimal" placeholder="Sq ft" value={(details.squareFootage as string) ?? ''} onChange={(e) => setDetail('squareFootage', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
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
        <input type="text" inputMode="decimal" placeholder="Stories" value={(details.stories as string) ?? ''} onChange={(e) => setDetail('stories', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
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
