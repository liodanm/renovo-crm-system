import { apiFetch } from './api-client';

export interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: 'portal' | 'staff' | 'manual' | 'automation';
  note: string | null;
  changedAt: string;
  userFirstName: string | null;
  userLastName: string | null;
}

export interface EstimateLineItem {
  id: string;
  serviceType: string;
  // Only meaningful when serviceType is 'other' — the custom service's
  // actual name, independent from description.
  customServiceName?: string | null;
  description: string | null;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  total: string;
  notes: string | null;
  serviceDetails?: Record<string, unknown> | null;
  serviceCatalogItemId?: string | null;
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
  customer: { id: string; firstName: string | null; lastName: string | null; businessName: string | null; email: string | null; phone: string | null };
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
  internalNotes: string | null;
  validUntil: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedVia: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  declineComments: string | null;
  createdAt: string;
  // Estimate-level aggregate, same permission gating as the per-line fields
  totalEstimatedProfit?: number;
  overallProfitMarginPercent?: number;
}

export interface CreateLineItemInput {
  serviceType: string;
  customServiceName?: string;
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
  serviceCatalogItemId?: string;
}

export interface CreateEstimateInput {
  customerId: string;
  propertyId: string;
  lineItems: CreateLineItemInput[];
  discountType?: string;
  discountValue?: number;
  discountSource?: string;
  taxRatePercent?: number;
  notes?: string;
  terms?: string;
  internalNotes?: string;
  validUntil?: string;
}

// customerId/propertyId deliberately excluded — UpdateEstimateDto on the
// backend genuinely doesn't accept them (an estimate's customer/property
// isn't reassignable after creation). Using Partial<CreateEstimateInput>
// here previously let the frontend silently send fields the backend's
// whitelist validation would reject at save time — this type now matches
// the real contract instead of a looser structural guess at it.
export type UpdateEstimateInput = Partial<Omit<CreateEstimateInput, 'customerId' | 'propertyId'>>;

export const estimatesApi = {
  list: (params?: { status?: string; customerId?: string }) => {
    const query = params ? buildQueryString(params) : '';
    return apiFetch<Estimate[]>(`/estimates${query}`);
  },

  get: (id: string) => apiFetch<Estimate>(`/estimates/${id}`),

  create: (input: CreateEstimateInput) =>
    apiFetch<Estimate>('/estimates', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: UpdateEstimateInput) =>
    apiFetch<Estimate>(`/estimates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  send: (id: string) => apiFetch<Estimate>(`/estimates/${id}/send`, { method: 'POST' }),

  convertToJob: (id: string) => apiFetch<{ id: string; jobNumber: string; status: string }>(`/estimates/${id}/convert-to-job`, { method: 'POST' }),

  sendEmail: (id: string, toEmail?: string) =>
    apiFetch<{ success: boolean; emailLogId: string; recipientEmail: string }>(`/estimates/${id}/send-email`, { method: 'POST', body: JSON.stringify({ toEmail }) }),

  resendEmail: (id: string, toEmail?: string) =>
    apiFetch<{ success: boolean; emailLogId: string; recipientEmail: string }>(`/estimates/${id}/resend-email`, { method: 'POST', body: JSON.stringify({ toEmail }) }),

  sendSms: (id: string, toPhone?: string) =>
    apiFetch<{ success: boolean; logId: string; recipientPhone: string }>(`/estimates/${id}/send-sms`, { method: 'POST', body: JSON.stringify({ toPhone }) }),

  resendSms: (id: string, toPhone?: string) =>
    apiFetch<{ success: boolean; logId: string; recipientPhone: string }>(`/estimates/${id}/resend-sms`, { method: 'POST', body: JSON.stringify({ toPhone }) }),

  getEmailHistory: (id: string) => apiFetch<EmailLogEntry[]>(`/estimates/${id}/email-history`),
  getSignature: (id: string) => apiFetch<{ url: string | null; type: 'presigned' | 'legacy' | 'none' }>(`/estimates/${id}/signature`),

  pdfPath: (id: string) => `/estimates/${id}/pdf`,

  getStatusHistory: (id: string) => apiFetch<StatusHistoryEntry[]>(`/estimates/${id}/status-history`),
  acceptManually: (id: string) => apiFetch<Estimate>(`/estimates/${id}/accept`, { method: 'POST' }),
  declineManually: (id: string, declineReason?: string, declineComments?: string) =>
    apiFetch<Estimate>(`/estimates/${id}/decline`, { method: 'POST', body: JSON.stringify({ declineReason, declineComments }) }),
  markExpired: (id: string) => apiFetch<Estimate>(`/estimates/${id}/mark-expired`, { method: 'POST' }),
  reopen: (id: string) => apiFetch<Estimate>(`/estimates/${id}/reopen`, { method: 'POST' }),
  duplicate: (id: string) => apiFetch<Estimate>(`/estimates/${id}/duplicate`, { method: 'POST' }),

  remove: (id: string) => apiFetch<{ deleted: boolean }>(`/estimates/${id}`, { method: 'DELETE' }),
};

export interface EmailLogEntry {
  id: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  channel: 'email' | 'sms';
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  { value: 'flat_rate', label: 'Flat Rate' },
];
