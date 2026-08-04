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

export interface LeadSourceOption {
  key: string;
  label: string;
  enabled: boolean;
}

export interface PackageDiscountTier {
  minServices: number;
  percent: number;
}

export interface PackageDiscountSettings {
  enabled: boolean;
  mode: 'tiered' | 'fixed';
  fixedPercent: number;
  tiers: PackageDiscountTier[];
}

export interface IntegrationStatus {
  key: 'stripe' | 'postmark' | 'twilio' | 's3' | 'anthropic';
  name: string;
  configured: boolean;
  missingVars: string[];
  feature: string;
}

export interface IntegrationCard extends IntegrationStatus {
  lastVerifiedAt: string | null;
  verifyOk: boolean | null;
  verifyError: string | null;
  lastTestAt: string | null;
  testOk: boolean | null;
  testError: string | null;
  meta: Record<string, unknown> | null;
}

export interface HealthCheckResult {
  status: string;
  checkedAt?: string;
  note?: string;
}

export interface SystemHealth {
  database: HealthCheckResult;
  redis: HealthCheckResult;
  email: HealthCheckResult;
  sms: HealthCheckResult;
  payments: HealthCheckResult;
  ai: HealthCheckResult;
  storage: HealthCheckResult;
  automation: { status: string; lastRunAt: string | null; lastRunOk: boolean | null };
  environment: { value: string };
  version: { value: string };
  lastBackup: HealthCheckResult;
  railwayStatus: HealthCheckResult;
}

export interface BusinessLinks {
  googleReviewUrl: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
}

export interface PaymentSettings {
  stripe: IntegrationStatus;
  enabledPaymentMethods: string[];
}

export interface EmailSettings {
  postmark: IntegrationStatus;
  fromAddressConfigured: boolean;
  fromName: string | null;
  replyToEmail: string | null;
}

export interface SmsSettings {
  twilio: IntegrationStatus;
}

export interface StorageSettings {
  s3: IntegrationStatus;
  maxUploadSizeMb: number;
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
  getLeadSources: () => apiFetch<{ options: LeadSourceOption[] }>('/settings/lead-sources'),
  updateLeadSources: (options: LeadSourceOption[]) =>
    apiFetch<{ options: LeadSourceOption[] }>('/settings/lead-sources', { method: 'PATCH', body: JSON.stringify({ options }) }),
  getPackageDiscounts: () => apiFetch<PackageDiscountSettings>('/settings/package-discounts'),
  updatePackageDiscounts: (input: PackageDiscountSettings) =>
    apiFetch<PackageDiscountSettings>('/settings/package-discounts', { method: 'PATCH', body: JSON.stringify(input) }),

  getPaymentSettings: () => apiFetch<PaymentSettings>('/settings/payments'),
  updatePaymentSettings: (input: { enabledPaymentMethods: string[] }) => apiFetch<PaymentSettings>('/settings/payments', { method: 'PATCH', body: JSON.stringify(input) }),

  getEmailSettings: () => apiFetch<EmailSettings>('/settings/email'),
  updateEmailSettings: (input: { replyToEmail?: string }) => apiFetch<EmailSettings>('/settings/email', { method: 'PATCH', body: JSON.stringify(input) }),
  sendTestEmail: (toEmail: string) => apiFetch<{ queued: boolean; postmarkConfigured: boolean }>('/settings/email/test', { method: 'POST', body: JSON.stringify({ toEmail }) }),

  getSmsSettings: () => apiFetch<SmsSettings>('/settings/sms'),
  sendTestSms: (toPhone: string) => apiFetch<{ sent: boolean; error?: string; twilioConfigured: boolean }>('/settings/sms/test', { method: 'POST', body: JSON.stringify({ toPhone }) }),

  getStorageSettings: () => apiFetch<StorageSettings>('/settings/storage'),

  getIntegrations: () => apiFetch<IntegrationCard[]>('/settings/integrations'),
  getIntegrationsHealth: () => apiFetch<SystemHealth>('/settings/integrations/health'),
  verifyIntegration: (provider: string) => apiFetch<{ provider: string; ok: boolean; error?: string; meta?: Record<string, unknown> }>(`/settings/integrations/${provider}/verify`, { method: 'POST' }),
  testPostmarkIntegration: (toEmail: string) => apiFetch<{ ok: boolean; error?: string }>('/settings/integrations/postmark/test', { method: 'POST', body: JSON.stringify({ toEmail }) }),
  testTwilioIntegration: (toPhone: string) => apiFetch<{ ok: boolean; error?: string }>('/settings/integrations/twilio/test', { method: 'POST', body: JSON.stringify({ toPhone }) }),
  testS3Integration: () => apiFetch<{ ok: boolean; error?: string }>('/settings/integrations/s3/test', { method: 'POST' }),
  testAnthropicIntegration: () => apiFetch<{ ok: boolean; error?: string; meta?: Record<string, unknown> }>('/settings/integrations/anthropic/test', { method: 'POST' }),

  getBusinessLinks: () => apiFetch<BusinessLinks>('/settings/integrations/links'),
  updateBusinessLinks: (input: Partial<BusinessLinks>) => apiFetch<BusinessLinks>('/settings/integrations/links', { method: 'PATCH', body: JSON.stringify(input) }),
};

export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
