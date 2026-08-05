import { apiFetch } from './api-client';

export type JourneyStage = 'new_lead' | 'estimate_sent' | 'scheduled' | 'completed';

export const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  new_lead: 'New Lead',
  estimate_sent: 'Estimate Sent',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

export interface CustomerSummary {
  id: string;
  displayName: string;
  customerType: 'residential' | 'commercial';
  email: string | null;
  phone: string | null;
  leadStatus: string;
  journeyStage: JourneyStage;
  lifetimeValue: number;
  tags: string[];
  propertyCount: number;
  primaryLocation: string | null;
  createdAt: string;
  updatedAt: string;
  balanceDue: string;
  lastServiceDate: string | null;
}

export interface PaginatedCustomers {
  data: CustomerSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CustomerQueryParams {
  search?: string;
  customerType?: string;
  leadStatus?: string;
  tags?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Property {
  id: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface CustomFieldValue {
  fieldKey: string;
  label: string;
  fieldType: string;
  value: unknown;
}

export interface CustomerProfile {
  id: string;
  companyId: string;
  customerType: 'residential' | 'commercial';
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  source: string | null;
  leadStatus: string;
  journeyStage: JourneyStage;
  lifetimeValue: number;
  tags: string[];
  notesText: string | null;
  properties: Property[];
  customFields: CustomFieldValue[];
  createdAt: string;
  updatedAt: string;
  balanceDue: string;
  openEstimatesCount: number;
  openInvoicesCount: number;
}

export interface DuplicateCandidate {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchReason: 'exact_email' | 'exact_phone' | 'similar_name';
  similarity?: number;
}

export interface DuplicateCluster {
  customers: Array<{ id: string; displayName: string; email: string | null; phone: string | null }>;
  reason: 'exact_email' | 'exact_phone' | 'similar_name';
}

export interface ServiceHistory {
  summary: { totalJobs: number; completedJobs: number; outstandingBalance: number };
  intelligence: {
    lastServiceDate: string | null;
    jobsCompleted: number;
    averageJobValue: number;
    recommendedUpsell: { serviceType: string; name: string } | null;
    overdueForCleaning: boolean;
    reviewStatus: 'received' | 'sent' | 'failed' | 'never_requested';
    reviewReceivedAt: string | null;
  };
  jobs: Array<{ id: string; title: string; status: string; serviceType: string | null; scheduledStart: string | null; price: number; address: string }>;
  estimates: Array<{ id: string; status: string; totalAmount: number; sentAt: string | null; createdAt: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; totalAmount: number; amountPaid: number; dueDate: string | null }>;
  payments: Array<{ id: string; amount: number; method: string; status: string; processedAt: string | null }>;
}

export interface ActivityEvent {
  id: string;
  type: string;
  description: string;
  occurredAt: string;
}

export interface Note {
  id: string;
  body: string;
  isPinned: boolean;
  authorUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPhoto {
  id: string;
  photoType: string;
  url: string;
  createdAt: string;
}

export interface CustomerDocument {
  id: string;
  fileName: string;
  documentType: string;
  url: string;
  createdAt: string;
}

export interface ImportReport {
  totalRows: number;
  imported: number;
  skippedDuplicates: number;
  errors: Array<{ row: number; reason: string }>;
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const customersApi = {
  list: (params: CustomerQueryParams) => apiFetch<PaginatedCustomers>(`/customers${buildQueryString(params as any)}`),

  get: (id: string) => apiFetch<CustomerProfile>(`/customers/${id}`),

  create: (input: Record<string, unknown>) =>
    apiFetch<CustomerProfile>('/customers', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: Record<string, unknown>) =>
    apiFetch<CustomerProfile>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  delete: (id: string) => apiFetch<{ message: string }>(`/customers/${id}`, { method: 'DELETE' }),
  bulkDelete: (ids: string[]) =>
    apiFetch<{ succeeded: string[]; failed: { id: string; reason: string }[] }>('/customers/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  checkDuplicate: (input: { email?: string; phone?: string; firstName?: string; lastName?: string; businessName?: string }) =>
    apiFetch<DuplicateCandidate[]>('/customers/check-duplicate', { method: 'POST', body: JSON.stringify(input) }),

  scanDuplicates: () => apiFetch<DuplicateCluster[]>('/customers/duplicates'),

  merge: (canonicalId: string, duplicateId: string) =>
    apiFetch<CustomerProfile>(`/customers/${canonicalId}/merge/${duplicateId}`, { method: 'POST' }),

  getServiceHistory: (id: string) => apiFetch<ServiceHistory>(`/customers/${id}/service-history`),
  markReviewReceived: (id: string) => apiFetch<void>(`/customers/${id}/mark-review-received`, { method: 'POST' }),

  getActivity: (id: string) => apiFetch<ActivityEvent[]>(`/customers/${id}/activity`),

  // Properties
  listProperties: (customerId: string) => apiFetch<Property[]>(`/customers/${customerId}/properties`),
  createProperty: (customerId: string, input: Omit<Property, 'id'>) =>
    apiFetch<Property>(`/customers/${customerId}/properties`, { method: 'POST', body: JSON.stringify(input) }),
  updateProperty: (customerId: string, propertyId: string, input: Partial<Omit<Property, 'id'>>) =>
    apiFetch<Property>(`/customers/${customerId}/properties/${propertyId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteProperty: (customerId: string, propertyId: string) =>
    apiFetch<{ message: string }>(`/customers/${customerId}/properties/${propertyId}`, { method: 'DELETE' }),

  // Notes
  listNotes: (customerId: string) => apiFetch<Note[]>(`/customers/${customerId}/notes`),
  createNote: (customerId: string, input: { body: string; isPinned?: boolean }) =>
    apiFetch<Note>(`/customers/${customerId}/notes`, { method: 'POST', body: JSON.stringify(input) }),
  updateNote: (customerId: string, noteId: string, input: { body?: string; isPinned?: boolean }) =>
    apiFetch<Note>(`/customers/${customerId}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteNote: (customerId: string, noteId: string) =>
    apiFetch<{ message: string }>(`/customers/${customerId}/notes/${noteId}`, { method: 'DELETE' }),

  // Photos
  listPhotos: (customerId: string) => apiFetch<CustomerPhoto[]>(`/customers/${customerId}/photos`),
  presignPhotoUpload: (customerId: string, input: { fileName: string; mimeType: string; photoType?: string; fileSizeBytes?: number }) =>
    apiFetch<{ uploadUrl: string; key: string }>(`/customers/${customerId}/photos/upload-url`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  confirmPhotoUpload: (customerId: string, input: { key: string; photoType?: string; mimeType?: string; fileSizeBytes?: number }) =>
    apiFetch<CustomerPhoto>(`/customers/${customerId}/photos`, { method: 'POST', body: JSON.stringify(input) }),
  deletePhoto: (customerId: string, photoId: string) =>
    apiFetch<{ message: string }>(`/customers/${customerId}/photos/${photoId}`, { method: 'DELETE' }),

  // Documents
  listDocuments: (customerId: string) => apiFetch<CustomerDocument[]>(`/customers/${customerId}/documents`),
  presignDocumentUpload: (customerId: string, input: { fileName: string; mimeType: string; documentType?: string; fileSizeBytes?: number }) =>
    apiFetch<{ uploadUrl: string; key: string }>(`/customers/${customerId}/documents/upload-url`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  confirmDocumentUpload: (
    customerId: string,
    input: { key: string; fileName: string; documentType?: string; mimeType?: string; fileSizeBytes?: number },
  ) => apiFetch<CustomerDocument>(`/customers/${customerId}/documents`, { method: 'POST', body: JSON.stringify(input) }),
  deleteDocument: (customerId: string, documentId: string) =>
    apiFetch<{ message: string }>(`/customers/${customerId}/documents/${documentId}`, { method: 'DELETE' }),

  // Custom fields
  getCustomFieldValues: (customerId: string) => apiFetch<CustomFieldValue[]>(`/customers/${customerId}/custom-fields`),
  setCustomFieldValues: (customerId: string, values: Record<string, string | number | boolean | null>) =>
    apiFetch<CustomFieldValue[]>(`/customers/${customerId}/custom-fields`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    }),

  // Import/export
  /**
   * A plain <a href> download can't carry our Authorization header (tokens
   * live in memory, not a cookie — see token-storage.ts), so export has to
   * be a real authenticated fetch that downloads the response as a blob.
   */
  exportCsv: async (): Promise<void> => {
    const token = (await import('../auth/token-storage')).getAccessToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/customers/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  importCsv: async (file: File): Promise<ImportReport> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = (await import('../auth/token-storage')).getAccessToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/customers/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? 'Import failed');
    }
    return response.json();
  },
};
