import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '../auth/token-storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

// Prevents a burst of parallel 401s from each independently triggering a
// refresh call — every concurrent request awaits the SAME in-flight refresh.
let refreshInFlight: Promise<boolean> | null = null;

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; skipRefreshRetry?: boolean } = {},
): Promise<T> {
  const { skipAuth, skipRefreshRetry, headers, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      // FormData bodies (photo uploads) must NOT set Content-Type
      // manually — the browser needs to generate its own multipart
      // boundary, which setting this header here would override.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(skipAuth ? {} : authHeader()),
      ...headers,
    },
  });

  if (response.status === 401 && !skipAuth && !skipRefreshRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefreshRetry: true });
    }
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const body = await safeJson(response);
    throw new ApiError(response.status, body?.message ?? 'Request failed', body);
  }

  return safeJson(response) as Promise<T>;
}

async function refreshAccessToken(): Promise<boolean> {
  const token = getRefreshToken();
  if (!token) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token }),
        });
        if (!response.ok) return false;
        const data = await response.json();
        setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * A plain <a href="..."> to a PDF endpoint can't carry the Bearer auth
 * header this app uses (no cookie-based auth here), so browser
 * navigation alone would 401 on every document view/download. This
 * fetches the PDF as a real authenticated request and hands back an
 * object URL the caller can point a new tab or a download link at.
 * Caller is responsible for calling URL.revokeObjectURL when done.
 */
export async function fetchPdfObjectUrl(path: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeader() });
  if (!response.ok) {
    throw new ApiError(response.status, `Couldn't load the PDF (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
