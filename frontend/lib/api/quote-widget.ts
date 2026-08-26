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

// Only the customer-appropriate fields are typed and used here — the
// real backend response includes several internal-operations fields
// (defaultChemicals, requiredEquipment, preparationInstructions,
// defaultNotes, defaultTerms, upsell targeting) that exist for the
// staff catalog UI this endpoint is shared with. None of those are
// referenced anywhere in this file or rendered anywhere in the public
// UI — deliberately, not by omission. See the final report for why
// this is a frontend-side mitigation, not a backend fix.
export interface PublicQuoteService {
  id: string;
  name: string;
  serviceType: string;
  category: string | null;
  description: string | null;
  defaultUnitOfMeasure: string;
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
  services: { serviceCatalogItemId: string; quantity: number }[];
  notes?: string;
  idempotencyKey: string;
  // Honeypot — matches the backend's exact existing field name. Present
  // in the type so the frontend never needs to suppress a type error to
  // send it.
  companyWebsite?: string;
}

export const quoteWidgetApi = {
  getBranding: (companySlug: string) => publicFetch<PublicQuoteBranding>(`/public/${companySlug}/quote-widget/branding`),
  getServices: (companySlug: string) => publicFetch<PublicQuoteService[]>(`/public/${companySlug}/quote-widget/services`),
  submitQuote: (companySlug: string, payload: SubmitQuotePayload) =>
    publicFetch<QuoteSubmissionResult | { received: true }>(`/public/${companySlug}/quote-widget/quote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
