import { apiFetch } from './api-client';

export interface SearchCustomerResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
}

export interface SearchEstimateResult {
  id: string;
  estimateNumber: string;
  status: string;
  totalAmount: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
}

export interface SearchInvoiceResult {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
}

export interface SearchJobResult {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
}

export interface GlobalSearchResult {
  customers: SearchCustomerResult[];
  estimates: SearchEstimateResult[];
  invoices: SearchInvoiceResult[];
  jobs: SearchJobResult[];
}

export const searchApi = {
  global: (q: string) => apiFetch<GlobalSearchResult>(`/search?q=${encodeURIComponent(q)}`),
};

export function searchDisplayName(entry: { firstName: string | null; lastName: string | null; businessName: string | null } | { customerFirstName: string | null; customerLastName: string | null; customerBusinessName: string | null }): string {
  const first = 'firstName' in entry ? entry.firstName : entry.customerFirstName;
  const last = 'lastName' in entry ? entry.lastName : entry.customerLastName;
  const business = 'businessName' in entry ? entry.businessName : entry.customerBusinessName;
  return business?.trim() || `${first ?? ''} ${last ?? ''}`.trim() || 'Unnamed';
}
