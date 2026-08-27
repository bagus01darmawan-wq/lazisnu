// Mobile API Service - Lazisnu Collector App

import 'react-native-get-random-values';
import {MMKV} from 'react-native-mmkv';
import {Platform} from 'react-native';
import {
  ApiResponse,
  Task,
  AuthLoginResponse,
  MeResponse,
  DashboardResponse,
  TaskListResponse,
  ProfileResponse,
  HistoryResponse,
  BatchSyncResponse,
  BatchCollectionRequestItem,
  RangeStatsResponse,
} from '@lazisnu/shared-types';
import {captureAuthEvent} from '../config/crashlytics';
import {saveRefreshTokenSilent} from './biometric';
import {resolveSessionAction} from './authSessionPolicy';

// Instance dibuat setelah encryption key tersedia. Membuka file terenkripsi
// tanpa key lebih dulu dapat membuat MMKV menganggap file corrupt dan meresetnya.
const AUTH_STORAGE_ID = '@lazisnu/auth-token';
let storage: MMKV | null = null;

export function initializeAuthStorage(encryptionKey: string, migrateUnencrypted = false): MMKV {
  const instance = new MMKV(
    migrateUnencrypted ? {id: AUTH_STORAGE_ID} : {id: AUTH_STORAGE_ID, encryptionKey},
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
  // API_URL di-inject oleh EAS Build per profile (eas.json).
  // development: http://10.0.2.2:3001
  // preview:     https://staging-api.lazisnu.site
  // production:  https://api.lazisnu.site
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  // Fallback: local dev (React Native CLI tanpa EAS)
  if (__DEV__) {
    return 'http://10.0.2.2:3001';
  }
  return 'https://api.lazisnu.site';
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

// ── Device ID — identifikasi sesi per perangkat (Sub-bab 04 + 05) ─────────────

const DEVICE_ID_KEY = 'device_id';

/* eslint-disable no-bitwise */
function generateUUID(): string {
  // crypto.getRandomValues dipasang oleh polyfill react-native-get-random-values.
  // ID perangkat TIDAK boleh memakai Math.random() yang bisa diprediksi (standar Bab 2.2).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set versi 4 dan varian RFC 4122 agar formatnya UUID yang valid.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/* eslint-enable no-bitwise */

export function getOrCreateDeviceId(): string {
  const existing = getAuthStorage().getString(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const newId = generateUUID();
  getAuthStorage().set(DEVICE_ID_KEY, newId);
  return newId;
}

export function getDeviceLabel(): string {
  // Platform.OS = 'android' | 'ios', Platform.Version = versi OS
  return `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} ${Platform.Version}`;
}

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
// Argumen reason = kode penolakan bisnis (REFRESH_REVOKED / ACCOUNT_DISABLED /
// OFFICER_DISABLED) untuk pesan UX spesifik.
let sessionExpiredHandler: ((reason?: string) => void) | null = null;

export function setSessionExpiredHandler(handler: ((reason?: string) => void) | null) {
  sessionExpiredHandler = handler;
}

function notifySessionExpired(reason?: string) {
  // Telemetri post-rollout: lacak frekuensi SESSION_EXPIRED per user/device
  captureAuthEvent('session_expired', {source: 'refresh_failed', reason});
  if (sessionExpiredHandler) {
    try {
      sessionExpiredHandler(reason);
    } catch (e) {
      /* swallow */
    }
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

export const DEFAULT_API_TIMEOUT_MS = 15_000;

function createTimeoutSignal(timeoutMs: number, customSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (customSignal) {
    customSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const {signal, cleanup} = createTimeoutSignal(timeoutMs, options.signal);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    return response;
  } finally {
    cleanup();
  }
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('aborted')
    );
  }
  return (
    String(error).toLowerCase().includes('timeout') ||
    String(error).toLowerCase().includes('aborted')
  );
}

type RefreshResult = {token: string | null; networkError: boolean; denialCode?: string};

/**
 * Mutex lintas-jalur: interceptor 401 dan login biometrik sama-sama memutar
 * refresh token single-use. Tanpa antrean ini dua jalur bisa balapan memakai
 * token yang sama hampir bersamaan.
 */
let refreshQueueTail: Promise<unknown> = Promise.resolve();
function enqueueRefresh<T>(fn: () => Promise<T>): Promise<T> {
  const run = refreshQueueTail.then(fn, fn);
  refreshQueueTail = run.catch(() => {});
  return run;
}

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return {token: null, networkError: false};
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: refreshToken}),
    });

    const data = await response.json();
    if (response.ok && data.data?.access_token) {
      const newToken = data.data.access_token;
      await setToken(newToken);
      // Jika refresh token baru diterima, simpan juga
      if (data.data.refresh_token) {
        setRefreshToken(data.data.refresh_token);
        // Perbarui GUDANG token silent (tanpa prompt!). Menulis ke service
        // ber-accessControl biometrik memunculkan prompt sidik jari di waktu
        // arbitrer (keychain v10 memakai BiometricPrompt di jalur encrypt) —
        // penyebab bug "modal biometrik muncul di halaman statistik".
        try {
          const {useAuthStore} = require('../stores/useAuthStore');
          if (useAuthStore.getState().biometricEnabled) {
            await saveRefreshTokenSilent(data.data.refresh_token);
          }
        } catch {
          /* biometrik opsional — kegagalan Keychain tidak boleh gagalkan refresh */
        }
      }
      return {token: newToken, networkError: false};
    }

    // Sesi Permanen Sliding: HANYA penolakan bisnis eksplisit yang boleh
    // membersihkan sesi lokal. INVALID_TOKEN / 5xx / bentuk tak dikenal =
    // treat sebagai masalah sementara — token dipertahankan agar petugas
    // tidak ter-logout saat sinyal buruk.
    const errorCode = data?.error?.code as string | undefined;
    if (resolveSessionAction(errorCode) === 'logout') {
      await clearToken();
      return {token: null, networkError: false, denialCode: errorCode};
    }
    return {token: null, networkError: true};
  } catch {
    // Network error / timeout / JSON parse error — JANGAN clearToken di sini.
    // Token masih bisa valid; user bisa retry saat online.
    return {token: null, networkError: true};
  }
}

