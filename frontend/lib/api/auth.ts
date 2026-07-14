import { apiFetch } from './api-client';

const API_ROOT_URL = process.env.NEXT_PUBLIC_API_ROOT_URL ?? 'http://localhost:4000';


export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface CompanyMembership {
  companyId: string;
  companyName: string;
  role: string;
}

export interface LoginResult extends Partial<TokenPair> {
  requiresCompanySelection: boolean;
  companies?: CompanyMembership[];
  preAuthToken?: string;
}

export interface CurrentUser {
  userId: string;
  email: string;
  companyId: string;
  companyUserId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export const authApi = {
  register: (input: { email: string; password: string; firstName: string; lastName: string; companyName: string; phone?: string }) =>
    apiFetch<{ message: string; userId: string; companyId: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  login: (input: { email: string; password: string }) =>
    apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  selectCompany: (input: { preAuthToken: string; companyId: string }) =>
    apiFetch<TokenPair>('/auth/select-company', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  switchCompany: (companyId: string) =>
    apiFetch<TokenPair>('/auth/switch-company', {
      method: 'POST',
      body: JSON.stringify({ companyId }),
    }),

  logout: (jti: string | null) =>
    apiFetch<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ jti }),
    }),

  logoutAllDevices: () => apiFetch<{ message: string }>('/auth/logout-all', { method: 'POST' }),

  me: () => apiFetch<CurrentUser>('/auth/me'),

  myCompanies: () => apiFetch<CompanyMembership[]>('/auth/my-companies'),

  verifyEmail: (token: string) =>
    apiFetch<{ message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
      skipAuth: true,
    }),

  resendVerification: (email: string) =>
    apiFetch<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    }),

  forgotPassword: (email: string) =>
    apiFetch<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    }),

  resetPassword: (input: { token: string; newPassword: string }) =>
    apiFetch<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  previewInvite: (token: string) =>
    apiFetch<{ companyName: string; roleName: string; email: string; requiresPassword: boolean }>(
      `/auth/invite/${token}`,
      { skipAuth: true },
    ),

  acceptInvite: (input: { inviteToken: string; password?: string }) =>
    apiFetch<TokenPair>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  inviteTeamMember: (input: { email: string; roleId: string }) =>
    apiFetch<{ message: string }>('/auth/invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Google/Microsoft routes are excluded from the /api/v1 prefix on the
  // backend (see main.ts setGlobalPrefix exclude list) since they're
  // full-page browser redirects, not JSON API calls.
  googleLoginUrl: () => `${API_ROOT_URL}/auth/google`,
  microsoftLoginUrl: () => `${API_ROOT_URL}/auth/microsoft`,
};
