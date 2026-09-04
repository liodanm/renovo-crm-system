'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, ChevronLeft, Loader2, HelpCircle, X } from 'lucide-react';
import type { LatLon } from '../../../lib/geometry';
import { SERVICE_TYPE_ICONS } from '../../../lib/api/service-catalog';
import {
  quoteWidgetApi,
  QuoteWidgetApiError,
  type PublicQuoteBranding,
  type PublicQuoteService,
  type PropertyLookupResult,
} from '../../../lib/api/quote-widget';

// Leaflet touches window/document at import time — must never run
// during SSR, same reason ScheduleMapInner (Scheduling's own map) is
// loaded this exact same way.
const PropertyMeasurementMap = dynamic(() => import('../../../components/quote/PropertyMeasurementMap').then((m) => m.PropertyMeasurementMap), { ssr: false });

const UNIT_LABELS: Record<string, string> = { sq_ft: 'sq ft', linear_ft: 'linear ft', each: 'each', hours: 'hours', flat_rate: 'flat rate' };
const UNIT_QUESTIONS: Record<string, string> = {
  sq_ft: 'Approximate square footage',
  linear_ft: 'Approximate linear footage',
  each: 'How many?',
  hours: 'Estimated hours',
};

// Services whose area this feature can meaningfully pre-fill from a
// building footprint — deliberately a small, hardcoded set rather than
// a new Service Catalog configuration framework, matching the explicit
// instruction not to overbuild this for Phase 1. house_wash uses the
// building footprint directly; roof_soft_wash uses the derived roof
// estimate. Any other service type (driveway, fence, pool cage, etc.)
// falls straight through to the existing manual-entry input, unchanged.
const RESEARCHABLE_SERVICE_TYPES = new Set(['house_wash', 'roof_soft_wash']);
// Services this phase's map-measurement tool supports — matches the
// approved plan's initial list, using this app's actual serviceType
// values (confirmed by checking SERVICE_TYPES; there's no separate
// "concrete" or "pool_cage" type today — screen_enclosure is the
// closest existing analog to pool cage).
// Driveway removed — no longer map-measured, has its own size-preset
// UI below (see DRIVEWAY_SIZE_OPTIONS). Pool deck/patio/pavers/screen
// enclosure are untouched and still fully map-based, unchanged.
const MAP_MEASURABLE_SERVICE_TYPES = new Set(['pool_deck', 'patio', 'paver_cleaning', 'screen_enclosure']);

/**
 * Real, approved values — not invented. Each tier maps to a sq-ft
 * equivalent that flows through the EXACT SAME quantities/pricing
 * pipeline a manually-typed or map-measured square footage already
 * uses (`quantities[service.id]`, read by the existing per-sq-ft
 * catalog pricing) — no new pricing mechanism, no migration. Only
 * five tiers — a sixth (3XL) was discussed and explicitly withdrawn,
 * not omitted by oversight.
 */
const DRIVEWAY_SIZE_OPTIONS = [
  { value: '2_car', label: '2 Car Driveway', sqft: 600 },
  { value: '4_car', label: '4 Car Driveway', sqft: 950 },
  { value: '6_car', label: '6 Car Driveway', sqft: 1400 },
  { value: 'xl', label: 'XL Driveway', sqft: 2200 },
  { value: '2xl', label: '2XL Driveway', sqft: 3500 },
] as const;

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  medium: 'Estimated from property records',
  low: 'Rough estimate — please confirm',
};

type Step = 'property' | 'researching' | 'propertyConfirm' | 'service' | 'mapMeasure' | 'confirm' | 'contact' | 'review' | 'success';
const STEP_ORDER: Exclude<Step, 'success' | 'researching' | 'mapMeasure'>[] = ['property', 'propertyConfirm', 'service', 'confirm', 'contact', 'review'];

