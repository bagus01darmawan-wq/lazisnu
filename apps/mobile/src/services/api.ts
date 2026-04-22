// Mobile API Service - Lazisnu Collector App

import { MMKV } from 'react-native-mmkv';
import { ApiResponse, Collection, Task } from '@lazisnu/shared-types';

export const storage = new MMKV();

const API_BASE_URL = 'http://10.0.2.2:3001/v1';

// ── Token Management (MMKV is synchronous) ──────────────────────────────────

export const getToken = async (): Promise<string | null> => {
  return storage.getString('access_token') || null;
};

export const setToken = async (token: string): Promise<void> => {
  storage.set('access_token', token);
};

export const getRefreshToken = (): string | null => {
  return storage.getString('refresh_token') || null;
};

export const setRefreshToken = (token: string): void => {
  storage.set('refresh_token', token);
};

export const clearToken = async (): Promise<void> => {
  storage.delete('access_token');
  storage.delete('refresh_token');
};

// ── Token Refresh Logic ──────────────────────────────────────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(newToken: string) {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await response.json();
    if (response.ok && data.data?.access_token) {
      const newToken = data.data.access_token;
      await setToken(newToken);
      // Jika refresh token baru diterima, simpan juga
      if (data.data.refresh_token) {
        setRefreshToken(data.data.refresh_token);
      }
      return newToken;
    }
    // Refresh gagal — paksa logout
    await clearToken();
    return null;
  } catch {
    await clearToken();
    return null;
  }
}

// ── API Request with Auto-Refresh ────────────────────────────────────────────

const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<ApiResponse<T>> => {
  try {
    const token = await getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // ── Handle 401: coba refresh token, lalu retry ──
    if (response.status === 401 && !_isRetry) {
      if (isRefreshing) {
        // Tunggu refresh yang sedang berjalan
        return new Promise((resolve) => {
          refreshSubscribers.push(async (newToken) => {
            const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
              ...options,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${newToken}`,
                ...options.headers,
              },
            });
            const retryData = await retryResponse.json();
            if (retryResponse.ok) {
              resolve({ success: true, data: retryData.data || retryData });
            } else {
              resolve({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sesi telah berakhir' } });
            }
          });
        });
      }

      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;

      if (newToken) {
        onRefreshed(newToken);
        // Retry original request dengan token baru
        return apiRequest<T>(endpoint, options, true);
      } else {
        // Refresh token gagal / expired — session habis
        return {
          success: false,
          error: { code: 'SESSION_EXPIRED', message: 'Sesi telah berakhir. Silakan login kembali.' },
        };
      }
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: data.error?.code || 'UNKNOWN_ERROR',
          message: data.error?.message || 'Terjadi kesalahan',
          details: data.error?.details,
        },
      };
    }

    return { success: true, data: data.data || data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Tidak ada koneksi internet',
      },
    };
  }
};

// ── Auth Services ────────────────────────────────────────────────────────────

export const authService = {
  login: async (identifier: string, password: string) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },

  loginWithPhone: async (phone: string, password: string) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: phone, password }),
    });
  },

  requestOTP: async (phone: string) => {
    return apiRequest('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOTP: async (phone: string, otp: string) => {
    return apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    });
  },

  refresh: async (refreshToken: string) => {
    return apiRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    // Beritahu backend untuk blacklist refresh token
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {}); // Abaikan error jaringan saat logout
    }
    await clearToken();
  },

  me: async () => {
    return apiRequest('/auth/me');
  },
};

// ── Dashboard Services ────────────────────────────────────────────────────────

export const dashboardService = {
  getDashboard: async () => {
    return apiRequest('/mobile/dashboard');
  },

  getProfile: async () => {
    return apiRequest('/mobile/profile');
  },
};

// ── Tasks Services ────────────────────────────────────────────────────────────

export const tasksService = {
  getTasks: async (params?: { status?: string; page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiRequest(`/mobile/tasks${query ? `?${query}` : ''}`);
  },

  getTaskByQR: async (qrCode: string) => {
    return apiRequest(`/mobile/scan/${encodeURIComponent(qrCode)}`);
  },
};

// ── Collection Services ───────────────────────────────────────────────────────

export const collectionService = {
  submitCollection: async (data: {
    assignment_id: string;
    can_id: string;
    nominal: number;
    payment_method: 'CASH' | 'TRANSFER';
    transfer_receipt_url?: string;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: {
      model: string;
      os_version: string;
      app_version: string;
    };
    offline_id?: string;
  }) => {
    return apiRequest('/mobile/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmit: async (collections: Array<{
    offline_id: string;
    assignment_id: string;
    can_id: string;
    nominal: number;
    payment_method: 'CASH' | 'TRANSFER';
    collected_at: string;
    latitude?: number;
    longitude?: number;
  }>) => {
    return apiRequest('/mobile/collections/batch', {
      method: 'POST',
      body: JSON.stringify({ collections }),
    });
  },

  getSyncStatus: async () => {
    return apiRequest('/mobile/sync/status');
  },

  getHistory: async (params?: { page?: number; limit?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    const query = queryParams.toString();
    return apiRequest(`/mobile/history${query ? `?${query}` : ''}`);
  },
};

// ── Network Check ─────────────────────────────────────────────────────────────

export const networkService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  },
};

export default {
  auth: authService,
  dashboard: dashboardService,
  tasks: tasksService,
  collection: collectionService,
  network: networkService,
};