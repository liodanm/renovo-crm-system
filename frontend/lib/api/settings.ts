import { apiFetch } from './api-client';

export interface ProfileSettings {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  dateFormat: string;
  language: string;
  emailVerifiedAt: string | null;
}

export interface CompanySettings {
  id: string;
  name: string;
  dba: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  licenseNumber: string | null;
  businessHours: Record<string, { open?: string; close?: string; closed?: boolean }> | null;
}

export interface BusinessDefaults {
  defaultTaxRatePercent: string | null;
  defaultArrivalWindowMinutes: number | null;
  defaultEstimateExpirationDays: number | null;
  defaultInvoiceDueDays: number | null;
  defaultLaborRate: string | null;
  currency: string;
  measurementUnitSystem: string;
  distanceUnit: string;
  timezone: string;
}

export interface BrandingSettings {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  estimateHeader: string | null;
  invoiceHeader: string | null;
  footerMessage: string | null;
}

export const settingsApi = {
  getProfile: () => apiFetch<ProfileSettings>('/settings/profile'),
  updateProfile: (input: Partial<ProfileSettings>) => apiFetch<ProfileSettings>('/settings/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ success: boolean }>('/settings/profile/change-password', { method: 'POST', body: JSON.stringify(input) }),

  getCompany: () => apiFetch<CompanySettings>('/settings/company'),
  updateCompany: (input: Partial<CompanySettings>) => apiFetch<CompanySettings>('/settings/company', { method: 'PATCH', body: JSON.stringify(input) }),

  getBusinessDefaults: () => apiFetch<BusinessDefaults>('/settings/business-defaults'),
  updateBusinessDefaults: (input: Partial<BusinessDefaults>) =>
    apiFetch<BusinessDefaults>('/settings/business-defaults', { method: 'PATCH', body: JSON.stringify(input) }),

  getBranding: () => apiFetch<BrandingSettings>('/settings/branding'),
  updateBranding: (input: Partial<BrandingSettings>) => apiFetch<BrandingSettings>('/settings/branding', { method: 'PATCH', body: JSON.stringify(input) }),
};

export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