function currency(value: string | number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuoteWidgetClient({ companySlug }: { companySlug: string }) {
  const [branding, setBranding] = useState<PublicQuoteBranding | null>(null);
  const [services, setServices] = useState<PublicQuoteService[] | null>(null);
  const [loadError, setLoadError] = useState<'not_found' | 'generic' | null>(null);

  const [step, setStep] = useState<Step>('property');
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  // Single-line address — the customer types the whole address into
  // one field. Sent to the backend as-is (PropertyLookupPayload.address);
  // GeocodingService.geocodeFreeText handles it directly (the same
  // Nominatim call this app already made, which was always a
  // free-text query under the hood regardless of how many separate
  // input boxes fed into it). Structured components for the
  // permanent Customer/Estimate record come back from the geocoder's
  // OWN parsed result (lookupResult.resolvedAddress) once lookup
  // succeeds — never guessed/split from this string ourselves.
  const [singleLineAddress, setSingleLineAddress] = useState('');
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  // Real bots that fill every visible field will fill this too — a
  // sighted human never sees it. Sent as companyWebsite, matching the
  // exact existing backend honeypot field name — not a new mechanism.
  const [honeypot, setHoneypot] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ estimateNumber: string; totalAmount: string } | null>(null);

  // Generated once per page load, reused on every retry of the same
  // attempt (including the browser's own network-retry behavior) —
  // matches the backend's own documented idempotency-key contract
  // exactly: same key across retries of one logical submission, not a
  // fresh key on every render.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    Promise.all([quoteWidgetApi.getBranding(companySlug), quoteWidgetApi.getServices(companySlug)])
      .then(([b, s]) => {
        setBranding(b);
        setServices(s);
      })
      .catch((err) => {
        setLoadError(err instanceof QuoteWidgetApiError && err.status === 404 ? 'not_found' : 'generic');
      });
  }, [companySlug]);

  // '' means unanswered — distinct from 'not_sure', which is a real,
  // valid answer the customer explicitly gave. Only 'not_sure' routes
  // to Request-Only; an unanswered required question simply blocks
  // Continue, the same way an empty address field already does.
  // Declared here, ahead of the derived flags below that read them —
  // real ordering bug caught by tsc before shipping (Block-scoped
  // variable used before its declaration), not just a style choice.
  const [stories, setStories] = useState<'' | '1' | '2' | '3+' | 'not_sure'>('');
  const [roofType, setRoofType] = useState<'' | 'shingle' | 'tile' | 'metal' | 'flat' | 'not_sure'>('');
  const [gutters, setGutters] = useState<'' | 'yes' | 'no'>('');
  const [drivewaySize, setDrivewaySize] = useState<'' | (typeof DRIVEWAY_SIZE_OPTIONS)[number]['value']>('');
  const [isDrivewayModalOpen, setIsDrivewayModalOpen] = useState(false);
  const [exteriorMaterial, setExteriorMaterial] = useState<'' | 'stucco' | 'siding' | 'brick' | 'concrete_block' | 'other' | 'not_sure'>('');
  // No existing property-type source/question was found anywhere in
  // the codebase (confirmed again this session) — this list is
  // proposed, not pre-approved, per the task's own explicit
  // permission to proceed with "the smallest reasonable customer-
  // facing set" since it requires no architectural change (no
  // migration, same serviceDetails-style pattern as stories/exterior).
  const [propertyType, setPropertyType] = useState<'' | 'single_family' | 'townhome' | 'duplex_multi' | 'other' | 'not_sure'>('');

  const selectedServices = useMemo(() => (services ?? []).filter((s) => selectedServiceIds.has(s.id)), [services, selectedServiceIds]);
  // If ANY selected service requires manual review, the WHOLE
  // submission goes through the request-only path — the spec describes
  // Instant and Request as two separate flows but doesn't address a
  // mixed cart; this is the safer, simpler resolution (never guess at
  // a price for a service the owner explicitly marked as needing
  // review) rather than trying to split one submission into two.
  const isRequestOnly = selectedServices.some((s) => s.quoteMode === 'request');
  const hasResearchableServices = selectedServices.some((s) => RESEARCHABLE_SERVICE_TYPES.has(s.serviceType));
  const mapMeasureQueue = useMemo(() => selectedServices.filter((s) => MAP_MEASURABLE_SERVICE_TYPES.has(s.serviceType)), [selectedServices]);
  const [mapMeasureIndex, setMapMeasureIndex] = useState(0);
  const [mapMeasurements, setMapMeasurements] = useState<Record<string, { areaSqFt: number; points: LatLon[] }>>({});
  // Roof Cleaning / House Wash are NOT in MAP_MEASURABLE_SERVICE_TYPES
  // and deliberately never enter mapMeasureQueue — their flow is
  // property-intelligence-FIRST (automatic roof/building estimate),
  // with the satellite map as an on-demand fallback/adjustment, not a
  // mandatory upfront step the way driveway/pool_deck/etc. are. This
  // is that on-demand override: when set, the map step measures THIS
  // one service instead of advancing through mapMeasureQueue, and
  // returns straight back to 'confirm' when done — it is a side-trip,
  // not a continuation of the map-measurable-services queue.
  const [adHocMapService, setAdHocMapService] = useState<{ id: string; name: string; serviceType: string } | null>(null);
  const activeMapService = adHocMapService ?? mapMeasureQueue[mapMeasureIndex];
  // Set when the customer taps "Not sure how to measure?" on the map
  // step — same effect as the stories/roof-type "I'm not sure" answers
  // below (route to Request-Only), just triggered by a different
  // question.
  const [uncertaintyOverride, setUncertaintyOverride] = useState(false);
  const needsStories = hasResearchableServices;
  const needsRoofType = selectedServices.some((s) => s.serviceType === 'roof_soft_wash');
  const needsGutters = selectedServices.some((s) => s.serviceType === 'roof_soft_wash');
  const needsExteriorMaterial = selectedServices.some((s) => s.serviceType === 'house_wash');
  // "I'm not sure" is a real, honest answer, not a blocker — but a
  // service that genuinely can't be safely priced without knowing this
  // (per the existing Service Catalog's own quoteMode design intent)
  // routes the whole submission to the existing Request-Only flow
  // rather than guessing. Combined with the existing quoteMode==='request'
  // check below (same variable, same downstream behavior) — this is
  // the same mixed-cart policy already established, just with one more
  // real-world reason a cart can end up there.
  const uncertaintyRequiresManualReview =
    uncertaintyOverride ||
    (needsStories && stories === 'not_sure') ||
    (needsRoofType && roofType === 'not_sure') ||
    (needsExteriorMaterial && exteriorMaterial === 'not_sure');
  const routesToRequestOnly = isRequestOnly || uncertaintyRequiresManualReview;
  const brandColor = branding?.primaryColor || '#0f766e';

  const [lookupResult, setLookupResult] = useState<PropertyLookupResult | null>(null);
  const [adjustedBuildingArea, setAdjustedBuildingArea] = useState<string>('');
  const [adjustedRoofArea, setAdjustedRoofArea] = useState<string>('');
  const [buildingAdjusting, setBuildingAdjusting] = useState(false);
  const [roofAdjusting, setRoofAdjusting] = useState(false);

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function effectiveOrder(): Step[] {
    // 'confirm' only exists in the sequence at all when there's
    // actually something to confirm — a cart with only driveway/fence
    // (not in RESEARCHABLE_SERVICE_TYPES) skips it entirely in both
    // directions, rather than landing on an empty screen when going
    // Back from Contact.
    return hasResearchableServices ? STEP_ORDER : (STEP_ORDER.filter((s) => s !== 'confirm') as Step[]);
  }
  function goNext() {
    const order = effectiveOrder();
    const i = order.indexOf(step as Step);
    if (i >= 0 && i < order.length - 1) setStep(order[i + 1] as Step);
  }
  function goBack() {
    const order = effectiveOrder();
    const i = order.indexOf(step as Step);
    if (i > 0) setStep(order[i - 1] as Step);
  }

  const [isLookingUpProperty, setIsLookingUpProperty] = useState(false);
  // Property is now Step 1 — lookup ALWAYS runs on Continue here,
  // unlike the old service-first flow where it could skip the lookup
  // entirely for a cart that didn't need it (at that point services
  // were already known). Now services haven't been chosen yet, so
  // there's no way to know in advance whether lookup is needed —
  // always run it, land on the new 'propertyConfirm' step either way.
  async function handlePropertyContinue() {
    // Real gap found in this audit: the Continue button here was only
    // disabled by address validity, not by an in-flight request — a
    // double-tap on a slow connection could fire two property lookups
    // before the step change to 'researching' removes the button from
    // the DOM. Guarded the same way quote submission already is.
    if (isLookingUpProperty) return;
    setIsLookingUpProperty(true);
    setStep('researching');
    try {
      const result = await quoteWidgetApi.lookupProperty(companySlug, { address: singleLineAddress.trim() });
      setLookupResult(result);
      if (result.buildingAreaSqFt != null) setAdjustedBuildingArea(String(result.buildingAreaSqFt));
      if (result.roofAreaSqFt != null) setAdjustedRoofArea(String(result.roofAreaSqFt));
    } catch {
      // Property lookup failure must never break the Quote Tool — an
      // empty result just means the confirmation screen shows the
      // address the customer typed with no automatic details, and
      // later, researchable services show "couldn't find this
      // automatically" instead of a pre-filled card. Never an error
      // shown to the customer.
      setLookupResult({
        latitude: null,
        longitude: null,
        buildingAreaSqFt: null,
        buildingConfidence: 'unavailable',
        roofAreaSqFt: null,
        roofConfidence: 'unavailable',
        buildingFootprint: null,
        resolvedAddress: null,
      });
    }
    setIsLookingUpProperty(false);
    setStep('propertyConfirm');
  }

  // Runs when the customer clicks Continue on the SERVICE SELECTION
  // step — this replaces the branching that used to happen
  // immediately after property lookup in the old service-first order.
  // Property lookup already happened (Step 1); this decides where to
  // go now that we finally know which services were chosen.
  function handleServiceContinue() {
    if (mapMeasureQueue.length > 0) {
      setMapMeasureIndex(0);
      setStep('mapMeasure');
    } else if (hasResearchableServices) {
      setStep('confirm');
    } else {
      setStep('contact');
    }
  }

  // Runs after the map-measurement queue finishes — moves on to the
  // existing confirm step if there's still automatic research to show,
  // otherwise straight to Contact (the next step after Services in the
  // new order, same as it always was one step past wherever
  // measurement/research finished).
  function proceedPastMapMeasurement() {
    if (hasResearchableServices) {
      setStep('confirm');
      return;
    }
    setStep('contact');
  }

  function handleMapMeasureComplete(areaSqFt: number, points: LatLon[]) {
    if (adHocMapService) {
      // The ad-hoc side-trip: store the result the same way every
      // other map measurement is stored, ALSO feed it into the exact
      // state adjustedRoofArea/adjustedBuildingArea already reads for
      // display and serviceDetails — no second data path introduced,
      // this just makes a map-measured value arrive through the same
      // variable a manually-typed one always has.
      const service = adHocMapService;
      setMapMeasurements((prev) => ({ ...prev, [service.id]: { areaSqFt, points } }));
      setQuantities((prev) => ({ ...prev, [service.id]: String(areaSqFt) }));
      if (service.serviceType === 'roof_soft_wash') {
        setAdjustedRoofArea(String(areaSqFt));
        setRoofAdjusting(true);
      } else if (service.serviceType === 'house_wash') {
        setAdjustedBuildingArea(String(areaSqFt));
        setBuildingAdjusting(true);
      }
      setAdHocMapService(null);
      setStep('confirm');
      return;
    }
    const service = mapMeasureQueue[mapMeasureIndex];
    setMapMeasurements((prev) => ({ ...prev, [service.id]: { areaSqFt, points } }));
    // Same quantities map every other service (researched or manual)
    // already writes into — the submit payload has exactly one place
    // it reads quantity from, for every service uniformly.
    setQuantities((prev) => ({ ...prev, [service.id]: String(areaSqFt) }));
    if (mapMeasureIndex + 1 < mapMeasureQueue.length) {
      setMapMeasureIndex((i) => i + 1);
    } else {
      proceedPastMapMeasurement();
    }
  }

  function handleMapMeasureCancel() {
    if (adHocMapService) {
      // Backing out of the ad-hoc side-trip is just "never mind" —
      // unlike the main queue's cancel, this must NOT route the whole
      // submission to Request-Only. The customer already has (or can
      // still get) a perfectly usable automatic/manual value for this
      // one service; they just decided not to use the map for it.
      setAdHocMapService(null);
      setStep('confirm');
      return;
    }
    // "Not sure how to measure?" — never invent a measurement. Routes
    // the whole submission to Request-Only, same mechanism the
    // stories/roof-type "I'm not sure" answers already use.
    setUncertaintyOverride(true);
    proceedPastMapMeasurement();
  }

  // Review screen's "Edit Measurement" for a customer-drawn area —
  // reopens the map for that specific service with its prior points
  // already loaded (via initialPoints above), everything else in the
  // quote left untouched. Extended beyond the original
  // mapMeasureQueue-only services: roof/house_wash measurements
  // (however they were obtained — automatic, ad-hoc map, or manual)
  // can also be reopened for adjustment via the same ad-hoc path.
  function editMapMeasurement(serviceId: string) {
    const index = mapMeasureQueue.findIndex((s) => s.id === serviceId);
    if (index >= 0) {
      setMapMeasureIndex(index);
      setStep('mapMeasure');
      return;
    }
    const service = selectedServices.find((s) => s.id === serviceId);
    if (service && (service.serviceType === 'roof_soft_wash' || service.serviceType === 'house_wash')) {
      setAdHocMapService(service);
      setStep('mapMeasure');
    }
  }

  const canContinueService =
    selectedServiceIds.size > 0 &&
    selectedServices.every(
      (s) =>
        s.quoteMode === 'request' ||
        s.defaultUnitOfMeasure === 'flat_rate' ||
        RESEARCHABLE_SERVICE_TYPES.has(s.serviceType) ||
        MAP_MEASURABLE_SERVICE_TYPES.has(s.serviceType) ||
        Number(quantities[s.id]) > 0,
    );
  const canContinueProperty = !!singleLineAddress.trim();
  const canContinueContact = !!(contact.firstName.trim() && /\S+@\S+\.\S+/.test(contact.email) && contact.phone.trim().length >= 7);

  // Metadata about HOW a measurement was obtained — not required by the
  // pricing engine at all (price still resolves purely server-side from
  // the catalog), but preserved so staff reviewing the resulting
  // Estimate can see this wasn't a professional measurement. Carried
  // through the existing, already-validated serviceDetails JSONB field
  // every line item already supports — no migration, no new DTO field.
  function buildServiceDetails(serviceType: string): Record<string, unknown> {
    const details: Record<string, unknown> = {};
    if (stories) details.stories = stories;
    if (propertyType) details.propertyType = propertyType;
    if (serviceType === 'house_wash') {
      if (exteriorMaterial) details.exteriorMaterial = exteriorMaterial;
      details.measurementSource = buildingAdjusting || !lookupResult?.buildingAreaSqFt ? 'customer_provided' : 'property_intelligence';
      details.measurementMethod = 'building_footprint';
      details.measurementConfidence = lookupResult?.buildingConfidence ?? 'unavailable';
    }
    if (serviceType === 'roof_soft_wash') {
      if (roofType) details.roofType = roofType;
      if (gutters) details.gutters = gutters === 'yes';
      details.measurementSource = roofAdjusting ? 'customer_provided' : 'derived';
      details.measurementMethod = 'building_footprint_multiplier';
      details.measurementConfidence = lookupResult?.roofConfidence ?? 'unavailable';
    }
    if (serviceType === 'driveway_cleaning' && drivewaySize) {
      details.drivewaySize = drivewaySize;
      details.measurementSource = 'size_preset';
    }
    return details;
  }

  // Folded into the plain-text Customer Note the Request-Only path
  // already creates — that's the existing mechanism for this
  // information when there's no Estimate line item to attach
  // serviceDetails to.
  function buildRequestNotes(): string | undefined {
    const parts: string[] = [];
    if (stories) parts.push(`Stories: ${stories === 'not_sure' ? 'not sure' : stories}`);
    if (roofType) parts.push(`Roof type: ${roofType === 'not_sure' ? 'not sure' : roofType}`);
    if (gutters) parts.push(`Gutters: ${gutters === 'yes' ? 'yes' : 'no'}`);
    if (exteriorMaterial) parts.push(`Exterior: ${exteriorMaterial === 'not_sure' ? 'not sure' : exteriorMaterial}`);
    if (propertyType) parts.push(`Property type: ${propertyType === 'not_sure' ? 'not sure' : propertyType}`);
    if (adjustedBuildingArea) parts.push(`Home size: ${adjustedBuildingArea} sq ft`);
    if (drivewaySize) parts.push(`Driveway size: ${DRIVEWAY_SIZE_OPTIONS.find((o) => o.value === drivewaySize)?.label ?? drivewaySize}`);
    return parts.length > 0 ? parts.join('. ') : undefined;
  }

  // Structured components for the permanent Customer/Estimate record
  // — from the geocoder's own parsed result (lookupResult.resolvedAddress,
  // see GeocodingService's addressdetails=1), never guessed/split from
  // the customer's single-line input ourselves. Falls back to putting
  // the raw typed text into addressLine1 only when lookup genuinely
  // failed — the address text itself is never lost, matching the
  // existing "property lookup failure must never trap the customer"
  // philosophy already established for the rest of this flow.
  const submissionAddress = lookupResult?.resolvedAddress ?? {
    addressLine1: singleLineAddress.trim(),
    city: '',
    state: '',
    postalCode: '',
  };

  async function handleSubmit() {
    // Real bug caught before shipping: the original guard checked
    // `result`, which only ever gets set on the Instant path — a
    // Request-Only submission never produces one, so that guard alone
    // would not have stopped a double-click from firing two identical
    // requests on this path. hasSubmitted covers both.
    if (isSubmitting || hasSubmitted) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (routesToRequestOnly) {
        await quoteWidgetApi.submitRequest(companySlug, {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim() || undefined,
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          addressLine1: submissionAddress.addressLine1,
          city: submissionAddress.city,
          state: submissionAddress.state,
          postalCode: submissionAddress.postalCode,
          // Already resolved during the address/property step — passed
          // through so the backend doesn't silently re-geocode the same
          // address a second time on submission.
          latitude: lookupResult?.latitude ?? undefined,
          longitude: lookupResult?.longitude ?? undefined,
          services: selectedServices.map((s) => ({ serviceCatalogItemId: s.id })),
          notes: buildRequestNotes(),
          idempotencyKey,
          companyWebsite: honeypot || undefined,
        });
      } else {
        const response = await quoteWidgetApi.submitQuote(companySlug, {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim() || undefined,
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          addressLine1: submissionAddress.addressLine1,
          city: submissionAddress.city,
          state: submissionAddress.state,
          postalCode: submissionAddress.postalCode,
          latitude: lookupResult?.latitude ?? undefined,
          longitude: lookupResult?.longitude ?? undefined,
          services: selectedServices.map((s) => ({
            serviceCatalogItemId: s.id,
            quantity: s.defaultUnitOfMeasure === 'flat_rate' ? 1 : Number(quantities[s.id]),
            serviceDetails: buildServiceDetails(s.serviceType),
          })),
          idempotencyKey,
          companyWebsite: honeypot || undefined,
        });
        if ('estimateNumber' in response) {
          setResult(response);
        }
      }
      setHasSubmitted(true);
      setStep('success');
    } catch (err) {
      if (err instanceof QuoteWidgetApiError && err.status === 429) {
        setSubmitError("You've reached the maximum number of requests for now. Please try again later.");
      } else {
        setSubmitError("We couldn't create your estimate right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadError === 'not_found') {
    return <CenteredMessage title="This quote page is unavailable." />;
  }
  if (loadError === 'generic') {
    return <CenteredMessage title="Sorry, we're having trouble loading our services." subtitle="Please try again in a moment." />;
  }
  if (!branding || !services) {
    return <CenteredMessage title="Loading…" loading />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, per-tenant logo URL; next/image's domain allowlist doesn't make sense for arbitrary tenant-uploaded logos
            <img src={branding.logoUrl} alt={branding.companyName} className="h-9 w-auto" />
          ) : (
            <span className="text-lg font-semibold text-slate-900">{branding.companyName}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {step !== 'success' && step !== 'researching' && (
          <>
            <div className="mb-5 flex items-center gap-1.5">
              {effectiveOrder().map((s) => (
                <div key={s} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: effectiveOrder().indexOf(step as Step) >= effectiveOrder().indexOf(s) ? brandColor : '#e2e8f0' }} />
              ))}
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Step {effectiveOrder().indexOf(step as Step) + 1} of {effectiveOrder().length}
            </p>
          </>
        )}

        {step === 'property' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Tell us about your property</h1>
            <p className="mt-1 text-sm text-slate-500">Enter your property address to get started.</p>
            <div className="mt-5">
              <Field label="Property Address">
                <input
                  value={singleLineAddress}
                  onChange={(e) => setSingleLineAddress(e.target.value)}
                  placeholder="11440 NW 49 Dr, Coral Springs, FL 33076"
                  className={inputClass}
                  autoFocus
                />
              </Field>
            </div>
            <PrimaryButton disabled={!canContinueProperty || isLookingUpProperty} onClick={handlePropertyContinue} color={brandColor}>
              Continue
            </PrimaryButton>
          </div>
        )}

        {step === 'researching' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: brandColor }} />
            <p className="mt-4 text-sm font-medium text-slate-700">Finding your property…</p>
          </div>
        )}

        {step === 'propertyConfirm' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {lookupResult?.latitude != null ? 'We found your property' : "Here's the address you entered"}
            </h1>
            {!lookupResult?.resolvedAddress && lookupResult?.latitude == null && (
              <p className="mt-1 text-sm text-slate-500">We couldn&apos;t automatically look up this address, but you can still continue.</p>
            )}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-900">{lookupResult?.resolvedAddress?.addressLine1 || singleLineAddress}</p>
              {lookupResult?.resolvedAddress && (
                <p className="text-sm text-slate-500">
                  {lookupResult.resolvedAddress.city}
                  {lookupResult.resolvedAddress.city && lookupResult.resolvedAddress.state ? ', ' : ''}
                  {lookupResult.resolvedAddress.state} {lookupResult.resolvedAddress.postalCode}
                </p>
              )}
            </div>

            {/* Confirm Property Information — asked ONCE here, upfront,
                before services are even selected, rather than deferred
                per-service like an earlier version of this file did.
                This is a deliberate reversal of that earlier choice,
                made explicitly at the person's repeated direction
                (twice, with a visual reference) — flagged as a real
                tradeoff in the delivery notes, not silently done.
                Square Footage is pre-filled from Property Intelligence
                when available (still editable — never presented as
                unchangeable); Stories/Exterior/Property Type have NO
                automatic source at all (confirmed, not assumed) and
                start blank, requiring an explicit answer — including
                "I'm not sure"/"Other" as a genuinely valid answer, not
                a dead end — before Confirm is enabled. Answering here
                means these are NEVER asked again later, for any
                selected service that would otherwise have needed them. */}
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-900">Confirm Property Information</p>
              <p className="mt-0.5 text-xs text-amber-700">We found what we could about your property. Please review and answer what&apos;s missing.</p>

              <div className="mt-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Square Footage</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={adjustedBuildingArea}
                    onChange={(e) => setAdjustedBuildingArea(e.target.value)}
                    placeholder="Square feet"
                    className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2"
                  />
                  <span className="text-sm text-slate-400">sq ft</span>
                  {lookupResult?.buildingAreaSqFt != null && (
                    <span className="text-xs text-slate-400">detected automatically</span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <ChoiceQuestion
                  label="Stories"
                  value={stories}
                  onChange={(v) => setStories(v as typeof stories)}
                  options={[
                    { value: '1', label: '1 story' },
                    { value: '2', label: '2 stories' },
                    { value: '3+', label: '3+ stories' },
                    { value: 'not_sure', label: "I'm not sure" },
                  ]}
                  brandColor={brandColor}
                />
              </div>

              <div className="mt-4">
                <ChoiceQuestion
                  label="Exterior Material"
                  value={exteriorMaterial}
                  onChange={(v) => setExteriorMaterial(v as typeof exteriorMaterial)}
                  options={[
                    { value: 'stucco', label: 'Stucco' },
                    { value: 'siding', label: 'Siding' },
                    { value: 'brick', label: 'Brick' },
                    { value: 'concrete_block', label: 'Concrete/Block' },
                    { value: 'other', label: 'Other' },
                    { value: 'not_sure', label: "I'm not sure" },
                  ]}
                  brandColor={brandColor}
                />
              </div>

              <div className="mt-4">
                <ChoiceQuestion
                  label="Property Type"
                  value={propertyType}
                  onChange={(v) => setPropertyType(v as typeof propertyType)}
                  options={[
                    { value: 'single_family', label: 'Single Family' },
                    { value: 'townhome', label: 'Townhome' },
                    { value: 'duplex_multi', label: 'Duplex / Multi-Family' },
                    { value: 'other', label: 'Other' },
                    { value: 'not_sure', label: "I'm not sure" },
                  ]}
                  brandColor={brandColor}
                />
              </div>
            </div>

            <div className="mt-5">
              <PrimaryButton disabled={!stories || !exteriorMaterial || !propertyType} onClick={() => setStep('service')} color={brandColor}>
                Confirm — This Is My Property
              </PrimaryButton>
              <button onClick={() => setStep('property')} className="mt-3 w-full text-center text-sm font-medium text-slate-500 underline">
                That&apos;s not my property / Change address
              </button>
            </div>
          </div>
        )}

        {step === 'service' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">What would you like cleaned?</h1>
            <p className="mt-1 text-sm text-slate-500">Choose the services you&apos;re interested in.</p>
            <div className="mt-5 space-y-2">
              {services.length === 0 && <p className="text-sm text-slate-500">No services are currently available for online quotes. Please contact us directly.</p>}
              {services.map((s) => {
                const Icon = SERVICE_TYPE_ICONS[s.serviceType] ?? SERVICE_TYPE_ICONS.other;
                const selected = selectedServiceIds.has(s.id);
                return (
                  <div key={s.id}>
                    <button
                      onClick={() => toggleService(s.id)}
                      className="flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition"
                      style={{ borderColor: selected ? brandColor : '#e2e8f0' }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: selected ? `${brandColor}1a` : '#f1f5f9' }}>
                        <Icon className="h-5 w-5" style={{ color: selected ? brandColor : '#64748b' }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{s.name}</span>
                        {s.description && <span className="block truncate text-xs text-slate-400">{s.description}</span>}
                      </span>
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                        style={{ borderColor: selected ? brandColor : '#cbd5e1', backgroundColor: selected ? brandColor : 'transparent' }}
                      >
                        {selected && <Check className="h-4 w-4 text-white" />}
                      </span>
                    </button>
                    {selected && s.serviceType === 'driveway_cleaning' && s.quoteMode === 'instant' && (
                      <div className="mt-2 pl-4">
                        <button
                          type="button"
                          onClick={() => setIsDrivewayModalOpen(true)}
                          className="rounded-lg border-2 px-4 py-2.5 text-sm font-medium"
                          style={{ borderColor: drivewaySize ? brandColor : '#e2e8f0', color: drivewaySize ? brandColor : '#334155' }}
                        >
                          {drivewaySize
                            ? DRIVEWAY_SIZE_OPTIONS.find((o) => o.value === drivewaySize)?.label
                            : 'Select Driveway Size'}
                        </button>
                      </div>
                    )}
                    {selected && s.quoteMode === 'instant' && s.defaultUnitOfMeasure !== 'flat_rate' && s.serviceType !== 'driveway_cleaning' && !RESEARCHABLE_SERVICE_TYPES.has(s.serviceType) && !MAP_MEASURABLE_SERVICE_TYPES.has(s.serviceType) && (
                      <div className="mt-2 pl-4">
                        <label className="block text-xs font-medium text-slate-600">{UNIT_QUESTIONS[s.defaultUnitOfMeasure] ?? 'Quantity'}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={quantities[s.id] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder={UNIT_LABELS[s.defaultUnitOfMeasure]}
                          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2"
                        />
                      </div>
                    )}
                    {selected && s.quoteMode === 'request' && (
                      <p className="mt-1.5 pl-4 text-xs text-slate-500">This service requires a quick review so we can provide an accurate quote.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <BackAndContinue onBack={goBack} onNext={handleServiceContinue} disabled={!canContinueService} color={brandColor} />
            {isDrivewayModalOpen && (
              <DrivewaySizeModal
                selected={drivewaySize}
                onSelect={setDrivewaySize}
                onDone={() => {
                  const driveway = selectedServices.find((s) => s.serviceType === 'driveway_cleaning');
                  const option = DRIVEWAY_SIZE_OPTIONS.find((o) => o.value === drivewaySize);
                  if (driveway && option) {
                    setQuantities((prev) => ({ ...prev, [driveway.id]: String(option.sqft) }));
                  }
                  setIsDrivewayModalOpen(false);
                }}
                onClose={() => setIsDrivewayModalOpen(false)}
                brandColor={brandColor}
              />
            )}
          </div>
        )}

        {step === 'mapMeasure' && activeMapService && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Let&apos;s measure your {activeMapService.name.toLowerCase()}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {adHocMapService?.serviceType === 'house_wash' && !mapMeasurements[activeMapService.id]
                ? "Here's the area we found for your home. Adjust it if it doesn't look right."
                : "You don't need to know the measurements — we'll calculate the area for you."}
              {!adHocMapService && mapMeasureQueue.length > 1 && ` (${mapMeasureIndex + 1} of ${mapMeasureQueue.length})`}
            </p>
            <div className="mt-4">
              {lookupResult?.latitude != null && lookupResult?.longitude != null ? (
                <PropertyMeasurementMap
                  latitude={lookupResult.latitude}
                  longitude={lookupResult.longitude}
                  initialPoints={
                    // The customer's own prior edit (if they've
                    // already adjusted this once) ALWAYS wins over
                    // re-seeding from the original detected footprint
                    // — never silently replace a customer's edit with
                    // Property Intelligence's original result. Only
                    // House Wash seeds from buildingFootprint at all;
                    // Roof Cleaning must never have its polygon seeded
                    // from the building footprint (footprint ≠ roof
                    // area — see property-intelligence audit).
                    mapMeasurements[activeMapService.id]?.points ??
                    (adHocMapService?.serviceType === 'house_wash' ? (lookupResult?.buildingFootprint ?? undefined) : undefined)
                  }
                  onComplete={handleMapMeasureComplete}
                  onCancel={handleMapMeasureCancel}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                  <p className="text-sm text-slate-600">We couldn&apos;t automatically locate this property on the map.</p>
                  <button onClick={handleMapMeasureCancel} className="mt-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: brandColor }}>
                    Request a Quote Instead
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">We found your property</h1>
            <p className="mt-1 text-sm text-slate-500">Take a look — you can adjust anything that doesn&apos;t look right.</p>
            <div className="mt-5 space-y-3">
              {selectedServices.some((s) => s.serviceType === 'house_wash') && (
                <MeasurementCard
                  label="Home Size"
                  areaSqFt={lookupResult?.buildingAreaSqFt ?? null}
                  confidence={lookupResult?.buildingConfidence ?? 'unavailable'}
                  value={adjustedBuildingArea}
                  onChange={setAdjustedBuildingArea}
                  adjusting={buildingAdjusting}
                  onAdjust={() => setBuildingAdjusting(true)}
                  onMeasureOnMap={() => {
                    const service = selectedServices.find((s) => s.serviceType === 'house_wash');
                    if (service) {
                      setAdHocMapService(service);
                      setStep('mapMeasure');
                    }
                  }}
                  brandColor={brandColor}
                />
              )}
              {selectedServices.some((s) => s.serviceType === 'roof_soft_wash') && (
                <MeasurementCard
                  label="Roof Area"
                  sublabel="Based on the property's estimated building footprint"
                  areaSqFt={lookupResult?.roofAreaSqFt ?? null}
                  confidence={lookupResult?.roofConfidence ?? 'unavailable'}
                  value={adjustedRoofArea}
                  onChange={setAdjustedRoofArea}
                  adjusting={roofAdjusting}
                  onAdjust={() => setRoofAdjusting(true)}
                  onMeasureOnMap={() => {
                    const service = selectedServices.find((s) => s.serviceType === 'roof_soft_wash');
                    if (service) {
                      setAdHocMapService(service);
                      setStep('mapMeasure');
                    }
                  }}
                  brandColor={brandColor}
                />
              )}
            </div>

            {/* Service-aware — only the questions relevant to what was
                actually selected. Stories/Exterior Material now live
                on the property confirmation card (asked once, before
                services are even chosen) — NOT duplicated here. Only
                genuinely roof-specific questions remain in this step. */}
            <div className="mt-5 space-y-5">
              {needsGutters && (
                <ChoiceQuestion
                  label="Does your home have gutters?"
                  value={gutters}
                  onChange={(v) => setGutters(v as typeof gutters)}
                  options={[
                    { value: 'yes', label: 'Yes, I have gutters' },
                    { value: 'no', label: 'No gutters' },
                  ]}
                  brandColor={brandColor}
                />
              )}
              {needsRoofType && (
                <ChoiceQuestion
                  label="What type of roof do you have?"
                  value={roofType}
                  onChange={(v) => setRoofType(v as typeof roofType)}
                  options={[
                    { value: 'shingle', label: 'Shingle' },
                    { value: 'tile', label: 'Tile' },
                    { value: 'metal', label: 'Metal' },
                    { value: 'flat', label: 'Flat' },
                    { value: 'not_sure', label: "I'm not sure" },
                  ]}
                  brandColor={brandColor}
                />
              )}
              {uncertaintyRequiresManualReview && (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <HelpCircle className="h-4 w-4 shrink-0" /> No problem — we&apos;ll need a quick look at your property to give you an accurate price instead of an instant one.
                </p>
              )}
            </div>
            <BackAndContinue
              onBack={goBack}
              onNext={() => {
                // Carries the (possibly-adjusted) researched values into
                // the same `quantities` map every other service already
                // uses — the submit payload has exactly one place it
                // reads quantity from, for every service uniformly,
                // researched or not.
                setQuantities((prev) => {
                  const next = { ...prev };
                  const houseWash = selectedServices.find((s) => s.serviceType === 'house_wash');
                  const roof = selectedServices.find((s) => s.serviceType === 'roof_soft_wash');
                  if (houseWash && adjustedBuildingArea) next[houseWash.id] = adjustedBuildingArea;
                  if (roof && adjustedRoofArea) next[roof.id] = adjustedRoofArea;
                  return next;
                });
                goNext();
              }}
              disabled={
                (selectedServices.some((s) => s.serviceType === 'house_wash') && !adjustedBuildingArea) ||
                (selectedServices.some((s) => s.serviceType === 'roof_soft_wash') && !adjustedRoofArea) ||
                (needsRoofType && !roofType) ||
                (needsGutters && !gutters)
              }
              color={brandColor}
            />
          </div>
        )}

        {step === 'contact' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Where should we send your estimate?</h1>
            <p className="mt-1 text-sm text-slate-500">We&apos;ll only use this to prepare and deliver your estimate.</p>
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name">
                  <input value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Last Name">
                  <input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <Field label="Email">
                <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={inputClass} />
              </Field>
              <input
                type="text"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
            </div>
            <BackAndContinue onBack={goBack} onNext={goNext} disabled={!canContinueContact} color={brandColor} />
          </div>
        )}

        {step === 'review' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{routesToRequestOnly ? 'Your Quote Request' : 'Your Estimate Request'}</h1>
            <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {selectedServices.map((s) => (
                    <li key={s.id}>
                      {s.name}
                      {/* Business-friendly size, not the raw sq-ft
                          equivalent used internally for pricing — same
                          "customer sees the size, not the number"
                          principle the service-selection card already
                          uses for this same value. */}
                      {s.serviceType === 'driveway_cleaning' && drivewaySize && (
                        <span className="text-slate-400"> — {DRIVEWAY_SIZE_OPTIONS.find((o) => o.value === drivewaySize)?.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property</p>
                <p className="mt-1 text-sm text-slate-700">{submissionAddress.addressLine1}</p>
                <p className="text-sm text-slate-700">{submissionAddress.city}, {submissionAddress.state} {submissionAddress.postalCode}</p>
              </div>
              {(stories || exteriorMaterial || propertyType) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property Information</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {adjustedBuildingArea && <li>{Number(adjustedBuildingArea).toLocaleString()} sq ft</li>}
                    {stories && stories !== 'not_sure' && <li>{stories} {stories === '1' ? 'story' : 'stories'}</li>}
                    {exteriorMaterial && exteriorMaterial !== 'not_sure' && (
                      <li>{exteriorMaterial === 'concrete_block' ? 'Concrete/Block' : exteriorMaterial[0].toUpperCase() + exteriorMaterial.slice(1)}</li>
                    )}
                    {propertyType && propertyType !== 'not_sure' && (
                      <li>
                        {propertyType === 'single_family'
                          ? 'Single Family'
                          : propertyType === 'duplex_multi'
                            ? 'Duplex / Multi-Family'
                            : propertyType[0].toUpperCase() + propertyType.slice(1)}
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {!routesToRequestOnly && (hasResearchableServices || mapMeasureQueue.length > 0) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property Measurements</p>
                  <div className="mt-1.5 space-y-2">
                    {selectedServices.some((s) => s.serviceType === 'house_wash') && lookupResult && (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-700">🏠 Home Area: <span className="font-semibold">{Number(adjustedBuildingArea).toLocaleString()} sq ft</span></p>
                          <p className="text-xs text-slate-400">
                            {buildingAdjusting || lookupResult.buildingConfidence === 'unavailable' ? 'You provided this measurement' : `Property data · ${CONFIDENCE_LABEL[lookupResult.buildingConfidence] ?? 'Estimated'}`}
                          </p>
                        </div>
                        <button onClick={() => setStep('confirm')} className="shrink-0 text-xs font-medium underline" style={{ color: brandColor }}>Adjust</button>
                      </div>
                    )}
                    {selectedServices.some((s) => s.serviceType === 'roof_soft_wash') && lookupResult && (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-700">🏠 Roof Area: <span className="font-semibold">{Number(adjustedRoofArea).toLocaleString()} sq ft</span></p>
                          <p className="text-xs text-slate-400">{roofAdjusting ? 'You provided this measurement' : 'Estimated from the property\'s building footprint'}</p>
                        </div>
                        <button onClick={() => setStep('confirm')} className="shrink-0 text-xs font-medium underline" style={{ color: brandColor }}>Adjust</button>
                      </div>
                    )}
                    {mapMeasureQueue.map((s) => mapMeasurements[s.id] && (
                      <div key={s.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-700">📐 {s.name}: <span className="font-semibold">{mapMeasurements[s.id].areaSqFt.toLocaleString()} sq ft</span></p>
                          <p className="text-xs text-slate-400">Measured by you on the satellite map</p>
                        </div>
                        <button onClick={() => editMapMeasurement(s.id)} className="shrink-0 text-xs font-medium underline" style={{ color: brandColor }}>Edit Measurement</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!routesToRequestOnly && (needsStories || needsRoofType || needsGutters || needsExteriorMaterial) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service Details</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                    {needsStories && stories && stories !== 'not_sure' && <li>Stories: {stories}</li>}
                    {needsRoofType && roofType && roofType !== 'not_sure' && <li>Roof Type: {roofType[0].toUpperCase() + roofType.slice(1)}</li>}
                    {needsGutters && gutters && <li>Gutters: {gutters === 'yes' ? 'Yes' : 'No'}</li>}
                    {needsExteriorMaterial && exteriorMaterial && exteriorMaterial !== 'not_sure' && (
                      <li>Exterior: {exteriorMaterial === 'concrete_block' ? 'Concrete/Block' : exteriorMaterial[0].toUpperCase() + exteriorMaterial.slice(1)}</li>
                    )}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>
                <p className="mt-1 text-sm text-slate-700">{contact.firstName} {contact.lastName}</p>
                <p className="text-sm text-slate-700">{contact.email}</p>
                <p className="text-sm text-slate-700">{contact.phone}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {routesToRequestOnly
                ? "We'll review your property and get back to you with a quote."
                : 'Your estimate will be created instantly and emailed to you.'}
            </p>
            {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
            <div className="mt-5 flex items-center gap-3">
              <button onClick={goBack} disabled={isSubmitting} className="flex items-center gap-1 rounded-lg px-3 py-3 text-sm font-medium text-slate-600 disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-70"
                style={{ backgroundColor: brandColor }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {routesToRequestOnly ? 'Submitting…' : 'Creating Your Estimate…'}
                  </>
                ) : routesToRequestOnly ? (
                  'Request Quote'
                ) : (
                  'Get My Estimate'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${brandColor}1a` }}>
              <Check className="h-6 w-6" style={{ color: brandColor }} />
            </div>
            {routesToRequestOnly ? (
              <>
                <h1 className="mt-4 text-xl font-semibold text-slate-900">Quote Request Received</h1>
                <p className="mt-2 text-sm text-slate-600">Thanks, {contact.firstName}! We&apos;ve received your request and will review the property and contact you shortly.</p>
              </>
            ) : (
              <>
                <h1 className="mt-4 text-xl font-semibold text-slate-900">Your Estimate Is Ready</h1>
                <p className="mt-2 text-sm text-slate-600">Thank you, {contact.firstName}!</p>
                <p className="mt-1 text-sm text-slate-600">Your estimate has been created and sent to {contact.email}.</p>
                {result && (
                  <div className="mx-auto mt-4 max-w-xs rounded-lg bg-slate-50 p-4">
                    <p className="text-xs text-slate-400">Estimate {result.estimateNumber}</p>
                    <p className="mt-0.5 text-2xl font-semibold text-slate-900">{currency(result.totalAmount)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, color }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; color: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="mt-6 w-full rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: color }}>
      {children}
    </button>
  );
}

function BackAndContinue({ onBack, onNext, disabled, color }: { onBack: () => void; onNext: () => void; disabled?: boolean; color: string }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-3 py-3.5 text-sm font-medium text-slate-600">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <button onClick={onNext} disabled={disabled} className="flex-1 rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: color }}>
        Continue
      </button>
    </div>
  );
}

/**
 * Deliberately never says "exact" or shows a bare, unlabeled number —
 * every result carries its own confidence, and low/unavailable
 * confidence always opens directly into the adjustable input rather
 * than presenting a number the customer would have to notice is
 * questionable on their own.
 */
function MeasurementCard({
  label,
  sublabel,
  areaSqFt,
  confidence,
  value,
  onChange,
  adjusting,
  onAdjust,
  onMeasureOnMap,
  brandColor,
}: {
  label: string;
  sublabel?: string;
  areaSqFt: number | null;
  confidence: string;
  value: string;
  onChange: (v: string) => void;
  adjusting: boolean;
  onAdjust: () => void;
  onMeasureOnMap: () => void;
  brandColor: string;
}) {
  const isUnavailable = confidence === 'unavailable' || areaSqFt == null;
  // "adjusting" now means specifically "customer chose to type a
  // number manually" — the last resort. Clicking the normal "Adjust"
  // link on an already-available estimate opens the satellite map
  // (onMeasureOnMap) instead of revealing this field directly; typing
  // a number is still possible, but one deliberate step further away
  // than it used to be, per "manual entry is the final fallback, not
  // the primary experience."
  const showManualInput = adjusting;

  if (isUnavailable && !showManualInput) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
          <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" /> We couldn&apos;t automatically measure your property.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={onMeasureOnMap} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: brandColor }}>
            Measure on Satellite
          </button>
          <button onClick={onAdjust} className="text-sm font-medium text-slate-500 underline">
            Enter square footage manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {sublabel && <p className="text-xs text-slate-400">{sublabel}</p>}

      {showManualInput ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Square feet"
              className="w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2"
            />
            <span className="text-sm text-slate-400">sq ft</span>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-end justify-between">
          <div>
            <p className="text-2xl font-semibold text-slate-900">Approximately {Number(value || areaSqFt).toLocaleString()} sq ft</p>
            <p className="mt-0.5 text-xs text-slate-400">{CONFIDENCE_LABEL[confidence] ?? 'Estimated'}</p>
          </div>
          <button onClick={onMeasureOnMap} className="shrink-0 text-sm font-medium underline" style={{ color: brandColor }}>
            Adjust
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Matches the reference screenshot's interaction pattern (icon header,
 * "Select Size" grid, obvious selected state, prominent Done button) —
 * NOT its values (S/M/L/XL/2XL, 800-2000 sqft were that competitor's
 * own business data, never used here) or its visual styling/branding.
 * Renovo's actual five approved tiers (DRIVEWAY_SIZE_OPTIONS) drive
 * this entirely. Sq-ft IS shown here (secondary line under each size
 * label), per explicit request, so the customer has a concrete sense
 * of scale when choosing — but the SERVICE CARD and Review screen
 * still show only the business-friendly size ("2 Car Driveway"), not
 * the number, once a selection is made; the number is a decision aid
 * on this screen only, not how the choice is displayed afterward.
 */
function DrivewaySizeModal({
  selected,
  onSelect,
  onDone,
  onClose,
  brandColor,
}: {
  selected: string;
  onSelect: (value: (typeof DRIVEWAY_SIZE_OPTIONS)[number]['value']) => void;
  onDone: () => void;
  onClose: () => void;
  brandColor: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${brandColor}1a` }}>
              <SERVICE_TYPE_ICONS.driveway_cleaning className="h-5 w-5" style={{ color: brandColor }} />
            </span>
            <h3 className="text-sm font-semibold text-slate-800">Configure Driveway Cleaning</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm font-medium text-slate-700">Select Driveway Size</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DRIVEWAY_SIZE_OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelect(opt.value)}
                className="rounded-lg border-2 px-3 py-4 text-center transition"
                style={{ borderColor: isSelected ? brandColor : '#e2e8f0', backgroundColor: isSelected ? `${brandColor}0d` : 'white' }}
              >
                <span className="block text-sm font-semibold" style={{ color: isSelected ? brandColor : '#334155' }}>
                  {opt.label.replace(' Driveway', '')}
                </span>
                <span className="mt-1 block text-xs text-slate-400">{opt.sqft.toLocaleString()} sqft</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={onDone}
          className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: brandColor }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ChoiceQuestion({
  label,
  value,
  onChange,
  options,
  brandColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  brandColor: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className="rounded-lg border-2 px-3 py-3 text-sm font-medium transition"
              style={{ borderColor: selected ? brandColor : '#e2e8f0', color: selected ? brandColor : '#334155', backgroundColor: selected ? `${brandColor}0d` : 'white' }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CenteredMessage({ title, subtitle, loading }: { title: string; subtitle?: string; loading?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        {loading && <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" />}
        <p className="text-base font-medium text-slate-700">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}