// ── API Request with Auto-Refresh ────────────────────────────────────────────

const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<ApiResponse<T>> => {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // ── Handle 401: coba refresh token, lalu retry (kecuali endpoint auth/login/otp) ──
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/request-otp') ||
      endpoint.includes('/auth/verify-otp');
    if (response.status === 401 && !_isRetry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Tunggu refresh yang sedang berjalan — Daftarkan 2 jalur callback
        // agar subscriber tidak hang saat refresh gagal.
        return new Promise<ApiResponse<T>>(resolve => {
          refreshSubscribers.push({
            onSuccess: async newToken => {
              try {
                const retryResponse = await fetchWithTimeout(`${API_BASE_URL}${endpoint}`, {
                  ...options,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${newToken}`,
                    ...options.headers,
                  },
                });
                const retryData = await retryResponse.json();
                if (retryResponse.ok) {
                  resolve({success: true, data: retryData.data || retryData});
                } else {
                  resolve({
                    success: false,
                    error: {code: 'UNAUTHORIZED', message: 'Sesi telah berakhir'},
                  });
                }
              } catch (error: unknown) {
                const isTimeout = isTimeoutError(error);
                resolve({
                  success: false,
                  error: {
                    code: 'NETWORK_ERROR',
                    message: isTimeout
                      ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
                      : 'Tidak ada koneksi internet',
                  },
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
      // Mutex bersama dengan jalur biometrik — cegah dua rotasi paralel
      const refreshResult = await enqueueRefresh(() => refreshAccessToken());
      isRefreshing = false;

      if (refreshResult.token) {
        onRefreshed(refreshResult.token);
        // Retry original request dengan token baru
        return apiRequest<T>(endpoint, options, true);
      } else if (refreshResult.networkError) {
        // Masalah teknis (jaringan/server/token invalid sesaat) — sesi lokal
        // DIPERTAHANKAN; petugas tidak ter-logout, cukup gagal-soft.
        onRefreshFailed();
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Tidak ada koneksi internet atau koneksi timeout',
          },
        };
      } else {
        // Penolakan bisnis eksplisit (revoked/disabled) — flush subscriber lalu
        // broadcast SESSION_EXPIRED agar UI kembali ke AuthStack.
        onRefreshFailed();
        notifySessionExpired(refreshResult.denialCode);
        return {
          success: false,
          error: {code: 'SESSION_EXPIRED', message: 'Sesi telah berakhir. Silakan login kembali.'},
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

    return {success: true, data: data.data || data};
  } catch (error: unknown) {
    const isTimeout = isTimeoutError(error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: isTimeout
          ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
          : 'Tidak ada koneksi internet. Periksa jaringan Anda.',
      },
    };
  }
};

// ── Auth Services ────────────────────────────────────────────────────────────

export const authService = {
  login: async (identifier: string, password: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        password,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  requestOTP: async (
    phone: string,
  ): Promise<ApiResponse<{message: string; expires_in: number}>> => {
    return apiRequest('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  verifyOTP: async (phone: string, otp: string): Promise<ApiResponse<AuthLoginResponse>> => {
    return apiRequest<AuthLoginResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone,
        otp,
        device_id: getOrCreateDeviceId(),
        device_label: getDeviceLabel(),
      }),
    });
  },

  refresh: async (
    refreshToken: string,
  ): Promise<ApiResponse<{access_token: string; refresh_token: string}>> => {
    // Sengaja TIDAK lewat apiRequest: 401 dari endpoint /auth/refresh tidak
    // boleh memicu interceptor auto-refresh (yang memakai token lokal yang
    // berbeda) — pemanggil (login biometrik) butuh kode error asli server
    // (REFRESH_REVOKED vs NETWORK_ERROR) untuk memutuskan disable biometrik.
    try {
      // Mutex bersama dengan interceptor — rotasi tidak boleh balapan
      const response = await enqueueRefresh(() =>
        fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            refresh_token: refreshToken,
            device_id: getOrCreateDeviceId(),
          }),
        }),
      );
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
      return {success: true, data: data.data || data};
    } catch (error: unknown) {
      const isTimeout = isTimeoutError(error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: isTimeout
            ? 'Koneksi timeout. Jaringan internet lambat atau tidak stabil.'
            : 'Tidak ada koneksi internet. Periksa jaringan Anda.',
        },
      };
    }
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({refresh_token: refreshToken}),
      }).catch(() => {});
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
  getTasks: async (params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<TaskListResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const query = queryParams.toString();
    return apiRequest<TaskListResponse>(`/mobile/tasks${query ? `?${query}` : ''}`);
  },

  getTaskByQR: async (qrCode: string): Promise<ApiResponse<Task>> => {
    return apiRequest<Task>(`/mobile/scan/${encodeURIComponent(qrCode)}`);
  },

  getRangeStats: async (start: string, end: string): Promise<ApiResponse<RangeStatsResponse>> => {
    const query = new URLSearchParams({start, end}).toString();
    return apiRequest<RangeStatsResponse>(`/mobile/tasks/stats-range?${query}`);
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
  }): Promise<
    ApiResponse<{
      id: string;
      sync_status: 'COMPLETED' | 'ALREADY_SYNCED';
      whatsapp_status: 'ENQUEUED' | 'FAILED' | 'SKIPPED';
      message: string;
    }>
  > => {
    return apiRequest('/mobile/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  batchSubmit: async (
    collections: BatchCollectionRequestItem[],
  ): Promise<ApiResponse<BatchSyncResponse>> => {
    return apiRequest<BatchSyncResponse>('/mobile/collections/batch', {
      method: 'POST',
      body: JSON.stringify({collections}),
    });
  },

  getSyncStatus: async (): Promise<
    ApiResponse<{pending_count: number; last_sync_at: string; oldest_pending: string | null}>
  > => {
    return apiRequest('/mobile/sync/status');
  },

  getHistory: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<HistoryResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    const query = queryParams.toString();
    return apiRequest<HistoryResponse>(`/mobile/history${query ? `?${query}` : ''}`);
  },

  resubmitCollection: async (
    id: string,
    data: {nominal: number; alasan_resubmit: string},
  ): Promise<
    ApiResponse<{id: string; submit_sequence: number; whatsapp_status: string; message: string}>
  > => {
    return apiRequest(`/mobile/collections/${id}/resubmit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  skipAssignment: async (
    id: string,
    notes?: string,
  ): Promise<ApiResponse<{id: string; status: string; message: string}>> => {
    return apiRequest(`/mobile/assignments/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify(notes ? {notes} : {}),
    });
  },

  completePeriod: async (): Promise<
    ApiResponse<{period: string; skipped_count: number; message: string}>
  > => {
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
