import { apiFetch } from './api-client';

export interface Payment {
  id: string;
  invoiceId: string | null;
  customerId: string;
  propertyId: string | null;
  amount: string;
  tipAmount: string;
  method: string;
  status: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentDate: string | null;
  processedAt: string | null;
  refundedAmount: string;
  receiptNumber: string | null;
  createdAt: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  amount: string;
  tipAmount: string;
  method: string;
  status: string;
  referenceNumber: string | null;
  paymentDate: string | null;
  notes: string | null;
  invoiceNumber: string | null;
  invoiceTotal: string | null;
  invoiceBalanceDue: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
  customerEmail: string | null;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  companyName: string;
  companyDba: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyAddressLine1: string | null;
  companyCity: string | null;
  companyState: string | null;
  googleReviewUrl: string | null;
  branding: { logoUrl: string | null; primaryColor: string | null; footerMessage: string | null };
}

export interface RecordPaymentInput {
  amount: number;
  method: string;
  paymentDate?: string;
  tipAmount?: number;
  referenceNumber?: string;
  notes?: string;
}

export interface PaymentListItem extends Payment {
  invoiceNumber: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
}

export const paymentsApi = {
  list: (status?: string) => apiFetch<PaymentListItem[]>(`/payments${status ? `?status=${status}` : ''}`),
  listByInvoice: (invoiceId: string) => apiFetch<Payment[]>(`/invoices/${invoiceId}/payments`),
  record: (invoiceId: string, input: RecordPaymentInput) => apiFetch<Payment>(`/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(input) }),
  recordStandalone: (customerId: string, input: RecordPaymentInput) => apiFetch<Payment>(`/customers/${customerId}/payments`, { method: 'POST', body: JSON.stringify(input) }),
  get: (id: string) => apiFetch<Payment>(`/payments/${id}`),
  void: (id: string, note?: string) => apiFetch<Payment>(`/payments/${id}/void`, { method: 'POST', body: JSON.stringify({ note }) }),
  refund: (id: string, amount?: number, note?: string) => apiFetch<Payment>(`/payments/${id}/refund`, { method: 'POST', body: JSON.stringify({ amount, note }) }),
  getReceipt: (id: string) => apiFetch<Receipt>(`/payments/${id}/receipt`),
};

export function invoiceCustomerNameFromReceipt(r: { customerBusinessName: string | null; customerFirstName: string | null; customerLastName: string | null }): string {
  return r.customerBusinessName ?? (`${r.customerFirstName ?? ''} ${r.customerLastName ?? ''}`.trim() || 'Unknown');
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Card (Stripe)',
  ach: 'ACH',
  cash: 'Cash',
  check: 'Check',
  zelle: 'Zelle',
  other: 'Other',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
  void: 'Void',
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-slate-100 text-slate-500',
  partially_refunded: 'bg-orange-100 text-orange-700',
  void: 'bg-slate-100 text-slate-400',
};
