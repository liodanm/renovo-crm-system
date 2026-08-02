'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { customersApi, type Property } from '../../lib/api/customers';
import { settingsApi } from '../../lib/api/settings';
import { estimatesApi, SERVICE_TYPES, UNITS_OF_MEASURE, type Estimate } from '../../lib/api/estimates';
import { ApiError } from '../../lib/api/api-client';
import { AppShell } from '../layout/AppShell';
import { serviceCatalogApi, type ServiceCatalogItem } from '../../lib/api/service-catalog';
import { CustomerPicker } from './CustomerPicker';
import { AddPropertyForm } from '../customers/tabs/properties-tab';
import { recordRecentCustomer } from '../../lib/hooks/use-recent-customers';
import { CardEmpty } from '../dashboard/dashboard-card';

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

// A closed tab or accidental back-navigation shouldn't erase a half-typed
// estimate. Draft-only, new-estimate-only (never edit mode — an existing
// estimate's real saved data is never something to silently overwrite
// with a stale local draft), localStorage only, cleared the moment a
// save actually succeeds. No backend involvement at all.
const DRAFT_STORAGE_KEY = 'renovo:new-estimate-draft';

interface PersistedDraft {
  customerId: string;
  customerDisplayName: string;
  propertyId: string;
  lineItems: DraftLineItem[];
  discountType: string;
  discountValue: string;
  taxRatePercent: string;
  notes: string;
  internalNotes: string;
  validUntil: string;
}

function loadDraft(): PersistedDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: PersistedDraft) {
  if (typeof window === 'undefined') return;
  try {
    // localStorage (not sessionStorage) so it survives an accidentally
    // closed tab, not just an in-tab navigation — that's the actual
    // failure mode this is protecting against.
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is a convenience, never worth breaking the form over.
  }
}

function clearDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // no-op
  }
}

function customerNameOf(customer: { firstName: string | null; lastName: string | null; businessName: string | null }): string {
  return customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
}

/**
 * One shared Create/Edit form — the original /estimates/new page's form,
 * extracted so editing a draft never means a second, drifting copy of
 * this logic. `existingEstimate` being present is what switches every
 * behavior below from create to edit; there is no other mode flag.
 */
