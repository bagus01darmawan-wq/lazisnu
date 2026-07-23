// Mobile API Service - Lazisnu Collector App

import { MMKV } from 'react-native-mmkv';
import { ApiResponse, Task, AuthLoginResponse, MeResponse, DashboardResponse, TaskListResponse, ProfileResponse, HistoryResponse, BatchSyncResponse, BatchCollectionRequestItem } from '@lazisnu/shared-types';
import { captureAuthEvent } from '../config/crashlytics';

// Instance dibuat setelah encryption key tersedia. Membuka file terenkripsi
// tanpa key lebih dulu dapat membuat MMKV menganggap file corrupt dan meresetnya.
const AUTH_STORAGE_ID = '@lazisnu/auth-token';
let storage: MMKV | null = null;

export function initializeAuthStorage(
  encryptionKey: string,
  migrateUnencrypted = false,
): MMKV {
  const instance = new MMKV(
    migrateUnencrypted
      ? {id: AUTH_STORAGE_ID}
      : {id: AUTH_STORAGE_ID, encryptionKey},
  );

  if (migrateUnencrypted) {
    instance.recrypt(encryptionKey);
  }

  storage = instance;
  return instance;
}

export function getAuthStorage(): MMKV {
  if (!storage) {
    throw new Error('Auth storage belum diinisialisasi');
  }
  return storage;
}

const getApiOrigin = (): string => {
  if (__DEV__) {
    // Android emulator accessing host machine via 10.0.2.2
    return 'http://10.0.2.2:3001';
  }
  return 'https://api.lazisnu.site'; // Production
};

export const API_ORIGIN = getApiOrigin();
export const API_BASE_URL = `${API_ORIGIN}/v1`;

// ── Token Management (MMKV is synchronous) ──────────────────────────────────

export const getToken = async (): Promise<string | null> => {
  return getAuthStorage().getString('access_token') || null;
};

export const setToken = async (token: string): Promise<void> => {
  getAuthStorage().set('access_token', token);
};

export const getRefreshToken = (): string | null => {
  return getAuthStorage().getString('refresh_token') || null;
};

export const setRefreshToken = (token: string): void => {
  getAuthStorage().set('refresh_token', token);
};

export const clearToken = async (): Promise<void> => {
  getAuthStorage().delete('access_token');
  getAuthStorage().delete('refresh_token');
};

// ── Token Refresh Logic ──────────────────────────────────────────────────────

let isRefreshing = false;

// Setiap subscriber mendaftarkan 2 callback: sukses dan gagal.
// Tanpa onFailure, antrean request yang menunggu akan hang selamanya
// saat refresh token gagal (lihat review auth-verdict #2).
type RefreshSubscriber = {
  onSuccess: (token: string) => void;
  onFailure: () => void;
};
let refreshSubscribers: RefreshSubscriber[] = [];

// Handler SESSION_EXPIRED — dipasang oleh useAuthStore agar api.ts
// tidak perlu import store (mencegah circular dependency).
// Setelah dipanggil, state klien di-reset dan UI kembali ke AuthStack.
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

function notifySessionExpired() {
  // Telemetri post-rollout: lacak frekuensi SESSION_EXPIRED per user/device
  captureAuthEvent('session_expired', { source: 'refresh_failed' });
  if (sessionExpiredHandler) {
    try { sessionExpiredHandler(); } catch (e) { /* swallow */ }
  }
}

function onRefreshed(newToken: string) {
  refreshSubscribers.forEach(sub => sub.onSuccess(newToken));
  refreshSubscribers = [];
}

function onRefreshFailed() {
  refreshSubscribers.forEach(sub => sub.onFailure());
  refreshSubscribers = [];
}

