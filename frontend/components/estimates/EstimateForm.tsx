'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { customersApi, type Property } from '../../lib/api/customers';
import { settingsApi } from '../../lib/api/settings';
import { estimatesApi, UNITS_OF_MEASURE, type Estimate } from '../../lib/api/estimates';
import { ApiError } from '../../lib/api/api-client';
import { AppShell } from '../layout/AppShell';
import { serviceCatalogApi, SERVICE_TYPE_ICONS, SERVICE_TYPE_LABELS, type ServiceCatalogItem } from '../../lib/api/service-catalog';
import { CustomerPicker } from './CustomerPicker';
import { ServicePicker } from './ServicePicker';
import { ConfirmDialog } from '../action-center/ConfirmDialog';
import { AddPropertyForm } from '../customers/tabs/properties-tab';
import { recordRecentCustomer } from '../../lib/hooks/use-recent-customers';
import { CardEmpty } from '../dashboard/dashboard-card';
import { RequiredLabel } from './RequiredLabel';

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
  // Only meaningful when serviceType is 'other' — the custom service's
  // name, independent from description.
  customServiceName?: string;
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
    serviceType: 'other',
    customServiceName: '',
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
    customServiceName: li.customServiceName ?? '',
    description: li.description ?? '',
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

  // Auto-select the property when a customer has exactly one — zero
  // extra clicks for the common case. Keyed on [customerId, properties],
  // not propertyId itself, so this only re-evaluates when the customer
  // (and therefore their property list) actually changes, never just
  // because propertyId changed for some other reason. Guarding on
  // "propertyId is currently empty" is what protects editing an
  // existing estimate, a restored draft, and a user who deliberately
  // cleared their selection back to blank — none of those should be
  // silently overwritten just because the customer happens to have one
  // property.
  useEffect(() => {
    if (properties && properties.length === 1 && !propertyId) {
      setPropertyId(properties[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, properties]);

  const [lineItems, setLineItems] = useState<DraftLineItem[]>(
    existingEstimate && existingEstimate.lineItems.length > 0
      ? existingEstimate.lineItems.map(lineItemFromExisting)
      : restoredDraft?.lineItems?.length
        ? restoredDraft.lineItems
        : [],
  );
  // Add/Edit line item modal state — 'add' holds a not-yet-appended
  // draft (only written into lineItems on Save, so Cancel truly
  // discards it); 'edit' references an existing item's key/index.
  const [modalState, setModalState] = useState<{ mode: 'add' | 'edit'; index: number; item: DraftLineItem } | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  // Only one row's action area expands at a time — opening a different
  // row's actions collapses whichever was previously open, matching the
  // explicit requirement.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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
  // Company-wide defaults controlling whether Tax/Expiration show at all
  // on a NEW estimate. null while loading — treated as "show" so nothing
  // flashes hidden-then-visible. An existing estimate that already has
  // real data in these fields always shows them regardless of the
  // current setting — see showTaxField/showExpirationField below.
  const [estimateSettings, setEstimateSettings] = useState<{ enableTax: boolean; enableExpiration: boolean } | null>(null);
  useEffect(() => {
    settingsApi.getEstimateSettings().then(setEstimateSettings).catch(() => setEstimateSettings({ enableTax: true, enableExpiration: true }));
  }, []);
  const hasExistingTax = isEdit && toNumber(taxRatePercent) > 0;
  const hasExistingValidUntil = isEdit && !!validUntil;
  const showTaxField = estimateSettings === null ? true : (estimateSettings.enableTax || hasExistingTax);
  const showExpirationField = estimateSettings === null ? true : (estimateSettings.enableExpiration || hasExistingValidUntil);
  // Progressive disclosure for Discount — starts expanded only when
  // editing an estimate that already has a real discount, so existing
  // data is never hidden behind a collapsed "+ Add Discount" button.
  const [showDiscount, setShowDiscount] = useState(!!existingEstimate?.discountType);
  const [isSaving, setIsSaving] = useState(false);
  // Which button's label should reflect the busy state — isSaving alone
  // disables every button in the row (the existing, correct behavior),
  // this just decides what text the active one shows.
  const [saveAction, setSaveAction] = useState<'draft' | 'send' | 'accept' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Package Discounts — off unless Settings has it enabled.
  const { data: packageDiscountSettings } = useSWR('settings-package-discounts', () => settingsApi.getPackageDiscounts());

  // Any discount value already present — whether from an existing
  // estimate being edited, or a restored local draft — is treated as a
  // deliberate choice someone already made, not something this new
  // auto-apply feature should second-guess. A brand-new estimate starts
  // eligible for auto-apply immediately.
  const [isManualDiscount, setIsManualDiscount] = useState(() => Boolean((existingEstimate?.discountType && Number(existingEstimate?.discountAmount) > 0) || restoredDraft?.discountType));

  function packageDiscountForCount(serviceCount: number): { type: 'percentage'; value: number; label: string } | null {
    const s = packageDiscountSettings;
    if (!s?.enabled || serviceCount < 2) return null;
    if (s.mode === 'fixed') return { type: 'percentage', value: s.fixedPercent, label: `${serviceCount}-Service Package` };
    const tier = s.tiers.find((t) => serviceCount >= t.minServices); // tiers are stored highest-minServices-first, so the first match is the best-fitting tier
    return tier ? { type: 'percentage', value: tier.percent, label: `${serviceCount}-Service Package` } : null;
  }

  // The one place the auto-apply actually happens — sets the exact same
  // discountType/discountValue fields a human would type into, then the
  // existing computeTotals() below does the math exactly as it always
  // has. No second calculation path.
  useEffect(() => {
    if (isManualDiscount) return;
    const applied = packageDiscountForCount(lineItems.length);
    if (applied) {
      setDiscountType('percentage');
      setDiscountValue(String(applied.value));
    } else if (discountType || discountValue) {
      // Dropped below 2 services (or discounts got disabled in Settings)
      // while still in auto mode — clear it, don't leave a stale
      // auto-applied value sitting there once it no longer qualifies.
      setDiscountType('');
      setDiscountValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems.length, isManualDiscount, packageDiscountSettings]);

  const activePackageDiscount = !isManualDiscount ? packageDiscountForCount(lineItems.length) : null;

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
    setLineItems((items) => items.filter((item) => item.key !== key));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!customerId) errors.customer = 'Choose a customer.';
    if (!propertyId) errors.property = 'Choose a property.';
    if (lineItems.length === 0) errors.lineItems = 'Add at least one service.';

    lineItems.forEach((item, i) => {
      if (item.serviceType === 'other') {
        if (!item.customServiceName?.trim()) errors[`item-${i}-service`] = 'Enter a custom service name';
      } else if (!item.description.trim()) {
        errors[`item-${i}-description`] = 'Missing description';
      }
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
    setSaveAction(andSend ? 'send' : 'draft');
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
        discountSource: discountType ? (isManualDiscount ? 'manual' : 'package') : undefined,
        taxRatePercent: showTaxField && taxRatePercent ? toNumber(taxRatePercent) : undefined,
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        validUntil: showExpirationField && validUntil ? validUntil : undefined,
      };

      const estimate = isEdit
        ? await estimatesApi.update(existingEstimate!.id, (({ customerId, propertyId, ...updatePayload }) => updatePayload)(payload))
        : await estimatesApi.create(payload);
      if (andSend && !isEdit) {
        await estimatesApi.sendEmail(estimate.id);
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

  /**
   * Save, then — only if that succeeds — accept, reusing the exact same
   * estimatesApi.update() this form already uses and the exact same
   * estimatesApi.acceptManually() the estimate detail page's own Accept
   * dialog already calls. No new endpoint, no duplicated status-change
   * logic.
   *
   * isSaving (not a separate flag) intentionally gates every button in
   * this row — the existing Save/Cancel buttons already disable
   * together this same way, and a second, save-and-accept-specific
   * request firing while one of those is in flight is exactly the kind
   * of race this reuses the existing guard to prevent, rather than
   * inventing a parallel one.
   */
  async function handleSaveAndAccept() {
    if (!validate()) return;

    setIsSaving(true);
    setSaveAction('accept');
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
        discountSource: discountType ? (isManualDiscount ? 'manual' : 'package') : undefined,
        taxRatePercent: showTaxField && taxRatePercent ? toNumber(taxRatePercent) : undefined,
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        validUntil: showExpirationField && validUntil ? validUntil : undefined,
      };

      // Same strip-before-update as handleSave, and for the same real
      // reason: the backend's UpdateEstimateDto doesn't accept these
      // two fields at all, and the global validation pipe rejects any
      // request body containing a field the target DTO doesn't define
      // (forbidNonWhitelisted: true, main.ts) — sending them here would
      // make every Save & Accept fail at the save step.
      const { customerId: _customerId, propertyId: _propertyId, ...updatePayload } = payload;
      const estimate = await estimatesApi.update(existingEstimate!.id, updatePayload);

      try {
        await estimatesApi.acceptManually(estimate.id);
      } catch (acceptErr) {
        // The save above genuinely succeeded — your edits are real and
        // kept. Only acceptance failed. Staying on this page (not
        // navigating away) rather than the detail page is deliberate:
        // navigating away here would be truthful (the estimate really
        // is still just "draft," not falsely "accepted"), but staying
        // put lets you immediately retry acceptance without re-editing
        // and re-saving everything again.
        setError(
          acceptErr instanceof ApiError
            ? `Your changes were saved, but the estimate could not be accepted: ${acceptErr.message}`
            : 'Your changes were saved, but the estimate could not be accepted. Check your connection and try again.',
        );
        setIsSaving(false);
        return;
      }

      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      // Save itself failed — acceptManually is never reached, so the
      // estimate's status is untouched.
      setError(err instanceof ApiError ? err.message : 'Failed to update estimate. Check your connection and try again.');
      setIsSaving(false);
    }
  }

  /**
   * The create-flow twin of handleSaveAndAccept above — same reasoning,
   * same reused estimatesApi.acceptManually(), but calling
   * estimatesApi.create() first instead of update(). Unlike the edit
   * path, customerId/propertyId are NOT stripped from the payload here
   * — create() requires them; only update() rejects them.
   *
   * No call to estimatesApi.send() exists anywhere in this function —
   * not skipped by a conditional, structurally absent — so there is no
   * path by which this can email the customer.
   */
  async function handleSaveAndAcceptNew() {
    if (!validate()) return;

    setIsSaving(true);
    setSaveAction('accept');
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
        discountSource: discountType ? (isManualDiscount ? 'manual' : 'package') : undefined,
        taxRatePercent: showTaxField && taxRatePercent ? toNumber(taxRatePercent) : undefined,
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        validUntil: showExpirationField && validUntil ? validUntil : undefined,
      };

      const estimate = await estimatesApi.create(payload);

      try {
        await estimatesApi.acceptManually(estimate.id);
      } catch (acceptErr) {
        // The estimate genuinely exists now (the create above
        // succeeded) — it's sitting as an ordinary draft, same as any
        // other saved-but-not-yet-accepted estimate. Deliberately NOT
        // navigating away here: this component's error state would be
        // gone the instant the page changes, and the message ("saved,
        // but not accepted") is exactly the thing the user most needs
        // to actually see, not something to lose to a redirect.
        clearDraft();
        recordRecentCustomer(customerId);
        setError(
          acceptErr instanceof ApiError
            ? `The estimate was saved as a draft, but could not be marked Accepted: ${acceptErr.message}. Find it in your Estimates list to accept it from there.`
            : 'The estimate was saved as a draft, but could not be marked Accepted. Check your connection, then find it in your Estimates list to accept it from there.',
        );
        setIsSaving(false);
        return;
      }

      clearDraft();
      recordRecentCustomer(customerId);
      router.push(`/estimates/${estimate.id}`);
    } catch (err) {
      // Create itself failed — acceptManually is never reached, and
      // nothing exists yet to leave in an ambiguous state.
      setError(err instanceof ApiError ? err.message : 'Failed to create estimate. Check your connection and try again.');
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href={isEdit ? `/estimates/${existingEstimate!.id}` : '/estimates'} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800">
          ← Back to {isEdit ? 'Estimate' : 'Estimates'}
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">{isEdit ? `Edit Estimate ${existingEstimate!.estimateNumber}` : 'New Estimate'}</h1>

        {error && <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <RequiredLabel>Customer</RequiredLabel>
            {customersError ? (
              <div className="mt-1 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                Couldn't load customers. <button onClick={() => window.location.reload()} className="underline">Retry</button>
              </div>
            ) : customersLoading ? (
              <div className="mt-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-400 dark:text-slate-500">Loading customers…</div>
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
            {fieldErrors.customer && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.customer}</p>}
          </div>
          <div>
            <RequiredLabel>Property</RequiredLabel>
            {!customerId ? (
              <select disabled className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-3 text-base lg:py-2 lg:text-sm text-slate-400 dark:text-slate-500">
                <option>Select a customer first…</option>
              </select>
            ) : propertiesError ? (
              <div className="mt-1 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">Couldn't load properties.</div>
            ) : propertiesLoading ? (
              <div className="mt-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-400 dark:text-slate-500">Loading properties…</div>
            ) : properties && properties.length === 0 ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800">
                <span>No properties yet — likely a quick-added customer.</span>
                <button type="button" onClick={() => setShowAddProperty(true)} className="shrink-0 font-semibold text-[var(--color-brand)] underline">
                  + Add address
                </button>
              </div>
            ) : (
              <select
                value={propertyId}
                onChange={(e) => { setPropertyId(e.target.value); setFieldErrors((f) => ({ ...f, property: '' })); }}
                className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 ${fieldErrors.property ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:placeholder:text-slate-400`}
              >
                <option value="">Select a property…</option>
                {properties?.map((p) => <option key={p.id} value={p.id}>{p.addressLine1}, {p.city}</option>)}
              </select>
            )}
            {fieldErrors.property && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.property}</p>}
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
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Services</h2>
            <div className="flex items-center gap-3">
              <CatalogPicker
                onPick={(catalogItem) =>
                  setModalState({
                    mode: 'add',
                    index: lineItems.length,
                    item: {
                      key: crypto.randomUUID(),
                      serviceType: catalogItem.serviceType,
                      description: catalogItem.description || catalogItem.name,
                      // Per the owner's explicit request: every service
                      // pulled into an Estimate defaults to Flat Rate
                      // here, regardless of the Service Catalog item's
                      // own configured defaultUnitOfMeasure (sq ft,
                      // linear ft, etc). This is deliberately an
                      // Estimate-only default, not a Service Catalog
                      // change — catalogItem.defaultUnitOfMeasure and
                      // .defaultUnitPrice are read here but never
                      // written back, so the Catalog's own stored
                      // configuration for every service is completely
                      // untouched; the price itself is still pulled in
                      // unchanged below, just presented under Flat Rate
                      // by default instead of the Catalog's own unit —
                      // adjustable per-line if a particular service
                      // genuinely needs its per-sq-ft/per-linear-ft
                      // pricing instead.
                      unitOfMeasure: 'flat_rate',
                      quantity: '1',
                      // Deliberately not catalogItem.defaultUnitPrice —
                      // that price corresponds to whatever unit the
                      // Catalog item is actually configured with (often
                      // per sq ft or per linear ft), so carrying it over
                      // under Flat Rate would show a real-looking but
                      // meaningless number (e.g. a $0.15 per-sq-ft price
                      // appearing as if it were a $0.15 flat rate).
                      // 0.00 makes it obvious a real number still needs
                      // to be entered for this job, rather than risking
                      // an unnoticed wrong price going out to a customer.
                      unitPrice: '0.00',
                      notes: catalogItem.defaultNotes ?? undefined,
                      serviceCatalogItemId: catalogItem.id,
                    },
                  })
                }
                onCreateCustom={() => setModalState({ mode: 'add', index: lineItems.length, item: emptyLineItem() })}
              />
            </div>
          </div>

          {lineItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 py-8 text-center">
              <CardEmpty message='No service added yet. Click "+ Add Service" above to get started.' />
              {fieldErrors.lineItems && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fieldErrors.lineItems}</p>}
            </div>
          ) : (
            lineItems.map((item, i) => (
              <LineItemRow
                key={item.key}
                item={item}
                isExpanded={expandedKey === item.key}
                onToggleExpand={() => setExpandedKey((k) => (k === item.key ? null : item.key))}
                onEdit={() => setModalState({ mode: 'edit', index: i, item })}
                onDeleteClick={() => setDeleteConfirmKey(item.key)}
              />
            ))
          )}
        </div>

        {modalState && (
          <LineItemModal
            item={modalState.item}
            index={modalState.index}
            errors={fieldErrors}
            onClose={() => setModalState(null)}
            onSave={(patch) => {
              if (modalState.mode === 'add') {
                setLineItems((items) => [...items, { ...modalState.item, ...patch }]);
              } else {
                updateLineItem(modalState.item.key, patch);
              }
            }}
          />
        )}

        {deleteConfirmKey && (
          <ConfirmDialog
            title="Delete Service?"
            message={`Are you sure you want to remove ${(() => {
              const target = lineItems.find((li) => li.key === deleteConfirmKey);
              if (!target) return 'this service';
              return target.customServiceName || (target.serviceType ? SERVICE_TYPE_LABELS[target.serviceType] ?? target.serviceType : null) || target.description || 'this service';
            })()} from this estimate?`}
            confirmLabel="Delete"
            danger
            onConfirm={() => removeLineItem(deleteConfirmKey)}
            onClose={() => setDeleteConfirmKey(null)}
          />
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
          {showExpirationField && (
            <div className="min-w-0">
              <div className="flex min-h-[22px] items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Valid until</label>
              </div>
              <div className="mt-1 w-full overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900">
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full min-w-0 max-w-full border-0 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
          )}
          {showDiscount ? (
            <>
              <div>
                <div className="flex min-h-[22px] items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Discount type</label>
                </div>
                <select
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value);
                    // Explicitly choosing "None" is the clearest possible
                    // reset signal — same auto-restore rule as clearing the
                    // value to zero.
                    setIsManualDiscount(e.target.value !== '');
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
                >
                  <option value="">None</option>
                  <option value="fixed">Fixed ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <div className="flex min-h-[22px] items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Discount value</label>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType('');
                      setDiscountValue('');
                      setIsManualDiscount(false);
                      setShowDiscount(false);
                    }}
                    className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => {
                    const next = sanitizeNumericInput(e.target.value);
                    setDiscountValue(next);
                    // Reset to empty/zero -> resume auto-apply, no button, no
                    // dialog, exactly the "Auto Restore" requirement. Any
                    // other non-zero value -> this estimate is now manually
                    // controlled, permanently, until reset the same way.
                    setIsManualDiscount(toNumber(next) > 0);
                  }}
                  disabled={!discountType}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base disabled:bg-slate-100 dark:bg-slate-800 lg:px-3 lg:py-2 lg:text-sm"
                />
              </div>
            </>
          ) : (
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={() => setShowDiscount(true)}
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                + Add Discount
              </button>
            </div>
          )}
          {showTaxField && (
            <div>
              <div className="flex min-h-[22px] items-center justify-between">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tax rate (%)</label>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(sanitizeNumericInput(e.target.value))}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>
          )}
        </div>

        {(activePackageDiscount || (isManualDiscount && discountType)) && (
          <div className="mt-2">
            {activePackageDiscount && (
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {activePackageDiscount.label} • {activePackageDiscount.value}%
              </span>
            )}
            {isManualDiscount && discountType && (
              <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">Manual Discount</span>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes (optional — visible to the customer)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Internal Notes (optional — staff only, never shown to the customer)</label>
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Customer asked to wait until next month, use 4% SH because roof is older…"
            className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm"
          />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {totals.discountAmount > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Discount</span><span>−{formatCurrency(totals.discountAmount)}</span></div>}
            {totals.taxAmount > 0 && <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1 text-base font-semibold text-slate-900 dark:text-slate-100"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
          </div>
          <p className="mt-2 text-right text-xs text-slate-400 dark:text-slate-500">Final totals are always recalculated when you save.</p>
        </div>

        {/* Mobile: sticky bottom bar so Save never requires scrolling past
            everything above it — same sticky+blur+border technique already
            proven in FieldActionBar.tsx (that one sticks to the top of the
            Job page; this one sticks to the bottom, the correct edge for a
            save action). Desktop reverts to the original static inline
            layout at lg+, unchanged. */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 grid grid-cols-2 gap-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:flex sm:flex-nowrap sm:justify-end sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none">
          <button
            type="button"
            onClick={() => {
              // Discards, never saves — the same clearDraft() the
              // successful-save path already uses, just triggered
              // explicitly instead of only after a save. Edit mode has
              // no draft to clear (the restore mechanism is deliberately
              // new-estimate-only, see clearDraft's own definition), so
              // this is a no-op there and just navigates back.
              if (!isEdit) clearDraft();
              router.push(isEdit ? `/estimates/${existingEstimate!.id}` : '/estimates');
            }}
            className="w-full rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-base font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 sm:w-auto lg:py-2 lg:text-sm"
          >
            Cancel
          </button>
          {isEdit ? (
            <>
              <button onClick={() => handleSave(false)} disabled={isSaving} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 sm:w-auto lg:py-2 lg:text-sm">
                {isSaving && saveAction === 'draft' ? 'Saving…' : 'Save Changes'}
              </button>
              {existingEstimate!.status === 'draft' && (
                <button
                  onClick={handleSaveAndAccept}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-base font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 sm:w-auto lg:py-2 lg:text-sm"
                >
                  {isSaving && saveAction === 'accept' ? 'Saving & Accepting…' : 'Save & Accept'}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => handleSave(false)} disabled={isSaving} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 sm:w-auto lg:py-2 lg:text-sm">
                {isSaving && saveAction === 'draft' ? 'Saving…' : 'Save as Draft'}
              </button>
              <button onClick={() => handleSave(true)} disabled={isSaving} className="w-full rounded-lg border border-[var(--color-brand-secondary)]/50 bg-[var(--color-brand-secondary)]/10 dark:bg-[var(--color-brand-secondary)]/15 px-4 py-3 text-base font-medium text-[var(--color-brand)] dark:text-[var(--color-brand-secondary)] hover:bg-[var(--color-brand-secondary)]/20 disabled:opacity-50 sm:w-auto lg:py-2 lg:text-sm">
                {isSaving && saveAction === 'send' ? 'Saving…' : 'Save & Send'}
              </button>
              <button
                onClick={handleSaveAndAcceptNew}
                disabled={isSaving}
                className="w-full rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-base font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 sm:w-auto lg:py-2 lg:text-sm"
              >
                {isSaving && saveAction === 'accept' ? 'Saving & Accepting…' : 'Save & Accept'}
              </button>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function CatalogPicker({ onPick, onCreateCustom }: { onPick: (item: ServiceCatalogItem) => void; onCreateCustom: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: items } = useSWR('service-catalog-active', () => serviceCatalogApi.list(true));

  return (
    <div className="relative">
      <button onClick={() => setIsOpen((v) => !v)} className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100">
        + Add Service
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-lg">
            <button
              onClick={() => { onCreateCustom(); setIsOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand)]/5"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Create Custom Service
            </button>
            <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
            {(!items || items.length === 0) && <p className="p-3 text-xs text-slate-400 dark:text-slate-500">No active services in your catalog yet.</p>}
            {items?.map((item) => {
              const Icon = SERVICE_TYPE_ICONS[item.serviceType] ?? SERVICE_TYPE_ICONS.other;
              return (
                <button key={item.id} onClick={() => { onPick(item); setIsOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800">
                  <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-100">{item.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One modal, used for both adding and editing a line item — per the
 * explicit instruction not to build two competing implementations.
 * Holds its own local draft state, seeded from `item` on open, and only
 * writes back via `onSave` — Cancel simply discards the local draft,
 * never touching the parent's lineItems array. Uses the exact same
 * overlay markup as every other modal in this codebase (CancelJobModal,
 * ImportCsvModal, CreateCustomerModal, ConfirmDialog, etc.) — already
 * proven mobile-safe, not a new pattern.
 */
function LineItemModal({
  item,
  index,
  errors,
  onSave,
  onClose,
}: {
  item: DraftLineItem;
  index: number;
  errors: Record<string, string>;
  onSave: (patch: Partial<DraftLineItem>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DraftLineItem>(item);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const unitPriceRef = useRef<HTMLInputElement>(null);

  function update(patch: Partial<DraftLineItem>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function focusOnEnter(next: React.RefObject<HTMLInputElement | null>) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next.current?.focus();
      }
    };
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 dark:bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Service</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Service</label>
            <ServicePicker
              value={draft.serviceType}
              customServiceName={draft.customServiceName ?? ''}
              hasError={!!errors[`item-${index}-service`]}
              onSelect={(serviceType, customServiceNameOverride, isLiveEdit) => {
                if (customServiceNameOverride !== undefined) {
                  update({ serviceType, customServiceName: customServiceNameOverride });
                } else {
                  update({ serviceType });
                }
                if (!isLiveEdit) requestAnimationFrame(() => descriptionRef.current?.focus());
              }}
            />
          </div>

          <div>
            {draft.serviceType === 'other' ? (
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Description</label>
            ) : (
              <RequiredLabel size="sm">Description</RequiredLabel>
            )}
            <input
              ref={descriptionRef}
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
              onKeyDown={focusOnEnter(quantityRef)}
              placeholder={draft.serviceType === 'other' ? 'Optional description shown to Customer' : undefined}
              className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 ${errors[`item-${index}-description`] ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:placeholder:text-slate-400`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Unit Type</label>
              <div className="relative">
                <select
                  value={draft.unitOfMeasure}
                  onChange={(e) => {
                    const nextUnit = e.target.value;
                    if (nextUnit === 'flat_rate' && !draft.quantity) {
                      update({ unitOfMeasure: nextUnit, quantity: '1' });
                    } else {
                      update({ unitOfMeasure: nextUnit });
                    }
                  }}
                  className="mt-1 w-full appearance-none rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 pr-7 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
                >
                  {UNITS_OF_MEASURE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              </div>
            </div>
            <div>
              <RequiredLabel size="sm">Qty</RequiredLabel>
              <input
                ref={quantityRef}
                type="text"
                inputMode="decimal"
                value={draft.quantity}
                onChange={(e) => update({ quantity: sanitizeNumericInput(e.target.value) })}
                onKeyDown={focusOnEnter(unitPriceRef)}
                placeholder="0"
                className={`mt-1 w-full rounded-lg border px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 ${errors[`item-${index}-quantity`] ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:placeholder:text-slate-400`}
              />
            </div>
            <div>
              <RequiredLabel size="sm">Unit Price</RequiredLabel>
              <input
                ref={unitPriceRef}
                type="text"
                inputMode="decimal"
                value={draft.unitPrice}
                onChange={(e) => update({ unitPrice: sanitizeNumericInput(e.target.value) })}
                placeholder="0.00"
                className={`mt-1 w-full rounded-lg border px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 ${errors[`item-${index}-unitPrice`] ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:placeholder:text-slate-400`}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
            Line total: {formatCurrency(toNumber(draft.quantity) * toNumber(draft.unitPrice))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 lg:py-2 lg:text-sm">
            Cancel
          </button>
          <button onClick={handleSave} className="rounded-lg bg-[var(--color-brand)] px-4 py-3 text-base font-medium text-white hover:opacity-90 lg:py-2 lg:text-sm">
            Save Service
          </button>
        </div>
      </div>
    </div>
  );
}

function LineItemRow({
  item,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDeleteClick,
}: {
  item: DraftLineItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDeleteClick: () => void;
}) {
  const lineTotal = toNumber(item.quantity) * toNumber(item.unitPrice);
  const Icon = item.serviceType ? SERVICE_TYPE_ICONS[item.serviceType] ?? SERVICE_TYPE_ICONS.other : SERVICE_TYPE_ICONS.other;
  // Same real-name resolution used everywhere else in the app: custom
  // name first, then the actual predefined label, description only as
  // a last resort — never just "Other" for a real custom service.
  const serviceLabel = item.customServiceName || (item.serviceType ? SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType : null);
  const primaryText = serviceLabel || item.description || 'Service';
  const showDescriptionBelow = !!item.description && item.description !== primaryText;

  return (
    <div className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      {/* Only the chevron responds to taps — the row body itself is no
          longer a click-to-edit trigger, so scrolling/reading the card
          can never accidentally open Edit or Delete. */}
      <button type="button" onClick={onToggleExpand} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <span className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{primaryText}</span>
          </div>
          {showDescriptionBelow && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{item.description}</p>}
        </div>
        {isExpanded ? (
          <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
        )}
      </button>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {item.quantity || '0'} × {UNITS_OF_MEASURE.find((u) => u.value === item.unitOfMeasure)?.label ?? item.unitOfMeasure}
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(lineTotal)}</span>
      </div>

      {isExpanded && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => { onToggleExpand(); onEdit(); }}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 lg:py-2 lg:text-sm"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { onToggleExpand(); onDeleteClick(); }}
            className="flex-1 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-base font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 lg:py-2 lg:text-sm"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ServiceDetailFields({ item, onChange }: { item: DraftLineItem; onChange: (patch: Partial<DraftLineItem>) => void }) {
  // Deliberately always returns null now. Previously rendered extra
  // fields (Roof Sq Ft/Type/Stories/Pitch for roof_soft_wash; Sq
  // Ft/Surface/Oil+Rust stains for driveway_cleaning; Stories/Exterior
  // material/Oxidation for house_wash) — audited directly against the
  // backend and confirmed none of them ever fed pricing, calculations,
  // PDF generation, or the Job/Invoice workflow. They were pure
  // presentation with no downstream effect, so removing them from the
  // form is safe and doesn't touch any business logic.
  //
  // This intentionally does NOT delete serviceDetails from the data
  // model, the DraftLineItem type, the onChange contract, or historical
  // rows already in the database — an existing estimate saved with
  // this data keeps it untouched in the service_details JSONB column;
  // this function just stops collecting more of it going forward. The
  // (item, onChange) parameters are kept even though unused here, so
  // reverting this later (or building a real per-service-type UX on
  // top of the same data later) doesn't require touching every call
  // site again.
  void item;
  void onChange;
  return null;
}
