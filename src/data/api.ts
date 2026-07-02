// API client singleton (data layer). This is the ONLY module that talks to the
// local backend over HTTP — it replaces the Supabase client singleton in the
// original. Presentation code must never call this directly; go through services.

// Empty BASE_URL = same-origin `/api/...` (Vite dev proxy → localhost:4000).
// Set VITE_API_URL only when the frontend is served separately in production.
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const SESSION_KEY = 'gara.session';

// Session token is held in memory and mirrored to sessionStorage (NOT plain
// localStorage), per the security spec. sessionStorage is cleared when the tab
// closes, which is the desired behaviour for a session token.
let sessionToken: string | null = sessionStorage.getItem(SESSION_KEY);

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  if (token) sessionStorage.setItem(SESSION_KEY, token);
  else sessionStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the local server. Is it running?');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, { auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'POST', body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'PATCH', body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'PUT', body, auth }),
  del: <T>(path: string, auth = true) => request<T>(path, { method: 'DELETE', auth }),
};
