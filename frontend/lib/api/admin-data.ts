import { apiFetch } from './api-client';

export interface EstimateDeletionPreview {
  invoiceCount: number;
  paymentCount: number;
}

export interface JobDeletionPreview {
  invoiceCount: number;
  paymentCount: number;
  appointmentCount: number;
}

export interface InvoiceDeletionPreview {
  paymentCount: number;
}

export const adminDataApi = {
  previewEstimateDeletion: (id: string) => apiFetch<EstimateDeletionPreview>(`/admin/data/estimates/${id}/preview`),
  previewJobDeletion: (id: string) => apiFetch<JobDeletionPreview>(`/admin/data/jobs/${id}/preview`),
  previewInvoiceDeletion: (id: string) => apiFetch<InvoiceDeletionPreview>(`/admin/data/invoices/${id}/preview`),
  deleteEstimate: (id: string) => apiFetch<{ deleted: true }>(`/admin/data/estimates/${id}`, { method: 'DELETE' }),
  deleteJob: (id: string) => apiFetch<{ deleted: true }>(`/admin/data/jobs/${id}`, { method: 'DELETE' }),
  deleteInvoice: (id: string) => apiFetch<{ deleted: true }>(`/admin/data/invoices/${id}`, { method: 'DELETE' }),
  deletePayment: (id: string) => apiFetch<{ deleted: true }>(`/admin/data/payments/${id}`, { method: 'DELETE' }),
};