type RefreshResult = { token: string | null; networkError: boolean };

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {return { token: null, networkError: false };}

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
      return { token: newToken, networkError: false };
    }
    // Refresh gagal: hanya bersihkan token jika server secara eksplisit
    // menolak kredensial (401/403). Untuk 5xx/network, biarkan token
    // agar retry berikutnya masih bisa mencoba (lihat review P3).
    if (response.status === 401 || response.status === 403) {
      await clearToken();
    }
    return { token: null, networkError: response.status >= 500 };
  } catch {
    // Network error / JSON parse error — JANGAN clearToken di sini.
    // Token masih bisa valid; user bisa retry saat online.
    return { token: null, networkError: true };
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // ── Handle 401: coba refresh token, lalu retry (kecuali endpoint auth/login/otp) ──
    const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/request-otp') || endpoint.includes('/auth/verify-otp');
    if (response.status === 401 && !_isRetry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Tunggu refresh yang sedang berjalan — Daftarkan 2 jalur callback
        // agar subscriber tidak hang saat refresh gagal.
        return new Promise<ApiResponse<T>>((resolve) => {
          refreshSubscribers.push({
            onSuccess: async (newToken) => {
              try {
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
              } catch {
                // Network drop / HTML 502 — JANGAN biarkan promise menggantung
                resolve({
                  success: false,
                  error: { code: 'NETWORK_ERROR', message: 'Tidak ada koneksi internet' },
                });
              }
            },
            onFailure: () => {
              // Refresh gagal — broadcast SESSION_EXPIRED ke subscriber ini
              resolve({
                success: false,
                error: {
                  code: 'SESSION_EXPIRED',
                  message: 'Sesi telah berakhir. Silakan login kembali.',
                },
              });
            },
          });
        });
      }

      isRefreshing = true;
      const refreshResult = await refreshAccessToken();
      isRefreshing = false;

      if (refreshResult.token) {
        onRefreshed(refreshResult.token);
        // Retry original request dengan token baru
        return apiRequest<T>(endpoint, options, true);
      } else if (refreshResult.networkError) {
        onRefreshFailed();
        return { success: false, error: { code: 'NETWORK_ERROR', message: 'Tidak ada koneksi internet' } };
      } else {
        // Refresh gagal — flush semua subscriber yang menunggu agar
        // tidak menggantung, lalu broadcast SESSION_EXPIRED agar UI
        // kembali ke AuthStack lewat useAuthStore.forceLogout.
        onRefreshFailed();
        notifySessionExpired();
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
  login: async (identifier: string, password: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },

  requestOTP: async (phone: string): Promise<ApiResponse<{ message: string; expires_in: number }>> => {
    return apiRequest('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOTP: async (phone: string, otp: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    });
  },

  refresh: async (refreshToken: string): Promise<ApiResponse<{ access_token: string; refresh_token: string }>> => {
    return apiRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => { });
    }
    await clearToken();
  },

  me: async (): Promise<ApiResponse<MeResponse>> => {
    return apiRequest<MeResponse>('/auth/me');
  },
};

// ── Dashboard Services ────────────────────────────────────────────────────────

export const dashboardService = {
  getDashboard: async (): Promise<ApiResponse<DashboardResponse>> => {
    return apiRequest<DashboardResponse>('/mobile/dashboard');
  },

  getProfile: async (): Promise<ApiResponse<ProfileResponse>> => {
    return apiRequest<ProfileResponse>('/mobile/profile');
  },
};

// ── Tasks Services ────────────────────────────────────────────────────────────

export const tasksService = {
  getTasks: async (params?: { status?: string; page?: number; limit?: number }): Promise<ApiResponse<TaskListResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.status) {queryParams.append('status', params.status);}
    if (params?.page) {queryParams.append('page', params.page.toString());}
    if (params?.limit) {queryParams.append('limit', params.limit.toString());}

    const query = queryParams.toString();
    return apiRequest<TaskListResponse>(`/mobile/tasks${query ? `?${query}` : ''}`);
  },

  getTaskByQR: async (qrCode: string): Promise<ApiResponse<Task>> => {
    return apiRequest<Task>(`/mobile/scan/${encodeURIComponent(qrCode)}`);
  },
};

// ── Collection Services ───────────────────────────────────────────────────────

export const collectionService = {
  submitCollection: async (data: {
    assignment_id: string;
    can_id: string;
    nominal: number;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: {
      model: string;
      os_version: string;
      app_version: string;
    };
    offline_id?: string;
  }): Promise<ApiResponse<{ id: string; sync_status: 'COMPLETED' | 'ALREADY_SYNCED'; whatsapp_status: 'ENQUEUED' | 'FAILED' | 'SKIPPED'; message: string }>> => {
    return apiRequest('/mobile/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmit: async (
    collections: BatchCollectionRequestItem[]
  ): Promise<ApiResponse<BatchSyncResponse>> => {
    return apiRequest<BatchSyncResponse>('/mobile/collections/batch', {
      method: 'POST',
      body: JSON.stringify({ collections }),
    });
  },

  getSyncStatus: async (): Promise<ApiResponse<{ pending_count: number; last_sync_at: string; oldest_pending: string | null }>> => {
    return apiRequest('/mobile/sync/status');
  },

  getHistory: async (params?: { page?: number; limit?: number }): Promise<ApiResponse<HistoryResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.page) {queryParams.append('page', params.page.toString());}
    if (params?.limit) {queryParams.append('limit', params.limit.toString());}
    const query = queryParams.toString();
    return apiRequest<HistoryResponse>(`/mobile/history${query ? `?${query}` : ''}`);
  },

  resubmitCollection: async (
    id: string,
    data: { nominal: number; alasan_resubmit: string }
  ): Promise<ApiResponse<{ id: string; submit_sequence: number; whatsapp_status: string; message: string }>> => {
    return apiRequest(`/mobile/collections/${id}/resubmit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  skipAssignment: async (
    id: string,
    notes?: string,
  ): Promise<ApiResponse<{ id: string; status: string; message: string }>> => {
    return apiRequest(`/mobile/assignments/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify(notes ? { notes } : {}),
    });
  },

  completePeriod: async (): Promise<ApiResponse<{ period: string; skipped_count: number; message: string }>> => {
    return apiRequest('/mobile/periods/complete', {
      method: 'POST',
    });
  },
};

// ── Network Check ─────────────────────────────────────────────────────────────

export const networkService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_ORIGIN}/health`, {
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
