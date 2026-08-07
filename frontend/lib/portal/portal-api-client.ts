import { getPortalToken, getPortalCompanySlug, clearPortalToken } from './portal-token-storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class PortalApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function portalApiFetch<T>(path: string, options: RequestInit & { skipAuth?: boolean } = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const token = getPortalToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && !skipAuth) {
    // No refresh path exists for portal sessions — a 401 means the
    // 30-day token has genuinely expired or is invalid. Clear it and
    // send the customer back to request a new magic link, rather than
    // showing a confusing error on a page that can't recover itself.
    const slug = getPortalCompanySlug();
    clearPortalToken();
    if (typeof window !== 'undefined') {
      window.location.href = slug ? `/portal/${slug}/login` : '/';
    }
    throw new PortalApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const body = await safeJson(response);
    throw new PortalApiError(response.status, body?.message ?? 'Request failed', body);
  }

  return safeJson(response) as Promise<T>;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
