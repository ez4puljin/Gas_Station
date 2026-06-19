import type { ApiError } from '@fuel/types';
import { invalidateCache } from './request-cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ACCESS_TOKEN_KEY = 'fuel.accessToken';
const REFRESH_TOKEN_KEY = 'fuel.refreshToken';

export const tokenStore = {
  get access(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(access: string, refresh: string): void {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    invalidateCache(); // өөр хэрэглэгч рүү шилжихэд хуучин auth-scoped кэш үлдэхгүй
  },
  clear(): void {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    invalidateCache();
  },
};

/** ApiError-ийг шиддэг fetch wrapper. */
export class ApiException extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const token = tokenStore.access;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err: ApiError =
      data && typeof data === 'object'
        ? (data as ApiError)
        : { statusCode: res.status, code: 'UNKNOWN', message: 'Алдаа гарлаа' };
    throw new ApiException(err);
  }

  return data as T;
}
