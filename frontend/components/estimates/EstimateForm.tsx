'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { customersApi } from '../../lib/api/customers';
import { settingsApi } from '../../lib/api/settings';
import { estimatesApi, SERVICE_TYPES, UNITS_OF_MEASURE, type Estimate } from '../../lib/api/estimates';
import { ApiError } from '../../lib/api/api-client';
import { AppShell } from '../layout/AppShell';
import { serviceCatalogApi, type ServiceCatalogItem } from '../../lib/api/service-catalog';

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
  serviceCatalogItemId?: string;
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
// save, never trusted from this calculation.
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

const NUMERIC_DETAIL_KEYS = new Set(['roofSquareFootage', 'stories', 'squareFootage']);
function normalizeServiceDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return details;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    normalized[key] = NUMERIC_DETAIL_KEYS.has(key) && typeof value === 'string' ? toNumber(value) : value;
  }
  return normalized;
}

function lineItemFromExisting(li: Estimate['lineItems'][number]): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    serviceType: li.serviceType ?? 'other',
    description: li.description,
    unitOfMeasure: li.unitOfMeasure ?? 'each',
    quantity: String(li.quantity),
    unitPrice: String(li.unitPrice),
    notes: li.notes ?? undefined,
    serviceDetails: (li.serviceDetails as Record<string, unknown>) ?? undefined,
    serviceCatalogItemId: li.serviceCatalogItemId ?? undefined,
  };
}

/**
 * One shared Create/Edit form — the original /estimates/new page's form,
 * extracted so editing a draft never means a second, drifting copy of
 * this logic. `existingEstimate` being present is what switches every
 * behavior below from create to edit; there is no other mode flag.
 */
export function EstimateForm({ existingEstimate }: { existingEstimate?: Estimate }) {
  const router = useRouter();
  const isEdit = !!existingEstimate;

  const { data: customers, error: customersError, isLoading: customersLoading } = useSWR('customers-for-estimate', () =>
    customersApi.list({ pageSize: 100, sortBy: 'name', sortDir: 'asc' }),
  );

  const [customerId, setCustomerId] = useState(existingEstimate?.customer.id ?? '');
  const [propertyId, setPropertyId] = useState(existingEstimate?.property.id ?? '');
  const {
    data: properties,
    error: propertiesError,
    isLoading: propertiesLoading,
  } = useSWR(customerId ? ['properties', customerId] : null, () => customersApi.listProperties(customerId));

  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    existingEstimate && existingEstimate.lineItems.length > 0 ? existingEstimate.lineItems.map(lineItemFromExisting) : [emptyLineItem()],
  );
  const [discountType, setDiscountType] = useState(existingEstimate?.discountType ?? '');
  const [discountValue, setDiscountValue] = useState(existingEstimate?.discountAmount ? String(existingEstimate.discountAmount) : '');
  const [taxRatePercent, setTaxRatePercent] = useState(existingEstimate ? String(Number(existingEstimate.taxRate) * 100) : '');
  const [notes, setNotes] = useState(existingEstimate?.notes ?? '');
  const [internalNotes, setInternalNotes] = useState(existingEstimate?.internalNotes ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const totals = computeTotals(lineItems, discountType, discountValue, taxRatePercent);

  // Real integration, not just stored data: a NEW estimate's tax rate
  // starts from the company's Business Default the moment this page
  // loads. Never runs (and never overwrites anything) in edit mode —
  // an existing estimate's tax rate is real, already-saved data, not a
  // default to reapply.
  useEffect(() => {
    if (isEdit) return;
    settingsApi.getBusinessDefaults().then((defaults) => {
      if (defaults.defaultTaxRatePercent) {
        setTaxRatePercent((current) => (current === '' ? defaults.defaultTaxRatePercent! : current));
      }
    }).catch(() => undefined);
  }, [isEdit]);

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
      const payload = {
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
        internalNotes: internalNotes || undefined,
      };

      const estimate = isEdit ? await estimatesApi.update(existingEstimate!.id, payload) : await estimatesApi.create(payload);
      if (andSend && !isEdit) {
        await estimatesApi.send(estimate.id);
      }
      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEdit ? 'update' : 'create'} estimate. Check your connection and try again.`);
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href={isEdit ? `/estimates/${existingEstimate!.id}` : '/estimates'} className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to {isEdit ? 'Estimate' : 'Estimates'}
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{isEdit ? `Edit Estimate ${existingEstimate!.estimateNumber}` : 'New Estimate'}</h1>

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
            <div className="flex items-center gap-3">
              <CatalogPicker
                onPick={(catalogItem) =>
                  setLineItems((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      serviceType: catalogItem.serviceType,
                      description: catalogItem.name,
                      unitOfMeasure: catalogItem.defaultUnitOfMeasure ?? 'each',
                      quantity: '1',
                      unitPrice: catalogItem.defaultUnitPrice ?? '',
                      notes: catalogItem.defaultNotes ?? undefined,
                      serviceCatalogItemId: catalogItem.id,
                    },
                  ])
                }
              />
              <button onClick={() => setLineItems((items) => [...items, emptyLineItem()])} className="text-sm font-medium text-[var(--color-brand)]">
                + Add service
              </button>
            </div>
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
          <label className="text-sm font-medium text-slate-700">Notes (optional — visible to the customer)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Internal Notes (optional — staff only, never shown to the customer)</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Customer asked to wait until next month, use 4% SH because roof is older…"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
          />
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
          {isEdit ? (
            <button onClick={() => handleSave(false)} disabled={isSaving} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          ) : (
            <>
              <button onClick={() => handleSave(false)} disabled={isSaving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {isSaving ? 'Saving…' : 'Save as Draft'}
              </button>
              <button onClick={() => handleSave(true)} disabled={isSaving} className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving…' : 'Save & Send'}
              </button>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function CatalogPicker({ onPick }: { onPick: (item: ServiceCatalogItem) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: items } = useSWR('service-catalog-active', () => serviceCatalogApi.list(true));

  return (
    <div className="relative">
      <button onClick={() => setIsOpen((v) => !v)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
        Load from Catalog
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {(!items || items.length === 0) && <p className="p-3 text-xs text-slate-400">No active services in your catalog yet.</p>}
            {items?.map((item) => (
              <button key={item.id} onClick={() => { onPick(item); setIsOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-800">{item.name}</span>
                {item.defaultUnitPrice && <span className="ml-1.5 text-xs text-slate-400">${item.defaultUnitPrice}</span>}
              </button>
            ))}
          </div>
        </>
      )}
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
