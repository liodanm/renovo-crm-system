import { apiFetch } from './api-client';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  serviceType: string | null;
  unitOfMeasure: string | null;
  serviceCatalogItemId: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  customerId: string;
  propertyId: string | null;
  jobId: string | null;
  estimateId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  jobNumber: string | null;
  subtotal: string;
  discountType: string | null;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  lineItems: InvoiceLineItem[];
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  dueDate: string | null;
  customerId: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
}

export const invoicesApi = {
  list: (params?: { status?: string; customerId?: string }) => {
    const entries = params ? Object.entries(params).filter(([, v]) => v) : [];
    const query = entries.length ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
    return apiFetch<InvoiceListItem[]>(`/invoices${query}`);
  },
  get: (id: string) => apiFetch<Invoice>(`/invoices/${id}`),
  generateFromJob: (jobId: string) => apiFetch<Invoice>(`/invoices/from-job/${jobId}`, { method: 'POST' }),
  update: (id: string, input: { dueDate?: string; discountType?: string; discountValue?: number; taxRatePercent?: number; notes?: string; terms?: string }) =>
    apiFetch<Invoice>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  send: (id: string) => apiFetch<Invoice>(`/invoices/${id}/send`, { method: 'POST' }),
  void: (id: string) => apiFetch<Invoice>(`/invoices/${id}/void`, { method: 'POST' }),
};

export function invoiceCustomerName(inv: { customerBusinessName: string | null; customerFirstName: string | null; customerLastName: string | null }): string {
  return inv.customerBusinessName ?? (`${inv.customerFirstName ?? ''} ${inv.customerLastName ?? ''}`.trim() || 'Unknown');
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

export const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  void: 'bg-slate-100 text-slate-400',
};
