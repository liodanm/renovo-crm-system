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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
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

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