export function EstimateForm({ existingEstimate, initialCustomerId }: { existingEstimate?: Estimate; initialCustomerId?: string }) {
  const router = useRouter();
  const isEdit = !!existingEstimate;

  // A saved draft only applies to a fresh /estimates/new visit — never in
  // edit mode, and never overriding an explicit ?customerId= link (that's
  // a deliberate "start here" instruction from the Customer Profile page,
  // which should win over a stale leftover draft).
  const restoredDraft = !isEdit && !initialCustomerId ? loadDraft() : null;

  const { data: customers, error: customersError, isLoading: customersLoading, mutate: mutateCustomers } = useSWR('customers-for-estimate', () =>
    customersApi.list({ pageSize: 100, sortBy: 'name', sortDir: 'asc' }),
  );

  const [customerId, setCustomerId] = useState(existingEstimate?.customer.id ?? initialCustomerId ?? restoredDraft?.customerId ?? '');
  const [customerDisplayName, setCustomerDisplayName] = useState(
    existingEstimate ? customerNameOf(existingEstimate.customer) : restoredDraft?.customerDisplayName ?? '',
  );
  const [propertyId, setPropertyId] = useState(existingEstimate?.property.id ?? restoredDraft?.propertyId ?? '');
  const [showAddProperty, setShowAddProperty] = useState(false);
  const {
    data: properties,
    error: propertiesError,
    isLoading: propertiesLoading,
    mutate: mutateProperties,
  } = useSWR(customerId ? ['properties', customerId] : null, () => customersApi.listProperties(customerId));

  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    existingEstimate && existingEstimate.lineItems.length > 0
      ? existingEstimate.lineItems.map(lineItemFromExisting)
      : restoredDraft?.lineItems?.length
        ? restoredDraft.lineItems
        : [],
  );
  const [discountType, setDiscountType] = useState(existingEstimate?.discountType ?? restoredDraft?.discountType ?? '');
  // existingEstimate.discountAmount is always a resolved DOLLAR figure,
  // regardless of discountType — for a 'percentage' discount, showing that
  // dollar amount directly in this field (as previously happened) shows
  // the wrong number and, if saved without being touched, silently
  // recomputes a much larger discount against the current subtotal. Only
  // 'fixed' discounts have a raw value equal to discountAmount; a
  // 'percentage' discount's raw value has to be reconstructed from
  // discountAmount / subtotal.
  const [discountValue, setDiscountValue] = useState(() => {
    if (existingEstimate?.discountAmount && Number(existingEstimate.discountAmount) > 0) {
      const amount = Number(existingEstimate.discountAmount);
      if (existingEstimate.discountType === 'percentage') {
        const subtotal = Number(existingEstimate.subtotal);
        return subtotal > 0 ? String(Math.round((amount / subtotal) * 10000) / 100) : '';
      }
      return String(amount);
    }
    return restoredDraft?.discountValue ?? '';
  });
  const [taxRatePercent, setTaxRatePercent] = useState(existingEstimate ? String(Number(existingEstimate.taxRate) * 100) : restoredDraft?.taxRatePercent ?? '');
  const [notes, setNotes] = useState(existingEstimate?.notes ?? restoredDraft?.notes ?? '');
  const [internalNotes, setInternalNotes] = useState(existingEstimate?.internalNotes ?? restoredDraft?.internalNotes ?? '');
  const [validUntil, setValidUntil] = useState(existingEstimate?.validUntil?.slice(0, 10) ?? restoredDraft?.validUntil ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const totals = computeTotals(lineItems, discountType, discountValue, taxRatePercent);

  // Persist the in-progress draft — new-estimate mode only. Debounced via
  // a plain effect dependency array (React already only re-runs this on
  // actual value changes, so no separate timer is needed for something
  // this cheap).
  useEffect(() => {
    if (isEdit) return;
    saveDraft({ customerId, customerDisplayName, propertyId, lineItems, discountType, discountValue, taxRatePercent, notes, internalNotes, validUntil });
  }, [isEdit, customerId, customerDisplayName, propertyId, lineItems, discountType, discountValue, taxRatePercent, notes, internalNotes, validUntil]);

  // If we arrived pre-filled from a customer's profile (or resumed the
  // customer from a restored draft), the picker still needs a display
  // label before the customers list has loaded — falls back to it once
  // that list is in.
  useEffect(() => {
    if (customerDisplayName || !customerId || !customers) return;
    const match = customers.data.find((c) => c.id === customerId);
    if (match) setCustomerDisplayName(match.displayName);
  }, [customerDisplayName, customerId, customers]);

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
        validUntil: validUntil || undefined,
      };

      const estimate = isEdit ? await estimatesApi.update(existingEstimate!.id, payload) : await estimatesApi.create(payload);
      if (andSend && !isEdit) {
        await estimatesApi.send(estimate.id);
      }
      if (!isEdit) {
        clearDraft();
        recordRecentCustomer(customerId);
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

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Customer</label>
            {customersError ? (
              <div className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Couldn't load customers. <button onClick={() => window.location.reload()} className="underline">Retry</button>
              </div>
            ) : customersLoading ? (
              <div className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-400">Loading customers…</div>
            ) : (
              <CustomerPicker
                customers={customers?.data ?? []}
                value={customerId}
                selectedLabel={customerDisplayName}
                hasError={!!fieldErrors.customer}
                onSelect={(id, displayName) => {
                  setCustomerId(id);
                  setCustomerDisplayName(displayName);
                  setPropertyId('');
                  setFieldErrors((f) => ({ ...f, customer: '' }));
                }}
                onCreated={(customer) => {
                  const displayName = customer.businessName ?? (`${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Unknown');
                  setCustomerId(customer.id);
                  setCustomerDisplayName(displayName);
                  setPropertyId('');
                  setFieldErrors((f) => ({ ...f, customer: '' }));
                  // Refresh the picker's list in the background so a
                  // reopened dropdown includes the customer just created
                  // — same existing endpoint, just re-fetched.
                  mutateCustomers();
                }}
              />
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
              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span>No properties yet — likely a quick-added customer.</span>
                <button type="button" onClick={() => setShowAddProperty(true)} className="shrink-0 font-semibold text-[var(--color-brand)] underline">
                  + Add address
                </button>
              </div>
            ) : (
              <select
                value={propertyId}
                onChange={(e) => { setPropertyId(e.target.value); setFieldErrors((f) => ({ ...f, property: '' })); }}
                className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm ${fieldErrors.property ? 'border-red-400' : 'border-slate-300'}`}
              >
                <option value="">Select a property…</option>
                {properties?.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.city}</option>)}
              </select>
            )}
            {fieldErrors.property && <p className="mt-1 text-xs text-red-600">{fieldErrors.property}</p>}
            {showAddProperty && customerId && (
              <AddPropertyForm
                customerId={customerId}
                onClose={() => setShowAddProperty(false)}
                onAdded={(property: Property) => {
                  setShowAddProperty(false);
                  setPropertyId(property.id);
                  setFieldErrors((f) => ({ ...f, property: '' }));
                  mutateProperties();
                }}
              />
            )}
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
                      description: catalogItem.description || catalogItem.name,
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

          {lineItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
              <CardEmpty
                message='No services added yet. Click below to add your first service.'
                action={
                  <button
                    type="button"
                    onClick={() => setLineItems((items) => [...items, emptyLineItem()])}
                    className="rounded-lg bg-[var(--color-brand)] px-4 py-3 text-base font-semibold text-white hover:bg-[var(--color-brand-dark)] lg:py-2 lg:text-sm"
                  >
                    + Add First Line Item
                  </button>
                }
              />
            </div>
          ) : (
            lineItems.map((item, i) => (
              <LineItemRow
                key={item.key}
                item={item}
                index={i}
                errors={fieldErrors}
                onChange={(patch) => updateLineItem(item.key, patch)}
                onRemove={() => removeLineItem(item.key)}
                canRemove={lineItems.length > 1}
              />
            ))
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Valid until</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Discount type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm">
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100 lg:px-3 lg:py-2 lg:text-sm"
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Notes (optional — visible to the customer)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm" />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Internal Notes (optional — staff only, never shown to the customer)</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Customer asked to wait until next month, use 4% SH because roof is older…"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm"
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

        {/* Mobile: sticky bottom bar so Save never requires scrolling past
            everything above it — same sticky+blur+border technique already
            proven in FieldActionBar.tsx (that one sticks to the top of the
            Job page; this one sticks to the bottom, the correct edge for a
            save action). Desktop reverts to the original static inline
            layout at lg+, unchanged. */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex-nowrap lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none">
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <label className="text-xs font-medium text-slate-500">Service</label>
          <select
            value={item.serviceType}
            onChange={(e) => {
              onChange({ serviceType: e.target.value });
              requestAnimationFrame(() => descriptionRef.current?.focus());
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm"
          >
            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="lg:col-span-5">
          <label className="text-xs font-medium text-slate-500">Description</label>
          <input
            ref={descriptionRef}
            value={item.description}
            onChange={(e) => onChange({ description: e.target.value })}
            onKeyDown={focusOnEnter(quantityRef)}
            className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm ${errors[`item-${index}-description`] ? 'border-red-400' : 'border-slate-300'}`}
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-xs font-medium text-slate-500">Unit Type</label>
          <select value={item.unitOfMeasure} onChange={(e) => onChange({ unitOfMeasure: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm">
            {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="lg:col-span-1">
          <label className="text-xs font-medium text-slate-500">Qty</label>
          <input
            ref={quantityRef}
            type="text"
            inputMode="decimal"
            value={item.quantity}
            onChange={(e) => onChange({ quantity: sanitizeNumericInput(e.target.value) })}
            onKeyDown={focusOnEnter(unitPriceRef)}
            placeholder="0"
            className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm ${errors[`item-${index}-quantity`] ? 'border-red-400' : 'border-slate-300'}`}
          />
        </div>
        <div className="lg:col-span-1">
          <label className="text-xs font-medium text-slate-500">Unit Price</label>
          <input
            ref={unitPriceRef}
            type="text"
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(e) => onChange({ unitPrice: sanitizeNumericInput(e.target.value) })}
            placeholder="0.00"
            className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm ${errors[`item-${index}-unitPrice`] ? 'border-red-400' : 'border-slate-300'}`}
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
      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 lg:grid-cols-4">
        <input type="text" inputMode="decimal" placeholder="Roof sq ft" value={(details.roofSquareFootage as string) ?? ''} onChange={(e) => setDetail('roofSquareFootage', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm" />
        <select value={(details.roofType as string) || ''} onChange={(e) => setDetail('roofType', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm">
          <option value="">Roof type…</option>
          <option value="tile">Tile</option><option value="shingle">Shingle</option><option value="metal">Metal</option>
        </select>
        <input type="text" inputMode="decimal" placeholder="Stories" value={(details.stories as string) ?? ''} onChange={(e) => setDetail('stories', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm" />
        <select value={(details.pitch as string) || ''} onChange={(e) => setDetail('pitch', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm">
          <option value="">Pitch…</option>
          <option value="low">Low</option><option value="medium">Medium</option><option value="steep">Steep</option>
        </select>
      </div>
    );
  }

  if (item.serviceType === 'driveway_cleaning') {
    return (
      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 lg:grid-cols-4">
        <input type="text" inputMode="decimal" placeholder="Sq ft" value={(details.squareFootage as string) ?? ''} onChange={(e) => setDetail('squareFootage', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm" />
        <select value={(details.surfaceMaterial as string) || ''} onChange={(e) => setDetail('surfaceMaterial', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm">
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
      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 lg:grid-cols-3">
        <input type="text" inputMode="decimal" placeholder="Stories" value={(details.stories as string) ?? ''} onChange={(e) => setDetail('stories', sanitizeNumericInput(e.target.value))} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm" />
        <select value={(details.exteriorMaterial as string) || ''} onChange={(e) => setDetail('exteriorMaterial', e.target.value)} className="rounded-lg border border-slate-300 px-3 py-3 text-base lg:px-2 lg:py-1.5 lg:text-sm">
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
