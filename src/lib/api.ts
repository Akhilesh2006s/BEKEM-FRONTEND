import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import type { ApiErrorDto, AuthTokensDto } from '@afios/shared';
import { useAuthStore } from '@/stores/authStore';

// Dev: /api (Vite proxy → localhost:4000). Prod: set in .env.production (Railway).
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshPromise: Promise<AuthTokensDto> | null = null;
let sessionExpiredToastAt = 0;

function isAuthRouteUrl(url: string | undefined, baseURL?: string): boolean {
  const full = `${baseURL || ''}${url || ''}`;
  return full.includes('/auth/login') || full.includes('/auth/refresh');
}

function accessTokenNeedsRefresh(token: string | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length < 2) return true;
  try {
    const json = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(json)) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + 15_000;
  } catch {
    return true;
  }
}

function expireSession() {
  useAuthStore.getState().logout();
  if (Date.now() - sessionExpiredToastAt > 3000) {
    sessionExpiredToastAt = Date.now();
    toast.error('Session expired. Please log in again.');
  }
}

function queueRefresh(): Promise<AuthTokensDto> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function refreshAccessToken(): Promise<AuthTokensDto> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token');
  }
  const res = await axios.post<{ tokens: AuthTokensDto }>(`${API_BASE}/auth/refresh`, {
    refreshToken,
  });
  useAuthStore.getState().setTokens(res.data.tokens);
  return res.data.tokens;
}

api.interceptors.request.use(async (config) => {
  if (isAuthRouteUrl(config.url, config.baseURL)) {
    return config;
  }

  let token = useAuthStore.getState().accessToken;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (token && refreshToken && accessTokenNeedsRefresh(token)) {
    try {
      token = (await queueRefresh()).accessToken;
    } catch {
      expireSession();
      token = null;
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorDto>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    const text = Array.isArray(message)
      ? message.join(', ')
      : message || error.message || 'Something went wrong';
    const original = error.config as RetryConfig | undefined;
    const isAuthRoute = isAuthRouteUrl(original?.url, original?.baseURL);

    if (status === 401 && original && !original._retry && !isAuthRoute) {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          original._retry = true;
          const tokens = await queueRefresh();
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return api(original);
        } catch {
          expireSession();
          return Promise.reject(error);
        }
      }
      expireSession();
    } else if (status !== 403 && !isAuthRoute) {
      toast.error(text);
    }

    return Promise.reject(error);
  }
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Something went wrong';
}
