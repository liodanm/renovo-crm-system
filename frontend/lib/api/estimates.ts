import { apiFetch } from './api-client';

export interface EstimateLineItem {
  id: string;
  serviceType: string;
  description: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  total: string;
  notes: string | null;
  serviceDetails?: Record<string, unknown> | null;
  // Present only when the caller has the estimates.profitability permission
  // — the backend strips these entirely for anyone else, this isn't just a
  // client-side hide.
  estimatedLaborHours?: string;
  estimatedChemicalCost?: string;
  estimatedEquipmentCost?: string;
  estimatedFuelCost?: string;
  estimatedMiscCost?: string;
  estimatedProfit?: string;
  profitMarginPercent?: string;
}

export interface Estimate {
  id: string;
  estimateNumber: string;
  status: string;
  customerId: string;
  propertyId: string;
  customer: { id: string; firstName: string | null; lastName: string | null; businessName: string | null };
  property: { id: string; addressLine1: string; city: string; state: string };
  lineItems: EstimateLineItem[];
  subtotal: string;
  discountType: string | null;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  // Estimate-level aggregate, same permission gating as the per-line fields
  totalEstimatedProfit?: number;
  overallProfitMarginPercent?: number;
}

export interface CreateLineItemInput {
  serviceType: string;
  description: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  serviceDetails?: Record<string, unknown>;
  estimatedLaborHours?: number;
  estimatedChemicalCost?: number;
  estimatedEquipmentCost?: number;
  estimatedFuelCost?: number;
  estimatedMiscCost?: number;
}

export interface CreateEstimateInput {
  customerId: string;
  propertyId: string;
  lineItems: CreateLineItemInput[];
  discountType?: string;
  discountValue?: number;
  taxRatePercent?: number;
  notes?: string;
  terms?: string;
}

export const estimatesApi = {
  list: (params?: { status?: string; customerId?: string }) => {
    const query = params ? buildQueryString(params) : '';
    return apiFetch<Estimate[]>(`/estimates${query}`);
  },

  get: (id: string) => apiFetch<Estimate>(`/estimates/${id}`),

  create: (input: CreateEstimateInput) =>
    apiFetch<Estimate>('/estimates', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: Partial<CreateEstimateInput>) =>
    apiFetch<Estimate>(`/estimates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  send: (id: string) => apiFetch<Estimate>(`/estimates/${id}/send`, { method: 'POST' }),

  convertToJob: (id: string) => apiFetch<{ id: string; jobNumber: string; status: string }>(`/estimates/${id}/convert-to-job`, { method: 'POST' }),

  remove: (id: string) => apiFetch<{ deleted: boolean }>(`/estimates/${id}`, { method: 'DELETE' }),
};

function buildQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

export const SERVICE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'roof_soft_wash', label: 'Roof Soft Wash' },
  { value: 'driveway_cleaning', label: 'Driveway Cleaning' },
  { value: 'house_wash', label: 'House Wash' },
  { value: 'pool_deck', label: 'Pool Deck' },
  { value: 'patio', label: 'Patio' },
  { value: 'fence', label: 'Fence' },
  { value: 'gutters', label: 'Gutters' },
  { value: 'screen_enclosure', label: 'Screen Enclosure' },
  { value: 'rust_removal', label: 'Rust Removal' },
  { value: 'paver_cleaning', label: 'Paver Cleaning' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'other', label: 'Other' },
];

export const UNITS_OF_MEASURE: Array<{ value: string; label: string }> = [
  { value: 'sq_ft', label: 'Sq Ft' },
  { value: 'linear_ft', label: 'Linear Ft' },
  { value: 'each', label: 'Each' },
  { value: 'hours', label: 'Hours' },
];
