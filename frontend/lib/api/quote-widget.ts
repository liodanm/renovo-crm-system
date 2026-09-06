// Public, unauthenticated API client — never sends staff auth headers,
// never accepts a companyId from anywhere but the URL's companySlug.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new QuoteWidgetApiError(res.status, body?.message ?? 'Something went wrong. Please try again.');
  }
  return res.json();
}

export class QuoteWidgetApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Matches the public services endpoint's own restricted DB-level
// projection exactly (ServiceCatalogService.findAllPublic) — the
// backend itself never sends chemicals, equipment, internal prep/
// aftercare notes, upsell targeting, price, or any other staff-only
// catalog field to this endpoint at all. This type isn't doing the
// filtering; it's just documenting what the backend already promises.
export interface PublicQuoteService {
  id: string;
  name: string;
  serviceType: string;
  category: string | null;
  description: string | null;
  defaultUnitOfMeasure: string;
  quoteMode: 'instant' | 'request';
}

export interface PublicQuoteBranding {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface QuoteSubmissionResult {
  estimateNumber: string;
  totalAmount: string;
}

export interface SubmitQuotePayload {
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  // Already resolved during the address/property step — sent through so
  // the backend doesn't silently re-geocode the same address a second
  // time on submission. Optional: an address that couldn't be geocoded
  // earlier still submits fine without these.
  latitude?: number;
  longitude?: number;
  services: { serviceCatalogItemId: string; quantity: number; serviceDetails?: Record<string, unknown> }[];
  notes?: string;
  idempotencyKey: string;
  // Honeypot — matches the backend's exact existing field name. Present
  // in the type so the frontend never needs to suppress a type error to
  // send it.
  companyWebsite?: string;
  // Consent — hashes come from getConsentDisclosures(), echoed back
  // untouched (see SettingsService's own doc comment on why the
  // backend never recomputes/re-verifies these at submission time).
  smsConsent?: boolean;
  smsDisclosureHash?: string;
  emailConsent?: boolean;
  emailDisclosureHash?: string;
  marketingSmsConsent?: boolean;
  marketingSmsDisclosureHash?: string;
}

export interface ConsentDisclosuresPayload {
  sms: string;
  smsHash: string;
  email: string;
  emailHash: string;
  marketingSms: string;
  marketingSmsHash: string;
}

export interface RequestQuotePayload {
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  services: { serviceCatalogItemId: string }[];
  notes?: string;
  idempotencyKey: string;
  companyWebsite?: string;
}

export type MeasurementConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export interface PropertyLookupResult {
  latitude: number | null;
  longitude: number | null;
  buildingAreaSqFt: number | null;
  buildingConfidence: MeasurementConfidence;
  roofAreaSqFt: number | null;
  roofConfidence: MeasurementConfidence;
  // Same {lat, lon}[] shape PropertyMeasurementMap's initialPoints
  // already accepts — the actual detected footprint, when available,
  // so House Wash can seed the map instead of opening blank. null,
  // never a fabricated shape, when no footprint was found.
  buildingFootprint: { lat: number; lon: number }[] | null;
  // The geocoder's own parsed address — real structured components,
  // not guessed/split from the customer's single-line input. null
  // only when geocoding itself failed entirely.
  resolvedAddress: {
    displayName: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
  } | null;
}

export interface PropertyLookupPayload {
  // Single-line entry — the Quote Tool's new address field sends
  // only this. Structured fields kept optional/unused by this
  // frontend going forward, but still accepted by the backend for
  // any other caller.
  address: string;
}

export const quoteWidgetApi = {
  getBranding: (companySlug: string) => publicFetch<PublicQuoteBranding>(`/public/${companySlug}/quote-widget/branding`),
  getConsentDisclosures: (companySlug: string) => publicFetch<ConsentDisclosuresPayload>(`/public/${companySlug}/quote-widget/consent-disclosures`),
  getServices: (companySlug: string) => publicFetch<PublicQuoteService[]>(`/public/${companySlug}/quote-widget/services`),
  lookupProperty: (companySlug: string, payload: PropertyLookupPayload) =>
    publicFetch<PropertyLookupResult>(`/public/${companySlug}/quote-widget/property-lookup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitQuote: (companySlug: string, payload: SubmitQuotePayload) =>
    publicFetch<QuoteSubmissionResult | { received: true }>(`/public/${companySlug}/quote-widget/quote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitRequest: (companySlug: string, payload: RequestQuotePayload) =>
    publicFetch<{ received: true }>(`/public/${companySlug}/quote-widget/request`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
